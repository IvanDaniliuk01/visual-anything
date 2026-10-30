/**
 * Key rows (ADR 0080, section 5): a view whose `rows` is `keys` draws, in each shape that draws its
 * contents as rows, only the rows whose element is part of a primary key, its `primaryKey` attribute
 * true as Data modeling's column says, or that a relation the view can draw ends on, whatever its scope: so the foreign keys,
 * which reference other tables, and the columns they reference. The rest are counted in the header.
 * Pure, as the scene is.
 */
import { relationTypesLeftOutBy, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';

/** The attribute that marks an element part of its table's primary key. */
export const PRIMARY_KEY = 'primaryKey';

/**
 * The elements a view in `keys` draws as rows: those part of a primary key, and the ends of every
 * relation it can draw as a line, which its nesting relation types and the relation types it leaves
 * out do not draw. Undefined for a view that draws every row.
 */
export function keyRowsOf(
  project: ProjectSnapshot,
  view: ViewFile,
  nesting: ReadonlySet<Id>,
): ReadonlySet<Id> | undefined {
  if (view.rows !== 'keys') return undefined;
  const leftOut = relationTypesLeftOutBy(project, view);
  const keys = new Set<Id>();
  for (const relation of project.model.relations) {
    if (nesting.has(relation.relationType) || leftOut.has(relation.relationType)) continue;
    keys.add(relation.from);
    keys.add(relation.to);
  }
  for (const element of project.model.elements) {
    if (element.attributes?.[PRIMARY_KEY] === true) keys.add(element.id);
  }
  return keys;
}

/** Whether two sets of key rows hold the same elements, none being the same as none. */
export function sameKeyRows(
  a: ReadonlySet<Id> | undefined,
  b: ReadonlySet<Id> | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
