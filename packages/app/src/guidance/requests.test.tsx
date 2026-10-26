import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import type { GuidanceState, GuidedFilters } from './state';

// The fake canvas area, with the explore strip the real one shows under its toolbar.
vi.mock('../canvas/CanvasArea', async () => {
  const fake = await import('../test/FakeCanvasArea');
  const { ExploreStrip } = await import('../canvas/ExploreBar');
  return {
    CanvasArea: (props: Parameters<typeof fake.CanvasArea>[0]) => (
      <>
        <fake.CanvasArea {...props} />
        <ExploreStrip />
      </>
    ),
  };
});

const sample = loadSample();
const overview = sample.views[0] as ProjectSnapshot['views'][number];
const SCENARIO = 'patient-books-appointment';

/** The sample with a second view, opened first unless `overviewFirst`. */
function projectWith(overviewFirst: boolean): ProjectSnapshot {
  const second = { ...overview, id: 'ownership', name: 'Ownership', positions: [] };
  return { ...sample, views: overviewFirst ? [overview, second] : [second, overview] };
}

const PEOPLE: GuidedFilters = {
  components: ['systems.person'],
  relationTypes: [],
  conditions: [],
};

/** The shell over a project, with Claude's guidance as the live session has it. */
function renderShell(guidance: GuidanceState, project = projectWith(true)) {
  const tree = (next: GuidanceState) => (
    <LiveContext value={fakeLive({ project, guidance: next })}>
      <Shell project={project} />
    </LiveContext>
  );
  const view = render(tree(guidance));
  return { rerender: (next: GuidanceState) => act(() => view.rerender(tree(next))) };
}

const strip = () => screen.queryByRole('group', { name: 'Exploring' });
const openViewName = () => within(screen.getByRole('banner')).getByText(/overview|Ownership/);

describe('Claude’s filters and focus', () => {
  it('filter the open view as the person’s would, until the person shows everything', () => {
    const shell = renderShell({ filter: { filters: PEOPLE, request: 1 } });
    expect(strip()).toHaveTextContent('The filters hide 1 element shape');
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(strip()).toBeNull();
    // The same request does not come back once the person ended it.
    shell.rerender({ filter: { filters: PEOPLE, request: 1 }, caption: 'Here.' });
    expect(strip()).toBeNull();
  });

  it('turn focus mode on from Claude’s targets, with its reach, until the person ends it', () => {
    renderShell({
      focusView: {
        focus: { targets: ['booking-agent'], degrees: 2, direction: 'outgoing', isolate: true },
        request: 1,
      },
    });
    const exploring = strip() as HTMLElement;
    expect(exploring).toHaveTextContent('Focus on “Booking agent”');
    expect(within(exploring).getByLabelText('Degrees')).toHaveValue('2');
    expect(within(exploring).getByLabelText('Direction')).toHaveValue('outgoing');
    expect(within(exploring).getByRole('checkbox', { name: 'Isolate' })).toBeChecked();
    fireEvent.click(within(exploring).getByRole('button', { name: 'End focus' }));
    expect(strip()).toBeNull();
  });

  it('open the view they name first, and apply there', () => {
    renderShell({ filter: { filters: PEOPLE, view: 'ownership', request: 1 } });
    expect(openViewName()).toHaveTextContent('Ownership');
    expect(strip()).toHaveTextContent('The filters hide 1 element shape');
  });

  it('end together when Claude clears them', () => {
    const shell = renderShell({
      filter: { filters: PEOPLE, request: 1 },
      focusView: {
        focus: { targets: ['booking-agent'], degrees: 1, direction: 'both', isolate: false },
        request: 2,
      },
    });
    expect(strip()).toHaveTextContent('Focus on “Booking agent”');
    const none: GuidedFilters = { components: [], relationTypes: [], conditions: [] };
    shell.rerender({ filter: { filters: none, request: 3 }, focusView: { request: 3 } });
    expect(strip()).toBeNull();
  });
});

describe('Claude’s layout', () => {
  it('opens the view it names first, where the canvas runs it', () => {
    renderShell({ layout: { view: 'ownership', request: 1 } });
    expect(openViewName()).toHaveTextContent('Ownership');
  });
});

describe('Claude’s playback', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Scenarios' });

  it('plays a scenario in the scenario panel, and the person pauses it there', () => {
    renderShell({ playback: { scenario: SCENARIO, action: 'play', request: 1 } });
    const pause = within(panel()).getByRole('button', { name: 'Pause' });
    fireEvent.click(pause);
    expect(within(panel()).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('opens the scenario’s view first', () => {
    renderShell(
      { playback: { scenario: SCENARIO, action: 'play', request: 1 } },
      projectWith(false),
    );
    expect(openViewName()).toHaveTextContent('System overview');
    expect(within(panel()).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('goes to the step Claude names', () => {
    renderShell({ playback: { scenario: SCENARIO, action: 'go-to-step', step: 2, request: 1 } });
    const current = within(panel())
      .getAllByRole('listitem')
      .find((item) => {
        return item.getAttribute('aria-current') === 'step';
      });
    expect(current).toHaveTextContent(/^3/);
  });

  it('ignores a scenario the project does not have', () => {
    renderShell({ playback: { scenario: 'nothing', action: 'open', request: 1 } });
    expect(within(panel()).getByRole('list', { name: 'Scenarios of the project' })).toBeVisible();
  });
});

describe('Claude’s tour', () => {
  const TOUR = 'how-booking-works';
  const shellOf = () => document.querySelector('.shell');

  it('plays full screen from the step Claude names, with the tour’s own playback, until Escape', () => {
    const shell = renderShell({ tour: { tour: TOUR, step: 1, request: 1 } });
    expect(shellOf()).toHaveClass('tour-playing');
    expect(screen.getByRole('article')).toHaveTextContent('The booking agent');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 3');
    // The person moves through it by keys, as through any tour.
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('article')).toHaveTextContent('One request, step by step');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('article')).toBeNull();
    expect(shellOf()).not.toHaveClass('tour-playing');
    // The same request does not start it again once the person ended it.
    shell.rerender({ tour: { tour: TOUR, step: 1, request: 1 }, caption: 'Here.' });
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('plays from the first step when Claude names none, and again on a new request', () => {
    const shell = renderShell({ tour: { tour: TOUR, request: 1 } });
    expect(screen.getByRole('article')).toHaveTextContent('Clinic booking');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    shell.rerender({ tour: { tour: TOUR, step: 2, request: 2 } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 3 of 3');
  });

  it('ignores a tour the project does not have', () => {
    renderShell({ tour: { tour: 'nothing', request: 1 } });
    expect(shellOf()).not.toHaveClass('tour-playing');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
