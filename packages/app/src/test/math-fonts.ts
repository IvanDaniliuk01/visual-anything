/**
 * KaTeX's families in tests (ADR 0106): the browser's `FontFace` and fonts, KaTeX's bytes and
 * PixiJS's install stood in for, so that formulas draw their glyphs as quads where no canvas is.
 */
import type { MathFont } from '@visual-anything/core';
import { BitmapFont, Cache, Texture } from 'pixi.js';
import { vi } from 'vitest';
import { forgetMathFonts } from '../canvas/mathFonts';

/** A font whose every glyph is a white square 8 wide, so that each draws a quad. */
export function fakeMathFont(): BitmapFont {
  const chars: Record<string, unknown> = {};
  for (let code = 32; code < 0x2400; code++) {
    chars[String.fromCodePoint(code)] = {
      id: code,
      xOffset: 0,
      yOffset: 0,
      xAdvance: 8,
      kerning: {},
      texture: code === 32 ? undefined : Texture.WHITE,
    };
  }
  return {
    chars,
    fontMetrics: { fontSize: 16, ascent: 12, descent: 4 },
    ensureCharacters: () => undefined,
  } as unknown as BitmapFont;
}

/** What was made: each face's family and bytes, and each bitmap font's options. */
export interface Made {
  faces: { family: string; bytes: Uint8Array }[];
  installed: Parameters<typeof BitmapFont.install>[0][];
  tasks: (() => void)[];
}

/**
 * Stands in for the browser: `FontFace` and the document's fonts, KaTeX's bytes as a short `data:`
 * address, and PixiJS's install, which puts a fake font in its cache. Tasks wait to be run, or run
 * on their own in tasks of the event loop with `{ tasks: 'run' }`; a family in `failing` fails to load,
 * and each face takes `loading` milliseconds to load.
 */
export function withFakeMathFonts(
  options: { tasks?: 'wait' | 'run'; failing?: readonly MathFont[]; loading?: number } = {},
): Made {
  const made: Made = { faces: [], installed: [], tasks: [] };
  class FakeFace {
    constructor(
      readonly family: string,
      bytes: Uint8Array,
    ) {
      made.faces.push({ family, bytes });
    }
    load(): Promise<this> {
      const { loading } = options;
      if (loading === undefined) return Promise.resolve(this);
      return new Promise((resolve) => setTimeout(() => resolve(this), loading));
    }
  }
  vi.stubGlobal('FontFace', FakeFace);
  Object.defineProperty(document, 'fonts', { value: { add: () => undefined }, configurable: true });
  vi.spyOn(BitmapFont, 'install').mockImplementation((options) => {
    made.installed.push(options);
    Cache.set(`${options.name}-bitmap`, fakeMathFont());
    return undefined;
  });
  // "wOF2", as a woff2 file starts.
  const source = () => Promise.resolve({ default: 'data:font/woff2;base64,d09GMg==' });
  const sources = {} as Record<MathFont, typeof source>;
  for (const font of FONTS) sources[font] = source;
  for (const font of options.failing ?? []) {
    sources[font] = () => Promise.reject(new Error(`KaTeX_${font} is missing.`));
  }
  forgetMathFonts({
    sources,
    schedule:
      options.tasks === 'run'
        ? (task) => void setTimeout(task, 0)
        : (task) => void made.tasks.push(task),
  });
  return made;
}

const FONTS: MathFont[] = [
  'Main-Regular',
  'Math-Italic',
  'Size1-Regular',
  'Size2-Regular',
  'Fraktur-Regular',
];

/** Lets loads settle, then runs the tasks they scheduled until none is left. */
export async function settle(made: Made): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    while (made.tasks.length > 0) made.tasks.shift()!();
  }
}
