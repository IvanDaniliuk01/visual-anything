import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The modules a source file imports, by the specifiers it names. */
function importsOf(file: string): string[] {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  return [...text.matchAll(/^import[^;]*?from '([^']+)';/gms)].map((each) => each[1] as string);
}

describe('the drawing messages of the live protocol', () => {
  // The protocol is loaded by modules the commands load: were its drawing messages to load the
  // commands, Node.js would evaluate a module before what it imports, as `tsx` showed.
  it('load only the drawing’s limits, never the commands', () => {
    expect(importsOf('./drawing-messages.ts')).toEqual(['./drawing-limits']);
    expect(importsOf('./drawing-limits.ts')).toEqual([]);
  });
});
