import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_MATH_CHARACTERS, type MathDrawing, type TypesetMath } from './drawing';
import { typesetMath } from './typeset';

function drawn(tex: string, display = false): MathDrawing {
  const result = typesetMath(tex, { display });
  if (!result.ok) throw new Error(`${tex} was not drawn: ${result.error}`);
  return result.drawing;
}

function refused(tex: string, display = false): string {
  const result = typesetMath(tex, { display });
  if (result.ok) throw new Error(`${tex} was drawn`);
  return result.error;
}

describe('typesetMath', () => {
  it('lays a fraction out in ems, with its glyphs, its line and its box', () => {
    const drawing = drawn('\\frac{a}{b}');
    expect(drawing.glyphs.map((g) => [g.char, g.font, g.size])).toEqual([
      ['b', 'Math-Italic', 0.7],
      ['a', 'Math-Italic', 0.7],
    ]);
    const [b, a] = drawing.glyphs;
    expect(a!.baseline).toBeLessThan(0);
    expect(b!.baseline).toBeGreaterThan(0);
    expect(drawing.rules).toHaveLength(1);
    const line = drawing.rules[0]!;
    expect(line.height).toBeCloseTo(0.04, 5);
    expect(line.y).toBeLessThan(0);
    expect(line.dashed).toBeUndefined();
    expect(drawing.width).toBeGreaterThan(line.width);
    expect(drawing.height).toBeGreaterThan(-a!.baseline);
    expect(drawing.depth).toBeGreaterThanOrEqual(b!.baseline - 1e-9);
    expect(drawing.paths).toEqual([]);
    expect(drawing.fonts).toEqual(['Math-Italic']);
  });

  it('lists the distinct fonts its glyphs use, in order', () => {
    expect(drawn('\\mathbb{R} + x = 1').fonts).toEqual([
      'AMS-Regular',
      'Main-Regular',
      'Math-Italic',
    ]);
    expect(drawn('\\sum_{i=1}^n i', true).fonts).toContain('Size2-Regular');
    expect(drawn('\\sum_{i=1}^n i', false).fonts).toContain('Size1-Regular');
  });

  it('places glyphs by the fonts’ own advances', () => {
    const [x, plus, y] = drawn('x+y').glyphs;
    expect(x!.x).toBe(0);
    // x's advance, the binary operator's medium space, then +.
    expect(plus!.x).toBeCloseTo(0.572 + 4 / 18 - 0, 3);
    expect(y!.x).toBeGreaterThan(plus!.x + 0.778);
  });

  it('gives a surd its path, view box and aspect, from KaTeX’s own path data', () => {
    const [surd] = drawn('\\sqrt{x}').paths;
    expect(surd).toBeDefined();
    expect(surd!.d).toMatch(/^M\d/);
    expect(surd!.viewBox).toEqual({
      x: 0,
      y: 0,
      width: 400000,
      height: expect.any(Number) as number,
    });
    expect(surd!.preserveAspectRatio).toBe('xMinYMin slice');
    expect(surd!.width).toBeGreaterThan(0);
    expect(surd!.height).toBeGreaterThan(0);
  });

  it('turns a cancel stroke into the band it draws, in the box’s own ems', () => {
    const [stroke] = drawn('\\cancel{xy}').paths;
    expect(stroke!.preserveAspectRatio).toBe('none');
    expect(stroke!.viewBox).toEqual({ x: 0, y: 0, width: stroke!.width, height: stroke!.height });
    expect(stroke!.d).toMatch(/^M[-\d.]+ [-\d.]+L.*Z$/);
    expect(drawn('\\xcancel{xy}').paths[0]!.d.match(/M/g)).toHaveLength(2);
  });

  it('marks dashed rules, and draws a separator as its border only', () => {
    const rules = drawn(
      '\\begin{array}{l:r} x & 1 \\\\ \\hdashline y & 2 \\end{array}',
      true,
    ).rules;
    expect(rules.filter((rule) => rule.dashed)).toHaveLength(2);
    const separator = rules.find((rule) => rule.dashed && rule.height > rule.width)!;
    expect(separator.width).toBeCloseTo(0.04, 5);
    const solid = drawn('\\begin{array}{|c|} x \\end{array}', true).rules;
    expect(solid.every((rule) => rule.dashed === undefined)).toBe(true);
  });

  it('draws a frame as its four borders', () => {
    const rules = drawn('\\boxed{x}').rules;
    expect(rules).toHaveLength(4);
    const [top, bottom, left, right] = rules;
    expect(top!.width).toBeCloseTo(bottom!.width, 9);
    expect(left!.height).toBeCloseTo(right!.height, 9);
    expect(right!.x + right!.width).toBeCloseTo(top!.x + top!.width, 9);
  });

  it('measures a phantom but does not draw it', () => {
    const plain = drawn('ac');
    const phantom = drawn('a\\phantom{b}c');
    expect(phantom.glyphs.map((g) => g.char)).toEqual(['a', 'c']);
    expect(phantom.width).toBeGreaterThan(plain.width);
    expect(drawn('\\phantom{\\frac{1}{2}}').rules).toEqual([]);
  });

  it('stacks top-level lines, the box reaching down to the last one', () => {
    const one = drawn('a', true);
    const two = drawn('a \\\\ y', true);
    const [a, y] = two.glyphs;
    expect(a!.baseline).toBe(0);
    expect(y!.baseline).toBeGreaterThan(1);
    expect(two.height).toBeCloseTo(one.height, 9);
    expect(two.depth).toBeGreaterThan(y!.baseline + 0.1);
  });

  it('keeps each result by formula and style, frozen', () => {
    const first = typesetMath('\\alpha^2', { display: false });
    expect(typesetMath('\\alpha^2', { display: false })).toBe(first);
    expect(typesetMath('\\alpha^2', { display: true })).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    if (first.ok) {
      expect(Object.isFrozen(first.drawing.glyphs)).toBe(true);
      expect(Object.isFrozen(first.drawing.glyphs[0])).toBe(true);
    }
    const failed = typesetMath('\\frac{', { display: false });
    expect(typesetMath('\\frac{', { display: false })).toBe(failed);
  });

  it('keeps the 2,000 used last, dropping the least recently used', () => {
    const kept = typesetMath('k_0', { display: false });
    const dropped = typesetMath('d_0', { display: false });
    for (let i = 1; i < 2_000; i++) {
      typesetMath(`x_{${i}}`, { display: false });
      // Using k_0 keeps it among the most recent.
      if (i % 500 === 0) typesetMath('k_0', { display: false });
    }
    expect(typesetMath('k_0', { display: false })).toBe(kept);
    expect(typesetMath('d_0', { display: false })).not.toBe(dropped);
  });
});

