/**
 * What a package's panel answered, drawn with the app's own controls (ADR 0089): headings, texts,
 * label and value rows, tables, bar and line charts, and buttons that run the package's actions.
 * Every text is written as text: nothing a package answers is read as HTML.
 */
import type { PanelBlock } from '@visual-anything/core';
import { useId, type ReactNode } from 'react';
import { useT, type Translator } from '../i18n';
import { numberText } from '../simulation/words';
import {
  PANEL_CHART_HEIGHT as HEIGHT,
  PANEL_CHART_WIDTH as WIDTH,
  chartBars,
  chartLinePoints,
  chartScale,
  lineX,
  seriesColor,
} from './panelChart';

type ValueBlock = Extract<PanelBlock, { kind: 'value' }>;
type TableBlock = Extract<PanelBlock, { kind: 'table' }>;
type ChartBlock = Extract<PanelBlock, { kind: 'chart' }>;
type Cell = TableBlock['rows'][number][number];

/** A button's action, by its id: how to run it, or why it cannot run now. */
export interface PanelButtons {
  /** Runs the action; undefined while no action may run, as when the project cannot be changed. */
  run: ((action: string) => void) | undefined;
}

interface PanelBlocksProps {
  blocks: readonly PanelBlock[];
  /** The id of the panel's heading, which names a table or a chart that no heading before names. */
  labelledBy: string;
  buttons: PanelButtons;
}

/** The blocks in order, the value rows next to each other making one list. */
export function PanelBlocks({ blocks, labelledBy, buttons }: PanelBlocksProps) {
  const base = useId();
  const parts: ReactNode[] = [];
  let values: ValueBlock[] = [];
  let named = labelledBy;
  const endValues = (at: number) => {
    if (values.length === 0) return;
    parts.push(<ValueRows key={`values-${at}`} values={values} />);
    values = [];
  };
  for (const [at, block] of blocks.entries()) {
    if (block.kind === 'value') {
      values.push(block);
      continue;
    }
    endValues(at);
    switch (block.kind) {
      case 'heading': {
        named = `${base}-${at}`;
        parts.push(
          <h5 key={at} id={named} className="package-panel-heading">
            {block.text}
          </h5>,
        );
        break;
      }
      case 'text':
        parts.push(
          <p key={at} className="package-panel-text">
            {block.text}
          </p>,
        );
        break;
      case 'table':
        parts.push(<PanelTable key={at} table={block} labelledBy={named} />);
        break;
      case 'chart':
        parts.push(<PanelChart key={at} chart={block} labelledBy={named} />);
        break;
      case 'button':
        parts.push(<PanelButton key={at} label={block.label} action={block.action} {...buttons} />);
        break;
    }
  }
  endValues(blocks.length);
  return <div className="package-panel-blocks">{parts}</div>;
}

/** A cell's or a value's text: a number as the app writes one, true or false as yes or no. */
function cellText(t: Translator, value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? t('Yes') : t('No');
  if (typeof value === 'number') return numberText(value);
  return value;
}

