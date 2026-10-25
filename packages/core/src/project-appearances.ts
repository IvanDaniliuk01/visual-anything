/**
 * The appearances a project keeps for definitions, read for the inspector and Claude: where the
 * appearance of a component or relation type can be changed (ADR-0034), and the colors the project
 * already uses, which the color picker offers.
 */
import type { Appearance, Color, Id, RelationAppearance } from '@visual-anything/schema';
import { builtinPackage } from './builtin';
import { isColor } from './colors';
import { isBuiltInDefinition } from './definitions';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';

/** Where the appearance of a component or relation type is kept, and what is kept there. */
export type EditableAppearance =
  | {
      /** In the project file, as a project appearance: for a definition the project cannot change. */
      level: 'project';
      appearance: Appearance | RelationAppearance | undefined;
    }
  | {
      /** In its definition, in one of the project's own packages. */
      level: 'package';
      package: Id;
      appearance: Appearance | RelationAppearance | undefined;
    };

/**
 * Where the appearance of a component or relation type can be changed, and its appearance there as
 * stored, not as worked out: the project appearance for Essence, "relates to" and the definitions of
 * built-in packages, the definition itself for the project's own. `undefined` for an id no package in
 * use defines.
 */
export function editableAppearanceOf(
  state: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  id: Id,
): EditableAppearance | undefined {
  const definitions = definitionsIn(state);
  const defined =
    kind === 'component' ? definitions.components.get(id) : definitions.relationTypes.get(id);
  if (isBuiltInDefinition(definitions, kind, id)) {
    return { level: 'project', appearance: projectAppearanceOf(state, kind, id) };
  }
  if (defined === undefined) return undefined;
  return { level: 'package', package: defined.package, appearance: defined.definition.appearance };
}

/** The project appearance a project gives a definition, by own key only. */
export function projectAppearanceOf(
  state: ProjectSnapshot,
  kind: 'component',
  id: Id,
): Appearance | undefined;
export function projectAppearanceOf(
  state: ProjectSnapshot,
  kind: 'relation-type',
  id: Id,
): RelationAppearance | undefined;
export function projectAppearanceOf(
  state: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  id: Id,
): Appearance | RelationAppearance | undefined;
export function projectAppearanceOf(
  state: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  id: Id,
): Appearance | RelationAppearance | undefined {
  const map =
    kind === 'component'
      ? state.project.appearances?.components
      : state.project.appearances?.relationTypes;
  return map !== undefined && Object.hasOwn(map, id) ? map[id] : undefined;
}

/**
 * Every color the project stores, in capitals, with how many places store it, most used first and
 * then in order: the appearances of elements and relations, of the project's own definitions and of
 * project appearances, and the colors of notes and free arrows. The colors of built-in packages are
 * not the project's and are not counted.
 */
export function colorsInUse(state: ProjectSnapshot): { color: Color; uses: number }[] {
  const uses = new Map<Color, number>();
  const count = (value: unknown) => {
    if (!isColor(value)) return;
    const color = value.toUpperCase();
    uses.set(color, (uses.get(color) ?? 0) + 1);
  };
  const countColors = (appearance: { fill?: unknown; stroke?: unknown } | undefined) => {
    count(appearance?.fill);
    count(appearance?.stroke);
  };
  for (const element of [state.model.world, ...state.model.elements]) {
    countColors(element.appearance);
  }
  for (const relation of state.model.relations) countColors(relation.appearance);
  for (const file of state.packages) {
    if (builtinPackage(file.id) !== undefined) continue;
    for (const component of file.components) countColors(component.appearance);
    for (const relationType of file.relationTypes) countColors(relationType.appearance);
  }
  for (const appearance of Object.values(state.project.appearances?.components ?? {})) {
    countColors(appearance);
  }
  for (const appearance of Object.values(state.project.appearances?.relationTypes ?? {})) {
    countColors(appearance);
  }
  for (const view of state.views) {
    for (const shape of view.freeShapes) countColors(shape);
  }
  return [...uses]
    .map(([color, times]) => ({ color, uses: times }))
    .sort((a, b) => b.uses - a.uses || (a.color < b.color ? -1 : a.color > b.color ? 1 : 0));
}
