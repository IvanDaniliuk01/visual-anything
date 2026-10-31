/**
 * The conflicts a merge left in the project's files (ADR 0072), as the Changes tab reads them: every
 * file that holds any, each conflict with what its file keeps and the other choice, and what keeping
 * or taking the other choice makes of the project, worked out by the core's `resolve-conflicts` as
 * the program will run it. Pure: nothing here sends a command.
 */
import {
  compareProjects,
  executeCommand,
  positionKey,
  type Comparison,
  type DeleteTargets,
  type Problem,
  type ProjectSnapshot,
  type ResolveConflictsCommand,
} from '@visual-anything/core';
import type { FileConflict, Id } from '@visual-anything/schema';

/** A file as the core's `resolve-conflicts` names it. */
export type ConflictFile = ResolveConflictsCommand['file'];

/** A file of the project that holds conflicts. */
export interface ConflictedFile {
  file: ConflictFile;
  /** Names the file among the project's, as `model` or `view:overview`. */
  key: string;
  /** The name of what the file holds: the project's, a package's, a view's, a scenario's or a tour's. */
  name?: string;
  /** The file's value, in which each conflict's item is found. */
  value: unknown;
  conflicts: readonly FileConflict[];
}

/** Every file of the project that holds conflicts, in the order the program reads the files. */
export function conflictedFiles(project: ProjectSnapshot): ConflictedFile[] {
  const files: ConflictedFile[] = [];
  const add = (file: ConflictFile, value: unknown, name?: string) => {
    const conflicts = (value as { conflicts?: FileConflict[] } | undefined)?.conflicts ?? [];
    if (conflicts.length === 0) return;
    files.push({
      file,
      key: fileKey(file),
      ...(name === undefined ? {} : { name }),
      value,
      conflicts,
    });
  };
  add({ kind: 'project' }, project.project, project.project.name);
  add({ kind: 'model' }, project.model);
  for (const each of project.packages) add({ kind: 'package', id: each.id }, each, each.name);
  for (const view of project.views) add({ kind: 'view', id: view.id }, view, view.name);
  for (const each of project.scenarios) add({ kind: 'scenario', id: each.id }, each, each.name);
  for (const tour of project.tours) add({ kind: 'tour', id: tour.id }, tour, tour.name);
  for (const thread of project.comments) add({ kind: 'comment', id: thread.id }, thread);
  return files;
}

/** How many conflicts the project's files hold, in all. */
export function conflictCount(project: ProjectSnapshot): number {
  return conflictedFiles(project).reduce((sum, file) => sum + file.conflicts.length, 0);
}

/** Names a file among the project's: `project`, `model`, or its kind and id. */
export function fileKey(file: ConflictFile): string {
  return 'id' in file ? `${file.kind}:${file.id}` : file.kind;
}

/** The command that resolves some of a file's conflicts, each kept or with its other choice taken. */
export function resolveCommand(
  file: ConflictFile,
  conflicts: readonly FileConflict[],
  take: 'kept' | 'other',
): ResolveConflictsCommand {
  return {
    type: 'resolve-conflicts',
    file,
    resolutions: conflicts.map((each) => ({ conflict: each.id, take })),
  };
}

/**
 * What a choice makes of the project: the project with the conflicts kept, and with their other
 * choice taken, compared; or why the core refuses the other choice, such as a rule it would break.
 */
export type ConflictChoice =
  | { ok: true; kept: ProjectSnapshot; other: ProjectSnapshot; comparison: Comparison }
  | { ok: false; problems: Problem[] };

/** The comparison between what a file keeps for some of its conflicts and their other choice. */
export function conflictChoice(
  project: ProjectSnapshot,
  file: ConflictFile,
  conflicts: readonly FileConflict[],
): ConflictChoice {
  const kept = executeCommand(project, resolveCommand(file, conflicts, 'kept'));
  if (!kept.ok) return kept;
  const other = executeCommand(project, resolveCommand(file, conflicts, 'other'));
  if (!other.ok) return other;
  return {
    ok: true,
    kept: kept.state,
    other: other.state,
    comparison: compareProjects(kept.state, other.state),
  };
}

/**
 * What taking the other choice deletes as the `delete` command deletes it, with what ends on it: the
 * elements and relations of the model whose other side removed them. The app previews it first, as
 * it previews any deletion.
 */
