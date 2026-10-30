import { describe, expect, it } from 'vitest';
import { drawnPieces } from './lineDraw';

const ROUTE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('drawnPieces', () => {
  it('draws a directed line from its start, along its bends', () => {
    expect(drawnPieces(ROUTE, 0, true)).toEqual([]);
    expect(drawnPieces(ROUTE, 0.25, true)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    ]);
    expect(drawnPieces(ROUTE, 0.75, true)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ],
    ]);
    expect(drawnPieces(ROUTE, 1, true)).toEqual([ROUTE]);
  });

  it('draws an undirected line from both ends toward its middle', () => {
    expect(drawnPieces(ROUTE, 0.5, false)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: 100, y: 100 },
        { x: 100, y: 50 },
      ],
    ]);
  });
});
