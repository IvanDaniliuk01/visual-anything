/**
 * Claude's tools for faces (ADR 0083): `set_face` sets a component's face, or one element's, part by
 * part or one variant at a time, as one undoable action, and the core refuses a bad one at its line
 * and column; `preview_face` lays a face out on an element of the model, the face it has or one to
 * try, and answers its text as laid out, its size and its problems, changing nothing.
 */
import {
  FACE_CONTENT_MOST_WIDTH,
  appearanceOf,
  appearanceOriginsOf,
  compileFace,
  componentOrEssence,
  definitionsIn,
  drawnColorsOf,
  editableAppearanceOf,
  faceContentWidth,
  faceDrawingText,
  faceInputOf,
  faceMessage,
  facePalette,
  faceProblems,
  layOutFace,
  modelIndexOf,
  resolveAppearance,
  shapesInView,
  type AppearanceChanges,
  type Command,
  type Definitions,
  type FaceDrawing,
  type FaceProblem,
  type ProjectSnapshot,
  type ResolvedAppearance,
  type ResolvedFace,
  type StoredColorsInDark,
  type TraitOrigin,
} from '@visual-anything/core';
import type { Element, FaceVariant, Id, ViewFile } from '@visual-anything/schema';
import { z } from 'zod';
import { storedColorsInDarkOf } from './appearance-tools';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool, ToolOutcome } from './tools';

/** How tall the canvas draws a row, as `app/src/canvas/rows.ts` does: a column's face is laid out in it. */
export const ROW_BAND = 24;

/** The room the canvas keeps under the last row (`ROWS_FOOT`). */
const ROWS_FOOT = 4;

/** Lines of markup or style: a list, a line each, or one text whose line breaks part its lines. */
const lines = () =>
  z
    .union([z.array(z.string()), z.string()])
    .describe('A list of lines, or one text whose line breaks part it into lines.');

/** A face's parts, each to set; null takes one away, so that it is inherited again. */
const faceParts = () =>
  z
    .object({
      size: z
        .enum(['content', 'shape'])
        .nullable()
        .optional()
        .describe(
          '"content": the shape is as tall as the face; "shape" (the default): the face is laid out in the shape and cut where it overflows.',
        ),
      markup: lines().nullable().optional().describe('The markup, in the subset of XHTML.'),
      style: lines().nullable().optional().describe('The style rules, in the subset of CSS.'),
      variants: z
        .array(z.object({ id: z.string(), markup: lines() }))
        .nullable()
        .optional()
        .describe('Other markups, at most 8, each with an id, sharing the style.'),
      collapsed: z
        .string()
        .nullable()
        .optional()
        .describe('The id of the variant a collapsed container shows.'),
    })
    // Anything else goes to the core, which refuses it and says why.
    .catchall(z.unknown());

/** The face's parts as the core takes them: lines split at their line breaks. */
function partsOf(given: Record<string, unknown>): Record<string, unknown> {
  const split = (value: unknown): unknown =>
    typeof value === 'string'
      ? value.split(/\r?\n/)
      : Array.isArray(value)
        ? (value as unknown[]).flatMap((each) =>
            typeof each === 'string' ? each.split(/\r?\n/) : [each],
          )
        : value;
  const parts: Record<string, unknown> = { ...given };
  for (const key of ['markup', 'style'] as const) {
    if (parts[key] !== undefined && parts[key] !== null) parts[key] = split(parts[key]);
  }
  if (Array.isArray(parts.variants)) {
    parts.variants = parts.variants.map((variant: unknown) =>
      typeof variant === 'object' && variant !== null && 'markup' in variant
        ? { ...variant, markup: split(variant.markup) }
        : variant,
    );
  }
  return parts;
}

/** What a face is set on, or previewed for. */
type Target =
  | { kind: 'component'; id: Id; name: string }
  | { kind: 'element'; id: Id; name: string; element: Element };

function targetOf(
  state: ProjectSnapshot,
  component: Id | undefined,
  element: Id | undefined,
): Target | string {
  if ((component === undefined) === (element === undefined)) {
    return 'Give one of component or element.';
  }
  const definitions = definitionsIn(state);
  if (element !== undefined) {
    const found = modelIndexOf(state).element(element);
    if (found === undefined) return `There is no element "${element}".`;
    return { kind: 'element', id: element, name: found.name, element: found };
  }
  const found = definitions.component(component as Id);
  if (found === undefined) {
    return `There is no component "${component}": list_definitions lists them.`;
  }
  return { kind: 'component', id: found.id, name: found.name };
}