describe('what typesetMath refuses', () => {
  it('a formula longer than the cap', () => {
    expect(typesetMath('x'.repeat(MAX_MATH_CHARACTERS), { display: false }).ok).toBe(true);
    expect(refused('x'.repeat(MAX_MATH_CHARACTERS + 1))).toBe(
      'A formula takes at most 2,000 characters; this one has 2,001.',
    );
  });

  it('the refused commands, as command tokens', () => {
    expect(refused('\\color{red} x')).toBe(
      'Math does not take \\color: colors come from the theme.',
    );
    expect(refused('\\textcolor{red}{x}')).toBe(
      'Math does not take \\textcolor: colors come from the theme.',
    );
    expect(refused('\\colorbox{red}{x}')).toBe(
      'Math does not take \\colorbox: colors come from the theme.',
    );
    expect(refused('\\href{https://example.com}{x}')).toBe(
      'Math does not take \\href: a link is written with its own syntax.',
    );
    expect(refused('\\def\\c{\\color{red}} \\c x')).toMatch(/\\color/);
    // \colorful is another command, which KaTeX does not know; \\color is a line break and a word.
    expect(refused('\\colorful')).toMatch(
      /^KaTeX parse error: Undefined control sequence: \\colorful/,
    );
    expect(typesetMath('a \\\\color', { display: false }).ok).toBe(true);
  });

  it('a TeX error, with KaTeX’s message', () => {
    expect(refused('\\frac{a}')).toMatch(/^KaTeX parse error: /);
    expect(refused('x^')).toMatch(/^KaTeX parse error: /);
    expect(refused('\\def\\a{\\a}\\a')).toMatch(/Too many expansions/);
  });

  it('a construct the layout does not know, never drawing it wrong', () => {
    const constructs: [string, boolean, RegExp][] = [
      ['\\raisebox{0.5em}{x}', false, /\\raisebox/],
      ['\\vcenter{x}', false, /\\vcenter/],
      ['\\begin{CD} A @>>> B \\end{CD}', true, /CD environment/],
      ['E = mc^2 \\tag{1}', true, /\\tag/],
      ['\\htmlStyle{color: red}{x}', false, /\\htmlStyle/],
      ['\\includegraphics{a.png}', false, /\\includegraphics/],
      ['\\url{https://example.com}', false, /\\url/],
      ['\\begin{align} a &= b \\end{align}', true, /numbered formulas/],
      ['\\begin{equation} a \\end{equation}', true, /numbered formulas/],
      ['\\reflectbox{x}', false, /\\reflectbox/],
      ['\\angl{n}', false, /\\angl/],
      ['\\fcolorbox{red}{blue}{x}', false, /\\fcolorbox|colored/],
      ['\\pmb{x}', false, /\\pmb/],
      ['\\text{日本}', false, /KaTeX’s fonts do not hold it/],
    ];
    for (const [tex, display, message] of constructs) {
      expect(refused(tex, display), tex).toMatch(message);
    }
    expect(drawn('\\begin{align*} a &= b \\end{align*}', true).glyphs).toHaveLength(3);
  });

  it('never throws', () => {
    const pieces = fc.constantFrom(
      '\\frac',
      '\\sqrt',
      '{',
      '}',
      '^',
      '_',
      '&',
      '\\\\',
      '\\begin{array}{c}',
      '\\end{array}',
      '\\left(',
      '\\right)',
      '\\color',
      '\\def',
      '#1',
      'x',
      '1',
      ' ',
      '\\text{',
      '😀',
      '\\overbrace',
      '\\cancel',
      '\\hline',
      '%',
      '$',
    );
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 12 }), fc.boolean(), (parts, display) => {
        const result: TypesetMath = typesetMath(parts.join(''), { display });
        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) expect(result.error).not.toBe('');
      }),
      { numRuns: 300 },
    );
  });
});
