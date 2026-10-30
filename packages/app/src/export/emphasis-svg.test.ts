import { describe, expect, it } from 'vitest';
import { emphasisBacks } from '../canvas/colors';
import { buildScene } from '../canvas/scene';
import { EMPHASIS_VIEW, calendarOf, withEmphasis } from '../test/emphasis';
import { MONO_FAMILY, usesEmphasisFonts } from './emphasis-svg';
import { writeSvg } from './svg';

function readSvg(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const errors = document.getElementsByTagName('parsererror');
  if (errors.length > 0) throw new Error(`The SVG does not parse: ${errors[0]?.textContent}`);
  return document;
}

describe('text emphasis in the SVG (ADR 0082)', () => {
  const project = withEmphasis(
    '**slots** _t_ ==a== `id`',
    { detail: { attributes: ['note', 'code'], componentName: false } },
    '## Who owns it\n- [x] **Scheduling**',
  );
  const svg = writeSvg(project, EMPHASIS_VIEW).text;
  const document = readSvg(svg);
  const calendar = document.querySelector(`g[data-element="${calendarOf(project)}"]`);

  it('writes a detail’s runs as tspans, each in its weight, style and family, placed by its x', () => {
    const spans = [...(calendar?.querySelectorAll('tspan') ?? [])];
    const bold = spans.find((span) => span.textContent === 'slots');
    expect(bold?.getAttribute('font-weight')).toBe('700');
    expect(spans.find((span) => span.textContent === 't')?.getAttribute('font-style')).toBe(
      'italic',
    );
    expect(spans.find((span) => span.textContent === 'id')?.getAttribute('font-family')).toBe(
      MONO_FAMILY,
    );
    for (const span of spans) expect(span.getAttribute('x')).not.toBeNull();
    // What takes no emphasis is written as it is, markers and all.
    expect(calendar?.textContent).toContain("'**'::text");
    expect(calendar?.textContent).not.toContain('**slots**');
  });

  it('draws a highlight and code on their backs, as rects', () => {
    const fills = [...(calendar?.querySelectorAll('rect') ?? [])].map((rect) =>
      rect.getAttribute('fill'),
    );
    const shape = buildScene(project, EMPHASIS_VIEW).shapes.find(
      (each) => each.element === calendarOf(project),
    );
    expect(shape).toBeDefined();
    const text = calendar?.querySelector('text:last-of-type')?.getAttribute('fill') ?? '';
    expect(fills).toContain(emphasisBacks(text).highlight);
    expect(fills).toContain(emphasisBacks(text).code);
  });

  it('writes a note’s blocks: its heading larger and bold, its task box', () => {
    const note = document.querySelector('g[data-free-shape="calendar-note"]');
    const spans = [...(note?.querySelectorAll('tspan') ?? [])];
    const heading = spans.find((span) => span.textContent === 'Who owns it');
    expect(Number(heading?.getAttribute('font-size'))).toBeGreaterThan(13);
    expect(heading?.getAttribute('font-weight')).toBe('700');
    expect(note?.querySelectorAll('rect[stroke]').length).toBeGreaterThan(1);
  });

  it('says which fonts beyond Roboto Regular and Bold the PDF needs', () => {
    expect(usesEmphasisFonts(svg)).toEqual({ italic: true, mono: true });
    expect(usesEmphasisFonts(writeSvg(withEmphasis('plain'), EMPHASIS_VIEW).text)).toEqual({
      italic: false,
      mono: false,
    });
  });
});
