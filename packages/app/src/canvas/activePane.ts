/**
 * Whether what is inside belongs to the active pane of a split view, or to the only canvas (ADR 0102):
 * the canvas area says so to its toolbar, so that only the active pane speaks in live regions.
 */
import { createContext, useContext } from 'react';

export const ActivePaneContext = createContext(true);

/** Whether the canvas this is inside is the active one. */
export function useActivePane(): boolean {
  return useContext(ActivePaneContext);
}

/** What a live region takes so that it says nothing outside the active pane. */
export function liveIn(active: boolean): { 'aria-live'?: 'off' } {
  return active ? {} : { 'aria-live': 'off' };
}
