/**
 * The inspector's Simulation section (ADR 0085), against the stand-in for the code worker: what it
 * says before a run opens, the parameters' controls and the seed, the controls that play the run,
 * the tick and its simulated time, the stop and why, each value marked with its limits, the charts
 * that go to a tick, and why a run cannot run, pointing at the package's approval.
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeStore } from '../code/context';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { setCurrentLanguage } from '../i18n/language';
import { simulationHarness } from '../test/simulation';
import { SimulationContext } from './context';
import { SimulationSection } from './SimulationSection';
import type { SimulationReply } from './messages';
import type { StandInOptions } from './stand-in';

function show(options?: StandInOptions) {
  const harness = simulationHarness(undefined, options);
  const code = new CodeStore();
  const review = vi.spyOn(code.actions, 'review');
  const editor: Editor = {
    project: harness.project,
    definitions: definitionsIn(harness.project),
    viewId: 'overview',
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send: undefined,
    reveal: () => {},
    code,
  };
  const element = (project: ProjectSnapshot, id: string) =>
    project.model.elements.find((each) => each.id === id)!;
  const view = render(
    <EditorContext.Provider value={editor}>
      <SimulationContext value={harness.store}>
        <SimulationSection element={element(harness.project, 'api')} />
      </SimulationContext>
    </EditorContext.Provider>,
  );
  const work = () => act(() => void harness.worker.work());
  const section = () => screen.getByRole('region', { name: 'Simulation' });
  return { ...harness, ...view, work, section, review };
}

function openIt(state: ReturnType<typeof show>) {
  fireEvent.click(screen.getByRole('button', { name: 'Open the simulation' }));
  state.work();
}

describe('the Simulation section', () => {
  it('says what opening it does, and opens the run paused at tick 0', () => {
    const state = show();
    expect(state.section()).toHaveTextContent('A queue under load.');
    expect(state.section()).toHaveTextContent(
      'Open it to choose its parameters and play it tick by tick. Nothing it works out is saved.',
    );
    openIt(state);
    expect(state.store.get('api')).toMatchObject({ playing: false, shown: 0 });
    expect(state.section()).toHaveTextContent('Tick 0 of 19, at 0 s');
  });

  it('shows nothing for an element whose component simulates nothing', () => {
    const harness = simulationHarness();
    const editor: Editor = {
      project: harness.project,
      definitions: definitionsIn(harness.project),
      viewId: undefined,
      scene: undefined,
      selection: EMPTY_SELECTION,
      select: () => {},
      send: undefined,
      reveal: () => {},
    };
    const db = harness.project.model.elements.find((each) => each.id === 'db')!;
    render(
      <EditorContext.Provider value={editor}>
        <SimulationContext value={harness.store}>
          <SimulationSection element={db} />
        </SimulationContext>
      </EditorContext.Provider>,
    );
    expect(screen.queryByRole('region', { name: 'Simulation' })).toBeNull();
  });

  it('offers each parameter by its kind, never a value out of its range', () => {
    const state = show();
    openIt(state);
    const slider = screen.getByRole('slider', { name: 'arrivals, as a slider' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '20');
    expect(slider).toHaveAttribute('step', '1');
    expect(screen.getByRole('spinbutton', { name: 'arrivals (items/s)' })).toHaveValue(6);
    expect(screen.getByRole('checkbox', { name: 'bursts' })).not.toBeChecked();
    const policy = screen.getByRole('combobox', { name: 'policy' });
    expect(
      within(policy)
        .getAllByRole('option')
        .map((each) => each.textContent),
    ).toEqual(['fifo', 'priority']);
    // A number typed out of its range is refused, and says why.
    const field = screen.getByRole('spinbutton', { name: 'workers' });
    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The parameter "workers" is above its highest, 8.',
    );
    expect(state.store.get('api')?.parameters.workers).toBe(4);
  });

  it('plays the run again up to the tick shown when a parameter changes', () => {
    const state = show();
    openIt(state);
    fireEvent.click(screen.getByRole('button', { name: 'Forward a tick' }));
    state.work();
    fireEvent.click(screen.getByRole('button', { name: 'Forward a tick' }));
    state.work();
    expect(state.store.get('api')?.shown).toBe(2);
    expect(state.section()).toHaveTextContent('queue6 items');
    fireEvent.change(screen.getByRole('slider', { name: 'arrivals, as a slider' }), {
      target: { value: '8' },
    });
    state.work();
    expect(state.store.get('api')).toMatchObject({ shown: 2 });
    expect(state.store.get('api')?.parameters.arrivals).toBe(8);
    // 4 more a tick, three ticks: the same moment under the new value.
    expect(state.section()).toHaveTextContent('queue12 items');
    fireEvent.click(screen.getByRole('checkbox', { name: 'bursts' }));
    expect(state.store.get('api')?.parameters.bursts).toBe(true);
  });

  it('plays, pauses, goes back and forward, runs from here and resets', () => {
    const state = show();
    openIt(state);
    expect(screen.getByRole('button', { name: 'Back a tick' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    state.work();
    expect(state.store.get('api')?.playing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(state.store.get('api')?.playing).toBe(false);
    act(() => state.store.goTo('api', 5));
    fireEvent.click(screen.getByRole('button', { name: 'Back a tick' }));
    expect(state.store.get('api')?.shown).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'Run from here' }));
    state.work();
    expect(state.store.get('api')).toMatchObject({ playing: true, shown: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    state.work();
    expect(state.store.get('api')).toMatchObject({ playing: false, shown: 0 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Speed' }), { target: { value: 'max' } });
    expect(state.store.get('api')?.speed).toBe('max');
    expect(
      within(screen.getByRole('combobox', { name: 'Speed' }))
        .getAllByRole('option')
        .map((each) => each.textContent),
    ).toEqual([
      '1 tick a second',
      '5 ticks a second',
      '20 ticks a second',
      '60 ticks a second',
      'As fast as it goes',
    ]);
  });

  it('changes the seed, and draws a new one', () => {
    const state = show();
    openIt(state);
    const seed = screen.getByRole('spinbutton', { name: 'Seed' });
    fireEvent.change(seed, { target: { value: '42' } });
    fireEvent.keyDown(seed, { key: 'Enter' });
    expect(state.store.get('api')?.seed).toBe(42);
    fireEvent.click(screen.getByRole('button', { name: 'New seed' }));
    expect(state.store.get('api')?.seed).not.toBe(42);
  });

  it('shows each value marked ∿ with its limits, and where it reads in place of an attribute', () => {
    const state = show();
    openIt(state);
    const values = screen.getByRole('list', { name: 'Simulated values' });
    const rows = within(values).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('queue2 items∿');
    expect(rows[0]).toHaveTextContent('Limits: from 0 items to 50 items');
    expect(rows[1]).toHaveTextContent('Limit: at least 0 ms');
    expect(rows[1]).toHaveTextContent('Shown on the canvas in place of the attribute “latency”.');
    expect(rows[2]).toHaveTextContent('One of: calm, busy');
    expect(within(rows[0]!).getByTitle('Simulated by the code of “Test”, and never saved.')).toBe(
      within(rows[0]!).getByText('∿').parentElement,
    );
  });

  it('charts each number, and its chart goes to a tick by key and by click', () => {
    const state = show();
    openIt(state);
    act(() => state.store.forward('api'));
    state.work();
    act(() => state.store.forward('api'));
    state.work();
    act(() => state.store.forward('api'));
    state.work();
    const chart = screen.getByRole('slider', { name: 'Chart of “queue”: the tick shown' });
    expect(chart).toHaveAttribute('aria-valuenow', '3');
    expect(chart).toHaveAttribute('aria-valuetext', 'tick 3, at 6 s: 8 items');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(state.store.get('api')?.shown).toBe(0);
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(state.store.get('api')?.shown).toBe(1);
    // The worker worked ahead: the chart reaches the last tick held.
    const last = (state.store.get('api')?.ticks.length ?? 0) - 1;
    expect(chart).toHaveAttribute('aria-valuemax', String(last));
    fireEvent.keyDown(chart, { key: 'End' });
    expect(state.store.get('api')?.shown).toBe(last);
    chart.getBoundingClientRect = () => ({ left: 10, width: 300 }) as DOMRect;
    fireEvent.click(chart, { clientX: 10 + 300 / last });
    expect(state.store.get('api')?.shown).toBe(1);
    expect(screen.getAllByRole('slider', { name: /^Chart of/ })).toHaveLength(2);
  });

  it('says why it stopped, at which tick, past which limit', () => {
    const state = show();
    openIt(state);
    fireEvent.change(screen.getByRole('slider', { name: 'arrivals, as a slider' }), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'workers' }), {
      target: { value: '1' },
    });
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'workers' }), { key: 'Enter' });
    state.work();
    act(() => state.store.play('api', 'max'));
    state.work();
    act(() => state.store.frame(1));
    expect(state.section()).toHaveTextContent(
      'At tick 2, “queue” went above its highest limit, 50 items: it was 57 items. The ticks before it are kept.',
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Forward a tick' })).toBeDisabled();
  });

  it('says why it cannot run, and points at the package’s approval', () => {
    const state = show({ unavailable: { test: 'not-approved' } });
    openIt(state);
    expect(state.section()).toHaveTextContent(
      'The code of “Test” is not approved, so it cannot simulate. Review it to approve it.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review the code of “Test”…' }));
    expect(state.review).toHaveBeenCalledWith('test');
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('says why it cannot run over the model changing, when code turned off ends the run', () => {
    const state = show();
    openIt(state);
    // As the worker says it: the run ends as the model changing, then cannot go on.
    const worker = state.worker as unknown as { deliver(replies: SimulationReply[]): void };
    act(() =>
      worker.deliver([
        {
          kind: 'simulation/ticks',
          element: 'api',
          from: 1,
          ticks: [],
          planned: 20,
          stop: { kind: 'changed', tick: 1 },
        },
        { kind: 'simulation/unavailable', element: 'api', reason: 'off' },
      ]),
    );
    expect(state.section()).toHaveTextContent('The code of “Test” is turned off');
    expect(state.section()).not.toHaveTextContent('The model changed');
  });

  it('closes the run', () => {
    const state = show();
    openIt(state);
    fireEvent.click(screen.getByRole('button', { name: 'Close the simulation' }));
    expect(state.store.get('api')).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Open the simulation' })).toBeInTheDocument();
  });

  it('speaks Spanish', () => {
    setCurrentLanguage('es');
    const state = show();
    expect(screen.getByRole('region', { name: 'Simulación' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir la simulación' }));
    state.work();
    expect(screen.getByRole('button', { name: 'Un tic adelante' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Simulación' })).toHaveTextContent(
      'Tic 0 de 19, a los 0 s',
    );
  });
});
