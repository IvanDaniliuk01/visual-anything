/**
 * The physical-space panel takes up the framings it is asked for (`SpacePanelStore.frame`): by Show
 * in physical space, by Claude's guidance and by scenario playback bringing a step into view. Each
 * asks the worker for the camera that frames those elements, or everything, from the camera's own
 * direction (`SpaceDrawing.fit`), moves the panel's camera there as a tour's moves (`moves.ts`), so
 * that the panel's state keeps it, and drops the request (`framed`), once.
 */
import type { Id } from '@visual-anything/schema';
import { useEffect, useRef, type RefObject } from 'react';
import type { SpaceDrawing } from '../solids/solid-client';
import { useSpaceFraming } from './context';
import type { SpacePanelStore } from './store';

export function useFramingRequests(
  store: SpacePanelStore,
  viewId: Id,
  drawing: RefObject<SpaceDrawing | undefined>,
  reducedMotion: boolean,
): void {
  const framing = useSpaceFraming(store, viewId);
  const reduced = useRef(reducedMotion);
  useEffect(() => {
    reduced.current = reducedMotion;
  });
  const taken = useRef<number>(undefined);
  useEffect(() => {
    const now = drawing.current;
    if (!framing || !now || taken.current === framing.serial) return;
    taken.current = framing.serial;
    const { elements, serial } = framing;
    void now
      .fit(elements.length > 0 ? elements : undefined)
      .then((camera) => {
        if (camera && store.state(viewId) !== undefined) {
          store.moves.move(viewId, camera, { reducedMotion: reduced.current });
        }
      })
      .finally(() => store.framed(viewId, serial));
  }, [framing, store, viewId, drawing]);
}
