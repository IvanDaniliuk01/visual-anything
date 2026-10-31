/**
 * The model panel's Changes tab (ADR 0070): the conflicts of every file whenever the project holds any
 * (ADR 0072), then the `ChangesList` of whatever is open, a comparison or a proposal. While nothing is
 * opened in it and a comparison shows on the canvas, it lists that comparison, which follows the
 * project.
 */
import { useContext } from 'react';
import { EditorContext } from '../../editor/EditorContext';
import { EMPTY_SELECTION } from '../../editor/selection';
import { useT } from '../../i18n';
import { ConflictsSection } from '../conflicts/ConflictsSection';
import { useConflictsShown } from '../conflicts/store';
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
  const conflicts = useConflictsShown(editor?.project);
  if (!listed && !conflicts) {
    return <p className="panel-empty">{t('Nothing is being compared.')}</p>;
  }
  return (
    <div className="changes-tab">
      <p className="visually-hidden" role="status" aria-live="polite">
        {said.count > 0 && <span key={said.count}>{said.text}</span>}
      </p>
      <ConflictsSection />
      {listed && (
        <ChangesList
          changes={listed}
          openViewId={editor?.viewId}
          selection={editor?.selection ?? EMPTY_SELECTION}
          onShow={(change) => host?.show(change, listed)}
        />
      )}
    </div>
  );
}
