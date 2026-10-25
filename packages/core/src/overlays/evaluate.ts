/**
 * Overlays (ADR 0055): what a view's overlays make of one shape or one relation's line. Each overlay
 * maps one attribute to one channel; a view's overlays apply in order, each channel set by the first
 * that sets it, and an overlay turned off sets nothing. A value an overlay does not map leaves the
 * channel to the next overlay, or to the shape's own look. This is pure: the scene, the legend, the
 * exports and Claude's tools all read overlays through it, with whatever attribute lookup they have.
 */
import type {
  Color,
  ColorMapping,
  JsonValue,
  Overlay,
  SizeMapping,
  OpacityMapping,
  BadgeMapping,
} from '@visual-anything/schema';
import { isColor } from '../colors';
import { meetsCondition } from '../conditions';

/** The channel an overlay sets. */
export type OverlayChannel = Overlay['channel'];

/** Every channel, in the order the editors offer them. */
export const OVERLAY_CHANNELS: readonly OverlayChannel[] = [
  'fill',
  'stroke',
  'size',
  'badge',
  'opacity',
] satisfies readonly OverlayChannel[];

/** The most overlays one view keeps, as the file format says. */
export const MAX_OVERLAYS = 16;

/** What an overlay reads the attributes of. */
export type OverlayTarget = Overlay['of'];

/**
 * What a view's overlays set on one shape or one relation's line: each channel by the first overlay
 * that sets it. A channel left out keeps the shape's own look.
 */
export interface OverlayLook {
  fill?: Color;
  stroke?: Color;
  /** A factor on a shape's width and height, around its middle, or on a line's width. */
  size?: number;
  /** A short text the shape writes in its detail, or the line after its name. */
  badge?: string;
  /** How much of it shows, from 0.1 to 1: its colors are faded toward what it is drawn on. */
  opacity?: number;
}

/** What one channel takes. */
export type ChannelValue = Color | number;

/**
 * Whether an overlay sets anything on things of this kind: it is on, it reads their attributes, and
 * they have its channel, which relations' lines have for everything but a fill.
 */
export function overlayApplies(overlay: Overlay, of: OverlayTarget): boolean {
  return (
    overlay.off !== true && overlay.of === of && !(of === 'relations' && overlay.channel === 'fill')
  );
}

/**
 * What a view's overlays set on one thing of a kind, given how to read its attributes; undefined when
 * they set nothing, which is the common case and makes nothing.
 */
export function overlayLookOf(
  overlays: readonly Overlay[] | undefined,
  of: OverlayTarget,
  valueOf: (attribute: string) => JsonValue | undefined,
): OverlayLook | undefined {
  if (overlays === undefined || overlays.length === 0) return undefined;
  let look: OverlayLook | undefined;
  for (const overlay of overlays) {
    if (!overlayApplies(overlay, of)) continue;
    if (look !== undefined && look[overlay.channel] !== undefined) continue;
    const value = overlayValue(overlay, valueOf(overlay.attribute));
    if (value === undefined) continue;
    look ??= {};
    (look as Record<OverlayChannel, ChannelValue>)[overlay.channel] = value;
  }
  return look;
}

/** Whether any of a view's overlays could set something on things of a kind. */
export function overlaysApply(
  overlays: readonly Overlay[] | undefined,
  of: OverlayTarget,
): boolean {
  return overlays !== undefined && overlays.some((overlay) => overlayApplies(overlay, of));
}

/**
 * What one overlay gives an attribute's value, whether or not it is on: the channel's value, or
 * undefined when it maps no such value and the shape keeps its own.
 */
export function overlayValue(
  overlay: Overlay,
  value: JsonValue | undefined,
): ChannelValue | undefined {
  switch (overlay.channel) {
    case 'fill':
    case 'stroke':
      return colorOf(overlay.mapping, value);
    case 'size':
      return numberFrom(overlay.mapping, value, 'size');
    case 'opacity':
      return numberFrom(overlay.mapping, value, 'opacity');
    case 'badge':
      return badgeOf(overlay.mapping, value);
  }
}

function colorOf(mapping: ColorMapping, value: JsonValue | undefined): Color | undefined {
  switch (mapping.kind) {
    case 'discrete':
      return mapping.cases.find((each) => matches(value, each.value))?.color ?? mapping.otherwise;
    case 'continuous': {
      const at = numberOf(value);
      if (at === undefined) return undefined;
      return along(sortedStops(mapping.stops), at, (stop) => stop.color, mixColors);
    }
    case 'passthrough':
      return isColor(value) ? value.toUpperCase() : undefined;
  }
}

