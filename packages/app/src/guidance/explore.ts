/**
 * Claude's filters and focus, as the open view's explorer holds them (ADR-0025). Guidance carries them
 * in lists, the way the live connection can; the explorer keeps sets, and every degree as infinity.
 * A view state's filters are read the same way, with their time range.
 */
import { modelIndexOf, type ProjectSnapshot, type ViewFilters } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  ALL_DEGREES,
  type AttributeCondition,
  type Filters,
  type FocusSettings,
  type FocusTargets,
} from '../canvas/explore';
import type { GuidedFilters, GuidedFocus } from './state';

/** Claude's filters, or a view state's with its time range, as the explorer's. */
export function filtersOf(guided: GuidedFilters | ViewFilters): Filters {
  const range = 'range' in guided ? guided.range : undefined;
  return {
    components: new Set(guided.components),
    relationTypes: new Set(guided.relationTypes),
    conditions: guided.conditions.map(({ of, attribute, test, value }): AttributeCondition => ({
      of,
      attribute,
      test,
      value,
    })),
    ...(range === undefined ? {} : { range: { ...range } }),
  };
}

/** Where Claude's focus starts: the targets that are elements, and those that are relations. */
export function focusTargetsOf(targets: readonly Id[], project: ProjectSnapshot): FocusTargets {
  const index = modelIndexOf(project);
  return {
    elements: new Set(targets.filter((id) => index.element(id) !== undefined)),
    relations: new Set(targets.filter((id) => index.relation(id) !== undefined)),
  };
}

/** How far Claude's focus reaches, as the explorer's settings. */
export function focusSettingsOf(focus: GuidedFocus): FocusSettings {
  return {
    degrees: focus.degrees === 'all' ? ALL_DEGREES : focus.degrees,
    direction: focus.direction,
    isolate: focus.isolate,
  };
}
