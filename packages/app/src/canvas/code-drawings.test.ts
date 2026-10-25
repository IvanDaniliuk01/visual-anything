import type { Drawing } from '@visual-anything/core';
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CodeDrawingLayer, drawingArea, fitted, paintDrawing } from './code-drawings';
import type { ElementShape, Scene } from './scene';

function shape(extra: Partial<ElementShape> = {}): ElementShape {
  return {
    key: 'world/oven',
    element: 'oven',
    offset: { x: 0, y: 0 },
    positioned: 'placed',
    name: 'Oven',
    componentName: 'Thermometer',
    kind: 'rounded-rectangle',
    fill: '#FFFFFF',
    stroke: '#333333',
    rect: { x: 100, y: 200, width: 160, height: 120 },
    extent: { x: 100, y: 200, width: 160, height: 120 },
    holdsContents: false,
    ...extra,
  };
}

const gauge: Drawing = {
  width: 100,
  height: 50,
  items: [
    {
      kind: 'arc',
      x: 50,
      y: 50,
      radius: 40,
      from: 180,
      to: 360,
      stroke: '#888888',
      strokeWidth: 6,
    },
    {
      kind: 'line',
      points: [
        { x: 50, y: 50 },
        { x: 80, y: 20 },
      ],
    },
    { kind: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
    { kind: 'ellipse', x: 45, y: 45, width: 10, height: 10, fill: '#D33F49' },
    { kind: 'image', image: 'gauges.dial', x: 0, y: 0, width: 10, height: 10 },
    { kind: 'text', x: 50, y: 48, text: '72 °F', align: 'middle' },
  ],
};

function scene(shapes: ElementShape[]): Scene {
  return {
    shapes,
    drawing: shapes.map((_, at) => at),
    relations: [],
    notes: [],
    arrows: [],
    bounds: { x: 0, y: 0, width: 1000, height: 1000 },
  };
}

describe('drawingArea', () => {
  it('is the lower part of a shape, under its name', () => {
    expect(drawingArea(shape())).toEqual({ x: 106, y: 264, width: 148, height: 50 });
  });

  it('is none for rows, shapes that draw rows or hold others, pictures and shapes too small', () => {
    expect(drawingArea(shape({ row: 0 }))).toBeUndefined();
    expect(drawingArea(shape({ rowCount: 2 }))).toBeUndefined();
    expect(drawingArea(shape({ holdsContents: true }))).toBeUndefined();
    expect(drawingArea(shape({ plate: { x: 0, y: 0, width: 10, height: 10 } }))).toBeUndefined();
    expect(drawingArea(shape({ rect: { x: 0, y: 0, width: 20, height: 20 } }))).toBeUndefined();
    // A collapsed container draws one, as any shape that holds none.
    expect(drawingArea(shape({ holdsContents: true, collapsed: { contents: 3 } }))).toBeDefined();
  });
});

describe('fitted', () => {
  it('fits the drawing’s box keeping its proportions, centered', () => {
    expect(fitted(gauge, { x: 0, y: 0, width: 200, height: 50 })).toEqual({
      x: 50,
      y: 0,
      scale: 1,
    });
  });
});

describe('paintDrawing', () => {
  it('paints every item in the area, and writes its texts', () => {
    const graphics = new Graphics();
    const texts = paintDrawing(
      graphics,
      gauge,
      { x: 106, y: 264, width: 148, height: 50 },
      '#333333',
      (options) => {
        const text = new Container();
        text.label = String(options.text);
        return text;
      },
    );
    const bounds = graphics.getLocalBounds();
    expect(bounds.x).toBeGreaterThanOrEqual(100);
    expect(bounds.y).toBeGreaterThanOrEqual(255);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(260);
    expect(texts.map((each) => each.label)).toEqual(['72 °F']);
  });
});

describe('CodeDrawingLayer', () => {
  const screen = { width: 1200, height: 800 };
  const atOne = { x: 0, y: 0, scale: 1 };

  /** A clock that moves only when told, and turns run only when told. */
  function timing() {
    let time = 0;
    const turns: (() => void)[] = [];
    return {
      timing: {
        now: () => time,
        later: (callback: () => void) => turns.push(callback),
        cancel: () => {},
      },
      tick: (ms: number) => {
        time += ms;
      },
      turn: () => turns.shift()?.(),
      turns,
    };
  }

  it('draws only the shapes with a drawing, and builds again only what changed', () => {
    const layer = new CodeDrawingLayer();
    const oven = shape();
    const fridge = shape({
      key: 'world/fridge',
      element: 'fridge',
      rect: { x: 400, y: 200, width: 160, height: 120 },
    });
    layer.setCamera(atOne, screen, 0.45);
    layer.setScene(scene([oven, fridge]), new Set(), new Set());
    layer.setDrawings(new Map([['oven', gauge]]));
    expect(layer.count).toBe(1);
    expect(layer.builtCount).toBe(1);
    const drawn = layer.container.children[0]?.children[0];
    layer.setScene(scene([oven, fridge]), new Set(), new Set(['world/oven']));
    expect(layer.container.children[0]?.children[0]).toBe(drawn);
    expect(drawn?.alpha).toBeLessThan(1);
    layer.setDrawings(
      new Map([
        ['oven', gauge],
        ['fridge', gauge],
      ]),
    );
    expect(layer.count).toBe(2);
    expect(layer.container.children[0]?.children[0]).toBe(drawn);
    // What the emphasis hides, or what has no drawing any more, goes.
    layer.setScene(scene([oven, fridge]), new Set(['world/oven']), new Set());
    expect(layer.count).toBe(1);
    layer.setDrawings(new Map());
    expect(layer.count).toBe(0);
    layer.destroy();
  });

  it('builds only what is on screen, from the scale names show at', () => {
    const layer = new CodeDrawingLayer();
    const far = shape({
      key: 'world/far',
      element: 'far',
      rect: { x: 10_000, y: 10_000, width: 160, height: 120 },
    });
    layer.setScene(scene([shape(), far]), new Set(), new Set());
    layer.setDrawings(
      new Map([
        ['oven', gauge],
        ['far', gauge],
      ]),
    );
    layer.setCamera({ x: 0, y: 0, scale: 0.3 }, screen, 0.45);
    expect(layer.container.visible).toBe(false);
    expect(layer.builtCount).toBe(0);
    layer.setCamera(atOne, screen, 0.45);
    expect(layer.container.visible).toBe(true);
    expect(layer.builtCount).toBe(1);
    // Panning there builds the far one too.
    layer.setCamera({ x: -9_900, y: -9_900, scale: 1 }, screen, 0.45);
    expect(layer.builtCount).toBe(2);
    expect(layer.container.children.filter((cell) => cell.visible)).toHaveLength(1);
    layer.destroy();
  });

  it('builds a few milliseconds at a time, and tells the renderer each time', () => {
    const clock = timing();
    let told = 0;
    const layer = new CodeDrawingLayer(undefined, () => (told += 1), clock.timing);
    const many = Array.from({ length: 50 }, (_, i) =>
      shape({
        key: `world/s${i}`,
        element: `s${i}`,
        rect: { x: (i % 10) * 200, y: Math.floor(i / 10) * 150, width: 160, height: 120 },
      }),
    );
    layer.setCamera({ x: 0, y: 0, scale: 1 }, { width: 2400, height: 1200 }, 0.45);
    layer.setScene(scene(many), new Set(), new Set());
    // Every build takes 2 ms on this clock.
    const make = layer as unknown as { buildEntry: (entry: unknown) => void };
    const real = make.buildEntry.bind(layer);
    make.buildEntry = (entry) => {
      clock.tick(2);
      real(entry);
    };
    layer.setDrawings(new Map(many.map((each) => [each.element, gauge])));
    expect(layer.builtCount).toBe(4);
    expect(told).toBe(1);
    expect(clock.turns).toHaveLength(1);
    while (clock.turns.length > 0) clock.turn();
    expect(layer.builtCount).toBe(50);
    expect(told).toBeGreaterThan(5);
    layer.destroy();
  });
});