function numberFrom(
  mapping: SizeMapping | OpacityMapping,
  value: JsonValue | undefined,
  key: 'size' | 'opacity',
): number | undefined {
  const read = (each: object) => (each as Record<string, number>)[key] as number;
  if (mapping.kind === 'discrete') {
    const found = (mapping.cases as readonly object[]).find((each) =>
      matches(value, (each as { value: string }).value),
    );
    return found === undefined ? mapping.otherwise : read(found);
  }
  const at = numberOf(value);
  if (at === undefined) return undefined;
  return along(sortedStops(mapping.stops as readonly ({ at: number } & object)[]), at, read, mix);
}

/** The most characters a badge an overlay writes from the value itself has, "…" included. */
export const PASSTHROUGH_BADGE_LENGTH = 12;

function badgeOf(mapping: BadgeMapping, value: JsonValue | undefined): string | undefined {
  if (mapping.kind === 'discrete') {
    return mapping.cases.find((each) => matches(value, each.value))?.text ?? mapping.otherwise;
  }
  const text = textOf(value);
  if (text === undefined) return undefined;
  const characters = [...text];
  return characters.length > PASSTHROUGH_BADGE_LENGTH
    ? `${characters.slice(0, PASSTHROUGH_BADGE_LENGTH - 1).join('')}…`
    : text;
}

/** What a value writes as a badge of its own: text, a number, true; nothing when it has none. */
function textOf(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (value === true) return 'true';
  return JSON.stringify(value);
}

/** Whether an attribute's value is the value a case names, as filters compare them. */
function matches(value: JsonValue | undefined, named: string): boolean {
  return meetsCondition(value, 'is', named);
}

/** A value as a number: a number, or text that writes one; none for anything else. */
export function numberOf(value: JsonValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const sortedLists = new WeakMap<readonly object[], readonly object[]>();

/** Stops in increasing order of where they are, as a file edited by hand may not keep them. */
export function sortedStops<S extends { at: number }>(stops: readonly S[]): readonly S[] {
  let known = sortedLists.get(stops) as readonly S[] | undefined;
  if (!known) {
    known = [...stops].sort((a, b) => a.at - b.at);
    sortedLists.set(stops, known);
  }
  return known;
}

/**
 * What a range gives a number: the first stop's up to it, the last's from it, and between two stops
 * their values mixed in proportion.
 */
function along<S extends { at: number }, V>(
  stops: readonly S[],
  at: number,
  valueOf: (stop: S) => V,
  mixOf: (a: V, b: V, t: number) => V,
): V | undefined {
  const first = stops[0];
  if (first === undefined) return undefined;
  if (at <= first.at) return valueOf(first);
  for (let each = 1; each < stops.length; each++) {
    const to = stops[each] as S;
    if (at > to.at) continue;
    const from = stops[each - 1] as S;
    const span = to.at - from.at;
    return span <= 0 ? valueOf(to) : mixOf(valueOf(from), valueOf(to), (at - from.at) / span);
  }
  return valueOf(stops.at(-1) as S);
}

/** Two numbers mixed: `t` of the way from `a` to `b`, to four decimals. */
function mix(a: number, b: number, t: number): number {
  return Math.round((a + (b - a) * t) * 10_000) / 10_000;
}

/**
 * Two colors mixed channel by channel, `t` of the way from `a` to `b`, written as the core writes
 * colors: `#RRGGBB` in capitals. A value that is no color counts as white.
 */
export function mixColors(a: Color, b: Color, t: number): Color {
  const from = channels(a);
  const to = channels(b);
  const part = (at: 0 | 1 | 2) =>
    Math.round(from[at] + (to[at] - from[at]) * Math.min(1, Math.max(0, t)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(0)}${part(1)}${part(2)}`.toUpperCase();
}

function channels(color: Color): [number, number, number] {
  if (!isColor(color)) return [255, 255, 255];
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
}

/**
 * A color faded toward what it is drawn on: at opacity 1 the color itself, and at 0 the backdrop. The
 * canvas fades shapes this way rather than drawing them translucent, so that a fade is a recolor and
 * a shape's name stays as readable as on any fill (ADR 0055).
 */
export function fadedColor(color: Color, backdrop: Color, opacity: number): Color {
  return mixColors(backdrop, color, opacity);
}
