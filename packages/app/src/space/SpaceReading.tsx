/**
 * The physical-space panel's ways of reading (ADR 0076), under its tools: Cut across X, Y or Z, with
 * a slider for where it crosses, within what the panel draws, and the side it keeps; Explode, a
 * slider from 0 to 2; and Names and Relations of the selection, each pressed while it is on. Each
 * writes what the panel shows for the view through its store, so the tab keeps it and view addresses
 * carry it; none of it is a command. They only read, so the read-only page has them too.
 */
import type { Space, ViewSpace } from '@visual-anything/core';
import type { Id, SpaceCut } from '@visual-anything/schema';
import { useId, useMemo, type ChangeEvent } from 'react';
import { useT } from '../i18n';
import { CutIcon, ExplodeIcon, NamesIcon, RelationsIcon } from '../shell/icons';
import { formatLength } from '../shell/inspector/lengths';
import {
  cutAcross,
  cutAt,
  cutKeeping,
  cutRangeOf,
  CUT_AXES,
  EXPLODE_STEP,
  exploded,
  MOST_EXPLODED,
  spaceBoundsOf,
  switched,
  type CutAxis,
} from './reading';
import type { SpacePanelStore } from './store';

interface SpaceReadingProps {
  store: SpacePanelStore;
  viewId: Id;
  shown: ViewSpace;
  space: Space;
  say: (text: string) => void;
}

const AXIS_NAMES: Readonly<Record<CutAxis, string>> = { x: 'X', y: 'Y', z: 'Z' };

export function SpaceReading({ store, viewId, shown, space, say }: SpaceReadingProps) {
  const t = useT();
  const cutId = useId();
  const explodeId = useId();
  const bounds = useMemo(() => spaceBoundsOf(space), [space]);
  const cut = shown.cut;
  const range = cut ? cutRangeOf(bounds, cut.axis, cut.at) : undefined;
  const factor = shown.explode ?? 0;
  const factorText = new Intl.NumberFormat(t.language, { maximumFractionDigits: 2 }).format(factor);
  // What the tab keeps now, so that a change made from an older render keeps what changed since.
  const now = () => store.state(viewId) ?? shown;
  const set = (next: ViewSpace) => store.set(viewId, next);

  const chooseAxis = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const axis = CUT_AXES.find((each) => each === value);
    const next = cutAcross(now(), axis, bounds);
    set(next);
    if (!next.cut) say(t('Not cut.'));
    else {
      say(
        t(
          next.cut.keep === 'below'
            ? 'Cut across {axis}, keeping what is below.'
            : 'Cut across {axis}, keeping what is above.',
          { axis: AXIS_NAMES[next.cut.axis] },
        ),
      );
    }
  };

  const keep = (event: ChangeEvent<HTMLSelectElement>) => {
    const side: SpaceCut['keep'] = event.target.value === 'above' ? 'above' : 'below';
    set(cutKeeping(now(), side));
    say(t(side === 'below' ? 'Keeping what is below the cut.' : 'Keeping what is above the cut.'));
  };

  const toggle = (which: 'names' | 'relations') => {
    const on = now()[which] !== true;
    set(switched(now(), which, on));
    if (which === 'names') say(t(on ? 'Names on.' : 'Names off.'));
    else say(t(on ? 'Relations of the selection on.' : 'Relations of the selection off.'));
  };

  return (
    <div className="space-panel-reading" role="group" aria-label={t('Ways of reading')}>
      <span className="space-panel-field">
        <CutIcon />
        <label htmlFor={cutId}>{t('Cut')}</label>
        <select
          id={cutId}
          className="space-panel-choice"
          value={cut?.axis ?? ''}
          onChange={chooseAxis}
        >
          <option value="">{t('Off')}</option>
          {CUT_AXES.map((axis) => (
            <option key={axis} value={axis}>
              {t('Across {axis}', { axis: AXIS_NAMES[axis] })}
            </option>
          ))}
        </select>
      </span>
      {cut && range && (
        <span className="space-panel-field">
          <input
            type="range"
            className="space-panel-slider"
            aria-label={t('Where the cut crosses {axis}', { axis: AXIS_NAMES[cut.axis] })}
            min={range.min}
            max={range.max}
            step={range.step}
            value={cut.at}
            aria-valuetext={formatLength(cut.at)}
            onChange={(event) => set(cutAt(now(), Number(event.target.value)))}
          />
          <span className="space-panel-value" aria-hidden="true">
            {formatLength(cut.at)}
          </span>
          <select
            className="space-panel-choice"
            aria-label={t('What the cut keeps')}
            value={cut.keep}
            onChange={keep}
          >
            <option value="below">{t('Keep below')}</option>
            <option value="above">{t('Keep above')}</option>
          </select>
        </span>
      )}
      <span className="space-panel-field">
        <ExplodeIcon />
        <label htmlFor={explodeId}>{t('Explode')}</label>
        <input
          id={explodeId}
          type="range"
          className="space-panel-slider"
          min={0}
          max={MOST_EXPLODED}
          step={EXPLODE_STEP}
          value={factor}
          aria-valuetext={
            factor === 0 ? t('Not exploded') : t('Exploded by {factor}', { factor: factorText })
          }
          onChange={(event) => set(exploded(now(), Number(event.target.value)))}
        />
        <span className="space-panel-value" aria-hidden="true">
          {factorText}
        </span>
      </span>
      <button
        type="button"
        className="space-panel-tool"
        aria-pressed={shown.names === true}
        title={t('Write the names of the parts nearest the camera')}
        onClick={() => toggle('names')}
      >
        <NamesIcon />
        {t('Names')}
      </button>
      <button
        type="button"
        className="space-panel-tool"
        aria-pressed={shown.relations === true}
        title={t('Draw the relations of the selection')}
        onClick={() => toggle('relations')}
      >
        <RelationsIcon />
        {t('Relations of the selection')}
      </button>
    </div>
  );
}
