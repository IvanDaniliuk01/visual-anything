/** What the Changes tab lists (ADR 0070): what was opened in it, or else the comparison on the canvas. */
import { useMemo } from 'react';
import { useShownComparison } from '../../canvas/comparison/mode';
import { useOpenedChanges, type OpenedChanges } from './store';

/** What the Changes tab lists now, if anything. */
export function useListedChanges(): OpenedChanges | undefined {
  const { opened } = useOpenedChanges();
  const comparison = useShownComparison();
  return useMemo(
    () =>
      opened ??
      (comparison && {
        kind: 'comparison',
        title: comparison.title,
        older: comparison.older,
        newer: comparison.newer,
        comparison: comparison.comparison,
      }),
    [opened, comparison],
  );
}
