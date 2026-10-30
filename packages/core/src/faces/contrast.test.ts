import { describe, expect, it } from 'vitest';
import { compileFace } from './compile';
import { classMatches, classPattern, faceContrastProblems } from './contrast';
import { facePalette, readableOn, resolveFaceColor } from './palette';
import { ADR_FACE, face } from './test-faces';

const palettes = {
  light: facePalette('light', '#FFFFFF', '#3E4C59'),
  dark: facePalette('dark', '#1E2329', '#9AA5B1'),
};

const problems = (markup: string, style: string) =>
  faceContrastProblems(compileFace(face(markup, style)), palettes);

describe("a face's contrast", () => {
  it('passes for the theme tokens, which read on the shape in both themes', () => {
    // The ADR's example draws `var(--text)` on a badge of a fixed light blue: in the dark theme the
    // token is light, as it reads on the shape's dark fill, and the badge's text reads poorly.
    expect(
      faceContrastProblems(compileFace(ADR_FACE), palettes).map((each) => each.reason),
    ).toEqual(['Its text, #FFFFFF on #9DC3E6, reads at 1.8:1 in the dark theme, under 4.5:1.']);
    const fixed = compileFace({
      ...ADR_FACE,
      style: [...ADR_FACE.style, '.status-frozen { color: #1F2933; }'],
    });
    expect(faceContrastProblems(fixed, palettes)).toEqual([]);
    for (const fill of ['#FFFFFF', '#1E2329', '#9DC3E6', '#B42318', '#FFEB99']) {
      const { text, muted } = readableOn(fill);
      expect(resolveFaceColor('text', facePalette('light', fill, '#000000'))).toBe(text);
      expect(muted).toBeDefined();
    }
  });

  it('warns about a color that reads poorly, in the theme it reads poorly in, at its line', () => {
    const found = problems(
      '<div class="back">\n  <p>{{name}}</p>\n</div>',
      '.back { background: #303030; } p { color: #555555; }',
    );
    expect(
      found.map((each) => [each.code, each.line, each.column, each.reason.includes('light')]),
    ).toEqual([
      ['face-contrast', 2, 6, true],
      ['face-contrast', 2, 6, false],
    ]);
  });

  it('asks 3:1 of large text, and checks every rule a class made from a value could pick', () => {
    expect(problems('<b>{{name}}</b>', 'b { color: #8A8A8A; font-size: 24px; }')).toEqual([]);
    expect(problems('<b>{{name}}</b>', 'b { color: #8A8A8A; font-size: 14px; }')).toHaveLength(1);
    const dynamic = problems(
      '<p class="s-{{status}}">x</p>',
      '.s-live { color: #00FF00; } .other { color: #FFFF00; }',
    );
    expect(dynamic.filter((each) => each.reason.includes('light'))).toHaveLength(1);
  });

  it('stays quick on nested elements whose classes are made from values, and says it checked in part', () => {
    // Each element could pick any of nine rules, through sixteen levels: 9^16 ways to draw it.
    const rules = Array.from(
      { length: 9 },
      (_, at) => `.k-${at} { color: #${at}${at}${at}${at}${at}${at}; }`,
    ).join(' ');
    const markup = `${'<div class="k-{{a}}">'.repeat(16)}x${'</div>'.repeat(16)}`;
    const started = performance.now();
    const found = faceContrastProblems(compileFace(face(markup, rules)), palettes);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(found.at(-1)).toMatchObject({ code: 'face-contrast', line: 0, column: 0 });
    expect(found.at(-1)!.reason).toContain('checked only in part');
  });

  it('matches a class made from values in time linear in the class', () => {
    const slots = '{{a}}x{{b}}{{c}}'.repeat(60);
    const template = compileFace(face(`<p class="${slots}y">z</p>`)).markup!.nodes[0];
    expect(template?.kind).toBe('element');
    const pattern = classPattern(template?.kind === 'element' ? template.classes[0]! : []);
    // Adjacent slots count as one.
    expect(pattern.filter((each) => each === '')).toHaveLength(1);
    const long = 'x'.repeat(50_000);
    const started = performance.now();
    expect(classMatches(pattern, long)).toBe(false);
    expect(classMatches(pattern, `${'x'.repeat(60)}y`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
    const status = classPattern([
      'status-',
      { ref: { kind: 'attribute', name: 's' }, plain: false },
    ]);
    expect(classMatches(status, 'status-en-revision')).toBe(true);
    expect(classMatches(status, 'status-')).toBe(true);
    expect(classMatches(status, 'status_x')).toBe(false);
    expect(classMatches(status, 'status-X')).toBe(false);
    const middle = classPattern([
      { ref: { kind: 'name' }, plain: false },
      '-of-',
      { ref: { kind: 'name' }, plain: false },
    ]);
    expect(classMatches(middle, 'a-of-b-of-c')).toBe(true);
    expect(classMatches(middle, 'a-of')).toBe(false);
    expect(classMatches(['plain'], 'plain')).toBe(true);
  });

  it('checks every branch of a condition', () => {
    expect(
      problems('<p if="a">ok</p><p else="" class="pale">x</p>', '.pale { color: #F0F0F0; }'),
    ).toHaveLength(1);
  });
});
