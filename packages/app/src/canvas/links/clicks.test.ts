/**
 * Clicks on the canvas (ADR 0098, stages 2 and 3): a click on a video, a press and release without a
 * drag, plays it as well as selecting it, and an added one does not; a click on a link card's address
 * line opens its address in a new tab, and one elsewhere on the card only selects it.
 */
import { fireEvent } from '@testing-library/react';
import type { ProjectSnapshot } from '@visual-anything/core';
import type { FreeShape } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../../test/FakeApplication';
import { loadSample } from '../../test/sample';
import { worldToScreen } from '../camera';
import { CanvasController } from '../controller';
import type { Point } from '../geometry';
import { indexScene } from '../hit';
import { CanvasRenderer } from '../renderer';
import { buildScene } from '../scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'system-overview';
const MEDIA = { hash: 'c'.repeat(64), width: 64, height: 36, bytes: 9 };

/** The sample with a video and a link card under everything its view draws. */
function withShapes(): ProjectSnapshot {
  const project = loadSample();
  const shapes = buildScene(project, VIEW).shapes;
  const left = Math.min(...shapes.map((shape) => shape.rect.x));
  const below = Math.max(...shapes.map((shape) => shape.rect.y + shape.rect.height)) + 100;
  const added: FreeShape[] = [
    {
      kind: 'picture',
      id: 'video',
      x: left,
      y: below,
      width: 160,
      height: 90,
      media: { ...MEDIA, format: 'mp4' },
    },
    {
      kind: 'link',
      id: 'guide',
      x: left + 300,
      y: below,
      width: 320,
      height: 112,
      url: 'https://example.org/intake',
      title: 'The intake guide',
    },
  ];
  return {
    ...project,
    views: project.views.map((view) =>
      view.id === VIEW ? { ...view, freeShapes: [...view.freeShapes, ...added] } : view,
    ),
  };
}

async function canvas() {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
  const select = vi.fn();
  const controller = new CanvasController(host, {
    select,
    command: () => Promise.resolve(true),
    relate: () => undefined,
    remove: () => undefined,
    rename: () => undefined,
    camera: () => undefined,
    failure: () => undefined,
    announce: () => undefined,
  });
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const project = withShapes();
  const indexed = indexScene(buildScene(project, VIEW));
  controller.update(project, VIEW, indexed, true);
  return { host, controller, select };
}

function click(host: HTMLElement, at: Point, more: { ctrlKey?: boolean } = {}) {
  const event = { button: 0, pointerId: 1, clientX: at.x, clientY: at.y, ...more };
  fireEvent.pointerDown(host, event);
  fireEvent.pointerUp(host, event);
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

describe('a click on a video', () => {
  it('plays it as it selects it, and an added click does not', async () => {
    const toggle = vi.spyOn(CanvasRenderer.prototype, 'toggleVideo');
    const { host, controller, select } = await canvas();
    const video = withShapes().views[0]!.freeShapes.find((shape) => shape.id === 'video');
    if (video?.kind !== 'picture') throw new Error('No video.');
    const middle = worldToScreen(controller.camera, {
      x: video.x + video.width / 2,
      y: video.y + video.height / 2,
    });
    click(host, middle);
    expect(toggle).toHaveBeenCalledExactlyOnceWith('video');
    expect(select).toHaveBeenCalled();
    click(host, middle, { ctrlKey: true });
    expect(toggle).toHaveBeenCalledOnce();
  });
});

describe('a click on a link card', () => {
  it('opens its address from its address line only, in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { host, controller } = await canvas();
    const card = withShapes().views[0]!.freeShapes.find((shape) => shape.id === 'guide');
    if (card?.kind !== 'link') throw new Error('No card.');
    // Its title, at its top: selected, not opened.
    click(host, worldToScreen(controller.camera, { x: card.x + 40, y: card.y + 20 }));
    expect(open).not.toHaveBeenCalled();
    // Its last line, where its host is written.
    const line = { x: card.x + 40, y: card.y + card.height - 8 };
    click(host, worldToScreen(controller.camera, line));
    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://example.org/intake',
      '_blank',
      'noopener,noreferrer',
    );
    // An added click selects, and opens nothing.
    click(host, worldToScreen(controller.camera, line), { ctrlKey: true });
    expect(open).toHaveBeenCalledOnce();
  });
});
