/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FormattedMessage } from '@kbn/i18n-react';
import { EuiBasicTable, EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import { PolicyLink, PolicyNameLabel } from '../policy_link';
import { useGetIlmPolicies } from '../hooks/use_get_ilm_policies';
import { Unprivileged } from './unprivileged';

export const IlmRetentionTab = () => {
  const { data, loading, error } = useGetIlmPolicies();

  if (error && (error as unknown as IHttpFetchError<ResponseErrorBody>).body?.statusCode === 403) {
    return <Unprivileged />;
  }

  const columns = [
    {
      field: 'label',
      name: i18n.translate('xpack.synthetics.settingsRoute.table.dataset', {
        defaultMessage: 'Dataset',
      }),
    },
    {
      field: 'currentSize',
      name: i18n.translate('xpack.synthetics.settingsRoute.table.currentSize', {
        defaultMessage: 'Current size',
      }),
    },
    {
      field: 'retentionPeriod',
      name: i18n.translate('xpack.synthetics.settingsRoute.table.retentionPeriod', {
        defaultMessage: 'Retention period',
      }),
    },
    {
      field: 'policy.name',
      name: <PolicyNameLabel />,
      render: (name: string, _item: (typeof data)[0]) => <PolicyLink name={name} />,
    },
  ];

  return (
    <div>
      <EuiCallOut title={CALLOUT_TITLE} iconType="info">
        <p>
          <FormattedMessage
            id="xpack.synthetics.settingsRoute.retentionCalloutDescription"
            defaultMessage="To change your data retention settings, we recommend creating your own index lifecycle policy and attaching it to the relevant custom Component Template in {stackManagement}. For more information, {docsLink}."
            values={{
              stackManagement: <strong>{STACK_MANAGEMENT}</strong>,
              docsLink: (
                <EuiLink
                  data-test-subj="syntheticsDataRetentionTabLink"
                  href="https://www.elastic.co/guide/en/observability/current/synthetics-manage-retention.html"
                >
                  {READ_OUR_DOCS}
                </EuiLink>
              ),
            }}
          />
        </p>
      </EuiCallOut>
      <EuiSpacer size="m" />
      <EuiBasicTable
        loading={loading}
        tableCaption={RETENTION_TABLE}
        items={data}
        columns={columns}
        tableLayout="auto"
      />
    </div>
  );
};

const CALLOUT_TITLE = i18n.translate('xpack.synthetics.settingsRoute.retentionCalloutTitle', {
  defaultMessage: 'Synthetics data is configured by managed index lifecycle policies',
});

const STACK_MANAGEMENT = i18n.translate('xpack.synthetics.stackManagement', {
  defaultMessage: 'Stack Management',
});

const READ_OUR_DOCS = i18n.translate('xpack.synthetics.settingsRoute.readDocs', {
  defaultMessage: 'read our documentation',
});

const RETENTION_TABLE = i18n.translate('xpack.synthetics.settingsRoute.tableCaption', {
  defaultMessage: 'Synthetics data retention policies',
});
