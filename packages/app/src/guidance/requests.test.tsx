import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import type { GuidanceState, GuidedFilters } from './state';
import { setTabUseForTests, trackTabUse, type TabUse } from './tabs';

/** Another tab of the browser was used after this one. */
const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

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

describe('guidance in a tab the person did not use last', () => {
  it('opens no other view, applies nothing there, and plays no tour', () => {
    setTabUseForTests(usedElsewhere);
    renderShell({
      layout: { view: 'ownership', request: 1 },
      filter: { filters: PEOPLE, view: 'ownership', request: 1 },
      tour: { tour: 'how-booking-works', request: 1 },
    });
    expect(openViewName()).toHaveTextContent('System overview');
    expect(strip()).toBeNull();
    expect(document.querySelector('.shell')).not.toHaveClass('tour-playing');
  });

  it('still applies what is for the view it shows', () => {
    setTabUseForTests(usedElsewhere);
    renderShell({ filter: { filters: PEOPLE, request: 1 } });
    expect(strip()).toHaveTextContent('The filters hide 1 element shape');
  });

  it('plays no scenario over another view', () => {
    setTabUseForTests(usedElsewhere);
    renderShell(
      { playback: { scenario: SCENARIO, action: 'play', request: 1 } },
      projectWith(false),
    );
    expect(openViewName()).toHaveTextContent('Ownership');
    const panel = screen.getByRole('complementary', { name: 'Scenarios' });
    expect(within(panel).queryByRole('button', { name: 'Pause' })).toBeNull();
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

  describe('at a decision (ADR 0078)', () => {
    const order = loadSample('order-process');
    const QUESTION = 'Is every item in stock?';
    const current = () =>
      panel().querySelector('[aria-current="step"] .scenario-step-head')?.textContent;

    it('chooses the alternative Claude names, opening the scenario first', () => {
      renderShell(
        {
          playback: {
            scenario: 'an-order',
            action: 'choose',
            decision: 'stock-check',
            alternative: 'out-of-stock',
            request: 1,
          },
        },
        order,
      );
      const alternatives = within(panel()).getByRole('list', { name: QUESTION });
      expect(within(alternatives).getByRole('button', { name: 'No' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('goes to a step with the choices Claude gives', () => {
      renderShell(
        {
          playback: {
            scenario: 'an-order',
            action: 'go-to-step',
            step: 9,
            choices: { 'stock-check': 'out-of-stock' },
            request: 1,
          },
        },
        order,
      );
      expect(current()).toMatch(/^10An item is out of stock/);
      const alternatives = within(panel()).getByRole('list', { name: QUESTION });
      expect(within(alternatives).getByRole('button', { name: 'No' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});

describe('Claude’s tour', () => {
  const TOUR = 'how-booking-works';
  const shellOf = () => document.querySelector('.shell');

  it('plays full screen from the step Claude names, with the tour’s own playback, until Escape', () => {
    const shell = renderShell({ tour: { tour: TOUR, step: 1, request: 1 } });
    expect(shellOf()).toHaveClass('tour-playing');
    expect(screen.getByRole('article')).toHaveTextContent('The booking agent');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 4');
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
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 3 of 4');
  });

  it('ignores a tour the project does not have', () => {
    renderShell({ tour: { tour: 'nothing', request: 1 } });
    expect(shellOf()).not.toHaveClass('tour-playing');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
