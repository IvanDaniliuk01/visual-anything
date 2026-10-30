/**
 * The legend of a view's overlays (ADR 0055): what each color, size, badge and fade means, with its
 * own text, so that a color is never the only way a meaning is told. It describes, and draws nothing:
 * the canvas's panel, the PNG's band and the SVG and PDF writers each draw it their own way, and
 * Claude's tools read it as it is.
 *
 * The legend says when two colors of one overlay differ by less than 20 in CIELAB, or a color is under
 * 3:1 against the canvas of the theme shown: such colors are hard to tell apart, and their labels have
 * to (ADR 0080's clarification of 2026-10-30).
 */
import type { Color, Id, Overlay, ViewFile } from '@visual-anything/schema';
import {
  CANVAS_BACKGROUNDS,
  MINIMUM_COLOR_DIFFERENCE,
  MINIMUM_MARK_CONTRAST,
  colorDifference,
  contrastRatio,
} from '../colors';
import type { Definitions } from '../definitions';
import type { ThemeName } from '../preferences';
import { sortedStops, type OverlayChannel, type OverlayTarget } from './evaluate';

/** What a view's legend shows: one part for each overlay that is on, in the view's order. */
export interface Legend {
  overlays: LegendOverlay[];
}

/** What one overlay's part of the legend shows. */
export interface LegendOverlay {
  id: Id;
  /** What the legend calls it: its name, or the attribute it reads. */
  title: string;
  attribute: string;
  of: OverlayTarget;
  channel: OverlayChannel;
  mapping: Overlay['mapping']['kind'];
  /** The unit the attribute's values are in, as the definitions that define it say, if they do. */
  unit?: string;
  entries: LegendEntry[];
  /** What the legend warns about its colors, in English, as the core writes its messages. */
  warnings: string[];
}

/**
 * One line of an overlay's legend: a value it maps, a stop of its range, any other value, or, for an
 * overlay that takes the value itself, that.
 */
export interface LegendEntry {
  kind: 'case' | 'stop' | 'otherwise' | 'passthrough';
  /**
   * What it writes for a value or a stop: the label people gave it, or the value, with its unit for a
   * stop. Absent for any other value and for the value itself, which a legend words in its language.
   */
  label?: string;
  color?: Color;
  size?: number;
  badge?: string;
  opacity?: number;
}

/** The English a legend writes for the entries without a label of their own. */
export const LEGEND_WORDS = {
  otherwise: 'Any other value',
  passthrough: 'The value itself',
} as const;

/** The most warnings one overlay's part of the legend says; the rest are counted. */
const MOST_WARNINGS = 6;

/**
 * The legend of a view's overlays, for the canvas of a theme, which its warnings measure colors
 * against. Overlays turned off are left out, and so is a fill on relations, which have none.
 */
export function legendOf(view: ViewFile, definitions: Definitions, theme: ThemeName): Legend {
  const overlays = (view.overlays ?? []).filter(
    (overlay) =>
      overlay.off !== true && !(overlay.of === 'relations' && overlay.channel === 'fill'),
  );
  return { overlays: overlays.map((overlay) => legendPart(overlay, definitions, theme)) };
}

/** Whether a legend shows anything. */
export function legendShows(legend: Legend): boolean {
  return legend.overlays.length > 0;
}

function legendPart(overlay: Overlay, definitions: Definitions, theme: ThemeName): LegendOverlay {
  const unit = unitOf(overlay.attribute, overlay.of, definitions);
  const title = overlay.name ?? overlay.attribute;
  const entries = entriesOf(overlay, unit);
  const part: LegendOverlay = {
    id: overlay.id,
    title,
    attribute: overlay.attribute,
    of: overlay.of,
    channel: overlay.channel,
    mapping: overlay.mapping.kind,
    entries,
    warnings:
      overlay.channel === 'fill' || overlay.channel === 'stroke'
        ? colorWarnings(title, entries, theme)
        : [],
  };
  if (unit !== undefined) part.unit = unit;
  return part;
}

