/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface CspNavigationItem {
  readonly name: string;
  readonly path: string;
  readonly disabled?: boolean;
}

export interface CspPageNavigationItem extends CspNavigationItem {
  id: CloudSecurityPosturePageId;
}

export type CspPage =
  | 'dashboard'
  | 'cspm_dashboard'
  | 'kspm_dashboard'
  | 'vulnerability_dashboard'
  | 'findings'
  | 'benchmarks';
export type CspBenchmarksPage = 'rules';

export type CloudSecurityPosturePageId =
  | 'cloud_security_posture-dashboard'
  | 'cloud_security_posture-cspm-dashboard'
  | 'cloud_security_posture-kspm-dashboard'
  | 'cloud_security_posture-vulnerability_dashboard'
  | 'cloud_security_posture-findings'
  | 'cloud_security_posture-benchmarks'
  | 'cloud_security_posture-benchmarks-rules';
