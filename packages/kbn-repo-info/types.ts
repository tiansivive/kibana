/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type ModuleGroup = 'platform' | 'observability' | 'search' | 'security' | 'common';
export type ModuleVisibility = 'private' | 'shared';

export interface KibanaPackageJson {
  name: string;
  version: string;
  branch: string;
  build: {
    number: number;
    sha: string;
    distributable?: boolean;
    date: string;
  };
  dependencies: {
    [dep: string]: string;
  };
  devDependencies: {
    [dep: string]: string;
  };
  engines?: {
    [name: string]: string | undefined;
  };
  [key: string]: unknown;
  group?: ModuleGroup;
  visibility?: ModuleVisibility;
}
