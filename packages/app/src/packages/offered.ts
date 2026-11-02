/**
 * What packages add to the app's menus and dialogs (ADR 0089): the actions of the canvas's menu for a
 * selection and of "Packages…", the importers Import… offers and the exporters Export… offers. Only
 * what approved code that runs on this computer adds is offered: a package whose code waits for
 * approval, is turned off here, is off after its calls stopped or failed to load offers nothing, and
 * "Packages…" says why. What each offers is what its file declares.
 */
import { definitionsIn, modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Id,
  PackageActionDeclaration,
  PackageExporterDeclaration,
  PackageExtensions,
  PackageImporterDeclaration,
} from '@visual-anything/schema';
import type { PackageCodeView } from '../code/context';
import type { Selection } from '../editor/selection';
import { ACCEPTED } from '../import/importing';
import { standingOf } from './packageList';

/** A package whose code may be called, as the menus name it. */
export interface OfferingPackage {
  id: Id;
  name: string;
}

/** Something a package adds, with the package it comes from. */
export interface Offered<T> {
  package: OfferingPackage;
  declared: T;
}

export type OfferedAction = Offered<PackageActionDeclaration>;
export type OfferedImporter = Offered<PackageImporterDeclaration>;
export type OfferedExporter = Offered<PackageExporterDeclaration>;

/**
 * The packages of the project whose code runs here, approved and not turned off, each with what its
 * file declares it adds, in the order the project lists them.
 */
export function offeringPackages(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
): { package: OfferingPackage; extensions: PackageExtensions }[] {
  return project.packages.flatMap((file) => {
    const view = code.get(file.id);
    const standing = standingOf(view);
    if (standing !== 'approved' && standing !== 'running') return [];
    // What the approved code declares, which is the file's: approval is by the hash of both.
    const extensions = view?.code.extensions ?? file.extensions;
    if (extensions === undefined) return [];
    return [{ package: { id: file.id, name: file.name }, extensions }];
  });
}

/** The actions offered in "Packages…": those whose file says `packages-menu`. */
export function menuActions(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
): OfferedAction[] {
  return offeringPackages(project, code).flatMap(({ package: pkg, extensions }) =>
    (extensions.actions ?? [])
      .filter((action) => action.where.includes('packages-menu'))
      .map((declared) => ({ package: pkg, declared })),
  );
}

/**
 * The actions offered in the canvas's menu for a selection: those whose file says `selection`, for a
 * selection of at least one element or relation. One that names components is offered only when the
 * selection holds elements alone, each of one of those components or of one derived from them.
 */
export function selectionActions(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
  selection: Selection,
): OfferedAction[] {
  if (selection.elements.size === 0 && selection.relations.size === 0) return [];
  const offering = offeringPackages(project, code);
  if (offering.length === 0) return [];
  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  const componentsOf = [...selection.elements].map((id) => index.element(id)?.component);
  const onlyElements = selection.relations.size === 0 && selection.freeShapes.size === 0;
  const fits = (components: readonly Id[] | undefined) =>
    components === undefined ||
    (onlyElements &&
      componentsOf.length > 0 &&
      componentsOf.every(
        (component) =>
          component !== undefined &&
          components.some((each) => definitions.componentDerives(component, each)),
      ));
  return offering.flatMap(({ package: pkg, extensions }) =>
    (extensions.actions ?? [])
      .filter((action) => action.where.includes('selection') && fits(action.components))
      .map((declared) => ({ package: pkg, declared })),
  );
}

/** The ids an action is run with: the selected elements, then the selected relations. */
export function selectionIds(selection: Selection): Id[] {
  return [...selection.elements, ...selection.relations];
}

/** The importers Import… offers, in the order of the packages and of their files. */
export function offeredImporters(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
): OfferedImporter[] {
  return offeringPackages(project, code).flatMap(({ package: pkg, extensions }) =>
    (extensions.importers ?? []).map((declared) => ({ package: pkg, declared })),
  );
}

/** The exporters Export… offers, in the order of the packages and of their files. */
export function offeredExporters(
  project: ProjectSnapshot,
  code: ReadonlyMap<Id, PackageCodeView>,
): OfferedExporter[] {
  return offeringPackages(project, code).flatMap(({ package: pkg, extensions }) =>
    (extensions.exporters ?? []).map((declared) => ({ package: pkg, declared })),
  );
}

/** A file name's extension, with its dot, in lower case; empty when it has none. */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? name;
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/** The first importer offered that reads files with this name's extension, if one does. */
export function importerFor(
  importers: readonly OfferedImporter[],
  name: string,
): OfferedImporter | undefined {
  const extension = extensionOf(name);
  if (extension === '') return undefined;
  return importers.find((each) => each.declared.extensions.includes(extension));
}

/** The file name endings the built-in formats read, which a package's importer never takes over. */
const BUILT_IN_ENDINGS: ReadonlySet<string> = new Set(ACCEPTED.split(','));

/**
 * The package's importer a file is read with: the one chosen as its format, or, when the format is
 * left as the file says (`''`), the first offered for its name's ending, if no built-in format reads
 * that ending. Undefined when a built-in format reads it.
 */
export function packageImporterFor(
  importers: readonly OfferedImporter[],
  format: string,
  name: string,
): OfferedImporter | undefined {
  if (format !== '') return importers.find((each) => offeredKey(each) === format);
  if (BUILT_IN_ENDINGS.has(extensionOf(name))) return undefined;
  return importerFor(importers, name);
}

/** The key a choice of importer or exporter is known by in a list: its package's id and its own. */
export function offeredKey(offered: Offered<{ id: string }>): string {
  return `package:${offered.package.id}:${offered.declared.id}`;
}
