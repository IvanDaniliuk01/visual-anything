import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesIn } from '../test-support';
import { MOST_EXPORTED } from './export-tools';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

describe('export_view', () => {
  it('answers a view as SVG, writing nothing and changing nothing', async () => {
    const before = tools.session.snapshot;
    const files = await filesIn(tools.session.folder);
    const result = await tools.value('export_view', { view: 'overview', format: 'svg' });
    expect(result).toMatchObject({
      view: 'overview',
      format: 'svg',
      fileName: 'Shop - Overview.svg',
      mediaType: 'image/svg+xml',
    });
    expect(result.text).toMatch(/<title id="va-title">Overview<\/title>/);
    expect(result.text).toContain('data-relation="customer-calls-api"');
    expect(result.note).toMatch(/Nothing was written/);
    expect(tools.session.snapshot).toBe(before);
    expect(tools.session.history).toEqual({});
    expect(await filesIn(tools.session.folder)).toEqual(files);
  });

  it('answers the outline in Markdown, Mermaid and Structurizr DSL, each with what it lost', async () => {
    const markdown = await tools.value('export_view', { view: 'overview', format: 'markdown' });
    expect(markdown.text).toMatch(/^# Overview\n/);
    expect(markdown.text).toContain('- **Customer** (Person)');
    expect(markdown.fileName).toBe('Shop - Overview.md');
    const mermaid = await tools.value('export_view', { view: 'overview', format: 'mermaid' });
    expect(mermaid.text).toContain('e_customer -->|"HTTPS"| e_api');
    expect(mermaid.lost).toEqual(expect.arrayContaining([expect.stringMatching(/positions/)]));
    const dsl = await tools.value('export_view', {
      view: 'overview',
      format: 'structurizr',
      theme: 'dark',
    });
    expect(dsl.text).toContain('customer = person "Customer"');
    expect(dsl.text).toContain('customer -> api "HTTPS"');
  });

  it('names the views there are when the one asked for is not', async () => {
    expect(await tools.failure('export_view', { view: 'nowhere', format: 'svg' })).toBe(
      'There is no view "nowhere". The views are: overview.',
    );
  });

  it('refuses an answer too long to hold, saying what to do instead', async () => {
    await tools.asPerson({
      type: 'create-free-shape',
      view: 'overview',
      shape: {
        kind: 'note',
        id: 'long',
        x: 0,
        y: 400,
        width: 400,
        height: 200,
        text: 'x '.repeat(MOST_EXPORTED),
      },
    });
    expect(await tools.failure('export_view', { view: 'overview', format: 'markdown' })).toMatch(
      /more than an answer holds .* Export markdown instead, or ask the person to export the file/,
    );
  });
});
