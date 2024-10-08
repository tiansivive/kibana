/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ServiceParams, SubActionConnector } from '@kbn/actions-plugin/server';

import type { AxiosError } from 'axios';
import { SubActionRequestParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
import { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
import { isAggregateError, NodeSystemError } from './types';
import type {
  CrowdstrikeConfig,
  CrowdstrikeSecrets,
  CrowdstrikeGetAgentsResponse,
  CrowdstrikeGetAgentsParams,
  CrowdstrikeHostActionsParams,
  CrowdstrikeGetTokenResponse,
  CrowdstrikeGetAgentOnlineStatusResponse,
  RelaxedCrowdstrikeBaseApiResponse,
} from '../../../common/crowdstrike/types';
import {
  CrowdstrikeHostActionsParamsSchema,
  CrowdstrikeGetAgentsParamsSchema,
  CrowdstrikeGetTokenResponseSchema,
  CrowdstrikeHostActionsResponseSchema,
  RelaxedCrowdstrikeBaseApiResponseSchema,
} from '../../../common/crowdstrike/schema';
import { SUB_ACTION } from '../../../common/crowdstrike/constants';
import { CrowdstrikeError } from './error';

const paramsSerializer = (params: Record<string, string>) => {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
};

/**
 * Crowdstrike Connector
 * @constructor
 * @param {string} token - Authorization token received from OAuth2 API, that needs to be sent along with each request.
 * @param {number} tokenExpiryTimeout - Tokens are valid for 30 minutes, so we will refresh them every 29 minutes
 * @param {base64} base64encodedToken - The base64 encoded token used for authentication.
 */

export class CrowdstrikeConnector extends SubActionConnector<
  CrowdstrikeConfig,
  CrowdstrikeSecrets
> {
  private static token: string | null;
  private static tokenExpiryTimeout: NodeJS.Timeout;
  private static base64encodedToken: string;
  private urls: {
    getToken: string;
    agents: string;
    hostAction: string;
    agentStatus: string;
  };

  constructor(params: ServiceParams<CrowdstrikeConfig, CrowdstrikeSecrets>) {
    super(params);
    this.urls = {
      getToken: `${this.config.url}/oauth2/token`,
      hostAction: `${this.config.url}/devices/entities/devices-actions/v2`,
      agents: `${this.config.url}/devices/entities/devices/v2`,
      agentStatus: `${this.config.url}/devices/entities/online-state/v1`,
    };

    if (!CrowdstrikeConnector.base64encodedToken) {
      CrowdstrikeConnector.base64encodedToken = Buffer.from(
        this.secrets.clientId + ':' + this.secrets.clientSecret
      ).toString('base64');
    }

    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: SUB_ACTION.GET_AGENT_DETAILS,
      method: 'getAgentDetails',
      schema: CrowdstrikeGetAgentsParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.HOST_ACTIONS,
      method: 'executeHostActions',
      schema: CrowdstrikeHostActionsParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.GET_AGENT_ONLINE_STATUS,
      method: 'getAgentOnlineStatus',
      schema: CrowdstrikeGetAgentsParamsSchema,
    });
  }

  public async executeHostActions(
    { alertIds, ...payload }: CrowdstrikeHostActionsParams,
    connectorUsageCollector: ConnectorUsageCollector
  ) {
    return this.crowdstrikeApiRequest(
      {
        url: this.urls.hostAction,
        method: 'post',
        params: {
          action_name: payload.command,
        },
        data: {
          ids: payload.ids,
          ...(payload.actionParameters
            ? {
                action_parameters: Object.entries(payload.actionParameters).map(
                  ([name, value]) => ({
                    name,
                    value,
                  })
                ),
              }
            : {}),
        },
        paramsSerializer,
        responseSchema: CrowdstrikeHostActionsResponseSchema,
      },
      connectorUsageCollector
    );
  }

  public async getAgentDetails(
    payload: CrowdstrikeGetAgentsParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<CrowdstrikeGetAgentsResponse> {
    return this.crowdstrikeApiRequest(
      {
        url: this.urls.agents,
        method: 'GET',
        params: {
          ids: payload.ids,
        },
        paramsSerializer,
        responseSchema: RelaxedCrowdstrikeBaseApiResponseSchema,
      },
      connectorUsageCollector
    ) as Promise<CrowdstrikeGetAgentsResponse>;
  }

  public async getAgentOnlineStatus(
    payload: CrowdstrikeGetAgentsParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<CrowdstrikeGetAgentOnlineStatusResponse> {
    return this.crowdstrikeApiRequest(
      {
        url: this.urls.agentStatus,
        method: 'GET',
        params: {
          ids: payload.ids,
        },
        paramsSerializer,
        responseSchema: RelaxedCrowdstrikeBaseApiResponseSchema,
      },
      connectorUsageCollector
    ) as Promise<CrowdstrikeGetAgentOnlineStatusResponse>;
  }

  private async getTokenRequest(connectorUsageCollector: ConnectorUsageCollector) {
    const response = await this.request<CrowdstrikeGetTokenResponse>(
      {
        url: this.urls.getToken,
        method: 'post',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          authorization: 'Basic ' + CrowdstrikeConnector.base64encodedToken,
        },
        responseSchema: CrowdstrikeGetTokenResponseSchema,
      },
      connectorUsageCollector
    );
    const token = response.data?.access_token;
    if (token) {
      // Clear any existing timeout
      clearTimeout(CrowdstrikeConnector.tokenExpiryTimeout);

      // Set a timeout to reset the token after 29 minutes (it expires after 30 minutes)
      CrowdstrikeConnector.tokenExpiryTimeout = setTimeout(() => {
        CrowdstrikeConnector.token = null;
      }, 29 * 60 * 1000);
    }
    return token;
  }

  private async crowdstrikeApiRequest<R extends RelaxedCrowdstrikeBaseApiResponse>(
    req: SubActionRequestParams<R>,
    connectorUsageCollector: ConnectorUsageCollector,
    retried?: boolean
  ): Promise<R> {
    try {
      if (!CrowdstrikeConnector.token) {
        CrowdstrikeConnector.token = (await this.getTokenRequest(
          connectorUsageCollector
        )) as string;
      }

      const response = await this.request<R>(
        {
          ...req,
          headers: {
            ...req.headers,
            Authorization: `Bearer ${CrowdstrikeConnector.token}`,
          },
        },
        connectorUsageCollector
      );

      return response.data;
    } catch (error) {
      if (error.code === 401 && !retried) {
        CrowdstrikeConnector.token = null;
        return this.crowdstrikeApiRequest(req, connectorUsageCollector, true);
      }
      throw new CrowdstrikeError(error.message);
    }
  }

  protected getResponseErrorMessage(
    error: AxiosError<{ errors: Array<{ message: string; code: number }> }>
  ): string {
    const errorData = error.response?.data?.errors?.[0];
    if (errorData) {
      return errorData.message;
    }

    const cause: NodeSystemError = isAggregateError(error.cause)
      ? error.cause.errors[0]
      : error.cause;
    if (cause) {
      // ENOTFOUND is the error code for when the host is unreachable eg. api.crowdstrike.com111
      if (cause.code === 'ENOTFOUND') {
        return `URL not found: ${cause.hostname}`;
      }
      // ECONNREFUSED is the error code for when the host is unreachable eg. http://MacBook-Pro-Tomasz.local:55555
      if (cause.code === 'ECONNREFUSED') {
        return `Connection Refused: ${cause.address}:${cause.port}`;
      }
    }

    if (!error.response?.status) {
      return `Unknown API Error: ${JSON.stringify(error.response?.data ?? {})}`;
    }

    return `API Error: ${JSON.stringify(error.response.data ?? {})}`;
  }
}
