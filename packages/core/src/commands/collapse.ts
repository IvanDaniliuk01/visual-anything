/**
 * Collapsing and expanding containers in a view (interface I1). A view keeps the ids of the
 * containers it shows collapsed, sorted, in its own file; nothing else changes.
 */
import type { Id, ViewFile } from '@visual-anything/schema';
import { count, nameOf, reject, requireList, type Draft } from './draft';
import type { SetCollapsedCommand } from './types';
import { viewProperties } from './views';

export function setCollapsed(draft: Draft, command: SetCollapsedCommand): string {
  const view = draft.view(command.view);
  const ids = requireList(command.elements, 'elements');
  if (ids.length === 0)
    reject('invalid-command', 'No containers were given to collapse or expand.');
  if (typeof command.collapsed !== 'boolean') {
    reject('invalid-command', 'Whether the containers are collapsed is true or false.');
  }
  const worldId = draft.index.world.id;
  const named = new Set<Id>();
  for (const id of ids) {
    if (id === worldId) {
      reject('world-not-allowed', 'World is the canvas itself; it cannot be collapsed.', [id]);
    }
    const element = draft.element(id);
    if (named.has(id)) reject('invalid-command', `"${element.name}" is given twice.`, [id]);
    named.add(id);
  }
  // Ids that name no element, as a hand-edited file may hold, go the first time the list changes.
  const live = (view.collapsed ?? []).filter(
    (id) => id !== worldId && draft.index.element(id) !== undefined,
  );
  const next = command.collapsed
    ? [...new Set([...live, ...ids])]
    : live.filter((id) => !named.has(id));
  putCollapsed(draft, view, next);
  const verb = command.collapsed ? 'Collapse' : 'Expand';
  return ids.length === 1
    ? `${verb} "${nameOf(draft.index, ids[0] as Id)}"`
    : `${verb} ${count(ids.length, 'container')}`;
}

/** Stores the containers a view shows collapsed, sorted; with none, the view has no list at all. */
export function putCollapsed(draft: Draft, view: ViewFile, ids: readonly Id[]): void {
  const sorted = [...new Set(ids)].sort(byCodeUnits);
  const current = view.collapsed ?? [];
  if (sorted.length === current.length && sorted.every((id, at) => id === current[at])) return;
  const properties = viewProperties(view);
  if (sorted.length === 0) delete properties.collapsed;
  else properties.collapsed = sorted;
  draft.apply({ op: 'set-view', view: view.id, properties });
}

/** Orders strings by their UTF-16 code units: the same on every machine and locale. */
function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
