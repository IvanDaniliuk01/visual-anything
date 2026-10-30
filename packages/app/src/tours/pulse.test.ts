import { describe, expect, it } from 'vitest';
import { pulseFrame } from './pulse';

const LEGS = [
  { relation: 'finding-case', forward: true },
  { relation: 'case-subject', forward: false },
];

describe('pulseFrame', () => {
  it('runs the marker along each relation in turn, the way the chain goes, with its trail', () => {
    expect(pulseFrame(LEGS, 1, 0, false)).toEqual({
      markers: [{ relation: 'finding-case', progress: 0 }],
      marked: [],
      done: false,
    });
    expect(pulseFrame(LEGS, 1, 300, false)).toEqual({
      markers: [{ relation: 'finding-case', progress: 0.5, trail: 0.25 }],
      marked: [],
      done: false,
    });
    // The second relation runs from its `to` end, where the first one arrived.
    expect(pulseFrame(LEGS, 1, 900, false).markers).toEqual([
      { relation: 'case-subject', progress: 0.5, trail: 0.75 },
    ]);
    expect(pulseFrame(LEGS, 1, 1200, false)).toEqual({ markers: [], marked: [], done: true });
  });

  it('runs the chain again as many times as it repeats', () => {
    expect(pulseFrame(LEGS, 2, 1500, false).markers[0]).toMatchObject({
      relation: 'finding-case',
      progress: 0.5,
    });
    expect(pulseFrame(LEGS, 2, 2400, false).done).toBe(true);
  });

  it('marks the relations in order, 400 ms apart, under reduced motion, and keeps them marked', () => {
    expect(pulseFrame(LEGS, 3, 0, true)).toEqual({
      markers: [],
      marked: ['finding-case'],
      done: false,
    });
    expect(pulseFrame(LEGS, 3, 400, true)).toEqual({
      markers: [],
      marked: ['finding-case', 'case-subject'],
      done: true,
    });
  });
});
