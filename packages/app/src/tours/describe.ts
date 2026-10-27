/** What a tour's step marks, in words, as the tours panel and the stage's card say it (ADR 0077). */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Translator } from '../i18n';

/** "Marks “A”, “B”.", the first three by name and how many more; "Marks nothing." for none. */
export function describeMarks(
  t: Translator,
  project: ProjectSnapshot,
  marks: readonly Id[],
): string {
  if (marks.length === 0) return t('Marks nothing.');
  const index = modelIndexOf(project);
  const names = marks
    .slice(0, 3)
    .map((id) => `“${index.element(id)?.name ?? index.relation(id)?.name ?? id}”`);
  return marks.length > 3
    ? t('Marks {names} and {count} more.', { names: names.join(', '), count: marks.length - 3 })
    : t('Marks {names}.', { names: names.join(', ') });
}
