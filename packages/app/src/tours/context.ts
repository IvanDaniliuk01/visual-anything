/** What the tours panel needs of the shell (ADR 0058): the player, and the tab's view state. */
import type { ViewState } from '@visual-anything/core';
import type { TourFile, TourStep } from '@visual-anything/schema';
import { createContext, useContext } from 'react';
import type { TourPlayer } from './player';

export interface ToursHost {
  /** The tour the tab plays full screen. */
  player: TourPlayer;
  /**
   * Plays a tour full screen from a step, the first unless another is given, once the tab has taken
   * note of where it is, to come back there when the tour ends.
   */
  play(tour: TourFile, step?: number): void;
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
