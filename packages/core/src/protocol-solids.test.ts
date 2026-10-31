/**
 * The five messages about solids on the live connection (ADR 0075): each side's decoder takes them,
 * read strictly by the core's readers, and the protocol stays at version 7 (ADR 0075's clarification).
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

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('solids over the live connection (ADR 0075)', () => {
  it('stays at version 7', () => {
    expect(PROTOCOL_VERSION).toBe(7);
  });

  it('reads solid/get and solid/prepare from an app', () => {
    const get: AppMessage = { type: 'solid/get', requestId: 'r1', hash: HASH };
    expect(decodeAppMessage(encodeMessage(get))).toEqual(get);
    const prepare: AppMessage = {
      type: 'solid/prepare',
      requestId: 'r2',
      fileName: 'arm.glb',
      piece: { index: 0, count: 2, data: 'AAAA' },
      options: { units: 'mm', up: 'z', simplify: true },
    };
    expect(decodeAppMessage(encodeMessage(prepare))).toEqual(prepare);
  });

  it('refuses an app’s solid messages that the core’s readers refuse', () => {
    expect(
      reason(() =>
        decodeAppMessage(JSON.stringify({ type: 'solid/get', requestId: 'r', hash: 'ABC' })),
      ),
    ).toBe('A solid file is asked for by its SHA-256, in lowercase hexadecimal.');
    expect(
      reason(() =>
        decodeAppMessage(
          JSON.stringify({ type: 'solid/get', requestId: 'r', hash: HASH, path: '/etc/passwd' }),
        ),
      ),
    ).toBe('solid/get holds only its id and a hash.');
    expect(
      reason(() =>
        decodeAppMessage(
          JSON.stringify({
            type: 'solid/prepare',
            requestId: 'r',
            fileName: '../arm.glb',
            piece: { index: 0, count: 1, data: '' },
          }),
        ),
      ),
    ).toBe("A file's name is its own name, without a folder.");
  });

  it('reads solid/piece, solid/refused and solid/prepared from the program', () => {
    const piece: ServerMessage = {
      type: 'solid/piece',
      requestId: 'r1',
      hash: HASH,
      piece: { index: 1, count: 2, data: 'AAAA' },
    };
    expect(decodeServerMessage(encodeMessage(piece))).toEqual(piece);
    const refused: ServerMessage = {
      type: 'solid/refused',
      requestId: 'r1',
      code: 'solid-file-missing',
      message: 'No such file.',
    };
    expect(decodeServerMessage(encodeMessage(refused))).toEqual(refused);
    const prepared: ServerMessage = {
      type: 'solid/prepared',
      requestId: 'r2',
      hash: HASH,
      bytes: 1024,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      counts: { triangles: 12, vertices: 8, nodes: 1, textures: 0 },
      parts: [{ name: 'box', point: { x: 0.5, y: 1, z: 0.5 } }],
      report: [],
    };
    expect(decodeServerMessage(encodeMessage(prepared))).toEqual(prepared);
  });

  it('refuses a piece past a canonical file’s 32 pieces, or one that is not base64', () => {
    const piece = (more: object) => () =>
      decodeServerMessage(
        JSON.stringify({
          type: 'solid/piece',
          requestId: 'r',
          hash: HASH,
          piece: { index: 0, count: 1, data: 'AAAA', ...more },
        }),
      );
    expect(reason(piece({ count: 33 }))).toBe('A file comes in 1 to 32 pieces.');
    expect(reason(piece({ data: 'A A=' }))).toBe('A piece is base64 of at most 1048576 bytes.');
    expect(reason(piece({ index: 1 }))).toBe("A piece's index is within its count.");
  });
});
