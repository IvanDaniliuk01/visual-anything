import type { Id, PackageFile } from '@visual-anything/schema';

export { ESSENCE, RELATES_TO } from './roots';

/**
 * The packages built into Visual Anything. A project uses one by listing its id; the package is not
 * copied into the project folder.
 */
export const BUILTIN_PACKAGES: readonly PackageFile[] = [];

/** The built-in package with this id, if there is one. */
export function builtinPackage(id: Id): PackageFile | undefined {
  return BUILTIN_PACKAGES.find((builtin) => builtin.id === id);
}
