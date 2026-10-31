/**
 * Every icon comes from one set, `shell/icons.tsx` (A4): no component draws an icon of its own as an
 * inline `<svg>`, as a character standing for one, or through a stylesheet's `content`.
 */
import { describe, expect, it } from 'vitest';
import { componentFiles, elementsIn } from '../theme/controls';
import { allRules } from '../theme/stylesheets';
import { readSource } from '../theme/testing';

/**
 * Components that draw an `<svg>` that is no icon: a picture made from data. The canvas's own drawing,
 * faces and people's images are drawn by PixiJS or loaded as images, not written as JSX.
 */
const DRAWINGS: Record<string, string> = {
  'simulation/SimulationChart.tsx': 'the chart of a simulated number over its ticks',
  'tours/TourStage.tsx': 'the leader line from a tour’s caption to what it points at',
};

/**
 * Icons still drawn where they are, in a file another task owned while A4's styles were built: the
 * canvas's toolbar (`canvas/`), whose TypeScript the canvas task was changing. The set has its icons
 * already (`BringToFrontIcon`, `BringForwardIcon`, `SendBackwardIcon`, `SendToBackIcon`, and
 * `ZoomOutIcon` and `ZoomInIcon` for its "−" and "+"); the entry goes once the toolbar takes them.
 */
const NOT_YET_FROM_THE_SET: Record<string, string> = {};

/**
 * Characters that stand for an icon: arrows, technical and geometric symbols, dingbats, emoji, and
 * the multiplication sign as a close button. Written inside text, as in "A → B", "2×", a key such as
 * "⌘F" or the way a relation goes before an end's name, they are text, which this test leaves alone.
 */
const ICON_CHARACTER = /[←-⇿⌀-⏿■-◿☀-➿⤀-⥿⬀-⯿\u{1F300}-\u{1FAFF}×✕✖]/u;

/** JSX text that is only such a character, or a translated text that starts with one. */
function iconCharactersIn(path: string): string[] {
  const text = readSource(path);
  const found: string[] = [];
  for (const [whole, character = ''] of text.matchAll(/>\s*([^\s<>{}])\s*</gu)) {
    if (ICON_CHARACTER.test(character)) found.push(whole.trim());
  }
  for (const [whole, character = ''] of text.matchAll(/\bt\(\s*['"`]([^'"`\s])\s/gu)) {
    if (ICON_CHARACTER.test(character)) found.push(whole);
  }
  for (const [whole, character = ''] of text.matchAll(/\{\s*['"`]([^'"`\s])\s?['"`]\s*\}/gu)) {
    if (ICON_CHARACTER.test(character)) found.push(whole);
  }
  return found;
}

describe('icons', () => {
  it('are drawn by shell/icons.tsx alone: no other component writes an <svg>', () => {
    const drawing = componentFiles()
      .filter((path) => path !== 'shell/icons.tsx' && !(path in NOT_YET_FROM_THE_SET))
      .filter((path) => !(path in DRAWINGS))
      .flatMap((path) => elementsIn(path).filter(({ tag }) => tag === 'svg'))
      .map(({ path, line }) => `${path}:${line}`);
    expect(drawing).toEqual([]);
  });

  it('are never a character standing for an icon, in a component or a stylesheet', () => {
    const characters = componentFiles()
      .filter((path) => path !== 'shell/icons.tsx' && !(path in NOT_YET_FROM_THE_SET))
      .flatMap((path) => iconCharactersIn(path).map((found) => `${path}: ${found}`));
    const content = allRules().flatMap((rule) =>
      rule.declarations
        .filter(({ property, value }) => property === 'content' && ICON_CHARACTER.test(value))
        .map(({ value }) => `${rule.path}:${rule.line} content: ${value}`),
    );
    expect([...characters, ...content]).toEqual([]);
  });

  it('keep the lists above true', () => {
    for (const path of Object.keys(DRAWINGS)) {
      expect(
        elementsIn(path).some(({ tag }) => tag === 'svg'),
        path,
      ).toBe(true);
    }
    for (const path of Object.keys(NOT_YET_FROM_THE_SET)) {
      const own =
        elementsIn(path).some(({ tag }) => tag === 'svg') || iconCharactersIn(path).length > 0;
      expect(own, `${path} takes its icons from the set now: take it off the list`).toBe(true);
    }
  });

  it('find what they are meant to find', () => {
    expect(ICON_CHARACTER.test('×')).toBe(true);
    expect(ICON_CHARACTER.test('▸')).toBe(true);
    expect(ICON_CHARACTER.test('›')).toBe(false);
    expect(ICON_CHARACTER.test('…')).toBe(false);
  });
});
