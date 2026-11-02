/**
 * Time ranges in the explore controls (R43, ADR 0025's clarification): the filter panel chooses what
 * the range is on, a date, time or number attribute, or a period between two; the strip under the
 * toolbar moves the range with two sliders and plays it, moving it on at a steady pace, so that the
 * view shows what was there, at that time, step by step. Nothing is written to the view: the range
 * is kept with the view's filters, by the app.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Editor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { useAttributeLookup } from '../live-values/context';
import type { TimeRange } from './explore';
import {
  SLIDER_STEPS,
  playedOn,
  pointText,
  rangeChoices,
  rangeExtent,
  rewound,
  type RangeChoice,
  type RangeExtent,
} from './time-range';
import type { Explore } from './useExplorer';
import './time-range.css';

/** How long one tick of playback lasts at normal speed, in milliseconds. */
export const TICK_MS = 500;

const DAY = 24 * 60 * 60 * 1000;

/** The filters without their time range. */
function withoutRange(filters: Explore['filters']): Explore['filters'] {
  return {
    components: filters.components,
    relationTypes: filters.relationTypes,
    conditions: filters.conditions,
  };
}

/** The speeds playback offers, as scenarios' do. */
const SPEEDS = [0.5, 1, 2, 4] as const;

/** The choice of what a time range is on, in the filter panel. */
export function TimeRangeChooser({ editor, explore }: { editor: Editor; explore: Explore }) {
  const t = useT();
  const lookup = useAttributeLookup();
  const { scene, project } = editor;
  const { filters, setFilters } = explore;
  const choices = useMemo(
    () => (scene ? rangeChoices(scene, project, lookup) : []),
    [scene, project, lookup],
  );
  const onId = useId();
  const untilId = useId();
  const range = filters.range;
  const keyOf = (choice: Pick<RangeChoice, 'of' | 'attribute'>) =>
    `${choice.of}\u0000${choice.attribute}`;
  const chosen = range === undefined ? '' : keyOf(range);
  const ends = choices.filter(
    (each) =>
      range !== undefined &&
      each.of === range.of &&
      each.kind === range.kind &&
      each.attribute !== range.attribute,
  );
  const choose = (key: string) => {
    const choice = choices.find((each) => keyOf(each) === key);
    if (choice === undefined) {
      setFilters(withoutRange(filters));
      return;
    }
    setFilters({
      ...filters,
      range: {
        of: choice.of,
        attribute: choice.attribute,
        kind: choice.kind,
        from: choice.min,
        to: choice.max,
      },
    });
  };
  const chooseEnd = (until: string) => {
    if (range === undefined || scene === undefined) return;
    const next: TimeRange = { ...range };
    if (until === '') delete next.until;
    else next.until = until;
    const extent = rangeExtent(scene, project, lookup, next);
    setFilters({
      ...filters,
      range: extent === undefined ? next : { ...next, from: extent.min, to: extent.max },
    });
  };
  const group = (of: 'elements' | 'relations') =>
    choices
      .filter((each) => each.of === of)
      .map((each) => (
        <option key={keyOf(each)} value={keyOf(each)}>
          {each.attribute}
        </option>
      ));
  return (
    <fieldset className="explore-panel-group">
      <legend>{t('Time range')}</legend>
      {choices.length === 0 ? (
        <p className="explore-panel-note">
          {t(
            'No attribute here holds dates, times or numbers to show a range of. Give one a date, time or number type in its component, on the Components tab.',
          )}
        </p>
      ) : (
        <>
          <p className="explore-panel-note">
            {t('Show only what a date, time or number attribute puts in a range, and play it.')}
          </p>
          <label htmlFor={onId}>{t('Range on')}</label>
          <select id={onId} value={chosen} onChange={(event) => choose(event.target.value)}>
            <option value="">{t('No time range')}</option>
            <optgroup label={t('Elements')}>{group('elements')}</optgroup>
            <optgroup label={t('Relations')}>{group('relations')}</optgroup>
          </select>
          {range !== undefined && ends.length > 0 && (
            <>
              <label htmlFor={untilId}>{t('Until')}</label>
              <select
                id={untilId}
                value={range.until ?? ''}
                onChange={(event) => chooseEnd(event.target.value)}
              >
                <option value="">{t('No end: one point each')}</option>
                {ends.map((each) => (
                  <option key={each.attribute} value={each.attribute}>
                    {each.attribute}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

/** The time range under the toolbar: where it is, two sliders to move it, and playback. */
export function TimeRangeStrip({ editor, explore }: { editor: Editor; explore: Explore }) {
  const t = useT();
  const lookup = useAttributeLookup();
  const { scene, project } = editor;
  const { filters, setFilters } = explore;
  const range = filters.range;
  const extent = useMemo(
    () => (scene && range ? rangeExtent(scene, project, lookup, range) : undefined),
    [scene, project, lookup, range],
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const fromId = useId();
  const toId = useId();
  const speedId = useId();
  // What the next tick moves on from: the range and extent as they are when it comes.
  const latest = useRef({ filters, extent, setFilters });
  useEffect(() => {
    latest.current = { filters, extent, setFilters };
  });
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { filters: now, extent: reach, setFilters: set } = latest.current;
      if (now.range === undefined || reach === undefined) {
        setPlaying(false);
        return;
      }
      const next = playedOn(now.range, reach);
      if (next === undefined) {
        setPlaying(false);
        return;
      }
      const moved = { ...now, range: next };
      // The next tick moves on from here, whether or not the view drew this one yet.
      latest.current = { ...latest.current, filters: moved };
      set(moved);
    }, TICK_MS / speed);
    return () => clearInterval(timer);
  }, [playing, speed]);

  if (range === undefined) return null;
  const set = (next: TimeRange) => setFilters({ ...filters, range: next });
  const written = (point: number) => pointText(point, range.kind, extent?.whole ?? false);
  const low = Math.min(range.from, range.to);
  const high = Math.max(range.from, range.to);
  const summary = t('{attribute} from {from} to {to}', {
    attribute: range.until === undefined ? range.attribute : `${range.attribute}–${range.until}`,
    from: written(low),
    to: written(high),
  });
  return (
    <div className="explore-strip-part explore-range">
      <span>{summary}</span>
      {extent !== undefined && extent.max > extent.min && (
        <>
          <label htmlFor={fromId}>{t('Range from')}</label>
          <Slider
            id={fromId}
            extent={extent}
            kind={range.kind}
            value={low}
            text={written(low)}
            onChange={(from) => set({ ...range, from: Math.min(from, high), to: high })}
          />
          <label htmlFor={toId}>{t('Range to')}</label>
          <Slider
            id={toId}
            extent={extent}
            kind={range.kind}
            value={high}
            text={written(high)}
            onChange={(to) => set({ ...range, from: low, to: Math.max(to, low) })}
          />
          <button
            type="button"
            aria-pressed={playing}
            onClick={() => {
              if (!playing && high >= extent.max) set(rewound(range, extent));
              setPlaying(!playing);
            }}
          >
            {playing ? t('Pause') : t('Play')}
          </button>
          <label htmlFor={speedId}>{t('Speed')}</label>
          <select
            id={speedId}
            value={String(speed)}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((each) => (
              <option key={each} value={String(each)}>
                {each}×
              </option>
            ))}
          </select>
        </>
      )}
      {extent !== undefined && extent.without > 0 && (
        <span className="explore-panel-note">
          {t(
            {
              one: '{count} has no {attribute} and stays shown.',
              other: '{count} have no {attribute} and stay shown.',
            },
            { count: extent.without, attribute: range.attribute },
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setPlaying(false);
          setFilters(withoutRange(filters));
        }}
      >
        {t('No time range')}
      </button>
    </div>
  );
}

interface SliderProps {
  id: string;
  extent: RangeExtent;
  kind: TimeRange['kind'];
  value: number;
  /** The value as it is written, which assistive technology reads. */
  text: string;
  onChange: (value: number) => void;
}

/** A slider across the extent, in a thousand steps. */
function Slider({ id, extent, kind, value, text, onChange }: SliderProps) {
  const span = extent.max - extent.min;
  const step = Math.round(((value - extent.min) / span) * SLIDER_STEPS);
  return (
    <input
      id={id}
      type="range"
      min={0}
      max={SLIDER_STEPS}
      step={1}
      value={Math.min(SLIDER_STEPS, Math.max(0, step))}
      aria-valuetext={text}
      onChange={(event) => {
        const at = Number(event.target.value) / SLIDER_STEPS;
        let point = extent.min + at * span;
        // Whole numbers stay whole, and dates without a time stay whole days.
        if (extent.whole) {
          const unit = kind === 'date' ? DAY : 1;
          point = extent.min + Math.round((point - extent.min) / unit) * unit;
        }
        onChange(Math.min(extent.max, Math.max(extent.min, point)));
      }}
    />
  );
}
