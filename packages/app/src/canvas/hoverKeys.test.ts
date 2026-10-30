/**
 * A hover card opened from the keyboard (ADR 0082) goes away: Escape, the canvas losing the focus,
 * and the keys reaching a note or an arrow each tell the card that no shape is reached any longer.
 * The read-only page shows the card when the keys reach a shape, as the editor does.
 */
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { CanvasController } from './controller';
import { indexScene } from './hit';
import { buildScene } from './scene';
import { ViewerController } from '../viewer/controller';

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
  const hovered: (string | undefined)[] = [];
  const controller = new CanvasController(host, {
    select: () => undefined,
    command: () => Promise.resolve(true),
    relate: () => undefined,
    remove: () => undefined,
    rename: () => undefined,
    camera: () => undefined,
    failure: () => undefined,
    announce: () => undefined,
    hoverShape: (key) => hovered.push(key),
  });
  const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
  app.finishInit();
  await Promise.resolve();
  await Promise.resolve();
  const project = loadSample();
  const indexed = indexScene(buildScene(project, VIEW));
  controller.update(project, VIEW, indexed, true);
  const first = indexed.scene.shapes[0];
  if (!first) throw new Error('No shape');
  controller.setSelection(selectionOf([{ kind: 'element', id: first.element }]));
  return { host, hovered };
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

describe('a hover card opened from the keyboard', () => {
  it('goes away on Escape', async () => {
    const { host, hovered } = await canvas();
    fireEvent.keyDown(host, { key: 'ArrowRight' });
    expect(hovered.at(-1)).toBeTypeOf('string');
    fireEvent.keyDown(host, { key: 'Escape' });
    expect(hovered.at(-1)).toBeUndefined();
  });

  it('goes away when the canvas loses the focus', async () => {
    const { host, hovered } = await canvas();
    fireEvent.keyDown(host, { key: 'ArrowDown' });
    expect(hovered.at(-1)).toBeTypeOf('string');
    fireEvent.blur(host);
    expect(hovered.at(-1)).toBeUndefined();
  });
});

describe('the read-only page’s hover card from the keyboard', () => {
  async function page() {
    const host = document.createElement('div');
    host.tabIndex = 0;
    document.body.append(host);
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 });
    const hovered: (string | undefined)[] = [];
    const controller = new ViewerController(host, {
      select: () => undefined,
      collapse: () => undefined,
      camera: () => undefined,
      failure: () => undefined,
      announce: () => undefined,
      hoverShape: (key) => hovered.push(key),
    });
    const [app] = FakeApplication.created.slice(-1) as [FakeApplication];
    app.finishInit();
    await Promise.resolve();
    await Promise.resolve();
    const project = loadSample();
    const indexed = indexScene(buildScene(project, VIEW));
    controller.update(project, indexed);
    const first = indexed.scene.shapes[0];
    if (!first) throw new Error('No shape');
    controller.setSelection(selectionOf([{ kind: 'element', id: first.element }]));
    return { host, hovered };
  }

  it('shows when the keys reach a shape, and goes on Escape and on blur', async () => {
    const { host, hovered } = await page();
    fireEvent.keyDown(host, { key: 'ArrowRight' });
    expect(hovered.at(-1)).toBeTypeOf('string');
    fireEvent.keyDown(host, { key: 'Escape' });
    expect(hovered.at(-1)).toBeUndefined();
    fireEvent.keyDown(host, { key: 'ArrowDown' });
    expect(hovered.at(-1)).toBeTypeOf('string');
    fireEvent.blur(host);
    expect(hovered.at(-1)).toBeUndefined();
  });
});
