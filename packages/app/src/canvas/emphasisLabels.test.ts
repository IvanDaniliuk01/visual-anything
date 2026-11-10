import {
  MATH_EM,
  emphasisRuns,
  facePalette,
  parseEmphasis,
  robotoWidth,
  typesetMath,
  type FaceDrawing,
} from '@visual-anything/core';
import { BitmapFont, Cache, Container, Graphics, Texture } from 'pixi.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { settle, withFakeMathFonts } from '../test/math-fonts';
import { emphasisBacks } from './colors';
import { writeNoteTexts, type TextFactory } from './draw';
import {
  EmphasisLabel,
  drawGlyphs,
  emphasisLabel,
  laidOutRuns,
  noteLabel,
  tintLabel,
} from './emphasisLabels';
import { FaceLabel, drawFaceDrawing } from './faceDraw';
import { bitmapText } from './labels';
import { forgetMathFonts, wantMathDrawing } from './mathFonts';
import { canvasMeasure } from './textBlock';
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
  it('measures in Roboto’s widths in the core, whatever font is installed (ADR 0083)', () => {
    expect(canvasMeasure('abcd', 'regular', 8)).toBe(robotoWidth('abcd', 'regular', 8));
    expect(canvasMeasure('abcd', 'italic', 8)).toBe(robotoWidth('abcd', 'italic', 8));
    expect(canvasMeasure('abcd', 'italic', 8)).not.toBe(canvasMeasure('abcd', 'regular', 8));
    expect(canvasMeasure('ab', 'mono', 16)).toBeCloseTo(19.2);
  });

  it('places each glyph by Roboto’s widths, as the text was measured', () => {
    const graphics = new Graphics();
    drawGlyphs(graphics, 'iW', 'regular', 16, 10, 20, 0xffffff);
    const xs = graphics.context.instructions.map((each) => (each.data as { dx: number }).dx);
    expect(xs[0]).toBeCloseTo(10);
    expect(xs[1]).toBeCloseTo(10 + robotoWidth('i', 'regular', 16));
  });

  it('scales each glyph from the size the font measures at, not its ascent and descent', () => {
    // PixiJS measures a dynamic font at 100, where Roboto's ascent and descent come to about 117.
    const font = { ...fakeFont(), baseMeasurementFontSize: 100 } as unknown as BitmapFont;
    font.fontMetrics.fontSize = 117;
    font.fontMetrics.ascent = 93;
    const key = 'visual-anything-text-bitmap';
    const kept = Cache.get<BitmapFont>(key);
    Cache.remove(key);
    Cache.set(key, font);
    try {
      const graphics = new Graphics();
      drawGlyphs(graphics, 'W', 'regular', 10, 0, 20, 0xffffff);
      const glyph = graphics.context.instructions[0]?.data as { dw: number; dy: number };
      expect(glyph.dw).toBeCloseTo((Texture.WHITE.orig.width * 10) / 100);
      expect(glyph.dy).toBeCloseTo(20 - 9.3);
    } finally {
      Cache.remove(key);
      Cache.set(key, kept);
    }
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
    expect(bitmapText.measure).toBe(canvasMeasure);
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

describe('Math on the canvas (ADR 0106)', () => {
  afterEach(() => {
    forgetMathFonts();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (document as { fonts?: unknown }).fonts;
  });

  const drawingOf = (tex: string) => {
    const typeset = typesetMath(tex, { display: false });
    if (!typeset.ok) throw new Error(typeset.error);
    return typeset.drawing;
  };
  /** Installs the families a formula's glyphs use, as a project that holds it does on open. */
  const installed = async (tex: string) => {
    const made = withFakeMathFonts();
    wantMathDrawing(drawingOf(tex));
    await settle(made);
  };
  const textures = (graphics: Graphics) =>
    graphics.context.instructions.filter((each) => each.action === 'texture');

  it('draws a formula’s glyphs as quads, its rules with them, and its paths over them', async () => {
    const tex = '\\frac{x}{\\sqrt{2}}';
    await installed(tex);
    const drawing = drawingOf(tex);
    const label = new EmphasisLabel(laidOutRuns(emphasisRuns(`$${tex}$`), 16, 400, 'left', 1));
    expect(textures(label.glyphs)).toHaveLength(drawing.glyphs.length);
    // The fraction's line, drawn with the glyphs.
    const fills = label.glyphs.context.instructions.filter((each) => each.action === 'fill');
    expect(fills).toHaveLength(drawing.rules.length);
    // The surd, a graphic of its own sharing its piece's context.
    expect(label.paths.children).toHaveLength(drawing.paths.length);
    const again = new EmphasisLabel(laidOutRuns(emphasisRuns(`$${tex}$ b`), 16, 400, 'left', 1));
    expect((again.paths.children[0] as Graphics).context).toBe(
      (label.paths.children[0] as Graphics).context,
    );
    // Placed and scaled to the formula's size, tinted with the text.
    const piece = label.paths.children[0] as Graphics;
    expect(piece.scale.x).toBeCloseTo((16 * MATH_EM) / 64);
    tintLabel(label, '#123456');
    expect(label.paths.tint).toBe(0x123456);
    expect(label.glyphs.tint).toBe(0x123456);
  });

  it('places a glyph by the drawing, at its own size', async () => {
    const tex = 'x^2';
    await installed(tex);
    const drawing = drawingOf(tex);
    const label = new EmphasisLabel(laidOutRuns(emphasisRuns(`$${tex}$`), 10, 400, 'left', 1));
    const em = 10 * MATH_EM;
    const quads = textures(label.glyphs).map((each) => each.data as { dx: number; dw: number });
    drawing.glyphs.forEach((glyph, at) => {
      expect(quads[at]!.dx).toBeCloseTo(glyph.x * em);
      expect(quads[at]!.dw).toBeCloseTo((Texture.WHITE.orig.width * em * glyph.size) / 16);
    });
  });

  it('draws rules and paths but no glyph until its families are installed, then again', async () => {
    const made = withFakeMathFonts();
    const tex = '\\sqrt{y}';
    const label = new EmphasisLabel(laidOutRuns(emphasisRuns(`$${tex}$`), 16, 400, 'left', 1));
    expect(textures(label.glyphs)).toHaveLength(0);
    expect(label.paths.children).toHaveLength(1);
    const repaint = vi.spyOn(label, 'repaint');
    await settle(made);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(textures(label.glyphs)).toHaveLength(drawingOf(tex).glyphs.length);
    // Drawn again, it keeps one graphic for each path.
    expect(label.paths.children).toHaveLength(1);
  });

  it('leaves out the glyphs past where a formula was cut', async () => {
    const tex = 'a+b+c+d+e+f+g+h+i+j';
    await installed(tex);
    const full = drawingOf(tex).width * 10 * MATH_EM;
    const laid = laidOutRuns(emphasisRuns(`$${tex}$`), 10, full * 0.4, 'left', 1);
    const piece = laid.lines[0]!.pieces[0]!;
    expect(piece.math?.clip).toBeDefined();
    const label = new EmphasisLabel(laid);
    const right = piece.x + piece.math!.clip!;
    // The fake text fonts lack "…": every quad is the formula's.
    const quads = textures(label.glyphs);
    expect(quads.length).toBeGreaterThan(0);
    expect(quads.length).toBeLessThan(drawingOf(tex).glyphs.length);
    for (const quad of quads) expect((quad.data as { dx: number }).dx).toBeLessThan(right);
  });

  it('places a detail by height: a line holding a tall formula needs its height', () => {
    const runs = emphasisRuns('$\\dfrac{\\dfrac{a}{b}}{c}$');
    const place = {
      x: 0,
      y: 0,
      anchor: { x: 0, y: 0 },
      size: 10,
      width: 200,
      align: 'left' as const,
      room: 13,
      fill: '#1F2933',
    };
    expect(emphasisLabel(runs, place)).toBeUndefined();
    const label = emphasisLabel(runs, { ...place, room: 60 });
    expect(label?.laid.lines).toHaveLength(1);
    expect(label?.laid.height).toBeGreaterThan(13);
  });

  it('draws a face’s formula in its run’s color, its paths tinted so', async () => {
    const tex = '\\sqrt{\\frac{a}{b}}';
    await installed(tex);
    const drawing = drawingOf(tex);
    const face: FaceDrawing = {
      width: 100,
      height: 40,
      cut: false,
      boxes: [],
      runs: [
        {
          text: `$${tex}$`,
          x: 4,
          y: 20,
          width: drawing.width * 11 * MATH_EM,
          size: 11,
          variant: 'regular',
          color: 'text',
          line: 0,
          paragraph: 0,
          math: { tex, display: false, drawing, size: 11 * MATH_EM },
        },
      ],
      bands: [],
      images: [],
      regions: [],
    };
    const graphics = new Graphics();
    const paths = new Container();
    const palette = facePalette('light', '#FFFFFF', '#5B6675');
    drawFaceDrawing(graphics, face, { x: 0, y: 0 }, palette, undefined, { paths });
    expect(textures(graphics)).toHaveLength(drawing.glyphs.length);
    expect(paths.children).toHaveLength(drawing.paths.length);
    expect((paths.children[0] as Graphics).tint).toBe(0x1f2933);
    const label = new FaceLabel(face, { x: 0, y: 0 });
    label.paint('light', '#FFFFFF', '#5B6675');
    label.paint('dark', '#1C2027', '#8F9AA6');
    // Painted again, it keeps one graphic for each path.
    expect(label.paths.children).toHaveLength(drawing.paths.length);
  });
});
