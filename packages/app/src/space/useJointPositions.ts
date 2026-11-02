/**
 * The positions the physical-space panel's joint sliders give (ADR 0090), over the joints' own while
 * the panel is open, and never stored by themselves: set one by one as a slider moves, let go of once
 * kept, and glided back to the stored ones on the store's frames over {@link JOINT_GLIDE}, or at once
 * while motion is reduced (ADR 0076).
 */
import type { Id } from '@visual-anything/schema';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  JOINT_GLIDE,
  NO_POSITIONS,
  positionsBetween,
  type JointPositions,
  type ShownJoint,
} from './joints';
import type { SpacePanelStore } from './store';

export interface JointPositionsControl {
  /** The positions given now, over the joints' own. */
  readonly positions: JointPositions;
  /** Gives a joint a position, as its slider moves. */
  set(joint: Id, position: number): void;
  /** Lets go of every position given at once, as once they are kept. */
  clear(): void;
  /** Goes back to the stored positions: gliding there, or at once while motion is reduced. */
  back(joints: readonly ShownJoint[]): void;
}

export function useJointPositions(store: SpacePanelStore, reduced: boolean): JointPositionsControl {
  const [positions, setPositions] = useState<JointPositions>(NO_POSITIONS);
  const glide = useRef<number | undefined>(undefined);
  const latest = useRef(positions);
  useLayoutEffect(() => {
    latest.current = positions;
  });

  const stop = useCallback(() => {
    if (glide.current !== undefined) store.frames.cancel(glide.current);
    glide.current = undefined;
  }, [store]);
  useEffect(() => stop, [stop]);

  const set = useCallback(
    (joint: Id, position: number) => {
      stop();
      setPositions((last) => new Map(last).set(joint, position));
    },
    [stop],
  );

  const clear = useCallback(() => {
    stop();
    setPositions(NO_POSITIONS);
  }, [stop]);

  const back = useCallback(
    (joints: readonly ShownJoint[]) => {
      stop();
      const from = latest.current;
      if (reduced || from.size === 0) {
        setPositions(NO_POSITIONS);
        return;
      }
      const start = store.now();
      const step = () => {
        const share = (store.now() - start) / JOINT_GLIDE;
        if (share >= 1) {
          glide.current = undefined;
          setPositions(NO_POSITIONS);
          return;
        }
        setPositions(positionsBetween(joints, from, share));
        glide.current = store.frames.request(step);
      };
      glide.current = store.frames.request(step);
    },
    [store, reduced, stop],
  );

  return { positions, set, clear, back };
}
