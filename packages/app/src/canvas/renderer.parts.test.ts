/**
 * The renderer's part layer (ADR 0067): drawn above the element shapes and under package code's
 * drawings and the relations, it follows the scene shown, the emphasis and a drag, and the zoom.
 */
import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { beyondBoxes } from '../test/beyond';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import type { PartLayer } from './partsDraw';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface Inside {
  world: Container;
  elementShapes: Container;
  partLayer: PartLayer & {
    drawn: {
      marks: { parts: { shape: { key: string }; ownPicture: boolean; veiled: boolean }[] };
    }[];
  };
  codeDrawings: { container: Container };
}

const counting: TextFactory = (options) => {
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
    { text: counting, firstFit: 'whole' },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  return renderer;
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('the part layer of the renderer', () => {
  it('lies between the element shapes and package code’s drawings, and follows the emphasis and a drag', async () => {
    const renderer = await started();
    const look = renderer as unknown as Inside;
    const indexed = indexScene(buildScene(beyondBoxes(), 'anatomy'));
    renderer.show(indexed);
    const children = look.world.children;
    expect(children.indexOf(look.partLayer.container)).toBe(
      children.indexOf(look.elementShapes) + 1,
    );
    expect(children.indexOf(look.codeDrawings.container)).toBe(
      children.indexOf(look.partLayer.container) + 1,
    );
    expect(look.partLayer.drawings).toBe(1);

    renderer.setEmphasis({ dimmed: new Set(['body', 'body/right']) });
    const parts = () =>
      look.partLayer.drawn[0]?.marks.parts.map((each) => [
        each.shape.key,
        each.ownPicture,
        each.veiled,
      ]);
    expect(parts()).toEqual([
      ['body/left', true, false],
      ['body/right', false, false],
    ]);
    renderer.setEmphasis({ dimmed: new Set(['body/left']) });
    expect(parts()).toEqual([
      ['body/left', false, true],
      ['body/right', false, false],
    ]);

    // A drag of the drawing takes its parts' marks with it, and gives them back.
    const drag = renderer.startDrag(new Set(['body', 'body/left', 'body/right']), new Set());
    expect(look.partLayer.drawings).toBe(0);
    renderer.endDrag(drag);
    expect(look.partLayer.drawings).toBe(1);
    renderer.destroy();
  });
});
