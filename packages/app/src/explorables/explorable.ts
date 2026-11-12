/**
 * What the app knows of an explorable from the project alone (ADR 0107): its definition, its script
 * libraries, its text, the hash an approval of it is given for, and whether it may run. The app works
 * the approval hash out from the definitions, as the program's listener does from the files: the
 * text's hash and each script library's, in the order the frame inlines them.
 */
import {
  approvalHashOf,
  definitionsIn,
  explorableShownBy,
  explorableTextOf,
  explorablesIn,
  isApproved,
  modelIndexOf,
  type ExplorableApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ExplorableDefinition, Id, ScriptLibraryDefinition } from '@visual-anything/schema';

/** An explorable as the app shows it, its card included. */
export interface ExplorableShown {
  id: Id;
  definition: ExplorableDefinition;
  /** Its package. */
  package: Id;
  /** Its text, when the project holds it: a file past 512 KiB, or missing, holds none. */
  text: string | undefined;
  /** Its script libraries in order, each with its definition when its package defines it. */
  libraries: { id: Id; definition: ScriptLibraryDefinition | undefined }[];
  /** The hash an approval of it is given for; undefined while a script library is missing. */
  hash: string | undefined;
}

/** Why an explorable does not run, from the project and the approvals alone. */
export type ExplorableBlock =
  | { kind: 'no-text' }
  | { kind: 'library-missing'; library: Id }
  | { kind: 'not-approved'; hash: string };

/** An explorable of the project, by id; undefined when no package defines it. */
export function explorableOf(project: ProjectSnapshot, id: Id): ExplorableShown | undefined {
  const catalog = explorablesIn(project);
  const defined = catalog.explorable(id);
  if (!defined) return undefined;
  const libraries = (defined.definition.scriptLibraries ?? []).map((library) => {
    const found = catalog.scriptLibrary(library);
    // An explorable uses only its own package's script libraries.
    return {
      id: library,
      definition: found?.package === defined.package ? found.definition : undefined,
    };
  });
  const complete = libraries.every((library) => library.definition !== undefined);
  return {
    id,
    definition: defined.definition,
    package: defined.package,
    text: explorableTextOf(project, id)?.text,
    libraries,
    hash: complete
      ? approvalHashOf(
          defined.definition.hash,
          libraries.map((library) => library.definition?.hash ?? ''),
        )
      : undefined,
  };
}

/** Why it does not run, or undefined when it may: its text is held, its libraries defined, it is approved. */
export function blockOf(
  shown: ExplorableShown,
  approvals: readonly ExplorableApproval[],
): ExplorableBlock | undefined {
  if (shown.text === undefined) return { kind: 'no-text' };
  const missing = shown.libraries.find((library) => library.definition === undefined);
  if (missing || shown.hash === undefined) {
    return { kind: 'library-missing', library: missing?.id ?? shown.id };
  }
  if (!isApproved(approvals, shown.hash)) return { kind: 'not-approved', hash: shown.hash };
  return undefined;
}

/** The explorable an element shows: its own appearance's, otherwise its component's. */
export function explorableOfElement(project: ProjectSnapshot, element: Id): Id | undefined {
  const index = modelIndexOf(project);
  const found = index.element(element) ?? (index.world.id === element ? index.world : undefined);
  if (!found) return undefined;
  return explorableShownBy(found, definitionsIn(project));
}

/** The size of a script library's file, in KiB or MiB, as the dialogs say it. */
export function librarySize(bytes: number): { value: string; unit: 'KiB' | 'MiB' } {
  if (bytes >= 1024 * 1024) return { value: (bytes / (1024 * 1024)).toFixed(1), unit: 'MiB' };
  return { value: String(Math.max(1, Math.round(bytes / 1024))), unit: 'KiB' };
}
