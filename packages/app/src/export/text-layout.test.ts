import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { textWidth } from './measure';
import { BASELINE_BELOW_MIDDLE, LINE_HEIGHT, layOutText, wrapText } from './text-layout';

describe('wrapText', () => {
  it('keeps a text that fits on one line', () => {
    expect(wrapText('Appointments API', 200, 14)).toEqual(['Appointments API']);
  });

  it('breaks between words, keeping each line within the width', () => {
    const lines = wrapText('The service that books every appointment of the clinic', 120, 14);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 14)).toBeLessThanOrEqual(120);
    expect(lines.join(' ')).toBe('The service that books every appointment of the clinic');
  });

  it('keeps line breaks and breaks a word wider than a line', () => {
    expect(wrapText('one\ntwo', 200, 14)).toEqual(['one', 'two']);
    const lines = wrapText('Supercalifragilisticexpialidocious', 60, 14);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Supercalifragilisticexpialidocious');
  });

  it('never loses a character but white space, and ends whatever the width', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), fc.integer({ min: 1, max: 300 }), (text, width) => {
        const lines = wrapText(text, width, 12);
        const squeeze = (value: string) => value.replace(/\s+/g, '');
        expect(squeeze(lines.join(''))).toBe(squeeze(text));
      }),
    );
  });
});

describe('layOutText', () => {
  it('places one line by its baseline, below its middle', () => {
    const { lines, lineHeight } = layOutText({
      text: 'Booking agent',
      size: 14,
      x: 100,
      align: 'middle',
      y: 50,
      anchor: 'middle',
    });
    expect(lineHeight).toBe(14 * LINE_HEIGHT);
    expect(lines).toEqual([{ text: 'Booking agent', baseline: 50 + BASELINE_BELOW_MIDDLE * 14 }]);
  });

  it('stacks wrapped lines up from a bottom anchor and down from a top one', () => {
    const spec = {
      text: 'one two three four five six',
      size: 10,
      x: 0,
      align: 'start' as const,
      wrap: 40,
    };
    const up = layOutText({ ...spec, y: 100, anchor: 'bottom' });
    const down = layOutText({ ...spec, y: 100, anchor: 'top' });
    expect(up.lines.length).toBeGreaterThan(1);
    const last = up.lines.at(-1)?.baseline ?? 0;
    expect(last).toBeLessThan(100);
    expect(100 - last).toBeCloseTo(up.lineHeight / 2 - BASELINE_BELOW_MIDDLE * 10);
    expect(down.lines[0]?.baseline).toBeCloseTo(100 + down.lineHeight / 2 + 3.5);
  });

  it('cuts the lines past its room, the last one kept ending in "…" within the width', () => {
    const { lines } = layOutText({
      text: 'The service that books every appointment of the clinic, and more',
      size: 14,
      x: 0,
      align: 'middle',
      y: 0,
      anchor: 'top',
      wrap: 100,
      room: 14 * LINE_HEIGHT * 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]?.text.endsWith('…')).toBe(true);
    expect(textWidth(lines[1]?.text ?? '', 14)).toBeLessThanOrEqual(100);
  });

  it('writes nothing in a room smaller than one line, or for a blank text', () => {
    const base = { size: 14, x: 0, align: 'start' as const, y: 0, anchor: 'top' as const };
    expect(layOutText({ ...base, text: 'Name', room: 10 }).lines).toEqual([]);
    expect(layOutText({ ...base, text: '  \n ' }).lines).toEqual([]);
  });

  it('writes a text without a width on one line', () => {
    const { lines } = layOutText({
      text: 'a\nb   c',
      size: 12,
      x: 0,
      align: 'middle',
      y: 0,
      anchor: 'middle',
    });
    expect(lines.map((line) => line.text)).toEqual(['a b c']);
  });
});
