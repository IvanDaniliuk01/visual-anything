/**
 * The hash package code is approved by. The server's `code-hash.test.ts` also checks it against
 * Node's own SHA-256 and UTF-8 for any text; the core has no Node to compare with.
 */
import { describe, expect, it } from 'vitest';
import { codeHash, sha256, utf8 } from './hash';

describe('sha256', () => {
  it('gives the digests of FIPS 180-4', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(
      sha256(
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
    expect(sha256('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});

describe('utf8', () => {
  it('encodes each length of code point, and a lone surrogate as U+FFFD', () => {
    expect([...utf8('A')]).toEqual([0x41]);
    expect([...utf8('ñ')]).toEqual([0xc3, 0xb1]);
    expect([...utf8('€')]).toEqual([0xe2, 0x82, 0xac]);
    expect([...utf8('😀')]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    expect([...utf8('\uD800')]).toEqual([0xef, 0xbf, 0xbd]);
    expect([...utf8('\uDC00x')]).toEqual([0xef, 0xbf, 0xbd, 0x78]);
  });
});

describe('codeHash', () => {
  const code = ['export function attributes() {', '  return {};', '}'];

  it('is the SHA-256 of the code text and its sorted capabilities, written as JSON', () => {
    expect(codeHash(code, ['time', 'model:read'])).toBe(
      sha256(JSON.stringify([code.join('\n'), ['model:read', 'time']])),
    );
  });

  it('changes with any change to the code or to the capabilities, and not with their order', () => {
    const base = codeHash(code, ['time']);
    expect(codeHash([...code, ''], ['time'])).not.toBe(base);
    expect(codeHash(code, [])).not.toBe(base);
    expect(codeHash(code, ['model:read', 'time'])).toBe(codeHash(code, ['time', 'model:read']));
    expect(codeHash(code, undefined)).toBe(codeHash(code, []));
    // Lines joined differently are different text.
    expect(codeHash(['ab'], [])).not.toBe(codeHash(['a', 'b'], []));
  });
});
