/**
 * A piece of Math drawn by KaTeX for panels (ADR 0106), kept by its TeX and style. What the core
 * refuses is refused here too: `typesetMath` is asked first, with the same settings
 * (`MATH_KATEX_OPTIONS`), so that a piece the canvas draws as its TeX is drawn as its TeX here.
 *
 * KaTeX builds its nodes with `createElement` and sets their styles through the CSSOM, so no string
 * becomes HTML and the Trusted Types policies stay as they are.
 */
import { MATH_KATEX_OPTIONS, typesetMath } from '@visual-anything/core';
import katex from 'katex';

/** A piece of Math as drawn: KaTeX's nodes, or why it cannot be typeset. */
export type DrawnMath = { ok: true; node: HTMLElement } | { ok: false; error: string };

/** How many drawn pieces are kept, the least recently used dropped first. */
const KEPT = 500;
const kept = new Map<string, DrawnMath>();

/**
 * A piece of Math drawn by KaTeX into a detached element, or why it cannot be: kept, so that drawing
 * the same TeX in the same style again costs nothing. Whoever shows it takes a copy of its nodes.
 */
export function drawnMath(tex: string, display: boolean): DrawnMath {
  const key = `${display ? 'd' : 'i'}${tex}`;
  const found = kept.get(key);
  if (found !== undefined) {
    kept.delete(key);
    kept.set(key, found);
    return found;
  }
  const drawn = draw(tex, display);
  kept.set(key, drawn);
  if (kept.size > KEPT) {
    const oldest = kept.keys().next();
    if (!oldest.done) kept.delete(oldest.value);
  }
  return drawn;
}

function draw(tex: string, display: boolean): DrawnMath {
  // The core's refusals first: a command Math does not take, a piece too long, or one it cannot lay out.
  const typeset = typesetMath(tex, { display });
  if (!typeset.ok) return { ok: false, error: typeset.error };
  const node = document.createElement('span');
  try {
    katex.render(tex, node, {
      ...MATH_KATEX_OPTIONS,
      displayMode: display,
      output: 'htmlAndMathml',
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, node };
}
