/**
 * The tab's explorable panel store, for the canvas toolbar's button; none outside the shell, where
 * there is no panel and no button.
 */
import { createContext } from 'react';
import type { ExplorablePanelStore } from './panel-store';

export const ExplorablePanelContext = createContext<ExplorablePanelStore | null>(null);
