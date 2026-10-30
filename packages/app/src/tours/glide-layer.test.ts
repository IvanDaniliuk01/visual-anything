import { describe, expect, it, vi } from 'vitest';
import type { ElementShape, Scene } from '../canvas/scene';
import {
  GlideLayer,
  drawGlideFrame,
  glideSideOf,
  readableOn,
  type GlideContext,
  type GlideItem,
  type GlideSurface,
} from './glide-layer';

function shape(key: string, parts: Partial<ElementShape> = {}): ElementShape {
  return {
    key,
    element: key.split('/').at(-1) as string,
    kind: 'rectangle',
    fill: '#ffffff',
    stroke: '#333333',
    name: key,
    rect: { x: 0, y: 0, width: 100, height: 40 },
    ...parts,
  } as ElementShape;
}

const SCREEN = { width: 800, height: 600 };

describe('glideSideOf', () => {
  it('takes the element shapes on screen, but rows, parts in a drawing and what is hidden', () => {
    const scene = {
      shapes: [
        shape('world/case'),
        shape('world/case/id', { row: 0 }),
        shape('world/arm/joint', { part: { inDrawing: true } as ElementShape['part'] }),
        shape('world/hidden'),
        shape('world/far', { rect: { x: 5000, y: 0, width: 10, height: 10 } }),
        shape('world/dark', { dark: { fill: '#000000', stroke: '#ffffff' } }),
      ],
    } as unknown as Scene;
    const side = glideSideOf(scene, { x: 10, y: 20, scale: 2 }, SCREEN, {
      hidden: new Set(['world/hidden']),
    });
    expect(side.shapes.map((each) => each.path)).toEqual(['world/case', 'world/dark']);
    expect(side.shapes[0]).toEqual({
      element: 'case',
      path: 'world/case',
      rect: { x: 10, y: 20, width: 200, height: 80 },
    });
    expect(side.looks[1]).toMatchObject({
      dark: { fill: '#000000', stroke: '#ffffff' },
      name: 'world/dark',
    });
  });
});

/** A context that records what is drawn. */
function recorder(): GlideContext & { calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((each) => JSON.stringify(each)).join(',')})`);
    };
  return {
    calls,
    setTransform: record('setTransform'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    roundRect: record('roundRect'),
    ellipse: record('ellipse'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  };
}

const ITEM: GlideItem = {
  from: { x: 0, y: 0, width: 100, height: 40 },
  to: { x: 200, y: 100, width: 200, height: 80 },
  look: { kind: 'rectangle', fill: '#ffffff', stroke: '#333333', name: 'Case' },
};

describe('drawGlideFrame', () => {
  it('draws the background, then each shape between its places with its name', () => {
    const context = recorder();
    drawGlideFrame(context, [ITEM], 0.5, {
      background: '#fafafa',
      resolution: 2,
      size: SCREEN,
    });
    expect(context.calls).toEqual([
      'setTransform(2,0,0,2,0,0)',
      'fillRect(0,0,800,600)',
      'beginPath()',
      'rect(100,50,150,60)',
      'fill()',
      'stroke()',
      'fillText("Case",175,80)',
    ]);
  });

  it('cuts a name too long for its shape, and writes none in a shape too small', () => {
    const context = recorder();
    drawGlideFrame(
      context,
      [
        {
          ...ITEM,
          look: { ...ITEM.look, name: 'A very long table name indeed, longer than its box' },
        },
        {
          ...ITEM,
          to: { x: 0, y: 0, width: 10, height: 10 },
          from: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
      1,
      { background: '#fff', resolution: 1, size: SCREEN },
    );
    const texts = context.calls.filter((call) => call.startsWith('fillText'));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/…"/);
  });

  it('follows free geometry, scaled to where the shape is', () => {
    const context = recorder();
    drawGlideFrame(
      context,
      [
        {
          from: { x: 0, y: 0, width: 10, height: 10 },
          to: { x: 0, y: 0, width: 10, height: 10 },
          look: {
            ...ITEM.look,
            contours: [new Float64Array([0, 0, 20, 0, 20, 20])],
            size: { width: 20, height: 20 },
          },
        },
      ],
      1,
      { background: '#fff', resolution: 1, size: SCREEN },
    );
    expect(context.calls).toContain('moveTo(0,0)');
    expect(context.calls).toContain('lineTo(10,10)');
  });
});

describe('readableOn', () => {
  it('writes dark on light fills and white on dark ones', () => {
    expect(readableOn('#ffffff')).toBe('#1b1b1f');
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
  });
});

describe('GlideLayer', () => {
  it('moves on its clock, fades out and lets its canvas go', () => {
    const frames: ((time: number) => void)[] = [];
    const clock = {
      now: () => 0,
      request: (run: (time: number) => void) => frames.push(run),
      cancel: vi.fn(),
    };
    const context = recorder();
    const remove = vi.fn();
    const element = {
      setAttribute: vi.fn(),
      getContext: () => context,
      remove,
      style: { opacity: '1' },
      width: 10,
      height: 10,
    } as unknown as HTMLCanvasElement;
    const surface: GlideSurface = { element, background: '#fff', dark: false, resolution: 1 };
    const layer = new GlideLayer(surface, [ITEM], SCREEN, clock);
    expect(context.calls).toContain('rect(0,0,100,40)');
    layer.move(0, 100);
    frames.shift()?.(100);
    expect(context.calls.at(-4)).toBe('rect(200,100,200,80)');
    layer.fadeOut(100, 200);
    frames.shift()?.(200);
    expect(element.style.opacity).toBe('0.5');
    frames.shift()?.(300);
    expect(layer.gone).toBe(true);
    expect(remove).toHaveBeenCalled();
  });
});
