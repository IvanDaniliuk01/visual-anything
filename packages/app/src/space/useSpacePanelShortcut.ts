/**
 * Alt+Shift+P opens the physical-space panel of the open view or closes it (ADR 0076), wherever the
 * focus is, except where people type, in dialogs and menus, and while a tour plays (ADR 0058), as the
 * side panels' keys do. Held down, it toggles the panel once.
 */
import type { Id } from '@visual-anything/schema';
import { useEffect, useEffectEvent } from 'react';
import { isTextEntry } from '../live/shortcuts';
import { spacePanelShortcut } from './keys';
import type { SpacePanelStore } from './store';

export function useSpacePanelShortcut(
  store: SpacePanelStore,
  viewId: Id | undefined,
  held: boolean,
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || held || viewId === undefined) return;
    if (!spacePanelShortcut(event)) return;
    if (event.getModifierState('AltGraph') || isTextEntry(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
      return;
    }
    event.preventDefault();
    if (!event.repeat) store.toggle(viewId);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
