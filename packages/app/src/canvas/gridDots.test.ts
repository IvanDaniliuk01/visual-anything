/**
 * The grid's dots as quads in kept buffers (A5.6, ADR 0086): the same dots as before, a mesh for each
 * family, written again in place as the zoom goes, never a `Graphics` of rectangles.
 */
import { Graphics, Mesh } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { crispLine, gridLines, ZOOM_SLACK } from './grid';
import { GridDots } from './gridDots';
import { DOT_LEAST_GAP, GridMarks, MAX_GRID_DOTS } from './gridMarks';

const viewport = { width: 1600, height: 900 };

function dotsAt(scale: number, resolution = 1, rest = true): GridMarks {
  const marks = new GridMarks();
  marks.set({ shown: true, snapping: true });
  marks.setLook('dots');
  marks.follow({ x: 0, y: 0, scale }, viewport, resolution, rest);
  return marks;
}

/** The meshes and graphics a grid draws with. */
function partsOf(marks: GridMarks): { meshes: Mesh[]; graphics: Graphics[] } {
  const meshes: Mesh[] = [];
  const graphics: Graphics[] = [];
  const walk = (node: { children: readonly unknown[] }) => {
    for (const child of node.children) {
      if (child instanceof Mesh) meshes.push(child as Mesh);
      else if (child instanceof Graphics) graphics.push(child);
      if (child && typeof child === 'object' && 'children' in child) {
        walk(child as { children: readonly unknown[] });
      }
    }
  };
  walk(marks.whole);
  return { meshes, graphics };
}

describe('GridDots', () => {
  it('writes each dot as a quad of its family, at the family’s alpha', () => {
    const dots = new GridDots();
    dots.begin();
    dots.dot(10, 20, 1, 1);
    dots.dot(30, 40, 2, 2);
    dots.fill(0.2);
    dots.dot(5, 5, 1, 1);
    dots.fill(0.4);
    dots.end();
    expect(dots.drawn).toBe(3);
    const [fine, coarse] = dots.families;
    expect(fine?.count).toBe(2);
    expect(fine?.alpha).toBe(0.2);
    expect([...(fine?.positions ?? [])]).toEqual([
      10, 20, 11, 20, 11, 21, 10, 21, 30, 40, 32, 40, 32, 42, 30, 42,
    ]);
    expect(coarse).toMatchObject({ count: 1, alpha: 0.4 });
  });

  it('folds the dots a later drawing leaves out to a point, and hides the families it leaves out', () => {
    const dots = new GridDots();
    dots.begin();
    for (let at = 0; at < 300; at++) dots.dot(at, at, 1, 1);
    dots.fill(0.2);
    dots.dot(1, 1, 1, 1);
    dots.fill(0.4);
    dots.end();
    const meshes = dots.container.children as Mesh[];
    const buffer = meshes[0]?.geometry.positions;
    dots.begin();
    dots.dot(7, 7, 1, 1);
    dots.fill(0.3);
    dots.end();
    expect(dots.families).toHaveLength(1);
    expect(meshes[1]?.visible).toBe(false);
    // Grown once for 300, and kept: the same buffer, past its one dot all zeros.
    expect(meshes[0]?.geometry.positions).toBe(buffer);
    expect([...(buffer?.subarray(8, 300 * 8) ?? [])].every((value) => value === 0)).toBe(true);
    dots.clear();
    expect(dots.families).toHaveLength(0);
  });

  it('tints every family, now and when made later', () => {
    const dots = new GridDots();
    dots.setTint(0x123456);
    dots.begin();
    dots.dot(0, 0, 1, 1);
    dots.fill(1);
    dots.end();
    expect((dots.container.children[0] as Mesh).tint).toBe(0x123456);
  });
});

describe('the dot grid in kept buffers (A5.6)', () => {
  it('draws its dots in meshes alone, as many as before, where its lines cross', () => {
    const marks = dotsAt(1);
    const { meshes, graphics } = partsOf(marks);
    expect(meshes.length).toBeGreaterThan(0);
    for (const each of graphics) expect(each.context.instructions).toHaveLength(0);
    const families = marks.dotFamilies;
    expect(families.reduce((sum, family) => sum + family.count, 0)).toBe(marks.lineCount);
    expect(marks.lineCount).toBeLessThanOrEqual(MAX_GRID_DOTS);
    // The coarsest family's first dot is where its first lines cross, crisp on a device pixel.
    const planned = gridLines(1, viewport, 1, undefined, ZOOM_SLACK);
    const drawn = planned.families.filter((family) => family.pixels >= DOT_LEAST_GAP);
    const coarsest = drawn.at(-1);
    const first = crispLine(0, 1);
    const positions = families.at(-1)?.positions;
    expect(coarsest).toBeDefined();
    expect(positions?.[0]).toBeCloseTo(first.start);
    expect(positions?.[1]).toBeCloseTo(first.start);
  });

  it('writes its dots again in the same meshes as the zoom goes, and tints them on a switch', () => {
    const marks = dotsAt(1, 1, false);
    const before = partsOf(marks).meshes;
    for (const scale of [1.1, 1.3, 1.7, 2.4, 0.6, 0.3]) {
      marks.follow({ x: 0, y: 0, scale }, viewport, 1, false);
    }
    const after = partsOf(marks).meshes;
    // A family that shows for the first time adds a mesh; none is ever made again.
    expect(before.every((mesh, at) => after[at] === mesh)).toBe(true);
    expect(after.length).toBeLessThanOrEqual(6);
    marks.setTheme(THEMES.dark.canvas);
    for (const mesh of after)
      expect(mesh.tint).toBe(Number(`0x${THEMES.dark.canvas.gridLine.slice(1)}`));
  });

  it('draws lines again once its look is lines, and its dots hide', () => {
    const marks = dotsAt(1);
    marks.setLook('lines');
    marks.follow({ x: 0, y: 0, scale: 1 }, viewport, 1, true);
    expect(marks.dotFamilies).toHaveLength(0);
    const { graphics } = partsOf(marks);
    expect(graphics.some((each) => each.context.instructions.length > 0)).toBe(true);
  });
});