function ValueRows({ values }: { values: readonly ValueBlock[] }) {
  const t = useT();
  return (
    <dl className="package-panel-values">
      {values.map((each, at) => (
        <div key={at} className="package-panel-value">
          <dt>{each.label}</dt>
          <dd>{cellText(t, each.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A table: its header row, then its rows, scrolling inside its own box, which takes the focus so
 * that the keyboard scrolls it too.
 */
function PanelTable({ table, labelledBy }: { table: TableBlock; labelledBy: string }) {
  const t = useT();
  return (
    <div className="package-panel-table" role="region" tabIndex={0} aria-labelledby={labelledBy}>
      <table>
        <thead>
          <tr>
            {table.columns.map((column, at) => (
              <th key={at} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={table.columns.length} className="package-panel-empty">
                {t('No rows.')}
              </td>
            </tr>
          ) : (
            table.rows.map((row, at) => (
              <tr key={at}>
                {row.map((cell, column) => (
                  <td key={column} className={typeof cell === 'number' ? 'number' : undefined}>
                    {cellText(t, cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const BAR_CHART = {
  one: 'Bar chart of {series}, over {count} label. {range}.',
  other: 'Bar chart of {series}, over {count} labels. {range}.',
};
const LINE_CHART = {
  one: 'Line chart of {series}, over {count} label. {range}.',
  other: 'Line chart of {series}, over {count} labels. {range}.',
};

/** At most this many labels, a line chart marks each of its points. */
const MARKED_POINTS = 24;

/**
 * A bar or line chart: its drawing, named for screen readers by what it shows and its range; its
 * legend, for more than one series; its first and last labels; and its numbers as a table, for
 * screen readers.
 */
function PanelChart({ chart, labelledBy }: { chart: ChartBlock; labelledBy: string }) {
  const t = useT();
  const bars = chart.chart === 'bar';
  const scale = chartScale(chart.series, bars);
  const names = chart.series.map((each) => each.name).join(', ');
  const range = t('From {low} to {high}', {
    low: numberText(scale.low),
    high: numberText(scale.high),
  });
  const said = bars
    ? t(BAR_CHART, {
        series: names,
        count: chart.labels.length,
        range,
      })
    : t(LINE_CHART, {
        series: names,
        count: chart.labels.length,
        range,
      });
  const markTitle = (series: number, label: number, value: number) =>
    t('{series}, {label}: {value}', {
      series: chart.series[series]?.name ?? '',
      label: chart.labels[label] ?? '',
      value: numberText(value),
    });
  const first = chart.labels[0] ?? '';
  const last = chart.labels.at(-1) ?? '';

  return (
    <figure className="package-chart">
      <svg
        className="package-chart-drawing"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={said}
      >
        {bars ? (
          <>
            {chartBars(chart.labels, chart.series, scale).map((bar) => (
              <rect
                key={`${bar.label} ${bar.series}`}
                className="package-chart-bar"
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={seriesColor(bar.series)}
              >
                <title>{markTitle(bar.series, bar.label, bar.value)}</title>
              </rect>
            ))}
            <line
              className="package-chart-baseline"
              x1={0}
              x2={WIDTH}
              y1={scale.y(0)}
              y2={scale.y(0)}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          chart.series.map((each, series) => (
            <g key={series} stroke={seriesColor(series)}>
              <polyline
                className="package-chart-line"
                points={chartLinePoints(each.values, scale)}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              {chart.labels.length <= MARKED_POINTS &&
                each.values.map((value, label) => {
                  const x = lineX(label, each.values.length);
                  const y = scale.y(value);
                  // A line of no length, with round ends, is a dot the box's stretching keeps round.
                  return (
                    <line
                      key={label}
                      className="package-chart-point"
                      x1={x}
                      x2={x}
                      y1={y}
                      y2={y}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{markTitle(series, label, value)}</title>
                    </line>
                  );
                })}
            </g>
          ))
        )}
      </svg>
      <div className="package-chart-labels" aria-hidden="true">
        <span>{first}</span>
        {chart.labels.length > 1 && <span>{last}</span>}
      </div>
      {chart.series.length > 1 && (
        <ul className="package-chart-legend" aria-hidden="true">
          {chart.series.map((each, series) => (
            <li key={series}>
              <svg className="package-chart-swatch" viewBox="0 0 10 10" aria-hidden="true">
                <rect width={10} height={10} rx={2} fill={seriesColor(series)} />
              </svg>
              {each.name}
            </li>
          ))}
        </ul>
      )}
      <figcaption className="package-chart-range" aria-hidden="true">
        {range}
      </figcaption>
      <table className="visually-hidden" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">{t('Label')}</th>
            {chart.series.map((each, series) => (
              <th key={series} scope="col">
                {each.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.labels.map((label, at) => (
            <tr key={at}>
              <th scope="row">{label}</th>
              {chart.series.map((each, series) => (
                <td key={series}>{numberText(each.values[at] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function PanelButton({ label, action, run }: { label: string; action: string } & PanelButtons) {
  return (
    <button
      type="button"
      className="inspector-action package-panel-button"
      disabled={run === undefined}
      onClick={() => run?.(action)}
    >
      {label}
    </button>
  );
}
