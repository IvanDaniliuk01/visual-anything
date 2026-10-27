import { describe, expect, it } from 'vitest';
import {
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

const make = {
  type: 'drawing/make',
  requestId: 'r1',
  name: 'card.html',
  html: '<p>Hi</p>',
  width: 800,
};
const made = {
  type: 'drawing/made',
  requestId: 'r1',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 40"/>',
  width: 800,
  height: 40,
  report: ['1 script element'],
};

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

describe('making a drawing over the live connection (ADR 0068)', () => {
  it('reads the app’s request, keeping only what it holds', () => {
    const read = decodeAppMessage(JSON.stringify({ ...make, extra: 'dropped' }));
    expect(read).toEqual(make);
    expect(decodeAppMessage(encodeMessage(make as AppMessage))).toEqual(make);
  });

  it('refuses a request without a name, with HTML past 512 KiB, or at a width out of range', () => {
    const app = (more: object) => () => decodeAppMessage(JSON.stringify({ ...make, ...more }));
    expect(reason(app({ name: '' }))).toBe(
      'Making a drawing names its file, in 1 to 1000 characters.',
    );
    expect(reason(app({ html: 'x'.repeat(512 * 1024 + 1) }))).toBe(
      'Making a drawing needs its HTML as text, of at most 512 KiB.',
    );
    expect(reason(app({ html: 5 }))).toBe(
      'Making a drawing needs its HTML as text, of at most 512 KiB.',
    );
    for (const width of [63, 2001, 800.5, '800']) {
      expect(reason(app({ width }))).toBe(
        'A drawing is laid out at a width of 64 to 2000 pixels, in whole pixels.',
      );
    }
  });

  it('reads the program’s answer, keeping only what it holds', () => {
    expect(decodeServerMessage(JSON.stringify({ ...made, more: 1 }))).toEqual(made);
    expect(decodeServerMessage(encodeMessage(made as ServerMessage))).toEqual(made);
  });

  it('refuses an answer that is not a drawing', () => {
    const server = (more: object) => () =>
      decodeServerMessage(JSON.stringify({ ...made, ...more }));
    for (const more of [
      { svg: '<html/>' },
      { svg: `<svg>${'x'.repeat(70_000)}</svg>` },
      { width: 0 },
      { height: Number.NaN },
      { report: 'all' },
      { report: [1] },
      { report: Array.from({ length: 201 }, () => 'x') },
    ]) {
      expect(reason(server(more))).toBe('The drawing Visual Anything made cannot be read.');
    }
    expect(reason(server({ requestId: '' }))).toBe('The answer has no valid request id.');
  });
});
