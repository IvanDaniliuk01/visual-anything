/**
 * The Components tab's tree: the packages in use, the project's own first, each holding its
 * components and then its relation types, in the order its file lists them.
 */
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, PackageFile } from '@visual-anything/schema';
import type { TreeItems } from '../tree';
import type { DefinitionTarget } from './opened';

/** A row of the Components tab: a package, or a component or relation type it defines. */
export type DefinitionRow =
  | { kind: 'package'; id: Id; name: string; builtIn: boolean; file: PackageFile }
  | { kind: 'component' | 'relation-type'; id: Id; name: string; derivesFrom: Id };

/** The packages in use, the project's own first, each in the order the project lists them. */
export function packagesInUse(project: ProjectSnapshot): PackageFile[] {
  const own = project.packages.filter((file) => builtinPackage(file.id) === undefined);
  const builtIn = project.packages.filter((file) => builtinPackage(file.id) !== undefined);
  return [...own, ...builtIn];
}

/** The tree of the packages in use and what each defines. */
export function definitionTree(project: ProjectSnapshot): TreeItems<DefinitionRow> {
  const top: DefinitionRow[] = packagesInUse(project).map((file) => ({
    kind: 'package',
    id: file.id,
    name: file.name,
    builtIn: builtinPackage(file.id) !== undefined,
    file,
  }));
  const inside = (row: DefinitionRow): DefinitionRow[] =>
    row.kind !== 'package'
      ? []
      : [
          ...row.file.components.map((component) => ({
            kind: 'component' as const,
            id: component.id,
            name: component.name,
            derivesFrom: component.derivesFrom,
          })),
          ...row.file.relationTypes.map((relationType) => ({
            kind: 'relation-type' as const,
            id: relationType.id,
            name: relationType.name,
            derivesFrom: relationType.derivesFrom,
          })),
        ];
  return {
    top,
    inside,
    countInside: (row) =>
      row.kind === 'package' ? row.file.components.length + row.file.relationTypes.length : 0,
    idOf: (row) => `${row.kind}:${row.id}`,
  };
}

/** What a row opens in the component editor. */
export function targetOf(row: DefinitionRow): DefinitionTarget {
  return { kind: row.kind, id: row.id };
}
