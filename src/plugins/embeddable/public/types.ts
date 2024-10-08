/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import { SavedObjectAttributes } from '@kbn/core/public';
import type { FinderAttributes } from '@kbn/saved-objects-finder-plugin/common';
import { PersistableState, PersistableStateDefinition } from '@kbn/kibana-utils-plugin/common';
import {
  EmbeddableFactory,
  EmbeddableInput,
  EmbeddableOutput,
  IEmbeddable,
  EmbeddableFactoryDefinition,
} from './lib/embeddables';

export type EmbeddableFactoryRegistry = Map<string, EmbeddableFactory>;
export type EnhancementsRegistry = Map<string, EnhancementRegistryItem>;

export interface EnhancementRegistryDefinition<P extends SerializableRecord = SerializableRecord>
  extends PersistableStateDefinition<P> {
  id: string;
}

export interface EnhancementRegistryItem<P extends SerializableRecord = SerializableRecord>
  extends PersistableState<P> {
  id: string;
}

export type EmbeddableFactoryProvider = <
  I extends EmbeddableInput = EmbeddableInput,
  O extends EmbeddableOutput = EmbeddableOutput,
  E extends IEmbeddable<I, O> = IEmbeddable<I, O>,
  T extends FinderAttributes = SavedObjectAttributes
>(
  def: EmbeddableFactoryDefinition<I, O, E, T>
) => EmbeddableFactory<I, O, E, T>;
