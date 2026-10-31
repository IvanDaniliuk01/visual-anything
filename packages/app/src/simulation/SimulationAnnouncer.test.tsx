/** A run's stop, said to a screen reader once the run shows it (ADR 0085). */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { simulationHarness } from '../test/simulation';
import { SimulationAnnouncer } from './SimulationAnnouncer';

describe('the simulation announcer', () => {
  it('says a stop once the run shows its last tick', () => {
    const { project, worker, store, simulation } = simulationHarness();
    const { container } = render(<SimulationAnnouncer store={store} project={project} />);
    const status = container.querySelector('[aria-live]') as HTMLElement;
    act(() => {
      store.open('api', simulation, { parameters: { arrivals: 12, workers: 1 } });
      worker.work();
      store.forward('api');
      worker.work();
    });
    // The worker worked out the stop ahead of the tick shown: nothing is said yet.
    expect(store.get('api')).toMatchObject({ shown: 1, stop: { kind: 'limit', tick: 4 } });
    expect(status).toHaveTextContent('');
    act(() => store.goTo('api', 3));
    expect(status).toHaveTextContent(
      'The simulation of “API” stopped. At tick 4, “queue” went above its highest limit, 50 items: it was 55 items. The ticks before it are kept.',
    );
    // Another run's stop is said in its place.
    act(() => {
      store.close('api');
      store.open('client', simulation, { tick: 1 });
      worker.work();
    });
    expect(status).toHaveTextContent('The simulation of “Client” stopped. At tick 0, the code');
  });

  it('says why a run cannot run as soon as it cannot', () => {
    const { project, worker, store, simulation } = simulationHarness(undefined, {
      unavailable: { test: 'off' },
    });
    const { container } = render(<SimulationAnnouncer store={store} project={project} />);
    act(() => {
      store.open('api', simulation);
      worker.work();
    });
    expect(container.querySelector('[aria-live]')).toHaveTextContent(
      'The simulation of “API” stopped. The code of “Test” is turned off',
    );
  });
});
