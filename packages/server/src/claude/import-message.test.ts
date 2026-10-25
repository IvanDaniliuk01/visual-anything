/**
 * The Claude endpoint's `import` message (ADR-0049): it carries only a batch labelled as an import,
 * which `visual-anything import` sends to the program that runs on the project.
 */
import { ProtocolError } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { decodeClaudeMessage } from './messages';

const message = (command: unknown) => JSON.stringify({ type: 'import', requestId: 'r1', command });

describe('the import message', () => {
  it('carries a batch labelled as an import', () => {
    const command = { type: 'batch', label: 'Import "a.csv"', commands: [] };
    expect(decodeClaudeMessage(message(command))).toEqual({
      type: 'import',
      requestId: 'r1',
      command,
    });
  });

  it.each([
    ['a command that is no batch', { type: 'delete', elements: ['a'] }],
    ['a batch labelled otherwise', { type: 'batch', label: 'Delete everything', commands: [] }],
    ['a batch with no commands', { type: 'batch', label: 'Import "a.csv"' }],
    ['nothing', undefined],
  ])('refuses %s', (_what, command) => {
    expect(() => decodeClaudeMessage(message(command))).toThrow(ProtocolError);
  });
});
