/**
 * The tab's physical-space panel, as the shell provides it (ADR 0076): what opens, closes and moves
 * it for each view, which the toolbar's Physical space, its key, and later view addresses, tours and
 * guidance use.
 */
import type { ViewSpace } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SpaceFraming, SpacePanelStore } from './store';

export const SpacePanelContext = createContext<SpacePanelStore | null>(null);

/**
 * The tab's physical-space panel: `state(viewId)`, `open(viewId, space?)`, `close(viewId)`,
 * `set(viewId, space)`, `toggle(viewId)` and `frame(viewId, elements)`; none outside the shell.
 */
export function useSpacePanel(): SpacePanelStore | null {
  return useContext(SpacePanelContext);
}

/** The panel of a view as it changes: what it shows and where it looks; none while it is closed. */
export function useSpacePanelState(
  store: SpacePanelStore | null,
  viewId: Id | undefined,
): ViewSpace | undefined {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () =>
    store && viewId !== undefined ? store.state(viewId) : undefined,
  );
}

/** The framing a view's panel was asked for and has not done yet (`SpacePanelStore.frame`). */
export function useSpaceFraming(
  store: SpacePanelStore | null,
  viewId: Id | undefined,
): SpaceFraming | undefined {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () =>
    store && viewId !== undefined ? store.framing(viewId) : undefined,
  );
}

const noSubscription = () => () => undefined;
