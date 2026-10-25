import type { ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext, type Live } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

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
/** The sample with a second view, which opens first. */
const project: ProjectSnapshot = {
  ...sample,
  views: [{ ...overview, id: 'ownership', name: 'Ownership', positions: [] }, overview],
};

afterEach(() => {
  vi.useRealTimers();
});

/** Opens the shell on the project with the tab's address holding this fragment. */
function openAt(fragment: string, live: Live = fakeLive({ project })) {
  window.history.replaceState(null, '', `/${fragment}`);
  render(
    <LiveContext value={live}>
      <Shell project={project} />
    </LiveContext>,
  );
  return live;
}

const openViewName = () => within(screen.getByRole('banner')).getByText(/overview|Ownership/);
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
const strip = () => screen.queryByRole('group', { name: 'Exploring' });
const scenarioPanel = () => screen.getByRole('complementary', { name: 'Scenarios' });

describe('opening an address', () => {
  it('opens its view, selects what it names and filters as it says', () => {
    openAt('#view=system-overview&select=appointments-api&filters=components:systems.person');
    expect(openViewName()).toHaveTextContent('System overview');
    expect(within(inspector()).getAllByText('Appointments API').length).toBeGreaterThan(0);
    expect(strip()).toHaveTextContent('The filters hide 1 element shape');
  });

  it('turns focus on from what it names, and opens the scenario at its step', () => {
    openAt(
      '#view=system-overview&focus=2,outgoing,isolate;from:booking-agent&scenario=patient-books-appointment&step=find-slots',
    );
    const exploring = strip() as HTMLElement;
    expect(exploring).toHaveTextContent('Focus on “Booking agent”');
    expect(within(exploring).getByLabelText('Degrees')).toHaveValue('2');
    expect(within(exploring).getByRole('checkbox', { name: 'Isolate' })).toBeChecked();
    const current = within(scenarioPanel())
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent(/^3/);
  });

  it('says what it cannot read, and opens the project as it is', () => {
    const live = openAt('#view=system-overview&zoom=3');
    expect(openViewName()).toHaveTextContent('Ownership');
    expect(live.notify).toHaveBeenCalledWith(
      'warning',
      'This address’s view state could not be read: The address holds "zoom", which a view state does not have.',
    );
  });

  it('says what it names that the project does not hold', () => {
    const live = openAt('#view=system-overview&select=ghost');
    expect(openViewName()).toHaveTextContent('System overview');
    expect(live.notify).toHaveBeenCalledWith(
      'warning',
      'Part of this address could not be shown: Nothing in the view "System overview" has the id "ghost".',
    );
  });

  it('applies an address the person brings to the tab later', () => {
    openAt('');
    expect(openViewName()).toHaveTextContent('Ownership');
    act(() => {
      window.history.replaceState(null, '', '/#view=system-overview&select=patient');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(openViewName()).toHaveTextContent('System overview');
    expect(within(inspector()).getAllByText('Patient').length).toBeGreaterThan(0);
  });
});

describe('the address', () => {
  it('follows the view state, replacing the history entry, and never holds a token', async () => {
    const length = window.history.length;
    openAt('');
    await waitFor(() => expect(window.location.hash).toBe('#view=ownership'));
    fireEvent.click(screen.getByRole('tab', { name: 'Model' }));
    const views = within(screen.getByRole('tabpanel', { name: 'Model' })).getByRole('list', {
      name: 'Views',
    });
    fireEvent.click(within(views).getByRole('button', { name: 'System overview, Data flow' }));
    await waitFor(() => expect(window.location.hash).toBe('#view=system-overview'));
    expect(window.history.length).toBe(length);
    expect(window.location.hash).not.toMatch(/token|launch/);
  });

  it('is copied, with what the view shows now', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    openAt('#view=system-overview&select=patient');
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/#view=system-overview&select=patient`,
    );
    expect(await screen.findByText('Address copied.')).toBeInTheDocument();
  });

  it('is shown in a notice when the browser will not copy it', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Denied')) },
      configurable: true,
    });
    const live = openAt('#view=system-overview');
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() =>
      expect(live.notify).toHaveBeenCalledWith(
        'warning',
        `Could not copy the address, so here it is to copy by hand: ${window.location.origin}/#view=system-overview`,
      ),
    );
  });
});
