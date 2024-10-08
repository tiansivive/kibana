/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from './router';

/**
 * Status indicating an outcome of the authentication.
 * @public
 */
export enum AuthStatus {
  /**
   * `auth` interceptor successfully authenticated a user
   */
  authenticated = 'authenticated',
  /**
   * `auth` interceptor failed user authentication
   */
  unauthenticated = 'unauthenticated',
  /**
   * `auth` interceptor has not been registered
   */
  unknown = 'unknown',
}

/**
 * Gets authentication state for a request. Returned by `auth` interceptor.
 * @param request {@link KibanaRequest} - an incoming request.
 * @public
 */
export type GetAuthState = <T = unknown>(
  request: KibanaRequest
) => { status: AuthStatus; state: T };

/**
 * Returns authentication status for a request.
 * @param request {@link KibanaRequest} - an incoming request.
 * @public
 */
export type IsAuthenticated = (request: KibanaRequest) => boolean;
