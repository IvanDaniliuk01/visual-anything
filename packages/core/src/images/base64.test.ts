import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from './base64';

describe('base64', () => {
  it('writes and reads the standard alphabet with padding', () => {
    const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
    expect(encodeBase64(bytes(''))).toBe('');
    expect(encodeBase64(bytes('f'))).toBe('Zg==');
    expect(encodeBase64(bytes('fo'))).toBe('Zm8=');
    expect(encodeBase64(bytes('foo'))).toBe('Zm9v');
    expect(encodeBase64(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe('+/+/');
    expect(decodeBase64('Zm9vYg==')).toEqual(bytes('foob'));
  });

  it('round-trips any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 3000 }), (bytes) => {
        expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
      }),
    );
  });

  it('refuses text that is not canonical base64', () => {
    for (const text of [
      'Zg=',
      'Zg',
      'Z===',
      'Zh==',
      'Zm9=',
      'Zm 9v',
      'Zm9v\n',
      'Zg==Zg==',
      'Zm9-',
      'é123',
    ]) {
      expect(decodeBase64(text), text).toBeUndefined();
    }
  });
});
