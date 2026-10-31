// @vitest-environment node
/**
 * What a space draws (ADR 0076), worked out without the GPU: solids at their places, each piece in
 * the look of the nearest element standing for it with marks inherited inward, the nodes no element
 * stands for in their solid's element's state, collapsed containers answering as one, markers in
 * their fills, and the exploded view moving each part away from the middle of what holds it.
 */
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import type { SpaceDrawnEntry } from '../../protocol';
import type { BuiltSolid } from '../build';
import { armEntry, armSolid, at, spaceToDraw } from './fixtures';
import { SPACE_MARK, explosionOf, layOut, lookOf, trianglesOf } from './layout';

let arm: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
});

const translation = (matrix: { elements: number[] }) => matrix.elements.slice(12, 15);

/** The look of each of the arm's pieces, by its part: base, link, gripper. */
function looksOf(layout: ReturnType<typeof layOut>, index = 0) {
  const laid = layout.solids[index];
  return Object.fromEntries(
    (laid?.pieces ?? []).map((piece) => [
      ['base', 'link', 'gripper'][piece.piece.part] as string,
      piece.look,
    ]),
  );
}

const WRIST: SpaceDrawnEntry = {
  element: 'wrist',
  name: 'Wrist',
  matrix: at(0, 0.6, 0),
  part: { of: 'arm', index: 1 },
};

