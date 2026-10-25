/**
 * Exploring the open view in a read-only page, as the app explores it (ADR 0025): filters that hide
 * the shapes of components and the relations of relation types, and focus from the selection, by
 * degrees and direction, dimming or isolating the rest. They belong to this page while it is open,
 * and a view address carries them.
 */
import type { Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef } from 'react';
import {
  ALL_DEGREES,
  NO_FILTERS,
  filterChoices,
  isFiltering,
  type FilterChoice,
  type FocusDirection,
} from '../canvas/explore';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { DismissIcon } from '../shell/icons';

const DEGREES = [1, 2, 3, 4, 5] as const;

const DIRECTIONS: readonly { direction: FocusDirection; name: string }[] = [
  { direction: 'both', name: 'Both ways' },
  { direction: 'outgoing', name: 'Outgoing' },
  { direction: 'incoming', name: 'Incoming' },
];

export function ExplorePanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const editor = useEditor();
  const { scene, project, explore } = editor;
  const heading = useId();
  const panel = useRef<HTMLDivElement>(null);
  const choices = useMemo(
    () => (scene ? filterChoices(scene, project) : undefined),
    [scene, project],
  );
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, select, button')?.focus();
  }, []);
  if (!explore) return null;
  const { filters, focus } = explore;
  const toggle = (set: ReadonlySet<Id>, id: Id, shown: boolean): Set<Id> => {
    const next = new Set(set);
    if (shown) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div
      ref={panel}
      className="viewer-popover viewer-explore"
      role="dialog"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="viewer-popover-head">
        <h2 id={heading}>{t('Explore')}</h2>
        <button
          type="button"
          className="viewer-dismiss"
          aria-label={t('Close')}
          title={t('Close (Escape)')}
          onClick={onClose}
        >
          <DismissIcon />
        </button>
      </div>
      <p className="viewer-note">{t('Filters hide shapes; nothing moves.')}</p>
      <Choices
        legend={t('Components')}
        choices={choices?.components ?? []}
        hidden={filters.components}
        none={t('This view draws no elements.')}
        onChange={(id, shown) =>
          explore.setFilters({ ...filters, components: toggle(filters.components, id, shown) })
        }
      />
      <Choices
        legend={t('Relation types')}
        choices={choices?.relationTypes ?? []}
        hidden={filters.relationTypes}
        none={t('This view draws no relations.')}
        onChange={(id, shown) =>
          explore.setFilters({
            ...filters,
            relationTypes: toggle(filters.relationTypes, id, shown),
          })
        }
      />
      {isFiltering(filters) && (
        <button
          type="button"
          className="viewer-button"
          onClick={() => explore.setFilters(NO_FILTERS)}
        >
          {t('Show everything')}
        </button>
      )}
      <fieldset className="viewer-group">
        <legend>{t('Focus')}</legend>
        <label className="viewer-check">
          <input
            type="checkbox"
            checked={focus.on}
            onChange={(event) =>
              event.target.checked ? explore.startFocus() : explore.setFocus({ on: false })
            }
          />
          {t('Focus on the selection, dimming what it does not reach')}
        </label>
        <div className="viewer-row">
          <label>
            {t('Reach')}{' '}
            <select
              value={focus.degrees === ALL_DEGREES ? 'all' : String(focus.degrees)}
              onChange={(event) =>
                explore.setFocus({
                  degrees: event.target.value === 'all' ? ALL_DEGREES : Number(event.target.value),
                })
              }
            >
              {DEGREES.map((degrees) => (
                <option key={degrees} value={degrees}>
                  {t({ one: '{count} degree', other: '{count} degrees' }, { count: degrees })}
                </option>
              ))}
              <option value="all">{t('Every degree')}</option>
            </select>
          </label>
          <label>
            {t('Direction')}{' '}
            <select
              value={focus.direction}
              onChange={(event) =>
                explore.setFocus({ direction: event.target.value as FocusDirection })
              }
            >
              {DIRECTIONS.map(({ direction, name }) => (
                <option key={direction} value={direction}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="viewer-check">
          <input
            type="checkbox"
            checked={focus.isolate}
            onChange={(event) => explore.setFocus({ isolate: event.target.checked })}
          />
          {t('Isolate: hide what it does not reach')}
        </label>
      </fieldset>
    </div>
  );
}

/** A checkbox for each component or relation type the view draws, checked while it shows. */
function Choices({
  legend,
  choices,
  hidden,
  none,
  onChange,
}: {
  legend: string;
  choices: readonly FilterChoice[];
  hidden: ReadonlySet<Id>;
  none: string;
  onChange: (id: Id, shown: boolean) => void;
}) {
  const t = useT();
  return (
    <fieldset className="viewer-group">
      <legend>{legend}</legend>
      {choices.length === 0 ? (
        <p className="viewer-note">{none}</p>
      ) : (
        <ul className="viewer-choices">
          {choices.map((choice) => (
            <li key={choice.id}>
              <label className="viewer-check">
                <input
                  type="checkbox"
                  checked={!hidden.has(choice.id)}
                  onChange={(event) => onChange(choice.id, event.target.checked)}
                />
                {t.definition(choice.id, choice.name)}
                <span className="viewer-count">{choice.count}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
