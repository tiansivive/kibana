/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
export { BASE_PATH } from './base_path';
export { API_BASE_PATH, INTERNAL_API_BASE_PATH } from './api_base_path';
export { INVALID_INDEX_PATTERN_CHARS, INVALID_TEMPLATE_NAME_CHARS } from './invalid_characters';
export * from './index_modes';
export * from './index_statuses';

// Since each index can have a max length or 255 characters and the max length of
// the request is 4096 bytes we can fit a max of 16 indices in a single request.
export const MAX_INDICES_PER_REQUEST = 16;

export const MAX_DATA_RETENTION = 'max_retention';

export {
  UIM_APP_NAME,
  UIM_APP_LOAD,
  UIM_UPDATE_SETTINGS,
  UIM_INDEX_CLEAR_CACHE,
  UIM_INDEX_CLEAR_CACHE_MANY,
  UIM_INDEX_CLOSE,
  UIM_INDEX_CLOSE_MANY,
  UIM_INDEX_DELETE,
  UIM_INDEX_DELETE_MANY,
  UIM_INDEX_FLUSH,
  UIM_INDEX_FLUSH_MANY,
  UIM_INDEX_FORCE_MERGE,
  UIM_INDEX_FORCE_MERGE_MANY,
  UIM_INDEX_OPEN,
  UIM_INDEX_OPEN_MANY,
  UIM_INDEX_REFRESH,
  UIM_INDEX_REFRESH_MANY,
  UIM_INDEX_SETTINGS_EDIT,
  UIM_TEMPLATE_LIST_LOAD,
  UIM_TEMPLATE_DELETE,
  UIM_TEMPLATE_DELETE_MANY,
  UIM_TEMPLATE_SHOW_DETAILS_CLICK,
  UIM_TEMPLATE_DETAIL_PANEL_SUMMARY_TAB,
  UIM_TEMPLATE_DETAIL_PANEL_SETTINGS_TAB,
  UIM_TEMPLATE_DETAIL_PANEL_MAPPINGS_TAB,
  UIM_TEMPLATE_DETAIL_PANEL_ALIASES_TAB,
  UIM_TEMPLATE_DETAIL_PANEL_PREVIEW_TAB,
  UIM_TEMPLATE_CREATE,
  UIM_TEMPLATE_UPDATE,
  UIM_TEMPLATE_CLONE,
  UIM_TEMPLATE_SIMULATE,
} from './ui_metric';

export { MAJOR_VERSION } from './plugin';

export { Section, IndexDetailsSection } from '@kbn/index-management-shared-types';
export type { IndexDetailsTab, IndexDetailsTabId } from '@kbn/index-management-shared-types';
export * from './allow_auto_create';

export const PLUGIN = {
  ID: 'index_management',
  TITLE: i18n.translate('xpack.idxMgmt.appTitle', {
    defaultMessage: 'Index Management',
  }),
};
