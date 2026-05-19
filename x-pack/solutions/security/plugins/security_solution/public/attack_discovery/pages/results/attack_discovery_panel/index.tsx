/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPanel, EuiSpacer, useEuiTheme } from '@elastic/eui';
import {
  type AttackDiscovery,
  type AttackDiscoveryAlert,
  getOriginalAlertIds,
  type Replacements,
} from '@kbn/elastic-assistant-common';
import { FF_ENABLE_ENTITY_STORE_V2, useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { css } from '@emotion/react';
import React, { useMemo, useState } from 'react';

import { useUiSetting } from '../../../../common/lib/kibana';
import { useQueryAlerts } from '../../../../detections/containers/detection_engine/alerts/use_query';
import { ALERTS_QUERY_NAMES } from '../../../../detections/containers/detection_engine/alerts/constants';
import { ActionableSummary } from './actionable_summary';
import { PanelHeader } from './panel_header';
import { Tabs } from './tabs';

interface Props {
  attackDiscovery: AttackDiscovery | AttackDiscoveryAlert;
  initialIsOpen?: boolean;
  isSelected: boolean;
  setIsSelected?: ({ id, selected }: { id: string; selected: boolean }) => void;
  setSelectedAttackDiscoveries: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onToggle?: (newState: 'open' | 'closed') => void;
  replacements?: Replacements;
  showAnonymized?: boolean;
}

const AttackDiscoveryPanelComponent: React.FC<Props> = ({
  attackDiscovery,
  initialIsOpen,
  isSelected,
  setIsSelected,
  setSelectedAttackDiscoveries,
  onToggle,
  replacements,
  showAnonymized = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const entityStoreV2Enabled = useUiSetting<boolean>(FF_ENABLE_ENTITY_STORE_V2);
  const euidApi = useEntityStoreEuidApi();

  const [isOpen, setIsOpen] = useState<'open' | 'closed'>(initialIsOpen ? 'open' : 'closed');

  const originalAlertIds = useMemo(
    () => getOriginalAlertIds({ alertIds: attackDiscovery.alertIds, replacements }),
    [attackDiscovery.alertIds, replacements]
  );

  const alertIdsQuery = useMemo(() => ({ ids: { values: originalAlertIds } }), [originalAlertIds]);

  const { data: alertDocsData } = useQueryAlerts<Record<string, unknown>, unknown>({
    query: alertIdsQuery,
    skip: !entityStoreV2Enabled || !euidApi || originalAlertIds.length === 0,
    queryName: ALERTS_QUERY_NAMES.BY_ID,
  });

  const [hostEntityIds, userEntityIds] = useMemo<
    [Record<string, string>, Record<string, string>]
  >(() => {
    const hits = alertDocsData?.hits?.hits;
    if (!euidApi || !hits) return [{}, {}];
    return hits.reduce<[Record<string, string>, Record<string, string>]>(
      ([hosts, users], hit) => {
        const source = (hit as { _source?: Record<string, unknown> })._source ?? hit;
        const hostName = source['host.name'];
        const userName = source['user.name'];
        if (typeof hostName === 'string') {
          const euid = euidApi.euid.getEuidFromObject('host', source);
          if (euid) hosts[hostName] = euid;
        }
        if (typeof userName === 'string') {
          const euid = euidApi.euid.getEuidFromObject('user', source);
          if (euid) users[userName] = euid;
        }
        return [hosts, users];
      },
      [{}, {}]
    );
  }, [euidApi, alertDocsData]);

  return (
    <>
      <EuiPanel data-test-subj={`attackDiscoveryPanel-${attackDiscovery.id}`} hasBorder={true}>
        <EuiSpacer size="xs" />

        <PanelHeader
          attackDiscovery={attackDiscovery}
          isOpen={isOpen}
          isSelected={isSelected}
          setIsSelected={setIsSelected}
          onToggle={onToggle}
          replacements={replacements}
          setIsOpen={setIsOpen}
          setSelectedAttackDiscoveries={setSelectedAttackDiscoveries}
          showAnonymized={showAnonymized}
        />

        <EuiSpacer size="s" />

        <ActionableSummary
          attackDiscovery={attackDiscovery}
          replacements={replacements}
          showAnonymized={showAnonymized}
          hostEntityIds={hostEntityIds}
          userEntityIds={userEntityIds}
        />
      </EuiPanel>

      {isOpen === 'open' && (
        <EuiPanel
          css={css`
            border-top: none;
            border-radius: 0 0 6px 6px;
            margin: 0 ${euiTheme.size.m} 0 ${euiTheme.size.m};
          `}
          data-test-subj="attackDiscoveryTabsPanel"
          hasBorder={true}
        >
          <Tabs
            attackDiscovery={attackDiscovery}
            replacements={replacements}
            showAnonymized={showAnonymized}
          />
        </EuiPanel>
      )}
    </>
  );
};

AttackDiscoveryPanelComponent.displayName = 'AttackDiscoveryPanel';

export const AttackDiscoveryPanel = React.memo(AttackDiscoveryPanelComponent);
