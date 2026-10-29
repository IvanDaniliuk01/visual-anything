/**
 * What the canvas shows around a comparison (ADR 0070): a bar at its top with the comparison's title
 * and the view's own changes, the choice of drawing, Before, After or Comparison, whether what is
 * unchanged is drawn faintly, the previous and next change, and End; and the legend, which names the
 * four marks with how many of each the view holds.
 *
 * While it shows, `]` and `[` go to the next and the previous change, wherever the focus is but in a
 * text field: each selects the change's shape and brings it into view with a short eased move, or a
 * cut under reduced motion, and screen readers hear what it is and what differs. Escape ends it, as
 * Escape ends a tour.
 */
import { itemKey, type Change } from '@visual-anything/core';
import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react';
import { selectionOf, type Selection } from '../../editor/selection';
import { useT, type Translator } from '../../i18n';
import { isTextEntry } from '../../live/shortcuts';
import {
  ChangeNames,
  changeSentence,
  differencesText,
  statusName,
} from '../../versions/changes/describe';
import { StatusBadge } from '../../versions/changes/ChangesList';
import type { CanvasCamera } from '../../view-state/canvas';
import type { ComparisonStore, ShownComparison } from './mode';
import {
  CHANGE_MARKS,
  COMPARISON_DRAWINGS,
  MARKS_DRAWN,
  type ComparisonDrawing,
  type ComparisonScene,
  type MarkedTarget,
} from './scene';
import { drawingName } from './text';
import './comparison.css';

interface ComparisonBarProps {
  store: ComparisonStore;
  shown: ShownComparison;
  drawn: ComparisonScene;
  /** The changes of the open view itself, such as its scope, which the bar names. */
  viewChanges: readonly Change[];
  canvas: CanvasCamera | undefined;
  selection: Selection;
  select: (selection: Selection) => void;
  reducedMotion: boolean;
}

/** The change a marked target stands for: its own, or that of its place or route in the view. */
function changeOf(
  target: MarkedTarget,
  changes: ReadonlyMap<string, Change>,
  view: string,
): Change | undefined {
  const { id } = target;
  if (target.kind === 'relation') {
    return changes.get(`relation:${id}`) ?? changes.get(`route:${view}:${id}`);
  }
  if (target.kind === 'free-shape') return changes.get(`free-shape:${view}:${id}`);
  const own = changes.get(`element:${id}`);
  if (own) return own;
  for (const [key, change] of changes) {
    if (key === `position:${view}:${id}` || key.startsWith(`position:${view}:${id} in `)) {
      return change;
    }
  }
  return undefined;
}

