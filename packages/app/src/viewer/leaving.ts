/**
 * The relations that leave a view through its scope (ADR-0040), as a read-only page says them: on the
 * mark a shape draws for them and in what is selected. The page names them; it cannot add their ends
 * to the view, as the app's inspector can.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { t } from '../i18n';

/** How many relations it names before it says how many more there are. */
const NAMED = 5;

/** Which relations leave the view, from a shape. */
export function leavingTitleOf(project: ProjectSnapshot, relations: readonly Id[]): string {
  const named = relations.slice(0, NAMED).map((id) => nameOfEnd(project, id));
  const more = relations.length - named.length;
  const list =
    more > 0 ? `${named.join(', ')}, ${t('and {count} more', { count: more })}` : named.join(', ');
  return t(
    {
      one: '{count} relation leaves this view: {list}.',
      other: '{count} relations leave this view: {list}.',
    },
    { count: relations.length, list },
  );
}
