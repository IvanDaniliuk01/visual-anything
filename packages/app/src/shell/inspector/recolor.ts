/**
 * The commands the inspector sends to change colors, made by pure functions so that what each pick
 * sends can be tested without the panels. Each pick is one undoable action: one command, or one batch
 * for a definition and the shape inspected, or for a selection. A color the shape already shows sends
 * nothing, unless an earlier pick is on its way (`always`); a color it would show without a color of
 * its own takes that color back instead of storing a copy (look-and-feel §4.7), so that it keeps
 * following its component, relation type or theme.
 */
import {
  componentOrEssence,
  definitionsIn,
  drawnColorsOf,
  drawnRelationAppearanceOf,
  editableAppearanceOf,
  executeCommand,
  modelIndexOf,
  noteColorsOf,
  arrowColorOf,
  relationTypeOrRelatesTo,
  sameColor,
  type Command,
  type Definitions,
  type FreeShapeTheme,
  type ProjectSnapshot,
  type StoredColorsInDark,
  type ThemeName,
  type UpdateElementCommand,
  type UpdateFreeShapeCommand,
  type UpdateRelationCommand,
} from '@visual-anything/core';
import type { Color, Element, FreeShape, Id, Relation } from '@visual-anything/schema';
import type { Selection } from '../../editor/selection';
import { THEMES } from '../../theme/themes';
import type { DefinitionKind } from '../definitions/commands';
import type { ColorTrait } from './colors';
import type { Shape } from './shapes';

/** How the command for a pick is made. */
export interface PickOptions {
  /**
   * Makes the command even when the project shows that color already, as for a pick in a control
   * while an earlier pick of it is on its way and may change the color first. The core then changes
   * nothing, and the local program records nothing.
   */
  always?: boolean;
  /**
   * The theme the inspector shows, and so the colors a pick is compared with: what the canvas draws
   * in it, built-in colors in their dark shades in the dark theme (ADR-0033). Light by default.
   */
  theme?: ThemeName;
}

/**
 * What a color of its own becomes when `color` is picked: the color, `null` to take it back when the
 * shape would show `color` without it, or `undefined` when nothing changes.
 */
function ownColor(
  own: Color | undefined,
  inherited: Color,
  color: Color,
  { always = false }: PickOptions = {},
): Color | null | undefined {
  const next = sameColor(inherited, color) ? null : color;
  if (always) return next;
  if (own !== undefined && sameColor(own, color)) return undefined;
  return next === null && own === undefined ? undefined : next;
}

/**
 * The command that gives one element a fill or a stroke: its own, or the one it inherits. What it
 * inherits is what the canvas would draw in the theme shown without a color of its own for the trait:
 * in the dark theme, a built-in color's dark shade, or a built-in fill's light value beside a stroke
 * of its own under 3:1 (the core's `drawnColorsOf`).
 */
export function elementColorCommand(
  element: Element,
  trait: ColorTrait,
  color: Color,
  definitions: Definitions,
  options?: PickOptions,
): UpdateElementCommand | undefined {
  const inherited = inheritedColor(element, trait, definitions, options?.theme ?? 'light');
  const next = ownColor(element.appearance?.[trait], inherited, color, options);
  if (next === undefined) return undefined;
  return {
    type: 'update-element',
    id: element.id,
    changes: { appearanceTraits: { [trait]: next } },
  };
}

/**
 * The color an element's shapes would be drawn in, in a theme, without a color of its own for the
 * trait: what it inherits there.
 */
function inheritedColor(
  element: Element,
  trait: ColorTrait,
  definitions: Definitions,
  theme: ThemeName,
): Color {
  const own = element.appearance;
  if (own?.[trait] === undefined) return drawnColorsOf(element, definitions, theme)[trait];
  const rest = { ...own };
  delete rest[trait];
  const without = { component: element.component, appearance: rest };
  return drawnColorsOf(without, definitions, theme)[trait];
}

/** The command that gives one relation a stroke: its own, or its relation type's in the theme shown. */
export function relationColorCommand(
  relation: Relation,
  color: Color,
  definitions: Definitions,
  options?: PickOptions,
): UpdateRelationCommand | undefined {
  const inherited = drawnRelationAppearanceOf(
    { relationType: relation.relationType },
    definitions,
    options?.theme ?? 'light',
  ).stroke;
  const next = ownColor(relation.appearance?.stroke, inherited, color, options);
  if (next === undefined) return undefined;
  return {
    type: 'update-relation',
    id: relation.id,
    changes: { appearanceTraits: { stroke: next } },
  };
}

/**
 * The command that gives a note a fill or a stroke, or an arrow a stroke; `null`, or the theme's
 * color, takes its own color back so that it follows the theme. An arrow has no fill.
 */
