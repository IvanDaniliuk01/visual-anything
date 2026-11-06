/**
 * The height of World's tree in the Model tab, as its divider sets it (WorldDivider): each person's,
 * kept in the browser, not in the project; undefined for the tree's own height.
 */
import { useCallback, useState } from 'react';

/** Where the browser keeps the height of World's tree. */
export const WORLD_HEIGHT_KEY = 'visual-anything.model-world-height';

/** The least height of World's tree, and how much room the tab keeps below it, in pixels. */
export const MIN_WORLD_HEIGHT = 64;
export const ROOM_BELOW = 96;

function readHeight(): number | undefined {
  try {
    const stored = Number(localStorage.getItem(WORLD_HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= MIN_WORLD_HEIGHT ? stored : undefined;
  } catch {
    return undefined;
  }
}

function keepHeight(height: number | undefined): void {
  try {
    if (height === undefined) localStorage.removeItem(WORLD_HEIGHT_KEY);
    else localStorage.setItem(WORLD_HEIGHT_KEY, String(Math.round(height)));
  } catch {
    // A browser that keeps nothing still resizes for the session.
  }
}

/**
 * The height World's tree takes, undefined for its own; and how to set it, kept within what the tab
 * `tab` leaves room for.
 */
export function useWorldHeight(tab: React.RefObject<HTMLElement | null>) {
  const [height, setStored] = useState<number | undefined>(readHeight);
  const maxHeight = useCallback(() => {
    const room = tab.current?.clientHeight ?? 0;
    return Math.max(MIN_WORLD_HEIGHT, room - ROOM_BELOW);
  }, [tab]);
  const setHeight = useCallback(
    (next: number | undefined) => {
      const kept =
        next === undefined
          ? undefined
          : Math.round(Math.min(maxHeight(), Math.max(MIN_WORLD_HEIGHT, next)));
      setStored(kept);
      keepHeight(kept);
    },
    [maxHeight],
  );
  return { height, setHeight, maxHeight };
}
