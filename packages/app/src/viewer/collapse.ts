/**
 * Collapsing and expanding containers in a read-only page: the page's own copy of the view changes,
 * as the app's view file would with the core's `set-collapsed`, and nothing is kept once the page
 * closes. The ids stay sorted, and a view with none collapsed has no list, as the core keeps them.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';

/** The project with these containers collapsed, or expanded, in one view. */
export function withCollapsed(
  project: ProjectSnapshot,
  viewId: Id,
  elements: readonly Id[],
  collapsed: boolean,
): ProjectSnapshot {
  const view = project.views.find((each) => each.id === viewId);
  if (!view || elements.length === 0) return project;
  const world = project.model.world.id;
  const asked = new Set(elements.filter((id) => id !== world));
  const now = view.collapsed ?? [];
  const next = collapsed ? [...new Set([...now, ...asked])] : now.filter((id) => !asked.has(id));
  const sorted = next.sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
  if (sorted.length === now.length && sorted.every((id, at) => id === now[at])) return project;
  const changed: ViewFile = { ...view, collapsed: sorted };
  if (sorted.length === 0) delete changed.collapsed;
  return {
    ...project,
    views: project.views.map((each) => (each === view ? changed : each)),
  };
}
