import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { buildScene } from '../scene';
import { LayoutStopped, type LayoutRunner } from './client';
import { layOut } from './engine';
import type { LayoutProgress } from './types';
import { AUTO_DELAY, LayoutRunnerContext, useLayout, type LayoutOptions } from './useLayout';

const VIEW = 'system-overview';
const elk = new ELK();

/** Runs layouts in this thread, as the worker would, and counts them. */
function inThread(): LayoutRunner & { runs: number } {
  const runner = {
    runs: 0,
    layOut: async (input: Parameters<LayoutRunner['layOut']>[0]) => {
      runner.runs += 1;
      return layOut(input, elk);
    },
    dispose: () => {},
  };
  return runner;
}

/** A runner whose layouts wait until they are stopped, saying how far they came when told to. */
function heldRunner() {
  let onProgress: ((progress: LayoutProgress) => void) | undefined;
  const runner: LayoutRunner = {
    layOut: (_input, call = {}) => {
      onProgress = call.onProgress;
      return new Promise((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => reject(new LayoutStopped()));
      });
    },
    dispose: () => {},
  };
  return { runner, progress: (progress: LayoutProgress) => onProgress?.(progress) };
}

/** The sample with one more element inside Clinic booking, which no view places yet. */
function withBilling(project: ProjectSnapshot = loadSample()): ProjectSnapshot {
  const created = executeCommand(project, {
    type: 'create-element',
    element: { id: 'billing', component: 'systems.service', name: 'Billing' },
    containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
  });
  if (!created.ok) throw new Error('Not created.');
  return created.state;
}

/**
 * A canvas's layout over a project that changes as the local program would change it: each command
 * sent is applied by the core, and the hook sees the project and scene that follow.
 */
function canvas(
  start: ProjectSnapshot,
  {
    runner = inThread(),
    editable = true,
    selection = EMPTY_SELECTION,
  }: {
    /** null: the runner every canvas shares, which needs web workers. */
    runner?: LayoutRunner | null;
    editable?: boolean;
    selection?: Selection;
  } = {},
) {
  let project = start;
  const sent: Command[] = [];
  const said: string[] = [];
  const send = vi.fn((command: Command) => {
    sent.push(command);
    const outcome = executeCommand(project, command);
    if (!outcome.ok) return Promise.resolve({ ok: false });
    project = outcome.state;
    act(() => hook.rerender(props()));
    return Promise.resolve({ ok: true });
  });
  const props = (): LayoutOptions => {
    const view = project.views.find((each) => each.id === VIEW) ?? project.views[0];
    if (!view) throw new Error('No view.');
    return {
      project,
      view,
      scene: buildScene(project, view.id),
      selection,
      send: editable ? send : undefined,
      announce: (text) => said.push(text),
    };
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LayoutRunnerContext.Provider value={runner}>{children}</LayoutRunnerContext.Provider>
  );
  const hook = renderHook((options: LayoutOptions) => useLayout(options), {
    initialProps: props(),
    wrapper,
  });
  return {
    hook,
    sent,
    said,
    get project() {
      return project;
    },
    /** Shows another version of the project, as an undo or another app's change would. */
    show(next: ProjectSnapshot, options: { editable?: boolean } = {}) {
      project = next;
      if (options.editable !== undefined) editable = options.editable;
      hook.rerender(props());
    },
  };
}

const quietly = () => new Promise((resolve) => setTimeout(resolve, AUTO_DELAY * 3));

describe('automatic layout', () => {
  it('lays out a shape that the open view shows without a position, as one action', async () => {
    const view = canvas(withBilling());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    expect(view.sent[0]).toMatchObject({
      type: 'batch',
      label: 'Lay out "Billing" in "System overview"',
      commands: [
        {
          type: 'set-positions',
          view: VIEW,
          positions: [{ element: 'billing', container: 'clinic-booking' }],
        },
      ],
    });
    const stored = view.project.views[0]?.positions.find((each) => each.element === 'billing');
    expect(stored?.pinned).toBeUndefined();
  });

  it('lays out a shape that appears later, such as one Claude adds, and only that one', async () => {
    const runner = inThread();
    const view = canvas(loadSample(), { runner });
    await quietly();
    expect(view.sent).toHaveLength(0);
    act(() => view.show(withBilling(view.project)));
    await waitFor(() => expect(view.sent).toHaveLength(1));
    expect(runner.runs).toBe(1);
  });

  it('leaves a shape whose position an undo took away, so that undo goes on past the layout', async () => {
    const runner = inThread();
    const before = withBilling();
    const view = canvas(before, { runner });
    await waitFor(() => expect(view.sent).toHaveLength(1));
    // Undo: Billing has no position again.
    act(() => view.show(before));
    await quietly();
    expect(view.sent).toHaveLength(1);
    expect(runner.runs).toBe(1);
  });

  it('keeps a new shape waiting when the project stops being changeable just before it runs', async () => {
    const view = canvas(loadSample());
    act(() => view.show(withBilling(view.project)));
    // The connection closes before automatic layout runs, and opens again later.
    act(() => view.show(view.project, { editable: false }));
    await quietly();
    expect(view.sent).toHaveLength(0);
    act(() => view.show(view.project, { editable: true }));
    await waitFor(() => expect(view.sent).toHaveLength(1));
  });

  it('waits while the project cannot be changed, and lays out once it can', async () => {
    const view = canvas(withBilling(), { editable: false });
    await quietly();
    expect(view.sent).toHaveLength(0);
    act(() => view.show(view.project, { editable: true }));
    await waitFor(() => expect(view.sent).toHaveLength(1));
  });

  it('does nothing where the browser has no web workers, as here', async () => {
    const view = canvas(withBilling(), { runner: null });
    await quietly();
    expect(view.sent).toHaveLength(0);
    expect(view.hook.result.current.control).toMatchObject({
      enabled: false,
      title: 'Layout needs web workers, which this browser does not offer.',
    });
  });
});

