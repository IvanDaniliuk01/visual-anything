/**
 * An explorable's one card (ADR 0107): its texts from the core's card in the language read in, and
 * one layout that the canvas, the read-only page, the SVG, the PDF and the command line all draw.
 */
import {
  EXPLORABLE_CARD_WHY,
  type ExplorableCard,
  type ExplorableCardReason,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n';
import { explorableCardLayout, explorableCardTexts, type ExplorableCardTexts } from './card-layout';

const TEXTS: ExplorableCardTexts = {
  name: 'Parabola',
  description: 'How y = ax² + bx + c moves as its coefficients change.',
  libraries: 'Script libraries: katex 0.16.11',
  why: 'Not approved yet: Approve to run.',
};

const lines = (layout: ReturnType<typeof explorableCardLayout>, role: string) =>
  layout.texts.find((each) => each.role === role)?.text.lines.map((line) => line.text) ?? [];

describe('an explorable’s card', () => {
  it('writes its name, description, script libraries and why it is not running, in that order', () => {
    const layout = explorableCardLayout({ x: 0, y: 0, width: 320, height: 240 }, TEXTS);
    expect(layout.texts.map((each) => each.role)).toEqual([
      'name',
      'description',
      'libraries',
      'why',
    ]);
    expect(lines(layout, 'name')).toEqual(['Parabola']);
    expect(lines(layout, 'libraries')).toEqual(['Script libraries: katex 0.16.11']);
    expect(lines(layout, 'why').join(' ')).toBe('Not approved yet: Approve to run.');
    const baselines = layout.texts.map((each) => each.text.lines[0]?.baseline ?? 0);
    expect([...baselines].sort((a, b) => a - b)).toEqual(baselines);
    // Its band goes across its top, and every line stays inside the card, below the band.
    expect(layout.band).toEqual({ x: 0, y: 0, width: 320, height: 4 });
    for (const text of layout.texts) {
      for (const line of text.text.lines) {
        expect(line.baseline).toBeGreaterThan(layout.band.height);
        expect(line.baseline).toBeLessThanOrEqual(240);
      }
    }
  });

  it('leaves out what it has no room or nothing for, and writes smaller on a small card', () => {
    const bare = explorableCardLayout({ x: 10, y: 10, width: 320, height: 240 }, { name: 'Bare' });
    expect(bare.texts.map((each) => each.role)).toEqual(['name']);
    const small = explorableCardLayout({ x: 0, y: 0, width: 120, height: 60 }, TEXTS);
    expect(small.texts[0]?.size).toBe(7);
    expect(small.texts.map((each) => each.role)).toContain('why');
  });

  it('typesets Math in its description rather than writing its TeX', () => {
    const layout = explorableCardLayout(
      { x: 0, y: 0, width: 320, height: 240 },
      { ...TEXTS, description: 'The roots of $ax^2 + bx + c$, as **a** changes.' },
    );
    const description = layout.texts.find((each) => each.role === 'description');
    expect(description?.text.lines).toEqual([]);
    const laid = description?.rich?.laid;
    expect(laid?.lines.length).toBeGreaterThan(0);
    const pieces = laid?.lines.flatMap((line) => line.pieces) ?? [];
    // The formula is a piece of its own, typeset; its source is kept only to say what it is.
    expect(pieces.filter((piece) => piece.math !== undefined)).toHaveLength(1);
    // What follows it starts below it.
    const libraries = layout.texts.find((each) => each.role === 'libraries');
    expect(libraries?.text.lines[0]?.baseline).toBeGreaterThan(
      (description?.rich?.y ?? 0) + (laid?.height ?? 0),
    );
  });
});

describe('what a card says', () => {
  const card: ExplorableCard = {
    explorable: 'p.parabola',
    name: 'Parabola',
    description: 'A curve.',
    libraries: ['katex 0.16.11', 'd3 7.9.0'],
    reason: 'library-missing',
    library: 'p.plotly',
  };

  it('names its script libraries and why, in English and in Spanish', () => {
    expect(explorableCardTexts(translatorFor('en'), card)).toEqual({
      name: 'Parabola',
      description: 'A curve.',
      libraries: 'Script libraries: katex 0.16.11, d3 7.9.0',
      why: 'Not running: its package does not define the script library “p.plotly”.',
    });
    expect(explorableCardTexts(translatorFor('es'), card).why).toContain('p.plotly');
  });

  it('has Spanish for every reason a card gives', () => {
    const es = translatorFor('es');
    for (const reason of Object.keys(EXPLORABLE_CARD_WHY) as ExplorableCardReason[]) {
      const said = explorableCardTexts(es, { ...card, reason, library: 'x' }).why;
      expect(said, reason).not.toBe(EXPLORABLE_CARD_WHY[reason].replace('{id}', 'x'));
    }
    expect(explorableCardTexts(es, card).libraries).not.toContain('Script libraries');
  });
});
