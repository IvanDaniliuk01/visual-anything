/**
 * What the tab the person used last does when Claude, or the command line, asks to open the app while
 * it is connected (ADR 0099): it comes forward as far as the browser lets a page, and, while a project
 * is open, shows the view state asked for by putting it in its address, where it applies as an address
 * brought to the tab does (`view-state/useViewState.ts`).
 */
import { checkViewState, writeViewState, type ViewState } from '@visual-anything/core';

/** The parts of a window the tab uses to show itself. */
export type ShownWindow = Pick<Window, 'focus'> & { location: Pick<Location, 'hash'> };

export function showThisTab(
  target: ShownWindow,
  state: ViewState | undefined,
  project: boolean,
): void {
  try {
    // Browsers mostly let a page bring itself forward only within its own window; it is asked anyway.
    target.focus();
  } catch {
    // Nothing more to do: the notice says the tab was asked to show.
  }
  if (state === undefined || !project) return;
  const checked = checkViewState(state);
  if (!checked.ok) return;
  target.location.hash = writeViewState(checked.state);
}
