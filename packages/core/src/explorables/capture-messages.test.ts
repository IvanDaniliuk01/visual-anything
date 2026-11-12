import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
} from '../protocol';
import { readExplorableCaptureAnswer, readExplorableCaptureRequest } from './capture-messages';

/** A PNG's signature and a little more, in base64. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAA';

describe('a still of an explorable for Claude, on the live connection', () => {
  it('is protocol 16', () => {
    expect(PROTOCOL_VERSION).toBe(16);
  });

  it('reads the request strictly, keeping only what it asks', () => {
    const request = {
      type: 'explorable-capture/request',
      requestId: 'c-1',
      explorable: 'quadratic.parabola',
      element: 'f',
      parameters: { a: 2, show: true, mode: 'roots' },
      width: 512,
      theme: 'dark',
    };
    expect(decodeServerMessage(JSON.stringify(request))).toEqual(request);
    const bare = {
      type: 'explorable-capture/request',
      requestId: 'c',
      explorable: 'p.e',
      width: 256,
    };
    expect(decodeServerMessage(JSON.stringify(bare))).toEqual(bare);
    for (const wrong of [
      { ...request, width: 300 },
      { ...request, width: 2048 },
      { ...request, theme: 'blue' },
      { ...request, explorable: '' },
      { ...request, element: 3 },
      { ...request, parameters: { 'not a name': 1 } },
      { ...request, parameters: { a: { nested: 1 } } },
      { ...request, parameters: { a: 'x'.repeat(201) } },
      { ...request, extra: 1 },
      { ...request, requestId: '' },
    ]) {
      expect(readExplorableCaptureRequest(wrong).ok).toBe(false);
      expect(() => decodeServerMessage(JSON.stringify(wrong))).toThrow(ProtocolError);
    }
  });

  it('reads an answer as exactly one of a still, a pass and a failure', () => {
    const still = {
      type: 'explorable-capture/answer',
      requestId: 'c-1',
      still: { png: PNG, width: 512, height: 384 },
      errors: ['TypeError: x is undefined'],
      ready: true,
    };
    expect(decodeAppMessage(JSON.stringify(still))).toEqual(still);
    const passed = { type: 'explorable-capture/answer', requestId: 'c-1', passed: 'other-tab' };
    expect(decodeAppMessage(JSON.stringify(passed))).toEqual(passed);
    const failed = {
      type: 'explorable-capture/answer',
      requestId: 'c-1',
      failed: 'failed',
      why: 'It gave up after 5 s.',
      errors: [],
    };
    expect(decodeAppMessage(JSON.stringify(failed))).toEqual(failed);
    for (const wrong of [
      { ...still, passed: 'other-tab' },
      { type: 'explorable-capture/answer', requestId: 'c-1' },
      { ...still, still: { ...still.still, width: 500 } },
      { ...still, still: { ...still.still, height: 4 * 512 + 1 } },
      { ...still, still: { ...still.still, png: 'R0lGODlh' } },
      { ...still, still: { ...still.still, png: `${PNG}!!!!` } },
      { ...still, still: { ...still.still, png: PNG + 'A'.repeat(1_400_000) } },
      { ...still, errors: Array.from({ length: 51 }, () => 'e') },
      { ...still, errors: ['x'.repeat(2001)] },
      { ...still, ready: 'yes' },
      { ...passed, passed: 'busy' },
      { ...failed, failed: 'broken' },
      { ...failed, why: 'x'.repeat(501) },
      { ...failed, extra: true },
    ]) {
      expect(readExplorableCaptureAnswer(wrong).ok).toBe(false);
      expect(() => decodeAppMessage(JSON.stringify(wrong))).toThrow(ProtocolError);
    }
  });
});
