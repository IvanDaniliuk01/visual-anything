/**
 * The canvas's own menu, opened with a secondary press on no shape and no line (ADR 0103): Paste,
 * which shows the same elements copied in this view, and Paste as duplicates, which makes new ones,
 * where it was opened. The arrow keys, Home and End move through it, Enter presses an item, and Escape
 * or a press outside it closes it.
 */
import { useEffect } from 'react';
import { useT } from '../i18n';
import { ELEMENT_COPY_KEYS } from './elementCopy';
import { menuKeyDown, useMenuInsideFrame, useOutsidePress } from './focus';
import type { Point } from './geometry';
import { Item } from './ShapeMenu';
import './drop.css';

export interface CanvasMenuProps {
  /** Where it opens, on screen relative to the canvas. */
  at: Point;
  /** Whether the project can be changed; its items do nothing while not. */
  editable: boolean;
  onPaste: () => void;
  onPasteAsDuplicates: () => void;
  onClose: () => void;
}

export function CanvasMenu({
  at,
  editable,
  onPaste,
  onPasteAsDuplicates,
  onClose,
}: CanvasMenuProps) {
  const t = useT();
  const menu = useMenuInsideFrame<HTMLDivElement>(at);
  useOutsidePress(menu, onClose);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);
  return (
    <div
      ref={menu}
      className="canvas-menu"
      role="menu"
      aria-label={t('Canvas')}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        else menuKeyDown(event);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Item
        label={t('Paste')}
        title={`${t('Shows the same elements copied in this view, and copies of the free shapes')} (${ELEMENT_COPY_KEYS.paste.shown})`}
        readOnly={!editable}
        onPress={onPaste}
      />
      <Item
        label={t('Paste as duplicates')}
        title={`${t('Makes new elements like the ones copied, here')} (${ELEMENT_COPY_KEYS.pasteAsDuplicates.shown})`}
        readOnly={!editable}
        onPress={onPasteAsDuplicates}
      />
    </div>
  );
}
