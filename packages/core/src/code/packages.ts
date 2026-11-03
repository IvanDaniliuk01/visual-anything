/**
 * Which code a project holds and where it runs (ADR 0054). A package's hooks run on the elements
 * created from its components, and from components derived from them in any package; an element
 * whose components come from several packages with code runs each, nearest first.
 */
import type { Capability, Id, PackageExtensions, PackageFile } from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import { componentOrEssence } from '../definitions';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { isCapability, sortedCapabilities } from './capabilities';
import { codeHash } from './hash';
import { CODE_LIMITS } from './limits';

/** A package's code as the app, the program and Claude's tools read it. */
export interface PackageCode {
  package: Id;
  /** The package's name, for what the person reads. */
  name: string;
  /** The module's text: its lines joined by line feeds. */
  text: string;
  /** What the person approves it by: the SHA-256 of its text and of every capability it declares. */
  hash: string;
  /** The capabilities it declares that this build knows, sorted, each once. */
  capabilities: Capability[];
  /** Every capability the file declares, as it declares them: what the hash is made of. */
  declared: string[];
  /** Whether it is over 256 KiB, so that it never runs. */
  tooLarge: boolean;
  /** What it adds to the app (ADR 0089), part of what the hash is made of; absent when nothing. */
  extensions?: PackageExtensions;
  /**
   * Whether it is the code a built-in package ships with, by its hash (ADR 0089's M14.6
   * clarification): the program's own, which runs without the person's approval.
   */
  builtIn?: true;
}

/** The hash of each built-in package's code, worked out once. */
const BUILT_IN_HASHES = new Map<Id, string | null>();

/** The hash of the code the built-in package with this id ships with; undefined for none. */
function builtInCodeHash(id: Id): string | undefined {
  let known = BUILT_IN_HASHES.get(id);
  if (known === undefined) {
    const builtin = builtinPackage(id);
    known =
      builtin?.code === undefined || builtin.code.length === 0
        ? null
        : codeHash(builtin.code, builtin.capabilities ?? [], builtin.extensions);
    BUILT_IN_HASHES.set(id, known);
  }
  return known ?? undefined;
}

/** A package's code; undefined for a package without any. */
export function packageCodeOf(file: PackageFile): PackageCode | undefined {
  const code = file.code;
  if (code === undefined || code.length === 0) return undefined;
  const text = code.join('\n');
  const declared = file.capabilities ?? [];
  const hash = codeHash(code, declared, file.extensions);
  return {
    package: file.id,
    name: file.name,
    text,
    hash,
    capabilities: sortedCapabilities(declared.filter(isCapability)),
    declared: [...declared],
    tooLarge:
      text.length > CODE_LIMITS.codeText ||
      code.length > CODE_LIMITS.lines ||
      code.some((line) => line.length > CODE_LIMITS.lineLength),
    ...(file.extensions === undefined ? {} : { extensions: file.extensions }),
    // Only the very code the program ships with: a package of the same id with other code is not.
    ...(builtInCodeHash(file.id) === hash ? { builtIn: true as const } : {}),
  };
}

/** The code of every package the project uses that has some, in the order the project uses them. */
export function packagesWithCode(state: ProjectSnapshot): PackageCode[] {
  return state.packages.flatMap((file) => {
    const code = packageCodeOf(file);
    return code ? [code] : [];
  });
}

/**
 * The packages with code whose hooks run on an element: those that define its component or one it
 * derives from, nearest first, each once. Empty for an id that is no element.
 */
export function codePackagesOn(state: ProjectSnapshot, id: Id): Id[] {
  const element = modelIndexOf(state).element(id);
  if (!element) return [];
  const withCode = new Set(
    state.packages.filter((file) => file.code !== undefined).map((file) => file.id),
  );
  if (withCode.size === 0) return [];
  const definitions = definitionsIn(state);
  const found: Id[] = [];
  for (const each of componentOrEssence(definitions, element.component).lineage) {
    const owner = definitions.component(each)?.package;
    if (owner !== undefined && withCode.has(owner) && !found.includes(owner)) found.push(owner);
  }
  return found;
}
