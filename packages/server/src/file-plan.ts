/**
 * Which project files a change touches, worked out from its operations: elements, relations and World
 * live in the model file; components and relation types in their package's file; positions, free
 * shapes and the view itself in the view's file; a scenario, a tour and a thread of comments each in
 * its own file; and the project's name and packages in the project file. Built-in packages have no
 * file and are never written.
 */
import { builtinPackage, type Operation, type ProjectSnapshot } from '@visual-anything/core';
import type { FileContentByKind, FileKind, Id } from '@visual-anything/schema';
import type { FolderKind } from './layout';

/**
 * A project file, named by what it holds: `project`, `model`, or the kind and id of a package, view,
 * scenario, tour or thread, as in `view:overview`. Ids hold no colon, so the name is never ambiguous.
 */
export type FileKey = 'project' | 'model' | `${FolderKind}:${Id}`;

/** What a project file holds: its kind and its value. */
export type FileContent = { [K in FileKind]: { kind: K; value: FileContentByKind[K] } }[FileKind];

const RANK: Record<FileKind, number> = {
  project: 0,
  model: 1,
  package: 2,
  view: 3,
  scenario: 4,
  tour: 5,
  comment: 6,
};

/** The kind of file a key names, and the id of what it holds for a file in a folder of its kind. */
export function parseFileKey(key: FileKey): { kind: FileKind; id?: Id } {
  if (key === 'project' || key === 'model') return { kind: key };
  const colon = key.indexOf(':');
  return { kind: key.slice(0, colon) as FolderKind, id: key.slice(colon + 1) };
}

/**
 * The files that operations touch, given the project before and after them. A view, scenario or
 * package that is gone afterwards is still listed: its file is to be deleted.
 */
export function affectedFiles(
  operations: readonly Operation[],
  before: ProjectSnapshot,
  after: ProjectSnapshot,
): FileKey[] {
  const keys = new Set<FileKey>();
  const ofPackage = (id: Id) => {
    if (builtinPackage(id) === undefined) keys.add(`package:${id}`);
  };
  for (const operation of operations) {
    switch (operation.op) {
      case 'set-world':
        keys.add('model');
        break;
      case 'set-project':
        keys.add('project');
        break;
      case 'set-view':
        keys.add(`view:${operation.view}`);
        break;
      case 'set-package':
        ofPackage(operation.package);
        break;
      case 'set-conflicts': {
        const { file } = operation;
        if (file.kind === 'project' || file.kind === 'model') keys.add(file.kind);
        else if (file.kind === 'package') ofPackage(file.id);
        else keys.add(`${file.kind}:${file.id}`);
        break;
      }
      default: {
        const { collection } = operation;
        switch (collection.name) {
          case 'elements':
          case 'relations':
            keys.add('model');
            break;
          case 'components':
          case 'relationTypes':
          case 'images':
          case 'solids':
            ofPackage(collection.package);
            break;
          // A view's routes chosen by hand live in its file, like its positions (ADR 0039).
          case 'positions':
          case 'freeShapes':
          case 'stackingOrder':
          case 'routes':
            keys.add(`view:${collection.view}`);
            break;
          case 'packages':
            for (const id of idsTouched(operation, before.packages, after.packages)) ofPackage(id);
            break;
          case 'views':
            for (const id of idsTouched(operation, before.views, after.views))
              keys.add(`view:${id}`);
            break;
          case 'scenarios':
            for (const id of idsTouched(operation, before.scenarios, after.scenarios)) {
              keys.add(`scenario:${id}`);
            }
            break;
          // A tour and a thread of comments each live in a file of their own (ADR 0058, ADR 0059).
          case 'tours':
            for (const id of idsTouched(operation, before.tours, after.tours)) {
              keys.add(`tour:${id}`);
            }
            break;
          case 'comments':
            for (const id of idsTouched(operation, before.comments, after.comments)) {
              keys.add(`comment:${id}`);
            }
            break;
          // An explorable's text is no project file: the explorables' writer writes `explorables/`
          // from it after the action (ADR 0107, `explorableFileWrites`).
          case 'explorableTexts':
            break;
          default: {
            // A new kind of list must say which file it lives in, or its changes would not be saved.
            const unknown: never = collection;
            throw new Error(`No file is known to hold ${JSON.stringify(unknown)}.`);
          }
        }
      }
    }
  }
  return sortKeys(keys);
}

/** What a file holds in a project; `undefined` when the project has no such file. */
export function contentOf(key: FileKey, state: ProjectSnapshot): FileContent | undefined {
  const { kind, id } = parseFileKey(key);
  switch (kind) {
    case 'project':
      return { kind, value: state.project };
    case 'model':
      return { kind, value: state.model };
    case 'package': {
      const value = state.packages.find((file) => file.id === id);
      return value === undefined || builtinPackage(value.id) !== undefined
        ? undefined
        : { kind, value };
    }
    case 'view': {
      const value = state.views.find((view) => view.id === id);
      return value === undefined ? undefined : { kind, value };
    }
    case 'scenario': {
      const value = state.scenarios.find((scenario) => scenario.id === id);
      return value === undefined ? undefined : { kind, value };
    }
    case 'tour': {
      const value = state.tours.find((tour) => tour.id === id);
      return value === undefined ? undefined : { kind, value };
    }
    case 'comment': {
      const value = state.comments.find((thread) => thread.id === id);
      return value === undefined ? undefined : { kind, value };
    }
  }
}

/** Every file a project has: built-in packages have none. */
export function liveFiles(state: ProjectSnapshot): FileKey[] {
  return sortKeys([
    'project',
    'model',
    ...state.packages
      .filter((file) => builtinPackage(file.id) === undefined)
      .map((file): FileKey => `package:${file.id}`),
    ...state.views.map((view): FileKey => `view:${view.id}`),
    ...state.scenarios.map((scenario): FileKey => `scenario:${scenario.id}`),
    ...state.tours.map((tour): FileKey => `tour:${tour.id}`),
    ...state.comments.map((thread): FileKey => `comment:${thread.id}`),
  ]);
}

/** The ids an operation on a list of views, scenarios, tours, threads or packages touches. */
function idsTouched(
  operation: Extract<Operation, { collection: unknown }>,
  before: readonly { id: Id }[],
  after: readonly { id: Id }[],
): Id[] {
  switch (operation.op) {
    case 'insert':
    case 'replace':
      return [(operation.item as { id: Id }).id];
    case 'remove':
      return [operation.key];
    case 'replace-all':
      return [...before, ...after, ...(operation.items as { id: Id }[])].map((item) => item.id);
  }
}

/** Keys in a stable order: by kind, as files are listed, then by id. */
function sortKeys(keys: Iterable<FileKey>): FileKey[] {
  return [...new Set(keys)].sort((a, b) => {
    const left = parseFileKey(a);
    const right = parseFileKey(b);
    return RANK[left.kind] - RANK[right.kind] || compareText(left.id ?? '', right.id ?? '');
  });
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
