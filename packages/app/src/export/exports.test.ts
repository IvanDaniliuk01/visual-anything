// @vitest-environment node
// In Node, as the command line and Claude export: the PDF is made there as it is in the browser.
import { describe, expect, it } from 'vitest';
import { SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { usersAndOrders, VIEW as TABLES_VIEW } from '../test/tables';
import {
  EXPORT_FORMATS,
  ExportError,
  exportFileName,
  exportView,
  formatsFor,
  isExportFormat,
} from './exports';

describe('exportView', () => {
  it.each([
    ['svg', 'image/svg+xml', /^<\?xml/],
    ['md', 'text/markdown;charset=utf-8', /^# System overview/],
    ['mermaid', 'text/plain;charset=utf-8', /^%% /],
    ['structurizr', 'text/plain;charset=utf-8', /^\/\/ /],
  ] as const)(
    'answers %s as text, with its media type, file name and size',
    async (format, type, start) => {
      const exported = await exportView(loadSample(), SAMPLE_VIEW, format);
      expect(exported.format).toBe(format);
      expect(exported.mediaType).toBe(type);
      expect(exported.text).toMatch(start);
      expect(exported.bytes).toBeUndefined();
      expect(exported.size).toBe(new TextEncoder().encode(exported.text).byteLength);
      expect(exported.fileName).toMatch(/^My systems - System overview\.(svg|md|mmd|dsl)$/);
    },
  );

  it('answers a PDF as bytes, with the outline attached under the Markdown file’s name', async () => {
    const exported = await exportView(loadSample(), SAMPLE_VIEW, 'pdf', {
      date: new Date(Date.UTC(2026, 9, 25)),
    });
    expect(exported.text).toBeUndefined();
    expect(exported.bytes?.byteLength).toBe(exported.size);
    expect(exported.fileName).toBe('My systems - System overview.pdf');
    const text = new TextDecoder('latin1').decode(exported.bytes);
    expect(text).toContain('(My systems - System overview.md)');
  }, 60_000);

  it('names the outline in the SVG’s description, under the name its export is saved as', async () => {
    const exported = await exportView(loadSample(), SAMPLE_VIEW, 'svg');
    expect(exported.text).toContain('“My systems - System overview.md”');
  });

  it('refuses a view the project does not have', async () => {
    await expect(exportView(loadSample(), 'nowhere', 'svg')).rejects.toBeInstanceOf(ExportError);
  });
});

describe('the formats', () => {
  it('are named as the command line takes them', () => {
    expect(EXPORT_FORMATS).toEqual(['svg', 'pdf', 'md', 'mermaid', 'structurizr']);
    expect(isExportFormat('pdf')).toBe(true);
    expect(isExportFormat('png')).toBe(false);
    expect(isExportFormat('toString')).toBe(false);
  });

  it('say what they leave out, and Structurizr is offered only for views of Systems components', () => {
    const sample = formatsFor(loadSample(), SAMPLE_VIEW);
    expect(sample.every((choice) => choice.available && choice.leavesOut !== '')).toBe(true);
    const tables = formatsFor(usersAndOrders(), TABLES_VIEW);
    expect(tables.find((choice) => choice.format === 'structurizr')).toMatchObject({
      available: false,
      why: 'The view shows no element of the Systems package.',
    });
  });

  it('name files without what a file system cannot hold', () => {
    expect(exportFileName('My: "project"', 'View/one?', 'svg')).toBe(
      'My- -project- - View-one-.svg',
    );
    expect(exportFileName('', '...', 'md')).toBe('view.md');
  });
});
