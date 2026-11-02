/**
 * Drawing defaults (A5, ADR 0086, `docs/designs/drawing-defaults.md`): the built-in presets, the
 * values a project and a view change, and the resolved values the canvas, the read-only page and the
 * exports draw with wherever no appearance sets them. Pure: it reads a snapshot, nothing else.
 */
import type {
  DrawingAggregated,
  DrawingContainers,
  DrawingDefaults,
  DrawingGrid,
  DrawingLines,
  DrawingPreset,
  DrawingReading,
  DrawingShapes,
  DrawingText,
  Id,
} from '@visual-anything/schema';
import type { ProjectSnapshot } from './snapshot';

/** An arrowhead's length and half width, each the larger of a least and a multiple of the line's width. */
export interface ArrowGeometry {
  leastLength: number;
  lengthPerWidth: number;
  leastHalfWidth: number;
  halfWidthPerWidth: number;
}

/** Drawing defaults with every value set: what the canvas draws with. */
export interface ResolvedDrawing {
  preset: DrawingPreset;
  lines: Required<DrawingLines> & { arrow: ArrowGeometry };
  shapes: Required<DrawingShapes>;
  text: Required<DrawingText>;
  containers: Required<DrawingContainers>;
  aggregated: Required<DrawingAggregated>;
  reading: Required<DrawingReading>;
  grid: Required<DrawingGrid>;
}

/** The presets, in the order the app offers them; Clean comes first and is the default. */
export const DRAWING_PRESET_IDS: readonly DrawingPreset[] = [
  'clean',
  'dense',
  'expressive',
  'high-contrast',
];

export const DEFAULT_DRAWING_PRESET: DrawingPreset = 'clean';

const ARROW_TODAY: ArrowGeometry = {
  leastLength: 10,
  lengthPerWidth: 5,
  leastHalfWidth: 4,
  halfWidthPerWidth: 2.5,
};

/**
 * How the canvas drew before drawing defaults, kept so that the work that makes the canvas read them
 * can show it draws the same; it is no preset a project can name.
 */
export const DRAWING_BEFORE_A5: ResolvedDrawing = {
  preset: 'clean',
  lines: {
    width: 2,
    arrowhead: 'filled',
    arrowSize: 1,
    cornerRadius: 16,
    parallelGap: 24,
    color: 'by-type',
    fadeOthers: false,
    arrow: ARROW_TODAY,
  },
  shapes: { borderWidth: 1.5, cornerRadius: 10, shadow: 'none' },
  text: {
    font: 'roboto',
    nameSize: 14,
    nameWeight: 700,
    detailSize: 11,
    rowSize: 12,
    containerNameSize: 14,
    labelSize: 12,
    noteSize: 13,
    lineHeight: 1.3,
    padding: 8,
  },
  containers: { drawn: 'as-kind', padding: 24, collapsed: 'stack' },
  aggregated: { count: 'label', growsWithCount: true },
  reading: { namesFrom: 0.45, detailsFrom: 0.9, rowsFrom: 0.7, labelsFrom: 0.9, farNameSize: 12 },
  grid: { look: 'lines' },
};

