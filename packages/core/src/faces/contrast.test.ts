import { describe, expect, it } from 'vitest';
import { compileFace } from './compile';
import { faceContrastProblems } from './contrast';
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

  it('checks every branch of a condition', () => {
    expect(
      problems('<p if="a">ok</p><p else="" class="pale">x</p>', '.pale { color: #F0F0F0; }'),
    ).toHaveLength(1);
  });
});
