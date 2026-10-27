/**
 * Gestures the canvas benchmark makes as a person would, through the canvas's own pointer handling,
 * with the canvas editable: a click that selects, a shape dragged and dropped, and a shape resized by
 * a handle (ADR 0074), the alignment guides showing as it goes. Each drag or resize is measured as:
 * - its frames, one pointer move a frame, judged by the frame budget;
 * - what letting go sends, which goes through the core and is shown once the canvas has heard that
 *   it was applied, as when the local program answers: timed from the operations to the frame drawn,
 *   as one edit is (components.md §3.9), with the release's own work and the core's command noted
 *   apart.
 * The pointer goes out and back, and lets go a little to one side and then the other, so that each
 * gesture changes the shape a little and the next puts it back.
 */
import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { selectionOf } from '../editor/selection';
import { screenToWorld, worldToScreen, type Camera } from '../canvas/camera';
import { HIT_TOLERANCE, type CanvasController } from '../canvas/controller';
import type { Point } from '../canvas/geometry';
import { hitAt, type IndexedScene } from '../canvas/hit';
import { handlePoint, sizeTakenBy } from '../canvas/resize';
import type { ElementShape } from '../canvas/scene';
import type { ShapeEditOverlay } from '../canvas/shapeEditMarks';
import type { FrameSteps } from './frames';
import type { FramePhase, TimedAction } from './overlays';

/** What the gestures need of the benchmark's page. */
export interface GestureBench {
  controller: CanvasController;
  /** The element the canvas listens to the pointer on. */
  host: HTMLElement;
  project(): ProjectSnapshot;
  indexed(): IndexedScene;
  /** Shows a project as the app does after a change, editable or not, and what each part took. */
  show(next: ProjectSnapshot, editable?: boolean): { build: number; index: number; draw: number };
  measure(
    name: string,
    count: number,
    step: (frame: number) => void,
    steps?: FrameSteps,
  ): Promise<FramePhase>;
  settle(milliseconds: number): Promise<void>;
  move(camera: Camera): void;
  /** Takes the commands the canvas sends, from now on; with none, the canvas's commands fail. */
  takeCommands(handler: ((command: Command) => Promise<boolean>) | undefined): void;
}

/** How many gestures, of how many frames each, and how long to rest before them. */
export interface GesturePlan {
  gestures: number;
  frames: number;
  rest: number;
}

/** How long letting go may take, from the operations to the frame drawn, as an edit may (§3.9). */
export const LET_GO_MARK = 50;
/** How far the pointer goes out and back, in pixels, and how far from the press it lets go. */
const REACH = { out: 40, end: 12, wave: 10 };

/** What a series of gestures gave: the phase of their frames, the timed release, and a note. */
export interface GestureResults {
  phase: FramePhase;
  timed: TimedAction;
  note: string;
}

/** Selects the shape at a point of the screen, as a click does, and says how long it took. */
export function selectAt(
  controller: CanvasController,
  indexed: IndexedScene,
  point: Point,
): number {
  const began = performance.now();
  const { renderer } = controller;
  const world = screenToWorld(controller.camera, point);
  const hit = hitAt(
    indexed,
    world,
    HIT_TOLERANCE / controller.camera.scale,
    (shape) => renderer.showsOutline(shape.key),
    renderer.hiddenByEmphasis,
  );
  const id = hit?.kind === 'shape' ? hit.shape.element : undefined;
  controller.setSelection(selectionOf(id === undefined ? [] : [{ kind: 'element', id }]));
  return performance.now() - began;
}

/**
 * Sends the canvas a pointer event at a point of the canvas, as the mouse does: pressed with its
 * first button while it drags.
 */
export function pointer(host: HTMLElement, type: string, at: Point, pressed = false): void {
  const box = host.getBoundingClientRect();
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: box.left + at.x,
    clientY: box.top + at.y,
    button: 0,
    buttons: pressed ? 1 : 0,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  host.dispatchEvent(event);
}

/**
 * Where to press a shape so that the canvas finds it there, and not a line over it, on screen: its
 * outline's point well inside first, then points across its rectangle.
 */
