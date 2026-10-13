#!/usr/bin/env bash
#
# Creates three small test indices on a local cluster so the REPL can check queries against real
# mappings. They share a realistic set of fields and differ on purpose:
#
#   size    long in dsl-logs-a, keyword in dsl-logs-b       (conflicting_field_types)
#   name    keyword in dsl-logs-a, text in dsl-logs-b       (conflicting_field_types)
#   only_a  mapped in dsl-logs-a only                       (null in the other index)
#   only_b  mapped in dsl-logs-b only                       (null in the other index)
#   payload an object in dsl-logs-a                         (an unknown column to ES|QL)
#
# dsl-alerts has the fields of a security alert that the risk score calculation reads.
#
# Usage:
#   scripts/setup_test_indices.sh            create the indices (recreates them if they exist)
#   scripts/setup_test_indices.sh teardown   delete them
#
# The cluster is read from ES_URL, ES_USERNAME and ES_PASSWORD, which default to what
# `yarn es snapshot` starts with: http://localhost:9200 and elastic:changeme.
#
# Then, from the repository root:
#
#   node src/platform/packages/shared/esql/kbn_esql_dsl/repl.js
#
#   :connect
#   :caps dsl-logs-a,dsl-logs-b
#
#   -- checks that pass
#   :check from('dsl-logs-*').where((c) => and(gt(c.bytes, lit.long(100)), eq(c['event.kind'], lit.str('alert')))).keep('host.name', 'bytes')
#   :check from('dsl-logs-*').stats((c) => ({ total: sum(c.bytes), avgRisk: round(avg(c.risk), lit.int(1)), n: count(c.bytes) }), (c) => ({ host: c['host.name'] })).sort((c) => [desc(c.total)]).limit(10)
#   :check from('dsl-logs-*').eval('who', (c) => concat(c['user.name'], lit.str('@'), c['host.name'])).eval('label', (c) => coalesce(c.who, lit.str('unknown')))
#   :check from('dsl-logs-*').eval('short', (c) => substring(c.message, lit.int(1), lit.int(5)))
#   :check from('dsl-logs-a').where((c) => eq(c.name, lit.str('alpha')))
#
#   -- checks that fail, each in a different way
#   :check from('dsl-logs-*').where((c) => gt(c['host.name'], lit.long(1)))     # no_instance: keyword compared with long
#   :check from('dsl-logs-*').where((c) => gt(c.size, lit.long(1)))             # conflicting_field_types
#   :check from('dsl-logs-*').where((c) => eq(c.name, lit.str('alpha')))        # conflicting_field_types (keyword and text)
#   :check from('dsl-logs-*').where((c) => eq(c.missing, lit.str('x')))         # unmapped_column
#   :check from('dsl-logs-*').stats((c) => ({ s: sum(c.message) }))             # no_instance: sum over text
#
#   -- the risk score calculation, written with the DSL (src/examples/risk_scores.ts)
#   :check riskScoresQuery({ identifierField: 'host.name', afterKeys: { lower: 'a' }, pageSize: 100, index: 'dsl-alerts' })
#   :q riskScoresQuery({ identifierField: 'host.name', afterKeys: { lower: 'a' }, pageSize: 100 })
#
#   -- the query without asking the cluster: ES|QL, columns read, principal type
#   :q from('dsl-logs-*').where((c) => gt(c.bytes, lit.long(100))).keep('host.name', 'bytes')
#   :toggle print-core        # also show the elaborated Core in :q
#
#   -- without a cluster, from a recorded field_caps response
#   :load path/to/field_caps.json

set -euo pipefail

ES_URL="${ES_URL:-http://localhost:9200}"
ES_USERNAME="${ES_USERNAME:-elastic}"
ES_PASSWORD="${ES_PASSWORD:-changeme}"

es() {
  curl -sS --fail-with-body -u "${ES_USERNAME}:${ES_PASSWORD}" "$@"
}

json() {
  es -H 'Content-Type: application/json' "$@"
}

teardown() {
  json -X DELETE "${ES_URL}/dsl-logs-a,dsl-logs-b,dsl-alerts?ignore_unavailable=true" >/dev/null
}

if [[ "${1:-}" == "teardown" ]]; then
  teardown
  echo "deleted dsl-logs-a, dsl-logs-b and dsl-alerts"
  exit 0
fi

