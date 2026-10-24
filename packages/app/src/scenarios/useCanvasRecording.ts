/**
 * The canvas's recording mode: while the open scenario records, the canvas hands each click on a
 * relation to the scenario session, and Enter on a selected relation records it too.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import type { CanvasController } from '../canvas/controller';
import type { ScenarioSession } from './session';

const never = () => () => undefined;
const no = () => false;

/** Whether clicks on relations record steps now; the canvas then hands them to the session. */
export function useCanvasRecording(
  controller: RefObject<CanvasController | null>,
  session: ScenarioSession | undefined,
): boolean {
  const recording = useSyncExternalStore(
    session?.subscribe ?? never,
    session ? () => session.getState().canRecord : no,
  );
  useEffect(() => {
    controller.current?.setRecorder(
      recording && session
        ? (relation, simultaneous) => session.record(relation, simultaneous)
        : undefined,
    );
  }, [controller, recording, session]);
  return recording;
}
