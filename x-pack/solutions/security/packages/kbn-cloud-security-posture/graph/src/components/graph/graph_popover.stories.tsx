/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, css } from '@emotion/react';
import type { StoryFn, StoryObj } from '@storybook/react';
import { EuiListGroup, EuiHorizontalRule } from '@elastic/eui';
import type { EntityNodeViewModel, LabelNodeViewModel, NodeProps } from '..';
import { Graph } from '..';
import { GlobalStylesStorybookDecorator } from '../../../.storybook/decorators';
import { GraphPopover } from './graph_popover';
import { ExpandButtonClickCallback } from '../types';
import { useGraphPopover } from './use_graph_popover';
import { ExpandPopoverListItem } from '../styles';

export default {
  title: 'Components/Graph Components/Graph Popovers',
  description: 'CDR - Graph visualization',
  argTypes: {},
  decorators: [GlobalStylesStorybookDecorator],
};

const useExpandButtonPopover = () => {
  const { id, state, actions } = useGraphPopover('node-expand-popover');
  const { openPopover, closePopover } = actions;

  const selectedNode = useRef<NodeProps | null>(null);
  const unToggleCallbackRef = useRef<(() => void) | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{
    node: NodeProps;
    el: HTMLElement;
    unToggleCallback: () => void;
  } | null>(null);

  const onNodeExpandButtonClick: ExpandButtonClickCallback = useCallback(
    (e, node, unToggleCallback) => {
      const lastExpandedNode = selectedNode.current?.id;

      // If the same node is clicked again, close the popover
      selectedNode.current = null;
      unToggleCallbackRef.current?.();
      unToggleCallbackRef.current = null;
      closePopover();

      if (lastExpandedNode !== node.id) {
        // Set the pending open state
        setPendingOpen({ node, el: e.currentTarget, unToggleCallback });
      }
    },
    [closePopover]
  );

  useEffect(() => {
    if (!state.isOpen && pendingOpen) {
      const { node, el, unToggleCallback } = pendingOpen;

      selectedNode.current = node;
      unToggleCallbackRef.current = unToggleCallback;
      openPopover(el);

      setPendingOpen(null);
    }
  }, [state.isOpen, pendingOpen, openPopover]);

  const closePopoverHandler = useCallback(() => {
    selectedNode.current = null;
    unToggleCallbackRef.current?.();
    unToggleCallbackRef.current = null;
    closePopover();
  }, [closePopover]);

  // eslint-disable-next-line react/display-name
  const PopoverComponent = memo(() => (
    <GraphPopover
      panelPaddingSize="s"
      anchorPosition="rightCenter"
      isOpen={state.isOpen}
      anchorElement={state.anchorElement}
      closePopover={closePopoverHandler}
    >
      <EuiListGroup color="primary" gutterSize="none" bordered={false} flush={true}>
        <ExpandPopoverListItem
          iconType="visTagCloud"
          label="Explore related entities"
          onClick={() => {}}
        />
        <ExpandPopoverListItem
          iconType="users"
          label="Show actions by this entity"
          onClick={() => {}}
        />
        <ExpandPopoverListItem
          iconType="storage"
          label="Show actions on this entity"
          onClick={() => {}}
        />
        <EuiHorizontalRule margin="xs" />
        <ExpandPopoverListItem iconType="expand" label="View entity details" onClick={() => {}} />
      </EuiListGroup>
    </GraphPopover>
  ));

  const actionsWithClose = useMemo(
    () => ({
      ...actions,
      closePopover: closePopoverHandler,
    }),
    [actions, closePopoverHandler]
  );

  return useMemo(
    () => ({
      onNodeExpandButtonClick,
      Popover: PopoverComponent,
      id,
      actions: actionsWithClose,
      state,
    }),
    [PopoverComponent, actionsWithClose, id, onNodeExpandButtonClick, state]
  );
};

const useNodePopover = () => {
  const { id, state, actions } = useGraphPopover('node-popover');

  // eslint-disable-next-line react/display-name
  const PopoverComponent = memo(() => (
    <GraphPopover
      panelPaddingSize="s"
      anchorPosition="upCenter"
      isOpen={state.isOpen}
      anchorElement={state.anchorElement}
      closePopover={actions.closePopover}
      // eslint-disable-next-line react/jsx-no-literals
    >
      TODO
    </GraphPopover>
  ));

  return useMemo(
    () => ({
      onNodeClick: (e: React.MouseEvent<HTMLElement>) => actions.openPopover(e.currentTarget),
      Popover: PopoverComponent,
      id,
      actions,
      state,
    }),
    [PopoverComponent, actions, id, state]
  );
};

const Template: StoryFn = () => {
  const expandNodePopover = useExpandButtonPopover();
  const nodePopover = useNodePopover();
  const popovers = [expandNodePopover, nodePopover];
  const isPopoverOpen = popovers.some((popover) => popover.state.isOpen);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const popoverOpenWrapper = (cb: Function, ...args: any[]) => {
    [expandNodePopover.actions.closePopover, nodePopover.actions.closePopover].forEach(
      (closePopover) => {
        closePopover();
      }
    );
    // eslint-disable-next-line prefer-spread
    cb.apply(null, args);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expandButtonClickHandler = (...args: any[]) =>
    popoverOpenWrapper(expandNodePopover.onNodeExpandButtonClick, ...args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeClickHandler = (...args: any[]) => popoverOpenWrapper(nodePopover.onNodeClick, ...args);

  const nodes: Array<EntityNodeViewModel | LabelNodeViewModel> = useMemo(
    () => [
      ...(
        ['hexagon', 'ellipse', 'rectangle', 'pentagon', 'diamond'] as const
      ).map<EntityNodeViewModel>((shape, idx) => ({
        id: `${idx}`,
        label: `Node ${idx}`,
        color: 'primary',
        icon: 'okta',
        interactive: true,
        shape,
        expandButtonClick: expandButtonClickHandler,
        nodeClick: nodeClickHandler,
      })),
      {
        id: 'label',
        label: 'Node 5',
        color: 'primary',
        interactive: true,
        shape: 'label',
        expandButtonClick: expandButtonClickHandler,
        nodeClick: nodeClickHandler,
      } as LabelNodeViewModel,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <ThemeProvider theme={{ darkMode: false }}>
      <Graph
        css={css`
          height: 100%;
          width: 100%;
        `}
        nodes={nodes}
        edges={[]}
        interactive={true}
        isLocked={isPopoverOpen}
      />
      {popovers?.map((popover) => popover.Popover && <popover.Popover key={popover.id} />)}
    </ThemeProvider>
  );
};

export const GraphPopovers: StoryObj = {
  render: Template,
};
