/**
 * Claude's filters reach the explorer with their time range (ADR 0057): `filter_view` sets one, which
 * the tab applies as the person's own, and can then move and play.
 */
import {
  decodeServerMessage,
  encodeServerMessage,
  type ViewTimeRange,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { filtersOf } from './explore';
import { NO_GUIDANCE, applyGuidance, type GuidedFilters } from './state';

const RANGE: ViewTimeRange = {
  of: 'elements',
  attribute: 'launched',
  kind: 'date',
  from: Date.UTC(2024, 0, 1),
  to: Date.UTC(2025, 5, 30),
};

describe('Claude’s time range', () => {
  it('comes over the live connection with the filters, and the explorer takes it', () => {
    const filters: GuidedFilters = {
      components: [],
      relationTypes: [],
      conditions: [],
      range: RANGE,
    };
    const message = decodeServerMessage(
      encodeServerMessage({ type: 'guidance', guidance: { kind: 'filter', filters } }),
    );
    if (message.type !== 'guidance' || message.guidance.kind !== 'filter') {
      throw new Error('Not filters.');
    }
    const state = applyGuidance(NO_GUIDANCE, message.guidance, 1);
    expect(state.filter?.filters.range).toEqual(RANGE);
    expect(filtersOf(state.filter!.filters).range).toEqual(RANGE);
  });

  it('is left out when Claude gives none', () => {
    expect(filtersOf({ components: [], relationTypes: [], conditions: [] })).not.toHaveProperty(
      'range',
    );
  });
});
