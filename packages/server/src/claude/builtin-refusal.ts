/**
 * Why Claude cannot define a component or a relation type in a built-in package, and what to do
 * instead. Built-in packages are closed (ADR 0018): the core refuses any change to them, and this
 * says so before the call reaches it, with the call that derives in a package of the project's own.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** The package a project with none of its own is told to create, to derive in. */
const FIRST_OWN_PACKAGE = { id: 'my-components', name: 'My components' } as const;

/** A value as one line of JSON with a space after each comma and colon, as the examples write it. */
function oneLine(value: unknown): string {
  return JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');
}

/**
 * The refusal of a definition in a built-in package, or undefined when the package is not built in.
 * It names the definition the package already has under that name, if any, and the call that
 * derives the definition in the project's first package of its own, or in one to create first.
 */
export function builtInPackageRefusal(
  state: ProjectSnapshot,
  kind: 'component' | 'relation-type',
  packageId: Id,
  definition: { name: string; derivesFrom: Id },
): string | undefined {
  const builtin = builtinPackage(packageId);
  if (builtin === undefined) return undefined;
  const noun = kind === 'component' ? 'component' : 'relation type';
  const tool = kind === 'component' ? 'define_component' : 'define_relation_type';
  const key = kind === 'component' ? 'component' : 'relationType';
  const wanted = definition.name.trim().toLowerCase();
  const same = (kind === 'component' ? builtin.components : builtin.relationTypes).find(
    (each) => each.name.toLowerCase() === wanted,
  );
  const own = state.project.packages.find(
    (id) => builtinPackage(id) === undefined && state.packages.some((each) => each.id === id),
  );
  const target = own ?? FIRST_OWN_PACKAGE.id;
  const call = `${tool} ${oneLine({
    package: target,
    [key]: { name: definition.name, derivesFrom: definition.derivesFrom },
  })}`;
  const head = `The package "${packageId}" is built in, and built-in packages are closed: no project adds to them or changes them.`;
  const create = `create_package ${oneLine(FIRST_OWN_PACKAGE)}`;
  if (same !== undefined) {
    const use = `Use "${same.id}", which "${packageId}" defines already, or`;
    return own === undefined
      ? `${head} ${use} create a package of the project’s own with ${create} and derive the ${noun} there, as in ${call}.`
      : `${head} ${use} derive the ${noun} in a package of the project’s own, as in ${call}.`;
  }
  return own === undefined
    ? `${head} The project has no package of its own yet: create one with ${create}, then derive the ${noun} there, as in ${call}.`
    : `${head} Derive the ${noun} in a package of the project’s own instead, as in ${call}.`;
}
