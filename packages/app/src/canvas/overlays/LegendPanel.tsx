/**
 * The legend on the canvas (ADR 0055): a disclosure in its bottom right corner that says what each of
 * the open view's overlays means, in words beside each swatch, so that a color is never the only way
 * a meaning is told, and what the legend warns about its colors in the theme shown.
 */
import type { Legend, LegendEntry, LegendOverlay } from '@visual-anything/core';
import { useId, type CSSProperties } from 'react';
import { useT } from '../../i18n';
import { entryAmount, entryLabel, legendSubtitle } from './legendText';
import { RELATION_TYPES_LEGEND, entryDash } from './relationLegend';
import './legend.css';

/** The swatch of an entry: a color, a size, a badge or a fade, drawn as the overlay draws it. */
function Swatch({ entry, part }: { entry: LegendEntry; part: LegendOverlay }) {
  if (entry.badge !== undefined) {
    return (
      <span className="canvas-legend-badge" aria-hidden="true">
        {entry.badge}
      </span>
    );
  }
  const lines = part.of === 'relations';
  const style = swatchStyle(entry, part);
  const kind = lines
    ? 'canvas-legend-line'
    : entry.color !== undefined
      ? part.channel === 'stroke'
        ? 'canvas-legend-stroke'
        : 'canvas-legend-fill'
      : entry.size !== undefined
        ? 'canvas-legend-size'
        : entry.opacity !== undefined
          ? 'canvas-legend-fade'
          : undefined;
  return (
    <span className="canvas-legend-room" aria-hidden="true">
      {kind !== undefined && <span className={kind} style={style} />}
    </span>
  );
}

/** How a swatch is drawn: in its color, at its size, or at its opacity. */
function swatchStyle(entry: LegendEntry, part: LegendOverlay): CSSProperties {
  const lines = part.of === 'relations';
  if (entry.color !== undefined) {
    if (lines) {
      // A relation type's line keeps its dash (ADR 0086).
      const dash = entryDash(entry);
      return dash === 'solid'
        ? { borderTopColor: entry.color }
        : { borderTopColor: entry.color, borderTopStyle: dash };
    }
    return part.channel === 'stroke'
      ? { borderColor: entry.color }
      : { backgroundColor: entry.color };
  }
  if (entry.size !== undefined) {
    if (lines) return { borderTopWidth: Math.max(1, Math.round(2 * entry.size)) };
    const side = Math.round(12 * entry.size);
    return { width: side, height: side };
  }
  if (entry.opacity !== undefined) return { opacity: entry.opacity };
  return {};
}

/** One overlay's part of the legend: its title, what it changes by which attribute, its entries. */
function LegendPart({ part }: { part: LegendOverlay }) {
  const t = useT();
  const heading = useId();
  return (
    <section className="canvas-legend-part" aria-labelledby={heading}>
      <h3 id={heading} className="canvas-legend-title">
        {part.title}
      </h3>
      <p className="canvas-legend-subtitle">{legendSubtitle(t, part)}</p>
      <ul className="canvas-legend-entries">
        {part.entries.map((entry, at) => {
          const amount = entryAmount(t, entry);
          return (
            <li key={at}>
              <Swatch entry={entry} part={part} />
              <span>{entryLabel(t, entry)}</span>
              {amount !== undefined && <span className="canvas-legend-amount">{amount}</span>}
            </li>
          );
        })}
      </ul>
      {part.warnings.length > 0 && (
        <ul className="canvas-legend-warnings">
          {part.warnings.map((warning) => (
            <li key={warning}>{t.message(warning)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The legend of the open view's overlays; nothing while none is on. The physical-space panel shows it
 * too, for the overlays that color something there, with a class of its own that places it.
 */
export function LegendPanel({ legend, className }: { legend: Legend; className?: string }) {
  const t = useT();
  if (legend.overlays.length === 0) return null;
  return (
    // Open at first while it shows an overlay; the relation types alone wait to be opened (ADR 0086).
    <details
      className={className ? `canvas-legend ${className}` : 'canvas-legend'}
      open={legend.overlays.some((part) => part.id !== RELATION_TYPES_LEGEND)}
    >
      <summary>{t('Legend')}</summary>
      <div className="canvas-legend-body">
        {legend.overlays.map((part) => (
          <LegendPart key={part.id} part={part} />
        ))}
      </div>
    </details>
  );
}
