/**
 * What a tree of the model panel keeps: the rows someone opened or closed, and the request that brings
 * a row into view. When the selection changes elsewhere, such as on the canvas, the tree opens the rows
 * around the one that stands for it and scrolls to it; a selection the tree made itself leaves the
 * tree where it is.
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

export function useTreeState(
  selection: Selection,
  select: (selection: Selection) => void,
  /** Where the selection's row is; undefined while the tree is not shown. */
  placeOf: ((selection: Selection) => RowPlace | undefined) | undefined,
  /** Whether the row with this id is open at first. */
  openAtFirst: (id: string) => boolean,
): TreeState {
  const [open, setOpenRows] = useState(NONE_OPENED);
  const [request, setRequest] = useState<TreeRequest>();
  const [own, setOwn] = useState<Selection>();
  const [seen, setSeen] = useState<{ selection: Selection; shown: boolean }>({
    selection,
    shown: false,
  });

  // Following a selection made elsewhere, or the one there is when the tree shows again: adjusting
  // state while rendering, so the tree draws the row's surroundings open in the same pass.
  const shown = placeOf !== undefined;
  if (seen.selection !== selection || seen.shown !== shown) {
    setSeen({ selection, shown });
    const place = placeOf && selection !== own ? placeOf(selection) : undefined;
    if (place) {
      const next = withOpen(open, place.outer, openAtFirst);
      if (next !== open) setOpenRows(next);
      setRequest({ id: place.id, focus: false, serial: (request?.serial ?? 0) + 1 });
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
    request,
    choose: (next) => {
      setOwn(next);
      select(next);
    },
    bringIntoView: (place, focus) => {
      setOpenRows((current) => withOpen(current, place.outer, openAtFirst));
      setRequest((last) => ({ id: place.id, focus, serial: (last?.serial ?? 0) + 1 }));
    },
  };
}

/** The open rows with these opened too; the same map when they all are already. */
function withOpen(
  open: ReadonlyMap<string, boolean>,
  ids: readonly string[],
  openAtFirst: (id: string) => boolean,
): ReadonlyMap<string, boolean> {
  const closed = ids.filter((id) => !(open.get(id) ?? openAtFirst(id)));
  if (closed.length === 0) return open;
  const next = new Map(open);
  for (const id of closed) next.set(id, true);
  return next;
}
