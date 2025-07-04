/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { initGetHostsAnomaliesRoute, initGetK8sAnomaliesRoute } from './routes/infra_ml';
import { initInventoryMetaRoute } from './routes/inventory_metadata';
import { initInventoryViewRoutes } from './routes/inventory_views';
import { initIpToHostName } from './routes/ip_to_hostname';
import { initGetLogAlertsChartPreviewDataRoute } from './routes/log_alerts';
import {
  initGetLogEntryAnomaliesDatasetsRoute,
  initGetLogEntryAnomaliesRoute,
  initGetLogEntryCategoriesRoute,
  initGetLogEntryCategoryDatasetsRoute,
  initGetLogEntryCategoryDatasetsStatsRoute,
  initGetLogEntryCategoryExamplesRoute,
  initGetLogEntryExamplesRoute,
  initValidateLogAnalysisDatasetsRoute,
  initValidateLogAnalysisIndicesRoute,
  initGetLogAnalysisIdFormatsRoute,
} from './routes/log_analysis';
import { initMetadataRoute } from './routes/metadata';
import { initMetricsSourceConfigurationRoutes } from './routes/metrics_sources';
import { initNodeDetailsRoute } from './routes/node_details';
import { initOverviewRoute } from './routes/overview';
import { initProcessListRoute } from './routes/process_list';
import { initSnapshotRoute } from './routes/snapshot';
import { initInfraAssetRoutes } from './routes/infra';
import { initMetricsExplorerViewRoutes } from './routes/metrics_explorer_views';
import { initProfilingRoutes } from './routes/profiling';
import { initServicesRoute } from './routes/services';
import type { InfraBackendLibs } from './lib/infra_types';

export const registerRoutes = (libs: InfraBackendLibs) => {
  initIpToHostName(libs);
  initGetLogEntryCategoriesRoute(libs);
  initGetLogEntryCategoryDatasetsRoute(libs);
  initGetLogEntryCategoryDatasetsStatsRoute(libs);
  initGetLogEntryCategoryExamplesRoute(libs);
  initGetLogEntryAnomaliesRoute(libs);
  initGetLogEntryAnomaliesDatasetsRoute(libs);
  initGetK8sAnomaliesRoute(libs);
  initGetHostsAnomaliesRoute(libs);
  initSnapshotRoute(libs);
  initNodeDetailsRoute(libs);
  initMetricsSourceConfigurationRoutes(libs);
  initGetLogAnalysisIdFormatsRoute(libs);
  initValidateLogAnalysisDatasetsRoute(libs);
  initValidateLogAnalysisIndicesRoute(libs);
  initGetLogEntryExamplesRoute(libs);
  initMetricsExplorerViewRoutes(libs);
  initMetadataRoute(libs);
  initInventoryMetaRoute(libs);
  initInventoryViewRoutes(libs);
  initGetLogAlertsChartPreviewDataRoute(libs);
  initProcessListRoute(libs);
  initOverviewRoute(libs);
  initInfraAssetRoutes(libs);
  initProfilingRoutes(libs);
  initServicesRoute(libs);
};
