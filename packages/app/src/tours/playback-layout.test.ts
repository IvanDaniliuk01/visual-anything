/**
 * While a tour plays, the shell is one cell that the canvas fills (tours.css, ADR 0058). A rule that
 * gives the shell other rows or areas, as specific as that one or more, would put the canvas in a row
 * of no height and leave the window blank: the side panels' collapsed layouts did, since playback
 * collapses them. So every such rule on the shell's attributes leaves tour playback out.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCE_FOLDER, readSource } from '../theme/testing';

/** Each rule of every stylesheet: its selector and its declarations, without comments. */
function rules(): { path: string; selector: string; body: string }[] {
  return readdirSync(SOURCE_FOLDER, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => relative(SOURCE_FOLDER, join(SOURCE_FOLDER, path)).replaceAll('\\', '/'))
    .flatMap((path) =>
      [
        ...readSource(path)
          .replace(/\/\*.*?\*\//gs, '')
          .matchAll(/([^{}]+)\{([^{}]*)\}/g),
      ].map((match) => ({ path, selector: (match[1] ?? '').trim(), body: match[2] ?? '' })),
    );
}

describe('the shell while a tour plays', () => {
  it('takes no rows or areas from a rule on its attributes', () => {
    const offending = rules()
      .filter(({ body }) => /grid-template(?:-rows|-areas)?\s*:/.test(body))
      .flatMap(({ path, selector }) =>
        selector
          .split(',')
          .map((each) => each.trim())
          .filter((each) => /^\.shell\[/.test(each) && !each.includes(':not(.tour-playing)'))
          .map((each) => `${path}: ${each}`),
      );
    expect(offending).toEqual([]);
  });
});
