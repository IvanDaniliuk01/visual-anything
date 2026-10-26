/**
 * Claude's tool for how a component or a relation type looks, built-in ones included (ADR-0034), the
 * inputs for a relation's own appearance (ADR-0035), and what Claude's tools say about the colors
 * they store (ADR-0033): a color is #RRGGBB, which the core checks, and one that is hard to see on
 * the canvas of either theme is pointed out in the answer, never refused.
 */
import {
  CANVAS_BACKGROUNDS,
  MINIMUM_MARK_CONTRAST,
  THEME_NAMES,
  contrastRatio,
  definitionsIn,
  drawnColorsOf,
  editableAppearanceOf,
  isColor,
  modelIndexOf,
  type ProjectSnapshot,
  type ShapeColors,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { WRITE, act, fail, id, tool } from './kit';
import type { Tool } from './tools';

const color = () => z.string().describe('A color written as #RRGGBB, such as "#2F855A".');

/** A relation's own appearance, or a relation type's, whole. */
export const relationAppearance = () =>
  z
    .object({
      stroke: color().optional(),
      width: z.number().positive().optional().describe('The line width, in canvas units.'),
      dash: z.enum(['solid', 'dashed', 'dotted']).optional(),
    })
    // Anything else goes to the core, which refuses it and says why.
    .catchall(z.unknown())
    .describe('How the line looks: stroke, width and dash. What it leaves out is inherited.');

/** Changes to a relation's own appearance, trait by trait: a value sets one, null inherits it again. */
export const relationAppearanceTraits = () =>
  z
    .object({
      stroke: color().nullable().optional(),
      width: z.number().positive().nullable().optional(),
      dash: z.enum(['solid', 'dashed', 'dotted']).nullable().optional(),
    })
    .catchall(z.unknown())
    .describe('Traits to set, or null to inherit again: stroke, width, dash.');

/** The fill and the stroke a change of appearance stores, as colors; what it does not set is absent. */
export function colorsSet(...changes: readonly unknown[]): { fill?: string; stroke?: string } {
  const set: { fill?: string; stroke?: string } = {};
  for (const change of changes) {
    if (typeof change !== 'object' || change === null) continue;
    const { fill, stroke } = change as { fill?: unknown; stroke?: unknown };
    if (isColor(fill)) set.fill = fill.toUpperCase();
    if (isColor(stroke)) set.stroke = stroke.toUpperCase();
  }
  return set;
}

/** A contrast ratio as the core's legend writes it: cut to one decimal, so it never reads as enough. */
function ratioText(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

/** The warnings for a stroke stored: one for each theme's canvas it is under 3:1 against. */
export function strokeWarnings(subject: string, stroke: string | undefined): string[] {
  if (stroke === undefined) return [];
  return THEME_NAMES.flatMap((theme) => {
    const ratio = contrastRatio(stroke, CANVAS_BACKGROUNDS[theme]);
    return ratio < MINIMUM_MARK_CONTRAST
      ? [
          `The stroke ${stroke} of ${subject} is ${ratioText(ratio)}:1 against the ${theme} canvas, under 3:1.`,
        ]
      : [];
  });
}

/**
 * The warnings for a shape that blends into a theme's canvas: one for each canvas that neither the
 * fill nor the stroke it is drawn in there reaches 3:1 against. Its name and detail always read,
 * since the canvas writes them in black or white, whichever reads on the fill.
 */
export function blendWarnings(subject: string, drawn: (theme: ThemeName) => ShapeColors): string[] {
  return THEME_NAMES.flatMap((theme) => {
    const { fill, stroke } = drawn(theme);
    const canvas = CANVAS_BACKGROUNDS[theme];
    const fillRatio = contrastRatio(fill, canvas);
    const strokeRatio = contrastRatio(stroke, canvas);
    if (fillRatio >= MINIMUM_MARK_CONTRAST || strokeRatio >= MINIMUM_MARK_CONTRAST) return [];
    return [
      `${capitalized(subject)} blends into the ${theme} canvas: its fill ${fill} and its stroke ${stroke} are ${ratioText(fillRatio)}:1 and ${ratioText(strokeRatio)}:1 against it, under 3:1.`,
    ];
  });
}

/**
 * What to say about the colors a change gave an element, as the project draws it now: a stroke under
 * 3:1 on a canvas, and a shape that blends into one.
 */
export function elementColorWarnings(
  state: ProjectSnapshot,
  element: Id,
  set: { fill?: string; stroke?: string },
): string[] {
  if (set.fill === undefined && set.stroke === undefined) return [];
  const found = modelIndexOf(state).element(element);
  if (found === undefined) return [];
  const subject = `"${found.name}"`;
  const definitions = definitionsIn(state);
  return [
    ...strokeWarnings(subject, set.stroke),
    ...blendWarnings(subject, (theme) => drawnColorsOf(found, definitions, theme)),
  ];
}

/** What to say about the stroke a change gave a relation. */
export function relationColorWarnings(
  state: ProjectSnapshot,
  relation: Id,
  stroke: string | undefined,
): string[] {
  if (stroke === undefined) return [];
  const index = modelIndexOf(state);
  const found = index.relation(relation);
  if (found === undefined) return [];
  const end = (end: Id) => index.element(end)?.name ?? index.relation(end)?.name ?? end;
  const subject = `the relation "${found.name ?? `${end(found.from)} → ${end(found.to)}`}"`;
  return strokeWarnings(subject, stroke);
}

/**
 * What to say about the colors a change gave a component or a relation type, as the project draws
 * it now: a stroke under 3:1 on a canvas, and, for a component, shapes that blend into one. The same
 * for `set_appearance`, `define_component`, `update_component` and the relation types' tools.
 */
export function definitionColorWarnings(
  state: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  target: Id,
  set: { fill?: string; stroke?: string },
): string[] {
  if (set.fill === undefined && set.stroke === undefined) return [];
  const definitions = definitionsIn(state);
  const named =
    kind === 'component'
      ? `the component "${definitions.component(target)?.name ?? target}"`
      : `the relation type "${definitions.relationType(target)?.name ?? target}"`;
  return [
    ...strokeWarnings(named, set.stroke),
    ...(kind === 'component'
      ? blendWarnings(named, (theme) => drawnColorsOf({ component: target }, definitions, theme))
      : []),
  ];
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const setAppearance = tool({
  name: 'set_appearance',
  title: 'Set how a component or a relation type looks',
  description: `Changes how every element of a component, or every relation of a relation type, is drawn, as one undoable action, built-in ones included. For a component or relation type of a built-in package, Essence or "relates-to", the project keeps an appearance of its own for it in its project file, which reaches everything derived from it that does not set the trait itself; for one of the project's own packages, its definition changes in its package. Elements and relations with an appearance of their own keep it: update_element and update_relation change those.

Give appearanceTraits to change some traits and keep the others: a value sets a trait, null makes it inherited again. Or give appearance to replace the appearance at that level whole; null removes it, so that the look it inherits comes back.

A component's traits: shape (rectangle, rounded-rectangle, ellipse, cylinder or person), fill and stroke, width and height (canvas units), detail, contentsAsRows, connectionPoints, image (from list_images), levels and expandFrom (set_levels explains those). A relation type's traits: stroke, width and dash (solid, dashed or dotted).

Colors are #RRGGBB and are drawn as stored in the light and the dark theme alike; a built-in color follows the theme until something sets it. A line needs 3:1 against both canvases: the answer warns about a color under it, and about shapes that blend into a canvas, and never refuses one.

Example: { "component": "systems.service", "appearanceTraits": { "fill": "#E3F2E9", "stroke": "#2F855A" } }
Example: { "relationType": "systems.writes-to", "appearanceTraits": { "stroke": "#C05621", "dash": "dashed" } }
Example: { "component": "systems.service", "appearance": null }`,
  input: {
    component: id().optional().describe('The component, as list_definitions gives it.'),
    relationType: id().optional().describe('Or the relation type.'),
    appearance: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe('The appearance at that level, replaced whole; null removes it.'),
    appearanceTraits: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Traits to set, or null to inherit again.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const { component, relationType, appearance, appearanceTraits } = args;
    if ((component === undefined) === (relationType === undefined)) {
      return fail('Give either a component or a relation type.');
    }
    const changes = {
      ...(appearance === undefined ? {} : { appearance: appearance as never }),
      ...(appearanceTraits === undefined ? {} : { appearanceTraits: appearanceTraits as never }),
    };
    const kind = component === undefined ? 'relation-type' : 'component';
    const target = (component ?? relationType) as Id;
    const set = colorsSet(appearance, appearanceTraits);
    return act(
      program,
      component === undefined
        ? { type: 'set-relation-type-appearance', relationType: target, ...changes }
        : { type: 'set-component-appearance', component: target, ...changes },
      async () => {
        const state = await program.project();
        const kept = editableAppearanceOf(state, kind, target);
        const warnings = definitionColorWarnings(state, kind, target, set);
        return {
          ...(kept === undefined
            ? {}
            : {
                keptIn:
                  kept.level === 'project'
                    ? 'the project file, as an appearance of the project’s own for a definition it cannot change'
                    : `the package "${kept.package}", in the definition itself`,
                appearance: kept.appearance ?? {},
              }),
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      },
    );
  },
});

/** Claude's tools for the look of definitions, in the order Claude reads them. */
export const APPEARANCE_TOOLS: readonly Tool[] = [setAppearance];
