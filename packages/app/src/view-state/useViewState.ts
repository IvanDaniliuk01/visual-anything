/**
 * The shell's view state (core's `ViewState`, ADR-0030's addendum of 2026-10-25): what the tab's
 * address holds, what Copy address copies, and where search jumps.
 *
 * - **Opening an address.** The shell mounts once the local program has sent the project, which is
 *   after the launch code was redeemed (ADR-0030), so an address's state applies only then (the
 *   applier says in what order). An address the person brings later, as by pasting it into this
 *   tab's address bar, applies the same way. What cannot be read, or names what the project does not
 *   hold, is said in a notice.
 * - **Following.** The fragment follows the view state a moment after it last changed, replacing the
 *   tab's history entry, and waits while an address applies.
 */
import type { ViewState } from '@visual-anything/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useReducedMotion } from '../scenarios/motion';
import { AddressFollower, addressOf, fragmentOf, readAddress, type AddressWindow } from './address';
import { UNREADABLE, ViewStateApplier, fill, type ApplyContext, type GoTo } from './applier';
import { cameraOf, viewStateOf } from './state';

export type { GoTo, Shown } from './applier';

/** What the shell gets: the address of the view state as it is now, and a way to go elsewhere. */
export interface ViewStateLink {
  /** The address that opens the view state as it is now, and whether its selection was too large. */
  address: () => { address: string; selectionLeftOut: boolean } | undefined;
  goTo: (request: GoTo) => void;
  /** The view state as it is now, as a tour's Add step takes it (ADR 0058); none without a view. */
  current: () => ViewState | undefined;
}

/** The shell as the view state reads and changes it; whether motion is reduced it finds itself. */
export type ViewStateInput = Omit<ApplyContext, 'reduced'> & {
  /** The tab whose address it reads and writes; this one by default. */
  target?: AddressWindow;
};

export function useViewState(input: ViewStateInput): ViewStateLink {
  const { viewId, scene, selection, explore, scenarios, canvas } = input;
  const target = input.target ?? window;
  const reduced = useReducedMotion();
  const [follower] = useState(() => new AddressFollower(target));
  const [applier] = useState(() => new ViewStateApplier((busy) => follower.pause(busy)));
  const latest = useRef<ApplyContext>({ ...input, reduced });
  useLayoutEffect(() => {
    latest.current = { ...input, reduced };
  });

  const playing = useSyncExternalStore(scenarios.subscribe, scenarios.getState);
  const cameraReady = useSyncExternalStore(
    canvas?.subscribe ?? noSubscription,
    () => canvas?.camera() !== undefined,
  );

  // The fragment follows the view state, from the shell's state as it is when it is written.
  useEffect(() => {
    follower.follow(() => composed(latest.current)?.state);
    return () => follower.stop();
  }, [follower]);

  // The address this tab opened with applies once, now that the project is here; StrictMode's
  // second mount finds it applied.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const read = readAddress(target);
    if (!read.ok) latest.current.notify?.('warning', fill(UNREADABLE, read.message));
    else if (read.state) applier.goTo({ kind: 'address', state: read.state }, latest.current);
  }, [applier, target]);

  // An address brought to this tab, as by pasting it into the address bar, applies as one opened.
  useEffect(() => {
    const events = target as Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>>;
    if (typeof events.addEventListener !== 'function') return;
    const onHashChange = () => {
      if (follower.wrote(fragmentOf(target))) return;
      const read = readAddress(target);
      if (!read.ok) latest.current.notify?.('warning', fill(UNREADABLE, read.message));
      else if (read.state) applier.goTo({ kind: 'address', state: read.state }, latest.current);
    };
    events.addEventListener('hashchange', onHashChange);
    return () => events.removeEventListener?.('hashchange', onHashChange);
  }, [target, follower, applier]);

  // Each change lets a request on its way take its next step, and the fragment follow.
  useEffect(() => {
    applier.sync(latest.current);
    follower.changed();
  }, [applier, follower, viewId, scene, selection, explore, playing, canvas, cameraReady]);
  useEffect(() => canvas?.subscribe(() => follower.changed()), [follower, canvas]);

  return useMemo<ViewStateLink>(
    () => ({
      address: () => {
        const now = composed(latest.current);
        return now === undefined
          ? undefined
          : { address: addressOf(target, now.state), selectionLeftOut: now.selectionLeftOut };
      },
      goTo: (request) => applier.goTo(request, latest.current),
      current: () => composed(latest.current)?.state,
    }),
    [applier, target],
  );
}

/** The view state of the shell as it is now. */
function composed(now: ApplyContext): ReturnType<typeof viewStateOf> | undefined {
  if (now.viewId === undefined) return undefined;
  const camera = now.canvas?.camera();
  const playing = now.scenarios.getState();
  return viewStateOf({
    project: now.project,
    viewId: now.viewId,
    camera: camera && now.canvas ? cameraOf(camera, now.canvas.viewport()) : undefined,
    selection: now.selection,
    filters: now.explore.filters,
    focus: now.explore.focus,
    scenario:
      playing.scenario === undefined ? undefined : { id: playing.scenario, step: playing.step },
  });
}

const noSubscription = () => () => undefined;
