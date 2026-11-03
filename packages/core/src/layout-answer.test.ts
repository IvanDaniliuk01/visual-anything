/**
 * Guidance with an answer (M3d, "Fixes from use"): the program sends a layout with an id to answer by,
 * and the app answers with `layout/done` once it laid the view out, or passed it over. Protocol 7.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_GUIDANCE_TARGETS,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

describe('layout guidance with an answer', () => {
  it('came in protocol 7, since no build of 7 had shipped', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(7);
  });

  it('carries the id the app answers by, and reads without one as before', () => {
    const asked: ServerMessage = {
      type: 'guidance',
      guidance: { kind: 'layout', view: 'v' },
      answer: 'layout-1',
    };
    expect(decodeServerMessage(encodeMessage(asked))).toEqual(asked);
    const plain: ServerMessage = { type: 'guidance', guidance: { kind: 'caption', text: 'Hi' } };
    expect(decodeServerMessage(encodeMessage(plain))).toEqual(plain);
  });

  it.each([
    ['an empty id', ''],
    ['an id that is not text', 7],
    ['an id past 100 characters', 'x'.repeat(101)],
  ])('refuses guidance whose answer is %s', (_case, answer) => {
    const text = JSON.stringify({ type: 'guidance', guidance: { kind: 'layout' }, answer });
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });

  it('reads what each layout came to, or why the tab ran none, and nothing else', () => {
    const done: AppMessage = {
      type: 'layout/done',
      requestId: 'layout-1',
      layouts: [
        { ended: 'done', moved: 12 },
        { container: 'billing', ended: 'stopped', moved: 0 },
        { container: 'shop', ended: 'failed', moved: 0, why: 'ELK failed.' },
        { container: 'empty', ended: 'empty', moved: 0 },
        { ended: 'replaced', moved: 0 },
      ],
    };
    expect(decodeAppMessage(encodeMessage(done))).toEqual(done);
    const passed: AppMessage = { type: 'layout/done', requestId: 'layout-2', passed: 'other-tab' };
    expect(decodeAppMessage(encodeMessage(passed))).toEqual(passed);
    expect(
      decodeAppMessage(
        JSON.stringify({
          type: 'layout/done',
          requestId: 'r',
          layouts: [{ ended: 'done', moved: 1, extra: 2 }],
          extra: 3,
        }),
      ),
    ).toEqual({ type: 'layout/done', requestId: 'r', layouts: [{ ended: 'done', moved: 1 }] });
  });

  it.each([
    ['neither layouts nor why it passed', {}],
    ['both', { layouts: [], passed: 'other-tab' }],
    ['layouts that are not a list', { layouts: 'all' }],
    ['an ending it does not know', { layouts: [{ ended: 'gone', moved: 0 }] }],
    ['a count of shapes that is not whole', { layouts: [{ ended: 'done', moved: 1.5 }] }],
    ['a negative count', { layouts: [{ ended: 'done', moved: -1 }] }],
    ['a container that is not an id', { layouts: [{ container: '', ended: 'done', moved: 0 }] }],
    ['a reason that is not text', { layouts: [{ ended: 'failed', moved: 0, why: 3 }] }],
    [
      'a reason past 500 characters',
      { layouts: [{ ended: 'failed', moved: 0, why: 'x'.repeat(501) }] },
    ],
    [
      'more layouts than guidance asks for',
      {
        layouts: Array.from({ length: MAX_GUIDANCE_TARGETS + 1 }, () => ({
          ended: 'done',
          moved: 0,
        })),
      },
    ],
    ['a way of passing it over it does not know', { passed: 'bored' }],
  ])('refuses an answer with %s', (_case, rest) => {
    const text = JSON.stringify({ type: 'layout/done', requestId: 'r', ...rest });
    expect(() => decodeAppMessage(text)).toThrow(ProtocolError);
  });
});
