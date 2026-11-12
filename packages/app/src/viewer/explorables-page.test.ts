/**
 * A read-only page holds no explorable's page (ADR 0107, ADR 0041): only what draws its card, its
 * definition's name, description and script libraries' names, and nothing of its text, which never
 * travels in a page; its policy and its scripts are those of any page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { pageDataOf, readPageData } from './data';
import { writePage, type ViewerAssets } from './page';

const ASSETS: ViewerAssets = {
  script: 'document.body.dataset.viewer = "ready";',
  style: ':root { color: CanvasText; }',
};

const TEXT = readFileSync(
  join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
  'utf8',
);

/** The quadratic sample with its explorable's text, as the program holds it, and a loose one. */
function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  return {
    ...project,
    explorableTexts: [{ id: 'quadratic.parabola', text: TEXT }],
    views: project.views.map((view, at) =>
      at === 0
        ? {
            ...view,
            freeShapes: [
              ...view.freeShapes,
              {
                kind: 'explorable',
                id: 'loose-parabola',
                x: 0,
                y: 600,
                width: 320,
                height: 200,
                explorable: 'quadratic.parabola',
              },
            ],
          }
        : view,
    ),
  };
}

describe('a read-only page of a project with explorables', () => {
  it('holds what draws the card, and nothing of the explorable’s page', async () => {
    const data = pageDataOf(quadratic());
    const json = JSON.stringify(data);
    expect(json).not.toContain('explorableTexts');
    expect(json).not.toContain('va.on(');
    expect(json).toContain('"name":"Parabola"');
    const { html } = await writePage({ assets: ASSETS, data, title: 'Quadratic' });
    expect(html).not.toContain('va.on(');
    expect(html).not.toMatch(/<iframe\b/i);
    // Its scripts are the page's own: the policy's, the data and the viewer.
    expect([...html.matchAll(/<script\b/gi)]).toHaveLength(3);
    expect(readPageData(dataOf(html), validateFile).ok).toBe(true);
  });
});

function dataOf(html: string): string {
  const found = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  if (!found) throw new Error('The page holds no data.');
  return found[1] ?? '';
}
