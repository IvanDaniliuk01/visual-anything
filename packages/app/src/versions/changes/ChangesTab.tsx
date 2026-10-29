/**
 * The model panel's Changes tab (ADR 0070): the `ChangesList` of whatever is open, a comparison, a
 * proposal or the project's conflicts. While nothing is opened in it and a comparison shows on the
 * canvas, it lists that comparison, which follows the project.
 */
import { useContext } from 'react';
import { EditorContext } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { useT } from '../../i18n';
import { ChangesList } from './ChangesList';
import { ChangesContext, useOpenedChanges } from './store';
import { useListedChanges } from './useListedChanges';

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
