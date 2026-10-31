/**
 * The Claude endpoint's `solid/prepare-file` (ADR 0075): a path from the project folder and the
 * import's options, read strictly; the program then checks the path against its folder before it
 * reads anything.
 */
import { ProtocolError } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { decodeClaudeMessage } from './messages';

const message = (more: Record<string, unknown>) =>
  JSON.stringify({ type: 'solid/prepare-file', requestId: 'r1', path: 'models/arm.glb', ...more });

describe('solid/prepare-file', () => {
  it('reads a path and the options of an import, keeping only those', () => {
    expect(decodeClaudeMessage(message({}))).toEqual({
      type: 'solid/prepare-file',
      requestId: 'r1',
      path: 'models/arm.glb',
    });
    expect(
      decodeClaudeMessage(message({ options: { units: 'mm', up: 'z', simplify: true } })),
    ).toEqual({
      type: 'solid/prepare-file',
      requestId: 'r1',
      path: 'models/arm.glb',
      options: { units: 'mm', up: 'z', simplify: true },
    });
  });

  it.each([
    ['no path', { path: undefined }],
    ['an empty path', { path: '' }],
    ['a path that is not text', { path: 3 }],
    ['an overlong path', { path: 'a/'.repeat(600) }],
    ['options that are not an object', { options: 'mm' }],
    ['an option it has none of', { options: { url: 'https://example.com' } }],
    ['units it has none of', { options: { units: 'ft' } }],
    ['an up axis it has none of', { options: { up: 'x' } }],
    ['simplify that is not true or false', { options: { simplify: 'yes' } }],
  ])('refuses %s', (_case, more) => {
    expect(() => decodeClaudeMessage(message(more))).toThrow(ProtocolError);
  });
});
