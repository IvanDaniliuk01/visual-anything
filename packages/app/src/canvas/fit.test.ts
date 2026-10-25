import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HEADER_DETAIL_SIZE,
  HEADER_NAME_SIZE,
  ROW_DETAIL_SIZE,
  ROW_NAME_SIZE,
  estimateWidth,
  fitHeader,
  fitRow,
  fitText,
  headerRoom,
  rowRoom,
} from './fit';

describe('estimateWidth', () => {
  it('counts narrow letters as narrow and wide ones as wide', () => {
    expect(estimateWidth('iiii', 10)).toBeLessThan(estimateWidth('mmmm', 10));
    expect(estimateWidth('AAAA', 10)).toBeGreaterThan(estimateWidth('aaaa', 10));
  });

  it('grows with the size and with bold', () => {
    expect(estimateWidth('name', 14)).toBeGreaterThan(estimateWidth('name', 12));
    expect(estimateWidth('name', 12, true)).toBeGreaterThan(estimateWidth('name', 12));
  });

  it('is nothing for nothing', () => {
    expect(estimateWidth('', 12)).toBe(0);
  });
});

describe('fitText', () => {
  it('keeps a text that fits', () => {
    expect(fitText('id', 200, 12)).toBe('id');
  });

  it('cuts a text that does not fit at the last character that does, ending in "…"', () => {
    const fitted = fitText('a_very_long_column_name_indeed', 80, 12);
    expect(fitted.endsWith('…')).toBe(true);
    expect('a_very_long_column_name_indeed'.startsWith(fitted.slice(0, -1))).toBe(true);
    expect(estimateWidth(fitted, 12)).toBeLessThanOrEqual(80);
    // One more character would not fit.
    const longer = `${'a_very_long_column_name_indeed'.slice(0, fitted.length)}…`;
    expect(estimateWidth(longer, 12)).toBeGreaterThan(80);
  });

  it('writes nothing where not even "…" fits', () => {
    expect(fitText('name', 2, 12)).toBe('');
  });

  it('writes one line', () => {
    expect(fitText('two\nlines', 400, 12)).toBe('two lines');
  });

  it('always fits its estimate, and never throws, whatever the text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', maxLength: 200 }),
        fc.integer({ min: -10, max: 600 }),
        fc.boolean(),
        (text, width, bold) => {
          const fitted = fitText(text, width, 12, bold);
          expect(estimateWidth(fitted, 12, bold)).toBeLessThanOrEqual(Math.max(0, width));
          if (fitted !== '' && !fitted.endsWith('…')) {
            expect(fitted).toBe(text.replace(/\s*[\r\n]+\s*/g, ' '));
          }
        },
      ),
    );
  });
});

describe('fitHeader', () => {
  it('keeps both texts when they fit', () => {
    expect(fitHeader('users', 'Table', 240)).toEqual({ name: 'users', detail: 'Table' });
  });

  it('fits the detail first, to at most 40% of the room, and gives the name the rest', () => {
    const { name, detail } = fitHeader(
      'a_table_with_a_long_name',
      'a detail that is long too',
      200,
    );
    const room = headerRoom(200);
    expect(estimateWidth(detail, HEADER_DETAIL_SIZE)).toBeLessThanOrEqual(room * 0.4);
    expect(name.endsWith('…')).toBe(true);
    expect(
      estimateWidth(name, HEADER_NAME_SIZE, true) + 8 + estimateWidth(detail, HEADER_DETAIL_SIZE),
    ).toBeLessThanOrEqual(room);
  });

  it('never lets the name and the detail overlap, whatever they are', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        fc.integer({ min: 120, max: 800 }),
        fc.boolean(),
        fc.boolean(),
        (name, detailText, width, icon, toggle) => {
          const fitted = fitHeader(name, detailText, width, { icon, toggle });
          const room = headerRoom(width, { icon, toggle });
          const nameWidth = estimateWidth(fitted.name, HEADER_NAME_SIZE, true);
          const detailWidth = estimateWidth(fitted.detail, HEADER_DETAIL_SIZE);
          expect(nameWidth + (fitted.detail === '' ? 0 : detailWidth + 8)).toBeLessThanOrEqual(
            Math.max(0, room),
          );
        },
      ),
    );
  });
});

describe('fitRow', () => {
  it('keeps both texts when they fit', () => {
    expect(fitRow('id', 'uuid · PK', 240)).toEqual({ name: 'id', detail: 'uuid · PK' });
  });

  it('gives the detail at most 45% of the room', () => {
    const { detail } = fitRow('id', 'character varying(255) · PK · FK', 200);
    expect(estimateWidth(detail, ROW_DETAIL_SIZE)).toBeLessThanOrEqual(rowRoom(200) * 0.45);
  });

  it('never lets the name and the detail overlap, whatever they are', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        fc.integer({ min: 120, max: 800 }),
        fc.boolean(),
        (name, detailText, width, icon) => {
          const fitted = fitRow(name, detailText, width, { icon });
          const nameWidth = estimateWidth(fitted.name, ROW_NAME_SIZE);
          const detailWidth = estimateWidth(fitted.detail, ROW_DETAIL_SIZE);
          expect(nameWidth + (fitted.detail === '' ? 0 : detailWidth + 8)).toBeLessThanOrEqual(
            Math.max(0, rowRoom(width, { icon })),
          );
        },
      ),
    );
  });
});
