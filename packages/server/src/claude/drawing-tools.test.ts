/**
 * Claude's `import_drawing` (ADR 0068): HTML Claude passes becomes a drawing shown by an element, as
 * one action of Claude's, with what making it dropped in the answer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const CARD =
  '<div style="padding: 16px; border: 2px solid #1D4F91" onclick="steal()"><h2>Basic</h2><p>$10 a month</p><script>steal()</script></div>';

describe('import_drawing', () => {
  it('makes a new Box in the view that shows the drawing, as one action of Claude’s', async () => {
    const result = await tools.value('import_drawing', {
      name: 'pricing.html',
      html: CARD,
      width: 320,
      view: 'overview',
    });
    expect(result).toMatchObject({
      done: 'Import "pricing.html" as a drawing',
      undo: 'The person can undo it in the app.',
      size: { width: 320 },
      dropped: ['1 event handler attribute', '1 script element'],
    });
    expect(tools.session.actions).toMatchObject([
      { label: 'Import "pricing.html" as a drawing', author: 'claude' },
    ]);
    const element = tools.session.snapshot.model.elements.find(
      (each) => each.id === result.element,
    );
    expect(element).toMatchObject({
      name: 'pricing',
      component: 'systems.box',
      appearance: { image: { image: result.image, placement: 'drawing' } },
    });
  }, 60_000);

  it('shows the drawing on the element asked for', async () => {
    const result = await tools.value('import_drawing', { html: CARD, element: 'api' });
    expect(result.element).toBe('api');
    expect(
      tools.session.snapshot.model.elements.find((each) => each.id === 'api')?.appearance?.image,
    ).toMatchObject({ image: result.image, placement: 'drawing' });
  }, 60_000);

  it('refuses an address, both kinds of target, and what cannot be made', async () => {
    expect(
      await tools.failure('import_drawing', { html: 'https://example.com/card.html' }),
    ).toMatch(/^Pass the HTML itself: Visual Anything never fetches anything/);
    expect(
      await tools.failure('import_drawing', { html: CARD, element: 'api', view: 'overview' }),
    ).toBe(
      'Give element to show the drawing on an element, or component and view for a new one, not both.',
    );
    expect(await tools.failure('import_drawing', { html: '<div>'.repeat(200) })).toBe(
      'Not imported: The HTML nests elements over 128 deep.',
    );
    expect(await tools.failure('import_drawing', { html: CARD, element: 'nothing' })).toBe(
      'Not imported: There is no element "nothing".',
    );
    expect(tools.session.actions).toEqual([]);
  }, 60_000);
});
