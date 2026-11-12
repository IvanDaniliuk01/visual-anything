/**
 * The messages about a link card's preview on the live connection (ADR 0098, stage 3): each side's
 * decoder takes them, read strictly by the core's readers, and they came in version 13.
 */
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type ServerMessage,
} from './protocol';

const PICTURE = { hash: 'a'.repeat(64), format: 'png', width: 1200, height: 630, bytes: 2048 };

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('link cards’ previews over the live connection', () => {
  it('came in version 13', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(13);
  });

  it('reads link/fetch from an app, its address as the web writes it', () => {
    const text = JSON.stringify({
      type: 'link/fetch',
      requestId: 'r1',
      url: 'HTTPS://Example.org',
    });
    expect(decodeAppMessage(text)).toEqual({
      type: 'link/fetch',
      requestId: 'r1',
      url: 'https://example.org/',
    });
  });

  it.each([
    [{ url: 'javascript:alert(1)' }, 'The address to fetch is not an http or https address.'],
    [{ url: 'file:///etc/passwd' }, 'The address to fetch is not an http or https address.'],
    [{ url: 42 }, 'The address to fetch is not text.'],
    [{ url: 'https://a.org/', cookie: 'x' }, 'link/fetch holds only its id and an address.'],
  ])('refuses link/fetch with %j', (fields, why) => {
    const text = JSON.stringify({ type: 'link/fetch', requestId: 'r1', ...fields });
    expect(reason(() => decodeAppMessage(text))).toBe(why);
  });

  it('reads the program’s answers', () => {
    const messages: ServerMessage[] = [
      {
        type: 'link/fetched',
        requestId: 'r1',
        preview: { title: 'Guide', description: 'How', picture: PICTURE as never },
        notes: [],
      },
      { type: 'link/fetched', requestId: 'r2', preview: {}, notes: ['No image: too large.'] },
      { type: 'link/refused', requestId: 'r3', code: 'link-refused', message: 'Not https.' },
    ];
    for (const message of messages) {
      expect(decodeServerMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it.each([
    [{ preview: { title: '' }, notes: [] }],
    [{ preview: { title: 't'.repeat(301) }, notes: [] }],
    [{ preview: { picture: { ...PICTURE, format: 'mp4' } }, notes: [] }],
    [{ preview: { html: '<b>' }, notes: [] }],
    [{ preview: {}, notes: 'none' }],
  ])('refuses link/fetched with %j', (fields) => {
    const text = JSON.stringify({ type: 'link/fetched', requestId: 'r1', ...fields });
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });
});
