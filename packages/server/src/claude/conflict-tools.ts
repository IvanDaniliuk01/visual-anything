/**
 * Claude's tools for the conflicts a merge left in the project's files (ADR 0072): `list_conflicts`
 * reads them, each with the value its file keeps and the other choice; `resolve_conflicts` keeps what
 * a file holds, or takes the other choice, one conflict at a time or for a whole file, through the
 * core's `resolve-conflicts`: one action of Claude's, which the person can undo. Resolving never
 * joins a proposal (ADR 0073's clarification): while the person reviews Claude's changes, or a
 * proposal of Claude's waits, it is refused.
 */
import {
  positionKey,
  type ProjectSnapshot,
  type ResolveConflictsCommand,
} from '@visual-anything/core';
import type { FileConflict, Id } from '@visual-anything/schema';
import { z } from 'zod';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';
import { briefValue } from './version-tools';

/** A file as the core's `resolve-conflicts` names it. */
type ConflictFile = ResolveConflictsCommand['file'];

/** The kinds of project file, as Claude names them: a thread's file is a thread. */
const FILE_KINDS = ['project', 'model', 'package', 'view', 'scenario', 'tour', 'thread'] as const;
type FileKind = (typeof FILE_KINDS)[number];

/** The most conflicts `list_conflicts` answers in one call. */
export const MAX_CONFLICTS_PER_CALL = 200;

/** A file that holds conflicts, as Claude reads it. */
interface ConflictedFile {
  kind: FileKind;
  id?: Id;
  name: string;
  /** The file's value, in which each conflict's item is found. */
  value: unknown;
  conflicts: readonly FileConflict[];
}

/** Every file of the project that holds conflicts, in the order the files are read. */
function conflictedFiles(state: ProjectSnapshot): ConflictedFile[] {
  const files: ConflictedFile[] = [];
  const add = (kind: FileKind, value: unknown, name: string, fileId?: Id) => {
    const conflicts = (value as { conflicts?: FileConflict[] }).conflicts ?? [];
    if (conflicts.length === 0) return;
    files.push({ kind, ...(fileId === undefined ? {} : { id: fileId }), name, value, conflicts });
  };
  add('project', state.project, state.project.name);
  add('model', state.model, 'the model');
  for (const file of state.packages) add('package', file, file.name, file.id);
  for (const view of state.views) add('view', view, view.name, view.id);
  for (const scenario of state.scenarios) add('scenario', scenario, scenario.name, scenario.id);
  for (const tour of state.tours) add('tour', tour, tour.name, tour.id);
  for (const thread of state.comments) add('thread', thread, thread.id, thread.id);
  return files;
}

/** The core's name for a file: a thread's file is a comment file. */
function coreFile(kind: FileKind, fileId: Id | undefined): ConflictFile | undefined {
  if (kind === 'project' || kind === 'model') return { kind };
  if (fileId === undefined) return undefined;
  return { kind: kind === 'thread' ? 'comment' : kind, id: fileId };
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

/** What a file holds in place for a conflict's item: found by its key in the file. */
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
    case 'comment':
      return deepFind(value, key);
    default:
      return undefined;
  }
}

