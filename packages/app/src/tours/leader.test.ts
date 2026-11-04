import { describe, expect, it } from 'vitest';
import { leaderArrival, leaderLine, leaderPath } from './leader';

const SCREEN = { width: 1000, height: 600 };
const CARD = { x: 300, y: 450, width: 400, height: 120 };

describe('leaderLine', () => {
  it('runs from the card’s nearest edge to the nearest point of the shape', () => {
    expect(leaderLine(CARD, { rect: { x: 100, y: 100, width: 100, height: 50 } }, SCREEN)).toEqual({
      from: { x: 300, y: 450 },
      to: { x: 200, y: 150 },
      side: 'top',
    });
    // Straight above the card: a vertical line from its top edge.
    expect(leaderLine(CARD, { rect: { x: 450, y: 100, width: 100, height: 50 } }, SCREEN)).toEqual({
      from: { x: 500, y: 450 },
      to: { x: 500, y: 150 },
      side: 'top',
    });
  });

  it('ends at the middle of a relation’s route', () => {
    expect(leaderLine(CARD, { point: { x: 800, y: 200 } }, SCREEN)).toEqual({
      from: { x: 700, y: 450 },
      to: { x: 800, y: 200 },
      side: 'top',
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

describe('a leader line drawn as the step says (ADR 0097)', () => {
  const MARK = { rect: { x: 100, y: 100, width: 100, height: 50 } };

  it('leaves from the middle of the side the step names, to the mark’s nearest point', () => {
    expect(leaderLine(CARD, MARK, SCREEN, 'left')).toEqual({
      from: { x: 300, y: 510 },
      to: { x: 200, y: 150 },
      side: 'left',
    });
  });

  it('turns once at a right angle, out of its side first, or curves out of it square', () => {
    const leader = { from: { x: 300, y: 510 }, to: { x: 200, y: 150 }, side: 'left' as const };
    expect(leaderPath(leader)).toBe('M 300 510 L 200 150');
    expect(leaderPath(leader, 'elbow')).toBe('M 300 510 L 200 510 L 200 150');
    expect(leaderPath(leader, 'curved')).toBe('M 300 510 C 120 510 200 330 200 150');
    // An arrow points along the last run: up, for an elbow that turns up.
    expect(leaderArrival(leader, 'elbow')).toEqual({ x: 0, y: -1 });
  });
});