export function pressPoint(bench: GestureBench, shape: ElementShape): Point | undefined {
  const { controller } = bench;
  const { renderer } = controller;
  const candidates: Point[] = [];
  for (let row = 1; row < 8; row++) {
    for (let column = 1; column < 8; column++) {
      candidates.push({
        x: shape.rect.x + (shape.rect.width * column) / 8,
        y: shape.rect.y + (shape.rect.height * row) / 8,
      });
    }
  }
  // The middle first, then the rest.
  candidates.sort(
    (a, b) =>
      Math.hypot(
        a.x - shape.rect.x - shape.rect.width / 2,
        a.y - shape.rect.y - shape.rect.height / 2,
      ) -
      Math.hypot(
        b.x - shape.rect.x - shape.rect.width / 2,
        b.y - shape.rect.y - shape.rect.height / 2,
      ),
  );
  const tolerance = HIT_TOLERANCE / controller.camera.scale;
  for (const world of candidates) {
    const hit = hitAt(
      bench.indexed(),
      world,
      tolerance,
      (each) => renderer.showsOutline(each.key),
      renderer.hiddenByEmphasis,
    );
    if (hit?.kind === 'shape' && hit.shape.key === shape.key) {
      return worldToScreen(controller.camera, world);
    }
  }
  return undefined;
}

/** How many relations are drawn on a shape. */
export function relationsOn(indexed: IndexedScene, shape: ElementShape): number {
  return indexed.scene.relations.filter(
    (line) =>
      (line.ends?.from.kind === 'shape' && line.ends.from.key === shape.key) ||
      (line.ends?.to.kind === 'shape' && line.ends.to.key === shape.key),
  ).length;
}

/**
 * Drags a shape `plan.gestures` times, pressing it where the canvas finds it, and drops it each time
 * a little to one side of where it was. `what` names it, from how many relations it has.
 */
export function measureDrags(
  bench: GestureBench,
  element: string | undefined,
  plan: GesturePlan,
  what: (relations: number) => string = () => 'a shape',
): Promise<GestureResults> {
  return measureGestures(bench, element, plan, {
    phase: (relations) => `Drag ${what(relations)}`,
    timed: (relations) => `Drop ${what(relations)}`,
    press: (shape) => pressPoint(bench, shape),
    along: (press, done, side) => ({
      x: press.x + side * (8 + Math.sin(done * Math.PI) * REACH.out + done * REACH.end),
      y: press.y + Math.sin(done * Math.PI * 2) * REACH.wave,
    }),
  });
}

/**
 * Resizes a shape `plan.gestures` times by its handle at its bottom right corner, or at its right side
 * for one whose width alone changes, selected alone, and lets go a little larger and then smaller
 * again: the guides show where its moving sides line up with the shapes beside it.
 */
export function measureResizes(
  bench: GestureBench,
  element: string | undefined,
  plan: GesturePlan,
  what: (relations: number) => string = () => 'a shape',
): Promise<GestureResults> {
  return measureGestures(bench, element, plan, {
    phase: (relations) => `Resize ${what(relations)}, guides shown`,
    timed: (relations) => `Resize ${what(relations)}: let go`,
    press: (shape) => {
      const taken = sizeTakenBy(shape);
      if (!taken) return undefined;
      bench.controller.setSelection(selectionOf([{ kind: 'element', id: shape.element }]));
      const handle = handlePoint(shape.rect, taken === 'width' ? 'e' : 'se');
      return worldToScreen(bench.controller.camera, handle);
    },
    along: (press, done, side) => {
      const reach = side * (6 + Math.sin(done * Math.PI) * REACH.out + done * REACH.end);
      return { x: press.x + reach, y: press.y + reach };
    },
  });
}

interface Gesture {
  phase(relations: number): string;
  timed(relations: number): string;
  /** Where on screen the gesture presses the shape, or none when it cannot take one now. */
  press(shape: ElementShape): Point | undefined;
  /** Where the pointer is on screen, `done` of the way through, going to one `side` or the other. */
  along(press: Point, done: number, side: 1 | -1): Point;
}