/** The presets as built in, every value set (the design's section 3). */
export const DRAWING_PRESETS: Readonly<Record<DrawingPreset, ResolvedDrawing>> = {
  clean: {
    preset: 'clean',
    lines: {
      width: 1.25,
      arrowhead: 'filled',
      arrowSize: 1,
      cornerRadius: 12,
      parallelGap: 20,
      color: 'neutral',
      fadeOthers: true,
      arrow: { leastLength: 7, lengthPerWidth: 4, leastHalfWidth: 3, halfWidthPerWidth: 2 },
    },
    shapes: { borderWidth: 1, cornerRadius: 8, shadow: 'none' },
    text: {
      font: 'roboto',
      nameSize: 13,
      nameWeight: 500,
      detailSize: 11,
      rowSize: 12,
      containerNameSize: 12,
      labelSize: 11,
      noteSize: 13,
      lineHeight: 1.35,
      padding: 10,
    },
    containers: { drawn: 'region', padding: 24, collapsed: 'count' },
    aggregated: { count: 'badge', growsWithCount: false },
    reading: { namesFrom: 0.35, detailsFrom: 0.8, rowsFrom: 0.6, labelsFrom: 0.8, farNameSize: 13 },
    grid: { look: 'dots' },
  },
  dense: {
    preset: 'dense',
    lines: {
      width: 1,
      arrowhead: 'filled',
      arrowSize: 1,
      cornerRadius: 8,
      parallelGap: 16,
      color: 'by-type',
      fadeOthers: false,
      arrow: { leastLength: 6, lengthPerWidth: 4, leastHalfWidth: 2.5, halfWidthPerWidth: 2 },
    },
    shapes: { borderWidth: 1, cornerRadius: 4, shadow: 'none' },
    text: {
      font: 'roboto',
      nameSize: 12,
      nameWeight: 500,
      detailSize: 10,
      rowSize: 11,
      containerNameSize: 11,
      labelSize: 10,
      noteSize: 12,
      lineHeight: 1.25,
      padding: 6,
    },
    containers: { drawn: 'region', padding: 16, collapsed: 'count' },
    aggregated: { count: 'badge', growsWithCount: false },
    reading: { namesFrom: 0.3, detailsFrom: 0.7, rowsFrom: 0.5, labelsFrom: 0.7, farNameSize: 12 },
    grid: { look: 'lines' },
  },
  expressive: {
    preset: 'expressive',
    lines: {
      width: 2,
      arrowhead: 'filled',
      arrowSize: 1,
      cornerRadius: 20,
      parallelGap: 28,
      color: 'by-type',
      fadeOthers: true,
      arrow: ARROW_TODAY,
    },
    shapes: { borderWidth: 1.5, cornerRadius: 14, shadow: 'soft' },
    text: {
      font: 'roboto',
      nameSize: 15,
      nameWeight: 700,
      detailSize: 12,
      rowSize: 13,
      containerNameSize: 15,
      labelSize: 12,
      noteSize: 14,
      lineHeight: 1.35,
      padding: 12,
    },
    containers: { drawn: 'as-kind', padding: 32, collapsed: 'stack-and-count' },
    aggregated: { count: 'badge', growsWithCount: true },
    reading: { namesFrom: 0.4, detailsFrom: 0.9, rowsFrom: 0.7, labelsFrom: 0.9, farNameSize: 14 },
    grid: { look: 'dots' },
  },
  'high-contrast': {
    preset: 'high-contrast',
    lines: {
      width: 2.5,
      arrowhead: 'filled',
      arrowSize: 1,
      cornerRadius: 12,
      parallelGap: 24,
      color: 'by-type',
      fadeOthers: false,
      arrow: { leastLength: 10, lengthPerWidth: 4, leastHalfWidth: 4, halfWidthPerWidth: 2 },
    },
    shapes: { borderWidth: 2, cornerRadius: 6, shadow: 'none' },
    text: {
      font: 'roboto',
      nameSize: 14,
      nameWeight: 700,
      detailSize: 12,
      rowSize: 13,
      containerNameSize: 14,
      labelSize: 12,
      noteSize: 14,
      lineHeight: 1.35,
      padding: 10,
    },
    containers: { drawn: 'region', padding: 24, collapsed: 'count' },
    aggregated: { count: 'label', growsWithCount: true },
    reading: { namesFrom: 0.45, detailsFrom: 0.9, rowsFrom: 0.7, labelsFrom: 0.9, farNameSize: 14 },
    grid: { look: 'lines' },
  },
};

/** The groups a drawing has, each a record of values. */
export const DRAWING_GROUPS = [
  'lines',
  'shapes',
  'text',
  'containers',
  'aggregated',
  'reading',
  'grid',
] as const;
export type DrawingGroup = (typeof DRAWING_GROUPS)[number];

/** What a value may be: a number in a range, or one of a few choices. */
export type DrawingValueRule =
  | { kind: 'number'; least: number; most: number }
  | { kind: 'choice'; choices: readonly (string | number | boolean)[] };

const number = (least: number, most: number): DrawingValueRule => ({ kind: 'number', least, most });
const choice = (...choices: (string | number | boolean)[]): DrawingValueRule => ({
  kind: 'choice',
  choices,
});
const YES_NO = choice(true, false);

/** Every value a drawing may set, by group, with what it may be: the schema's ranges and choices. */
export const DRAWING_VALUES: Readonly<
  Record<DrawingGroup, Readonly<Record<string, DrawingValueRule>>>
> = {
  lines: {
    width: number(0.5, 8),
    arrowhead: choice('filled', 'open', 'none'),
    arrowSize: number(0.5, 3),
    cornerRadius: number(0, 48),
    parallelGap: number(8, 64),
    color: choice('by-type', 'neutral'),
    fadeOthers: YES_NO,
  },
  shapes: {
    borderWidth: number(0.5, 6),
    cornerRadius: number(0, 32),
    shadow: choice('none', 'soft'),
  },
  text: {
    font: choice('roboto', 'system'),
    nameSize: number(9, 32),
    nameWeight: choice(400, 500, 700),
    detailSize: number(8, 24),
    rowSize: number(8, 24),
    containerNameSize: number(8, 32),
    labelSize: number(8, 24),
    noteSize: number(8, 32),
    lineHeight: number(1, 2),
    padding: number(2, 32),
  },
  containers: {
    drawn: choice('as-kind', 'region'),
    padding: number(8, 96),
    collapsed: choice('stack', 'count', 'stack-and-count'),
  },
  aggregated: { count: choice('label', 'badge'), growsWithCount: YES_NO },
  reading: {
    namesFrom: number(0.05, 2),
    detailsFrom: number(0.05, 2),
    rowsFrom: number(0.05, 2),
    labelsFrom: number(0.05, 2),
    farNameSize: number(9, 24),
  },
  grid: { look: choice('lines', 'dots') },
};

