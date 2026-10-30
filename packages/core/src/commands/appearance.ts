/**
 * Commands that change how every element of a component, or every relation of a relation type, is
 * drawn, at the level the project can change it (ADR-0034): the project appearance in the project
 * file for a definition the project cannot change, the definition itself in its package for one of
 * the project's own. Each trait is set in one place, and an unchanged appearance records nothing.
 */
import type {
  Appearance,
  Face,
  Id,
  ProjectAppearances,
  ProjectFile,
  RelationAppearance,
} from '@visual-anything/schema';
import { APPEARANCE_TRAITS, FACE_PARTS } from '../appearance';
import { RELATION_APPEARANCE_TRAITS, isBuiltInDefinition } from '../definitions';
import { projectAppearanceOf } from '../project-appearances';
import { updateComponent, updateRelationType } from './definitions';
import { compact, reject, sameJson, type Draft } from './draft';
import {
  changedAppearance,
  changedRelationAppearance,
  checkDetailResolves,
  checkedAppearanceOrNone,
  checkedRelationAppearance,
} from './traits';
import type {
  AppearanceChanges,
  RelationAppearanceChanges,
  SetComponentAppearanceCommand,
  SetRelationTypeAppearanceCommand,
} from './types';

type Kind = 'component' | 'relation-type';

export function setComponentAppearance(
  draft: Draft,
  command: SetComponentAppearanceCommand,
): string {
  const id = command.component;
  requireOneOf(command, `the component "${String(id)}"`);
  const definitions = draft.definitions;
  const resolved = typeof id === 'string' ? definitions.component(id) : undefined;
  if (resolved === undefined) return forgetStale(draft, 'component', id, command.appearance);
  const of = `the component "${resolved.name}"`;

  if (isBuiltInDefinition(definitions, 'component', id)) {
    const current = projectAppearanceOf(draft.state, 'component', id);
    const next =
      command.appearance === null
        ? undefined
        : command.appearance !== undefined
          ? checkedAppearanceOrNone(command.appearance, of, current)
          : changedAppearance(current, command.appearanceTraits, of);
    if (next?.detail !== undefined && !sameJson(next.detail, current?.detail)) {
      checkDetailResolves(next, resolved.attributes, undefined, definitions, of);
    }
    putProjectAppearance(draft, 'component', id, next);
    return appearanceLabel(next, of);
  }

  const defined = definitions.components.get(id);
  if (defined === undefined) return forgetStale(draft, 'component', id, command.appearance);
  const current = defined.definition.appearance;
  const changes =
    command.appearanceTraits ??
    componentChanges(
      current,
      command.appearance === null
        ? undefined
        : checkedAppearanceOrNone(command.appearance, of, current),
    );
  if (Object.keys(changes).length > 0) {
    updateComponent(draft, { type: 'update-component', id, changes: { appearance: changes } });
  }
  putProjectAppearance(draft, 'component', id, undefined);
  return appearanceLabel(draft.definitions.components.get(id)?.definition.appearance, of);
}

export function setRelationTypeAppearance(
  draft: Draft,
  command: SetRelationTypeAppearanceCommand,
): string {
  const id = command.relationType;
  requireOneOf(command, `the relation type "${String(id)}"`);
  const definitions = draft.definitions;
  const resolved = typeof id === 'string' ? definitions.relationType(id) : undefined;
  if (resolved === undefined) return forgetStale(draft, 'relation-type', id, command.appearance);
  const of = `the relation type "${resolved.name}"`;

  if (isBuiltInDefinition(definitions, 'relation-type', id)) {
    const current = projectAppearanceOf(draft.state, 'relation-type', id);
    const next =
      command.appearance === null
        ? undefined
        : command.appearance !== undefined
          ? checkedRelationAppearance(command.appearance, of, current)
          : changedRelationAppearance(current, command.appearanceTraits, of);
    putProjectAppearance(draft, 'relation-type', id, next);
    return appearanceLabel(next, of);
  }

  const defined = definitions.relationTypes.get(id);
  if (defined === undefined) return forgetStale(draft, 'relation-type', id, command.appearance);
  const current = defined.definition.appearance;
  const changes =
    command.appearanceTraits ??
    relationTypeChanges(
      current,
      command.appearance === null
        ? undefined
        : checkedRelationAppearance(command.appearance, of, current),
    );
  if (Object.keys(changes).length > 0) {
    updateRelationType(draft, {
      type: 'update-relation-type',
      id,
      changes: { appearance: changes },
    });
  }
  putProjectAppearance(draft, 'relation-type', id, undefined);
  return appearanceLabel(draft.definitions.relationTypes.get(id)?.definition.appearance, of);
}

/**
 * The project appearances without the entries for the given definitions, the maps and the whole left
 * out when nothing is left in them; `undefined` when none is left.
 */
