/**
 * Moves of the physical-space panel's camera, for each view (ADR 0076): a tour's step, Claude's
 * guidance, framing and scenario playback move it as `travel.ts` says, eased over frames or at once,
 * by writing the panel's state, which the panel sends the worker. A move stops when its panel closes,
 * when another moves it there, or when anything else changes its camera, such as the person.
 *
 * It also keeps the camera each view's panel last drew from, which the worker answers with every
 * frame, so that a move from a panel whose state gives no camera starts where it looks.
 */
import type { ViewSpace } from '@visual-anything/core';
import type { Id, SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { spaceMove, type SpaceMove } from './travel';

/** What the moves read and write: the panel's store. */
export interface SpaceMovesHost {
  state(viewId: Id): ViewSpace | undefined;
  set(viewId: Id, space: ViewSpace): void;
}

/** The frames a move waits for. */
export interface MoveFrames {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

/**
 * Where a panel last drew from, the aspect of its frames, width over height, and the element its
 * state showed then, as its `root` names it, since a camera is in that element's coordinates; and how
 * far the exploded view moved each entry it moved in that frame (`SpaceFrameReply.shifts`), so that
 * what reads where things are in the frame reads them where they were drawn.
 */
export interface SpaceDrawn {
  readonly camera: SpaceCamera;
  readonly aspect: number;
  readonly root?: Id | undefined;
  readonly shifts?: ReadonlyMap<Id, SpacePoint> | undefined;
}

/** How a move goes: as `spaceMove` says, or not at all while the panel is closed. */
export type SpaceMoveKind = SpaceMove['kind'] | 'closed';

interface Running {
  frame: number | undefined;
  stop: () => void;
}

export class SpaceCameraMoves {
  private readonly drawnBy = new Map<Id, SpaceDrawn>();
  private readonly written = new Map<Id, SpaceCamera>();
  private readonly running = new Map<Id, Running>();

  constructor(
    private readonly host: SpaceMovesHost,
    private readonly frames: MoveFrames,
    private readonly now: () => number,
  ) {}

  /** Where the panel of a view last drew from; none before its first frame. */
  drawn(viewId: Id): SpaceDrawn | undefined {
    return this.drawnBy.get(viewId);
  }

  /** Keeps where the panel of a view drew its newest frame from. */
  setDrawn(viewId: Id, drawn: SpaceDrawn | undefined): void {
    if (drawn === undefined) this.drawnBy.delete(viewId);
    else this.drawnBy.set(viewId, drawn);
  }

  /** Whether a camera of a view's panel is the one a move put there last. */
  byMove(viewId: Id, camera: SpaceCamera | undefined): boolean {
    return camera !== undefined && this.written.get(viewId) === camera;
  }

  /** Whether a move of the view's panel is under way. */
  moving(viewId: Id): boolean {
    return this.running.has(viewId);
  }

  /**
   * Moves the open panel of a view to `to`, from its camera or else where it last drew from: eased
   * over frames, or at once, as `spaceMove` says. `sameRoot` false says that the panel has just come
   * to show another element, which cuts. A move under way stops first.
   */
  move(
    viewId: Id,
    to: SpaceCamera,
    options: { reducedMotion: boolean; sameRoot?: boolean },
  ): { kind: SpaceMoveKind; duration: number } {
    this.stop(viewId);
    const space = this.host.state(viewId);
    if (!space) return { kind: 'closed', duration: 0 };
    const drawn = this.drawnBy.get(viewId);
    // Where it last drew from counts only while it still shows what it showed then.
    const from = space.camera ?? (drawn?.root === space.root ? drawn?.camera : undefined);
    const move = spaceMove(from, to, {
      reducedMotion: options.reducedMotion,
      sameRoot: options.sameRoot ?? true,
    });
    if (move.kind !== 'ease') {
      if (space.camera !== to) this.write(viewId, to);
      return { kind: move.kind, duration: 0 };
    }
    const start = this.now();
    let last = this.write(viewId, move.at(0));
    const running: Running = { frame: undefined, stop: () => undefined };
    const step = () => {
      running.frame = undefined;
      // Another change of its camera, or of the panel, ends the move where it is.
      if (last === undefined || this.host.state(viewId)?.camera !== last) {
        this.finish(viewId, running);
        return;
      }
      const part = Math.min(1, (this.now() - start) / move.duration);
      last = this.write(viewId, part >= 1 ? to : move.at(part));
      if (part >= 1 || last === undefined) this.finish(viewId, running);
      else running.frame = this.frames.request(step);
    };
    running.stop = () => {
      if (running.frame !== undefined) this.frames.cancel(running.frame);
      running.frame = undefined;
    };
    running.frame = this.frames.request(step);
    this.running.set(viewId, running);
    return { kind: 'ease', duration: move.duration };
  }

  /** Stops a move of the view's panel where it is. */
  stop(viewId: Id): void {
    const running = this.running.get(viewId);
    if (!running) return;
    running.stop();
    this.running.delete(viewId);
  }

  /** Forgets a view's panel as it closes. */
  forget(viewId: Id): void {
    this.stop(viewId);
    this.drawnBy.delete(viewId);
    this.written.delete(viewId);
  }

  private finish(viewId: Id, running: Running): void {
    running.stop();
    if (this.running.get(viewId) === running) this.running.delete(viewId);
  }

  /** Puts the panel's camera there, keeping the rest of its state; none once it is closed. */
  private write(viewId: Id, camera: SpaceCamera): SpaceCamera | undefined {
    const space = this.host.state(viewId);
    if (!space) return undefined;
    this.written.set(viewId, camera);
    this.host.set(viewId, { ...space, camera });
    return camera;
  }
}