export function freeShapeColorCommand(
  viewId: Id,
  shape: FreeShape,
  trait: ColorTrait,
  color: Color | null,
  theme: FreeShapeTheme,
  options?: PickOptions,
): UpdateFreeShapeCommand | undefined {
  if (shape.kind === 'arrow' && trait === 'fill') return undefined;
  const own = shape.kind === 'note' ? shape[trait] : shape.stroke;
  const themes =
    shape.kind === 'note' ? noteColorsOf({}, theme)[trait].color : arrowColorOf({}, theme).color;
  const next =
    color === null
      ? own === undefined && options?.always !== true
        ? undefined
        : null
      : ownColor(own, themes, color, options);
  if (next === undefined) return undefined;
  const changed = { ...shape } as Record<string, unknown>;
  if (next === null) delete changed[trait];
  else changed[trait] = next;
  return { type: 'update-free-shape', view: viewId, shape: changed as unknown as FreeShape };
}

/**
 * The command that gives every element of a component, or every relation of a relation type, a
 * color, at the level the project can change (`set-component-appearance` or
 * `set-relation-type-appearance`, which the core routes: a project appearance for a built-in
 * definition, the definition itself for one of the project's own). `null` takes the color set at that
 * level back. When the element or relation inspected has a color of its own, the same action takes it
 * back, so that it shows what its definition now gives. `undefined` when nothing changes.
 */
export function definitionColorCommand(
  project: ProjectSnapshot,
  kind: DefinitionKind,
  id: Id,
  trait: ColorTrait,
  color: Color | null,
  inspected?: Element | Relation,
  options?: PickOptions,
): Command | undefined {
  if (kind === 'relation-type' && trait === 'fill') return undefined;
  const level = levelChange(project, kind, id, trait, color, options);
  return withInspected(
    project,
    kind,
    id,
    level === undefined ? undefined : levelCommand(kind, id, { [trait]: level }),
    trait,
    inspected,
  );
}

/**
 * The command that gives every element of a component a shape, at the level the project can change;
 * `null` takes the shape set at that level back. The element inspected loses a shape of its own in the
 * same action. `undefined` when nothing changes.
 */
export function definitionShapeCommand(
  project: ProjectSnapshot,
  id: Id,
  shape: Shape | null,
  inspected?: Element,
  { always = false }: PickOptions = {},
): Command | undefined {
  const stored = storedAtLevel(project, 'component', id, 'shape');
  const shown = componentOrEssence(definitionsIn(project), id).appearance.shape;
  const unchanged = shape === null ? stored === undefined : shape === shown;
  const changes = unchanged && !always ? undefined : shape;
  return withInspected(
    project,
    'component',
    id,
    changes === undefined
      ? undefined
      : { type: 'set-component-appearance', component: id, appearanceTraits: { shape: changes } },
    'shape',
    inspected,
  );
}

/**
 * A change at a definition's level, with the inspected element or relation losing its own value of
 * the trait in the same action, so that it shows what its definition gives: one command, a batch
 * named after the definition, or `undefined` when nothing changes.
 */
function withInspected(
  project: ProjectSnapshot,
  kind: DefinitionKind,
  id: Id,
  level: Command | undefined,
  trait: ColorTrait | 'shape',
  inspected: Element | Relation | undefined,
): Command | undefined {
  const commands: Command[] = level === undefined ? [] : [level];
  const own = inspected?.appearance as Record<string, unknown> | undefined;
  if (inspected !== undefined && own?.[trait] !== undefined) {
    commands.push(
      'component' in inspected
        ? {
            type: 'update-element',
            id: inspected.id,
            changes: { appearanceTraits: { [trait]: null } },
          }
        : {
            type: 'update-relation',
            id: inspected.id,
            changes: { appearanceTraits: { stroke: null } },
          },
    );
  }
  if (commands.length <= 1) return commands[0];
  const definitions = definitionsIn(project);
  const name =
    kind === 'component'
      ? `the component "${componentOrEssence(definitions, id).name}"`
      : `the relation type "${relationTypeOrRelatesTo(definitions, id).name}"`;
  return { type: 'batch', label: `Change the appearance of ${name}`, commands };
}

/**
 * A trait as stored at the level the project can change a definition's appearance, not as worked
 * out: in its project appearance or in the definition itself (`editableAppearanceOf`).
 */
export function storedAtLevel(
  project: ProjectSnapshot,
  kind: DefinitionKind,
  id: Id,
  trait: ColorTrait | 'shape',
): unknown {
  const appearance = editableAppearanceOf(project, kind, id)?.appearance as
    Readonly<Record<string, unknown>> | undefined;
  return appearance !== undefined && Object.hasOwn(appearance, trait)
    ? appearance[trait]
    : undefined;
}

/** The command that changes some traits of a definition at the level the project can change. */
function levelCommand(
  kind: DefinitionKind,
  id: Id,
  traits: Partial<Record<ColorTrait, Color | null>>,
): Command {
  return kind === 'component'
    ? { type: 'set-component-appearance', component: id, appearanceTraits: traits }
    : {
        type: 'set-relation-type-appearance',
        relationType: id,
        appearanceTraits: { stroke: traits.stroke ?? null },
      };
}

