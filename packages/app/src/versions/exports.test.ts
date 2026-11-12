import { compareProjects } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import type { ShownComparison } from '../canvas/comparison/mode';
import type { FileExportContext } from '../export/formats';
import { forgetMathOutlines, loadedMathOutlines, mathGlyphId } from '../export/math-svg';
import { buildScene } from '../canvas/scene';
import { translatorFor } from '../i18n/t';
import { VIEW, comparedSample, done } from '../test/comparison';
import { withEmphasis } from '../test/emphasis';
import { comparisonExports } from './exports';
import { CompareSession } from './session';
import { chosenOf } from './versions';

const MAIN = {
  kind: 'branch' as const,
  name: 'main',
  commit: 'a1b2c3d4e5f6'.padEnd(40, '0'),
  short: 'a1b2c3d',
  subject: 'Add the SMS channel',
  author: 'Ana',
  time: Date.UTC(2026, 9, 28, 10, 0),
};

function shownSample(): { shown: ShownComparison; context: FileExportContext } {
  const { older, newer, comparison } = comparedSample();
  const shown: ShownComparison = {
    serial: 1,
    older,
    newer,
    comparison,
    title: 'Compared with main (a1b2c3d)',
    follows: true,
    drawing: 'comparison',
    faint: true,
  };
  const view = newer.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('The sample has no view.');
  return {
    shown,
    context: { project: newer, view, scene: buildScene(newer, VIEW), theme: 'light' },
  };
}

describe('the comparison’s exports', () => {
  it('offers each drawing as SVG and PDF, then the summary', () => {
    const { shown } = shownSample();
    const en = translatorFor('en');
    expect(comparisonExports(shown, VIEW).map((format) => format.name(en))).toEqual([
      'Before, as SVG',
      'Before, as PDF',
      'After, as SVG',
      'After, as PDF',
      'Comparison, as SVG',
      'Comparison, as PDF',
      'Summary of the changes, in Markdown',
    ]);
    // A PDF is made when it is saved, as any PDF.
    expect(comparisonExports(shown, VIEW).filter((format) => format.slow)).toHaveLength(3);
  });

  it('writes each drawing as SVG with the comparison’s legend, named after its view and drawing', async () => {
    const { shown, context } = shownSample();
    const [before, , after] = comparisonExports(shown, VIEW);
    const made = await before?.make(context);
    expect(made?.fileName).toBe('My systems - System overview - Before.svg');
    const text = await made?.blob.text();
    expect(text).toContain('<svg');
    expect(text).toContain('Compared with main (a1b2c3d): Before');
    expect(text).toContain('data-legend-mark="removed"');
    const later = await (await after?.make(context))?.blob.text();
    expect(later).toContain('Compared with main (a1b2c3d): After');
  });

  it('writes the summary, naming both versions', async () => {
    const { shown, context } = shownSample();
    const session = new CompareSession();
    // The session knows the version as Compare with… showed it.
    await session.compare(chosenOf(MAIN), {
      ask: () =>
        Promise.resolve({
          ok: true,
          version: { kind: 'commit', commit: MAIN.commit },
          older: shown.older,
          newer: shown.newer,
          comparison: shown.comparison,
        }),
      show: () => undefined,
      t: translatorFor('en'),
    });
    const en = translatorFor('en');
    const summary = comparisonExports(shown, VIEW, () =>
      session.versionsOf(shown, en, Date.UTC(2026, 9, 29)),
    ).at(-1);
    const made = await summary?.make(context);
    expect(made?.fileName).toBe('My systems - Changes.md');
    const text = (await made?.blob.text()) ?? '';
    expect(text).toContain('- Older version: main · `a1b2c3d4e5f6` · 2026-10-28');
    expect(text).toContain('- Newer version: The project now · 2026-10-29');
    expect(text).toContain('WhatsApp Business');
  });

  it('writes Math’s glyphs as outlines, loading the outline table first (ADR 0106)', async () => {
    const older = withEmphasis('$\\frac{1}{n}\\sum_i x_i$', {
      detail: { attributes: ['note'], componentName: false },
    });
    const newer = done(older, {
      type: 'update-element',
      id: 'whatsapp',
      changes: { name: 'WhatsApp Business' },
    });
    const { shown, context } = shownSample();
    const withMath: ShownComparison = {
      ...shown,
      older,
      newer,
      comparison: compareProjects(older, newer),
    };
    const exports = comparisonExports(withMath, VIEW);
    for (const drawing of ['before', 'after', 'comparison']) {
      forgetMathOutlines();
      const svg = exports.find((each) => each.id === `comparison-${drawing}-svg`);
      const text = (await (await svg?.make({ ...context, project: newer }))?.blob.text()) ?? '';
      expect(loadedMathOutlines()).toBeDefined();
      expect(text, drawing).not.toContain('KaTeX');
      expect(text, drawing).toContain(`href="#${mathGlyphId('Main-Regular', '1')}"`);
    }
  });

  it('names no version in the summary of a comparison Compare with… did not show', () => {
    const { shown } = shownSample();
    expect(new CompareSession().versionsOf(shown, translatorFor('en'))).toBeUndefined();
  });
});
