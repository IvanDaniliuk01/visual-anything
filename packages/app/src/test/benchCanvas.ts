/**
 * The canvas benchmark's page as its tests wire it in jsdom: a canvas controller on a host of
 * 1200 by 800 pixels, started on PixiJS's fake application, showing a project, with what the
 * benchmark's phases ask of the page (`bench/main.ts` wires the same for the browser). The test file
 * mocks `pixi.js` with `FakeApplication`, as every canvas test does.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { BeyondBench } from '../bench/beyond';
import { measureFrames, type BenchMode } from '../bench/frames';
import { CanvasController, type ControllerOptions } from '../canvas/controller';
import { centerOf } from '../canvas/geometry';
import { indexScene, type IndexedScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import type { SolidClient } from '../solids/client';
import { FakeApplication } from './FakeApplication';

const settle = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * A canvas showing `start`'s view, and the commands its gestures sent; with `solids`, it draws
 * solids through that client (ADR 0075), its pictures made on `images` and its text by `text` when given.
 */
export async function benchCanvas(
  start: ProjectSnapshot,
  view: string,
  mode: BenchMode,
  solids?: SolidClient,
  images?: ControllerOptions['images'],
  text?: ControllerOptions['text'],
): Promise<{ bench: BeyondBench; sent: Command[] }> {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  let commandsTo: ((command: Command) => Promise<boolean>) | undefined;
  const sent: Command[] = [];
  const controller = new CanvasController(
    host,
    {
      select: () => undefined,
      command: (command) => {
        sent.push(command);
        return commandsTo?.(command) ?? Promise.resolve(false);
      },
      relate: () => undefined,
      remove: () => undefined,
      rename: () => undefined,
      camera: () => undefined,
      // jsdom draws no text: the labels the frames write fail, as the canvas reports.
      failure: () => undefined,
    },
    {
      firstFit: 'whole',
      ...(solids ? { solids } : {}),
      ...(images ? { images } : {}),
      ...(text ? { text } : {}),
    },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  let project = start;
  let indexed: IndexedScene = indexScene(buildScene(project, view));
  controller.update(project, view, indexed, false);
  const { scene } = indexed;
  const measuring = {
    renderer: controller.renderer,
    mode,
    pictures: true,
    nextTask: () => settle(0),
  };
  const bench: BeyondBench = {
    controller,
    host,
    view,
    project: () => project,
    indexed: () => indexed,
    show: (next, editable = false) => {
      const began = performance.now();
      const built = buildScene(next, view);
      const builtAt = performance.now();
      indexed = indexScene(built);
      const indexedAt = performance.now();
      controller.update(next, view, indexed, editable);
      controller.renderer.renderNow(true);
      project = next;
      return {
        build: builtAt - began,
        index: indexedAt - builtAt,
        draw: performance.now() - indexedAt,
      };
    },
    measure: (name, count, step, steps) => measureFrames(measuring, name, count, step, steps),
    settle,
    move: (camera) => controller.renderer.setCamera(camera),
    cameraAt: (scale) => {
      const { width, height } = controller.renderer.viewport;
      const middle = scene.bounds ? centerOf(scene.bounds) : { x: 0, y: 0 };
      return { scale, x: width / 2 - middle.x * scale, y: height / 2 - middle.y * scale };
    },
    takeCommands: (handler) => {
      commandsTo = handler;
    },
  };
  return { bench, sent };
}
