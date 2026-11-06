/**
 * The canvas area as a pane of a split view (ADR 0102): only the active pane lends its renderer and
 * capture, listens for the window's keys, shares its hover, expands in place for the outline, edits
 * routes for the inspector, takes Claude's guidance and speaks in live regions. Claude's guidance acts
 * once in the tab, so that a pane that becomes active later never acts on it again.
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverContext, HoverStore } from '../editor/hover';
import { EMPTY_SELECTION } from '../editor/selection';
import { ImageSource, ImageSourceContext } from '../export/source';
import type { GuidanceState } from '../guidance/state';
import { setTabUseForTests, trackTabUse, type TabUse } from '../guidance/tabs';
import { LiveContext, type Live } from '../live/context';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import { CanvasArea } from './CanvasArea';
import { inPlaceFor } from './layout/expand';
import { onRouteEditingRequest } from './routing/requests';
import { buildScene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

vi.mock('./routing/requests', async (importOriginal) => {
  const original = await importOriginal<typeof import('./routing/requests')>();
  return { ...original, onRouteEditingRequest: vi.fn(original.onRouteEditingRequest) };
});

const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

afterEach(() => {
  setTabUseForTests(trackTabUse({ channel: undefined, shown: true }));
  vi.mocked(onRouteEditingRequest).mockClear();
});

const project = loadSample();
const view = project.views[0]!;
const scene = buildScene(project, view.id);
const send = vi.fn(() => Promise.resolve({ ok: true, created: [], warnings: [] }));

/** One canvas of the sample's first view, active or not, under these providers. */
function pane(active: boolean): ReactNode {
  return (
    <CanvasArea
      project={project}
      view={view}
      scene={scene}
      label={view.name}
      selection={EMPTY_SELECTION}
      onSelect={() => undefined}
      onCommand={send}
      active={active}
    />
  );
}

function renderPane(active: boolean, live: Partial<Live> = {}) {
  const images = new ImageSource();
  const hovers = new HoverStore();
  const hovered = vi.spyOn(hovers, 'set');
  const shown = render(
    <LiveContext value={fakeLive({ project, ...live })}>
      <ImageSourceContext value={images}>
        <HoverContext value={hovers}>{pane(active)}</HoverContext>
      </ImageSourceContext>
    </LiveContext>,
  );
  return { ...shown, images, hovered };
}

describe('a canvas that is not the active pane', () => {
  it('lends nothing, listens for no window key, shares no hover and speaks in no live region', () => {
    const lendCapture = vi.fn(() => () => undefined);
    const { images, hovered, unmount } = renderPane(false, { lendCapture });
    expect(images.maker).toBeUndefined();
    expect(lendCapture).not.toHaveBeenCalled();
    expect(inPlaceFor(view.id)).toBeUndefined();
    expect(onRouteEditingRequest).not.toHaveBeenCalled();
    const key = new KeyboardEvent('keydown', { key: ']', ctrlKey: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(screen.getByRole('status', { name: 'Selection' })).toHaveAttribute('aria-live', 'off');
    unmount();
    expect(hovered).not.toHaveBeenCalledWith('canvas', expect.anything());
    expect(hovered).not.toHaveBeenCalledWith('canvas', undefined);
  });

  it('does all of it as the active pane', () => {
    const lendCapture = vi.fn(() => () => undefined);
    const { hovered, unmount } = renderPane(true, { lendCapture });
    expect(lendCapture).toHaveBeenCalled();
    expect(inPlaceFor(view.id)).toBeDefined();
    expect(onRouteEditingRequest).toHaveBeenCalled();
    const key = new KeyboardEvent('keydown', { key: ']', ctrlKey: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(screen.getByRole('status', { name: 'Selection' })).not.toHaveAttribute('aria-live');
    unmount();
    expect(hovered).toHaveBeenCalledWith('canvas', undefined);
  });

  it('takes none of Claude’s layout', () => {
    const answerLayout = vi.fn();
    renderPane(false, { guidance: { layout: { request: 1, answer: 'a' } }, answerLayout });
    expect(answerLayout).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Claude’s layout in a split view', () => {
  /** Two panes of the view, the first active, over a session with this guidance. */
  function twoPanes(guidance: GuidanceState) {
    const answerLayout = vi.fn();
    const tree = (active: 0 | 1) => (
      <LiveContext value={fakeLive({ project, guidance, answerLayout })}>
        <div key="a">{pane(active === 0)}</div>
        <div key="b">{pane(active === 1)}</div>
      </LiveContext>
    );
    const shown = render(tree(0));
    return { answerLayout, activateSecond: () => shown.rerender(tree(1)) };
  }

  it('runs once in the tab, not again in a pane that becomes active later', () => {
    send.mockClear();
    // Without the layout worker, as in tests, the layout is answered as one that cannot run.
    const { answerLayout, activateSecond } = twoPanes({
      layout: { view: view.id, request: 1, answer: 'a' },
    });
    expect(answerLayout).toHaveBeenCalledTimes(1);
    expect(answerLayout).toHaveBeenCalledWith('a', { passed: 'cannot-lay-out' });
    activateSecond();
    expect(answerLayout).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('is said to be passed over once in the tab, whichever pane is active', () => {
    setTabUseForTests(usedElsewhere);
    const { answerLayout, activateSecond } = twoPanes({
      layout: { view: 'another-view', request: 1, answer: 'b' },
    });
    expect(answerLayout).toHaveBeenCalledTimes(1);
    expect(answerLayout).toHaveBeenCalledWith('b', { passed: 'other-tab' });
    activateSecond();
    expect(answerLayout).toHaveBeenCalledTimes(1);
  });
});
