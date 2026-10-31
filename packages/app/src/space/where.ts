/**
 * Where an element is in the physical-space panel, in words (ADR 0076), as its list's rows and its
 * announcements say it: "Wrist camera, posed in Wrist, 5 cm from it". The element the panel shows is
 * never called its root: the panel shows it.
 */
import { modelIndexOf, type ProjectSnapshot, type Space } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Translator } from '../i18n';
import { formatLength } from '../shell/inspector/lengths';

/** Where an element is in a space, in a sentence without its full stop. */
export function whereIs(
  t: Translator,
  project: ProjectSnapshot,
  space: Pick<Space, 'root' | 'entries' | 'faint'>,
  element: Id,
): string {
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const name = nameOf(element);
  const entry = space.entries.get(element);
  const faint = entry ? undefined : space.faint.get(element);
  if (!entry && !faint) return t('{name}, not in this physical space', { name });
  if (faint) return t('{name}, drawn faintly: this view does not show it', { name });
  if (!entry) return name;
  let said: string;
  if (entry.how === 'root') said = t('{name}, which the panel shows', { name });
  else if (entry.how === 'anchored') {
    said = t('{name}, anchored to the part “{part}” of {container}', {
      name,
      part: entry.part?.name ?? '',
      container: nameOf(entry.in ?? index.world.id),
    });
  } else {
    const container = nameOf(entry.in ?? index.world.id);
    const at = index.element(element)?.pose?.at;
    const distance = at ? Math.hypot(at.x, at.y, at.z) : 0;
    said =
      distance === 0
        ? t('{name}, posed in {container}, at its origin', { name, container })
        : t('{name}, posed in {container}, {distance} from it', {
            name,
            container,
            distance: formatLength(distance),
          });
  }
  if (entry.drawnAs !== undefined && entry.drawnAs !== element) {
    said += t(', drawn as {container}, which is collapsed', { container: nameOf(entry.drawnAs) });
  }
  return said;
}

/** What the panel says of a selection: where one element is, or how many are in the space. */
export function whereSelected(
  t: Translator,
  project: ProjectSnapshot,
  space: Pick<Space, 'root' | 'entries' | 'faint'>,
  selected: readonly Id[],
): string {
  if (selected.length === 0) return t('Nothing is selected.');
  if (selected.length === 1) return `${whereIs(t, project, space, selected[0] as Id)}.`;
  const inSpace = selected.filter((each) => space.entries.has(each)).length;
  return t('{count} elements selected, {inSpace} of them in this physical space.', {
    count: selected.length,
    inSpace,
  });
}
