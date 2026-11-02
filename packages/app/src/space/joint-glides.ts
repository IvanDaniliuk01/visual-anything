/**
 * Glides of the physical-space panel's joints, for each view (ADR 0090): a tour's step and "Back to
 * stored positions" move the joints' positions the panel shows (`ViewSpace.joints`) from where they
 * are to where they go over a while, eased, by writing the panel's state on its frames, which the
 * panel hands to `spaceOf`. A glide stops when its panel closes, when another starts, or when anything
 * else changes the joints' positions, such as a slider; its camera moves on its own (`moves.ts`).
 */
import type { ViewSpace } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { savedJointsBetween, type SavedJoints } from './joints';
import type { MoveFrames, SpaceMovesHost } from './moves';

/** How a glide goes. */
export interface JointGlideOptions {
  /** In milliseconds; 0 or less puts the joints there at once. */
  readonly duration: number;
  /** The share of the way, eased, at each share of the time. */
  readonly ease: (part: number) => number;
  /** A joint's stored position, where one end of the way leaves it out. */
  readonly stored: (joint: Id) => number;
}

interface Running {
  frame: number | undefined;
}

/** The panel's state with joints' positions, or without any when none are given. */
export function withJoints(space: ViewSpace, joints: SavedJoints | undefined): ViewSpace {
  const rest = { ...space };
  delete rest.joints;
  return joints === undefined || Object.keys(joints).length === 0 ? rest : { ...rest, joints };
}

export class JointGlides {
  private readonly running = new Map<Id, Running>();

  constructor(
    private readonly host: SpaceMovesHost,
    private readonly frames: MoveFrames,
    private readonly now: () => number,
  ) {}

  /** Whether the joints of a view's panel are gliding. */
  gliding(viewId: Id): boolean {
    return this.running.has(viewId);
  }

  /**
   * Glides the joints of a view's open panel from the positions it shows to `to`, none for their
   * stored ones, as `options` say. A glide under way stops first; a closed panel moves nothing.
   */
  glide(viewId: Id, to: SavedJoints | undefined, options: JointGlideOptions): void {
    this.stop(viewId);
    const space = this.host.state(viewId);
    if (!space) return;
    const from = space.joints;
    if (options.duration <= 0) {
      this.host.set(viewId, withJoints(space, to));
      return;
    }
    const start = this.now();
    let last = from;
    const running: Running = { frame: undefined };
    const step = () => {
      running.frame = undefined;
      const now = this.host.state(viewId);
      // Another change of the joints, or the panel closing, ends the glide where it is.
      if (!now || now.joints !== last) {
        this.finish(viewId, running);
        return;
      }
      const part = Math.min(1, (this.now() - start) / options.duration);
      const next = withJoints(
        now,
        savedJointsBetween(from, to, part >= 1 ? 1 : options.ease(part), options.stored),
      );
      last = next.joints;
      this.host.set(viewId, next);
      if (part >= 1) this.finish(viewId, running);
      else running.frame = this.frames.request(step);
    };
    running.frame = this.frames.request(step);
    this.running.set(viewId, running);
  }

  /** Stops a glide of the view's panel's joints where they are. */
  stop(viewId: Id): void {
    const running = this.running.get(viewId);
    if (!running) return;
    if (running.frame !== undefined) this.frames.cancel(running.frame);
    this.running.delete(viewId);
  }

  private finish(viewId: Id, running: Running): void {
    if (running.frame !== undefined) this.frames.cancel(running.frame);
    if (this.running.get(viewId) === running) this.running.delete(viewId);
  }
}