describe('a space laid out', () => {
  it('draws each solid at its entry’s place, a piece for each of its pieces', () => {
    const layout = layOut(spaceToDraw(arm, [armEntry('arm'), armEntry('other', at(3, 0, -2))]));
    expect(layout.solids).toHaveLength(2);
    expect(layout.solids.map((laid) => laid.pieces.length)).toEqual([3, 3]);
    const other = layout.solids[1];
    for (const piece of other?.pieces ?? []) {
      expect(translation(piece.matrix)).toEqual([3, 0, -2]);
    }
    expect(other?.bounds).toEqual({
      min: { x: 2.5, y: 0, z: -2.5 },
      max: { x: 3.5, y: 1.2, z: -1.5 },
    });
    expect(layout.drawn.get('other')?.point).toEqual({ x: 3, y: 0.6, z: -2 });
    expect(trianglesOf(arm)).toBe(36);
  });

  it('draws the nodes no element stands for in the solid’s element’s state', () => {
    const layout = layOut(
      spaceToDraw(arm, [armEntry('arm')], {
        states: { arm: { selected: true, fill: '#AA3300' } },
      }),
    );
    const looks = looksOf(layout);
    for (const part of ['base', 'link', 'gripper']) {
      expect(looks[part]).toEqual({
        answers: 'arm',
        faint: false,
        alpha: 1,
        fill: '#AA3300',
        marks: SPACE_MARK.selected,
      });
    }
  });

  it('draws an anchored part and what it holds in the part’s look, its holder’s marks inherited', () => {
    const layout = layOut(
      spaceToDraw(arm, [armEntry('arm'), WRIST], {
        states: {
          arm: { hovered: true },
          wrist: { selected: true, fill: '#0055FF', opacity: 0.5 },
        },
      }),
    );
    const looks = looksOf(layout);
    expect(looks.base).toMatchObject({ answers: 'arm', marks: SPACE_MARK.hovered });
    expect(looks.base?.fill).toBeUndefined();
    for (const part of ['link', 'gripper']) {
      expect(looks[part]).toEqual({
        answers: 'wrist',
        faint: false,
        alpha: 0.5,
        fill: '#0055FF',
        marks: SPACE_MARK.hovered | SPACE_MARK.selected,
      });
    }
    // The part is written where its part is, and marked as it is drawn.
    expect(layout.drawn.get('wrist')?.point.y).toBeCloseTo(0.7, 6);
    expect(layout.drawn.get('wrist')?.look.marks).toBe(SPACE_MARK.hovered | SPACE_MARK.selected);
  });

  it('hides what the nearest element standing for it hides', () => {
    const partHidden = layOut(
      spaceToDraw(arm, [armEntry('arm'), WRIST], { states: { wrist: { hidden: true } } }),
    );
    expect(Object.keys(looksOf(partHidden))).toEqual(['base']);
    expect(partHidden.drawn.has('wrist')).toBe(false);
    const holderHidden = layOut(
      spaceToDraw(arm, [armEntry('arm'), WRIST], { states: { arm: { hidden: true } } }),
    );
    expect(Object.keys(looksOf(holderHidden))).toEqual(['link', 'gripper']);
    expect(holderHidden.drawn.has('arm')).toBe(false);
    expect(holderHidden.solids[0]?.look).toBeUndefined();
  });

  it('draws what is faint, or has an overlay’s opacity, see-through', () => {
    expect(lookOf({ element: 'a' }, { faint: true })?.alpha).toBe(DIMMED_ALPHA);
    expect(lookOf({ element: 'a' }, { opacity: 0.5 })?.alpha).toBe(0.5);
    expect(lookOf({ element: 'a' }, { faint: true, opacity: 0.5 })?.alpha).toBeCloseTo(
      DIMMED_ALPHA / 2,
      9,
    );
    expect(lookOf({ element: 'a' }, { hidden: true, selected: true })).toBeUndefined();
    expect(lookOf({ element: 'a' }, undefined)).toEqual({
      answers: 'a',
      faint: false,
      alpha: 1,
      marks: 0,
    });
  });

  it('answers for what a collapsed container holds as the container', () => {
    const layout = layOut(
      spaceToDraw(arm, [
        { ...armEntry('arm'), as: 'cell' },
        { element: 'pin', name: 'Pin', matrix: at(1, 0, 0), marker: true, as: 'cell' },
      ]),
    );
    expect(looksOf(layout).base?.answers).toBe('cell');
    expect(layout.markers[0]?.look.answers).toBe('cell');
  });

  it('draws markers at their origins, in their overlay’s fill or else their shape’s', () => {
    const pin = (element: string, fill?: string): SpaceDrawnEntry => ({
      element,
      name: element,
      matrix: at(1, 2, 3),
      marker: true,
      ...(fill ? { fill } : {}),
    });
    const layout = layOut(
      spaceToDraw(arm, [pin('a', '#112233'), pin('b', '#112233'), pin('c'), pin('d')], {
        states: { b: { fill: '#FF0000' }, d: { hidden: true } },
      }),
    );
    expect(layout.markers.map((marker) => [marker.entry.element, marker.color])).toEqual([
      ['a', '#112233'],
      ['b', '#FF0000'],
      ['c', undefined],
    ]);
    expect(layout.markers[0]?.at).toEqual({ x: 1, y: 2, z: 3 });
    expect(layout.drawn.get('a')?.point).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('draws nothing of a solid not loaded yet, and writes its name at its bounds’ middle', () => {
    const entry: SpaceDrawnEntry = {
      ...armEntry('arm', at(1, 0, 0)),
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } },
    };
    const layout = layOut({ ...spaceToDraw(arm, [entry]), solids: new Map() });
    expect(layout.solids).toEqual([]);
    expect(layout.drawn.get('arm')?.point).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('marks the solids drawn as their boxes', () => {
    const layout = layOut(
      spaceToDraw(arm, [armEntry('near'), armEntry('far', at(0, 0, -50))], {
        boxed: new Set(['far']),
      }),
    );
    expect(layout.solids.map((laid) => laid.boxed)).toEqual([false, true]);
  });
});

describe('the exploded view', () => {
  it('moves each part away from the middle of what holds it, with what holds it', () => {
    expect(explosionOf(arm, 0).every((offset) => offset.length() === 0)).toBe(true);
    const offsets = explosionOf(arm, 1);
    // The base holds everything, so its middle is the solid's: it stays.
    expect(offsets[0]?.length()).toBeCloseTo(0, 6);
    // The link and gripper's middle is 0.1 m above the base's; the gripper's 0.4 m above the link's.
    expect(offsets[1]?.y).toBeCloseTo(0.1, 6);
    expect(offsets[2]?.y).toBeCloseTo(0.5, 6);
    const twice = explosionOf(arm, 2);
    expect(twice[2]?.y).toBeCloseTo(1, 6);
  });

  it('draws the pieces and writes the anchored parts’ names where the explosion moves them', () => {
    const layout = layOut(spaceToDraw(arm, [armEntry('arm', at(5, 0, 0)), WRIST], { explode: 1 }));
    const byPart = new Map(
      layout.solids[0]?.pieces.map((piece) => [piece.piece.part, piece.matrix]) ?? [],
    );
    expect(
      new Vector3().setFromMatrixPosition(byPart.get(0) as never).distanceTo(new Vector3(5, 0, 0)),
    ).toBeCloseTo(0, 6);
    const link = new Vector3().setFromMatrixPosition(byPart.get(1) as never);
    expect(link.y).toBeCloseTo(0.1, 6);
    const gripper = new Vector3().setFromMatrixPosition(byPart.get(2) as never);
    expect(gripper.y).toBeCloseTo(0.5, 6);
    expect(layout.drawn.get('wrist')?.point.y).toBeCloseTo(0.8, 6);
    expect(layout.drawn.get('wrist')?.point.x).toBeCloseTo(5, 9);
  });
});
