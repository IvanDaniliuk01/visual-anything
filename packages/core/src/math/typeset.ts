import type { TypesetMath, TypesetOptions } from './drawing';

/**
 * Typesets one formula, pure and synchronous, alike in Node and the browser (ADR 0106). Drawings are
 * kept by `(tex, display)`, so calling it again for the same formula costs nothing. It never throws.
 *
 * A9.0's seam: the layout from `prototype/math-layout` lands with KaTeX in its task; until then every
 * formula is drawn as its TeX.
 */
export function typesetMath(tex: string, options: TypesetOptions): TypesetMath {
  void tex;
  void options;
  return { ok: false, error: 'Math is not laid out yet.' };
}
