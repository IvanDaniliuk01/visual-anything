/**
 * Checking a project's explorables and script libraries as read from its files (ADR 0107). The core
 * sees the definitions, what shows them, and the texts the project holds; whether a file of
 * `explorables/` or `script-libraries/` is there, and fits its cap, the local program finds and
 * hands to {@link explorableFileProblems}. Nothing here keeps a project from opening but an
 * explorable or a script library defined twice.
 */
import type { Appearance, Element, Id } from '@visual-anything/schema';
import { isShippableLicense } from '../licenses';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';
import { explorableIdOf, explorablesIn } from './catalog';
import { utf8Length } from './frame';
import { MAX_EXPLORABLE_BYTES, MAX_SCRIPT_LIBRARIES_BYTES } from './types';

/** What is wrong with a project's explorables: errors keep it from opening, warnings do not. */
export function checkExplorables(state: ProjectSnapshot): {
  errors: Problem[];
  warnings: Problem[];
} {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const catalog = explorablesIn(state);
  const explorableFirst = new Map<Id, Id>();
  const libraryFirst = new Map<Id, Id>();
  const files = new Map<string, Id>();
  const libraryBytes = new Map<string, number>();
  for (const file of state.packages) {
    for (const library of file.scriptLibraries ?? []) {
      const first = libraryFirst.get(library.id);
      if (first !== undefined) {
        errors.push(
          problem(
            'defined-twice',
            `The script library "${library.id}" is defined by package "${first}" and again by "${file.id}".`,
            [library.id, file.id],
          ),
        );
        continue;
      }
      libraryFirst.set(library.id, file.id);
      if (!library.id.startsWith(`${file.id}.`)) {
        warnings.push(
          problem(
            'id-outside-package',
            `The script library "${library.id}" of package "${file.id}" should start with "${file.id}.".`,
            [library.id, file.id],
          ),
        );
      }
      libraryBytes.set(library.hash, library.bytes);
      if (!isShippableLicense(library.license)) {
        warnings.push(
          problem(
            'script-library-license',
            library.license === undefined
              ? `The script library "${library.npm}" ${library.version} says no license; check its terms before sharing the project.`
              : `The script library "${library.npm}" ${library.version} is under ${library.license}, which is not among the licenses Visual Anything ships under; check its terms before sharing the project.`,
            [library.id],
          ),
        );
      }
    }
    for (const explorable of file.explorables ?? []) {
      const first = explorableFirst.get(explorable.id);
      if (first !== undefined) {
        errors.push(
          problem(
            'defined-twice',
            `The explorable "${explorable.id}" is defined by package "${first}" and again by "${file.id}".`,
            [explorable.id, file.id],
          ),
        );
        continue;
      }
      explorableFirst.set(explorable.id, file.id);
      if (!explorable.id.startsWith(`${file.id}.`)) {
        warnings.push(
          problem(
            'id-outside-package',
            `The explorable "${explorable.id}" of package "${file.id}" should start with "${file.id}.".`,
            [explorable.id, file.id],
          ),
        );
      }
      const sharing = files.get(explorable.file);
      if (sharing !== undefined) {
        warnings.push(
          problem(
            'invalid-explorable',
            `The explorables "${sharing}" and "${explorable.id}" both keep their text in "explorables/${explorable.file}"; only the first runs.`,
            [explorable.id],
          ),
        );
      } else files.set(explorable.file, explorable.id);
      for (const id of explorable.scriptLibraries ?? []) {
        const library = catalog.scriptLibrary(id);
        if (!library || library.package !== file.id) {
          warnings.push(
            problem(
              'unknown-script-library',
              `The explorable "${explorable.name}" uses the script library "${id}", which its package does not define; it shows its card.`,
              [explorable.id],
            ),
          );
        }
      }
    }
  }
  const total = [...libraryBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
  if (total > MAX_SCRIPT_LIBRARIES_BYTES) {
    warnings.push(
      problem(
        'script-library-too-large',
        `The project's script libraries take ${(total / (1024 * 1024)).toFixed(1)} MiB, past 128 MiB.`,
      ),
    );
  }
  for (const text of state.explorableTexts ?? []) {
    if (utf8Length(text.text) > MAX_EXPLORABLE_BYTES) {
      const defined = catalog.explorable(text.id);
      warnings.push(
        problem(
          'explorable-too-large',
          `The explorable "${defined?.definition.name ?? text.id}" is past 512 KiB; it is kept and never runs.`,
          [text.id],
        ),
      );
    }
  }

  const checkNamed = (appearance: Appearance | undefined, owner: Id, what: string) => {
    const id = explorableIdOf(appearance);
    if (id !== undefined && !catalog.explorable(id)) {
      warnings.push(
        problem(
          'unknown-explorable',
          `${what} shows the explorable "${id}", which no package in use defines; it shows none.`,
          [owner],
        ),
      );
    }
  };
  for (const file of state.packages) {
    for (const component of file.components) {
      checkNamed(component.appearance, component.id, `The component "${component.name}"`);
    }
  }
  for (const [owner, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    checkNamed(appearance, owner, `The project appearance of "${owner}"`);
  }
  let index: ReturnType<typeof modelIndexOf> | undefined;
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    checkNamed(element.appearance, element.id, `The element "${element.name}"`);
  }
  for (const view of state.views) {
    for (const shape of view.freeShapes) {
      if (shape.kind !== 'explorable') continue;
      if (!catalog.explorable(shape.explorable)) {
        warnings.push(
          problem(
            'unknown-explorable',
            `An explorable shape in "${view.name}" shows "${shape.explorable}", which no package in use defines; it shows its card.`,
            [shape.id],
          ),
        );
      }
      index ??= modelIndexOf(state);
      if (shape.element !== undefined && !index.element(shape.element)) {
        warnings.push(
          problem(
            'unknown-element',
            `An explorable shape in "${view.name}" reads the element "${shape.element}", which the model no longer holds; it reads none.`,
            [shape.id],
          ),
        );
      }
    }
  }
  return { errors, warnings };
}

/** What the local program found of a file of `explorables/` or `script-libraries/`. */
export type ExplorableFileFinding = 'missing' | 'too-large' | 'not-text';

/**
 * The warnings of what the local program found reading the files beside the project: an
 * explorable's file by its name, a script library's by its hash. A file it found as it should be is
 * left out of the findings.
 */
export function explorableFileProblems(
  state: ProjectSnapshot,
  findings: {
    explorables?: ReadonlyMap<string, ExplorableFileFinding>;
    scriptLibraries?: ReadonlyMap<string, Exclude<ExplorableFileFinding, 'not-text'>>;
  },
): Problem[] {
  const warnings: Problem[] = [];
  const catalog = explorablesIn(state);
  for (const [name, finding] of findings.explorables ?? []) {
    const defined = catalog.byFile(name);
    if (!defined) continue;
    const { id, name: title } = defined.definition;
    warnings.push(
      finding === 'missing'
        ? problem(
            'explorable-file-missing',
            `The file "explorables/${name}" of the explorable "${title}" is missing; it shows its card.`,
            [id],
          )
        : finding === 'too-large'
          ? problem(
              'explorable-too-large',
              `The file "explorables/${name}" of the explorable "${title}" is past 512 KiB; it is kept and never runs.`,
              [id],
            )
          : problem(
              'invalid-explorable',
              `The file "explorables/${name}" of the explorable "${title}" is not UTF-8 text; it never runs.`,
              [id],
            ),
    );
  }
  for (const [hash, finding] of findings.scriptLibraries ?? []) {
    const library = [...catalog.scriptLibraries.values()].find(
      (each) => each.definition.hash === hash,
    );
    if (!library) continue;
    const { id, npm, version } = library.definition;
    warnings.push(
      finding === 'missing'
        ? problem(
            'script-library-file-missing',
            `The file of the script library "${npm}" ${version} is missing from "script-libraries/"; the explorables that use it show their cards.`,
            [id],
          )
        : problem(
            'script-library-too-large',
            `The file of the script library "${npm}" ${version} is past 16 MiB; the explorables that use it show their cards.`,
            [id],
          ),
    );
  }
  return warnings;
}
