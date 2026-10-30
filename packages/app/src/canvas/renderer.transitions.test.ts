/**
 * What the canvas does for a tour's transitions (ADR 0077): the capture of the last frame drawn, the
 * marks that fade in by their opacity, the next frame drawn, and the travelling marker's trail.
 */
import { Container, type Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import type { TextFactory } from './draw';
import { indexScene } from './hit';
import { CanvasRenderer } from './renderer';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

interface Inside {
  emphasisMarks: Graphics;
  arrivingMarks: Graphics;
  /** The group the arriving marks are drawn in, which fades by its opacity. */
  arriving: Container;
  markerMarks: Graphics;
  app: FakeApplication;
}

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function inside(renderer: CanvasRenderer): Inside {
  return renderer as unknown as Inside;
}

async function started(): Promise<{ renderer: CanvasRenderer; host: HTMLElement }> {
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
  return { renderer, host };
}

const sample = loadSample();
const indexed = indexScene(buildScene(sample, 'system-overview'));
const { scene } = indexed;
const line = scene.relations[0];
if (!line) throw new Error('The sample draws no relation.');

let time = 1000;

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  time = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('marks that arrive', () => {
  it('fade in by the opacity of their marks, never by their size, while the rest stay as they are', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setEmphasis({
      highlighted: new Set(['patient', line.relation]),
      arriving: { keys: new Set([line.relation]), duration: 200 },
    });
    const { emphasisMarks, arrivingMarks } = inside(renderer);
    expect(emphasisMarks.context.instructions.length).toBeGreaterThan(0);
    expect(arrivingMarks.context.instructions.length).toBeGreaterThan(0);
    expect(inside(renderer).arriving.alpha).toBe(0);
    expect(inside(renderer).arriving.isRenderGroup).toBe(true);
    expect(emphasisMarks.alpha).toBe(1);
    time += 100;
    renderer.renderNow();
    expect(inside(renderer).arriving.alpha).toBeCloseTo(0.5);
    expect(inside(renderer).arriving.scale.x).toBe(1);
    expect(arrivingMarks.scale.x).toBe(1);
    time += 150;
    renderer.renderNow();
    expect(inside(renderer).arriving.alpha).toBe(1);
  });

  it('draw their lines from their start, at full strength, then join the rest (ADR 0084)', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setEmphasis({
      highlighted: new Set([line.relation]),
      arriving: { keys: new Set([line.relation]), duration: 200, draw: 400 },
    });
    const drawing = (renderer as unknown as { lineDrawMarks: Graphics }).lineDrawMarks;
    // Nothing of the line yet: it draws from its start as time goes on.
    expect(drawing.context.instructions).toHaveLength(0);
    expect(inside(renderer).arrivingMarks.context.instructions).toHaveLength(0);
    time += 200;
    renderer.renderNow();
    expect(drawing.context.instructions.length).toBeGreaterThan(0);
    time += 250;
    renderer.renderNow();
    expect(drawing.context.instructions).toHaveLength(0);
    expect(inside(renderer).arrivingMarks.context.instructions.length).toBeGreaterThan(0);
  });

  it('are drawn with the rest once nothing arrives', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const lit = new Set(['patient', line.relation]);
    renderer.setEmphasis({ highlighted: lit });
    const settled = inside(renderer).emphasisMarks.context.instructions.length;
    renderer.setEmphasis({
      highlighted: lit,
      arriving: { keys: new Set([line.relation]), duration: 200 },
    });
    expect(inside(renderer).emphasisMarks.context.instructions.length).toBeLessThan(settled);
    renderer.setEmphasis({ highlighted: lit });
    expect(inside(renderer).emphasisMarks.context.instructions.length).toBe(settled);
    expect(inside(renderer).arrivingMarks.context.instructions).toHaveLength(0);
    expect(inside(renderer).arriving.alpha).toBe(1);
  });
});

describe('the travelling marker', () => {
  /** The opacity of each stroke drawn for the markers, in order. */
  function strokes(renderer: CanvasRenderer): number[] {
    return inside(renderer)
      .markerMarks.context.instructions.filter((each) => each.action === 'stroke')
      .map((each) => (each.data as { style: { alpha: number } }).style.alpha);
  }

  it('leaves a short trail behind it that fades away from it', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 0.25 }] });
    const still = strokes(renderer);
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 0.6, trail: 0.3 }] });
    const moving = strokes(renderer);
    // The disc's ring, as before, after the trail's pieces, each fainter the farther behind.
    expect(moving.length).toBeGreaterThan(still.length);
    const trail = moving.slice(0, moving.length - still.length);
    expect(trail.length).toBeGreaterThan(1);
    for (let at = 1; at < trail.length; at++) {
      expect(trail[at]).toBeGreaterThan(trail[at - 1] as number);
    }
    expect(trail.at(-1)).toBeLessThan(1);
  });

  it('leaves none where it stands still', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 1 }] });
    const still = strokes(renderer);
    renderer.setEmphasis({ markers: [{ relation: line.relation, progress: 1, trail: 1 }] });
    expect(strokes(renderer)).toEqual(still);
  });
});

describe('the capture of the last frame drawn', () => {
  function withContext() {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage }) as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
    return drawImage;
  }

  it('draws the frame now and copies it, at the screen’s size, over the canvas', async () => {
    const { renderer, host } = await started();
    renderer.show(indexed);
    const { app } = inside(renderer);
    app.canvas.width = 2400;
    app.canvas.height = 1600;
    const drawImage = withContext();
    const renders = app.renders;
    const capture = renderer.captureFrame();
    expect(capture).toBeInstanceOf(HTMLCanvasElement);
    expect(app.renders).toBe(renders + 1);
    expect(drawImage).toHaveBeenCalledWith(app.canvas, 0, 0);
    expect(capture?.width).toBe(2400);
    expect(capture?.height).toBe(1600);
    expect(capture?.getAttribute('aria-hidden')).toBe('true');
    expect(capture?.style.pointerEvents).toBe('none');
    // Over the canvas, and under a capture taken before it, which still fades over it.
    expect(capture?.previousElementSibling).toBe(app.canvas);
    const second = renderer.captureFrame();
    expect(second?.previousElementSibling).toBe(app.canvas);
    expect(second?.nextElementSibling).toBe(capture);
    expect(host.querySelectorAll('canvas')).toHaveLength(3);
  });

  it('finishes the marks fading in before it copies the frame', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    renderer.setEmphasis({
      highlighted: new Set([line.relation]),
      arriving: { keys: new Set([line.relation]), duration: 200 },
    });
    withContext();
    renderer.captureFrame();
    expect(inside(renderer).arriving.alpha).toBe(1);
  });

  it('is nothing where the page cannot copy a frame', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    expect(renderer.captureFrame()).toBeUndefined();
  });
});

describe('the next frame drawn', () => {
  it('is told once, after the canvas has drawn it, unless it is let go', async () => {
    const { renderer } = await started();
    renderer.show(indexed);
    const heard = vi.fn();
    const ignored = vi.fn();
    renderer.afterNextFrame(heard);
    renderer.afterNextFrame(ignored)();
    expect(heard).not.toHaveBeenCalled();
    renderer.renderNow();
    renderer.renderNow();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(ignored).not.toHaveBeenCalled();
  });
});