function subjectOf(target: Target): string {
  return `the ${target.kind} "${target.name}"`;
}

/** How a target's shapes are drawn: the element's own appearance over its component's. */
function appearanceFor(target: Target, definitions: Definitions): ResolvedAppearance {
  return target.kind === 'element'
    ? appearanceOf(target.element, definitions)
    : componentOrEssence(definitions, target.id).appearance;
}

/** The attributes a face for a target can name: its component's, and an element's own. */
function attributesFor(target: Target, definitions: Definitions): Set<string> {
  const component = componentOrEssence(
    definitions,
    target.kind === 'element' ? target.element.component : target.id,
  );
  const names = new Set(component.attributes.map((each) => each.name));
  if (target.kind === 'element') {
    for (const name of Object.keys(target.element.attributes ?? {})) names.add(name);
  }
  return names;
}

/**
 * Every problem of a face for a target, in both themes, errors first: on the dark canvas with the
 * shape's stored colors adapted where the drawing defaults ask for it (`stored`, ADR 0087).
 */
function problemsFor(
  face: ResolvedFace,
  target: Target,
  definitions: Definitions,
  stored: StoredColorsInDark,
): readonly FaceProblem[] {
  const drawn = target.kind === 'element' ? target.element : { component: target.id };
  const palette = (theme: 'light' | 'dark') => {
    const colors = drawnColorsOf(drawn, definitions, theme, stored);
    return facePalette(theme, colors.fill, colors.stroke);
  };
  return faceProblems(face, {
    attributes: attributesFor(target, definitions),
    palettes: { light: palette('light'), dark: palette('dark') },
  });
}

/** A problem as the tools answer it: its severity, its code, and where it is with what is wrong. */
function problemAnswer(found: FaceProblem) {
  return { severity: found.severity, code: found.code, message: faceMessage(found) };
}

/** Where each part of a face comes from, in words. */
function originsFor(
  target: Target,
  definitions: Definitions,
): Record<'size' | 'markup' | 'style' | 'variants' | 'collapsed', string> {
  const origins =
    target.kind === 'element'
      ? appearanceOriginsOf(target.element, definitions)
      : componentOrEssence(definitions, target.id).origins;
  const said = (origin: TraitOrigin) => {
    if (origin.kind === 'own') return 'the element itself';
    const name = componentOrEssence(definitions, origin.id).name;
    return origin.via === 'project'
      ? `the component "${name}", in the project file`
      : `the component "${name}"`;
  };
  return {
    size: said(origins['face.size']),
    markup: said(origins['face.markup']),
    style: said(origins['face.style']),
    variants: said(origins['face.variants']),
    collapsed: said(origins['face.collapsed']),
  };
}

/**
 * The variants a target's face has after one is set or taken away: the variants it shows now, with
 * that one replaced, added at the end, or left out.
 */
function variantsWith(
  shown: readonly FaceVariant[],
  variant: { id: string; markup: unknown },
): unknown[] {
  const others = shown.filter((each) => each.id !== variant.id);
  if (variant.markup === null) return others;
  const markup = (partsOf({ markup: variant.markup }) as { markup: unknown }).markup;
  const at = shown.findIndex((each) => each.id === variant.id);
  const next: unknown[] = [...others];
  next.splice(at === -1 ? next.length : at, 0, { id: variant.id, markup });
  return next;
}

/** The examples the face tools give, as faces of Data modeling's Table and Column write them. */
const TABLE_EXAMPLE = {
  markup: [
    '<header>',
    '  <b>{{name}}</b>',
    '  <small if="schema">{{schema}}</small>',
    '</header>',
    '<rows/>',
  ],
  style: [
    'header { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 30px 0 12px; }',
    'b { flex: 1; font-size: 14px; line-clamp: 1; }',
    'small { font-size: 11px; color: var(--text-muted); }',
  ],
};

