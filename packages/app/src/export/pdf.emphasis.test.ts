// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EMPHASIS_VIEW, withEmphasis } from '../test/emphasis';
import { fontFor, writePdf } from './pdf';

const DATE = new Date('2026-10-30T12:00:00Z');
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const fonts = (bytes: Uint8Array) =>
  [...latin1(bytes).matchAll(/\/BaseFont \/[A-Z]{6}\+([A-Za-z-]+)/g)].map((match) => match[1]);

describe('text emphasis in the PDF (ADR 0082)', () => {
  it('embeds Roboto Italic, Bold Italic and Roboto Mono when a text uses them', async () => {
    const project = withEmphasis('_slanted_ ***both*** `code`', {
      detail: { attributes: ['note'], componentName: false },
    });
    const embedded = fonts((await writePdf(project, EMPHASIS_VIEW, { date: DATE })).bytes);
    expect(embedded).toContain('Roboto-Italic');
    expect(embedded).toContain('Roboto-BoldItalic');
    expect(embedded.some((name) => name?.startsWith('RobotoMono'))).toBe(true);
  }, 60_000);

  it('embeds only Regular, Medium and Bold when no text uses the others', async () => {
    const embedded = fonts(
      (await writePdf(withEmphasis('plain'), EMPHASIS_VIEW, { date: DATE })).bytes,
    );
    // Clean writes names in Medium (ADR 0086).
    expect(new Set(embedded)).toEqual(new Set(['Roboto-Regular', 'Roboto-Medium', 'Roboto-Bold']));
  }, 60_000);

  it('picks the font for a family, a weight and a style', () => {
    expect(fontFor('Roboto Mono, monospace', false, false, true)).toBe('va-mono');
    expect(fontFor('system-ui', true, true, true)).toBe('va-bold-italic');
    expect(fontFor('system-ui', false, true, true)).toBe('va-italic');
    expect(fontFor('system-ui', false, true, false)).toBe('va-regular');
  });
});
