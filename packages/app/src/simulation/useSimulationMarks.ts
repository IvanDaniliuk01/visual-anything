/**
 * The shell's hold on a tick's marks (`marks.ts`, ADR 0085): made once for the tab and its emphasis
 * store, and told what the open view draws, without rendering the shell as the marks move.
 */
import { useEffect, useRef } from 'react';
import type { EmphasisStore } from '../editor/emphasis';
import { SimulationMarks, type MarksContext } from './marks';
import type { SimulationStore } from './store';
import { BROWSER_FRAMES, type Frames } from './useSimulationStore';

export function useSimulationMarks(
  store: SimulationStore,
  emphasis: EmphasisStore,
  context: MarksContext | undefined,
  frames: Frames = BROWSER_FRAMES,
): void {
  const marks = useRef<SimulationMarks | undefined>(undefined);
  const latest = useRef(context);
  useEffect(() => {
    const made = new SimulationMarks(store, emphasis, frames);
    marks.current = made;
    made.setContext(latest.current);
    return () => {
      made.dispose();
      if (marks.current === made) marks.current = undefined;
    };
  }, [store, emphasis, frames]);
  useEffect(() => {
    latest.current = context;
    marks.current?.setContext(context);
  }, [context]);
}
