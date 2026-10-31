/**
 * What is hovered, shared by element id (ADR 0076): the canvas, the physical-space panel, and later
 * the outline and the element list each say what they hover, and each can mark what another hovers.
 * Hovering in either marks it in both. The selection is shared already, by id (`selection.ts`).
 *
 * A place stops hovering only what it hovered: the canvas the pointer leaves does not take away what
 * the panel hovers meanwhile.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext, useSyncExternalStore } from 'react';

/** Where something is hovered. */
export type HoverPlace = 'canvas' | 'space' | 'outline' | 'list';

/** The element hovered, and where. */
export interface Hover {
  readonly element: Id;
  readonly from: HoverPlace;
}

/** The hover of the open project, which the shell provides. */
export class HoverStore {
  private current: Hover | undefined;
  private readonly listeners = new Set<() => void>();

  /** What is hovered now; the same object until it changes. */
  readonly get = (): Hover | undefined => this.current;

  /**
   * Says what `from` hovers: an element, or none, which takes away only what `from` itself hovered.
   */
  set(from: HoverPlace, element: Id | undefined): void {
    const current = this.current;
    if (element === undefined) {
      if (current?.from !== from) return;
      this.current = undefined;
    } else {
      if (current?.from === from && current.element === element) return;
      this.current = { element, from };
    }
    for (const listener of [...this.listeners]) listener();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const HoverContext = createContext<HoverStore | null>(null);

/** The hover store of the shell; none outside it. */
export function useHoverStore(): HoverStore | null {
  return useContext(HoverContext);
}

/** What is hovered now, wherever; none outside the shell. */
export function useHover(): Hover | undefined {
  const store = useContext(HoverContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.get ?? nothing);
}

const noSubscription = () => () => undefined;
const nothing = () => undefined;
