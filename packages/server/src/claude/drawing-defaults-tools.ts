/**
 * Claude's tools for drawing defaults (A5.4, ADR 0086): `get_drawing` reads the values the canvas,
 * the read-only page and the exports draw with wherever no appearance sets them, resolved for the
 * project or for one view, with what the project and the view set themselves; `set_drawing` writes
 * what the project or a view sets, whole, as one undoable `set-drawing-defaults`. Not to be confused
 * with `import_drawing`, whose drawings are pictures made from HTML (ADR 0068).
 */
import {
  DRAWING_GROUPS,
  DRAWING_PRESET_IDS,
  DRAWING_VALUES,
  drawingOf,
  type DrawingValueRule,
  type ProjectSnapshot,
  type ResolvedDrawing,
} from '@visual-anything/core';
import type { DrawingDefaults, ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** What a value may be, in words: "0.5 to 8", or "filled, open or none". */
function allowed(rule: DrawingValueRule): string {
  if (rule.kind === 'number') return `${rule.least} to ${rule.most}`;
  const choices = rule.choices.map(String);
  return choices.length <= 2
    ? choices.join(' or ')
    : `${choices.slice(0, -1).join(', ')} or ${choices.at(-1) ?? ''}`;
}

/** Every value, by group, with what it may be, as the description and get_drawing's answer give it. */
const ALLOWED: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.fromEntries(
  DRAWING_GROUPS.map((group) => [
    group,
    Object.fromEntries(
      Object.entries(DRAWING_VALUES[group]).map(([name, rule]) => [name, allowed(rule)]),
    ),
  ]),
);

const VALUES_IN_WORDS = DRAWING_GROUPS.map(
  (group) =>
    `- ${group}: ${Object.entries(ALLOWED[group] ?? {})
      .map(([name, words]) => `${name} (${words})`)
      .join(', ')}`,
).join('\n');

/** The resolved values without the arrowhead's geometry, which comes with the preset and no one sets. */
function resolvedSaid(drawing: ResolvedDrawing): Record<string, unknown> {
  const lines: Record<string, unknown> = { ...drawing.lines };
  delete lines.arrow;
  return { ...drawing, lines };
}

function viewIn(state: ProjectSnapshot, viewId: string): ViewFile | undefined {
  return state.views.find((view) => view.id === viewId);
}

/** What get_drawing and set_drawing answer of a project's or a view's drawing defaults. */
function drawingSaid(state: ProjectSnapshot, view: ViewFile | undefined): Record<string, unknown> {
  const own = view?.drawing?.preset !== undefined;
  return {
    resolved: resolvedSaid(drawingOf(state, view?.id)),
    project: state.project.drawing ?? {},
    ...(view === undefined
      ? {}
      : {
          view: { id: view.id, name: view.name, sets: view.drawing ?? {} },
          ...(own
            ? {
                note: `"${view.name}" names a preset of its own, so the project's values do not reach it.`,
              }
            : {}),
        }),
  };
}

const getDrawing = tool({
  name: 'get_drawing',
  title: 'Read the drawing defaults',
  description: `Reads the drawing defaults: the values the canvas, the read-only page and every export draw with wherever no appearance sets them, such as line widths, arrowheads, corner radii, the font and its sizes, padding, how containers and aggregated relations are drawn, the zoom at which names, details and rows show, and the grid's look. resolved is every value as drawn, for the view when you give one and for the project otherwise; project is what the project sets itself, and view what the view sets for itself alone. Whatever a layer leaves out is the layer's under it: the view's, then the project's, then its preset's. allowed gives what each value may be.

Read it before set_drawing, which replaces what the project or the view sets.

Example: { }
Example: { "view": "system-overview" }`,
  input: {
    view: id().optional().describe('The view to resolve them for; left out, the project.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const view = args.view === undefined ? undefined : viewIn(state, args.view);
    if (args.view !== undefined && view === undefined) {
      return fail(`There is no view "${args.view}".`);
    }
    return ok({ ...drawingSaid(state, view), presets: DRAWING_PRESET_IDS, allowed: ALLOWED });
  },
});

/** A value as Claude gives it: the core checks it against its range or its choices. */
const value = (group: string, name: string) =>
  z.union([z.number(), z.string(), z.boolean()]).describe(ALLOWED[group]?.[name] ?? '');

/** A group as Claude gives it: a key it does not have reaches the core, which names it. */
const groupInput = (group: (typeof DRAWING_GROUPS)[number]) =>
  z
    .object(
      Object.fromEntries(
        Object.keys(DRAWING_VALUES[group]).map((name) => [name, value(group, name).optional()]),
      ),
    )
    .passthrough()
    .optional();

const drawingInput = () =>
  z
    .object({
      preset: z
        .string()
        .optional()
        .describe(`The preset the values change: ${DRAWING_PRESET_IDS.join(', ')}.`),
      ...Object.fromEntries(DRAWING_GROUPS.map((group) => [group, groupInput(group)])),
    })
    .passthrough()
    .nullable()
    .describe(
      'What the project, or the view, sets, whole: it replaces what was set. null sets nothing, so the preset as built in draws, or, for a view, the project’s values.',
    );

const setDrawing = tool({
  name: 'set_drawing',
  title: 'Set the drawing defaults',
  description: `Sets the drawing defaults of the project, or of one view alone, as one undoable action: how the canvas, the read-only page and every export draw what no appearance sets. An appearance a component, an element, a relation type or a relation sets still comes first for what it sets.

A preset is a built-in set of every value:
- clean, the default: thin neutral lines with small arrowheads, 1-wide borders, a radius of 8, names at 13 in a medium weight, containers as quiet regions with a name tab, collapsed containers that count what they hold, aggregated relations as one line with a count badge, and dots for the grid;
- dense: smaller text and tighter padding, rows shown sooner, lines colored by their type;
- expressive: rounder and bolder, larger radii and names, soft shadows, lines colored by type;
- high-contrast: thicker lines and borders, stronger text, no faint colors.

The project names a preset and changes any of its values; a view changes them again for itself alone, or names a preset of its own, which then starts from that preset without the project's values. drawing replaces what the scope sets, whole: call get_drawing first and pass what to keep with what you change; leave out what should be the layer's under it, and pass null to set nothing. The values, by group, with what each may be:
${VALUES_IN_WORDS}
Sizes are in canvas units, reading's *From values are scales (1 is 100%), and farNameSize is in screen pixels.

colors.storedColorsInDark says how the dark canvas draws the colors the project stores (fills, strokes, tints, notes and free arrows): as-stored, every preset's, draws them as picked; adapted turns their lightness and keeps their hue, so that a pale fill draws dark there. It only draws: the light canvas, the files and every tool's answer keep the stored colors, and built-in colors keep their own dark shades. Set it when the person finds light colors glare on the dark canvas, never on your own.

After you set them, call capture_view on a view to check the result, and tell the person what changed: they can undo it in the app.

Example: { "drawing": { "preset": "dense" } }
Example: { "drawing": { "preset": "clean", "lines": { "width": 1.5, "color": "by-type" }, "text": { "nameSize": 14 } } }
Example: { "view": "system-overview", "drawing": { "containers": { "drawn": "as-kind" }, "grid": { "look": "lines" } } }
Example: { "view": "system-overview", "drawing": null }`,
  input: {
    view: id()
      .optional()
      .describe('The view whose own drawing defaults change; left out, the project’s.'),
    drawing: drawingInput(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      {
        type: 'set-drawing-defaults',
        ...(args.view === undefined ? {} : { view: args.view }),
        drawing: args.drawing as DrawingDefaults | null,
      },
      async () => {
        const state = await program.project();
        const view = args.view === undefined ? undefined : viewIn(state, args.view);
        return {
          ...drawingSaid(state, view),
          check: 'Call capture_view on a view to see it drawn.',
        };
      },
    ),
});

/** Claude's tools for drawing defaults, in the order Claude reads them. */
export const DRAWING_DEFAULTS_TOOLS: readonly Tool[] = [getDrawing, setDrawing];
