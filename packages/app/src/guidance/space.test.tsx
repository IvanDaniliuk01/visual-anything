/**
 * Claude's guidance `space` (ADR 0076): it opens the physical-space panel, or keeps it open, showing
 * the element it names, moves its camera or frames elements, and closes it; in the view it names,
 * which the tab the person used last opens first, and in no other tab.
 */
import type { SpaceCamera } from '@visual-anything/schema';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { SpacePanelStore } from '../space/store';
import { fakeLive } from '../test/fakeLive';
import { workcell } from '../test/space';
import type { GuidanceState } from './state';
import { setTabUseForTests, trackTabUse, type TabUse } from './tabs';
import { applyGuidedSpace } from './useGuidedSpace';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

afterEach(() => setTabUseForTests(trackTabUse({ channel: undefined, shown: true })));

const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

const VIEW = 'cell-view';
const CAMERA: SpaceCamera = {
  target: { x: 0, y: 1, z: 0 },
  azimuth: 45,
  elevation: 20,
  distance: 3,
};

/** The workcell with a second view, opened first. */
function twoViews() {
  const project = workcell();
  const [view] = project.views;
  if (!view) throw new Error('The workcell has a view.');
  return { ...project, views: [{ ...view, id: 'other', name: 'Other' }, view] };
}

function renderShell(guidance: GuidanceState, project = workcell()) {
  const tree = (next: GuidanceState) => (
    <LiveContext value={fakeLive({ project, guidance: next })}>
      <Shell project={project} />
    </LiveContext>
  );
  const shown = render(tree(guidance));
  return { rerender: (next: GuidanceState) => act(() => shown.rerender(tree(next))) };
}

const panel = () => screen.queryByRole('region', { name: 'Physical space' });

describe('Claude’s guidance space in the shell', () => {
  it('opens the panel on the element it names, and closes it', () => {
    const shell = renderShell({ space: { root: 'arm', request: 1 } });
    expect(panel()).toHaveTextContent('Shows “Arm”');
    shell.rerender({ space: { close: true, request: 2 } });
    expect(panel()).toBeNull();
  });

  it('opens the view it names first, and the panel there', () => {
    renderShell({ space: { view: VIEW, request: 1 } }, twoViews());
    expect(within(screen.getByRole('banner')).getByText('Cell')).toBeInTheDocument();
    expect(panel()).toHaveTextContent('Shows “World”');
  });

  it('does nothing in a tab the person did not use last, for another view', () => {
    setTabUseForTests(usedElsewhere);
    renderShell({ space: { view: VIEW, request: 1 } }, twoViews());
    expect(within(screen.getByRole('banner')).getByText('Other')).toBeInTheDocument();
    expect(panel()).toBeNull();
  });
});

describe('what guidance space does to a view’s panel', () => {
  function store() {
    return new SpacePanelStore({
      frames: { request: () => 0, cancel: () => undefined },
      windowWidth: () => 1600,
    });
  }
  const project = workcell();

  it('keeps what the panel showed when it names nothing, and opens it when it was closed', () => {
    const panel = store();
    panel.setChooser(() => ({ root: 'arm' }));
    applyGuidedSpace(panel, project, VIEW, { request: 1 }, false);
    expect(panel.state(VIEW)).toEqual({ root: 'arm' });
    const shown = { root: 'arm', camera: CAMERA };
    panel.set(VIEW, shown);
    applyGuidedSpace(panel, project, VIEW, { root: 'arm', request: 2 }, false);
    expect(panel.state(VIEW)).toBe(shown);
    applyGuidedSpace(panel, project, VIEW, { root: 'world', request: 3 }, false);
    expect(panel.state(VIEW)).toEqual({});
  });

  it('moves the camera, cut from no camera, or asks the panel to frame elements', () => {
    const panel = store();
    applyGuidedSpace(panel, project, VIEW, { camera: CAMERA, request: 1 }, false);
    expect(panel.state(VIEW)).toEqual({ camera: CAMERA });
    applyGuidedSpace(panel, project, VIEW, { frame: ['camera', 'arm'], request: 2 }, false);
    expect(panel.framing(VIEW)?.elements).toEqual(['camera', 'arm']);
  });

  it('passes over a root that is not an element', () => {
    const panel = store();
    panel.set(VIEW, { root: 'arm' });
    applyGuidedSpace(panel, project, VIEW, { root: 'ghost', request: 1 }, false);
    expect(panel.state(VIEW)).toEqual({ root: 'arm' });
  });
});