export function withoutEntries(
  appearances: ProjectAppearances | undefined,
  components: ReadonlySet<Id>,
  relationTypes: ReadonlySet<Id>,
): ProjectAppearances | undefined {
  if (appearances === undefined) return undefined;
  const kept = <T>(map: Record<Id, T> | undefined, gone: ReadonlySet<Id>) => {
    const entries = Object.entries(map ?? {}).filter(([id]) => !gone.has(id));
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
  };
  const next = compact({
    components: kept(appearances.components, components),
    relationTypes: kept(appearances.relationTypes, relationTypes),
  });
  return Object.keys(next).length === 0 ? undefined : next;
}

/** A project file with these project appearances, or without the key when there are none. */
export function withAppearances(
  project: ProjectFile,
  appearances: ProjectAppearances | undefined,
): ProjectFile {
  const next = { ...project };
  if (appearances === undefined) delete next.appearances;
  else next.appearances = appearances;
  return next;
}

/** Refuses a command that gives both a whole appearance and changes, or neither. */
function requireOneOf(
  command: { appearance?: unknown; appearanceTraits?: unknown },
  of: string,
): void {
  const whole = command.appearance !== undefined;
  const traits = command.appearanceTraits !== undefined;
  if (whole === traits) {
    reject(
      'invalid-command',
      `Give ${of} either a whole "appearance" or "appearanceTraits" to change, not ${whole ? 'both' : 'neither'}.`,
    );
  }
}

/**
 * Forgets the entry the project file keeps for a definition no package in use defines, when the
 * command removes its appearance; refuses anything else for such an id.
 */
function forgetStale(draft: Draft, kind: Kind, id: Id, appearance: unknown): string {
  const stale = typeof id === 'string' ? projectAppearanceOf(draft.state, kind, id) : undefined;
  if (appearance === null && stale !== undefined) {
    putProjectAppearance(draft, kind, id, undefined);
    return `Forget the appearance given to "${id}"`;
  }
  if (kind === 'component') {
    reject('unknown-component', `No package in use defines the component "${String(id)}".`, [id]);
  }
  reject('unknown-relation-type', `No package in use defines the relation type "${String(id)}".`, [
    id,
  ]);
}

/** Sets or removes one entry of the project appearances, in one change to the project file. */
function putProjectAppearance(
  draft: Draft,
  kind: Kind,
  id: Id,
  next: Appearance | RelationAppearance | undefined,
): void {
  const { project } = draft.state;
  const current = projectAppearanceOf(draft.state, kind, id);
  if (current === undefined ? next === undefined : sameJson(current, next)) return;
  const key = kind === 'component' ? 'components' : 'relationTypes';
  const others = withoutEntries(
    project.appearances,
    new Set(kind === 'component' ? [id] : []),
    new Set(kind === 'relation-type' ? [id] : []),
  );
  const appearances: ProjectAppearances =
    next === undefined
      ? (others ?? {})
      : {
          ...others,
          [key]: Object.fromEntries([...Object.entries(others?.[key] ?? {}), [id, next]]),
        };
  draft.apply({
    op: 'set-project',
    project: withAppearances(
      project,
      Object.keys(appearances).length === 0 ? undefined : appearances,
    ),
  });
}

/**
 * The changes, trait by trait, that turn a component's own appearance into a whole one: only the
 * traits that differ, so that a detail the file already had a problem with is not checked again for
 * a change of color.
 */
function componentChanges(
  current: Appearance | undefined,
  next: Appearance | undefined,
): AppearanceChanges {
  const changes: Record<string, unknown> = {};
  for (const trait of APPEARANCE_TRAITS) {
    const value = next?.[trait];
    if (sameJson(current?.[trait], value)) continue;
    changes[trait] =
      trait === 'detail' && next?.detail !== undefined
        ? {
            componentName: next.detail.componentName ?? null,
            attributes: next.detail.attributes ?? null,
            badges: next.detail.badges ?? null,
            lines: next.detail.lines ?? null,
          }
        : trait === 'face' && typeof next?.face === 'object'
          ? Object.fromEntries(FACE_PARTS.map((part) => [part, (next.face as Face)[part] ?? null]))
          : (value ?? null);
  }
  return changes;
}

/** The changes, trait by trait, that turn a relation type's own appearance into a whole one. */
function relationTypeChanges(
  current: RelationAppearance | undefined,
  next: RelationAppearance | undefined,
): RelationAppearanceChanges {
  const changes: Record<string, unknown> = {};
  for (const trait of RELATION_APPEARANCE_TRAITS) {
    if (!sameJson(current?.[trait], next?.[trait])) changes[trait] = next?.[trait] ?? null;
  }
  return changes;
}

/** "Change the appearance of …", or "Reset …" when no appearance is left at that level. */
function appearanceLabel(appearance: object | undefined, of: string): string {
  return `${appearance === undefined ? 'Reset' : 'Change'} the appearance of ${of}`;
}