# Fields both indices share.
COMMON='
  "@timestamp": { "type": "date" },
  "message": { "type": "text" },
  "host": { "properties": { "name": { "type": "keyword" } } },
  "user": { "properties": { "name": { "type": "keyword" } } },
  "event": { "properties": { "kind": { "type": "keyword" } } },
  "client": { "properties": { "ip": { "type": "ip" } } },
  "agent": { "properties": { "version": { "type": "version" } } },
  "bytes": { "type": "long" },
  "status": { "type": "integer" },
  "risk": { "type": "double" },
  "ok": { "type": "boolean" },
  "location": { "type": "geo_point" },
  "tags": { "type": "keyword" }'

teardown

json -X PUT "${ES_URL}/dsl-logs-a" -d "{
  \"mappings\": { \"properties\": {
    ${COMMON},
    \"size\": { \"type\": \"long\" },
    \"name\": { \"type\": \"keyword\" },
    \"only_a\": { \"type\": \"keyword\" },
    \"payload\": { \"type\": \"object\" }
  } }
}" >/dev/null

json -X PUT "${ES_URL}/dsl-logs-b" -d "{
  \"mappings\": { \"properties\": {
    ${COMMON},
    \"size\": { \"type\": \"keyword\" },
    \"name\": { \"type\": \"text\" },
    \"only_b\": { \"type\": \"keyword\" }
  } }
}" >/dev/null

json -X PUT "${ES_URL}/dsl-alerts" -d '{
  "mappings": { "properties": {
    "@timestamp": { "type": "date" },
    "host": { "properties": { "name": { "type": "keyword" } } },
    "user": { "properties": { "name": { "type": "keyword" } } },
    "event": { "properties": { "kind": { "type": "keyword" } } },
    "kibana": { "properties": { "alert": { "properties": {
      "risk_score": { "type": "float" },
      "uuid": { "type": "keyword" },
      "rule": { "properties": {
        "name": { "type": "keyword" },
        "uuid": { "type": "keyword" }
      } }
    } } } }
  } }
}' >/dev/null

es -X POST "${ES_URL}/_bulk?refresh=true" -H 'Content-Type: application/x-ndjson' --data-binary @- >/dev/null <<'EOF'
{"index":{"_index":"dsl-logs-a"}}
{"@timestamp":"2026-10-13T08:00:00Z","message":"login ok","host":{"name":"web-1"},"user":{"name":"ana"},"event":{"kind":"event"},"client":{"ip":"10.0.0.1"},"agent":{"version":"9.1.0"},"bytes":512,"status":200,"risk":10.5,"ok":true,"location":"48.85,2.35","tags":["auth"],"size":10,"name":"alpha","only_a":"x"}
{"index":{"_index":"dsl-logs-a"}}
{"@timestamp":"2026-10-13T08:05:00Z","message":"login failed","host":{"name":"web-2"},"user":{"name":"bob"},"event":{"kind":"alert"},"client":{"ip":"10.0.0.2"},"agent":{"version":"9.1.0"},"bytes":128,"status":401,"risk":73.2,"ok":false,"location":"51.50,-0.12","tags":["auth","failed"],"size":20,"name":"beta"}
{"index":{"_index":"dsl-alerts"}}
{"@timestamp":"2026-10-13T09:00:00Z","host":{"name":"web-1"},"event":{"kind":"signal"},"kibana":{"alert":{"risk_score":73,"uuid":"a1","rule":{"name":"Brute force","uuid":"r1"}}}}
{"index":{"_index":"dsl-alerts"}}
{"@timestamp":"2026-10-13T09:05:00Z","host":{"name":"web-1"},"event":{"kind":"signal"},"kibana":{"alert":{"risk_score":47,"uuid":"a2","rule":{"name":"Odd login","uuid":"r2"}}}}
{"index":{"_index":"dsl-alerts"}}
{"@timestamp":"2026-10-13T09:10:00Z","host":{"name":"web-2"},"event":{"kind":"signal"},"kibana":{"alert":{"risk_score":21,"uuid":"a3","rule":{"name":"Port scan","uuid":"r3"}}}}
{"index":{"_index":"dsl-logs-b"}}
{"@timestamp":"2026-10-13T08:10:00Z","message":"upload","host":{"name":"web-1"},"user":{"name":"ana"},"event":{"kind":"event"},"client":{"ip":"10.0.0.3"},"agent":{"version":"9.2.0"},"bytes":4096,"status":201,"risk":5.0,"ok":true,"location":"40.71,-74.0","tags":["upload"],"size":"large","name":"gamma","only_b":"y"}
EOF

es "${ES_URL}/_cat/indices/dsl-*?v&h=index,docs.count&s=index"
