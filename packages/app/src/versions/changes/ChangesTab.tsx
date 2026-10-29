/**
 * The model panel's Changes tab (ADR 0070): the `ChangesList` of whatever is open, a comparison, a
 * proposal or the project's conflicts. While nothing is opened in it and a comparison shows on the
 * canvas, it lists that comparison, which follows the project.
 */
import { useContext, useMemo } from 'react';
import { useShownComparison } from '../../canvas/comparison/mode';
import { EditorContext } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { useT } from '../../i18n';
import { ChangesList } from './ChangesList';
import { ChangesContext, useOpenedChanges, type OpenedChanges } from './store';

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

/** The tab's content, kept while another tab shows, so that its filters and place stay. */
export function ChangesTab() {
  const t = useT();
  const host = useContext(ChangesContext);
  const editor = useContext(EditorContext);
  const listed = useListedChanges();
  const { said } = useOpenedChanges();
  if (!listed) return <p className="panel-empty">{t('Nothing is being compared.')}</p>;
  return (
    <div className="changes-tab">
      <p className="visually-hidden" role="status" aria-live="polite">
        {said.count > 0 && <span key={said.count}>{said.text}</span>}
      </p>
      <ChangesList
        changes={listed}
        openViewId={editor?.viewId}
        selection={editor?.selection ?? EMPTY_SELECTION}
        onShow={(change) => host?.show(change, listed)}
      />
    </div>
  );
}