describe('the Layout control', () => {
  it('lays out the view, saying what it did', async () => {
    const view = canvas(loadSample());
    expect(view.hook.result.current.control).toMatchObject({
      label: 'Layout',
      enabled: true,
      busy: false,
      title: 'Lay out "System overview": arrange every shape that is not pinned.',
    });
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    expect(view.sent).toEqual([
      expect.objectContaining({ type: 'batch', label: 'Lay out "System overview"' }),
    ]);
    await waitFor(() =>
      expect(view.said.at(-1)).toMatch(/^Lay out "System overview": \d+ shapes moved\.$/),
    );
    expect(view.hook.result.current.control).toMatchObject({ label: 'Layout', busy: false });
  });

  it('shows how far a layout has come, and stops it when pressed, moving nothing', async () => {
    const held = heldRunner();
    const view = canvas(loadSample(), { runner: held.runner });
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.hook.result.current.control.busy).toBe(true));
    expect(view.hook.result.current.control).toMatchObject({
      label: 'Stop layout',
      enabled: true,
      title: 'Laying out 7 shapes. Press to stop it; nothing moves then.',
    });
    act(() => held.progress({ done: 1, total: 4 }));
    expect(view.hook.result.current.control).toMatchObject({
      label: 'Stop layout (25%)',
      title: 'Laying out 7 shapes: 25% done. Press to stop it; nothing moves then.',
    });
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.said).toContain('Layout stopped, and nothing moved.'));
    expect(view.hook.result.current.control).toMatchObject({ label: 'Layout', busy: false });
    expect(view.sent).toHaveLength(0);
  });

  it('shows an automatic layout under way too, which can be stopped the same way', async () => {
    const held = heldRunner();
    const view = canvas(withBilling(), { runner: held.runner });
    await waitFor(() => expect(view.hook.result.current.control.busy).toBe(true));
    expect(view.hook.result.current.control.title).toBe(
      'Laying out 1 shape. Press to stop it; nothing moves then.',
    );
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.hook.result.current.control.busy).toBe(false));
    expect(view.sent).toHaveLength(0);
  });

  it('lays out the contents of the selected container', async () => {
    const view = canvas(loadSample(), {
      selection: selectionOf([{ kind: 'element', id: 'scheduling' }]),
    });
    expect(view.hook.result.current.control.title).toBe(
      'Lay out the contents of "Scheduling": arrange the shapes inside it that are not pinned.',
    );
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    expect(view.sent[0]).toMatchObject({ label: 'Lay out the contents of "Scheduling"' });
  });

  it('says so when layout would move nothing', async () => {
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.said.at(-1)).toBe('Layout leaves every shape where it is.'));
    expect(view.sent).toHaveLength(1);
  });

  it('is off while the project cannot be changed, and says so when pressed', () => {
    const view = canvas(loadSample(), { editable: false });
    expect(view.hook.result.current.control).toMatchObject({
      enabled: false,
      title: 'Visual Anything is not connected, so nothing can be laid out.',
    });
    act(() => view.hook.result.current.control.run());
    expect(view.said).toEqual(['Visual Anything is not connected, so nothing can be laid out.']);
    expect(view.sent).toHaveLength(0);
  });

  it('says why a layout failed', async () => {
    const failing: LayoutRunner = {
      layOut: () => Promise.reject(new Error('ELK ran out of memory')),
      dispose: () => {},
    };
    const view = canvas(loadSample(), { runner: failing });
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.said).toContain('The layout failed: ELK ran out of memory'));
    expect(view.sent).toHaveLength(0);
  });
});

describe('moving in', () => {
  it('draws the layout moving in, frame by frame, and then the scene it ends on', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = canvas(loadSample());
    const before = view.hook.result.current.scene;
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    const after = buildScene(view.project, VIEW);
    // The first frame is the scene the layout was made from.
    const first = view.hook.result.current.scene;
    expect(first).not.toBe(after);
    const whatsapp = (scene: typeof before) =>
      scene.shapes.find((shape) => shape.element === 'whatsapp')?.rect;
    expect(whatsapp(first)).toEqual(whatsapp(before));
    act(() => frames.shift()?.(1000));
    act(() => frames.shift()?.(1160));
    expect(whatsapp(view.hook.result.current.scene)).not.toEqual(whatsapp(before));
    act(() => frames.shift()?.(2000));
    expect(view.hook.result.current.scene).toBe(after);
  });

  it('shows the result at once when the system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1));
    expect(view.hook.result.current.scene).toBe(buildScene(view.project, VIEW));
  });
});
