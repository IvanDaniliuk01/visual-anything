/**
 * The explorables and script libraries of the packages a project uses (ADR 0107), what shows each
 * explorable, and its text as the project holds it. An appearance names an explorable by id; a
 * component inherits the explorable of the nearest definition in its chain that sets one, an
 * element's own appearance comes first, and `none` stops an inherited one, as for solids.
 */
import type {
  Appearance,
  Element,
  ExplorableDefinition,
  Id,
  PackageFile,
  ScriptLibraryDefinition,
} from '@visual-anything/schema';
import type { Defined, Definitions } from '../definitions';
import type { Operation } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import type { ExplorableText } from './types';

/** The explorables and script libraries of a set of packages. */
export interface ExplorableCatalog {
  /** Every explorable the packages define, by id; the first when an id is defined twice. */
  readonly explorables: ReadonlyMap<Id, Defined<ExplorableDefinition>>;
  /** Every script library, by id; the first when an id is defined twice. */
  readonly scriptLibraries: ReadonlyMap<Id, Defined<ScriptLibraryDefinition>>;
  explorable(id: Id): Defined<ExplorableDefinition> | undefined;
  scriptLibrary(id: Id): Defined<ScriptLibraryDefinition> | undefined;
  /** The explorable whose file this is, by file name: the first that names it. */
  byFile(file: string): Defined<ExplorableDefinition> | undefined;
}

const catalogs = new WeakMap<readonly PackageFile[], ExplorableCatalog>();

export function explorablesOf(packages: readonly PackageFile[]): ExplorableCatalog {
  let catalog = catalogs.get(packages);
  if (!catalog) {
    const explorables = new Map<Id, Defined<ExplorableDefinition>>();
    const scriptLibraries = new Map<Id, Defined<ScriptLibraryDefinition>>();
    const files = new Map<string, Defined<ExplorableDefinition>>();
    for (const file of packages) {
      for (const definition of file.explorables ?? []) {
        const defined = { definition, package: file.id };
        if (!explorables.has(definition.id)) explorables.set(definition.id, defined);
        if (!files.has(definition.file)) files.set(definition.file, defined);
      }
      for (const definition of file.scriptLibraries ?? []) {
        if (!scriptLibraries.has(definition.id)) {
          scriptLibraries.set(definition.id, { definition, package: file.id });
        }
      }
    }
    catalog = {
      explorables,
      scriptLibraries,
      explorable: (id) => explorables.get(id),
      scriptLibrary: (id) => scriptLibraries.get(id),
      byFile: (name) => files.get(name),
    };
    catalogs.set(packages, catalog);
  }
  return catalog;
}

/** The explorables and script libraries of the packages a project uses. */
export function explorablesIn(state: ProjectSnapshot): ExplorableCatalog {
  return explorablesOf(state.packages);
}

/** The id of the explorable an appearance names, if it names one. */
export function explorableIdOf(appearance: Appearance | undefined): Id | undefined {
  const explorable = appearance?.explorable;
  return explorable === undefined || explorable === 'none' ? undefined : explorable.explorable;
}

const componentExplorables = new WeakMap<Definitions, Map<Id, Id | null>>();

/** The explorable a component's elements show, from its own appearance or the nearest it inherits. */
export function componentExplorable(definitions: Definitions, componentId: Id): Id | undefined {
  let byComponent = componentExplorables.get(definitions);
  if (!byComponent) {
    byComponent = new Map();
    componentExplorables.set(definitions, byComponent);
  }
  let shown = byComponent.get(componentId);
  if (shown === undefined) {
    shown = null;
    for (const id of definitions.component(componentId)?.lineage ?? []) {
      const explorable = definitions.components.get(id)?.definition.appearance?.explorable;
      if (explorable === 'none') break;
      if (explorable !== undefined) {
        shown = explorable.explorable;
        break;
      }
    }
    byComponent.set(componentId, shown);
  }
  return shown ?? undefined;
}

