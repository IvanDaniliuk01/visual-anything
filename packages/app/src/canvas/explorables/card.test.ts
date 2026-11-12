import { describe, expect, it } from 'vitest';
import { explorableCardLayout, type ExplorableFace } from './card';

const FACE: ExplorableFace = {
  name: 'Parabola',
  description: 'How y = ax² + bx + c moves as its coefficients change.',
  libraries: ['katex 0.16.11'],
  why: 'Not approved yet: Approve to run.',
  runs: false,
};

const lines = (layout: ReturnType<typeof explorableCardLayout>, role: string) =>
  layout.texts.find((each) => each.role === role)?.text.lines.map((line) => line.text) ?? [];

describe('an explorable’s card', () => {
  it('writes its name, description, script libraries and why it is not running, in that order', () => {
    const layout = explorableCardLayout({ x: 0, y: 0, width: 320, height: 240 }, FACE);
    expect(layout.texts.map((each) => each.role)).toEqual([
      'name',
      'description',
      'libraries',
      'why',
    ]);
    expect(lines(layout, 'name')).toEqual(['Parabola']);
    expect(lines(layout, 'libraries')).toEqual(['katex 0.16.11']);
    expect(lines(layout, 'why').join(' ')).toBe('Not approved yet: Approve to run.');
    const baselines = layout.texts.map((each) => each.text.lines[0]?.baseline ?? 0);
    expect([...baselines].sort((a, b) => a - b)).toEqual(baselines);
    // Every line stays inside the card.
    for (const text of layout.texts) {
      for (const line of text.text.lines) {
        expect(line.baseline).toBeGreaterThan(0);
        expect(line.baseline).toBeLessThanOrEqual(240);
      }
    }
  });

  it('leaves out what it has no room or nothing for, and writes smaller on a small card', () => {
    const bare = explorableCardLayout(
      { x: 10, y: 10, width: 320, height: 240 },
      {
        name: 'Bare',
        libraries: [],
        runs: true,
      },
    );
    expect(bare.texts.map((each) => each.role)).toEqual(['name']);
    const small = explorableCardLayout({ x: 0, y: 0, width: 120, height: 60 }, FACE);
    expect(small.texts[0]?.size).toBe(7);
    expect(small.texts.map((each) => each.role)).toContain('why');
  });
});
