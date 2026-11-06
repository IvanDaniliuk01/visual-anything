/**
 * A secondary press on nothing opens the canvas's own menu, of Paste and Paste as duplicates (ADR
 * 0103), where it was, in the scene too; one on a shape opens the shape's menu, never the canvas's.
 */
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { CanvasController } from './controller';
import type { Point } from './geometry';
import { indexScene } from './hit';
import { buildScene } from './scene';
import { worldToScreen } from './camera';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'system-overview';

async function canvas() {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
  const canvasMenu = vi.fn<(at: Point, world: Point) => void>();
  const menu = vi.fn();
  const controller = new CanvasController(host, {
    select: () => undefined,
    command: () => Promise.resolve(true),
    relate: () => undefined,
    remove: () => undefined,
    rename: () => undefined,
    camera: () => undefined,
    failure: () => undefined,
    announce: () => undefined,
    menu,
    canvasMenu,
  });
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const project = loadSample();
  const indexed = indexScene(buildScene(project, VIEW));
  controller.update(project, VIEW, indexed, true);
  return { host, controller, indexed, canvasMenu, menu };
}

function pressSecondary(host: HTMLElement, at: Point) {
  fireEvent.pointerDown(host, { button: 2, pointerId: 1, clientX: at.x, clientY: at.y });
  fireEvent.contextMenu(host, { button: 2, clientX: at.x, clientY: at.y });
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the canvas’s menu', () => {
  it('opens on a secondary press on nothing, where it was', async () => {
    const { host, controller, indexed, canvasMenu, menu } = await canvas();
    // A point far from every shape, in the scene and so on screen.
    const right = Math.max(...indexed.scene.shapes.map((shape) => shape.rect.x + shape.rect.width));
    const bottom = Math.max(
      ...indexed.scene.shapes.map((shape) => shape.rect.y + shape.rect.height),
    );
    const world = { x: right + 400, y: bottom + 400 };
    const at = worldToScreen(controller.camera, world);
    pressSecondary(host, at);
    expect(menu).not.toHaveBeenCalled();
    expect(canvasMenu).toHaveBeenCalledOnce();
    const [opened, inScene] = canvasMenu.mock.calls[0] ?? [];
    expect(opened).toEqual(at);
    expect(inScene?.x).toBeCloseTo(world.x);
    expect(inScene?.y).toBeCloseTo(world.y);
  });

  it('never opens on a shape, whose own menu opens', async () => {
    const { host, controller, indexed, canvasMenu, menu } = await canvas();
    const shape = indexed.scene.shapes.find((each) => !each.holdsContents);
    if (!shape) throw new Error('No shape');
    const at = worldToScreen(controller.camera, {
      x: shape.rect.x + shape.rect.width / 2,
      y: shape.rect.y + shape.rect.height / 2,
    });
    pressSecondary(host, at);
    expect(canvasMenu).not.toHaveBeenCalled();
    expect(menu).toHaveBeenCalledOnce();
  });
});
