/**
 * How the canvas benchmark measures a phase of frames, in its two modes:
 * - work mode, the default, takes one step a frame, draws the frame at once and waits until the GPU
 *   has drawn it, recording what each frame's work took;
 * - frames mode records the time between frames as the browser shows them, the renderer drawing in
 *   its own frames.
 *
 * Where pictures decode while the phase runs, work mode lets the tasks waiting run between frames,
 * as they do in the app, and the canvas draws no frame of its own meanwhile.
 */
import type { CanvasRenderer } from '../canvas/renderer';
import type { FramePhase } from './overlays';

/** How the benchmark runs. */
export type BenchMode = 'work' | 'frames';

export interface FrameSteps {
  /** Runs before each step, with a frame of its own that is not recorded. */
  before?: () => void;
  /** After each step, frames go on being drawn and recorded while this says there is more to draw. */
  more?: () => boolean;
}

export interface FrameMeasuring {
  renderer: CanvasRenderer;
  mode: BenchMode;
  /** Whether pictures decode meanwhile, which work mode then lets arrive between frames. */
  pictures: boolean;
  /** Lets the tasks waiting run, and resumes. */
  nextTask: () => Promise<void>;
}

/**
 * Takes `count` steps, one a frame, and records what each frame took, and each frame after a step
 * while `more` says it still draws what the step started.
 */
export function measureFrames(
  { renderer, mode, pictures, nextTask }: FrameMeasuring,
  name: string,
  count: number,
  step: (frame: number) => void,
  { before, more }: FrameSteps = {},
): Promise<FramePhase> {
  // Where each phase starts, for the browser's performance tools.
  performance.mark(`phase ${name}`);
  if (mode === 'work') {
    const frames: number[] = [];
    const timed = (work: () => void) => {
      const began = performance.now();
      work();
      renderer.renderNow(true);
      frames.push(performance.now() - began);
    };
    const run = (frame: number) => {
      if (before) {
        before();
        renderer.renderNow(true);
      }
      timed(() => step(frame));
      while (more?.()) timed(() => undefined);
    };
    if (pictures) {
      // Pictures decode off the main thread and arrive between frames, as they do in the app; the
      // canvas draws no frame of its own meanwhile, so that every frame's work is measured.
      return (async () => {
        const own = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        Object.defineProperty(window, 'requestAnimationFrame', {
          configurable: true,
          writable: true,
          value: () => 0,
        });
        try {
          for (let frame = 0; frame < count; frame++) {
            run(frame);
            await nextTask();
          }
        } finally {
          if (own) Object.defineProperty(window, 'requestAnimationFrame', own);
          else Reflect.deleteProperty(window, 'requestAnimationFrame');
        }
        return { name, frames };
      })();
    }
    for (let frame = 0; frame < count; frame++) run(frame);
    return Promise.resolve({ name, frames });
  }
  return new Promise((resolve) => {
    const frames: number[] = [];
    let previous: number | undefined;
    let steps = 0;
    let readied = false;
    const tick = (now: number) => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      // The renderer draws what is left in its own frames, which are the ones measured meanwhile.
      if (more?.()) {
        requestAnimationFrame(tick);
        return;
      }
      if (steps >= count) {
        resolve({ name, frames });
        return;
      }
      if (before && !readied) {
        before();
        readied = true;
      } else {
        step(steps);
        steps += 1;
        readied = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
