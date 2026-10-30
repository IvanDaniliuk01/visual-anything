/**
 * The capture messages of the Claude endpoint (ADR 0081): Claude asks with `capture`, and the program
 * answers with `capture/taken`, its picture read as strictly as the app's answer is.
 */
import { MAX_CAPTURE_BYTES, ProtocolError } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  decodeClaudeMessage,
  decodeProgramMessage,
  encodeClaudeMessage,
  type CaptureTakenMessage,
  type ClaudeMessage,
} from './messages';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('the capture messages of the Claude endpoint', () => {
  it('ask for a view, a region, a width and a theme', () => {
    const asked: ClaudeMessage = {
      type: 'capture',
      requestId: 'r1',
      ask: { view: 'overview', region: ['api'], width: 600, theme: 'dark' },
    };
    expect(decodeClaudeMessage(encodeClaudeMessage(asked))).toEqual(asked);
  });

  it.each([
    ['no ask', { type: 'capture', requestId: 'r1' }],
    [
      'a width past 2,048',
      { type: 'capture', requestId: 'r1', ask: { region: 'whole', width: 4096 } },
    ],
    [
      'a region of no kind',
      { type: 'capture', requestId: 'r1', ask: { region: 'all', width: 600 } },
    ],
  ])('refuse a capture with %s', (_case, message) => {
    expect(() => decodeClaudeMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it('answer with the picture, the failure, or why no app answered', () => {
    const answers: CaptureTakenMessage[] = [
      {
        type: 'capture/taken',
        requestId: 'r1',
        report: {
          apps: 1,
          picture: { png: PNG, width: 600, height: 300, view: 'v', theme: 'light', scale: 1 },
        },
      },
      {
        type: 'capture/taken',
        requestId: 'r2',
        report: { apps: 1, failure: { failed: 'too-large', bytes: 5_000_000 } },
      },
      { type: 'capture/taken', requestId: 'r3', report: { apps: 2, unanswered: 'passed' } },
      {
        type: 'capture/taken',
        requestId: 'r4',
        report: { apps: 1, unanswered: 'timed-out', waited: 20_000 },
      },
      { type: 'capture/taken', requestId: 'r5', report: { apps: 0 } },
    ];
    for (const message of answers) {
      expect(decodeProgramMessage(encodeClaudeMessage(message))).toEqual(message);
    }
  });

  it.each([
    ['no report', {}],
    ['apps that are no count', { report: { apps: -1 } }],
    [
      'a picture past 4 MiB',
      {
        report: {
          apps: 1,
          picture: {
            png: PNG.slice(0, 12) + 'A'.repeat(MAX_CAPTURE_BYTES),
            width: 600,
            height: 300,
            view: 'v',
            theme: 'light',
            scale: 1,
          },
        },
      },
    ],
    ['a failure of no kind', { report: { apps: 1, failure: { failed: 'tired' } } }],
    ['a reason none answered of no kind', { report: { apps: 1, unanswered: 'lost' } }],
  ])('refuse an answer with %s', (_case, fields) => {
    const text = JSON.stringify({ type: 'capture/taken', requestId: 'r1', ...fields });
    expect(() => decodeProgramMessage(text)).toThrow(ProtocolError);
  });
});
