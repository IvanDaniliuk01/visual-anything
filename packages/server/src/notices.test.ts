/**
 * `visual-anything notices` (ADR 0037, ADR 0068): the executable prints the notice of the code it
 * bundles, which it holds as an asset; run from the sources, it says that nothing is bundled.
 */
import { describe, expect, it } from 'vitest';
import { noticesText } from './executable';
import { entryOf } from './main';

describe('visual-anything notices', () => {
  it('is a subcommand of its own, and a folder of that name is opened as ./notices', () => {
    expect(entryOf(['notices'])).toEqual({ kind: 'notices', argv: [] });
    expect(entryOf(['./notices'])).toEqual({ kind: 'program', argv: ['./notices'] });
  });

  it('says, from the sources, where each package keeps its license', () => {
    expect(noticesText(false)).toMatch(/^This Visual Anything runs from its sources/);
    expect(noticesText(false)).toContain('node_modules');
  });
});
