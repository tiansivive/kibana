/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { TRANSFORM_RULE_TYPE } from '@kbn/transform-plugin/common';
import {
  ML_ANOMALY_DETECTION_RULE_TYPE_ID,
  OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
  STACK_ALERTS_FEATURE_ID,
} from '@kbn/rule-data-utils';
import { ES_QUERY_ID as ElasticsearchQuery } from '@kbn/rule-data-utils';
import { KibanaFeatureScope } from '@kbn/features-plugin/common';
import { ID as IndexThreshold } from './rule_types/index_threshold/rule_type';
import { GEO_CONTAINMENT_ID as GeoContainment } from './rule_types/geo_containment';

const TransformHealth = TRANSFORM_RULE_TYPE.TRANSFORM_HEALTH;

export const BUILT_IN_ALERTS_FEATURE: KibanaFeatureConfig = {
  id: STACK_ALERTS_FEATURE_ID,
  name: i18n.translate('xpack.stackAlerts.featureRegistry.actionsFeatureName', {
    defaultMessage: 'Stack Rules',
  }),
  app: [],
  category: DEFAULT_APP_CATEGORIES.management,
  scope: [KibanaFeatureScope.Spaces, KibanaFeatureScope.Security],
  management: {
    insightsAndAlerting: ['triggersActions'],
  },
  alerting: [
    IndexThreshold,
    GeoContainment,
    ElasticsearchQuery,
    TransformHealth,
    OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
    ML_ANOMALY_DETECTION_RULE_TYPE_ID,
  ],
  privileges: {
    all: {
      app: [],
      catalogue: [],
      management: {
        insightsAndAlerting: ['triggersActions'],
      },
      alerting: {
        rule: {
          all: [
            IndexThreshold,
            GeoContainment,
            ElasticsearchQuery,
            TransformHealth,
            OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
            ML_ANOMALY_DETECTION_RULE_TYPE_ID,
          ],
        },
        alert: {
          all: [
            IndexThreshold,
            GeoContainment,
            ElasticsearchQuery,
            TransformHealth,
            OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
            ML_ANOMALY_DETECTION_RULE_TYPE_ID,
          ],
        },
      },
      savedObject: {
        all: [],
        read: [],
      },
      api: ['rac'],
      ui: [],
    },
    read: {
      app: [],
      catalogue: [],
      management: {
        insightsAndAlerting: ['triggersActions'],
      },
      alerting: {
        rule: {
          read: [
            IndexThreshold,
            GeoContainment,
            ElasticsearchQuery,
            TransformHealth,
            OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
            ML_ANOMALY_DETECTION_RULE_TYPE_ID,
          ],
        },
        alert: {
          read: [
            IndexThreshold,
            GeoContainment,
            ElasticsearchQuery,
            TransformHealth,
            OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
            ML_ANOMALY_DETECTION_RULE_TYPE_ID,
          ],
        },
      },
      savedObject: {
        all: [],
        read: [],
      },
      api: ['rac'],
      ui: [],
    },
  },
};