/** The entries of an overlay's legend, in the order its mapping lists them. */
function entriesOf(overlay: Overlay, unit: string | undefined): LegendEntry[] {
  const key = channelKey(overlay.channel);
  const mapping = overlay.mapping;
  if (mapping.kind === 'passthrough') return [{ kind: 'passthrough' }];
  const withValue = (entry: LegendEntry, value: unknown): LegendEntry =>
    value === undefined ? entry : { ...entry, [key]: value };
  if (mapping.kind === 'discrete') {
    const cases = mapping.cases as readonly ({ value: string; label?: string } & object)[];
    const entries = cases.map((each) =>
      withValue({ kind: 'case', label: each.label ?? each.value }, valueIn(each, overlay.channel)),
    );
    if (mapping.otherwise !== undefined) {
      entries.push(withValue({ kind: 'otherwise' }, mapping.otherwise));
    }
    return entries;
  }
  const stops = sortedStops(mapping.stops as readonly ({ at: number; label?: string } & object)[]);
  return stops.map((stop) =>
    withValue(
      {
        kind: 'stop',
        label: stop.label ?? (unit === undefined ? `${stop.at}` : `${stop.at} ${unit}`),
      },
      valueIn(stop, overlay.channel),
    ),
  );
}

/** The key a legend entry holds a channel's value under. */
function channelKey(channel: OverlayChannel): 'color' | 'size' | 'badge' | 'opacity' {
  return channel === 'fill' || channel === 'stroke' ? 'color' : channel;
}

/** The value a case or a stop gives its channel. */
function valueIn(item: object, channel: OverlayChannel): unknown {
  const record = item as Record<string, unknown>;
  switch (channel) {
    case 'fill':
    case 'stroke':
      return record.color;
    case 'size':
      return record.size;
    case 'opacity':
      return record.opacity;
    case 'badge':
      return record.text;
  }
}

/**
 * The unit of an attribute's values: the first the definitions in use give for an attribute of that
 * name, components for elements and relation types for relations.
 */
function unitOf(
  attribute: string,
  of: OverlayTarget,
  definitions: Definitions,
): string | undefined {
  const ids = of === 'elements' ? definitions.components.keys() : definitions.relationTypes.keys();
  for (const id of ids) {
    const resolved = of === 'elements' ? definitions.component(id) : definitions.relationType(id);
    const unit = resolved?.attributes.find((each) => each.name === attribute)?.unit;
    if (unit !== undefined) return unit;
  }
  return undefined;
}

/** How a contrast ratio is written: one decimal. */
function ratioText(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

/**
 * What the legend says about an overlay's colors: two of them that differ by less than 20, and any
 * under 3:1 against the canvas of the theme shown; at most a few, and how many more.
 */
function colorWarnings(title: string, entries: readonly LegendEntry[], theme: ThemeName): string[] {
  const colored = entries.filter(
    (entry): entry is LegendEntry & { color: Color } => entry.color !== undefined,
  );
  const named = (entry: LegendEntry) => (entry.kind === 'otherwise' ? undefined : entry.label);
  const warnings: string[] = [];
  const canvas = CANVAS_BACKGROUNDS[theme];
  for (const entry of colored) {
    const ratio = contrastRatio(entry.color, canvas);
    if (ratio >= MINIMUM_MARK_CONTRAST) continue;
    const label = named(entry);
    warnings.push(
      label === undefined
        ? `Any other value of "${title}" is ${ratioText(ratio)}:1 against the ${theme} canvas, under 3:1.`
        : `"${label}" of "${title}" is ${ratioText(ratio)}:1 against the ${theme} canvas, under 3:1.`,
    );
  }
  for (let first = 0; first < colored.length; first++) {
    for (let second = first + 1; second < colored.length; second++) {
      const a = colored[first] as LegendEntry & { color: Color };
      const b = colored[second] as LegendEntry & { color: Color };
      const difference = colorDifference(a.color, b.color);
      if (difference >= MINIMUM_COLOR_DIFFERENCE) continue;
      const left = named(a);
      const right = named(b);
      const by = Math.floor(difference);
      warnings.push(
        left === undefined || right === undefined
          ? `"${left ?? right ?? ''}" and any other value of "${title}" differ by ${by}, under ${MINIMUM_COLOR_DIFFERENCE}: hard to tell apart.`
          : `"${left}" and "${right}" of "${title}" differ by ${by}, under ${MINIMUM_COLOR_DIFFERENCE}: hard to tell apart.`,
      );
    }
  }
  if (warnings.length <= MOST_WARNINGS) return warnings;
  const rest = warnings.length - (MOST_WARNINGS - 1);
  return [
    ...warnings.slice(0, MOST_WARNINGS - 1),
    `…and ${rest} more warnings about the colors of "${title}".`,
  ];
}
