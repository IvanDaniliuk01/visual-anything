/**
 * Time ranges in the open view (R43, ADR 0025's clarification): which attributes a range can be on,
 * how far their values reach, how a point on the axis is written, and how playback moves the range.
 * Values are read through the attribute lookup, live and computed ones over stored ones.
 */
import {
  definitionsIn,
  modelIndexOf,
  rangeKindOf,
  rangePointOf,
  type Definitions,
  type ProjectSnapshot,
  type RangeKind,
} from '@visual-anything/core';
import type { Element, Id, JsonValue, Relation } from '@visual-anything/schema';
import type { AttributeLookup } from '../live-values/lookup';
import { filterChoices, type TimeRange } from './explore';
import type { Scene } from './scene';

/** An attribute a time range can be on, with how its values read and how far they reach. */
export interface RangeChoice {
  of: 'elements' | 'relations';
  attribute: string;
  kind: RangeKind;
  min: number;
  max: number;
}

/** How far a range's values reach in a view, and how many have none. */
export interface RangeExtent {
  min: number;
  max: number;
  /** Whether every point is a whole number, or for dates, a whole day. */
  whole: boolean;
  /** How many elements, or relations, have no value for the range: they stay shown. */
  without: number;
}

type Item = { kind: 'element'; element: Element } | { kind: 'relation'; relation: Relation };

/** What the view draws, as items whose attributes are read, each once. */
function itemsOf(scene: Scene, project: ProjectSnapshot, of: 'elements' | 'relations'): Item[] {
  const index = modelIndexOf(project);
  const seen = new Set<Id>();
  const items: Item[] = [];
  if (of === 'elements') {
    for (const shape of scene.shapes) {
      if (seen.has(shape.element)) continue;
      seen.add(shape.element);
      const element = index.element(shape.element);
      if (element) items.push({ kind: 'element', element });
    }
  } else {
    for (const line of scene.relations) {
      if (seen.has(line.relation)) continue;
      seen.add(line.relation);
      const relation = index.relation(line.relation);
      if (relation) items.push({ kind: 'relation', relation });
    }
  }
  return items;
}

function valueOf(
  item: Item,
  name: string,
  definitions: Definitions,
  lookup: AttributeLookup,
): JsonValue | undefined {
  return lookup.value(item, name, definitions);
}

/** The attributes of what a view draws that a time range can be on: those whose values are points. */
export function rangeChoices(
  scene: Scene,
  project: ProjectSnapshot,
  lookup: AttributeLookup,
): RangeChoice[] {
  const definitions = definitionsIn(project);
  const { attributes } = filterChoices(scene, project, lookup);
  const found: RangeChoice[] = [];
  for (const of of ['elements', 'relations'] as const) {
    const items = itemsOf(scene, project, of);
    for (const attribute of attributes[of]) {
      const values = items.map((item) => valueOf(item, attribute, definitions, lookup));
      const kind = rangeKindOf(values);
      if (kind === undefined) continue;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const value of values) {
        const point = rangePointOf(value, kind);
        if (point === undefined) continue;
        min = Math.min(min, point);
        max = Math.max(max, point);
      }
      if (Number.isFinite(min)) found.push({ of, attribute, kind, min, max });
    }
  }
  return found;
}

const DAY = 24 * 60 * 60 * 1000;

/** How far a range's values reach in the view, its start and its end, and how many have none. */
export function rangeExtent(
  scene: Scene,
  project: ProjectSnapshot,
  lookup: AttributeLookup,
  range: Pick<TimeRange, 'of' | 'attribute' | 'until' | 'kind'>,
): RangeExtent | undefined {
  const definitions = definitionsIn(project);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let whole = true;
  let without = 0;
  for (const item of itemsOf(scene, project, range.of)) {
    const names = range.until === undefined ? [range.attribute] : [range.attribute, range.until];
    let any = false;
    for (const name of names) {
      const point = rangePointOf(valueOf(item, name, definitions, lookup), range.kind);
      if (point === undefined) continue;
      any = true;
      min = Math.min(min, point);
      max = Math.max(max, point);
      if (range.kind === 'date' ? point % DAY !== 0 : !Number.isInteger(point)) whole = false;
    }
    if (!any) without += 1;
  }
  return Number.isFinite(min) ? { min, max, whole, without } : undefined;
}

/** How many steps the range's sliders take across its extent. */
export const SLIDER_STEPS = 1000;

/** The smallest step a range moves by: a whole number or a whole day when every point is one. */
export function stepOf(extent: RangeExtent, kind: RangeKind): number {
  const span = extent.max - extent.min;
  if (span <= 0) return 1;
  const fine = span / SLIDER_STEPS;
  if (!extent.whole) return fine;
  const unit = kind === 'date' ? DAY : 1;
  return Math.max(unit, Math.round(fine / unit) * unit);
}

/** How many ticks playback takes to cross the whole extent. */
export const PLAYBACK_TICKS = 40;

/**
 * The range one tick of playback later: moved on by a fortieth of the extent, keeping its width, up
 * to the extent's end; undefined once it is there.
 */
export function playedOn(range: TimeRange, extent: RangeExtent): TimeRange | undefined {
  const low = Math.min(range.from, range.to);
  const high = Math.max(range.from, range.to);
  if (high >= extent.max) return undefined;
  const step = Math.max(stepOf(extent, range.kind), (extent.max - extent.min) / PLAYBACK_TICKS);
  const moved = Math.min(step, extent.max - high);
  return { ...range, from: low + moved, to: high + moved };
}

/** Where playback starts from at the extent's end: back at its start, keeping the range's width. */
export function rewound(range: TimeRange, extent: RangeExtent): TimeRange {
  const width = Math.abs(range.to - range.from);
  const span = extent.max - extent.min;
  const kept = width >= span ? Math.max(0, span / PLAYBACK_TICKS) : width;
  return { ...range, from: extent.min, to: extent.min + kept };
}

/** A point on a range's axis, written as its values are: a number, a date, a date-time or a time. */
export function pointText(point: number, kind: RangeKind, whole: boolean): string {
  switch (kind) {
    case 'number':
      return whole ? String(Math.round(point)) : String(Math.round(point * 1000) / 1000);
    case 'date': {
      const iso = new Date(point).toISOString();
      return whole ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
    }
    case 'time': {
      const seconds = Math.round(point);
      const hours = Math.floor(seconds / 3600) % 24;
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = seconds % 60;
      const two = (n: number) => String(n).padStart(2, '0');
      return rest === 0
        ? `${two(hours)}:${two(minutes)}`
        : `${two(hours)}:${two(minutes)}:${two(rest)}`;
    }
  }
}