/** The gestures, each pressed, moved one frame at a time, let go, and its change applied. */
async function measureGestures(
  bench: GestureBench,
  element: string | undefined,
  plan: GesturePlan,
  gesture: Gesture,
): Promise<GestureResults> {
  const { controller, host } = bench;
  const shapeOf = () =>
    element === undefined ? undefined : bench.indexed().byElement.get(element)?.[0];
  const first = shapeOf();
  const relations = first ? relationsOn(bench.indexed(), first) : 0;
  const names = { phase: gesture.phase(relations), timed: gesture.timed(relations) };
  performance.mark(`phase ${names.phase}`);
  const frames: number[] = [];
  const times: number[] = [];
  const parts = { release: 0, core: 0, build: 0, index: 0, draw: 0, done: 0 };
  if (!first) {
    return {
      phase: { name: names.phase, frames },
      timed: { name: names.timed, times, mark: LET_GO_MARK },
      note: `${names.timed}: no such shape`,
    };
  }
  // The camera on the shape, where names show and its handles are large enough to grab.
  const { width, height } = controller.renderer.viewport;
  const { scale } = controller.camera;
  const centre = {
    x: first.rect.x + first.rect.width / 2,
    y: first.rect.y + first.rect.height / 2,
  };
  bench.move({ scale, x: width / 2 - centre.x * scale, y: height / 2 - centre.y * scale });
  bench.show(bench.project(), true);
  await bench.settle(plan.rest);

  const restoreCapture = withoutPointerCapture(host);
  const guides = watchGuides(controller);
  try {
    for (let each = 0; each < plan.gestures; each++) {
      const shape = shapeOf();
      const press = shape && gesture.press(shape);
      if (!press) break;
      const side = each % 2 === 0 ? 1 : -1;
      const at = (frame: number) =>
        gesture.along(press, plan.frames > 1 ? frame / (plan.frames - 1) : 1, side);
      let applied: Promise<void> | undefined;
      bench.takeCommands((command) => {
        const began = performance.now();
        const outcome = executeCommand(bench.project(), command);
        parts.core += performance.now() - began;
        if (!outcome.ok) return Promise.resolve(false);
        applied = new Promise<void>((resolve) => {
          // After the canvas has heard that it was applied, as when the local program answers.
          setTimeout(() => {
            const from = performance.now();
            const next = applyOperations(bench.project(), outcome.operations).state;
            const taken = bench.show(next, true);
            times.push(performance.now() - from);
            parts.build += taken.build;
            parts.index += taken.index;
            parts.draw += taken.draw;
            parts.done += 1;
            resolve();
          }, 0);
        });
        return Promise.resolve(true);
      });
      pointer(host, 'pointerdown', press, true);
      const phase = await bench.measure(names.phase, plan.frames, (frame) =>
        pointer(host, 'pointermove', at(frame), true),
      );
      frames.push(...phase.frames);
      // The release's own work, the core's command it sends left out.
      const released = performance.now();
      const coreBefore = parts.core;
      pointer(host, 'pointerup', at(plan.frames - 1));
      parts.release += performance.now() - released - (parts.core - coreBefore);
      bench.takeCommands(undefined);
      if (applied) await applied;
      await bench.settle(Math.min(plan.rest, 50));
    }
  } finally {
    restoreCapture();
    bench.takeCommands(undefined);
  }
  const shown = guides.stop();
  const average = (total: number) => (total / Math.max(1, parts.done)).toFixed(1);
  return {
    phase: { name: names.phase, frames },
    timed: {
      name: names.timed,
      times,
      mark: LET_GO_MARK,
      note: `from the operations to the frame drawn: scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average; before them, the release took ${average(parts.release)} ms and the core's command ${average(parts.core)} ms`,
    },
    note: `${names.phase}: ${parts.done} of ${plan.gestures} applied, each after ${plan.frames} frames; guides drawn in ${shown.withGuides} of the ${shown.updates} changes of the marks`,
  };
}

/**
 * Leaves pointer capture out while the benchmark's events go to the canvas: they stand for no pointer
 * the browser knows, which it could not capture. Gives back what puts it back.
 */
function withoutPointerCapture(host: HTMLElement): () => void {
  const methods = ['setPointerCapture', 'releasePointerCapture'] as const;
  const own = methods.map((method) => Object.getOwnPropertyDescriptor(host, method));
  for (const method of methods) {
    Object.defineProperty(host, method, { configurable: true, value: () => undefined });
  }
  return () =>
    methods.forEach((method, at) => {
      const descriptor = own[at];
      if (descriptor) Object.defineProperty(host, method, descriptor);
      else Reflect.deleteProperty(host, method);
    });
}

/** Counts the changes of the resize and guide marks the canvas draws, and those that show guides. */
function watchGuides(controller: CanvasController): {
  stop(): { updates: number; withGuides: number };
} {
  const { renderer } = controller;
  const counts = { updates: 0, withGuides: 0 };
  const own = Object.getOwnPropertyDescriptor(renderer, 'setShapeEditOverlay');
  const draw = renderer.setShapeEditOverlay.bind(renderer);
  Object.defineProperty(renderer, 'setShapeEditOverlay', {
    configurable: true,
    writable: true,
    value: (overlay: ShapeEditOverlay | undefined) => {
      counts.updates += 1;
      if ((overlay?.guides?.length ?? 0) > 0) counts.withGuides += 1;
      draw(overlay);
    },
  });
  return {
    stop: () => {
      if (own) Object.defineProperty(renderer, 'setShapeEditOverlay', own);
      else Reflect.deleteProperty(renderer, 'setShapeEditOverlay');
      return counts;
    },
  };
}
