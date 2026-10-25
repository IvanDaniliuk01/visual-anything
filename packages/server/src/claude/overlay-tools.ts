/**
 * Claude's tools for overlays and levels of detail (ADR 0055): `get_overlays` reads a view's overlays
 * with the legend they make and what it warns about in each theme; `set_overlays` replaces them as
 * one undoable action; `set_levels` says what a component's shapes show from each scale up, and from
 * which scale its collapsed containers expand as the canvas zooms into them. Overlays are part of how
 * a view reads, so they are kept in its file, unlike filters.
 */
import {
  MAX_LEVELS,
  MAX_LEVEL_SCALE,
  MAX_OVERLAYS,
  definitionsIn,
  legendOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** What `get_overlays` and `set_overlays` say of a view's legend: its parts and its warnings. */
function legendSaid(state: ProjectSnapshot, view: ViewFile) {
  const definitions = definitionsIn(state);
  const light = legendOf(view, definitions, 'light');
  const dark = legendOf(view, definitions, 'dark');
  const warnings = [
    ...light.overlays.flatMap((part) => part.warnings),
    ...dark.overlays.flatMap((part) => part.warnings),
  ];
  return {
    legend: light.overlays.map((part) => ({
      title: part.title,
      of: part.of,
      attribute: part.attribute,
      channel: part.channel,
      mapping: part.mapping,
      ...(part.unit === undefined ? {} : { unit: part.unit }),
      entries: part.entries,
    })),
    ...(warnings.length > 0 ? { legendWarnings: [...new Set(warnings)] } : {}),
  };
}

function viewIn(state: ProjectSnapshot, viewId: string): ViewFile | undefined {
  return state.views.find((view) => view.id === viewId);
}

const caseValue = () =>
  z
    .union([z.string(), z.number(), z.boolean()])
    .describe(
      'The attribute value, compared as filters compare: text ignoring case, numbers as numbers.',
    );
const label = () =>
  z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('What the legend says for it; left out, the value.');
const color = () => z.string().describe('A color as #RRGGBB.');

/** An overlay as Claude gives it: the core checks every part, and says what it refuses. */
const overlayInput = () =>
  z
    .object({
      id: id().optional().describe('Its id in the view; left out, one is made.'),
      name: z.string().min(1).max(64).optional().describe('What the legend calls it.'),
      of: z.enum(['elements', 'relations']),
      attribute: z.string().min(1),
      channel: z.enum(['fill', 'stroke', 'size', 'badge', 'opacity']),
      mapping: z
        .object({
          kind: z.enum(['discrete', 'continuous', 'passthrough']),
          cases: z
            .array(
              z.object({
                value: caseValue(),
                color: color().optional(),
                size: z.number().min(0.5).max(2).optional(),
                text: z.string().min(1).max(12).optional(),
                opacity: z.number().min(0.1).max(1).optional(),
                label: label(),
              }),
            )
            .optional(),
          otherwise: z
            .union([z.string(), z.number()])
            .optional()
            .describe('What any other value, a missing one included, takes.'),
          stops: z
            .array(
              z.object({
                at: z.number(),
                color: color().optional(),
                size: z.number().min(0.5).max(2).optional(),
                opacity: z.number().min(0.1).max(1).optional(),
                label: label(),
              }),
            )
            .optional(),
        })
        .describe(
          'discrete: cases, each a value and what it takes (color for fill and stroke, size, text for badge, opacity), and otherwise. continuous: stops in increasing order of at, each a number and what it takes, mixed in between (not for badges). passthrough: the value itself is the color or the badge text.',
        ),
      off: z.boolean().optional().describe('Kept in the view but changing nothing.'),
    })
    .passthrough();

const getOverlays = tool({
  name: 'get_overlays',
  title: 'Read a view’s overlays and legend',
  description: `Reads the overlays of a view: the rules that color, size, mark or fade its shapes or lines by an attribute, in order, the first that sets a channel winning. It also gives the legend they make, as the person sees it on the canvas and in exports, and what the legend warns about colors hard to tell apart in the light or the dark theme.

Example: { "view": "system-overview" }`,
  input: { view: id() },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const view = viewIn(state, args.view);
    if (!view) return fail(`There is no view "${args.view}".`);
    return ok({ overlays: view.overlays ?? [], ...legendSaid(state, view) });
  },
});

