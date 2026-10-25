import { useEffect, useRef, useState } from 'react';
import { worldToScreen, type Camera } from './camera';
import type { Rect } from './geometry';

interface InlineEditorProps {
  /** What is being edited, in scene coordinates. */
  rect: Rect;
  camera: Camera;
  value: string;
  /** A name is one line; a note's text can have several. */
  multiline: boolean;
  label: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** For a row's name: Ctrl+Enter (⌘Enter) commits it, then this adds the next row (ADR 0023). */
  onNext?: () => void;
}

/**
 * Edits text in place, in an HTML field laid over the canvas where the text is drawn (ADR-0014).
 * Enter commits a name, and Ctrl+Enter a note; Ctrl+Enter in a row's name commits it and adds the
 * next row; Escape cancels; leaving the field commits. While an input method composes text, Enter
 * and Escape are its own.
 */
export function InlineEditor({
  rect,
  camera,
  value,
  multiline,
  label,
  onCommit,
  onCancel,
  onNext,
}: InlineEditorProps) {
  const [text, setText] = useState(value);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    // The canvas brings what it edits into sight; the page itself never scrolls to the field.
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && text !== value && (multiline || text.trim() !== '')) onCommit(text);
    else onCancel();
  };

  const topLeft = worldToScreen(camera, { x: rect.x, y: rect.y });
  const style = {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(80, rect.width * camera.scale),
    height: multiline ? Math.max(40, rect.height * camera.scale) : undefined,
    fontSize: Math.max(11, Math.min(28, 14 * camera.scale)),
  };
  const common = {
    ref: field,
    className: 'inline-editor',
    'aria-label': label,
    value: text,
    style,
    onChange: (event: { target: { value: string } }) => setText(event.target.value),
    onBlur: () => finish(true),
    onKeyDown: (event: React.KeyboardEvent) => {
      event.stopPropagation();
      // Safari ends a composition with a key press that no longer says it composes, but has code 229.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') finish(false);
      else if (event.key === 'Enter' && onNext && !multiline && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
        onNext();
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish(true);
      }
    },
  };
  return multiline ? <textarea {...common} /> : <input {...common} />;
}
