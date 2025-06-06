/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiContextMenu, EuiHeaderLink, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import { ApmRuleType } from '@kbn/rule-data-utils';
import { AlertingFlyout } from '../../../alerting/ui_components/alerting_flyout';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';

const alertLabel = i18n.translate('xpack.apm.home.alertsMenu.alerts', {
  defaultMessage: 'Alerts and rules',
});
const transactionDurationLabel = i18n.translate('xpack.apm.home.alertsMenu.transactionDuration', {
  defaultMessage: 'Latency',
});
const transactionErrorRateLabel = i18n.translate('xpack.apm.home.alertsMenu.transactionErrorRate', {
  defaultMessage: 'Failed transaction rate',
});
const errorCountLabel = i18n.translate('xpack.apm.home.alertsMenu.errorCount', {
  defaultMessage: ' Create error count rule',
});
const createThresholdAlertLabel = i18n.translate('xpack.apm.home.alertsMenu.createThresholdAlert', {
  defaultMessage: 'Create threshold rule',
});
const createAnomalyAlertAlertLabel = i18n.translate(
  'xpack.apm.home.alertsMenu.createAnomalyAlert',
  { defaultMessage: 'Create anomaly rule' }
);

const CREATE_THRESHOLD_PANEL_ID = 'create_threshold_panel';

interface Props {
  canReadAlerts: boolean;
  canSaveAlerts: boolean;
  canReadMlJobs: boolean;
}

export function AlertingPopoverAndFlyout({ canSaveAlerts, canReadAlerts, canReadMlJobs }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [ruleType, setRuleType] = useState<ApmRuleType | null>(null);
  const {
    plugins: { observability },
  } = useApmPluginContext();
  const button = (
    <EuiHeaderLink
      color="text"
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setPopoverOpen((prevState) => !prevState)}
      data-test-subj="apmAlertAndRulesHeaderLink"
    >
      {alertLabel}
    </EuiHeaderLink>
  );

  const panels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: alertLabel,
      items: [
        ...(canSaveAlerts
          ? [
              {
                name: createThresholdAlertLabel,
                panel: CREATE_THRESHOLD_PANEL_ID,
                'data-test-subj': 'apmAlertsMenuItemCreateThreshold',
              },
              ...(canReadMlJobs
                ? [
                    {
                      name: createAnomalyAlertAlertLabel,
                      onClick: () => {
                        setRuleType(ApmRuleType.Anomaly);
                        setPopoverOpen(false);
                      },
                      'data-test-subj': 'apmAlertsMenuItemCreateAnomaly',
                    },
                  ]
                : []),
              {
                name: errorCountLabel,
                onClick: () => {
                  setRuleType(ApmRuleType.ErrorCount);
                  setPopoverOpen(false);
                },
                'data-test-subj': 'apmAlertsMenuItemErrorCount',
              },
            ]
          : []),
        ...(canReadAlerts
          ? [
              {
                name: i18n.translate('xpack.apm.home.alertsMenu.viewActiveAlerts', {
                  defaultMessage: 'Manage rules',
                }),
                href: observability.useRulesLink().href,
                icon: 'tableOfContents',
                'data-test-subj': 'apmAlertsMenuItemManageRules',
              },
            ]
          : []),
      ],
    },

    // Threshold panel
    {
      id: CREATE_THRESHOLD_PANEL_ID,
      title: createThresholdAlertLabel,
      items: [
        // Latency
        {
          name: transactionDurationLabel,
          onClick: () => {
            setRuleType(ApmRuleType.TransactionDuration);
            setPopoverOpen(false);
          },
        },
        // Throughput *** TO BE ADDED ***
        // Failed transactions rate
        {
          name: transactionErrorRateLabel,
          onClick: () => {
            setRuleType(ApmRuleType.TransactionErrorRate);
            setPopoverOpen(false);
          },
        },
      ],
    },
  ];

  return (
    <>
      <EuiPopover
        id="integrations-menu"
        button={button}
        isOpen={popoverOpen}
        closePopover={() => setPopoverOpen(false)}
        panelPaddingSize="none"
        anchorPosition="downRight"
      >
        <EuiContextMenu initialPanelId={0} panels={panels} />
      </EuiPopover>
      <AlertingFlyout
        ruleType={ruleType}
        addFlyoutVisible={!!ruleType}
        setAddFlyoutVisibility={(visible) => {
          if (!visible) {
            setRuleType(null);
          }
        }}
      />
    </>
  );
}
