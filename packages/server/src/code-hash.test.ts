/**
 * The core's SHA-256 and UTF-8, which the hash of package code is made with (ADR 0054), against
 * Node's own: the app, the program and Claude's tools must all agree on the hash a person approved.
 */
import { createHash } from 'node:crypto';
import { sha256, utf8 } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';

const nodeSha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Random texts from a fixed seed: any code unit, lone surrogates included, at any length up to 300. */
function texts(count: number): string[] {
  let seed = 0x2f6b9a1d;
  const next = () => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const made: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const length = Math.floor(next() * 300);
    let text = '';
    for (let j = 0; j < length; j += 1) {
      const pick = next();
      // Mostly ASCII, then two- and three-byte text, surrogates near their ranges, and pairs.
      if (pick < 0.5) text += String.fromCharCode(32 + Math.floor(next() * 95));
      else if (pick < 0.7) text += String.fromCharCode(0x80 + Math.floor(next() * 0x780));
      else if (pick < 0.85) text += String.fromCharCode(0xd7f0 + Math.floor(next() * 0x820));
      else text += String.fromCodePoint(0x10000 + Math.floor(next() * 0xfffff));
    }
    made.push(text);
  }
  return made;
}

describe("the core's hash of package code", () => {
  it('gives what Node gives at every block boundary', () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const text = 'x'.repeat(length);
      expect(sha256(text)).toBe(nodeSha256(text));
    }
  });

  it('gives what Node gives for any text, lone surrogates included', () => {
    for (const text of texts(400)) {
      expect([...utf8(text)]).toEqual([...Buffer.from(text, 'utf8')]);
      expect(sha256(text)).toBe(nodeSha256(text));
    }
  });
});
