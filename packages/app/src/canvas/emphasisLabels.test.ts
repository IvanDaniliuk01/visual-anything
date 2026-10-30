import { emphasisRuns, parseEmphasis } from '@visual-anything/core';
import { BitmapFont, Cache, Graphics, Texture } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emphasisBacks } from './colors';
import { writeNoteTexts, type TextFactory } from './draw';
import {
  EmphasisLabel,
  emphasisLabel,
  glyphMeasure,
  laidOutRuns,
  noteLabel,
  tintLabel,
} from './emphasisLabels';
import { bitmapText } from './labels';
import type { NoteShape } from './scene';

const VARIANTS = [
  'text',
  'text-bold',
  'text-italic',
  'text-bold-italic',
  'text-mono',
  'name',
  'detail',
  'relation',
];
const KEYS = VARIANTS.map((each) => `visual-anything-${each}-bitmap`);

/** A font drawn at 16 whose every glyph is 8 wide: a white square, so that each draws a quad. */
function fakeFont(): BitmapFont {
  const chars: Record<string, unknown> = {};
  for (let code = 32; code < 127; code++) {
    chars[String.fromCharCode(code)] = {
      id: code,
      xOffset: 0,
      yOffset: 0,
      xAdvance: 8,
      kerning: {},
      texture: code === 32 ? undefined : Texture.WHITE,
    };
  }
  return {
    chars,
    fontMetrics: { fontSize: 16, ascent: 12, descent: 4 },
    ensureCharacters: () => undefined,
  } as unknown as BitmapFont;
}

beforeAll(() => {
  for (const key of KEYS) Cache.set(key, fakeFont());
});
afterAll(() => {
  for (const key of KEYS) Cache.remove(key);
});

/** How many glyphs and bands a drawing holds. */
const drawn = (graphics: Graphics) => graphics.context.instructions.length;

describe('text emphasis on the canvas (ADR 0082)', () => {
  it('measures by the glyphs’ advances, scaled to the size', () => {
    expect(glyphMeasure('abcd', 'regular', 8)).toBe(16);
    expect(glyphMeasure('ab', 'mono', 16)).toBe(16);
  });

  it('draws a quad for each glyph, highlights and code behind, lines with the glyphs', () => {
    const laid = laidOutRuns(emphasisRuns('==hi== `co` ++un++'), 16, 400, 'left', 1);
    const label = new EmphasisLabel(laid);
    expect(drawn(label.highlights)).toBe(1);
    expect(drawn(label.codes)).toBe(1);
    // Six letters, and an underline.
    expect(drawn(label.glyphs)).toBe(7);
  });

  it('tints its text, and its backs to read under it', () => {
    const label = new EmphasisLabel(laidOutRuns(emphasisRuns('==a=='), 11, 100, 'left', 1));
    tintLabel(label, '#FFFFFF');
    expect(label.glyphs.tint).toBe(0xffffff);
    expect(label.highlights.tint).toBe(parseInt(emphasisBacks('#FFFFFF').highlight.slice(1), 16));
    expect(label.tint).toBe(0xffffff);
  });

  it('lays out a text once for each width and number of lines', () => {
    const runs = emphasisRuns('**kept**');
    expect(laidOutRuns(runs, 11, 100, 'center', 3)).toBe(laidOutRuns(runs, 11, 100, 'center', 3));
    expect(laidOutRuns(runs, 11, 90, 'center', 3)).not.toBe(
      laidOutRuns(runs, 11, 100, 'center', 3),
    );
  });

  it('places a detail as an anchored text, and writes none where not one line fits', () => {
    const runs = emphasisRuns('a **b** c');
    const place = {
      x: 100,
      y: 50,
      anchor: { x: 0.5, y: 0 },
      size: 10,
      width: 80,
      align: 'center' as const,
      room: 13,
      fill: '#1F2933',
    };
    const label = emphasisLabel(runs, place);
    expect(label?.x).toBe(60);
    expect(label?.y).toBe(50);
    expect(emphasisLabel(runs, { ...place, room: 5 })).toBeUndefined();
  });

  it('is what the bitmap labels make of a detail with runs, and only of a detail', () => {
    const runs = emphasisRuns('the **orders** table');
    const options = {
      text: 'the orders table',
      x: 0,
      y: 0,
      style: { fontSize: 11, wordWrapWidth: 200 },
    };
    expect(bitmapText(options, 'detail', 30, runs)).toBeInstanceOf(EmphasisLabel);
    expect(bitmapText.measure).toBe(glyphMeasure);
  });

  it('draws a note’s blocks in its room, through the factory', () => {
    const note: NoteShape = {
      id: 'n',
      text: '# Title\n\n- **one**\n- two',
      rect: { x: 0, y: 0, width: 240, height: 120 },
    };
    const make = Object.assign(() => undefined, {
      note: (shape: NoteShape, color: string) =>
        noteLabel(shape.text, () => parseEmphasis(shape.text, { blocks: true }), {
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          size: 13,
          fill: color,
        }),
    }) as TextFactory;
    const [label] = writeNoteTexts([note], make);
    expect(label).toBeInstanceOf(EmphasisLabel);
    expect((label as EmphasisLabel).laid.lines).toHaveLength(3);
  });
});
