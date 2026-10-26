/**
 * Time ranges (R43): a range on a date, time or number attribute, or on a period between two, hides
 * what falls outside it, keeps what has no value, moves with its sliders and plays on.
 */
import {
  SYSTEMS,
  builtinPackage,
  definitionsIn,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION } from '../editor/selection';
import { AttributeLookupContext } from '../live-values/context';
import { AttributeLookup, STORED_ONLY } from '../live-values/lookup';
import { NO_FILTERS, applyFilters, type TimeRange } from './explore';
import { buildScene } from './scene';
import { TICK_MS, TimeRangeChooser, TimeRangeStrip } from './TimeRangeControls';
import { playedOn, pointText, rangeChoices, rangeExtent, rewound } from './time-range';
import { useExplorer } from './useExplorer';

function project(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'History', packages: ['systems'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        {
          id: 'old',
          component: 'systems.service',
          name: 'Old',
          attributes: { since: '2015-01-01', until: '2019-06-30', epoch: 1 },
        },
        {
          id: 'mid',
          component: 'systems.service',
          name: 'Mid',
          attributes: { since: '2018-03-01', epoch: 5 },
        },
        {
          id: 'new',
          component: 'systems.service',
          name: 'New',
          attributes: { since: '2023-09-15', epoch: 9 },
        },
        { id: 'person', component: 'systems.person', name: 'Person' },
      ],
      relations: [
        {
          id: 'call',
          relationType: 'systems.communicates-with',
          from: 'mid',
          to: 'new',
          attributes: { opened: '09:30' },
        },
      ],
    },
    packages: [builtinPackage(SYSTEMS.id) ?? SYSTEMS],
    views: [
      {
        id: 'v',
        name: 'Overview',
        perspective: { name: 'Overview' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const state = project();
const scene = buildScene(state, 'v');
const day = (text: string) => Date.parse(`${text}T00:00:00Z`);

function hidden(range: TimeRange, lookup?: AttributeLookup): string[] {
  return [...applyFilters(scene, state, { ...NO_FILTERS, range }, lookup).hidden].sort();
}

describe('a time range in the filters', () => {
  it('hides what falls outside it, and keeps what has no value', () => {
    const range: TimeRange = { of: 'elements', attribute: 'epoch', kind: 'number', from: 4, to: 9 };
    expect(hidden(range)).toEqual(['old']);
    expect(hidden({ ...range, from: 9, to: 4 })).toEqual(['old']);
  });

  it('keeps a period that meets it, open at an end it has not', () => {
    const range: TimeRange = {
      of: 'elements',
      attribute: 'since',
      until: 'until',
      kind: 'date',
      from: day('2019-01-01'),
      to: day('2020-01-01'),
    };
    // Old ran until mid-2019; Mid since 2018 goes on; New starts later.
    expect(hidden(range)).toEqual(['call', 'new']);
  });

  it('reads live values over stored ones', () => {
    const live: LiveValue = {
      target: 'old',
      attribute: 'epoch',
      value: 7,
      sender: { kind: 'claude' },
      arrivedAt: 1,
      freshFor: 60_000,
    };
    const values = new Map<Id, Map<string, LiveValue>>([['old', new Map([['epoch', live]])]]);
    const lookup = new AttributeLookup({
      version: 1,
      now: 1,
      of: (id) => values.get(id),
      targets: new Set(values.keys()),
      size: 1,
    });
    expect(
      hidden({ of: 'elements', attribute: 'epoch', kind: 'number', from: 4, to: 9 }, lookup),
    ).toEqual([]);
  });

  it('is on relations too, and on times of day', () => {
    const range: TimeRange = {
      of: 'relations',
      attribute: 'opened',
      kind: 'time',
      from: 10 * 3600,
      to: 12 * 3600,
    };
    expect(hidden(range)).toEqual(['call']);
  });
});

describe('what a range can be on, and how far it reaches', () => {
  it('offers the attributes whose values are points, with their kind and extent', () => {
    const choices = rangeChoices(scene, state, STORED_ONLY);
    expect(choices).toEqual(
      expect.arrayContaining([
        { of: 'elements', attribute: 'epoch', kind: 'number', min: 1, max: 9 },
        {
          of: 'elements',
          attribute: 'since',
          kind: 'date',
          min: day('2015-01-01'),
          max: day('2023-09-15'),
        },
        { of: 'relations', attribute: 'opened', kind: 'time', min: 9.5 * 3600, max: 9.5 * 3600 },
      ]),
    );
  });

  it('reaches over both ends of a period, and counts what has no value', () => {
    expect(
      rangeExtent(scene, state, STORED_ONLY, {
        of: 'elements',
        attribute: 'since',
        until: 'until',
        kind: 'date',
      }),
    ).toEqual({
      min: day('2015-01-01'),
      max: day('2023-09-15'),
      whole: true,
      without: 1,
    });
  });

  it('plays on by a fortieth of the extent, keeping its width, and stops at its end', () => {
    const extent = { min: 0, max: 40, whole: true, without: 0 };
    const range: TimeRange = {
      of: 'elements',
      attribute: 'epoch',
      kind: 'number',
      from: 0,
      to: 10,
    };
    expect(playedOn(range, extent)).toMatchObject({ from: 1, to: 11 });
    expect(playedOn({ ...range, from: 30, to: 39.5 }, extent)).toMatchObject({
      from: 30.5,
      to: 40,
    });
    expect(playedOn({ ...range, from: 30, to: 40 }, extent)).toBeUndefined();
    expect(rewound({ ...range, from: 30, to: 40 }, extent)).toMatchObject({ from: 0, to: 10 });
  });

  it('writes points as their values are written', () => {
    expect(pointText(5, 'number', true)).toBe('5');
    expect(pointText(2.12345, 'number', false)).toBe('2.123');
    expect(pointText(day('2026-10-25'), 'date', true)).toBe('2026-10-25');
    expect(pointText(day('2026-10-25') + 13.5 * 3600_000, 'date', false)).toBe('2026-10-25 13:30');
    expect(pointText(9.5 * 3600, 'time', true)).toBe('09:30');
  });
});

/** The filter panel's chooser and the strip, as the shell gives them the explorer. */
function Explored() {
  const [emphasis] = useState(() => new EmphasisStore());
  const explore = useExplorer({
    project: state,
    viewId: 'v',
    scene,
    selection: EMPTY_SELECTION,
    emphasis,
  });
  const editor = useMemo<Editor>(
    () => ({
      project: state,
      definitions: definitionsIn(state),
      viewId: 'v',
      scene,
      selection: EMPTY_SELECTION,
      select: () => {},
      send: undefined,
      reveal: () => {},
      explore,
    }),
    [explore],
  );
  return (
    <EditorContext.Provider value={editor}>
      <AttributeLookupContext value={STORED_ONLY}>
        <TimeRangeChooser editor={editor} explore={explore} />
        <TimeRangeStrip editor={editor} explore={explore} />
        <output data-testid="hidden">{[...explore.filtered.hidden].sort().join(' ')}</output>
        <output data-testid="range">{JSON.stringify(explore.filters.range ?? null)}</output>
      </AttributeLookupContext>
    </EditorContext.Provider>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the time range controls', () => {
  it('choose what the range is on, move it with the sliders, and play it on', () => {
    vi.useFakeTimers();
    render(<Explored />);
    fireEvent.change(screen.getByLabelText('Range on'), {
      target: { value: 'elements\u0000epoch' },
    });
    expect(screen.getByText('epoch from 1 to 9')).toBeTruthy();
    expect(screen.getByText('1 has no epoch and stays shown.')).toBeTruthy();
    const to = screen.getByLabelText('Range to');
    fireEvent.change(to, { target: { value: '500' } });
    expect(screen.getByText('epoch from 1 to 5')).toBeTruthy();
    expect(screen.getByTestId('hidden').textContent).toBe('call new');
    expect(to.getAttribute('aria-valuetext')).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    const moved = JSON.parse(screen.getByTestId('range').textContent ?? 'null') as TimeRange;
    // Whole numbers move by a whole one at least.
    expect(moved.from).toBe(2);
    expect(moved.to).toBe(6);
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 40);
    });
    expect(screen.getByText('epoch from 5 to 9')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'No time range' }));
    expect(screen.getByTestId('range').textContent).toBe('null');
  });

  it('say so when nothing here holds points', () => {
    const { container } = render(
      <TimeRangeChooser
        editor={{
          project: state,
          definitions: definitionsIn(state),
          viewId: 'v',
          scene: { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined },
          selection: EMPTY_SELECTION,
          select: () => {},
          send: undefined,
          reveal: () => {},
        }}
        explore={{
          filters: NO_FILTERS,
          focus: {
            on: false,
            targets: { elements: new Set(), relations: new Set() },
            degrees: 1,
            direction: 'both',
            isolate: false,
          },
          setFilters: () => {},
          setFocus: () => {},
          startFocus: () => {},
          focusOn: () => {},
          filtered: { hidden: new Set(), dimmed: new Set(), hiddenShapes: 0, hiddenRelations: 0 },
        }}
      />,
    );
    expect(container.textContent).toContain('No attribute here holds dates, times or numbers');
  });
});
