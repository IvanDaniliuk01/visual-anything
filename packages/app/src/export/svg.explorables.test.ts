// @vitest-environment node
/**
 * Explorables in the SVG and the PDF (ADR 0107): a shape that shows one is drawn as the still the app
 * holds of it, or as its card, drawn from its data: its name, what it explains, the script libraries
 * it asks for and why it is not running. Nothing of its page goes in. The command line, which has no
 * app to take stills, draws cards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvalHashOf, explorablesIn, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import { loadSample } from '../test/sample';
import { exportView, svgExplorablesOf } from './exports';
import { writePdf } from './pdf';
import { writeSvg } from './svg';

const TEXT = readFileSync(
  join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
  'utf8',
);
/** A PNG's first bytes, in base64, which the drawing writes as it is given. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

afterEach(() => setCurrentLanguage('en'));

/** The quadratic sample with its explorable's text, and a loose one far below its view. */
function quadratic(): { project: ProjectSnapshot; view: string } {
  const project = loadSample('quadratic-function');
  const view = project.views[0];
  if (!view) throw new Error('The sample has no view.');
  return {
    view: view.id,
    project: {
      ...project,
      explorableTexts: [{ id: 'quadratic.parabola', text: TEXT }],
      views: project.views.map((each) =>
        each.id === view.id
          ? {
              ...each,
              freeShapes: [
                ...each.freeShapes,
                {
                  kind: 'explorable',
                  id: 'loose-parabola',
                  x: 4000,
                  y: 3000,
                  width: 320,
                  height: 200,
                  explorable: 'quadratic.parabola',
                },
              ],
            }
          : each,
      ),
    },
  };
}

/** The `<g>` an explorable's shape is drawn in. */
function shapeOf(svg: string): string {
  const start = svg.indexOf('data-free-shape="loose-parabola"');
  expect(start).toBeGreaterThan(0);
  const open = svg.lastIndexOf('<g', start);
  let depth = 0;
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = open;
  for (let found = tags.exec(svg); found; found = tags.exec(svg)) {
    depth += found[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return svg.slice(open, found.index + found[0].length);
  }
  throw new Error('The shape is not closed.');
}

describe('an explorable in the SVG', () => {
  it('is its card, with its name, what it explains and why it is not running, and none of its page', () => {
    const { project, view } = quadratic();
    const drawing = writeSvg(project, view);
    const shape = shapeOf(drawing.text);
    expect(shape).toContain('data-explorable="quadratic.parabola"');
    expect(shape).toContain('aria-label="Parabola"');
    expect(drawing.texts).toContain('Parabola');
    expect(drawing.texts.join(' ')).toContain('It runs only in the Visual Anything app');
    expect(drawing.text).not.toContain('va.on(');
    expect(drawing.text).not.toMatch(/<(script|foreignObject|iframe)\b/i);
    expect(drawing.lost).toContain('Explorables without a still picture are drawn as their cards.');
  });

  it('lies inside the drawing wherever it is on the canvas', () => {
    const { project, view } = quadratic();
    const box = /viewBox="([^"]+)"/.exec(writeSvg(project, view).text)?.[1]?.split(' ').map(Number);
    const [x = 0, y = 0, width = 0, height = 0] = box ?? [];
    expect(x + width).toBeGreaterThanOrEqual(4320);
    expect(y + height).toBeGreaterThanOrEqual(3200);
  });

  it('says on its card that it is not approved, when the approvals say so', () => {
    const { project, view } = quadratic();
    const drawing = writeSvg(project, view, { explorables: { approvals: [] } });
    expect(drawing.texts.join(' ')).toContain('Not approved yet: Approve to run.');
    expect(drawing.lost).not.toContain(
      'Explorables without a still picture are drawn as their cards.',
    );
  });

  it('is the still the app holds of it, where it holds one', () => {
    const { project, view } = quadratic();
    const viewFile = project.views.find((each) => each.id === view);
    const definition = explorablesIn(project).explorable('quadratic.parabola')?.definition;
    const hash = approvalHashOf(definition?.hash ?? '', []);
    const explorables = svgExplorablesOf(viewFile ?? { freeShapes: [] }, {
      approvals: [{ hash, explorable: 'quadratic.parabola', by: 'person' }],
      stillOf: (shape) =>
        shape.id === 'loose-parabola'
          ? { format: 'png', data: PNG, width: 512, height: 320 }
          : undefined,
    });
    const drawing = writeSvg(project, view, explorables ? { explorables } : {});
    const shape = shapeOf(drawing.text);
    expect(shape).toMatch(/<use href="#va-solid-\d+"/);
    expect(drawing.text).toContain(`data:image/png;base64,${PNG}`);
    expect(shape).not.toContain('<text');
  });

  it('writes its card in Spanish', () => {
    setCurrentLanguage('es');
    const { project, view } = quadratic();
    const drawing = writeSvg(project, view, { explorables: { approvals: [] } });
    expect(drawing.texts.join(' ')).toContain('Todavía no está aprobado: Aprobar para ejecutarlo.');
  });

  it('is its card from the command line, as exportView draws it without an app', async () => {
    const { project, view } = quadratic();
    const exported = await exportView(project, view, 'svg');
    expect(exported.text).toContain('data-explorable="quadratic.parabola"');
    expect(exported.lost).toContain(
      'Explorables without a still picture are drawn as their cards.',
    );
  });
});

describe('an explorable in the PDF', () => {
  it('is drawn as its card, as the SVG draws it', async () => {
    const { project, view } = quadratic();
    const pdf = await writePdf(project, view, {
      date: new Date(Date.UTC(2026, 10, 12)),
      explorables: { approvals: [] },
    });
    expect(pdf.bytes.byteLength).toBeGreaterThan(1000);
    expect(pdf.lost).not.toContain('The view draws nothing.');
  });
});
