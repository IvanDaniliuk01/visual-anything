import type { KatexOptions } from 'katex';
import {
  MAX_MATH_CHARACTERS,
  REFUSED_MATH_COMMANDS,
  type MathDrawing,
  type MathFont,
  type MathGlyph,
  type TypesetMath,
  type TypesetOptions,
} from './drawing';
import { renderToHTMLTree } from './katex-tree';
import { MathLayoutRefusal, drawnRules, layoutTree, type MathLayout } from './layout';

/**
 * The settings every formula is typeset with, here and in the panels (ADR 0106): nothing trusted, an
 * error rather than red text, KaTeX's own limit on macro expansion, sizes capped at 100 ems, and no
 * warnings in the console.
 */
export const MATH_KATEX_OPTIONS: Readonly<KatexOptions> = Object.freeze({
  trust: false,
  throwOnError: true,
  maxExpand: 1000,
  maxSize: 100,
  strict: 'ignore',
});

/** Why each refused command is refused. */
const REFUSED_BECAUSE: Readonly<Record<string, string>> = {
  '\\color': 'colors come from the theme',
  '\\textcolor': 'colors come from the theme',
  '\\colorbox': 'colors come from the theme',
  '\\href': 'a link is written with its own syntax',
};

/**
 * Commands KaTeX takes that the layout does not draw yet, or that `trust: false` would draw as red
 * text: a formula that uses one is drawn as its TeX.
 */
const NOT_LAID_OUT_COMMANDS: Readonly<Record<string, string>> = {
  '\\raisebox': 'Math cannot lay out \\raisebox yet.',
  '\\vcenter': 'Math cannot lay out \\vcenter yet.',
  '\\tag': 'Math cannot lay out a tag (\\tag) yet.',
  '\\includegraphics': 'Math does not take images: \\includegraphics is not allowed.',
  '\\url': 'Math does not take \\url: a link is written with its own syntax.',
  '\\htmlStyle': 'Math does not take \\htmlStyle.',
  '\\htmlClass': 'Math does not take \\htmlClass.',
  '\\htmlId': 'Math does not take \\htmlId.',
  '\\htmlData': 'Math does not take \\htmlData.',
};

/** How many results are kept, the least recently used dropped first. */
const CACHE_SIZE = 2_000;
const cache = new Map<string, TypesetMath>();

/**
 * Typesets one formula, pure and synchronous, alike in Node and the browser (ADR 0106): KaTeX parses
 * and measures it, and the core lays it out into a math drawing. Results are kept by `(tex, display)`,
 * so calling it again for the same formula costs nothing; what it returns is frozen. It never throws:
 * a formula it cannot draw gives `{ ok: false, error }`, and is drawn as its TeX.
 */
export function typesetMath(tex: string, options: TypesetOptions): TypesetMath {
  const key = `${options.display ? 'd' : 'i'}${tex}`;
  const kept = cache.get(key);
  if (kept) {
    cache.delete(key);
    cache.set(key, kept);
    return kept;
  }
  const result = deepFreeze(typesetUncached(tex, options.display));
  cache.set(key, result);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return result;
}

/** Typesets without the cache. */
export function typesetUncached(tex: string, display: boolean): TypesetMath {
  try {
    const refusal = refuse(tex);
    if (refusal) return { ok: false, error: refusal };
    const tree = renderToHTMLTree(tex, { ...MATH_KATEX_OPTIONS, displayMode: display });
    return { ok: true, drawing: toDrawing(layoutTree(tree, display)) };
  } catch (error) {
    // KaTeX's ParseError carries its own message; so does a construct the layout refuses.
    if (error instanceof MathLayoutRefusal) return { ok: false, error: error.message };
    if (error instanceof Error && error.message !== '') return { ok: false, error: error.message };
    return { ok: false, error: 'Math could not typeset this formula.' };
  }
}

/** What refuses a formula before KaTeX reads it: its length, and the commands Math does not take. */
function refuse(tex: string): string | undefined {
  if (tex.length > MAX_MATH_CHARACTERS) {
    const count = (n: number) => n.toLocaleString('en-US');
    return `A formula takes at most ${count(MAX_MATH_CHARACTERS)} characters; this one has ${count(tex.length)}.`;
  }
  // Command tokens, as TeX reads them: `\\` is one token, so `\\color` is a line break and a word.
  for (const [token] of tex.matchAll(/\\(?:[a-zA-Z@]+|[^])/g)) {
    if (REFUSED_MATH_COMMANDS.includes(token)) {
      const because = REFUSED_BECAUSE[token];
      return because ? `Math does not take ${token}: ${because}.` : `Math does not take ${token}.`;
    }
    const notLaidOut = NOT_LAID_OUT_COMMANDS[token];
    if (notLaidOut) return notLaidOut;
  }
  if (/\\begin\s*\{\s*CD\s*\}/.test(tex)) return 'Math cannot lay out the CD environment yet.';
  return undefined;
}

function toDrawing(layout: MathLayout): MathDrawing {
  const fonts = new Set<MathFont>();
  const glyphs: MathGlyph[] = [];
  for (const glyph of layout.glyphs) {
    if (glyph.hidden) continue;
    fonts.add(glyph.font);
    glyphs.push({
      char: glyph.char,
      font: glyph.font,
      x: glyph.x,
      baseline: glyph.baseline,
      size: glyph.size,
    });
  }
  return {
    width: layout.width,
    height: layout.height,
    depth: layout.depth,
    glyphs,
    rules: layout.rules.filter((rule) => !rule.hidden).flatMap(drawnRules),
    paths: layout.paths
      .filter((path) => !path.hidden)
      .map((path) => ({
        d: path.d,
        x: path.x,
        y: path.y,
        width: path.width,
        height: path.height,
        viewBox: path.viewBox,
        preserveAspectRatio: path.preserveAspectRatio,
      })),
    fonts: [...fonts].sort(),
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }
  return value;
}