/** The first object inside a value, at any depth, whose id is `key`. */
function deepFind(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const each of value) {
      const found = deepFind(each, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const [name, each] of Object.entries(record)) {
    if (name === 'conflicts' || typeof each !== 'object' || each === null) continue;
    if (Array.isArray(each)) {
      const direct = (each as unknown[]).find(
        (entry) =>
          typeof entry === 'object' && entry !== null && (entry as { id?: unknown }).id === key,
      );
      if (direct !== undefined) return direct;
    }
    const found = deepFind(each, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function withoutConflicts(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'conflicts'));
}

/** The value at a conflict's path inside its item: lists of things with ids are read by id. */
function valueAt(item: unknown, path: readonly string[]): unknown {
  let at = item;
  for (const step of path) {
    if (Array.isArray(at)) at = at.find((each) => keyOfEntry(each) === step);
    else if (typeof at === 'object' && at !== null) at = (at as Record<string, unknown>)[step];
    else return undefined;
  }
  return at;
}

/** What the file keeps for a conflict: its value at the path, or a list's order as keys. */
function keptValue(file: ConflictedFile, conflict: FileConflict): unknown {
  const value = valueAt(itemIn(file, conflict.item), conflict.path);
  if (conflict.why === 'order' && Array.isArray(value)) return value.map(keyOfEntry);
  return value;
}

/** One conflict as Claude reads it. */
function conflictOf(file: ConflictedFile, conflict: FileConflict) {
  const keeps = keptValue(file, conflict);
  return {
    conflict: conflict.id,
    item: conflict.item,
    ...(conflict.path.length === 0 ? {} : { path: conflict.path }),
    why: conflict.why,
    kept: conflict.kept,
    ...(conflict.sides === undefined ? {} : { sides: conflict.sides }),
    ...(keeps === undefined
      ? { keeps: 'nothing: the item is not in the file' }
      : { keeps: briefValue(keeps) }),
    ...(conflict.other === undefined
      ? { other: 'removed: taking the other choice removes the item, with what ends on it' }
      : { other: briefValue(conflict.other) }),
    ...(conflict.base === undefined ? {} : { base: briefValue(conflict.base) }),
  };
}

/** What a file is, as an answer names it. */
function fileOf(file: ConflictedFile) {
  return { kind: file.kind, ...(file.id === undefined ? {} : { id: file.id }), name: file.name };
}

const fileInput = () => ({
  kind: z
    .enum(FILE_KINDS)
    .describe('The kind of file: project, model, package, view, scenario, tour or thread.'),
  id: id()
    .optional()
    .describe(
      'The id of the package, view, scenario, tour or thread; left out for the project and the model.',
    ),
});

const listConflictsTool = tool({
  name: 'list_conflicts',
  title: 'List conflicts',
  description: `Lists the conflicts a git merge left in the project's files (ADR 0072): places where two branches changed the same thing differently, kept in the file as data, so the file still opens. It changes nothing.

Each file that holds any comes with its kind, id and name, and its conflicts, each with:
- conflict: its id, which resolve_conflicts takes;
- item: what it is about in its file, such as "element:<id>", "relation:<id>", "position:<element> in <container>", "view" or "order";
- path: where inside the item, such as ["attributes", "latency"]; left out for the whole item;
- why: both-changed, removed-and-changed, both-added, needs-removed, cycle or order;
- kept: whose value the file keeps in place, ours or theirs, and sides, the names git gave them;
- keeps: the value the file keeps now; other: the other choice, or that it removes the item; base: the value before both branches.

A long value comes cut. Show the person both choices before resolving, unless they asked you to choose.

Example: {}
Example: {"kind": "model"}
Example: {"kind": "view", "id": "overview"}`,
  input: {
    kind: z.enum(FILE_KINDS).optional().describe('Only the conflicts of files of this kind.'),
    id: id().optional().describe('Only the conflicts of the file with this id.'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('How many conflicts to skip, for the next page; 0 by default.'),
  },
  hints: READ,
  run: async ({ kind, id: fileId, offset = 0 }, program) => {
    const files = conflictedFiles(await program.project()).filter(
      (file) =>
        (kind === undefined || file.kind === kind) && (fileId === undefined || file.id === fileId),
    );
    const total = files.reduce((sum, file) => sum + file.conflicts.length, 0);
    if (total === 0) {
      return ok({
        total: 0,
        files: [],
        note:
          kind === undefined && fileId === undefined
            ? 'No file of the project holds conflicts.'
            : 'No file of these holds conflicts.',
      });
    }
    const answered: { file: ReturnType<typeof fileOf>; total: number; conflicts: unknown[] }[] = [];
    let skipped = 0;
    let given = 0;
    for (const file of files) {
      const conflicts: unknown[] = [];
      for (const conflict of file.conflicts) {
        if (skipped < offset) {
          skipped += 1;
          continue;
        }
        if (given >= MAX_CONFLICTS_PER_CALL) break;
        conflicts.push(conflictOf(file, conflict));
        given += 1;
      }
      if (conflicts.length > 0) {
        answered.push({ file: fileOf(file), total: file.conflicts.length, conflicts });
      }
    }
    const next = offset + given;
    return ok({
      total,
      files: answered,
      ...(next < total ? { next } : {}),
      note: 'resolve_conflicts keeps what a file holds, or takes the other choice, one conflict at a time or for a whole file. Once a file holds none, the person adds it with git add.',
    });
  },
});

const resolveConflictsTool = tool({
  name: 'resolve_conflicts',
  title: 'Resolve conflicts',
  description: `Resolves conflicts that a git merge left in one file of the project (ADR 0072), as one action of yours that the person can undo. For each conflict, take "kept" keeps what the file holds and drops the conflict; take "other" takes the other choice: it sets that value, puts a list in the other side's order, or removes the item as delete_from_model does, with what ends on it (preview_delete says what that takes).

Name the file as list_conflicts names it: its kind, and its id for a package, view, scenario, tour or thread. Give either resolutions, each a conflict's id and what to take, or all, which takes the same for every conflict of the file. A choice that would break a rule of the project is refused, naming what needs what, so that those are resolved first; then nothing changes.

Once the file holds no conflict, tell the person they can add it with git add; Visual Anything never runs git commands that write. Resolve only what the person asked you to: a conflict is two people's work. While the person reviews your changes, or a proposal of yours waits, resolving is refused: conflicts are resolved with your changes applying at once.

Example: {"kind": "model", "resolutions": [{"conflict": "conflict-1", "take": "other"}]}
Example: {"kind": "view", "id": "overview", "all": "kept"}`,
  input: {
    ...fileInput(),
    resolutions: z
      .array(
        z.object({
          conflict: id().describe('The conflict, by its id in the file.'),
          take: z
            .enum(['kept', 'other'])
            .describe('kept, what the file holds; other, the other choice.'),
        }),
      )
      .min(1)
      .max(500)
      .optional()
      .describe('The conflicts to resolve, each with what to take.'),
    all: z
      .enum(['kept', 'other'])
      .optional()
      .describe('Resolve every conflict of the file the same way, instead of resolutions.'),
  },
  hints: WRITE,
  run: async ({ kind, id: fileId, resolutions, all }, program) => {
    if ((resolutions === undefined) === (all === undefined)) {
      return fail('Give either resolutions, each a conflict and what to take, or all.');
    }
    const file = coreFile(kind, fileId);
    if (file === undefined) return fail(`A ${kind} file is named by its id.`);
    const found = conflictedFiles(await program.project()).find(
      (each) => each.kind === kind && (each.id === undefined || each.id === fileId),
    );
    if (found === undefined) {
      return fail(
        `${kind === 'project' || kind === 'model' ? `The ${kind} file` : `The ${kind} "${fileId ?? ''}"`} holds no conflicts. list_conflicts lists those that do.`,
      );
    }
    const command: ResolveConflictsCommand = {
      type: 'resolve-conflicts',
      file,
      resolutions:
        resolutions ??
        found.conflicts.map((conflict) => ({ conflict: conflict.id, take: all ?? 'kept' })),
    };
    return act(program, command, async () => {
      const after = conflictedFiles(await program.project()).find(
        (each) => each.kind === kind && (each.id === undefined || each.id === fileId),
      );
      const left = after?.conflicts.length ?? 0;
      return {
        resolved: command.resolutions.length,
        left,
        ...(left === 0
          ? {
              note: 'The file holds no conflicts now: tell the person they can add it with git add, once they have looked at it.',
            }
          : {}),
      };
    });
  },
});

export const CONFLICT_TOOLS: readonly Tool[] = [listConflictsTool, resolveConflictsTool];
