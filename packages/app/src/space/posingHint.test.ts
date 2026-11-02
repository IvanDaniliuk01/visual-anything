/**
 * What the physical-space panel says under its tools when none of Move, Rotate, Place and Take out
 * can act on the selection (ADR 0076): what to select, rather than four disabled buttons.
 */
import type { Space } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { posingHint } from './posingHint';

const space = {
  entries: new Map([
    ['cell', { how: 'root' }],
    ['arm', { how: 'posed' }],
    ['link-1', { how: 'anchored' }],
    ['link-2', { how: 'anchored' }],
  ]),
} as unknown as Pick<Space, 'entries'>;

describe('the posing tools’ hint', () => {
  it('says nothing while one of the tools can act', () => {
    expect(posingHint(space, new Set(['arm']), true)).toBeUndefined();
  });

  it('says what to select when nothing is selected', () => {
    expect(posingHint(space, new Set(), false)).toMatch(/^Select something on the canvas/);
  });

  it('says that parts of a solid move with it, and to select what shows the solid', () => {
    expect(posingHint(space, new Set(['link-1', 'link-2']), false)).toMatch(
      /drawn as a part of its solid/,
    );
  });

  it('says that what the panel shows everything inside does not move', () => {
    expect(posingHint(space, new Set(['cell']), false)).toMatch(/does not move in it/);
  });

  it('says what can be posed for any other selection', () => {
    expect(posingHint(space, new Set(['link-1', 'cell']), false)).toMatch(/^Nothing selected/);
  });
});
