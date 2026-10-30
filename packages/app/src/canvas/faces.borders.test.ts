/**
 * How a face's boxes are painted (ADR 0083, F3): their backgrounds and borders as pieces, which the
 * canvas and the exports both draw, so that the two never draw a box differently. Dashed borders are
 * dashes along each side, the same on both.
 */
import type { FaceBox } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { faceBoxPieces, type FacePiece } from './faces';

const AT = { x: 100, y: 50 };

function box(change: Partial<FaceBox>): FaceBox {
  return { x: 10, y: 20, width: 60, height: 30, radius: 0, ...change };
}

const solid = (width: number, color = 'stroke') => ({ width, style: 'solid' as const, color });
const dashed = (width: number, color = 'stroke') => ({ width, style: 'dashed' as const, color });

/** Whether every piece lies inside the box, placed. */
function inside(pieces: readonly FacePiece[], of: FaceBox): boolean {
  return pieces.every(
    (piece) =>
      piece.rect.x >= AT.x + of.x - 1e-9 &&
      piece.rect.y >= AT.y + of.y - 1e-9 &&
      piece.rect.x + piece.rect.width <= AT.x + of.x + of.width + 1e-9 &&
      piece.rect.y + piece.rect.height <= AT.y + of.y + of.height + 1e-9,
  );
}

describe('the pieces a face’s box is painted with', () => {
  it('fills its background at its place, with its radius', () => {
    const pieces = faceBoxPieces(box({ background: 'fill', radius: 4 }), AT);
    expect(pieces).toEqual([
      { kind: 'fill', rect: { x: 110, y: 70, width: 60, height: 30 }, radius: 4, color: 'fill' },
    ]);
  });

  it('draws nothing of a box with no width or height', () => {
    expect(faceBoxPieces(box({ background: 'fill', width: 0 }), AT)).toEqual([]);
    expect(
      faceBoxPieces(box({ height: 0, borders: { top: solid(1), bottom: solid(1) } }), AT),
    ).toEqual([]);
  });

  it('strokes one ring inside a rounded box whose sides are alike and solid', () => {
    const sides = solid(2, '#336699');
    const pieces = faceBoxPieces(
      box({ radius: 6, borders: { top: sides, right: sides, bottom: sides, left: sides } }),
      AT,
    );
    expect(pieces).toEqual([
      {
        kind: 'ring',
        rect: { x: 111, y: 71, width: 58, height: 28 },
        radius: 5,
        width: 2,
        color: '#336699',
      },
    ]);
  });

  it('fills each solid side as a band inside the box', () => {
    const pieces = faceBoxPieces(box({ borders: { bottom: solid(1), left: solid(3) } }), AT);
    expect(pieces).toEqual([
      { kind: 'fill', rect: { x: 110, y: 99, width: 60, height: 1 }, radius: 0, color: 'stroke' },
      { kind: 'fill', rect: { x: 110, y: 70, width: 3, height: 30 }, radius: 0, color: 'stroke' },
    ]);
  });

  it('draws a dashed side as dashes that start and end at its ends', () => {
    const of = box({ borders: { top: dashed(1) } });
    const pieces = faceBoxPieces(of, AT);
    expect(pieces.length).toBeGreaterThan(5);
    expect(inside(pieces, of)).toBe(true);
    const first = pieces[0] as FacePiece;
    const last = pieces.at(-1) as FacePiece;
    expect(first.rect.x).toBe(110);
    expect(last.rect.x + last.rect.width).toBeCloseTo(170);
    // Dashes three times the border's width, with gaps between them.
    for (const piece of pieces) {
      expect(piece.rect.height).toBe(1);
      expect(piece.rect.width).toBeCloseTo(3);
    }
    for (let at = 1; at < pieces.length; at++) {
      const before = pieces[at - 1] as FacePiece;
      expect((pieces[at] as FacePiece).rect.x).toBeGreaterThan(before.rect.x + before.rect.width);
    }
  });

  it('dashes a rounded box’s sides along their straight stretches, leaving the corners', () => {
    const sides = dashed(1);
    const of = box({
      radius: 8,
      borders: { top: sides, right: sides, bottom: sides, left: sides },
    });
    const pieces = faceBoxPieces(of, AT);
    expect(pieces.every((piece) => piece.kind === 'fill')).toBe(true);
    expect(inside(pieces, of)).toBe(true);
    const top = pieces.filter((piece) => piece.rect.y === 70 && piece.rect.height === 1);
    expect(Math.min(...top.map((piece) => piece.rect.x))).toBe(118);
    expect(Math.max(...top.map((piece) => piece.rect.x + piece.rect.width))).toBeCloseTo(162);
  });

  it('draws at most 64 dashes along a side, however long', () => {
    const pieces = faceBoxPieces(box({ width: 4000, borders: { top: dashed(1) } }), AT);
    expect(pieces).toHaveLength(64);
  });
});
