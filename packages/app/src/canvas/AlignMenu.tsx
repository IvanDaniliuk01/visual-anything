import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import type { AlignHow } from './align';
import { ALIGN_GROUPS, ALIGN_NAMES, ALIGN_SHORTCUTS, type AlignAction } from './alignActions';
import './align.css';
import { menuKeyDown, useOutsidePress } from './focus';

export interface AlignMenuProps {
  /**
   * Each way's state for the selection (`alignActions`), asked for while the menu shows, so that
   * selecting many shapes costs nothing more.
   */
  actions: () => Readonly<Record<AlignHow, AlignAction>>;
  /** Called on every press of an item, also of one that would change nothing, to say why. */
  onAlign: (how: AlignHow) => void;
}

/**
 * The canvas toolbar's Align (ADR 0074): a button that opens a menu of the ways to align, distribute
 * and size alike the selected shapes. The arrow keys, Home and End move through it, Enter presses an
 * item, and Escape or a press outside it closes it, the focus going back to the button.
 */
export function AlignMenu({ actions, onAlign }: AlignMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useOutsidePress(wrapper, () => setOpen(false));
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <span ref={wrapper} className="canvas-toolbar-align">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t('Align, distribute or size alike the selected shapes')}
        onClick={() => setOpen((last) => !last)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {t('Align')}
      </button>
      {open && <AlignItems id={menuId} states={actions()} onAlign={onAlign} onClose={close} />}
    </span>
  );
}

function AlignItems({
  id,
  states,
  onAlign,
  onClose,
}: {
  id: string;
  states: Readonly<Record<AlignHow, AlignAction>>;
  onAlign: (how: AlignHow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  return (
    <div
      ref={menu}
      id={id}
      className="canvas-menu"
      role="menu"
      aria-label={t('Align')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Closes this menu only, not More around it.
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else menuKeyDown(event);
      }}
    >
      {ALIGN_GROUPS.map((group, at) => (
        <AlignGroup key={group.join()} first={at === 0}>
          {group.map((how) => (
            <button
              key={how}
              type="button"
              role="menuitem"
              tabIndex={-1}
              title={states[how].description}
              aria-keyshortcuts={ALIGN_SHORTCUTS[how]}
              aria-disabled={states[how].enabled ? undefined : true}
              onClick={() => {
                // One that would change nothing says why, and leaves the menu open for another.
                if (states[how].enabled) onClose();
                onAlign(how);
              }}
            >
              {t(ALIGN_NAMES[how])}
            </button>
          ))}
        </AlignGroup>
      ))}
    </div>
  );
}

/** A group of items, after a line unless it is the first. */
function AlignGroup({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {!first && <div role="separator" className="canvas-menu-separator" />}
      {children}
    </>
  );
}
