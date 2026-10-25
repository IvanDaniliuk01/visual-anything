import { describe, expect, it } from 'vitest';
import type { TilePlan } from '../tiles';
import {
  drawingsFollowTheme,
  labelsFollowTheme,
  shownDrawings,
  stampOf,
  takeRepaints,
  type TileItems,
} from './restyle';

const rect = { x: 0, y: 0, width: 10, height: 10 };
const empty: TileItems = {
  kind: 'shapes',
  shapes: [],
  touching: [],
  lines: [],
  notes: [],
  arrows: [],
};
const shape = {
  key: 'a',
  element: 'a',
  offset: { x: 0, y: 0 },
  positioned: 'stored' as const,
  name: 'A',
  componentName: 'Box',
  kind: 'rectangle' as const,
  fill: '#FFFFFF',
  stroke: '#52606D',
  rect,
  extent: rect,
  holdsContents: false,
};

describe('stampOf', () => {
  it('names the theme only for drawings that follow it, and counts changes of colors', () => {
    expect(stampOf(true, 'dark', 0)).not.toBe(stampOf(true, 'light', 0));
    expect(stampOf(false, 'dark', 0)).toBe(stampOf(false, 'light', 0));
    expect(stampOf(false, 'dark', 1)).not.toBe(stampOf(false, 'dark', 0));
  });
});

describe('what follows the theme', () => {
  it('is a tile with a shape in built-in colors, and not one in stored colors only', () => {
    expect(drawingsFollowTheme({ ...empty, shapes: [shape] })).toBe(false);
    const themed = {
      ...empty,
      shapes: [{ ...shape, dark: { fill: '#1E2329', stroke: '#9AA5B1' } }],
    };
    expect(drawingsFollowTheme(themed)).toBe(true);
    expect(labelsFollowTheme(themed)).toBe(true);
  });

  it('is every relation’s name, and a note on the theme’s fill', () => {
    const named = {
      relation: 'r',
      label: 'HTTPS',
      route: [rect, rect],
      from: rect,
      to: rect,
      middle: rect,
      stroke: '#C2255C',
      width: 2,
      dash: 'solid' as const,
    };
    const relations: TileItems = { ...empty, kind: 'relations', touching: [named], lines: [named] };
    expect(drawingsFollowTheme(relations)).toBe(false);
    expect(labelsFollowTheme(relations)).toBe(true);
    const free: TileItems = { ...empty, kind: 'free', notes: [{ id: 'n', rect, text: 'x' }] };
    expect(drawingsFollowTheme(free)).toBe(true);
    const own: TileItems = {
      ...empty,
      kind: 'free',
      notes: [{ id: 'n', rect, text: 'x', fill: '#DCEBFF', stroke: '#1D4F91' }],
    };
    expect(drawingsFollowTheme(own)).toBe(false);
    expect(labelsFollowTheme(own)).toBe(false);
  });
});

describe('shownDrawings', () => {
  it('is the plain drawing far out, and the full one closer in once there is one', () => {
    expect(shownDrawings({ kind: 'shapes', coarse: 1, full: 1 }, true)).toEqual(['coarse']);
    expect(shownDrawings({ kind: 'shapes', coarse: 1, full: 1 }, false)).toEqual(['full']);
    expect(shownDrawings({ kind: 'shapes', coarse: 1 }, false)).toEqual(['coarse']);
    expect(shownDrawings({ kind: 'free', full: 1 }, true)).toEqual(['full']);
  });
});

describe('takeRepaints', () => {
  it('keeps the tiles made again under the same key only for new colors', () => {
    const tile = (key: string) => ({ key, cell: '0,0', signature: key });
    const plan: TilePlan<{ key: string; cell: string; signature: string }> = {
      keep: ['k'],
      move: [],
      make: [tile('a'), tile('b'), tile('c')],
      drop: ['a', 'b', 'd'],
    };
    const repaints = takeRepaints(plan, (key) => key === 'a');
    expect(repaints.map((each) => each.key)).toEqual(['a']);
    expect(plan.make.map((each) => each.key)).toEqual(['b', 'c']);
    expect(plan.drop).toEqual(['b', 'd']);
    expect(plan.keep).toEqual(['k']);
  });
});
