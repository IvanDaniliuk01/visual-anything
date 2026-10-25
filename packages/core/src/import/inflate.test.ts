/**
 * Inflating deflate data with a cap (ADR-0042): what zlib writes, raw and wrapped, stored, fixed and
 * dynamic blocks, any bytes written by the tests' own deflater, and bombs and damaged data refused.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeBase64 } from '../images/base64';
import { decodeUtf8, inflate, InflateBudget, inflateRaw, inflateZlib } from './inflate';
import { ReadRefusal } from './reading';
import { deflateBomb, deflateFixed, deflateStored, hex, utf8 } from './test/deflate';

const budget = () => new InflateBudget(32 * 1024 * 1024);

function text(bytes: Uint8Array): string {
  return decodeUtf8(bytes);
}

describe('inflate', () => {
  it('reads what zlib writes: fixed, dynamic and stored blocks, raw and wrapped', () => {
    expect(text(inflateRaw(hex('cb48cdc9c957c8402701'), budget()))).toBe('hello hello hello hello');
    const dynamic = decodeBase64(
      'tcq7FYIwGAbQVb4JOL7wcazcwUMfSCA/hATyAEJnaWFl5xbOkMWcwlvfglxgCjcdvSTdwArGHbhlc0YGNSnh4LylyquYofjjvkuBMVDVobRm1qjNgjb0g4OZhIWXAoqtEdw0V2y2u/0hP57OF7Cy4qJuJLWd6rUZRut8mOYlrkiP9Eyv9E4fpO8P',
    )!;
    expect(text(inflateRaw(dynamic, budget()))).toBe(
      'Visual Anything reads draw.io files strictly. '.repeat(3) +
        'The quick brown fox jumps over the lazy dog; 0123456789 abcdefghijklmnopqrstuvwxyz ÁÉÍÓÚ ñ',
    );
    expect(text(inflateRaw(hex('010700f8ff73746f72656421'), budget()))).toBe('stored!');
    expect(text(inflateZlib(hex('789ccb48cdc9c957a8cac94c0200159503e6'), budget()))).toBe(
      'hello zlib',
    );
    // Either form, told apart by the zlib header.
    expect(text(inflate(hex('789ccb48cdc9c957a8cac94c0200159503e6'), budget()))).toBe('hello zlib');
    expect(text(inflate(hex('cb48cdc9c957c8402701'), budget()))).toBe('hello hello hello hello');
  });

  it('gives back any bytes the tests’ deflater writes, in fixed or stored blocks', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.uint8Array({ maxLength: 3000 }),
          // Repetitive bytes, so that matches of every length and distance are written.
          fc
            .array(fc.uint8Array({ minLength: 1, maxLength: 40 }), { maxLength: 60 })
            .map((parts) => Uint8Array.from(parts.flatMap((part) => [...part, ...part, ...part]))),
        ),
        fc.integer({ min: 1, max: 700 }),
        (data, size) => {
          expect(inflateRaw(deflateFixed(data), budget())).toEqual(data);
          expect(inflateRaw(deflateStored(data, size), budget())).toEqual(data);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuses a bomb once it passes the cap, and spends the budget only on what it gave', () => {
    // About 220 KB that would inflate to 33 MiB.
    const bomb = deflateBomb(Math.ceil((33 * 1024 * 1024) / 258));
    expect(bomb.length).toBeLessThan(300_000);
    expect(() => inflateRaw(bomb, budget())).toThrow(
      'The compressed content inflates to over 32 MiB, the most an import reads.',
    );
    // A budget is shared by the parts of one file: two halves pass, a third does not.
    const shared = new InflateBudget(1000);
    const half = deflateFixed(new Uint8Array(400).fill(7));
    expect(inflateRaw(half, shared)).toHaveLength(400);
    expect(inflateRaw(half, shared)).toHaveLength(400);
    expect(shared.remaining).toBe(200);
    expect(() => inflateRaw(half, shared)).toThrow(ReadRefusal);
  });

  it('refuses damaged data, and never throws anything but a refusal', () => {
    for (const damaged of [
      hex(''),
      hex('cb48cdc9'),
      // A reserved block type.
      hex('07'),
      // A stored block whose length and its complement disagree.
      hex('0107000000'),
      // A distance before the start.
      hex('030200'),
    ]) {
      expect(() => inflateRaw(damaged, budget())).toThrow(ReadRefusal);
    }
    // A zlib header with a preset dictionary, and a wrong checksum.
    expect(() => inflateZlib(hex('78bb00000000'), budget())).toThrow(ReadRefusal);
    expect(() => inflateZlib(hex('789ccb48cdc9c957a8cac94c0200159503e7'), budget())).toThrow(
      ReadRefusal,
    );
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (bytes) => {
        try {
          const out = inflate(bytes, new InflateBudget(4096));
          expect(out.length).toBeLessThanOrEqual(4096);
        } catch (error) {
          expect(error).toBeInstanceOf(ReadRefusal);
        }
      }),
      { numRuns: 2000 },
    );
  });
});

describe('decodeUtf8', () => {
  it('decodes every character, and replaces what is not UTF-8', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), (value) => {
        expect(decodeUtf8(utf8(value))).toBe(value);
      }),
    );
    expect(decodeUtf8(Uint8Array.from([0x61, 0xff, 0x62, 0xc3]))).toBe('a\uFFFDb\uFFFD');
    // An overlong encoding and a surrogate written in UTF-8 are not characters.
    expect(decodeUtf8(Uint8Array.from([0xc0, 0xaf]))).toBe('\uFFFD\uFFFD');
    expect(decodeUtf8(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe('\uFFFD\uFFFD\uFFFD');
  });
});