/** What the color set at the definition's level becomes; `undefined` when nothing changes. */
function levelChange(
  project: ProjectSnapshot,
  kind: DefinitionKind,
  id: Id,
  trait: ColorTrait,
  color: Color | null,
  options?: PickOptions,
): Color | null | undefined {
  const stored = storedAtLevel(project, kind, id, trait) as Color | undefined;
  if (color === null) return stored === undefined && options?.always !== true ? undefined : null;
  const theme = options?.theme ?? 'light';
  const shown = shownAtLevel(project, kind, id, trait, theme);
  if (stored === undefined) return ownColor(undefined, shown, color, options);
  // What the definition would show without the color set at its level, worked out by the core.
  const without = executeCommand(project, levelCommand(kind, id, { [trait]: null }));
  const inherited = without.ok ? shownAtLevel(without.state, kind, id, trait, theme) : shown;
  return ownColor(stored, inherited, color, options);
}

/**
 * The color a definition's shapes are drawn in, in a theme: a component's colors, or its dark colors,
 * and a relation type's stroke, or its dark stroke (the core's `drawnColorsOf` and
 * `drawnRelationAppearanceOf`, given the definition alone).
 */
export function shownAtLevel(
  project: ProjectSnapshot,
  kind: DefinitionKind,
  id: Id,
  trait: ColorTrait,
  theme: ThemeName = 'light',
  stored: StoredColorsInDark = 'as-stored',
): Color {
  const definitions = definitionsIn(project);
  return kind === 'component'
    ? drawnColorsOf({ component: id }, definitions, theme, stored)[trait]
    : drawnRelationAppearanceOf({ relationType: id }, definitions, theme, stored).stroke;
}

/** The theme's colors for notes and arrows, in a theme. */
function freeShapeTheme(theme: ThemeName): FreeShapeTheme {
  return THEMES[theme].canvas;
}

/** What a selection holds that has the trait: elements and notes for a fill; every shape for a stroke. */
function selected(
  project: ProjectSnapshot,
  viewId: Id | undefined,
  selection: Selection,
  trait: ColorTrait,
): { elements: Element[]; relations: Relation[]; freeShapes: FreeShape[] } {
  const index = modelIndexOf(project);
  const view = project.views.find((each) => each.id === viewId);
  const elements = [...selection.elements].flatMap((id) => {
    const element = index.element(id);
    return element ? [element] : [];
  });
  const relations =
    trait === 'stroke'
      ? [...selection.relations].flatMap((id) => {
          const relation = index.relation(id);
          return relation ? [relation] : [];
        })
      : [];
  const freeShapes = (view?.freeShapes ?? []).filter(
    (shape) => selection.freeShapes.has(shape.id) && (trait === 'stroke' || shape.kind === 'note'),
  );
  return { elements, relations, freeShapes };
}

/**
 * The colors a selection shows for a trait in a theme, as the canvas draws them, one for each shape
 * that has it, in the order elements, relations, free shapes: the inspector shows the common one, or
 * that they differ. Stored colors as stored, which picks compare with, or as `stored` says the theme
 * draws them (ADR 0087).
 */
export function selectionColors(
  project: ProjectSnapshot,
  viewId: Id | undefined,
  selection: Selection,
  trait: ColorTrait,
  theme: ThemeName = 'light',
  stored: StoredColorsInDark = 'as-stored',
): Color[] {
  const definitions = definitionsIn(project);
  const { elements, relations, freeShapes } = selected(project, viewId, selection, trait);
  const canvas = freeShapeTheme(theme);
  const adapted = stored === 'adapted';
  return [
    ...elements.map((element) => drawnColorsOf(element, definitions, theme, stored)[trait]),
    ...relations.map(
      (relation) => drawnRelationAppearanceOf(relation, definitions, theme, stored).stroke,
    ),
    ...freeShapes.map((shape) =>
      shape.kind === 'note'
        ? noteColorsOf(shape, canvas, adapted)[trait].color
        : arrowColorOf(shape, canvas, adapted).color,
    ),
  ];
}

/**
 * The action that gives every shape of a selection that has the trait this color of its own, as one
 * batch named after how many shapes it changes; a single change is sent as it is, and none sends
 * nothing.
 */
export function selectionColorCommand(
  project: ProjectSnapshot,
  viewId: Id | undefined,
  selection: Selection,
  trait: ColorTrait,
  color: Color,
  options?: PickOptions,
): Command | undefined {
  const definitions = definitionsIn(project);
  const { elements, relations, freeShapes } = selected(project, viewId, selection, trait);
  const commands: Command[] = [
    ...elements.map((element) => elementColorCommand(element, trait, color, definitions, options)),
    ...relations.map((relation) => relationColorCommand(relation, color, definitions, options)),
    ...(viewId === undefined
      ? []
      : freeShapes.map((shape) =>
          freeShapeColorCommand(
            viewId,
            shape,
            trait,
            color,
            freeShapeTheme(options?.theme ?? 'light'),
            options,
          ),
        )),
  ].filter((command) => command !== undefined);
  if (commands.length <= 1) return commands[0];
  return {
    type: 'batch',
    label: `Change the appearance of ${commands.length} shapes`,
    commands,
  };
}
