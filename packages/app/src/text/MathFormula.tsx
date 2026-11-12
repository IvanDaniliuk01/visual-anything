/**
 * Math in panels (ADR 0106): one piece of Math drawn by KaTeX into an element of its own, with KaTeX's
 * HTML for the eye and its MathML for screen readers, selectable for copying, in KaTeX's fonts, as the
 * inspector, tours, the hover card, the outline and every other panel draw text emphasis. A piece that
 * cannot be typeset, a refused command included, is drawn as the canvas draws it: as its TeX in
 * Roboto Mono with a warning mark, and why as its title, in the app's language (`drawnMath.ts`).
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { MONO_FAMILY, cssFontFamily } from '../canvas/robotoFonts';
import { useT } from '../i18n/useT';
import { drawnMath } from './drawnMath';
import './katex.css';

/** The family a piece that cannot be typeset is written in, as the canvas writes it. */
const MONO = cssFontFamily(MONO_FAMILY);

interface MathFormulaProps {
  tex: string;
  /** Display style: a block of its own, or `$$…$$` within a line. */
  display: boolean;
  /** What is written when it cannot be typeset: the TeX as typed. */
  typed: string;
}

/** One piece of Math, drawn by KaTeX, or as its TeX with a warning mark when it cannot be typeset. */
export function MathFormula({ tex, display, typed }: MathFormulaProps) {
  const drawn = useMemo(() => drawnMath(tex, display), [tex, display]);
  const holder = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = holder.current;
    if (!drawn.ok || element === null) return;
    element.replaceChildren(...[...drawn.node.childNodes].map((child) => child.cloneNode(true)));
  }, [drawn]);
  const className = display ? 'emphasis-math emphasis-math-display' : 'emphasis-math';
  if (!drawn.ok) return <MathError className={className} typed={typed} error={drawn.error} />;
  return <span ref={holder} className={className} />;
}

/**
 * A piece that cannot be typeset: its TeX in Roboto Mono, a warning mark, and why as its title, in the
 * language the app reads in (the core's refusals translated, KaTeX's own message as KaTeX writes it).
 */
function MathError({
  className,
  typed,
  error,
}: {
  className: string;
  typed: string;
  error: string;
}) {
  const t = useT();
  return (
    <span
      className={`${className} emphasis-math-error`}
      title={t.message(error)}
      style={{ fontFamily: MONO }}
    >
      <span className="emphasis-math-mark" aria-hidden="true">
        ⚠
      </span>
      <span className="visually-hidden">{t('Math that cannot be typeset:')} </span>
      {typed}
    </span>
  );
}
