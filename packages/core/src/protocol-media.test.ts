/**
 * The messages about media files on the live connection (ADR 0098): each side's decoder takes them,
 * read strictly by the core's readers, and they came in version 10 of the protocol.
 */
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

const HASH = 'a'.repeat(64);
const MEDIA = { hash: HASH, format: 'png', width: 640, height: 480, bytes: 2048 } as const;

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('media files over the live connection (ADR 0098)', () => {
  it('came in version 10', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(10);
  });

  it('reads media/put, media/get and the unnamed files’ requests from an app', () => {
    const messages: AppMessage[] = [
      {
        type: 'media/put',
        requestId: 'r1',
        fileName: 'front desk.jpg',
        piece: { index: 0, count: 3, data: 'AAAA' },
      },
      { type: 'media/get', requestId: 'r2', hash: HASH },
      { type: 'media-files/list', requestId: 'r3' },
      { type: 'media-files/remove', requestId: 'r4', hashes: [HASH] },
    ];
    for (const message of messages) {
      expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it('reads the program’s answers', () => {
    const messages: ServerMessage[] = [
      { type: 'media/stored', requestId: 'r1', media: MEDIA, removed: ['1 comment'] },
      { type: 'media/piece', requestId: 'r2', hash: HASH, piece: { index: 0, count: 1, data: '' } },
      { type: 'media/refused', requestId: 'r3', code: 'invalid-image', message: 'Not a picture.' },
      {
        type: 'media-files/listed',
        requestId: 'r4',
        files: [{ hash: HASH, format: 'gif', bytes: 12 }],
        removed: [],
        kept: [{ hash: 'b'.repeat(64), message: 'A picture names it.' }],
      },
    ];
    for (const message of messages) {
      expect(decodeServerMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it.each([
    [
      'a file name with a folder',
      {
        type: 'media/put',
        requestId: 'r',
        fileName: '../x.png',
        piece: { index: 0, count: 1, data: '' },
      },
      "A file's name is its own name, without a folder.",
    ],
    [
      'a file of more than 32 pieces',
      {
        type: 'media/put',
        requestId: 'r',
        fileName: 'x.png',
        piece: { index: 0, count: 33, data: '' },
      },
      'A file comes in 1 to 32 pieces.',
    ],
    [
      'a put with anything else',
      {
        type: 'media/put',
        requestId: 'r',
        fileName: 'x.png',
        piece: { index: 0, count: 1, data: '' },
        path: '/etc',
      },
      'media/put holds only its id, the file name and a piece.',
    ],
    [
      'a get by a path',
      { type: 'media/get', requestId: 'r', hash: '../../secret' },
      'A media file is asked for by its SHA-256, in lowercase hexadecimal.',
    ],
    [
      'a removal of nothing',
      { type: 'media-files/remove', requestId: 'r', hashes: [] },
      'A removal names 1 to 1024 media files by their SHA-256, in lowercase hexadecimal.',
    ],
  ])('refuses %s from an app', (_, message, why) => {
    expect(reason(() => decodeAppMessage(JSON.stringify(message)))).toBe(why);
  });

  it('refuses a stored file whose reference is not one a picture may name', () => {
    expect(
      reason(() =>
        decodeServerMessage(
          JSON.stringify({
            type: 'media/stored',
            requestId: 'r',
            media: { ...MEDIA, format: 'bmp' },
            removed: [],
          }),
        ),
      ),
    ).toBe('A stored file is named by its hash, format and sizes.');
  });
});
