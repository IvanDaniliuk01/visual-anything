/**
 * What a tree of the model panel keeps: the rows someone opened or closed, and the request that brings
 * a row into view. When the selection changes elsewhere, such as on the canvas, the tree opens the rows
 * around the one that stands for it and scrolls to it; a selection the tree made itself leaves the
 * tree where it is. A hidden tree keeps no request: when it shows again, it scrolls to the selection's
 * row, if that row shows, and never moves the focus.
 */
import { useState } from 'react';
import type { Selection } from '../editor/selection';
import type { RowPlace } from './outlineItems';
import type { TreeRequest } from './VirtualTree';

export interface TreeState {
  /** The rows someone opened (true) or closed (false); the others are as they are at first. */
  open: ReadonlyMap<string, boolean>;
  setOpen(id: string, open: boolean): void;
  request: TreeRequest | undefined;
  /** Selects, as the tree's own choice: the tree does not scroll to it. */
  choose(selection: Selection): void;
  /** Brings a row into view, opening the rows around it; focuses it when asked. */
  bringIntoView(place: RowPlace, focus: boolean): void;
}

const NONE_OPENED: ReadonlyMap<string, boolean> = new Map();

/** The request a tree acts on, if any, and the serial of the last one, which only grows. */
interface Requested {
  request: TreeRequest | undefined;
  serial: number;
}

export function useTreeState(
  selection: Selection,
  select: (selection: Selection) => void,
  /** Where the selection's row is; undefined while the tree is not shown. */
  placeOf: ((selection: Selection) => RowPlace | undefined) | undefined,
  /** Whether the row with this id is open at first. */
  openAtFirst: (id: string) => boolean,
): TreeState {
  const [open, setOpenRows] = useState(NONE_OPENED);
  const [requested, setRequested] = useState<Requested>({ request: undefined, serial: 0 });
  const [own, setOwn] = useState<Selection>();
  const [seen, setSeen] = useState<{ selection: Selection; shown: boolean }>({
    selection,
    shown: false,
  });

  const ask = (id: string, focus: boolean) =>
    setRequested((last) => ({
      request: { id, focus, serial: last.serial + 1 },
      serial: last.serial + 1,
    }));

  // Following a selection made elsewhere, or the one there is when the tree shows again: adjusting
  // state while rendering, so the tree draws the row's surroundings open in the same pass.
  const shown = placeOf !== undefined;
  if (seen.selection !== selection || seen.shown !== shown) {
    const showing = shown && !seen.shown;
    setSeen({ selection, shown });
    if (!shown) {
      // What the tree was asked last is not asked again when it shows.
      if (requested.request) setRequested({ request: undefined, serial: requested.serial });
    } else {
      const place = placeOf(selection);
      if (place && selection !== own) {
        const next = withOpen(open, place.outer, openAtFirst);
        if (next !== open) setOpenRows(next);
        ask(place.id, false);
      } else if (place && showing && isShown(open, place.outer, openAtFirst)) {
        // The tree's own selection: its row comes into view, without opening what was closed.
        ask(place.id, false);
      }
    }
  }

  return {
    open,
    setOpen: (id, value) =>
      setOpenRows((current) => {
        const next = new Map(current);
        next.set(id, value);
        return next;
      }),
    request: requested.request,
    choose: (next) => {
      setOwn(next);
      select(next);
    },
    bringIntoView: (place, focus) => {
      setOpenRows((current) => withOpen(current, place.outer, openAtFirst));
      ask(place.id, focus);
    },
  };
}

/** Whether the rows around a row are all open, so that it shows. */
function isShown(
  open: ReadonlyMap<string, boolean>,
  ids: readonly string[],
  openAtFirst: (id: string) => boolean,
): boolean {
  return ids.every((id) => open.get(id) ?? openAtFirst(id));
}

/** The open rows with these opened too; the same map when they all are already. */
function withOpen(
  open: ReadonlyMap<string, boolean>,
  ids: readonly string[],
  openAtFirst: (id: string) => boolean,
): ReadonlyMap<string, boolean> {
  if (isShown(open, ids, openAtFirst)) return open;
  const next = new Map(open);
  for (const id of ids) if (!(open.get(id) ?? openAtFirst(id))) next.set(id, true);
  return next;
}
