import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();

describe('the model panel’s History tab', () => {
  it('shows the history panel, after the components and before the tours', () => {
    const live = fakeLive({
      actions: [
        {
          id: 1,
          label: 'Create "Booking agent"',
          author: 'claude',
          time: Date.now(),
          undone: false,
        },
      ],
    });
    render(
      <LiveContext value={live}>
        <Shell project={sample} />
      </LiveContext>,
    );
    const panel = screen.getByRole('complementary', { name: 'Outline and model' });

    expect(
      within(panel)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Outline', 'Model', 'Components', 'History', 'Tours']);
    fireEvent.click(within(panel).getByRole('tab', { name: 'History' }));
    const history = within(panel).getByRole('tabpanel', { name: 'History' });
    expect(within(history).getByRole('listitem')).toHaveTextContent('Create "Booking agent"');
    expect(within(history).getByRole('listitem')).toHaveTextContent('Claude');
  });
});
