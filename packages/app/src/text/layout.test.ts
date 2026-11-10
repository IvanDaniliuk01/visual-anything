import { MATH_EM, emphasisRuns, parseEmphasis, typesetMath } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LINE_HEIGHT,
  holdsMath,
  layOutBlocks,
  layOutRuns,
  lineText,
  variantOf,
  type LaidText,
  type Measure,
} from './layout';

/** Every character is half its size wide, bold ones a little more, code ones more again. */
const measure: Measure = (text, variant, size) =>
  [...text].length * size * (variant === 'mono' ? 0.6 : variant.startsWith('bold') ? 0.55 : 0.5);

const SIZE = 10;
const texts = (laid: LaidText) => laid.lines.map(lineText);

describe('laying out a text of one line (a detail)', () => {
  it('draws runs without emphasis as one piece on one line', () => {
    const laid = layOutRuns(emphasisRuns('a plain detail'), {
      measure,
      size: SIZE,
      width: 200,
      align: 'left',
    });
    expect(texts(laid)).toEqual(['a plain detail']);
    expect(laid.lines[0]?.pieces).toHaveLength(1);
    expect(laid.cut).toBe(false);
    expect(laid.height).toBe(SIZE * LINE_HEIGHT);
  });

  it('gives each run its font variant, and places them one after the other', () => {
    const laid = layOutRuns(emphasisRuns('a **b** *c* `d` ***e***'), {
      measure,
      size: SIZE,
      width: 500,
      align: 'left',
    });
    const pieces = laid.lines[0]?.pieces ?? [];
    expect(pieces.map((piece) => [piece.text, piece.variant])).toEqual([
      ['a ', 'regular'],
      ['b', 'bold'],
      [' ', 'regular'],
      ['c', 'italic'],
      [' ', 'regular'],
      ['d', 'mono'],
      [' ', 'regular'],
      ['e', 'boldItalic'],
    ]);
    for (let at = 1; at < pieces.length; at++) {
      const before = pieces[at - 1]!;
      expect(pieces[at]!.x).toBeCloseTo(before.x + measure(before.text, before.variant, SIZE));
    }
  });

  it('draws a band behind a highlight and code, and a line under or through its run', () => {
    const laid = layOutRuns(emphasisRuns('==hi== `co` ++un++ ~~st~~'), {
      measure,
      size: SIZE,
      width: 500,
      align: 'left',
    });
    const kinds = laid.lines[0]?.bands.map((band) => band.kind);
    expect(kinds).toEqual(['highlight', 'code', 'underline', 'strike']);
    const [highlight, , underline, strike] = laid.lines[0]!.bands;
    const line = laid.lines[0]!;
    expect(highlight!.y).toBeGreaterThanOrEqual(line.top);
    expect(highlight!.y + highlight!.height).toBeLessThanOrEqual(line.top + line.height + 1e-9);
    expect(underline!.y).toBeGreaterThan(line.baseline);
    expect(strike!.y).toBeLessThan(line.baseline);
  });

  it('wraps at spaces, across runs, to its width', () => {
    const laid = layOutRuns(emphasisRuns('one **two** three four'), {
      measure,
      size: SIZE,
      width: 45,
      align: 'left',
    });
    expect(texts(laid)).toEqual(['one two', 'three', 'four']);
    for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(45);
  });

  it('keeps a word whose runs touch whole, as `**bo**ld` is one word', () => {
    const laid = layOutRuns(emphasisRuns('aa **bo**ld'), {
      measure,
      size: SIZE,
      width: 30,
      align: 'left',
    });
    expect(texts(laid)).toEqual(['aa', 'bold']);
  });

  it('breaks a word wider than a line where it reaches the width', () => {
    const laid = layOutRuns(emphasisRuns('abcdefghij'), {
      measure,
      size: SIZE,
      width: 30,
      align: 'left',
    });
    expect(texts(laid)).toEqual(['abcdef', 'ghij']);
  });

  it('stops at its lines, the last one ending in "…" within its width', () => {
    const laid = layOutRuns(emphasisRuns('one two three four five six'), {
      measure,
      size: SIZE,
      width: 50,
      align: 'left',
      maxLines: 2,
    });
    expect(laid.lines).toHaveLength(2);
    expect(laid.cut).toBe(true);
    expect(lineText(laid.lines[1]!).endsWith('…')).toBe(true);
    expect(laid.lines[1]!.width).toBeLessThanOrEqual(50);
  });

  it('is not cut when it fits its lines exactly', () => {
    const laid = layOutRuns(emphasisRuns('one two three'), {
      measure,
      size: SIZE,
      width: 50,
      align: 'left',
      maxLines: 2,
    });
    expect(texts(laid)).toEqual(['one two', 'three']);
    expect(laid.cut).toBe(false);
  });

  it('centres each line in its width', () => {
    const laid = layOutRuns(emphasisRuns('ab'), {
      measure,
      size: SIZE,
      width: 100,
      align: 'center',
    });
    expect(laid.lines[0]!.pieces[0]!.x).toBe((100 - 10) / 2);
  });

  it('never draws a line wider than its width, nor more lines than asked', () => {
    const word = fc.stringMatching(/^[a-z*_=~`+ ]{0,12}$/);
    fc.assert(
      fc.property(
        fc.array(word, { maxLength: 12 }),
        fc.integer({ min: 20, max: 200 }),
        fc.integer({ min: 1, max: 6 }),
        (words, width, maxLines) => {
          const laid = layOutRuns(emphasisRuns(words.join(' ')), {
            measure,
            size: SIZE,
            width,
            align: 'left',
            maxLines,
          });
          expect(laid.lines.length).toBeLessThanOrEqual(maxLines);
          for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(width + 1e-9);
        },
      ),
    );
  });
});

describe('laying out a text of several lines (a note)', () => {
  const blocks = (text: string) => parseEmphasis(text, { blocks: true });
  const options = { measure, size: SIZE, width: 300, align: 'left' as const };

  it('keeps line breaks, and puts room between paragraphs', () => {
    const laid = layOutBlocks(blocks('first\nsecond\n\nthird'), options);
    expect(texts(laid)).toEqual(['first', 'second', 'third']);
    const [a, b, c] = laid.lines;
    expect(b!.top - a!.top).toBe(SIZE * LINE_HEIGHT);
    expect(c!.top - b!.top).toBeGreaterThan(SIZE * LINE_HEIGHT);
  });

  it('draws headings larger and bold, the first the largest', () => {
    const laid = layOutBlocks(blocks('# One\n## Two\n### Three\nbody'), options);
    const sizes = laid.lines.map((line) => line.pieces[0]!.size);
    expect(sizes[0]).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]).toBeGreaterThan(sizes[2]!);
    expect(sizes[2]).toBeGreaterThan(SIZE);
    expect(sizes[3]).toBe(SIZE);
    expect(laid.lines[0]!.pieces[0]!.variant).toBe('bold');
  });

  it('writes a list’s markers, and indents its items and their nested lists', () => {
    const laid = layOutBlocks(blocks('- one\n  - inner\n- two\n\n3. three'), options);
    expect(texts(laid)).toEqual(['•one', '◦inner', '•two', '3.three']);
    const [one, inner] = laid.lines;
    expect(inner!.pieces[0]!.x).toBeGreaterThan(one!.pieces[0]!.x);
  });

  it('draws a task item’s box, filled when done', () => {
    const laid = layOutBlocks(blocks('- [ ] to do\n- [x] done'), options);
    expect(texts(laid)).toEqual(['to do', 'done']);
    const boxes = laid.lines.map((line) => line.bands.filter((band) => band.kind === 'box'));
    expect(boxes[0]).toHaveLength(1);
    expect(boxes[1]).toHaveLength(2);
  });

  it('draws a quote with a bar beside each of its lines, a rule across, and code on its back', () => {
    const laid = layOutBlocks(blocks('> quoted\n\n---\n\n```\nlet a = 1\n```'), options);
    const kinds = laid.lines.map((line) => line.bands.map((band) => band.kind));
    expect(kinds).toEqual([['bar'], ['rule'], ['code']]);
    expect(laid.lines[2]!.pieces[0]!.variant).toBe('mono');
  });

  it('lays out a table’s cells in columns, its head bold, a rule under it', () => {
    const laid = layOutBlocks(blocks('| a | b |\n| - | -: |\n| 1 | 22 |'), options);
    expect(laid.lines).toHaveLength(2);
    const [head, row] = laid.lines;
    expect(head!.pieces.map((piece) => piece.variant)).toEqual(['bold', 'bold']);
    expect(head!.bands.some((band) => band.kind === 'rule')).toBe(true);
    // The second column is right aligned: its cells end where the column ends.
    const end = (piece: { x: number; text: string; variant: 'bold' | 'regular' }) =>
      piece.x + measure(piece.text, piece.variant, SIZE);
    expect(end(row!.pieces[1] as never)).toBeCloseTo(end(head!.pieces[1] as never), 0);
  });

  it('underlines a link’s label', () => {
    const laid = layOutBlocks(blocks('see [the site](https://example.com)'), options);
    expect(laid.lines[0]!.bands.map((band) => band.kind)).toEqual(['underline']);
  });

  it('stops at its height, its last line ending in "…"', () => {
    const laid = layOutBlocks(blocks('a\nb\nc\nd'), {
      ...options,
      maxHeight: SIZE * LINE_HEIGHT * 2,
    });
    expect(texts(laid)).toEqual(['a', 'b…']);
    expect(laid.cut).toBe(true);
  });
});

describe('a run’s font variant', () => {
  it('is monospace for code whatever else it takes', () => {
    const run = emphasisRuns('`x`')[0]!;
    expect(variantOf({ ...run, bold: true })).toBe('mono');
  });
});

describe('Math in text (ADR 0106)', () => {
  const blocks = (text: string) => parseEmphasis(text, { blocks: true });
  const drawingOf = (tex: string, display = false) => {
    const typeset = typesetMath(tex, { display });
    if (!typeset.ok) throw new Error(typeset.error);
    return typeset.drawing;
  };
  const mathPieces = (laid: LaidText) =>
    laid.lines.flatMap((line) => line.pieces.filter((piece) => piece.math));

  it('lays a formula out as one piece, measured by its drawing at 1.21 times the text', () => {
    const laid = layOutRuns(emphasisRuns('area $\\pi r^2$ here'), {
      measure,
      size: SIZE,
      width: 500,
      align: 'left',
    });
    const [piece] = mathPieces(laid);
    expect(piece?.text).toBe('$\\pi r^2$');
    expect(piece?.math?.tex).toBe('\\pi r^2');
    expect(piece?.math?.size).toBeCloseTo(SIZE * MATH_EM);
    expect(piece?.math?.scale).toBe(1);
    const width = drawingOf('\\pi r^2').width * SIZE * MATH_EM;
    const line = laid.lines[0]!;
    const after = line.pieces[line.pieces.indexOf(piece!) + 1]!;
    expect(after.x).toBeCloseTo(piece!.x + width);
    expect(lineText(line)).toBe('area $\\pi r^2$ here');
    expect(holdsMath(laid)).toBe(true);
    expect(laid.cut).toBe(false);
  });

  it('keeps a line as tall as one of text when its formula fits in it', () => {
    const laid = layOutRuns(emphasisRuns('a $x$ b'), {
      measure,
      size: SIZE,
      width: 500,
      align: 'left',
    });
    expect(laid.lines[0]!.height).toBe(SIZE * LINE_HEIGHT);
  });

  it('makes a line that holds a tall formula as tall as the formula, the next line under it', () => {
    const tex = '\\dfrac{a+b}{\\sum_{i=1}^{n} c_i}';
    const laid = layOutRuns(emphasisRuns(`first $${tex}$ second`), {
      measure,
      size: SIZE,
      width: 60,
      align: 'left',
      maxLines: 6,
    });
    const drawing = drawingOf(tex);
    const em = SIZE * MATH_EM;
    const tall = laid.lines.find((line) => line.pieces.some((piece) => piece.math))!;
    expect(tall.height).toBeGreaterThan(SIZE * LINE_HEIGHT);
    expect(tall.baseline - tall.top).toBeGreaterThanOrEqual(drawing.height * em);
    expect(tall.top + tall.height - tall.baseline).toBeGreaterThanOrEqual(drawing.depth * em);
    const next = laid.lines[laid.lines.indexOf(tall) + 1]!;
    expect(next.top).toBeCloseTo(tall.top + tall.height);
    expect(laid.height).toBeCloseTo(laid.lines.reduce((sum, line) => sum + line.height, 0));
    // Its fraction's line is a band of the formula's rules.
    expect(tall.bands.some((band) => band.kind === 'rule')).toBe(true);
  });

  it('never breaks a formula: it goes to a line of its own when it does not fit after text', () => {
    const tex = 'a+b+c';
    const width = drawingOf(tex).width * SIZE * MATH_EM;
    const laid = layOutRuns(emphasisRuns(`word $${tex}$`), {
      measure,
      size: SIZE,
      width: width + 5,
      align: 'left',
      maxLines: 3,
    });
    expect(texts(laid)).toEqual(['word', `$${tex}$`]);
    expect(laid.cut).toBe(false);
  });

  it('shrinks a formula wider than its line, down to 70 %, and counts the text as cut', () => {
    const tex = 'a+b+c+d';
    const width = drawingOf(tex).width * SIZE * MATH_EM;
    const laid = layOutRuns(emphasisRuns(`$${tex}$`), {
      measure,
      size: SIZE,
      width: width * 0.8,
      align: 'left',
    });
    const [piece] = mathPieces(laid);
    expect(piece?.math?.scale).toBeCloseTo(0.8);
    expect(piece?.math?.clip).toBeUndefined();
    expect(laid.lines[0]!.width).toBeLessThanOrEqual(width * 0.8 + 1e-9);
    expect(laid.cut).toBe(true);
  });

  it('cuts a formula still too wide at 70 %, ending in "…" within its width', () => {
    const tex = '\\frac{a}{b}+c+d+e+f+g+h';
    const width = drawingOf(tex).width * SIZE * MATH_EM;
    const laid = layOutRuns(emphasisRuns(`$${tex}$`), {
      measure,
      size: SIZE,
      width: width * 0.4,
      align: 'left',
    });
    const line = laid.lines[0]!;
    const [piece] = mathPieces(laid);
    expect(piece?.math?.scale).toBe(0.7);
    expect(piece?.math?.clip).toBeGreaterThan(0);
    expect(line.pieces.at(-1)?.text).toBe('…');
    expect(line.width).toBeLessThanOrEqual(width * 0.4 + 1e-9);
    // Its rules end where it is cut.
    for (const band of line.bands) {
      expect(band.x + band.width).toBeLessThanOrEqual(piece!.x + piece!.math!.clip! + 1e-9);
    }
    expect(laid.cut).toBe(true);
  });

  it('draws a formula that fails as its TeX in Roboto Mono, with a dotted line under it', () => {
    const laid = layOutRuns(emphasisRuns('see $\\color{red}{x}$ here'), {
      measure,
      size: SIZE,
      width: 500,
      align: 'left',
    });
    const line = laid.lines[0]!;
    expect(mathPieces(laid)).toEqual([]);
    expect(lineText(line)).toBe('see $\\color{red}{x}$ here');
    const tex = line.pieces.find((piece) => piece.text.includes('color'));
    expect(tex?.variant).toBe('mono');
    const dashes = line.bands.filter((band) => band.kind === 'warning');
    expect(dashes.length).toBeGreaterThan(1);
    for (const dash of dashes) expect(dash.y).toBeGreaterThan(line.baseline);
  });

  it('cuts by height: a line whose formula does not fit in the room is left out', () => {
    const runs = emphasisRuns('one two $\\dfrac{\\dfrac{a}{b}}{\\dfrac{c}{d}}$');
    const options = { measure, size: SIZE, width: 30, align: 'left' as const, maxLines: 6 };
    const whole = layOutRuns(runs, options);
    expect(whole.lines).toHaveLength(3);
    const cut = layOutRuns(runs, { ...options, maxHeight: SIZE * LINE_HEIGHT * 2.5 });
    expect(cut.lines).toHaveLength(2);
    expect(cut.cut).toBe(true);
    expect(lineText(cut.lines[1]!).endsWith('…')).toBe(true);
    // Lines of text alone cut by height as they did by lines.
    const plain = layOutRuns(emphasisRuns('one two three four'), {
      ...options,
      maxHeight: SIZE * LINE_HEIGHT * 2,
    });
    expect(plain.lines).toHaveLength(2);
  });

  it('centers a math block on a line of its own, in display style', () => {
    const laid = layOutBlocks(blocks('before\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\nafter'), {
      measure,
      size: SIZE,
      width: 300,
      align: 'left',
    });
    expect(laid.lines).toHaveLength(3);
    const [before, block, after] = laid.lines;
    const piece = block!.pieces[0]!;
    expect(piece.math?.display).toBe(true);
    const width = drawingOf('\\sum_{i=1}^{n} i', true).width * SIZE * MATH_EM;
    expect(piece.x).toBeCloseTo((300 - width) / 2);
    expect(block!.top).toBeGreaterThanOrEqual(before!.top + before!.height);
    expect(after!.top).toBeGreaterThan(block!.top + block!.height);
    expect(block!.height).toBeGreaterThan(SIZE * LINE_HEIGHT);
  });

  it('draws a math block that fails as its TeX, with a dotted line', () => {
    const laid = layOutBlocks(blocks('$$\\href{x}{y}$$'), {
      measure,
      size: SIZE,
      width: 300,
      align: 'left',
    });
    expect(texts(laid)).toEqual(['$$\\href{x}{y}$$']);
    expect(laid.lines[0]!.pieces[0]!.variant).toBe('mono');
    expect(laid.lines[0]!.bands.some((band) => band.kind === 'warning')).toBe(true);
  });

  it('makes a table row as tall as its tallest formula, its cells on one baseline', () => {
    const laid = layOutBlocks(blocks('| a | b |\n| - | - |\n| $\\dfrac{1}{2}$ | text |'), {
      measure,
      size: SIZE,
      width: 300,
      align: 'left',
    });
    const row = laid.lines[1]!;
    expect(row.height).toBeGreaterThan(SIZE * LINE_HEIGHT);
    expect(row.pieces.some((piece) => piece.math)).toBe(true);
    expect(laid.lines[0]!.height).toBe(SIZE * LINE_HEIGHT);
  });

  it('never draws a line wider than its width, whatever formulas it holds', () => {
    const part = fc.constantFrom(
      'word',
      '$x^2$',
      '$\\frac{a}{b}$',
      '$a+b+c+d+e$',
      '$\\bad$',
      '**b**',
    );
    fc.assert(
      fc.property(
        fc.array(part, { maxLength: 8 }),
        fc.integer({ min: 10, max: 200 }),
        (parts, width) => {
          const laid = layOutRuns(emphasisRuns(parts.join(' ')), {
            measure,
            size: SIZE,
            width,
            align: 'left',
            maxLines: 4,
          });
          for (const line of laid.lines) expect(line.width).toBeLessThanOrEqual(width + 1e-6);
          for (const piece of mathPieces(laid))
            expect(piece.math!.scale).toBeGreaterThanOrEqual(0.7);
        },
      ),
    );
  });
});
