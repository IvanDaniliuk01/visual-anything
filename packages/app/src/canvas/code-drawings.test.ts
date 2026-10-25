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
  it('draws only the shapes with a drawing, and builds again only what changed', () => {
    const layer = new CodeDrawingLayer();
    const oven = shape();
    const fridge = shape({
      key: 'world/fridge',
      element: 'fridge',
      rect: { x: 400, y: 200, width: 160, height: 120 },
    });
    layer.setScene(scene([oven, fridge]), new Set(), new Set());
    layer.setDrawings(new Map([['oven', gauge]]));
    expect(layer.count).toBe(1);
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

  it('shows from the scale names show at, and only the cells on screen', () => {
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
    layer.setCamera({ x: 0, y: 0, scale: 0.3 }, { width: 800, height: 600 }, 0.45);
    expect(layer.container.visible).toBe(false);
    layer.setCamera({ x: 0, y: 0, scale: 1 }, { width: 800, height: 600 }, 0.45);
    expect(layer.container.visible).toBe(true);
    const cells = layer.container.children;
    expect(cells.filter((cell) => cell.visible)).toHaveLength(1);
    expect(cells).toHaveLength(2);
    layer.destroy();
  });
});
