import { compareProjects, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { comparisonScene } from '../canvas/comparison/scene';
import { compareView } from '@visual-anything/core';
import { comparedSample, done, VIEW } from '../test/comparison';
import { THEMES } from '../theme/themes';
import { comparisonMarkParts, glyphPath, svgOfComparison } from './comparison';
import { MOST_SUMMARY_CHANGES, text, writeComparisonSummary } from './comparison-summary';

const { older, newer, comparison } = comparedSample();

/** The SVG parsed, which must be well formed. */
function parsed(svg: string): Document {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document;
}

describe('svgOfComparison', () => {
  it('draws the comparison with its marks, what was removed faintly, and its legend', () => {
    const drawing = svgOfComparison(older, newer, VIEW, comparison, {
      title: 'Compared with HEAD',
    });
    const document = parsed(drawing.text);
    const marks = document.querySelector('[data-part="comparison"]');
    const states = new Set(
      [...(marks?.querySelectorAll('[data-mark]') ?? [])].map((each) =>
        each.getAttribute('data-mark'),
      ),
    );
    expect(states).toEqual(new Set(['added', 'removed', 'changed', 'moved', 'moved-from']));
    // The reminder service, deleted, is drawn at its older place, faintly.
    const removed = document.querySelector('[data-element="reminder-service"]');
    expect(removed?.getAttribute('opacity')).not.toBeNull();
    // What is unchanged is faint too; what changed is not.
    expect(
      document.querySelector('[data-element="booking-agent"]')?.getAttribute('opacity'),
    ).not.toBeNull();
    expect(document.querySelector('[data-element="whatsapp"]')?.getAttribute('opacity')).toBeNull();
    // The legend names the four marks, with the comparison's title.
    const legend = document.querySelector('[data-part="comparison-legend"]');
    expect(legend?.textContent).toContain('Compared with HEAD: Comparison');
    expect(legend?.querySelectorAll('[data-legend-mark]')).toHaveLength(4);
    expect(drawing.comparisonLegend).toBeDefined();
    expect(drawing.texts).toContain('Compared with HEAD: Comparison');
  });

  it('draws the older version before, and the newer after', () => {
    const before = parsed(
      svgOfComparison(older, newer, VIEW, comparison, { drawing: 'before' }).text,
    );
    expect(before.querySelector('[data-element="reminder-service"]')).not.toBeNull();
    expect(before.querySelector('[data-element="sms"]')).toBeNull();
    const after = parsed(
      svgOfComparison(older, newer, VIEW, comparison, { drawing: 'after' }).text,
    );
    expect(after.querySelector('[data-element="reminder-service"]')).toBeNull();
    expect(after.querySelector('[data-element="sms"]')).not.toBeNull();
    expect(after.querySelector('[data-mark="removed"]')).toBeNull();
  });

  it('dashes what was removed, and doubles what changed', () => {
    const shown = comparisonScene(
      older,
      newer,
      VIEW,
      compareView(comparison, older, newer, VIEW),
      'comparison',
    );
    const parts = comparisonMarkParts(shown, THEMES.light.canvas).join('');
    const document = parsed(`<svg xmlns="http://www.w3.org/2000/svg">${parts}</svg>`);
    const removed = document.querySelector('[data-mark="removed"] path');
    expect(removed?.getAttribute('stroke-dasharray')).not.toBeNull();
    const changed = document.querySelector('[data-mark="changed"] path');
    expect(changed?.getAttribute('d')?.match(/M/g)?.length).toBe(2);
    expect(glyphPath({ x: 0, y: 0 }, 'added', 8)).toMatch(/^M-4 0L4 0M0 -4L0 4$/);
  });

  it('keeps what is unchanged at full strength when asked', () => {
    const drawing = svgOfComparison(older, newer, VIEW, comparison, { faint: false });
    const document = parsed(drawing.text);
    expect(
      document.querySelector('[data-element="booking-agent"]')?.getAttribute('opacity'),
    ).toBeNull();
  });
});

describe('writeComparisonSummary', () => {
  it('names the versions, gives the counts, then the changes by view and by kind', () => {
    const summary = writeComparisonSummary(older, newer, comparison, {
      versions: {
        older: { name: 'main', commit: 'a1b2c3d4e5f6a7b8c9d0', date: Date.UTC(2026, 9, 28) },
        newer: { name: 'the files on disk' },
      },
      drawings: {
        [VIEW]: { before: 'system-overview.before.svg', comparison: 'system overview.svg' },
      },
    });
    expect(summary).toContain('- Older version: main · `a1b2c3d4e5f6` · 2026-10-28');
    expect(summary).toContain('## View “System overview”');
    expect(summary).toContain('### Elements');
    expect(summary).toContain('- \\~ **Changed** WhatsApp Business');
    expect(summary).toContain('  - Name: “WhatsApp channel” → “WhatsApp Business”');
    expect(summary).toContain(
      'Drawings: [Before](<system-overview.before.svg>) · [Comparison](<system%20overview.svg>)',
    );
  });

  it('escapes every text of the project, so that it makes no link, image, heading or HTML', () => {
    const hostile =
      '# [x](http://evil.example) ![i](y.png) <img src=x onerror=alert(1)> www.evil.example a@b.co **b**';
    const renamed = done(newer, {
      type: 'update-element',
      id: 'whatsapp',
      changes: { name: hostile },
    });
    const summary = writeComparisonSummary(older, renamed, compareProjects(older, renamed));
    for (const markup of ['[x](', '![i]', 'http://', 'www.evil', 'a@b', '**b**']) {
      expect(summary).not.toContain(markup);
    }
    // A tag's bracket is escaped, so that it reads as text.
    expect(summary).not.toMatch(/(?<!\\)<img/);
    expect(summary).toContain('\\<img');
    expect(summary).not.toMatch(/^#\s*\\?\[x/m);
    expect(text('a <b> & [c]')).toBe('a \\<b\\> &amp; \\[c\\]');
  });

  it('lists at most 1,000 changes, then says how many more there are', () => {
    const base = syntheticProject({ elements: 1_200 });
    const renamed: ProjectSnapshot = {
      ...base,
      model: {
        ...base.model,
        elements: base.model.elements.map((element) =>
          element.id === base.model.world.id ? element : { ...element, name: `${element.name}!` },
        ),
      },
    };
    const many = compareProjects(base, renamed);
    const summary = writeComparisonSummary(base, renamed, many);
    // Every change is a rename, written with its escaped glyph.
    const listed = summary.split('\n').filter((line) => line.startsWith('- \\~ ')).length;
    expect(listed).toBe(MOST_SUMMARY_CHANGES);
    expect(summary).toContain(`And ${many.changes.length - MOST_SUMMARY_CHANGES} more changes`);
  });

  it('says when nothing changed', () => {
    expect(writeComparisonSummary(older, older, compareProjects(older, older))).toContain(
      'No changes.',
    );
  });
});
