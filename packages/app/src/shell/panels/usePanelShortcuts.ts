/**
 * Alt+Shift+M collapses the model panel or opens it again, and Alt+Shift+N the inspector, wherever the
 * focus is, except where people type, in dialogs and menus, and while a tour plays (ADR 0058). Held
 * down, a key toggles its panel once.
 */
import { useEffect, useEffectEvent } from 'react';
import { isTextEntry } from '../../live/shortcuts';
import { panelShortcut } from './layout';
import type { PanelLayoutStore } from './store';

export function usePanelShortcuts(store: PanelLayoutStore, held: boolean): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || held) return;
    const side = panelShortcut(event);
    if (side === undefined) return;
    if (event.getModifierState('AltGraph') || isTextEntry(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
      return;
    }
    event.preventDefault();
    if (!event.repeat) store.toggle(side);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
