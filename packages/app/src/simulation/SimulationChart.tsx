/**
 * A chart of one simulated number over the ticks a run holds (ADR 0085), in plain SVG drawn in the
 * theme's tokens: its line, its limits where they fall within it, and the tick shown, marked. A
 * click goes to the tick under it; as a slider, the arrow keys, Page Up, Page Down, Home and End go
 * from tick to tick.
 *
 * Its line is worked out again only when the ticks held change, never as the tick shown moves.
 */
import type { SimulatedValueDefinition } from '@visual-anything/schema';
import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { useT } from '../i18n';
import { CHART_HEIGHT as HEIGHT, CHART_WIDTH as WIDTH, chartLine } from './chart';
import type { SimulationShown } from './store';
import { numberText, simulatedTime, valueText } from './words';

/** How many ticks Page Up and Page Down go. */
const PAGE = 10;

interface SimulationChartProps {
  value: SimulatedValueDefinition;
  run: SimulationShown;
  onGoTo: (tick: number) => void;
}

export function SimulationChart({ value, run, onGoTo }: SimulationChartProps) {
  const t = useT();
  const line = useMemo(() => chartLine(run.ticks, value.name), [run.ticks, value.name]);
  if (!line) return null;
  const last = run.ticks.length - 1;
  const x = last <= 0 ? 0 : (run.shown / last) * WIDTH;
  const time = simulatedTime(run.simulation.definition, run.shown);
  const shown = run.ticks[run.shown]?.values[value.name];
  const at =
    time === undefined
      ? t('tick {tick}', { tick: run.shown })
      : t('tick {tick}, at {time}', { tick: run.shown, time });
  const valueNow = shown === undefined ? '' : `: ${valueText(t, shown, value.unit)}`;
  const limits = [value.min, value.max].filter(
    (limit): limit is number => limit !== undefined && limit >= line.low && limit <= line.high,
  );

  const go = (tick: number) => onGoTo(Math.min(last, Math.max(0, tick)));
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const to: Record<string, number> = {
      ArrowLeft: run.shown - 1,
      ArrowDown: run.shown - 1,
      ArrowRight: run.shown + 1,
      ArrowUp: run.shown + 1,
      PageDown: run.shown - PAGE,
      PageUp: run.shown + PAGE,
      Home: 0,
      End: last,
    };
    const tick = to[event.key];
    if (tick === undefined) return;
    event.preventDefault();
    go(tick);
  };
  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = (event.clientX - box.left) / box.width;
    go(Math.round(fraction * last));
  };

  return (
    <div className="simulation-chart">
      <svg
        className="simulation-chart-drawing"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="slider"
        tabIndex={0}
        aria-label={t('Chart of “{name}”: the tick shown', { name: value.name })}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={run.shown}
        aria-valuetext={`${at}${valueNow}`}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {limits.map((limit) => (
          <line
            key={limit}
            className="simulation-chart-limit"
            x1={0}
            x2={WIDTH}
            y1={line.y(limit)}
            y2={line.y(limit)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          className="simulation-chart-line"
          points={line.points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="simulation-chart-shown"
          x1={x}
          x2={x}
          y1={0}
          y2={HEIGHT}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="simulation-chart-range">
        {t('From {low} to {high} over the ticks held', {
          low: numberText(line.low),
          high: numberText(line.high),
        })}
      </span>
    </div>
  );
}
