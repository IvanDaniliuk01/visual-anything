/**
 * What the canvas turns now (ADR 0075), for the inspector: the element whose solid turns, and the
 * canvas's own Use this view, which keeps the camera it is seen from in one action. The shell keeps
 * it from the open view's canvas and gives it to the inspector, which offers Use this view while that
 * element is shown.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext } from 'react';

export interface CanvasTurning {
  /** The element whose solid turns. */
  element: Id;
  /** Keeps the camera it is seen from, as the shape menu's Use this view does; says if it did. */
  useThisView: () => Promise<boolean>;
}

export const TurningContext = createContext<CanvasTurning | undefined>(undefined);

/** What the canvas turns now, if anything. */
export function useCanvasTurning(): CanvasTurning | undefined {
  return useContext(TurningContext);
}
