/**
 * The positions the physical-space panel shows its joints at (ADR 0090), over the joints' own: those
 * of the panel's state (`ViewSpace.joints`), which its sliders, a tour's step and an address give, and
 * under them those the simulations shown answer at their tick (ADR 0085). None is ever stored by
 * itself: a slider sets its joint's position in the panel's state, "Keep these positions" stores them
 * and lets them go, and "Back to stored positions" lets them go, gliding back on the store's frames
 * over {@link JOINT_GLIDE}, or at once while motion is reduced (ADR 0076). Since they are the panel's
 * state, an address and a tour's step taken from the tab carry them.
 */
import type { Id } from '@visual-anything/schema';
import { useCallback, useMemo } from 'react';
import { useSpacePanelState } from './context';
import { withJoints } from './joint-glides';
import {
  JOINT_GLIDE,
  NO_POSITIONS,
  positionsOfSaved,
  type JointPositions,
  type ShownJoint,
} from './joints';
import type { SpacePanelStore } from './store';

export interface JointPositionsControl {
  /** The positions shown now, over the joints' own. */
  readonly positions: JointPositions;
  /** Whether the panel's state gives positions that "Back to stored positions" can let go. */
  readonly given: boolean;
  /** Gives a joint a position, as its slider moves. */
  set(joint: Id, position: number): void;
  /** Lets go of every position given at once, as once they are kept. */
  clear(): void;
  /** Goes back to the stored positions: gliding there, or at once while motion is reduced. */
  back(joints: readonly ShownJoint[]): void;
}

/** The smooth step the joints glide back on. */
const smooth = (part: number) => part * part * (3 - 2 * part);

export function useJointPositions(
  store: SpacePanelStore,
  viewId: Id,
  reduced: boolean,
  simulated: JointPositions = NO_POSITIONS,
): JointPositionsControl {
  const saved = useSpacePanelState(store, viewId)?.joints;
  const positions = useMemo(() => {
    const own = positionsOfSaved(saved);
    if (simulated.size === 0) return own;
    if (own.size === 0) return simulated;
    return new Map([...simulated, ...own]);
  }, [saved, simulated]);

  const set = useCallback(
    (joint: Id, position: number) => {
      store.joints.stop(viewId);
      const space = store.state(viewId);
      if (!space) return;
      store.set(viewId, withJoints(space, { ...space.joints, [joint]: position }));
    },
    [store, viewId],
  );

  const clear = useCallback(() => {
    store.joints.stop(viewId);
    const space = store.state(viewId);
    if (space?.joints) store.set(viewId, withJoints(space, undefined));
  }, [store, viewId]);

  const back = useCallback(
    (joints: readonly ShownJoint[]) => {
      const stored = new Map(joints.map((joint) => [joint.element, joint.stored]));
      store.joints.glide(viewId, undefined, {
        duration: reduced ? 0 : JOINT_GLIDE,
        ease: smooth,
        stored: (joint) => stored.get(joint) ?? 0,
      });
    },
    [store, viewId, reduced],
  );

  return { positions, given: saved !== undefined, set, clear, back };
}
