import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Shell } from '../../shell/Shell';
import { comparedSample, done } from '../../test/comparison';
import { ComparisonStore } from './mode';

vi.mock('../CanvasArea', () => import('../../test/FakeCanvasArea'));

const MODEL_PANEL = 'Outline and model';

function showing(store: ComparisonStore, onEnd = vi.fn()) {
  const { older, newer, comparison } = comparedSample();
  const view = render(<Shell project={newer} comparisons={store} />);
  act(() => {
    store.showComparison({ older, newer, comparison, title: 'Compared with HEAD', onEnd });
  });
  return { ...view, older, newer, onEnd };
}

describe('the comparison mode in the shell', () => {
  it('draws the comparison read-only, with its bar, its legend and the Changes tab', () => {
    const store = new ComparisonStore();
    showing(store);
    const canvas = screen.getByRole('application');
    expect(canvas).toHaveAccessibleName(/Compared with HEAD: “System overview”, Comparison\./);
    // Read-only: the canvas offers no edit.
    expect(screen.queryByRole('button', { name: 'Edit on the canvas' })).toBeNull();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'Compared with HEAD' })).toBeVisible();
    const legend = screen.getByText('Legend of the comparison').closest('details') as HTMLElement;
    expect(within(legend).getByText('Removed')).toBeInTheDocument();
    const panel = screen.getByRole('complementary', { name: MODEL_PANEL });
    expect(within(panel).getByRole('tab', { name: 'Changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const list = within(panel).getByRole('tree');
    expect(within(list).getByText('Elements')).toBeInTheDocument();
    expect(within(list).getByText('WhatsApp Business')).toBeInTheDocument();
  });

  it('switches between before, after and the comparison', () => {
    const store = new ComparisonStore();
    showing(store);
    fireEvent.click(screen.getByRole('radio', { name: 'Before' }));
    expect(screen.getByRole('application')).toHaveAccessibleName(/, Before\./);
    expect(store.get()?.drawing).toBe('before');
  });

  it('goes to the next change with ] and says what it is', () => {
    const store = new ComparisonStore();
    showing(store);
    fireEvent.keyDown(document.body, { key: ']' });
    expect(document.body.textContent).toMatch(/Change 1 of \d+\./);
  });

  it('follows the project through every action', () => {
    const store = new ComparisonStore();
    const { rerender, newer } = showing(store);
    const later = done(newer, { type: 'delete', elements: ['sms'] });
    rerender(<Shell project={later} comparisons={store} />);
    expect(store.get()?.newer).toBe(later);
    const list = screen.getByRole('tree');
    expect(within(list).queryByText('SMS channel')).toBeNull();
  });

  it('ends with Escape, and the Changes tab goes with it', () => {
    const store = new ComparisonStore();
    const { onEnd } = showing(store);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(store.get()).toBeUndefined();
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull();
    expect(screen.getByRole('application')).not.toHaveAccessibleName(/Compared/);
  });
});
