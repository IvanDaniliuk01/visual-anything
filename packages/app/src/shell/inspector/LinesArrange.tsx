import { useState } from 'react';
import { resetAction, resetDone, resetTargets, type ResetHow } from '../../canvas/routing/resets';
import { useEditor } from '../../editor/EditorContext';
import type { Selection } from '../../editor/selection';
import { useT } from '../../i18n';

/**
 * The Arrange tab's lines (ADR 0092 §1): Reset routes, as Alt+Shift+R does, and Attach ends
 * automatically, for the selected lines and the lines of the selected shapes, each one action. A press
 * that would change nothing says why. Shown while the selection has lines.
 */
export function LinesArrange({ selection }: { selection: Selection }) {
  const t = useT();
  const { project, viewId, scene, send } = useEditor();
  const [message, setMessage] = useState({ text: '', count: 0 });
  if (!scene || viewId === undefined) return null;
  if (resetTargets(scene, selection).length === 0) return null;
  const say = (text: string) => setMessage((before) => ({ text, count: before.count + 1 }));
  const press = (how: ResetHow) => {
    const action = resetAction(project, viewId, scene, selection, how);
    if ('reason' in action) {
      say(action.reason);
      return;
    }
    if (!send) return;
    void send(action.command).then(
      (result) => {
        if (result.ok) say(resetDone(how, action.count));
      },
      () => undefined,
    );
  };

  return (
    <div role="group" aria-label={t('Lines')} className="format-arrange-group">
      <div className="inspector-buttons">
        <button
          type="button"
          className="inspector-action"
          disabled={send === undefined}
          aria-keyshortcuts="Alt+Shift+R"
          title={t(
            'Routes the selected lines, and the lines of the selected shapes, automatically again. Alt+Shift+R',
          )}
          onClick={() => press('routes')}
        >
          {t('Reset routes')}
        </button>
        <button
          type="button"
          className="inspector-action"
          disabled={send === undefined}
          title={t(
            'Attaches the ends of those lines automatically again, and keeps their bend points.',
          )}
          onClick={() => press('ends')}
        >
          {t('Attach ends automatically')}
        </button>
      </div>
      <p role="status" className="inspector-notes">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </div>
  );
}
