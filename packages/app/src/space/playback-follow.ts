/**
 * Scenario playback brings the step it plays into view in the physical-space panel (ADR 0076, ADR
 * 0031's clarification of 2026-10-26), as the canvas's follower does (`scenarios/follow.ts`): when
 * the step's ends are not all in the panel's frame, where its exploded view drew them, the panel
 * frames them (`SpacePanelStore.frame`), and its camera moves there as a tour's does, eased or cut
 * (`travel.ts`). A step the person or Claude asks for always comes into view; while playback goes on
 * by itself, it stops doing so once the person moves the panel's camera, until they play or step
 * again. The first step it is told of, and a step an address or a tour puts there, which place the
 * camera themselves, move nothing.
 */
import { pointInSpace, type Space } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { spaceProjection } from './camera';
import type { SpaceDrawn } from './moves';
import type { SpacePanelStore } from './store';

/** How much of the frame, at each side, a point brought into view keeps clear of. */
export const SPACE_FOLLOW_MARGIN = 0.06;

/** A step of playback as the panel's follower is told of it. */
export interface SpacePlayedStep {
  /** Which scenario, view and step: a new value is a new step. */
  key: string;
  /** The view whose panel shows it. */
  viewId: Id;
  /** What the panel shows, and the elements in it that the step plays between. */
  space: Space;
  elements: readonly Id[];
  /** Whether playback plays on by itself now, rather than stepping or paused. */
  playing: boolean;
}

/**
 * Whether every point of these elements is in the frame the panel last drew, clear of its edges:
 * where that frame drew them, moved as far as its exploded view moved them.
 */
export function inSpaceView(
  drawn: SpaceDrawn,
  space: Space,
  elements: readonly Id[],
  margin = SPACE_FOLLOW_MARGIN,
): boolean {
  const project = spaceProjection(drawn.camera, drawn.aspect);
  return elements.every((element) => {
    const point = pointInSpace(space, element);
    if (!point) return true;
    const shift = drawn.shifts?.get(element);
    const at = project(
      shift ? { x: point.x + shift.x, y: point.y + shift.y, z: point.z + shift.z } : point,
    );
    return (
      at.depth > 0 && at.x >= margin && at.x <= 1 - margin && at.y >= margin && at.y <= 1 - margin
    );
  });
}

export class SpacePlaybackFollower {
  private following = true;
  private last: SpacePlayedStep | undefined;
  private asks: number | undefined;
  private seen: { viewId: Id; camera: unknown } | undefined;

  constructor(private readonly store: SpacePanelStore) {}

  /** Watches the panel's camera, which the person may move, until the function it returns is called. */
  attach(): () => void {
    return this.store.subscribe(() => this.panelChanged());
  }

  /**
   * Playback is on `step` now, or on none, and the person or Claude have asked for a step `asks`
   * times (`ScenarioSession.getAsks`).
   */
  show(step: SpacePlayedStep | undefined, asks: number): void {
    const first = this.asks === undefined;
    const asked = !first && asks > (this.asks ?? 0);
    this.asks = asks;
    const last = this.last;
    this.last = step;
    if (step) this.seen = { viewId: step.viewId, camera: this.store.state(step.viewId)?.camera };
    if (!step || first) return;
    const playedOn = step.playing && last !== undefined && last.key !== step.key;
    if (asked) this.following = true;
    else if (!playedOn) return;
    if (this.following) this.bringIntoView(step);
  }

  private bringIntoView(step: SpacePlayedStep): void {
    if (step.elements.length === 0 || this.store.state(step.viewId) === undefined) return;
    const drawn = this.store.moves.drawn(step.viewId);
    if (drawn && inSpaceView(drawn, step.space, step.elements)) return;
    this.store.frame(step.viewId, step.elements);
  }

  /** The panel changed: a camera that no move put there is the person's, which stops following. */
  private panelChanged(): void {
    const seen = this.seen;
    if (!seen) return;
    const camera = this.store.state(seen.viewId)?.camera;
    if (camera === seen.camera) return;
    this.seen = { viewId: seen.viewId, camera };
    if (camera === undefined || this.store.moves.byMove(seen.viewId, camera)) return;
    if (this.last?.playing) this.following = false;
  }
}
