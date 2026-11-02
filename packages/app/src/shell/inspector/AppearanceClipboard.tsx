import { useContext, useState } from 'react';
import {
  APPEARANCE_KEYS,
  appearanceToCopy,
  pasteAppearanceCommand,
} from '../../canvas/appearanceCopy';
import {
  copyAppearanceOf,
  pasteAppearanceOnto,
  useCopiedAppearance,
} from '../../canvas/useAppearanceCopy';
import { EditorContext } from '../../editor/EditorContext';
import { useT } from '../../i18n';

/**
 * Copy appearance and Paste appearance in the format panel (ADR 0088, A6.4): every Style and Text
 * trait of the one selected element or relation, set on the selection in one action. Each button
 * names its keys; one that would do nothing stays in the Tab order, saying why, and says it again
 * when pressed. Shown for a selection of elements and relations only.
 */
export function AppearanceClipboard() {
  const t = useT();
  const editor = useContext(EditorContext);
  const copied = useCopiedAppearance();
  const [message, setMessage] = useState({ text: '', count: 0 });
  if (!editor) return null;
  const { project, selection, send } = editor;
  if (selection.freeShapes.size > 0) return null;
  if (selection.elements.size + selection.relations.size === 0) return null;
  const say = (text: string) => setMessage((last) => ({ text, count: last.count + 1 }));
  const copyable = appearanceToCopy(project, selection);
  const pastable = pasteAppearanceCommand(project, selection, copied);
  const pasteReason =
    send === undefined
      ? t('The project cannot be changed now.')
      : 'reason' in pastable
        ? t(pastable.reason)
        : undefined;

  return (
    <div role="group" aria-label={t('Appearance')} className="inspector-buttons format-clipboard">
      <button
        type="button"
        className="inspector-action"
        aria-keyshortcuts={APPEARANCE_KEYS.copy.keys}
        aria-disabled={'reason' in copyable ? true : undefined}
        title={
          'reason' in copyable
            ? t(copyable.reason)
            : `${t('Copy every Style and Text trait of this item')} (${APPEARANCE_KEYS.copy.shown})`
        }
        onClick={() => say(copyAppearanceOf(project, selection).said)}
      >
        {t('Copy appearance')}
      </button>
      <button
        type="button"
        className="inspector-action"
        aria-keyshortcuts={APPEARANCE_KEYS.paste.keys}
        aria-disabled={pasteReason === undefined ? undefined : true}
        title={
          pasteReason ??
          `${t('Paste the appearance of "{name}" onto the selection', { name: copied?.name ?? '' })} (${APPEARANCE_KEYS.paste.shown})`
        }
        onClick={() => {
          if (pasteReason !== undefined) {
            say(pasteReason);
            return;
          }
          void pasteAppearanceOnto(project, selection, send).then(({ said }) => {
            if (said !== '') say(said);
          });
        }}
      >
        {t('Paste appearance')}
      </button>
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </div>
  );
}