const setOverlays = tool({
  name: 'set_overlays',
  title: 'Set a view’s overlays',
  description: `Replaces the overlays of a view, as one undoable action, to answer a question by color, size, badge or fade without making another view, such as "which services miss their latency budget". Each overlay reads one attribute of elements or of relations (their own value, or their definition's default) and sets one channel: fill (elements only), stroke, size (0.5 to 2 times, around the shape's middle; layout never moves for it, and containers that show contents keep theirs), badge (a short text after the detail, or after a relation's name) or opacity (0.1 to 1, a fade toward what it sits on). Overlays apply in order, each channel set by the first that sets it. An empty list takes them all away. At most ${MAX_OVERLAYS}.

Every color tells its meaning in the legend too, so give each case a label when its value would not say it. The answer says what the legend warns about colors under 3:1 apart or against a canvas: prefer colors far apart in lightness.

Example: { "view": "system-overview", "overlays": [{ "name": "Latency", "of": "elements", "attribute": "latencyMs", "channel": "fill", "mapping": { "kind": "continuous", "stops": [{ "at": 50, "color": "#16A34A", "label": "fast" }, { "at": 300, "color": "#DC2626", "label": "over budget" }] } }] }
Example: { "view": "system-overview", "overlays": [{ "of": "elements", "attribute": "owner", "channel": "badge", "mapping": { "kind": "discrete", "cases": [{ "value": "Scheduling team", "text": "SCH" }] } }, { "of": "elements", "attribute": "status", "channel": "opacity", "mapping": { "kind": "discrete", "cases": [{ "value": "retired", "opacity": 0.3 }] } }] }`,
  input: { view: id(), overlays: z.array(overlayInput()).max(MAX_OVERLAYS) },
  hints: WRITE,
  run: async (args, program) =>
    act(
      program,
      { type: 'set-overlays', view: args.view, overlays: args.overlays as never },
      async () => {
        const state = await program.project();
        const view = viewIn(state, args.view);
        return view ? legendSaid(state, view) : {};
      },
    ),
});

const level = () =>
  z.object({
    from: z.number().min(0).max(MAX_LEVEL_SCALE).describe('The scale it starts at; 1 is 100%.'),
    shows: z
      .array(z.enum(['silhouette', 'name', 'detail', 'contents', 'image']))
      .min(1)
      .max(5)
      .describe(
        'silhouette alone draws plain blocks; otherwise any of name, detail (written under the name), contents (the texts of rows) and image (pictures).',
      ),
  });

const setLevels = tool({
  name: 'set_levels',
  title: 'Set a component’s levels of detail',
  description: `Says what the shapes of a component, and of every component derived from it that does not say otherwise, show as the person zooms, as one undoable action: levels by the scale each starts at (1 is 100%), the highest reached winning, a silhouette below the first. A level is left only 10% below its scale, so nothing flickers. levels null takes them away, so the component inherits them again; an empty list follows the canvas's own steps (names from 45%, details from 90%, plain blocks below 25%). At most ${MAX_LEVELS} levels.

expandFrom is the scale from which a collapsed container of this component shows expanded while the canvas looks into it, collapsing again below 90% of it; the view keeps it collapsed, and nothing about the zoom is saved. null takes it away.

It works for built-in components too, whose look the project then keeps in its own file.

Example: { "component": "systems.service", "levels": [{ "from": 0, "shows": ["silhouette"] }, { "from": 0.3, "shows": ["name"] }, { "from": 0.9, "shows": ["name", "detail", "image"] }] }
Example: { "component": "systems.system", "expandFrom": 1.5 }`,
  input: {
    component: id(),
    levels: z.array(level()).max(MAX_LEVELS).nullable().optional(),
    expandFrom: z.number().positive().max(MAX_LEVEL_SCALE).nullable().optional(),
  },
  hints: WRITE,
  run: async (args, program) => {
    if (args.levels === undefined && args.expandFrom === undefined) {
      return fail('Give levels, expandFrom or both.');
    }
    return act(program, {
      type: 'set-component-appearance',
      component: args.component,
      appearanceTraits: {
        ...(args.levels === undefined ? {} : { levels: args.levels }),
        ...(args.expandFrom === undefined ? {} : { expandFrom: args.expandFrom }),
      },
    });
  },
});

/** Claude's tools for overlays and levels of detail, in the order Claude reads them. */
export const OVERLAY_TOOLS: readonly Tool[] = [getOverlays, setOverlays, setLevels];
