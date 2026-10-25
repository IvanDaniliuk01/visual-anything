/** What the tours panel needs of the shell (ADR 0058): the player, and the tab's view state. */
import type { ViewState } from '@visual-anything/core';
import type { TourStep } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type { TourPlayer } from './player';

export interface ToursHost {
  /** The tour the tab plays full screen. */
  player: TourPlayer;
  /** The tab's view state as it is now, which Add step takes; none without a view. */
  current(): ViewState | undefined;
  /** Shows a step in the tab as playback would, without going full screen. */
  show(step: TourStep): void;
}

export const ToursContext = createContext<ToursHost | undefined>(undefined);

/** The shell's tours host; none outside the shell, as in some tests. */
export function useToursHost(): ToursHost | undefined {
  return useContext(ToursContext);
}
