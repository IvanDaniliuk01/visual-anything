/**
 * The canvas marks what is hovered elsewhere (ADR 0076): an element the physical-space panel, the
 * outline or the element list hovers is marked in each of its shapes, as the shape under the pointer
 * is, beside it, and the mark goes when the hover does.
 */
import { Container, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionOf } from '../editor/selection';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { workcell } from '../test/space';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const named: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

async function started(): Promise<CanvasRenderer> {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  const renderer = new CanvasRenderer(
    host,
    {
      onFailure: (error) => {
        throw error;
      },
    },
    { text: named },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

const hoverMark = (renderer: CanvasRenderer) =>
  (renderer as unknown as { hoverMark: Graphics }).hoverMark.context.instructions.length;

describe('the hover marked from elsewhere', () => {
  it('marks every shape of the element hovered elsewhere, beside the one under the pointer', async () => {
    const project = workcell();
    const indexed = indexScene(buildScene(project, 'cell-view'));
    const renderer = await started();
    renderer.show(indexed);
    expect(hoverMark(renderer)).toBe(0);
    const table = indexed.byElement.get('table')?.map((shape) => shape.key) ?? [];
    expect(table.length).toBeGreaterThan(0);
    renderer.setLinkedHover('table');
    expect(renderer.hoverMarked).toEqual(table);
    expect(hoverMark(renderer)).toBeGreaterThan(0);
    const lamp = indexed.byElement.get('lamp')?.[0]?.key as string;
    renderer.setSelection(selectionOf([]), lamp);
    expect(renderer.hoverMarked).toEqual([lamp, ...table]);
    renderer.setLinkedHover(undefined);
    renderer.setSelection(selectionOf([]), undefined);
    expect(renderer.hoverMarked).toEqual([]);
    expect(hoverMark(renderer)).toBe(0);
  });
});
