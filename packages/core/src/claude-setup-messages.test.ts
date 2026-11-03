/**
 * Connecting Claude Desktop over the live connection (ADR 0093, section 3): `claude/setup` from an
 * app and its answer `claude/setup-answer`, read strictly, in version 8 of the protocol.
 */
import { describe, expect, it } from 'vitest';
import type { ClaudeSetupAnswerMessage } from './claude-setup-messages';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
} from './protocol';

function reason(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError) return error.message;
    throw error;
  }
  throw new Error('It was read.');
}

const WRITTEN: ClaudeSetupAnswerMessage = {
  type: 'claude/setup-answer',
  requestId: 'r1',
  outcome: 'written',
  config: '/home/ada/.config/Claude/claude_desktop_config.json',
  backup: '/home/ada/.config/Claude/claude_desktop_config.json.bak',
  entry: { command: '/home/ada/bin/visual-anything-linux-x64', args: ['mcp'] },
  claudeCode: 'claude mcp add visual-anything -- /home/ada/bin/visual-anything-linux-x64 mcp',
};

describe('connecting Claude over the live connection (ADR 0093)', () => {
  it('came in version 8', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(8);
  });

  it('asks with nothing but a request id', () => {
    expect(decodeAppMessage(encodeMessage({ type: 'claude/setup', requestId: 'r1' }))).toEqual({
      type: 'claude/setup',
      requestId: 'r1',
    });
    // What else the request carries is left behind.
    expect(
      decodeAppMessage(JSON.stringify({ type: 'claude/setup', requestId: 'r1', path: '/etc' })),
    ).toEqual({ type: 'claude/setup', requestId: 'r1' });
  });

  it('answers each outcome, and reads back as sent', () => {
    const answers: ClaudeSetupAnswerMessage[] = [
      WRITTEN,
      { ...WRITTEN, outcome: 'already', backup: undefined as never },
      {
        type: 'claude/setup-answer',
        requestId: 'r2',
        outcome: 'from-sources',
        config: 'C:\\Users\\ada\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
        entry: {
          command: 'C:\\node\\node.exe',
          args: ['C:/repo/node_modules/tsx/dist/cli.mjs', 'C:/repo/packages/server/src/mcp-cli.ts'],
          env: { TSX_TSCONFIG_PATH: 'C:/repo/packages/server/tsconfig.json' },
        },
        claudeCode: 'claude mcp add visual-anything -- node mcp-cli.ts',
      },
      { ...WRITTEN, outcome: 'refused', backup: undefined as never, why: 'Not JSON.' },
    ].map((each) => JSON.parse(JSON.stringify(each)) as ClaudeSetupAnswerMessage);
    for (const answer of answers) {
      expect(decodeServerMessage(encodeMessage(answer))).toEqual(answer);
    }
  });

  it('refuses an answer that is not one', () => {
    const answer = (more: object) => () =>
      decodeServerMessage(JSON.stringify({ ...WRITTEN, ...more }));
    expect(reason(answer({ requestId: '' }))).toBe('The answer has no valid request id.');
    expect(reason(answer({ outcome: 'maybe' }))).toBe(
      'Setting up Claude ends written, already there, from the sources or refused.',
    );
    expect(reason(answer({ config: 3 }))).toBe(
      'Setting up Claude answers with paths and words as text.',
    );
    expect(reason(answer({ claudeCode: 'x'.repeat(5000) }))).toBe(
      'Setting up Claude answers with paths and words as text.',
    );
    for (const entry of [
      undefined,
      { command: 'x' },
      { command: 'x', args: [1] },
      { command: 'x', args: [], env: { A: 1 } },
      { command: 'x', args: [], env: [] },
    ]) {
      expect(reason(answer({ entry }))).toBe(
        'Setting up Claude answers with the server’s command and arguments.',
      );
    }
  });
});
