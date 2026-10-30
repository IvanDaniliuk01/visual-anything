/**
 * The keys of text emphasis in a text field (ADR 0082). A field that takes emphasis passes its key
 * presses on; the hook changes the text through the field's own setter, as typing does, and puts the
 * selection back on the words once the field shows the new text.
 */
import { useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { emphasisKeyOf, toggleEmphasis } from './keys';

type TextField = HTMLInputElement | HTMLTextAreaElement;

export interface EmphasisKeys {
  /**
   * Handles a key press in the field: true when it was a key of text emphasis, which then changed
   * the text through `setText` and is not passed on to the browser.
   */
  onKeyDown: (event: KeyboardEvent<TextField>, setText: (text: string) => void) => boolean;
}

export function useEmphasisKeys(): EmphasisKeys {
  const pending = useRef<{ field: TextField; start: number; end: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection) return;
    pending.current = undefined;
    selection.field.setSelectionRange(selection.start, selection.end);
  });
  return useMemo(
    () => ({
      onKeyDown(event, setText) {
        const mark = emphasisKeyOf(event);
        if (mark === undefined || event.nativeEvent.isComposing) return false;
        const field = event.currentTarget;
        const next = toggleEmphasis(
          field.value,
          field.selectionStart ?? field.value.length,
          field.selectionEnd ?? field.value.length,
          mark,
        );
        // Ctrl+E, Ctrl+U and Ctrl+Shift+H are the browser's own keys outside a text field.
        event.preventDefault();
        event.stopPropagation();
        pending.current = { field, start: next.start, end: next.end };
        setText(next.text);
        return true;
      },
    }),
    [],
  );
}
