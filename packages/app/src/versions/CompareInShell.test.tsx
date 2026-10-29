/**
 * Compare with… in the shell (ADR 0070): from the header, a version chosen opens the comparison mode
 * and the Changes tab on it, and the Export dialog offers its drawings and its summary while it shows.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ListedVersion } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { ComparedResult } from '../live/connection';
import { LiveContext, type Live } from '../live/context';
import { Shell } from '../shell/Shell';
import { comparedSample } from '../test/comparison';
import { fakeLive } from '../test/fakeLive';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const MODEL_PANEL = 'Outline and model';

const MAIN: ListedVersion = {
  kind: 'branch',
  name: 'main',
  commit: 'a'.repeat(40),
  short: 'aaaaaaa',
  subject: 'Add the SMS channel',
  author: 'Ana',
  time: Date.UTC(2026, 9, 28, 10, 0),
};

function setup() {
  const { older, newer, comparison } = comparedSample();
  const live = fakeLive({
    project: newer,
    listVersions: vi.fn<NonNullable<Live['listVersions']>>(() =>
      Promise.resolve({
        ok: true,
        answer: { type: 'versions/listed', requestId: 'request-1', versions: [MAIN] },
      }),
    ),
    compareVersion: vi.fn<NonNullable<Live['compareVersion']>>(() =>
      Promise.resolve<ComparedResult>({
        ok: true,
        version: { kind: 'commit', commit: MAIN.commit },
        older,
        newer,
        comparison,
      }),
    ),
  });
  render(
    <LiveContext value={live}>
      <Shell project={newer} />
    </LiveContext>,
  );
  return { live };
}

async function compareWithMain(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Compare with…' }));
  const dialog = screen.getByRole('dialog', { name: 'Compare with…' });
  const main = await within(dialog).findByText('main');
  await act(async () => {
    fireEvent.click(main);
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('Compare with… in the shell', () => {
  it('opens the comparison mode and the Changes tab on the version chosen', async () => {
    setup();
    await compareWithMain();

    expect(screen.getByRole('application')).toHaveAccessibleName(
      /Compared with main \(aaaaaaa\): “System overview”, Comparison\./,
    );
    const panel = screen.getByRole('complementary', { name: MODEL_PANEL });
    expect(within(panel).getByRole('tab', { name: 'Changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(panel).getByText('WhatsApp Business')).toBeInTheDocument();
  });

  it('offers the comparison’s drawings and its summary in the Export dialog while it shows', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    expect(
      within(screen.getByRole('dialog')).queryByRole('group', { name: /Compared with/ }),
    ).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await compareWithMain();
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
    const dialog = screen.getByRole('dialog');
    const group = within(dialog).getByRole('group', { name: 'Compared with main (aaaaaaa)' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.querySelector('.export-choice-name')?.textContent),
    ).toEqual([
      'Before, as SVG',
      'Before, as PDF',
      'After, as SVG',
      'After, as PDF',
      'Comparison, as SVG',
      'Comparison, as PDF',
      'Summary of the changes, in Markdown',
    ]);
    fireEvent.click(within(group).getByRole('radio', { name: /^Summary of the changes/ }));
    expect(within(dialog).getByRole('button', { name: 'Save MD' })).toBeInTheDocument();
  });
});
