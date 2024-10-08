/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MonacoEditorActionsProvider } from '../../application/containers/editor/monaco_editor_actions_provider';
import { CoreEditor, Range, Token } from '../../types';

export interface ResultTerm {
  meta?: string;
  context?: AutoCompleteContext;
  insertValue?: string;
  name?: string | boolean;
  value?: string;
  score?: number;
  template?: { __raw?: boolean; value?: string; [key: string]: unknown };
}

export interface DataAutoCompleteRulesOneOf {
  __condition?: {
    lines_regex: string;
  };
  __template: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AutoCompleteContext {
  autoCompleteSet?: null | ResultTerm[];
  /**
   * Stores a state for async results, e.g. fields suggestions based on the mappings definition.
   */
  asyncResultsState?: {
    isLoading: boolean;
    lastFetched: number | null;
    results: Promise<ResultTerm[]>;
  };
  endpoint?: null | {
    paramsAutocomplete: {
      getTopLevelComponents: (method?: string | null) => unknown;
    };
    bodyAutocompleteRootComponents: unknown;
    id?: string;
    documentation?: string;
    data_autocomplete_rules?: Record<string, unknown> | null;
  };
  urlPath?: null | unknown;
  urlParamsTokenPath?: Array<Record<string, string>> | null;
  method?: string | null;
  token?: Token;
  activeScheme?: unknown;
  replacingToken?: boolean;
  rangeToReplace?: Range;
  autoCompleteType?: null | string;
  editor?: CoreEditor | MonacoEditorActionsProvider;

  /**
   * The tokenized user input that prompted the current autocomplete at the cursor. This can be out of sync with
   * the input that is currently being displayed in the editor.
   */
  createdWithToken?: Token | null;

  /**
   * The tokenized user input that is currently being displayed at the cursor in the editor when the user accepted
   * the autocomplete suggestion.
   */
  updatedForToken?: Token | null;

  addTemplate?: unknown;
  prefixToAdd?: string;
  suffixToAdd?: string;
  textBoxPosition?: { lineNumber: number; column: number };
  urlTokenPath?: string[];
  otherTokenValues?: string;
  requestStartRow?: number | null;
  bodyTokenPath?: string[] | null;
  endpointComponentResolver?: unknown;
  globalComponentResolver?: unknown;
  documentation?: string;
}