export function ComparisonBar({
  store,
  shown,
  drawn,
  viewChanges,
  canvas,
  selection,
  select,
  reducedMotion,
}: ComparisonBarProps) {
  const t = useT();
  const heading = useId();
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  const say = (text: string) => setAnnouncement((last) => ({ text, count: last.count + 1 }));
  const names = useMemo(
    () => new ChangeNames(shown.older, shown.newer, shown.comparison),
    [shown.older, shown.newer, shown.comparison],
  );
  const byKey = useMemo(
    () => new Map(shown.comparison.changes.map((change) => [itemKey(change.ref), change])),
    [shown.comparison],
  );
  const { targets } = drawn;

  const step = (by: 1 | -1) => {
    if (targets.length === 0) {
      say(t('This drawing marks no change.'));
      return;
    }
    const at = targets.findIndex((target) =>
      target.kind === 'element'
        ? selection.elements.has(target.id)
        : target.kind === 'relation'
          ? selection.relations.has(target.id)
          : selection.freeShapes.has(target.id),
    );
    const next =
      at < 0 ? (by > 0 ? 0 : targets.length - 1) : (at + by + targets.length) % targets.length;
    const target = targets[next] as MarkedTarget;
    select(selectionOf([{ kind: target.kind, id: target.id }]));
    canvas?.reveal(target.key, !reducedMotion);
    const change = changeOf(target, byKey, drawn.view);
    const sentence = change
      ? changeSentence(t, change, names)
      : t('{status}: {what}.', { status: statusName(t, target.mark), what: names.of(target.id) });
    say(
      t('Change {place} of {count}. {sentence}', {
        place: next + 1,
        count: targets.length,
        sentence,
      }),
    );
  };
  const stepFromKeys = useEffectEvent((by: 1 | -1) => step(by));
  const end = useEffectEvent(() => store.end());

  // The keys work wherever the focus is, but where people type and in dialogs and menus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntry(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (event.key === ']' || event.key === '[') {
        event.preventDefault();
        event.stopPropagation();
        stepFromKeys(event.key === ']' ? 1 : -1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        end();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  const own = viewChanges
    .map((change) => differencesText(t, change, names, 3))
    .filter((text) => text !== '');

  return (
    <>
      <section className="comparison-bar" aria-labelledby={heading}>
        <h3 id={heading} className="comparison-title">
          {shown.title}
        </h3>
        {own.length > 0 && (
          <p className="comparison-view-changes">
            {t('This view changed: {what}', { what: own.join('; ') })}
          </p>
        )}
        <div className="comparison-controls">
          <div role="radiogroup" aria-label={t('Drawing')} className="comparison-drawings">
            {COMPARISON_DRAWINGS.map((drawing) => (
              <button
                key={drawing}
                type="button"
                role="radio"
                aria-checked={shown.drawing === drawing}
                className="comparison-drawing"
                onClick={() => store.setDrawing(drawing)}
              >
                {drawingName(t, drawing)}
              </button>
            ))}
          </div>
          <label className="comparison-faint">
            <input
              type="checkbox"
              checked={shown.faint}
              onChange={(event) => store.setFaint(event.currentTarget.checked)}
            />
            {t('Fade what is unchanged')}
          </label>
          <button
            type="button"
            title={t('Previous change ([)')}
            aria-keyshortcuts="["
            onClick={() => step(-1)}
          >
            {t('Previous')}
          </button>
          <button
            type="button"
            title={t('Next change (])')}
            aria-keyshortcuts="]"
            onClick={() => step(1)}
          >
            {t('Next')}
          </button>
          <button
            type="button"
            title={t('End the comparison (Escape)')}
            aria-keyshortcuts="Escape"
            onClick={() => store.end()}
          >
            {t('End comparison')}
          </button>
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement.count > 0 && <span key={announcement.count}>{announcement.text}</span>}
        </p>
      </section>
      <ComparisonLegend drawn={drawn} />
    </>
  );
}

/** The legend of the comparison's marks, with how many of each the view holds (ADR 0055, ADR 0070). */
export function ComparisonLegend({ drawn }: { drawn: ComparisonScene }) {
  const t = useT();
  const hiding = [...drawn.hidden.values()].reduce((sum, count) => sum + count, 0);
  const drawnMarks = MARKS_DRAWN[drawn.drawing];
  return (
    <details className="canvas-legend comparison-legend" open>
      <summary>{t('Legend of the comparison')}</summary>
      <div className="canvas-legend-body">
        <ul className="canvas-legend-entries">
          {CHANGE_MARKS.map((mark) => (
            <li
              key={mark}
              className={drawnMarks.includes(mark) ? undefined : 'comparison-not-drawn'}
            >
              <StatusBadge status={mark} />
              <span
                className={`comparison-pattern comparison-pattern-${mark}`}
                aria-hidden="true"
              />
              <span>{statusName(t, mark)}</span>
              <span className="canvas-legend-amount">{drawn.counts[mark]}</span>
            </li>
          ))}
        </ul>
        <p className="canvas-legend-subtitle">{legendNote(t, drawn.drawing)}</p>
        {hiding > 0 && (
          <p className="canvas-legend-subtitle">
            {t(
              {
                one: 'A count on a collapsed container says how many changes it hides: {count} in all.',
                other:
                  'A count on a collapsed container says how many changes it hides: {count} in all.',
              },
              { count: hiding },
            )}
          </p>
        )}
      </div>
    </details>
  );
}

/** What a drawing shows of the marks, below the legend's entries. */
function legendNote(t: Translator, drawing: ComparisonDrawing): string {
  switch (drawing) {
    case 'before':
      return t('Before: the older version, which cannot show what was added.');
    case 'after':
      return t('After: the newer version, which cannot show what was removed.');
    case 'comparison':
      return t(
        'Comparison: the newer version, with what was removed faint at its older place, and a dashed outline where each moved shape was.',
      );
  }
}
