/**
 * What the canvas's menus and dialogs share about the keyboard and the focus: in a menu, the arrow
 * keys move through its items and a press outside it closes it; a modal dialog keeps the focus inside
 * it while it is open.
 */
import { useEffect, useEffectEvent, type KeyboardEvent, type RefObject } from 'react';

/**
 * Moves through the items of a menu, for its `keydown`: Up and Down to the previous and the next one,
 * round at the ends, Home and End to the first and the last, and Enter presses the item with the
 * focus. Items marked disabled are reached too, so that they can say why they are. Returns whether it
 * took the key.
 */
export function menuKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const at = items.findIndex((item) => item === item.ownerDocument.activeElement);
  let next: HTMLElement | undefined;
  switch (event.key) {
    case 'ArrowDown':
      next = items[(at + 1) % items.length];
      break;
    case 'ArrowUp':
      next = at <= 0 ? items.at(-1) : items[at - 1];
      break;
    case 'Home':
      next = items[0];
      break;
    case 'End':
      next = items.at(-1);
      break;
    case 'Enter': {
      const item = items[at];
      if (!item) return false;
      // Pressed here, so that a button does not also take the key and press itself again.
      event.preventDefault();
      item.click();
      return true;
    }
    default:
      return false;
  }
  event.preventDefault();
  next?.focus();
  return true;
}

/** Calls `onOutside` when the pointer is pressed anywhere outside the element, as a menu closes then. */
export function useOutsidePress(
  element: RefObject<HTMLElement | null>,
  onOutside: () => void,
): void {
  const outside = useEffectEvent(onOutside);
  useEffect(() => {
    const listener = (event: Event) => {
      const inside = element.current;
      if (inside && event.target instanceof Node && !inside.contains(event.target)) outside();
    };
    document.addEventListener('pointerdown', listener, true);
    return () => {
      document.removeEventListener('pointerdown', listener, true);
    };
  }, [element]);
}

/** What can take the focus by Tab. */
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps the focus inside a modal dialog while it is open: Tab from its last control goes to its first,
 * Shift+Tab from its first goes to its last, and a press on the backdrop around it leaves the focus
 * where it is. The dialog's parent is its backdrop.
 */
export function useModalFocus(dialog: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const backdrop = element.parentElement;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll<HTMLElement>(TABBABLE)];
      const first = controls[0];
      const last = controls.at(-1);
      const active = element.ownerDocument.activeElement;
      if (!first || !last) {
        event.preventDefault();
      } else if (!(active instanceof Node) || !element.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onBackdropPress = (event: MouseEvent) => {
      if (event.target === backdrop) event.preventDefault();
    };
    element.addEventListener('keydown', onKeyDown);
    backdrop?.addEventListener('mousedown', onBackdropPress);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      backdrop?.removeEventListener('mousedown', onBackdropPress);
    };
  }, [dialog]);
}
