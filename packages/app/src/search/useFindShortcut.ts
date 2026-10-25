/**
 * Ctrl+F, or ⌘F, opens the find field while the canvas or a panel has the focus, or the field itself
 * does. Anywhere else, as in the header or with nothing focused, the browser's own find opens, as it
 * does on any page.
 */
import { useEffect, useEffectEvent } from 'react';

/** Where the app's find field takes Ctrl+F: the canvas area, the panels, and the field. */
const FIND_SCOPE = '.canvas-area, .panel, .find-bar';

/** Whether a key press is Ctrl+F, or ⌘F, with nothing else held but Shift for capitals. */
export function isFindShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f';
}

/** Whether the find field takes a key press made with the focus here. */
export function inFindScope(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIND_SCOPE) !== null;
}

/** Calls `open` for Ctrl+F, or ⌘F, pressed in the find field's scope, and keeps the browser's out. */
export function useFindShortcut(open: () => void): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || !isFindShortcut(event)) return;
    if (!inFindScope(event.target)) return;
    event.preventDefault();
    open();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
