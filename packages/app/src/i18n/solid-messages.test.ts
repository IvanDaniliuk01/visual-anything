/**
 * What the live connection says about solids, in Spanish (ADR-0038, ADR 0075): why a solid message
 * cannot be read, the program's refusals of a solid's file, and a file whose pieces do not fit
 * together. Each must read in Spanish through the catalog's templates.
 */
import {
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  readSolidPrepared,
  readSolidRefused,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from './translate';

function reasonOf(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

const HASH = 'a'.repeat(64);
const app = (message: object) => () =>
  decodeAppMessage(JSON.stringify({ requestId: 'r1', ...message }));
const server = (message: object) => () =>
  decodeServerMessage(JSON.stringify({ requestId: 'r1', ...message }));
const prepare = (more: object) =>
  app({
    type: 'solid/prepare',
    fileName: 'arm.glb',
    piece: { index: 0, count: 1, data: '' },
    ...more,
  });
const piece = (more: object) =>
  server({ type: 'solid/piece', hash: HASH, piece: { index: 0, count: 1, data: '', ...more } });

const REASONS: string[] = [
  reasonOf(app({ type: 'solid/get', hash: 'x' })),
  reasonOf(app({ type: 'solid/get', hash: HASH, more: 1 })),
  reasonOf(prepare({ fileName: 'a/b.glb' })),
  reasonOf(prepare({ more: 1 })),
  reasonOf(prepare({ piece: 1 })),
  reasonOf(prepare({ piece: { index: 0, count: 1, data: '', more: 1 } })),
  reasonOf(prepare({ options: { colour: 'red' } })),
  reasonOf(prepare({ options: { units: 'ft' } })),
  reasonOf(prepare({ options: { up: 'x' } })),
  reasonOf(prepare({ options: { simplify: 'yes' } })),
  reasonOf(prepare({ piece: { index: 1, count: 2, data: '' }, options: {} })),
  reasonOf(piece({ count: 99 })),
  reasonOf(piece({ index: 3 })),
  reasonOf(piece({ data: '!!!!' })),
  reasonOf(server({ type: 'solid/piece', hash: 'x', piece: { index: 0, count: 1, data: '' } })),
  reasonOf(server({ type: 'solid/piece', hash: HASH, piece: {}, more: 1 })),
  reasonOf(server({ type: 'solid/refused', code: 1, message: 'x' })),
  'The request has no valid id.',
  ...[
    { hash: 'x' },
    { hash: HASH, bytes: 0 },
    { hash: HASH, bytes: 1 },
    { hash: HASH, bytes: 1, bounds: {}, counts: {} },
    { hash: HASH, bytes: 1, bounds: {}, counts: {}, parts: [], animations: 1 },
    { hash: HASH, bytes: 1, bounds: {}, counts: {}, parts: [], report: 1 },
    { hash: HASH, bytes: 1, bounds: {}, counts: {}, parts: [], report: [], source: 1 },
  ].map((message) => {
    const read = readSolidPrepared({ type: 'solid/prepared', requestId: 'r1', ...message });
    return read.ok ? '' : read.reason;
  }),
  readSolidRefused({ type: 'solid/refused', requestId: 'r1' }).ok
    ? ''
    : 'A refusal says its code and why.',
  // The program's answers about solid files, and the tab's about their pieces.
  `The project has no solid file "solids/${HASH}.glb".`,
  `The solid file "solids/${HASH}.glb" cannot be read: The file is a link.`,
  `The bytes of the solid file "solids/${HASH}.glb" are not the ones its name says.`,
  'This program cannot import solids yet.',
  'Visual Anything sent pieces of a solid’s file that do not fit together.',
];

describe('what the live connection says about solids, in Spanish', () => {
  it('reads every reason in Spanish', () => {
    for (const reason of REASONS) {
      expect(reason).not.toBe('');
      const missing = untranslatedParts('es', reason).filter(
        // A reason from the file system comes from outside, and stays as it is.
        (part) => part !== 'The file is a link.',
      );
      expect(missing, reason).toEqual([]);
    }
    expect(translateMessage('es', `The project has no solid file "solids/${HASH}.glb".`)).toBe(
      `El proyecto no tiene el archivo de sólido "solids/${HASH}.glb".`,
    );
  });
});
