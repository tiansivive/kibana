/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { deleteAllCaseItems, suggestUserProfiles } from '../../../../common/lib/api';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('suggest_user_profiles', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('should get a 403 when trying to retrieve profile suggestions', async () => {
      await suggestUserProfiles({
        supertest,
        req: {
          name: 'delete',
          owners: [],
        },
        expectedHttpCode: 403,
      });
    });
  });
};