/** The explorable an element shows: its own appearance's, otherwise its component's. */
export function explorableShownBy(
  element: { component: Id; appearance?: Appearance },
  definitions: Definitions,
): Id | undefined {
  const own = element.appearance?.explorable;
  if (own === 'none') return undefined;
  return own?.explorable ?? componentExplorable(definitions, element.component);
}

/**
 * What shows an explorable, each once: components of any package, components the project gives an
 * appearance of its own, elements, World included, and explorable shapes of any view. An explorable
 * any of them shows cannot be removed (`in-use`); tour steps that name one become broken steps.
 */
export function explorableUsers(state: ProjectSnapshot, explorable: Id): Id[] {
  const users = new Set<Id>();
  const names = (appearance: Appearance | undefined) => explorableIdOf(appearance) === explorable;
  for (const file of state.packages) {
    for (const component of file.components) {
      if (names(component.appearance)) users.add(component.id);
    }
  }
  for (const [id, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    if (names(appearance)) users.add(id);
  }
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    if (names(element.appearance)) users.add(element.id);
  }
  for (const view of state.views) {
    for (const shape of view.freeShapes) {
      if (shape.kind === 'explorable' && shape.explorable === explorable) users.add(shape.id);
    }
  }
  return [...users];
}

/** The text the project holds for an explorable, if it holds one. */
export function explorableTextOf(
  state: ProjectSnapshot,
  explorable: Id,
): ExplorableText | undefined {
  return state.explorableTexts?.find((each) => each.id === explorable);
}

/**
 * The hashes of an explorable's script libraries, in the order its frame inlines them: what its
 * approval covers besides its text. `undefined` when one it names is not defined.
 */
export function scriptLibraryHashes(
  state: ProjectSnapshot,
  definition: ExplorableDefinition,
): string[] | undefined {
  const catalog = explorablesIn(state);
  const hashes: string[] = [];
  for (const id of definition.scriptLibraries ?? []) {
    const library = catalog.scriptLibrary(id);
    if (!library) return undefined;
    hashes.push(library.definition.hash);
  }
  return hashes;
}

/** A file of `explorables/` for the local program to write, and its text. */
export interface ExplorableFileWrite {
  explorable: Id;
  /** The file's name inside `explorables/`. */
  file: string;
  text: string;
}

/**
 * The files of `explorables/` to write once operations are applied (ADR 0107): each explorable whose
 * text they change and that the project still defines, with its text now. `forward` are the
 * operations of the action as it was done: the same as `applied` for a command or a redo, and the
 * action's own for an undo. A text the action read from the file (`read`) is never written back: the
 * file is as the person, their editor or git left it. A text that goes is never deleted.
 */
export function explorableFileWrites(
  after: ProjectSnapshot,
  applied: readonly Operation[],
  forward: readonly Operation[] = applied,
): ExplorableFileWrite[] {
  const touched = new Set<Id>();
  for (const operation of applied) {
    if (operation.op === 'set-conflicts' || !('collection' in operation)) continue;
    if (operation.collection.name !== 'explorableTexts') continue;
    if (operation.op === 'remove') touched.add(operation.key);
    else if (operation.op === 'replace-all') {
      for (const item of operation.items) touched.add((item as ExplorableText).id);
    } else touched.add((operation.item as ExplorableText).id);
  }
  if (touched.size === 0) return [];
  const read = new Set<Id>();
  for (const operation of forward) {
    if (!('collection' in operation) || operation.collection.name !== 'explorableTexts') continue;
    if (operation.op === 'insert' || operation.op === 'replace') {
      const item = operation.item as ExplorableText;
      if (item.read === true) read.add(item.id);
    }
  }
  const catalog = explorablesIn(after);
  const writes: ExplorableFileWrite[] = [];
  for (const id of touched) {
    if (read.has(id)) continue;
    const text = explorableTextOf(after, id);
    const defined = catalog.explorable(id);
    if (text && defined)
      writes.push({ explorable: id, file: defined.definition.file, text: text.text });
  }
  return writes;
}