export function removalsOf(
  file: ConflictFile,
  conflicts: readonly FileConflict[],
  project: ProjectSnapshot,
): DeleteTargets | undefined {
  if (file.kind !== 'model') return undefined;
  const elements: Id[] = [];
  const relations: Id[] = [];
  for (const conflict of conflicts) {
    if (conflict.path.length > 0 || conflict.other !== undefined) continue;
    const [kind, ...rest] = conflict.item.split(':');
    const id = rest.join(':');
    if (kind === 'element' && project.model.elements.some((each) => each.id === id)) {
      elements.push(id);
    }
    if (kind === 'relation' && project.model.relations.some((each) => each.id === id)) {
      relations.push(id);
    }
  }
  if (elements.length === 0 && relations.length === 0) return undefined;
  return {
    ...(elements.length > 0 ? { elements } : {}),
    ...(relations.length > 0 ? { relations } : {}),
  };
}

/** What a file keeps in place for a conflict: its item found by its key, then read along its path. */
export function keptValue(file: ConflictedFile, conflict: FileConflict): unknown {
  const item = itemIn(file, conflict.item);
  if (conflict.why === 'order') return orderOf(item, conflict.path);
  return readPath(item, conflict.path);
}

/** A list's keys, as a conflict of its order keeps them. */
function orderOf(item: unknown, path: readonly string[]): unknown {
  const list = Array.isArray(item) ? item : readPath(item, path);
  return Array.isArray(list) ? (list as unknown[]).map((each) => keyOfEntry(each) ?? each) : list;
}

/** Something of a list that a key names: its id, a position's key, or a relation type. */
function keyOfEntry(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object' || entry === null) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.element === 'string' && !('id' in record)) {
    return positionKey(record as { element: Id; container?: Id });
  }
  if (typeof record.id === 'string') return record.id;
  if (typeof record.relationType === 'string') return record.relationType;
  return undefined;
}

/** What a file holds for a conflict's item, found by its key in the file. */
function itemIn(file: ConflictedFile, item: string): unknown {
  const [kind = '', ...rest] = item.split(':');
  const key = rest.join(':');
  const value = file.value as Record<string, unknown>;
  const find = (list: unknown): unknown =>
    Array.isArray(list) ? (list as unknown[]).find((each) => keyOfEntry(each) === key) : undefined;
  switch (kind) {
    case 'project':
    case 'package':
    case 'view':
    case 'scenario':
    case 'tour':
    case 'thread':
      return withoutConflicts(value);
    case 'world':
      return value.world;
    case 'order':
      return (value.elements as { id: Id }[] | undefined)?.map((each) => each.id);
    case 'element':
      return find(value.elements);
    case 'relation':
      return find(value.relations);
    case 'component':
      return find(value.components);
    case 'relation-type':
      return find(value.relationTypes);
    case 'image':
      return find(value.images);
    case 'position':
      return find(value.positions);
    case 'free-shape':
      return find(value.freeShapes);
    case 'stacking':
      return (value.stackingOrder as Record<string, unknown> | undefined)?.[key];
    case 'route':
      return (value.routes as Record<string, unknown> | undefined)?.[key];
    case 'step':
    case 'tour-step':
      return find(value.steps) ?? deepFind(value, key);
    case 'comment':
      return find(value.comments);
    default:
      return undefined;
  }
}

/** A file's value without its conflicts. */
function withoutConflicts(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'conflicts'));
}

/** The first object inside a value, at any depth, whose id is `key`; a decision's steps included. */
function deepFind(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!Array.isArray(value) && (value as { id?: unknown }).id === key) return value;
  for (const [name, each] of Object.entries(value)) {
    if (name === 'conflicts') continue;
    const found = deepFind(each, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** What lies along a path inside a value, things of a list found by their key. */
function readPath(value: unknown, path: readonly string[]): unknown {
  let at = value;
  for (const key of path) {
    if (Array.isArray(at)) at = (at as unknown[]).find((each) => keyOfEntry(each) === key);
    else if (typeof at === 'object' && at !== null) at = (at as Record<string, unknown>)[key];
    else return undefined;
  }
  return at;
}

/** A value as short text: its JSON, cut past `max` characters. */
export function valueSnippet(value: unknown, max = 300): string {
  if (value === undefined) return '';
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
