/**
 * Where the side panels' layout is kept: the person's preference `sidePanels` (ADR 0032's clarification
 * of 2026-10-30), which the tab's preferences apply at once and send to the local program in
 * `preferences/set`, and which the program sends back to every tab in `preferences/changed`. Nothing
 * is kept in the browser or in the project.
 */
import { appliedPreferences, changePreferences, subscribePreferences } from '../../theme/store';
import type { PanelLayout } from './layout';

/** What the panels' store reads its layout from and writes it to. */
export interface PanelStorage {
  /** The layout kept now. */
  read(): PanelLayout;
  /** Keeps a layout: once a change is done, never while an edge is dragged. */
  write(layout: PanelLayout): void;
  /** Calls `listener` whenever what is kept may have changed, as when another tab changes it. */
  subscribe(listener: () => void): () => void;
}

/** The layout kept as the person's preference. */
export const PREFERENCE_STORAGE: PanelStorage = {
  read: () => appliedPreferences().preferences.sidePanels,
  write: (layout) =>
    changePreferences({
      sidePanels: { model: { ...layout.model }, inspector: { ...layout.inspector } },
    }),
  subscribe: subscribePreferences,
};