/** The subset, as both tools say it. */
const SUBSET = `A face lays out what a component's shapes show inside their body, in a subset of HTML and CSS that Visual Anything reads, lays out and draws itself: nothing in it runs and nothing is fetched.
- Markup is strict XHTML, every element closed (<br/>), attributes quoted. Boxes: div, span, p, header, footer, section, ul, ol, li. Text: b, strong, i, em, u, s, code, small, mark, sub, sup, br, hr. The face's own: <rows/> (a table's rows, last at the top level), <contents/> (an expanded container's body, last at the top level), <detail/>, <badges/> (the detail's badges, PK and FK for a column), <icon/>, <image ref="id"/>, <drawing/>, and <each of="attributes">{{key}}: {{value}}</each> (also of="a list attribute" with {{item}}, only="a b" and except="a b"). Attributes: class, style, if and else only.
- Slots, in text and class: {{name}}, {{component}}, {{count}}, an attribute by its name {{type}} or {{attr "Fecha de alta"}}, {{x ?? "—"}} for text when it has no value, {{x | plain}}. A slot writes text, never markup; it takes emphasis only for an attribute whose definition has "format": "emphasis", whose values from outside material are written with escapeText: true by the tool that sets them (add_to_model, update_element), so that their markers stay characters; {{x | plain}} draws one without emphasis. In class, a value is reduced to [a-z0-9-], so class="status-{{status}}" picks a rule by value.
- Conditions in if: an attribute that has a value; not x; x = 'live', x != 'live', x in 'a' 'b', and <, <=, >, >= for numbers. else on the next sibling shows when the if before it does not.
- Style: selectors by element, class, both (b.far), descendants (.head b) and the face's own box (face { … }). Layout: display (block, flex, grid, none), flex-direction, flex-wrap, flex, gap, align-items, justify-content, grid-template-columns (px, fr, auto), width, height and their min- and max-, padding, margin, position: absolute. Box: background, border, border-radius, overflow: hidden. Text: color, font-size (8 to 32 px), font-weight, font-style, font-family (sans or mono), line-height, text-align, text-decoration, text-transform, white-space, line-clamp.
- Colors are #RRGGBB or the theme's tokens, which follow the light and dark themes: var(--fill), var(--stroke), var(--text), var(--text-muted), var(--highlight), var(--code-back), var(--row-separator), var(--canvas). Prefer the tokens; a box with a background color of its own sets its text's color too. Text under 4.5:1 on what it is drawn on, in either theme, is warned about.
- Caps: 200 lines and 16 KiB of markup, variants included; 128 rules and 16 KiB of style; 8 variants; 256 boxes and 256 runs of text once laid out.
- Variants are other markups sharing the style: a level of detail names one (set_levels, its "face"), and collapsed names the one a collapsed container shows.`;

