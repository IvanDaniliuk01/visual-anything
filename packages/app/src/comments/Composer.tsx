/**
 * Where a comment is written: a new thread's first comment, a reply, or an edit of one's own. Plain
 * text only; Ctrl+Enter (⌘+Enter) sends it and Escape gives up. "Mention the selection" writes the
 * selected elements and relations in as mentions, `@[id]`.
 */
import { MAX_COMMENT_TEXT, normalizeCommentText } from '@visual-anything/core';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';

interface ComposerProps {
  /** What the text box is for, as its label says. */
  label: string;
  /** What sending says. */
  submit: string;
  initial?: string;
  /** Sends the text; resolves with whether it was done, and the box empties when it was. */
  onSubmit: (text: string) => Promise<boolean>;
  onCancel?: (() => void) | undefined;
  /** Why nothing can be sent yet, such as the person's name missing; absent when it can. */
  blocked?: string | undefined;
  autoFocus?: boolean;
}

export function Composer({
  label,
  submit,
  initial = '',
  onSubmit,
  onCancel,
  blocked,
  autoFocus = false,
}: ComposerProps) {
  const t = useT();
  const { selection } = useEditor();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const hint = useId();
  const empty = normalizeCommentText(text) === '';
  const mentions = [...selection.elements, ...selection.relations];

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (empty || busy || blocked !== undefined) return;
    setBusy(true);
    try {
      if (await onSubmit(text)) setText('');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    } else if (event.key === 'Escape' && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  const mention = () => {
    const written = mentions.map((each) => `@[${each}]`).join(' ');
    const element = box.current;
    const at = element?.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const space = before === '' || /\s$/.test(before) ? '' : ' ';
    setText(`${before}${space}${written}${text.slice(at)}`);
    element?.focus();
  };

  return (
    <form className="comment-composer" onSubmit={(event) => void send(event)}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <textarea
        ref={box}
        id={id}
        className="comment-box"
        value={text}
        rows={3}
        maxLength={MAX_COMMENT_TEXT}
        placeholder={label}
        aria-describedby={hint}
        // The box opens for typing in it.
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <p id={hint} className="comment-hint">
        {blocked ??
          t('Plain text: a blank line starts a paragraph, “- ” a list. Ctrl+Enter sends it.')}
      </p>
      <div className="comment-actions">
        <button
          type="submit"
          className="comment-button comment-button-primary"
          disabled={empty || busy || blocked !== undefined}
        >
          {submit}
        </button>
        {mentions.length > 0 && (
          <button type="button" className="comment-button" onClick={mention}>
            {t('Mention the selection')}
          </button>
        )}
        {onCancel && (
          <button type="button" className="comment-button" onClick={onCancel}>
            {t('Cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
