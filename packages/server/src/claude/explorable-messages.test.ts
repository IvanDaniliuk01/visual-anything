/**
 * The explorable messages of the Claude endpoint (ADR 0107): which explorables the person approved,
 * a script library to ask the person for, and a still of an explorable, each read strictly both ways.
 */
import { ProtocolError } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  decodeClaudeMessage,
  decodeProgramMessage,
  encodeClaudeMessage,
  type ClaudeMessage,
  type ExplorableCapturedMessage,
  type ProgramMessage,
} from './messages';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('the explorable messages Claude sends', () => {
  it('ask which explorables are approved, for a script library, and for a still', () => {
    const sent: ClaudeMessage[] = [
      { type: 'explorables/approvals', requestId: 'r1' },
      {
        type: 'script-library/request',
        requestId: 'r2',
        package: 'math',
        npm: 'd3',
        version: '7.9.0',
        path: 'dist/d3.min.js',
        global: 'd3',
      },
      {
        type: 'script-library/request',
        requestId: 'r3',
        package: 'math',
        npm: '@scope/x',
        version: '1.0.0',
      },
      {
        type: 'explorable/capture',
        requestId: 'r4',
        ask: {
          explorable: 'math.quadratic',
          element: 'f',
          parameters: { a: -1, grid: true, mode: 'roots' },
          width: 512,
          theme: 'dark',
        },
      },
    ];
    for (const message of sent) {
      expect(decodeClaudeMessage(encodeClaudeMessage(message))).toEqual(message);
    }
  });

  it.each([
    ['approvals that hold more', { type: 'explorables/approvals', requestId: 'r1', approve: true }],
    [
      'a version range',
      {
        type: 'script-library/request',
        requestId: 'r1',
        package: 'math',
        npm: 'd3',
        version: '^7',
      },
    ],
    [
      'a path outside the package',
      {
        type: 'script-library/request',
        requestId: 'r1',
        package: 'math',
        npm: 'd3',
        version: '7.9.0',
        path: '../etc/passwd',
      },
    ],
    [
      'a still of another width',
      { type: 'explorable/capture', requestId: 'r1', ask: { explorable: 'm.q', width: 600 } },
    ],
    [
      'a parameter that is an object',
      {
        type: 'explorable/capture',
        requestId: 'r1',
        ask: { explorable: 'm.q', width: 256, parameters: { a: { b: 1 } } },
      },
    ],
    [
      'a still that asks for more',
      {
        type: 'explorable/capture',
        requestId: 'r1',
        ask: { explorable: 'm.q', width: 256, run: 1 },
      },
    ],
  ])('refuse %s', (_case, message) => {
    expect(() => decodeClaudeMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it('never let Claude approve an explorable', () => {
    for (const type of ['explorables/approve', 'preferences/set', 'script-library/consented']) {
      expect(() => decodeClaudeMessage(JSON.stringify({ type, requestId: 'r1' }))).toThrow(
        /approving an explorable/,
      );
    }
  });
});

describe('the explorable answers the program sends', () => {
  it('say which are approved, and the still, the failure, or why no app answered', () => {
    const answers: ProgramMessage[] = [
      { type: 'explorables/approved', requestId: 'r1', approved: ['math.quadratic'] },
      {
        type: 'explorable/captured',
        requestId: 'r2',
        report: {
          apps: 1,
          still: { png: PNG, width: 512, height: 320 },
          errors: ['ReferenceError: x is not defined'],
          ready: true,
          waited: 140,
        },
      },
      {
        type: 'explorable/captured',
        requestId: 'r3',
        report: { apps: 1, failure: { reason: 'stopped', message: 'It stopped answering.' } },
      },
      {
        type: 'explorable/captured',
        requestId: 'r4',
        report: { apps: 0, unanswered: 'unsupported' },
      },
    ];
    for (const answer of answers) {
      expect(decodeProgramMessage(encodeClaudeMessage(answer))).toEqual(answer);
    }
  });

  it.each([
    ['a still that is no PNG', { apps: 1, still: { png: 'R0lGODlh', width: 512, height: 10 } }],
    ['a still of another width', { apps: 1, still: { png: PNG, width: 600, height: 10 } }],
    ['too many errors', { apps: 1, errors: Array.from({ length: 51 }, () => 'e') }],
    ['an error past 2,000 characters', { apps: 1, errors: ['e'.repeat(2001)] }],
    ['a failure of no kind', { apps: 1, failure: { reason: 'crashed' } }],
    ['no count of apps', { unanswered: 'gone' }],
  ])('refuse an answer with %s', (_case, report) => {
    const message = { type: 'explorable/captured', requestId: 'r1', report };
    expect(() => decodeProgramMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it('refuse approvals that are not ids', () => {
    expect(() =>
      decodeProgramMessage(
        JSON.stringify({ type: 'explorables/approved', requestId: 'r1', approved: [''] }),
      ),
    ).toThrow(ProtocolError);
    const still: ExplorableCapturedMessage = {
      type: 'explorable/captured',
      requestId: 'r1',
      report: { apps: 1, still: { png: PNG, width: 1024, height: 16_385 } },
    };
    expect(() => decodeProgramMessage(JSON.stringify(still))).toThrow(ProtocolError);
  });
});
