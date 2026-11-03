/**
 * The five messages about solids on the live connection (ADR 0075): each side's decoder takes them,
 * read strictly by the core's readers, and they came in version 7 of the protocol (ADR 0075's clarification).
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
  it('came in version 7', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(7);
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
    // A solid kept from another project, by the hash its file is named by (ADR 0089).
    const keep: AppMessage = { ...prepare, options: { keep: HASH } };
    expect(decodeAppMessage(encodeMessage(keep))).toEqual(keep);
  });

  it('refuses keeping a solid by something that is no hash, or with other options', () => {
    const prepare = {
      type: 'solid/prepare',
      requestId: 'r',
      fileName: 'arm.glb',
      piece: { index: 0, count: 1, data: '' },
    };
    expect(
      reason(() => decodeAppMessage(JSON.stringify({ ...prepare, options: { keep: '../x' } }))),
    ).toBe('Keep is the hash a solid’s file is named by.');
    expect(
      reason(() =>
        decodeAppMessage(JSON.stringify({ ...prepare, options: { keep: HASH, units: 'mm' } })),
      ),
    ).toBe('A solid kept from another project is taken as it is, without other options.');
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

  it('reads solid-files/list and solid-files/remove from an app, by hashes only', () => {
    const list: AppMessage = { type: 'solid-files/list', requestId: 'r1' };
    expect(decodeAppMessage(encodeMessage(list))).toEqual(list);
    const remove: AppMessage = { type: 'solid-files/remove', requestId: 'r2', hashes: [HASH] };
    expect(decodeAppMessage(encodeMessage(remove))).toEqual(remove);
    // A hash named twice is removed once.
    expect(
      decodeAppMessage(
        JSON.stringify({ type: 'solid-files/remove', requestId: 'r', hashes: [HASH, HASH] }),
      ),
    ).toEqual({ type: 'solid-files/remove', requestId: 'r', hashes: [HASH] });
  });

  it('refuses a removal that names anything but hashes, so nothing can leave solids/', () => {
    const remove = (more: object) => () =>
      decodeAppMessage(JSON.stringify({ type: 'solid-files/remove', requestId: 'r', ...more }));
    const why = 'A removal names 1 to 1024 solid files by their SHA-256, in lowercase hexadecimal.';
    for (const hashes of [
      [],
      ['../project.vaproject'],
      [`../${HASH}`],
      [`${HASH}.glb`],
      [`solids/${HASH}`],
      [HASH.toUpperCase()],
      ['/etc/passwd'],
      ['..\\..\\x'],
      [`${'a'.repeat(63)}/`],
      [42],
      'a'.repeat(64),
      Array.from({ length: 1025 }, () => HASH),
    ]) {
      expect(reason(remove({ hashes }))).toBe(why);
    }
    expect(reason(remove({ hashes: [HASH], path: 'solids' }))).toBe(
      'solid-files/remove holds only its id and the hashes of the files to remove.',
    );
    expect(reason(remove({ hashes: [HASH], requestId: '' }))).toBe(
      'The message has no valid request id.',
    );
    expect(
      reason(() =>
        decodeAppMessage(JSON.stringify({ type: 'solid-files/list', requestId: 'r', all: true })),
      ),
    ).toBe('solid-files/list holds only its id.');
  });

  it('reads solid-files/listed from the program', () => {
    const listed: ServerMessage = {
      type: 'solid-files/listed',
      requestId: 'r1',
      files: [{ hash: HASH, bytes: 2048 }],
      removed: ['b'.repeat(64)],
      kept: [{ hash: 'c'.repeat(64), message: 'A package names it.' }],
    };
    expect(decodeServerMessage(encodeMessage(listed))).toEqual(listed);
    expect(
      reason(() =>
        decodeServerMessage(
          JSON.stringify({
            type: 'solid-files/listed',
            requestId: 'r',
            files: [{ hash: '../x', bytes: 1 }],
          }),
        ),
      ),
    ).toBe('The files are listed by their hashes and sizes.');
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
