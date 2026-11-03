/**
 * Claude sees a view as the app draws it (ADR 0081): the program asks one app for a picture with
 * `capture/request`, and the app answers with `capture/answer`, matched by the request's id. Both are
 * read strictly. Protocol 7.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_ELEMENTS,
  MAX_CAPTURE_SIDE,
  base64Length,
  readCaptureAnswer,
  readCaptureRequest,
  type CaptureAnswerMessage,
  type CaptureRequestMessage,
} from './capture';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
} from './protocol';

/** The base64 of a PNG's first bytes, and some more. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('the capture messages', () => {
  it('came in protocol 7, since no build of 7 had shipped', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(7);
  });

  it('ask for a view, a region, a width and a theme, and read back as sent', () => {
    const asked: CaptureRequestMessage[] = [
      { type: 'capture/request', requestId: 'capture-1', region: 'whole', width: 1280 },
      {
        type: 'capture/request',
        requestId: 'capture-2',
        view: 'overview',
        region: 'viewport',
        width: 256,
        theme: 'dark',
      },
      {
        type: 'capture/request',
        requestId: 'capture-3',
        view: 'overview',
        region: ['shop', 'billing'],
        width: 2048,
        theme: 'light',
      },
    ];
    for (const message of asked)
      expect(decodeServerMessage(encodeMessage(message))).toEqual(message);
  });

  it('keep only what a request holds', () => {
    const read = readCaptureRequest(
      { type: 'capture/request', region: 'whole', width: 512, extra: 'x' },
      'capture-1',
    );
    expect(read).toEqual({
      ok: true,
      value: { type: 'capture/request', requestId: 'capture-1', region: 'whole', width: 512 },
    });
  });

  it.each([
    ['a width below 256', { region: 'whole', width: 255 }],
    ['a width past 2,048', { region: 'whole', width: 2049 }],
    ['a width that is not whole', { region: 'whole', width: 600.5 }],
    ['no width', { region: 'whole' }],
    ['a region of no kind', { region: 'all', width: 600 }],
    ['an empty list of elements', { region: [], width: 600 }],
    ['elements that are not ids', { region: ['a', 3], width: 600 }],
    [
      'too many elements',
      { region: Array.from({ length: MAX_CAPTURE_ELEMENTS + 1 }, (_, at) => `e${at}`), width: 600 },
    ],
    ['a theme of no kind', { region: 'whole', width: 600, theme: 'sepia' }],
    ['a view that is not an id', { region: 'whole', width: 600, view: '' }],
  ])('refuse a request with %s', (_case, fields) => {
    const text = JSON.stringify({ type: 'capture/request', requestId: 'capture-1', ...fields });
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });

  it('answer with a picture, why this tab passed it over, or why it could not be taken', () => {
    const answers: CaptureAnswerMessage[] = [
      {
        type: 'capture/answer',
        requestId: 'capture-1',
        picture: {
          png: PNG,
          width: 1280,
          height: 640,
          view: 'overview',
          theme: 'light',
          scale: 0.5,
        },
      },
      {
        type: 'capture/answer',
        requestId: 'capture-2',
        picture: {
          png: PNG,
          width: 600,
          height: 300,
          view: 'overview',
          theme: 'dark',
          scale: 1.25,
          missing: ['gone'],
        },
      },
      { type: 'capture/answer', requestId: 'capture-3', passed: 'other-tab' },
      { type: 'capture/answer', requestId: 'capture-4', failed: 'other-view', shows: 'billing' },
      { type: 'capture/answer', requestId: 'capture-5', failed: 'too-large', bytes: 5_000_000 },
      { type: 'capture/answer', requestId: 'capture-6', failed: 'empty' },
      { type: 'capture/answer', requestId: 'capture-7', failed: 'not-drawn' },
      { type: 'capture/answer', requestId: 'capture-8', failed: 'no-canvas' },
      { type: 'capture/answer', requestId: 'capture-9', failed: 'failed', why: 'No WebGL.' },
    ];
    for (const message of answers)
      expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    ['nothing', {}],
    ['a picture and a pass', { passed: 'other-tab', failed: 'empty' }],
    ['a pass of no kind', { passed: 'busy' }],
    ['a failure of no kind', { failed: 'tired' }],
    ['a reason past 500 characters', { failed: 'failed', why: 'x'.repeat(501) }],
    ['another view that is not an id', { failed: 'other-view', shows: 7 }],
    ['a size that is not whole', { failed: 'too-large', bytes: -1 }],
  ])('refuse an answer with %s', (_case, fields) => {
    const text = JSON.stringify({ type: 'capture/answer', requestId: 'capture-1', ...fields });
    expect(() => decodeAppMessage(text)).toThrow(ProtocolError);
  });

  const picture = (change: Record<string, unknown>) => ({
    png: PNG,
    width: 600,
    height: 300,
    view: 'overview',
    theme: 'light',
    scale: 1,
    ...change,
  });

  it.each([
    ['bytes that are not base64', picture({ png: 'not base64!' })],
    ['base64 of no PNG', picture({ png: 'R0lGODlhAQABAAAAACw=' })],
    ['base64 whose length is not a multiple of 4', picture({ png: `${PNG}A` })],
    ['an empty picture', picture({ png: '' })],
    ['a width past the most side', picture({ width: MAX_CAPTURE_SIDE + 1 })],
    ['a height past the most side', picture({ height: MAX_CAPTURE_SIDE + 1 })],
    ['a height of 0', picture({ height: 0 })],
    ['a scale that is no number', picture({ scale: 'big' })],
    ['a scale of 0', picture({ scale: 0 })],
    ['a theme of no kind', picture({ theme: 'sepia' })],
    ['no view', picture({ view: undefined })],
    ['missing elements that are not ids', picture({ missing: [''] })],
  ])('refuse a picture with %s', (_case, shown) => {
    const read = readCaptureAnswer({ picture: shown }, 'capture-1');
    expect(read.ok).toBe(false);
  });

  it('take a picture of at most 4 MiB in base64, and refuse one larger', () => {
    // A string of the most length, PNG's signature first, then filler that base64 allows.
    const most = PNG.slice(0, 12) + 'A'.repeat(MAX_CAPTURE_BYTES - 12);
    expect(most.length).toBe(MAX_CAPTURE_BYTES);
    expect(readCaptureAnswer({ picture: picture({ png: most }) }, 'c').ok).toBe(true);
    const larger = `${most}AAAA`;
    const refused = readCaptureAnswer({ picture: picture({ png: larger }) }, 'c');
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('4 MiB');
  });

  it('measure base64 as it travels: 3 MiB of PNG take the 4 MiB', () => {
    expect(base64Length(0)).toBe(0);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3 * 1024 * 1024)).toBe(MAX_CAPTURE_BYTES);
    expect(base64Length(3 * 1024 * 1024 + 1)).toBeGreaterThan(MAX_CAPTURE_BYTES);
  });
});
