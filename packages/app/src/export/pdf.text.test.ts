// @vitest-environment node
/**
 * A shape's text in the PDF (ADR 0088, A6.2): a name in italics or in Roboto Mono is written in the
 * fonts the PDF embeds for them, as the canvas writes it in the fonts it loads.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { TextStyle } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { writePdf } from './pdf';

const VIEW = 'system-overview';
const DATE = new Date('2026-11-02T12:00:00Z');
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const fonts = (bytes: Uint8Array) =>
  [...latin1(bytes).matchAll(/\/BaseFont \/[A-Z]{6}\+([A-Za-z-]+)/g)].map((match) => match[1]);

function written(text: TextStyle, id = 'appointments-api'): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'update-element',
    id,
    changes: { appearanceTraits: { text } },
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('a shape’s text in the PDF (ADR 0088)', () => {
  it('embeds Roboto Italic for a name in italics', async () => {
    const embedded = fonts(
      (await writePdf(written({ italic: true, bold: false }), VIEW, { date: DATE })).bytes,
    );
    expect(embedded).toContain('Roboto-Italic');
  }, 60_000);

  it('embeds Roboto Mono for a name in it', async () => {
    const embedded = fonts((await writePdf(written({ font: 'mono' }), VIEW, { date: DATE })).bytes);
    expect(embedded.some((name) => name?.startsWith('RobotoMono'))).toBe(true);
  }, 60_000);
});
