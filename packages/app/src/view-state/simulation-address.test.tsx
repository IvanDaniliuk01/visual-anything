/**
 * Simulations in view addresses, Copy address and guidance (ADR 0085): an address's `simulation=`
 * opens the element's run with its parameters, seed and tick; one its simulation refuses is said
 * like other view-state problems; the tab's address follows the run shown; an address without one
 * closes it; and guidance opens and closes it as the person would. Without a code worker, as here,
 * the run says why it cannot run, which changes none of that.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidanceState } from '../guidance/state';
import { LiveContext, type Live } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { simulatingProject } from '../test/simulation';
import { viewStateOf } from './state';
import { EMPTY_SELECTION } from '../editor/selection';
import { NO_FILTERS } from '../canvas/explore';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

const section = () => screen.queryByRole('region', { name: 'Simulation' });

function openAt(fragment: string, project: ProjectSnapshot = simulatingProject()) {
  window.history.replaceState(null, '', `/${fragment}`);
  let live: Live = fakeLive({ project });
  const tree = (guidance?: GuidanceState) => {
    live = fakeLive({ project, ...(guidance ? { guidance } : {}), notify: live.notify });
    return (
      <LiveContext value={live}>
        <Shell project={project} />
      </LiveContext>
    );
  };
  const shown = render(tree());
  return {
    live: () => live,
    rerender: (guidance: GuidanceState) => act(() => shown.rerender(tree(guidance))),
  };
}

describe('a simulation in an address', () => {
  it('opens the run as simulation= says, and stays in the address', async () => {
    const fragment = '#view=overview&select=api&simulation=api;seed:3;tick:2;p:arrivals,9';
    openAt(fragment);
    expect(section()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the simulation' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'arrivals, as a slider' })).toHaveValue('9');
    expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(3);
    await waitFor(() => expect(window.location.hash).toBe(fragment));
  });

  it('says what its simulation refuses, as other view-state problems', () => {
    const { live } = openAt('#view=overview&select=api&simulation=api;p:arrivals,99');
    expect(live().notify).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('The parameter "arrivals" is above its highest, 20.'),
    );
    expect(screen.getByRole('button', { name: 'Open the simulation' })).toBeInTheDocument();
  });

  it('is followed by the tab’s address as the run opens, and closes with an address without one', async () => {
    openAt('#view=overview&select=api');
    fireEvent.click(screen.getByRole('button', { name: 'Open the simulation' }));
    const seed = screen.getByRole('spinbutton', { name: 'Seed' });
    fireEvent.change(seed, { target: { value: '5' } });
    fireEvent.keyDown(seed, { key: 'Enter' });
    await waitFor(() =>
      expect(window.location.hash).toBe('#view=overview&select=api&simulation=api;seed:5'),
    );
    act(() => {
      window.history.replaceState(null, '', '/#view=overview&select=api');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open the simulation' })).toBeInTheDocument(),
    );
  });

  it('is opened, played and closed by guidance', () => {
    const { rerender } = openAt('#view=overview');
    expect(section()).toBeNull();
    rerender({ simulation: { element: 'api', seed: 4, speed: 20, request: 1 } });
    expect(section()).not.toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(4);
    expect(screen.getByRole('combobox', { name: 'Speed' })).toHaveValue('20');
    rerender({ simulation: { close: true, request: 2 } });
    expect(screen.getByRole('button', { name: 'Open the simulation' })).toBeInTheDocument();
  });
});

describe('the view state of a simulation', () => {
  it('carries the simulation shown, and leaves out what the core refuses', () => {
    const project = simulatingProject();
    const base = {
      project,
      viewId: 'overview',
      selection: EMPTY_SELECTION,
      filters: NO_FILTERS,
      focus: {
        on: false,
        targets: { elements: new Set<string>(), relations: new Set<string>() },
        degrees: 1,
        direction: 'both',
        isolate: false,
      },
    } as unknown as Parameters<typeof viewStateOf>[0];
    expect(
      viewStateOf({ ...base, simulation: { element: 'api', seed: 2, tick: 4 } }).state.simulation,
    ).toEqual({ element: 'api', seed: 2, tick: 4 });
    expect(
      viewStateOf({ ...base, simulation: { element: 'api', tick: 1e9 } }).state.simulation,
    ).toBeUndefined();
  });
});
