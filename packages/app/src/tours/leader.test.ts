import { describe, expect, it } from 'vitest';
import { leaderLine } from './leader';

const SCREEN = { width: 1000, height: 600 };
const CARD = { x: 300, y: 450, width: 400, height: 120 };

describe('leaderLine', () => {
  it('runs from the card’s nearest edge to the nearest point of the shape', () => {
    expect(leaderLine(CARD, { rect: { x: 100, y: 100, width: 100, height: 50 } }, SCREEN)).toEqual({
      from: { x: 300, y: 450 },
      to: { x: 200, y: 150 },
    });
    // Straight above the card: a vertical line from its top edge.
    expect(leaderLine(CARD, { rect: { x: 450, y: 100, width: 100, height: 50 } }, SCREEN)).toEqual({
      from: { x: 500, y: 450 },
      to: { x: 500, y: 150 },
    });
  });

  it('ends at the middle of a relation’s route', () => {
    expect(leaderLine(CARD, { point: { x: 800, y: 200 } }, SCREEN)).toEqual({
      from: { x: 700, y: 450 },
      to: { x: 800, y: 200 },
    });
  });

  it('says the mark is off the canvas, and draws nothing under the card', () => {
    expect(leaderLine(CARD, { rect: { x: 2000, y: 100, width: 10, height: 10 } }, SCREEN)).toBe(
      'off',
    );
    expect(
      leaderLine(CARD, { rect: { x: 400, y: 480, width: 50, height: 20 } }, SCREEN),
    ).toBeUndefined();
  });
});
