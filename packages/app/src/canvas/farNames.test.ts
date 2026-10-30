/**
 * Names readable far out (ADR 0080, section 5): below the scale rows write from, tables and
 * containers write their names at 12 pixels on screen, containers first, the larger first, never
 * over one another, and the smallest give way.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadDataModel } from '../test/dataModel';
import type { Camera } from './camera';
import {
  FAR_NAME_SIZE,
  FarNames,
  farNameOrder,
  farOut,
  namedFarOut,
  placeFarNames,
  type FarText,
} from './farNames';
import { readableTextColors } from './colors';
import { ROWS_FROM } from './rows';
import { buildSceneAfresh, type Scene } from './scene';

const base = loadDataModel();

/** The overview with its schemas and tables open, as a person reads the whole database far out. */
function opened(): ProjectSnapshot {
  const overview = base.views.find((view) => view.id === 'overview');
  const done = executeCommand(base, {
    type: 'set-collapsed',
    view: 'overview',
    elements: [...(overview?.collapsed ?? [])],
    collapsed: false,
  });
  if (!done.ok) throw new Error('Not opened');
  return done.state;
}

const scene: Scene = buildSceneAfresh(opened(), 'overview');
const viewport = { width: 1600, height: 1000 };
/** A camera that shows the whole scene at this scale, from its top left. */
const at = (scale: number): Camera => ({
  scale,
  x: -(scene.bounds?.x ?? 0) * scale,
  y: -(scene.bounds?.y ?? 0) * scale,
});

describe('names far out', () => {
  it('are written below the scale rows write from, for tables and containers only', () => {
    expect(farOut(ROWS_FROM - 0.01)).toBe(true);
    expect(farOut(ROWS_FROM)).toBe(false);
    expect(placeFarNames(farNameOrder(scene.shapes), at(ROWS_FROM), viewport)).toEqual([]);
    const named = scene.shapes.filter(namedFarOut);
    expect(named.length).toBeGreaterThan(70);
    expect(named.every((shape) => shape.row === undefined)).toBe(true);
    expect(named.every((shape) => shape.rowCount !== undefined || shape.holdsContents)).toBe(true);
  });

  it('put containers first, then the larger, and none over another', () => {
    const order = farNameOrder(scene.shapes);
    const firstTable = order.findIndex((shape) => shape.rowCount !== undefined);
    expect(order.slice(0, firstTable).every((shape) => shape.rowCount === undefined)).toBe(true);
    expect(order.slice(firstTable).every((shape) => shape.rowCount !== undefined)).toBe(true);
    const names = placeFarNames(order, at(0.3), viewport);
    expect(names.length).toBeGreaterThan(10);
    for (const [index, a] of names.entries()) {
      // At 12 pixels on screen, on a plate at least a line tall, in a color that reads on it.
      expect(a.plate.height).toBeGreaterThanOrEqual(FAR_NAME_SIZE * 1.3);
      expect(a.color).toBe(readableTextColors(a.fill).name);
      for (const b of names.slice(index + 1)) {
        const apart =
          a.plate.x + a.plate.width <= b.plate.x ||
          b.plate.x + b.plate.width <= a.plate.x ||
          a.plate.y + a.plate.height <= b.plate.y ||
          b.plate.y + b.plate.height <= a.plate.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('let the smallest give way as the view zooms out, the containers staying', () => {
    const order = farNameOrder(scene.shapes);
    const near = placeFarNames(order, at(0.4), viewport);
    const far = placeFarNames(order, at(0.08), viewport);
    expect(far.length).toBeLessThan(near.length);
    const containers = (names: typeof far) =>
      names.filter((name) => scene.shapes.find((shape) => shape.key === name.key)?.holdsContents);
    expect(containers(far).length).toBeGreaterThan(0);
    // No more than the most, and none for what the emphasis hides.
    expect(placeFarNames(order, at(0.3), viewport, { most: 5 })).toHaveLength(5);
    const hidden = new Set(near.map((name) => name.key));
    expect(
      placeFarNames(order, at(0.4), viewport, { hidden }).some((name) => hidden.has(name.key)),
    ).toBe(false);
  });

  it('draws them from a pool, and hides what it no longer shows', () => {
    const made: FarText[] = [];
    const layer = new FarNames(() => {
      const text = Object.assign(new Container(), { text: '' });
      made.push(text);
      return text;
    });
    const names = placeFarNames(farNameOrder(scene.shapes), at(0.3), viewport);
    layer.show(names);
    expect(layer.shown).toBe(names.length);
    expect(made.map((text) => text.text)).toEqual(names.map((name) => name.text));
    layer.show(names.slice(0, 2));
    expect(made.length).toBe(names.length);
    expect(made.filter((text) => text.visible)).toHaveLength(2);
    layer.show([]);
    expect(layer.container.visible).toBe(false);
  });
});