const setFace = tool({
  name: 'set_face',
  title: 'Set a face',
  description: `Sets the face of a component, built-in ones included, or of one element, whose own face is a particularity over its component's, as one undoable action. Give face to set some of its parts and keep the others: size, markup, style, variants and collapsed, each inherited on its own, null to inherit one again; "none" takes an inherited face away; null takes every part this level sets out. Or give variant to set or take away one variant, keeping the others. A face is checked whole before it is set: a markup or style outside the subset, or past the caps, is refused at its line and column, and nothing changes. Unknown attributes and poor contrast only warn.

${SUBSET}

Check a face with preview_face on a real element before or after setting it, and see it drawn with capture_view on that element. A component's shapes draw its face from the scale the canvas writes names at; set_levels can show it from other zooms or show a variant far out.

Example: { "component": "data-modeling.table", "face": ${JSON.stringify(TABLE_EXAMPLE)} }
Example, a card as tall as what it says: { "component": "systems.service", "face": { "size": "content", "markup": "<b>{{name}}</b>\\n<p if=\\"owner\\">Owned by {{owner}}</p>\\n<p class=\\"state-{{status}}\\" if=\\"status\\">{{status}}</p>", "style": "face { padding: 8px; gap: 4px; }\\np { color: var(--text-muted); }\\n.state-down { color: #B42318; }" } }
Example, every attribute an element has: { "element": "api", "face": { "markup": ["<b>{{name}}</b>", "<ul><each of=\\"attributes\\"><li>{{key}}: {{value}}</li></each></ul>"] } }
Example, a variant for far zoom: { "component": "data-modeling.table", "variant": { "id": "far", "markup": "<b>{{name}}</b>" } }
Example, back to the component's face: { "element": "api", "face": null }`,
  input: {
    component: id().optional().describe('The component, as list_definitions gives it.'),
    element: id().optional().describe('Or one element: its own face.'),
    face: z
      .union([z.literal('none'), faceParts()])
      .nullable()
      .optional()
      .describe('The parts to set, null each to inherit; "none"; or null for all of them.'),
    variant: z
      .object({
        id: z.string().describe('The variant’s id: lowercase letters, digits and "-".'),
        markup: lines().nullable().describe('Its markup; null takes the variant away.'),
      })
      .optional()
      .describe('One variant to set or take away, keeping the others.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const target = targetOf(state, args.component, args.element);
    if (typeof target === 'string') return fail(target);
    if ((args.face === undefined) === (args.variant === undefined)) {
      return fail('Give face, to set its parts, or variant, to set one variant.');
    }
    const definitions = definitionsIn(state);
    let face: AppearanceChanges['face'];
    if (args.variant !== undefined) {
      const shown = appearanceFor(target, definitions).face?.variants ?? [];
      face = { variants: variantsWith(shown, args.variant) as FaceVariant[] };
    } else if (args.face === undefined || args.face === null || args.face === 'none') {
      face = args.face ?? null;
    } else {
      face = partsOf(args.face);
    }
    const command: Command =
      target.kind === 'element'
        ? { type: 'update-element', id: target.id, changes: { appearanceTraits: { face } } }
        : { type: 'set-component-appearance', component: target.id, appearanceTraits: { face } };
    const outcome = await act(program, command, async () => {
      const after = await program.project();
      const now = definitionsIn(after);
      const current = targetOf(
        after,
        target.kind === 'component' ? target.id : undefined,
        target.kind === 'element' ? target.id : undefined,
      );
      if (typeof current === 'string') return {};
      const shown = appearanceFor(current, now).face;
      const keptIn =
        current.kind === 'element'
          ? 'the element itself, as a particularity of its own'
          : editableAppearanceOf(after, 'component', current.id)?.level === 'project'
            ? 'the project file, as an appearance of the project’s own for a definition it cannot change'
            : 'the component’s package, in the definition itself';
      if (shown === undefined) {
        return { keptIn, face: `${capitalized(subjectOf(current))} draws no face.` };
      }
      const warnings = problemsFor(shown, current, now, storedColorsInDarkOf(after)).map(
        (each) => `${capitalized(faceMessage(each))}`,
      );
      return {
        keptIn,
        from: originsFor(current, now),
        next: `preview_face { "${current.kind}": "${current.id}" } answers what it lays out; capture_view shows it drawn.`,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    });
    return withFaceHint(outcome);
  },
});

/** A refusal of a face, with where to check one without changing anything. */
function withFaceHint(outcome: ToolOutcome): ToolOutcome {
  if (outcome.ok || !/\((?:[^()]*, )?(?:invalid-face|face-too-large)/.test(outcome.message)) {
    return outcome;
  }
  return fail(
    `${outcome.message} preview_face, given the same face, lists every problem at its line and column without changing anything.`,
  );
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The element a component's face is previewed on: the first of the model made from it. */
function sampleOf(state: ProjectSnapshot, component: Id): Element | undefined {
  return state.model.elements.find((each) => each.component === component);
}

/**
 * Where a face is laid out for an element: as a row, the width of the container that draws it and a
 * row's height; otherwise its shape's width and, for a face of size `shape`, its height. With a view,
 * the size it stores for the element's shape, as the canvas takes it. `ownShape` says that the
 * canvas gives the shape the width its face of size `content` is not cut at (#15): a shape that holds
 * nothing, in the view or else in the model, with no free geometry and no width stored.
 */
function sizeFor(
  state: ProjectSnapshot,
  definitions: Definitions,
  element: Element | undefined,
  appearance: ResolvedAppearance,
  face: ResolvedFace,
  view?: ViewFile,
): { width: number; height?: number; asRow: boolean; ownShape?: boolean } {
  if (element !== undefined) {
    const index = modelIndexOf(state);
    for (const container of index.containersOf(element.id)) {
      const holder = index.element(container);
      if (holder === undefined) continue;
      const shown = appearanceOf(holder, definitions);
      if (shown.contentsAsRows) return { width: shown.width, height: ROW_BAND, asRow: true };
    }
  }
  const stored =
    view && element
      ? view.positions.find((each) => each.element === element.id && each.width !== undefined)
      : undefined;
  const width = inShape(appearance, stored?.width ?? appearance.width);
  const regions = face.markup.some((line) => /<(rows|contents)\s*\/>/.test(line));
  if (face.size === 'content' || regions || appearance.contentsAsRows) {
    // A shape of its own, which holds nothing, takes the width its face is not cut at (#15).
    const holds =
      element !== undefined &&
      (view
        ? shapesInView(state, view).contentsOf(element.id).length > 0
        : modelIndexOf(state).contentsOf(element.id).length > 0);
    const ownShape =
      face.size === 'content' &&
      !regions &&
      !appearance.contentsAsRows &&
      !holds &&
      appearance.geometry === undefined &&
      stored === undefined;
    return { width, asRow: false, ...(ownShape ? { ownShape } : {}) };
  }
  return { width, height: stored?.height ?? appearance.height, asRow: false };
}

/** The width a face is laid out at in a shape of this appearance and width: in an ellipse, 0.7 of it. */
function inShape(appearance: ResolvedAppearance, width: number): number {
  return appearance.shape === 'ellipse' ? width * 0.7 : width;
}

/** The lines of a face drawing as laid out, top to bottom: each the runs side by side at its height. */
export function linesOf(drawing: FaceDrawing): string[] {
  const runs = [...drawing.runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: { y: number; runs: typeof runs }[] = [];
  for (const run of runs) {
    const group = groups.find((each) => Math.abs(each.y - run.y) <= run.size / 2);
    if (group === undefined) groups.push({ y: run.y, runs: [run] });
    else group.runs.push(run);
  }
  return groups.map((group) => {
    const sorted = group.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let end: number | undefined;
    for (const run of sorted) {
      const apart = end !== undefined && run.x - end > 1;
      text += `${apart && !text.endsWith(' ') && !run.text.startsWith(' ') ? '  ' : ''}${run.text}`;
      end = run.x + run.width;
    }
    return text.trim();
  });
}

const previewFace = tool({
  name: 'preview_face',
  title: 'Preview a face',
  description: `Lays out a face as the canvas would draw it, and changes nothing: the face a component or an element has, or one you give to try before set_face sets it. It is filled from an element of the model: the one you name, or the first made from the component; a column held by a table is laid out on its row, as wide as the table and ${ROW_BAND} units tall. It answers the face's text as laid out (lines, top to bottom, the runs of one line side by side), its text in reading order, its width and height, whether something was cut, and every problem with its line and column: errors, which set_face would refuse, then warnings about unknown attributes and contrast in both themes. Stored values fill it; values package code computes are missing here.

To see it drawn, call capture_view with the element's id as its region, on a view the open app shows; it draws the face the project has, not one you try here.

${SUBSET}

Example: { "component": "data-modeling.table" }
Example: { "element": "orders", "variant": "far" }
Example, a face to try: { "element": "customer-id", "face": { "markup": "<p><code>{{name}}</code> <i>{{type}}</i> <badges/></p>" } }
Example, collapsed: { "element": "billing", "collapsed": true }`,
  input: {
    component: id().optional().describe('The component whose face to lay out.'),
    element: id().optional().describe('Or the element to fill it from, with its own face.'),
    face: z
      .union([z.literal('none'), faceParts()])
      .optional()
      .describe('A face to try, its parts over the face it has now; nothing is saved.'),
    variant: z.string().optional().describe('A variant to lay out in place of the markup.'),
    collapsed: z
      .boolean()
      .optional()
      .describe(
        'As a collapsed container: its collapsed variant, or the markup without its contents.',
      ),
    width: z
      .number()
      .positive()
      .max(4096)
      .optional()
      .describe('In canvas units; its shape’s by default.'),
    height: z
      .number()
      .positive()
      .max(4096)
      .optional()
      .describe('In canvas units; for a face of size "shape", its shape’s by default.'),
    view: id()
      .optional()
      .describe(
        'A view to lay it out as its canvas does: with the size the view stores for the element’s shape, and what the view nests in it.',
      ),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const target = targetOf(state, args.component, args.element);
    if (typeof target === 'string') return fail(target);
    const definitions = definitionsIn(state);
    const element = target.kind === 'element' ? target.element : sampleOf(state, target.id);
    const appearance = appearanceFor(target, definitions);
    let face = appearance.face;
    if (args.face !== undefined) {
      face =
        args.face === 'none'
          ? undefined
          : resolveAppearance([{ face: partsOf(args.face) as never }], appearance).face;
    }
    const subject = capitalized(subjectOf(target));
    if (face === undefined) {
      return fail(
        `${subject} draws no face${args.face === undefined ? '' : ' with these parts'}: give face a markup to try one, and set_face to set it.`,
      );
    }
    const problems = problemsFor(face, target, definitions, storedColorsInDarkOf(state));
    const errors = problems.filter((each) => each.severity === 'error');
    const answer: Record<string, unknown> = {
      of: subject,
      ...(args.face === undefined ? { from: originsFor(target, definitions) } : { tried: true }),
    };
    if (errors.length > 0) {
      return ok({
        ...answer,
        laidOut: false,
        note: 'The face has errors, so it is not laid out, and set_face would refuse it.',
        problems: problems.map(problemAnswer),
      });
    }
    const view =
      args.view === undefined ? undefined : state.views.find((each) => each.id === args.view);
    if (args.view !== undefined && view === undefined) {
      return fail(`There is no view "${args.view}".`);
    }
    const size = sizeFor(state, definitions, element, appearance, face, view);
    const height = args.height ?? size.height;
    const input = element
      ? faceInputOf(element, definitions, {
          startedTypes: new Set(
            modelIndexOf(state)
              .relationsOn(element.id)
              .filter((each) => each.from === element.id)
              .map((each) => each.relationType),
          ),
          count: modelIndexOf(state).contentsOf(element.id).length,
        })
      : { name: target.name, component: target.name, attributes: [] };
    const rows = element ? modelIndexOf(state).contentsOf(element.id).length : 0;
    const compiled = compileFace(face);
    // A shape of its own takes the width its face of size `content` is not cut at, as the canvas
    // gives it when no width is stored (ADR 0083's clarification, #15). The canvas measures the face
    // itself, and draws a level's variant at that width: so does this.
    const width =
      args.width ??
      (size.ownShape && args.collapsed !== true
        ? faceContentWidth(compiled, input, {
            least: size.width,
            most: inShape(appearance, Math.max(appearance.width, FACE_CONTENT_MOST_WIDTH)),
          })
        : size.width);
    // Without a view, what a view nests in the element or stores for its shape is not known.
    const mayDiffer =
      view === undefined && element !== undefined && args.width === undefined && size.ownShape;
    const drawing = layOutFace(
      compiled,
      appearance.contentsAsRows
        ? { ...input, rowsHeight: Math.max(1, rows) * ROW_BAND + ROWS_FOOT }
        : input,
      {
        width,
        ...(height === undefined ? {} : { height }),
        ...(args.variant === undefined ? {} : { variant: args.variant }),
        ...(args.collapsed === true ? { collapsed: true } : {}),
      },
    );
    const round = (value: number) => Math.round(value * 10) / 10;
    return ok({
      ...answer,
      filledFrom:
        element === undefined
          ? `nothing is made from it yet, so a stand-in named "${target.name}" with no attributes`
          : `the element "${element.name}" (${element.id})${size.asRow ? ', on its row' : ''}`,
      width: round(width),
      ...(mayDiffer
        ? {
            widthNote:
              'As wide as the model and the appearance make its shape. On a view, a width stored for the shape, or contents the view nests in it, keep the canvas at its own width: give view to lay it out as that view does.',
          }
        : {}),
      height: round(drawing.height),
      cut: drawing.cut,
      ...(drawing.fallback === undefined
        ? {}
        : {
            fallback: `Drawn as the shape's name instead: ${faceMessage(drawing.fallback)}`,
          }),
      lines: linesOf(drawing),
      text: faceDrawingText(drawing),
      boxes: drawing.boxes.length,
      ...(drawing.regions.length === 0
        ? {}
        : {
            regions: drawing.regions.map((each) => ({
              kind: each.kind,
              y: round(each.y),
              height: round(each.height),
            })),
          }),
      problems: problems.map(problemAnswer),
      ...(element === undefined || args.face !== undefined
        ? {}
        : {
            see: `capture_view { "region": ["${element.id}"] } shows it drawn, on a view the open app shows.`,
          }),
    });
  },
});

/** Claude's tools for faces, in the order Claude reads them. */
export const FACE_TOOLS: readonly Tool[] = [setFace, previewFace];