/**
 * What is wrong with drawing defaults as given: each problem in a sentence, naming the value. None
 * when every key is one a drawing has and every value is in its range or among its choices.
 */
export function drawingProblems(given: unknown): string[] {
  if (!isRecord(given)) return ['Drawing defaults are an object of groups.'];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(given)) {
    if (key === 'preset') {
      if (!(DRAWING_PRESET_IDS as readonly unknown[]).includes(value)) {
        problems.push(
          `There is no drawing preset "${String(value)}": it is one of ${DRAWING_PRESET_IDS.join(', ')}.`,
        );
      }
      continue;
    }
    const rules = (DRAWING_VALUES as Record<string, Record<string, DrawingValueRule>>)[key];
    if (rules === undefined) {
      problems.push(
        `Drawing defaults have no group "${key}": they have ${DRAWING_GROUPS.join(', ')}.`,
      );
      continue;
    }
    if (!isRecord(value)) {
      problems.push(`The drawing group "${key}" is an object of values.`);
      continue;
    }
    for (const [name, each] of Object.entries(value)) {
      const rule = rules[name];
      if (rule === undefined) {
        problems.push(
          `The drawing group "${key}" has no value "${name}": it has ${Object.keys(rules).join(', ')}.`,
        );
      } else if (rule.kind === 'number') {
        if (
          typeof each !== 'number' ||
          !Number.isFinite(each) ||
          each < rule.least ||
          each > rule.most
        ) {
          problems.push(`${key}.${name} is a number from ${rule.least} to ${rule.most}.`);
        }
      } else if (!rule.choices.includes(each as string | number | boolean)) {
        problems.push(`${key}.${name} is one of ${rule.choices.map(String).join(', ')}.`);
      }
    }
  }
  return problems;
}

/** Drawing defaults with no empty group: undefined when nothing is left. */
export function compactDrawing(given: DrawingDefaults): DrawingDefaults | undefined {
  const out: Record<string, unknown> = {};
  if (given.preset !== undefined) out.preset = given.preset;
  for (const group of DRAWING_GROUPS) {
    const values = given[group];
    if (values === undefined) continue;
    const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    if (Object.keys(kept).length > 0) out[group] = kept;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * The drawing a view is drawn with: its preset (the view's, else the project's, else Clean), with
 * the project's values, then the view's, laid over it. With no view, the project's.
 */
export function drawingOf(project: ProjectSnapshot, viewId?: Id): ResolvedDrawing {
  const own = project.project.drawing;
  const view =
    viewId === undefined ? undefined : project.views.find((each) => each.id === viewId)?.drawing;
  return resolveDrawing(own, view);
}

/** A preset with the project's and then the view's values laid over it. */
export function resolveDrawing(
  project: DrawingDefaults | undefined,
  view: DrawingDefaults | undefined,
): ResolvedDrawing {
  const preset = view?.preset ?? project?.preset ?? DEFAULT_DRAWING_PRESET;
  const base = DRAWING_PRESETS[preset] ?? DRAWING_PRESETS[DEFAULT_DRAWING_PRESET];
  // A view that names a preset of its own starts from it, not from the project's changes.
  const layers = view?.preset !== undefined ? [view] : [project, view];
  const lines = { ...base.lines };
  const drawing: ResolvedDrawing = {
    preset,
    lines,
    shapes: { ...base.shapes },
    text: { ...base.text },
    containers: { ...base.containers },
    aggregated: { ...base.aggregated },
    reading: { ...base.reading },
    grid: { ...base.grid },
  };
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const group of DRAWING_GROUPS) {
      const values = layer[group];
      if (values === undefined) continue;
      Object.assign(drawing[group], withoutUndefined(values));
    }
  }
  drawing.lines.arrow = base.lines.arrow;
  return drawing;
}

/** An arrowhead's length and half width for a line of `width`, with the drawing's size. */
export function arrowheadOf(
  drawing: ResolvedDrawing,
  width: number,
): { length: number; halfWidth: number } {
  const { arrow, arrowSize } = drawing.lines;
  return {
    length: Math.max(arrow.leastLength, arrow.lengthPerWidth * width) * arrowSize,
    halfWidth: Math.max(arrow.leastHalfWidth, arrow.halfWidthPerWidth * width) * arrowSize,
  };
}

function withoutUndefined(values: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
