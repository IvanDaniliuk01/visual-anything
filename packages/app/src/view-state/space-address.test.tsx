/**
 * The physical-space panel in view addresses, Copy address and tours (ADR 0076): an address's
 * `space=` opens the panel as it says, and one without it closes the panel; the tab's address follows
 * the panel opening and closing; Copy address copies it; a tour step records it and, played full
 * screen, shows the panel beside the canvas.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { SPACE_PANEL_OPEN } from '../space/store';
import { fakeLive } from '../test/fakeLive';
import { workcell } from '../test/space';
import type { GuidanceState } from '../guidance/state';
import { stepOf } from '../tours/commands';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

const VIEW = 'cell-view';
const panel = () => screen.queryByRole('region', { name: 'Physical space' });

function openAt(fragment: string, project: ProjectSnapshot = workcell(), guidance?: GuidanceState) {
  window.history.replaceState(null, '', `/${fragment}`);
  const tree = (next: GuidanceState | undefined) => (
    <LiveContext value={fakeLive({ project, ...(next ? { guidance: next } : {}) })}>
      <Shell project={project} />
    </LiveContext>
  );
  const shown = render(tree(guidance));
  return {
    container: shown.container,
    rerender: (next: GuidanceState) => act(() => shown.rerender(tree(next))),
  };
}

const pressSpaceKey = () =>
  act(() => {
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', altKey: true, shiftKey: true });
  });

describe('the physical-space panel in an address', () => {
  it('opens as the address’s space= says, and stays in the address', async () => {
    openAt(`#view=${VIEW}&space=root:arm;names`);
    expect(panel()).toHaveTextContent('Shows “Arm”');
    await waitFor(() => expect(window.location.hash).toBe(`#view=${VIEW}&space=root:arm;names`));
  });

  it('is followed by the tab’s address as it opens and closes', async () => {
    openAt(`#view=${VIEW}`);
    pressSpaceKey();
    await waitFor(() => expect(window.location.hash).toBe(`#view=${VIEW}&space=open`));
    pressSpaceKey();
    await waitFor(() => expect(window.location.hash).toBe(`#view=${VIEW}`));
  });

  it('closes when an address brought to the tab has none', async () => {
    openAt(`#view=${VIEW}&space=open`);
    expect(panel()).not.toBeNull();
    act(() => {
      window.history.replaceState(null, '', `/#view=${VIEW}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('is copied by Copy address', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    openAt(`#view=${VIEW}&space=root:arm`);
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/#view=${VIEW}&space=root:arm`,
      ),
    );
  });
});

describe('the physical-space panel in a tour', () => {
  const tour: TourFile = {
    id: 'cell-tour',
    name: 'The cell',
    steps: [
      {
        id: 'beside',
        viewState: { view: VIEW, space: { root: 'arm' } },
        caption: { title: 'The arm, where it is' },
      },
      { id: 'canvas', viewState: { view: VIEW }, caption: { title: 'The canvas alone' } },
    ],
  };

  it('records the panel in a step made from the canvas as it is now', () => {
    const camera = { target: { x: 0, y: 1, z: 0 }, azimuth: 30, elevation: 20, distance: 3 };
    expect(stepOf({ view: VIEW, space: { root: 'arm', camera } }, 'Cell').viewState).toEqual({
      view: VIEW,
      space: { root: 'arm', camera },
    });
  });

  it('shows the panel beside the canvas while a step opens it, and gives it back as it was', async () => {
    const project = { ...workcell(), tours: [tour] };
    const shell = openAt(`#view=${VIEW}`, project);
    const element = shell.container.querySelector<HTMLElement>('.shell');
    shell.rerender({ tour: { tour: tour.id, request: 1 } });
    await waitFor(() => expect(element).toHaveClass('tour-playing'));
    await waitFor(() => expect(panel()).toHaveTextContent('Shows “Arm”'));
    expect(element?.hasAttribute(SPACE_PANEL_OPEN)).toBe(true);
    // The next step shows the canvas alone.
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    await waitFor(() => expect(panel()).toBeNull());
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(element).not.toHaveClass('tour-playing'));
    expect(panel()).toBeNull();
  });
});
