/**
 * Claude's tool for how a component or a relation type looks, built-in ones included (ADR-0034), or
 * one element or relation (ADR-0035), free geometry, named parts and route styles included (ADR 0066,
 * ADR 0067, ADR 0069); the inputs for a relation's own appearance; and what Claude's tools say about
 * the colors they store (ADR-0033): a color is #RRGGBB, which the core checks, and one that is hard
 * to see on the canvas of either theme is pointed out in the answer, never refused. Where the drawing
 * defaults adapt stored colors on the dark canvas (ADR 0087), the answers measure the dark canvas with
 * the colors it draws, and say which color it draws for each color stored.
 */
import {
  CANVAS_BACKGROUNDS,
  MINIMUM_MARK_CONTRAST,
  THEME_NAMES,
  contrastRatio,
  adaptedForDark,
  definitionsIn,
  drawingOf,
  drawnColorsOf,
  editableAppearanceOf,
  isColor,
  modelIndexOf,
  type ProjectSnapshot,
  storedColorInDark,
  type ShapeColors,
  type StoredColorsInDark,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { appearanceRead } from './geometry-brief';
import { WRITE, act, fail, id, tool } from './kit';
import type { Tool, ToolOutcome } from './tools';

const color = () => z.string().describe('A color written as #RRGGBB, such as "#2F855A".');

/** How opaque a shape or a line is drawn (ADR 0088); its text stays whole. */
const opacity = () =>
  z.number().min(0.2).max(1).describe('From 0.2 to 1; 1 unless set. Text stays whole.');

/** The style of a relation's automatic routes (ADR 0069). */
const routeStyle = () =>
  z
    .enum(['orthogonal', 'straight', 'curved'])
    .describe('The style of its automatic routes, before the view’s routeStyle.');

/** A relation's own appearance, or a relation type's, whole. */
export const relationAppearance = () =>
  z
    .object({
      stroke: color().optional(),
      width: z.number().positive().optional().describe('The line width, in canvas units.'),
      dash: z.enum(['solid', 'dashed', 'dotted']).optional(),
      route: routeStyle().optional(),
      opacity: opacity().optional(),
    })
    // Anything else goes to the core, which refuses it and says why.
    .catchall(z.unknown())
    .describe(
      'How the line looks: stroke, width, dash, route and opacity. What it leaves out is inherited.',
    );

/** Changes to a relation's own appearance, trait by trait: a value sets one, null inherits it again. */
export const relationAppearanceTraits = () =>
  z
    .object({
      stroke: color().nullable().optional(),
      width: z.number().positive().nullable().optional(),
      dash: z.enum(['solid', 'dashed', 'dotted']).nullable().optional(),
      route: routeStyle().nullable().optional(),
      opacity: opacity().nullable().optional(),
    })
    .catchall(z.unknown())
    .describe('Traits to set, or null to inherit again: stroke, width, dash, route, opacity.');

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

/**
 * How the project's drawing defaults draw its stored colors on the dark canvas (ADR 0087): those of
 * the view given, or the project's own. Claude's answers about colors measure the dark canvas with it.
 */
export function storedColorsInDarkOf(state: ProjectSnapshot, view?: Id): StoredColorsInDark {
  return drawingOf(state, view).colors.storedColorsInDark;
}

/**
 * The warnings for a stroke stored: one for each theme's canvas it is under 3:1 against, as each
 * draws it: on the dark canvas adapted, when the drawing defaults adapt stored colors there.
 */
export function strokeWarnings(
  subject: string,
  stroke: string | undefined,
  stored: StoredColorsInDark = 'as-stored',
): string[] {
  if (stroke === undefined) return [];
  return THEME_NAMES.flatMap((theme) => {
    const drawn = theme === 'dark' ? storedColorInDark(stroke, stored) : stroke;
    const ratio = contrastRatio(drawn, CANVAS_BACKGROUNDS[theme]);
    const as = drawn.toUpperCase() === stroke.toUpperCase() ? '' : `, drawn ${drawn} there,`;
    return ratio < MINIMUM_MARK_CONTRAST
      ? [
          `The stroke ${stroke} of ${subject}${as} is ${ratioText(ratio)}:1 against the ${theme} canvas, under 3:1.`,
        ]
      : [];
  });
}

/**
 * What the dark canvas draws for the colors a change stored, where the drawing defaults adapt stored
 * colors there and it draws another color (ADR 0087): one sentence for each, so that Claude does not
 * take the stored color for what the person sees in the dark theme. None when they are drawn as stored.
 */
export function darkCanvasNotes(
  subject: string,
  set: { fill?: string; stroke?: string },
  stored: StoredColorsInDark,
): string[] {
  if (stored !== 'adapted') return [];
  return (['fill', 'stroke'] as const).flatMap((trait) => {
    const color = set[trait];
    if (color === undefined) return [];
    const drawn = adaptedForDark(color);
    return drawn.toUpperCase() === color.toUpperCase()
      ? []
      : [
          `On the dark canvas the ${trait} ${color} of ${subject} is drawn ${drawn}: the drawing defaults adapt stored colors there (colors.storedColorsInDark). The color stored stays ${color}.`,
        ];
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
  const stored = storedColorsInDarkOf(state);
  return [
    ...strokeWarnings(subject, set.stroke, stored),
    ...blendWarnings(subject, (theme) => drawnColorsOf(found, definitions, theme, stored)),
    ...darkCanvasNotes(subject, set, stored),
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
  const stored = storedColorsInDarkOf(state);
  return [
    ...strokeWarnings(subject, stroke, stored),
    ...darkCanvasNotes(subject, { stroke }, stored),
  ];
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
  // A stored color is adapted on the dark canvas where the drawing defaults ask; a built-in one is not.
  const stored = storedColorsInDarkOf(state);
  return [
    ...strokeWarnings(named, set.stroke, stored),
    ...(kind === 'component'
      ? blendWarnings(named, (theme) =>
          drawnColorsOf({ component: target }, definitions, theme, stored),
        )
      : []),
    ...darkCanvasNotes(named, set, stored),
  ];
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The SVG path data of the heart in `set_appearance`'s examples, as ADR 0066 writes it. */
const HEART_PATH =
  'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z';

const setAppearance = tool({
  name: 'set_appearance',
  title: 'Set how something looks',
  description: `Changes how something is drawn, as one undoable action: every element of a component or every relation of a relation type, built-in ones included, or one element or one relation, whose own appearance is a particularity (as update_element and update_relation set it). For a definition of a built-in package, Essence or "relates-to", the project keeps an appearance of its own for it in its project file, which reaches everything derived from it that does not set the trait itself; for one of the project's own packages, its definition changes in its package.

Give appearanceTraits to change some traits and keep the others: a value sets a trait, null makes it inherited again. Or give appearance to replace the appearance at that level whole; null removes it.

Shapes' traits: shape (rectangle, rounded-rectangle, ellipse, cylinder or person), fill, stroke, width and height (canvas units), detail ({ componentName, attributes, badges, lines }, each part inherited on its own; lines, from 1 to 6, is how many lines it wraps to, 3 unless set), textPlacement (top, middle or bottom: where the block of the name and the detail sits in the shape; Essence sets middle), contentsAsRows, connectionPoints, image (from list_images), solid, geometry, part, levels and expandFrom (set_levels explains those). Lines' traits: stroke, width, dash (solid, dashed or dotted), route and opacity.

Style (the format panel's): borderWidth (0 to 16; 0 draws no border), dash (the border's), cornerRadius (0 to 64, rectangles), opacity (0.2 to 1, text whole), shadow (none or soft), gradient ({ to: "#RRGGBB", direction: "down" | "right" }, or "none"). Text: text { font (roboto, system or mono), size (8 to 48), bold, italic, underline, align (left, center, right), position (inside, above, below, left, right: a tag at that side), color, background, border, wrap, padding (0 to 48) }, each part inherited on its own (null inherits it again). Left unset, they come from the drawing defaults. A shape's turn and mirroring are the view's: set_positions takes rotation and flip.

- geometry: the shapes' own outline, drawn in place of their kind: { width, height, outline, keepProportions?, label? }. width and height are the box its coordinates are written in, from its top left; outline holds 1 to 64 contours, { "kind": "path", "d" } in SVG path data (M L H V C S Q T A Z), { "kind": "polygon", "points": "x,y x,y …" } or { "kind": "ellipse", cx, cy, rx, ry }. A contour inside another is a hole. label is where the name goes, in the box. At most 2,000 segments and 32 KiB of path data. "none" takes an inherited one away.
- solid: { solid, placement, camera, lighting }, from list_solids: placement icon, drawing or parts; lighting studio or flat. "none" takes it away.
- part: { part, image } or { part, solid }, the named part they are drawn as; image or solid may be left out inside a drawing with parts. "none" takes it away. A part the picture lacks warns unknown-part. list_image_parts and list_solid_parts list parts; anchor_parts anchors a drawing's.
- route: the style of automatic routes, orthogonal, straight or curved. It comes before a view's routeStyle (update_view).

Colors are #RRGGBB, stored as given. A line needs 3:1 against both canvases: the answer warns about a color under it, and about shapes that blend into a canvas, and never refuses one.

Example: { "component": "systems.service", "appearanceTraits": { "fill": "#E3F2E9", "stroke": "#2F855A" } }
Example, a heart: { "component": "anatomy.heart", "appearanceTraits": { "geometry": { "width": 120, "height": 110, "keepProportions": true, "outline": [{ "kind": "path", "d": "${HEART_PATH}" }], "label": { "x": 24, "y": 30, "width": 72, "height": 36 } } } }
Example, a triangle: { "element": "warning", "appearanceTraits": { "geometry": { "width": 100, "height": 90, "outline": [{ "kind": "polygon", "points": "50,0 100,90 0,90" }] } } }
Example, a ring with a hole: { "component": "physics.ring", "appearanceTraits": { "geometry": { "width": 100, "height": 100, "outline": [{ "kind": "path", "d": "M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 20 A30 30 0 1 1 50 80 A30 30 0 1 1 50 20 Z" }] } } }
Example, a part of an atlas: { "element": "left-lung", "appearanceTraits": { "part": { "part": "lung-left", "image": "anatomy.body-atlas" } } }
Example: { "element": "arm", "appearanceTraits": { "solid": { "solid": "robot.arm-k3f9" } } }
Example: { "relationType": "neuro.nerve", "appearanceTraits": { "route": "curved", "dash": "dashed" } }
Example: { "element": "billing", "appearanceTraits": { "borderWidth": 3, "shadow": "soft", "gradient": { "to": "#3E63DD", "direction": "right" }, "text": { "bold": true, "size": 16, "position": "below" } } }
Example: { "component": "systems.service", "appearance": null }`,
  input: {
    component: id().optional().describe('The component, as list_definitions gives it.'),
    relationType: id().optional().describe('Or the relation type.'),
    element: id().optional().describe('Or one element, World included: its own appearance.'),
    relation: id().optional().describe('Or one relation: its own appearance.'),
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
    const { component, relationType, element, relation, appearance, appearanceTraits } = args;
    const targets = [component, relationType, element, relation].filter(
      (each) => each !== undefined,
    );
    if (targets.length !== 1) {
      return fail('Give one of component, relationType, element or relation.');
    }
    const changes = {
      ...(appearance === undefined ? {} : { appearance: appearance as never }),
      ...(appearanceTraits === undefined ? {} : { appearanceTraits: appearanceTraits as never }),
    };
    const set = colorsSet(appearance, appearanceTraits);
    /**
     * The answer of a change that was done: where the appearance is kept, and the warnings on its
     * colors; the core's answer carries the rest, `large-geometry` among them.
     */
    const answered = (
      kept: { keptIn: string; appearance: object } | undefined,
      warnings: readonly string[],
    ) => ({
      ...(kept === undefined
        ? {}
        : { keptIn: kept.keptIn, appearance: appearanceRead(kept.appearance) }),
      ...(warnings.length > 0 ? { warnings } : {}),
    });

    if (element !== undefined || relation !== undefined) {
      const target = (element ?? relation) as Id;
      const outcome = await act(
        program,
        element !== undefined
          ? { type: 'update-element', id: target, changes }
          : { type: 'update-relation', id: target, changes },
        async () => {
          const state = await program.project();
          const index = modelIndexOf(state);
          const own = (element !== undefined ? index.element(target) : index.relation(target))
            ?.appearance;
          return answered(
            {
              keptIn: `the ${element !== undefined ? 'element' : 'relation'} itself, as a particularity of its own`,
              appearance: own ?? {},
            },
            element !== undefined
              ? elementColorWarnings(state, target, set)
              : relationColorWarnings(state, target, set.stroke),
          );
        },
      );
      return withRefusalHints(outcome);
    }

    const kind = component === undefined ? 'relation-type' : 'component';
    const target = (component ?? relationType) as Id;
    const outcome = await act(
      program,
      component === undefined
        ? { type: 'set-relation-type-appearance', relationType: target, ...changes }
        : { type: 'set-component-appearance', component: target, ...changes },
      async () => {
        const state = await program.project();
        const kept = editableAppearanceOf(state, kind, target);
        return answered(
          kept === undefined
            ? undefined
            : {
                keptIn:
                  kept.level === 'project'
                    ? 'the project file, as an appearance of the project’s own for a definition it cannot change'
                    : `the package "${kept.package}", in the definition itself`,
                appearance: kept.appearance ?? {},
              },
          definitionColorWarnings(state, kind, target, set),
        );
      },
    );
    return withRefusalHints(outcome);
  },
});

/**
 * What to do about the core's refusals of free geometry and parts, after its own words, so that
 * Claude can give something it takes.
 */
const REFUSAL_HINTS: Readonly<Record<string, string>> = {
  'invalid-geometry':
    'Free geometry is { width, height, outline }, its outline 1 to 64 contours of SVG path data (M L H V C S Q T A Z), polygon points or ellipses that stay inside the box.',
  'geometry-too-large':
    'Free geometry holds at most 64 contours, 2,000 segments and 32 KiB of path data and points: simplify the outline.',
  'unknown-image':
    'list_images lists the images a part can name, by id, and list_image_parts their parts.',
};

/** A refusal with what to do about the codes it names, from {@link REFUSAL_HINTS}. */
function withRefusalHints(outcome: ToolOutcome): ToolOutcome {
  if (outcome.ok) return outcome;
  const codes = /\(([^()]*)\)$/.exec(outcome.message)?.[1]?.split(', ') ?? [];
  const hints = codes.flatMap((code) => REFUSAL_HINTS[code] ?? []);
  return hints.length === 0 ? outcome : fail(`${outcome.message} ${hints.join(' ')}`);
}

/** Claude's tools for the look of definitions, in the order Claude reads them. */
export const APPEARANCE_TOOLS: readonly Tool[] = [setAppearance];
