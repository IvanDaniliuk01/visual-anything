import {
  executeCommand,
  type Command,
  type ListedAction,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../../editor/selection';
import type { GuidedLayoutAnswer, GuidedLayoutRequest } from '../../guidance/state';
import { loadSample } from '../../test/sample';
import { buildScene, type Scene } from '../scene';
import { LayoutStopped, type LayoutRunner } from './client';
import { layOut } from './engine';
import type { LayoutScope } from './input';
import type { LayoutProgress } from './types';
import { AUTO_DELAY, LayoutRunnerContext, useLayout, type LayoutOptions } from './useLayout';

const VIEW = 'system-overview';
const elk = new ELK();
/** How long to wait for ELK, which runs slowly on a loaded machine. */
const ELK_WAIT = { timeout: 15_000 };

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
    actions,
  }: {
    /** null: the runner every canvas shares, which needs web workers. */
    runner?: LayoutRunner | null;
    editable?: boolean;
    selection?: Selection;
    /** The history, as the local program lists it. */
    actions?: readonly ListedAction[];
  } = {},
) {
  let project = start;
  let guided: GuidedLayoutRequest | undefined;
  // What the canvas makes of the view's scene, as live values do (ADR 0057); nothing at first.
  let dress = (scene: Scene): Scene => scene;
  const sent: Command[] = [];
  /** The action each command sent asked to join, if any (ADR 0065). */
  const joins: (number | undefined)[] = [];
  const said: string[] = [];
  const done: (readonly LayoutScope[])[] = [];
  /** What the canvas answered Claude about each of its layouts (M3d). */
  const answered: GuidedLayoutAnswer[] = [];
  const send = vi.fn((command: Command, options?: { joins?: number }) => {
    sent.push(command);
    joins.push(options?.joins);
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
      scene: dress(buildScene(project, view.id)),
      selection,
      send: editable ? send : undefined,
      announce: (text) => said.push(text),
      ...(guided === undefined ? {} : { guided }),
      ...(actions === undefined ? {} : { actions }),
      onGuidedDone: (scopes) => done.push(scopes),
      onGuidedAnswered: (_request, answer) => answered.push(answer),
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
    joins,
    said,
    /** What each of Claude's layouts said it laid out once it was done. */
    done,
    answered,
    get project() {
      return project;
    },
    /** Shows another version of the project, as an undo or another app's change would. */
    show(next: ProjectSnapshot, options: { editable?: boolean } = {}) {
      project = next;
      if (options.editable !== undefined) editable = options.editable;
      hook.rerender(props());
    },
    /** Gives the canvas Claude's request for a layout, as the tab's guidance holds it. */
    guide(request: GuidedLayoutRequest) {
      guided = request;
      hook.rerender(props());
    },
    /** Shows the same project's scene as a live update makes it, a new scene object each time. */
    dress(how: (scene: Scene) => Scene) {
      dress = how;
      hook.rerender(props());
    },
  };
}

const quietly = () => new Promise((resolve) => setTimeout(resolve, AUTO_DELAY * 3));

describe('automatic layout', () => {
  it('lays out a shape that the open view shows without a position, as one action', async () => {
    const view = canvas(withBilling());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
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

  it('asks to join the newest action done, which may have added the shape, but not when pressed', async () => {
    const action = (id: number, undone: boolean): ListedAction => ({
      id,
      label: `Action ${id}`,
      author: 'claude',
      time: id,
      undone,
    });
    const view = canvas(loadSample(), {
      actions: [action(3, false), action(4, false), action(5, true)],
    });
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    expect(view.joins).toEqual([undefined]);
    act(() => view.show(withBilling(view.project)));
    await waitFor(() => expect(view.sent).toHaveLength(2), ELK_WAIT);
    expect(view.joins).toEqual([undefined, 4]);
  });

  it('lays out a shape that appears later, such as one Claude adds, and only that one', async () => {
    const runner = inThread();
    const view = canvas(loadSample(), { runner });
    await quietly();
    expect(view.sent).toHaveLength(0);
    act(() => view.show(withBilling(view.project)));
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    expect(runner.runs).toBe(1);
  });

  it('leaves a shape whose position an undo took away, so that undo goes on past the layout', async () => {
    const runner = inThread();
    const before = withBilling();
    const view = canvas(before, { runner });
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
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
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
  });

  it('waits while the project cannot be changed, and lays out once it can', async () => {
    const view = canvas(withBilling(), { editable: false });
    await quietly();
    expect(view.sent).toHaveLength(0);
    act(() => view.show(view.project, { editable: true }));
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
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

describe('a layout Claude asks for (ADR 0029)', () => {
  it('lays out the view as Layout does, once for each request', async () => {
    const runner = inThread();
    const view = canvas(loadSample(), { runner });
    await quietly();
    act(() => view.guide({ request: 1 }));
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    expect(view.sent).toEqual([
      expect.objectContaining({ type: 'batch', label: 'Lay out "System overview"' }),
    ]);
    // Once it is done, the canvas is told what it laid out, which it fits.
    await waitFor(() => expect(view.done).toEqual([[{ kind: 'view' }]]));
    // The same request seen again, as the tab's guidance keeps it, runs nothing more.
    act(() => view.show(view.project));
    await quietly();
    expect(runner.runs).toBe(1);
    expect(view.done).toHaveLength(1);
  });

  it('lays out the contents of each container it names', async () => {
    const view = canvas(loadSample());
    await quietly();
    act(() => view.guide({ request: 1, containers: ['scheduling', 'appointments-api'] }));
    await waitFor(() => expect(view.said.at(-1)).toMatch(/^Lay out the contents/), ELK_WAIT);
    // What holds nothing on the canvas is passed over.
    expect(view.sent.map((each) => (each.type === 'batch' ? each.label : each.type))).toEqual([
      'Lay out the contents of "Scheduling"',
    ]);
    await waitFor(() =>
      expect(view.done).toEqual([[{ kind: 'contents', container: 'scheduling' }]]),
    );
  });

  it('waits for the view it names', async () => {
    const runner = inThread();
    const view = canvas(loadSample(), { runner });
    act(() => view.guide({ request: 1, view: 'another-view' }));
    await quietly();
    expect(runner.runs).toBe(0);
    expect(view.answered).toEqual([]);
  });

  it('answers Claude, once it is done, with how many shapes it moved (M3d)', async () => {
    const view = canvas(loadSample());
    await quietly();
    act(() => view.guide({ request: 1, answer: 'layout-1' }));
    await waitFor(() => expect(view.answered).toHaveLength(1), ELK_WAIT);
    const [answer] = view.answered;
    expect(answer).toEqual({ layouts: [{ ended: 'done', moved: expect.any(Number) as number }] });
    expect(answer?.layouts?.[0]?.moved).toBeGreaterThan(0);
    // Laid out again, nothing moves, and it says so.
    act(() => view.guide({ request: 2, answer: 'layout-2' }));
    await waitFor(() => expect(view.answered).toHaveLength(2), ELK_WAIT);
    expect(view.answered[1]).toEqual({ layouts: [{ ended: 'done', moved: 0 }] });
  });

  it('answers each container it was asked for, in order, those it cannot lay out as empty', async () => {
    const view = canvas(loadSample());
    await quietly();
    act(() =>
      view.guide({ request: 1, answer: 'a', containers: ['appointments-api', 'scheduling'] }),
    );
    await waitFor(() => expect(view.answered).toHaveLength(1), ELK_WAIT);
    expect(view.answered[0]?.layouts).toEqual([
      { container: 'appointments-api', ended: 'empty', moved: 0 },
      { container: 'scheduling', ended: 'done', moved: expect.any(Number) as number },
    ]);
  });

  it('answers that the person stopped it, when they do', async () => {
    const held = heldRunner();
    const view = canvas(loadSample(), { runner: held.runner });
    await quietly();
    act(() => view.guide({ request: 1, answer: 'a' }));
    await waitFor(() => expect(view.hook.result.current.control.busy).toBe(true));
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.answered).toHaveLength(1));
    expect(view.answered[0]).toEqual({ layouts: [{ ended: 'stopped', moved: 0 }] });
  });

  it('answers that it cannot lay out where the browser has no web workers', async () => {
    const view = canvas(loadSample(), { runner: null });
    act(() => view.guide({ request: 1, answer: 'a' }));
    await waitFor(() => expect(view.answered).toEqual([{ passed: 'cannot-lay-out' }]));
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
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
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
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    expect(view.sent[0]).toMatchObject({ label: 'Lay out the contents of "Scheduling"' });
  });

  it('says so when layout would move nothing', async () => {
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    act(() => view.hook.result.current.control.run());
    await waitFor(
      () => expect(view.said.at(-1)).toBe('Layout leaves every shape where it is.'),
      ELK_WAIT,
    );
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
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
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

  it('goes on moving in through a live update that changes only values and colors', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = canvas(loadSample());
    const before = view.hook.result.current.scene;
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    const whatsapp = (scene: Scene) =>
      scene.shapes.find((shape) => shape.element === 'whatsapp') as Scene['shapes'][number];
    act(() => frames.shift()?.(1000));
    act(() => frames.shift()?.(1100));
    const partWay = whatsapp(view.hook.result.current.scene).rect;
    expect(partWay).not.toEqual(whatsapp(before).rect);
    // Live values come: a new scene, its shapes recolored and their details written anew.
    const live = (scene: Scene): Scene => ({
      ...scene,
      shapes: scene.shapes.map((shape) => ({ ...shape, fill: '#123456', detail: '● 12 ms' })),
    });
    act(() => view.dress(live));
    const during = view.hook.result.current.scene;
    expect(whatsapp(during).rect).toEqual(partWay);
    expect(whatsapp(during).fill).toBe('#123456');
    // The move goes on from where it was, and was not asked for again.
    expect(frames).toHaveLength(1);
    act(() => frames.shift()?.(1200));
    const later = whatsapp(view.hook.result.current.scene).rect;
    expect(later).not.toEqual(partWay);
    expect(later).not.toEqual(whatsapp(before).rect);
    // Another one comes, and the move still ends on the scene as it is then.
    act(() => view.dress((scene) => live(live(scene))));
    act(() => frames.shift()?.(2000));
    const ended = view.hook.result.current.scene;
    expect(ended.shapes.every((shape) => shape.fill === '#123456')).toBe(true);
    expect(whatsapp(ended).rect).toEqual(whatsapp(buildScene(view.project, VIEW)).rect);
    expect(frames).toHaveLength(0);
  });

  it('stops moving in when shapes move or change size meanwhile', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    act(() => frames.shift()?.(1000));
    act(() => frames.shift()?.(1100));
    // An overlay's size from a live value grows a shape: the view shows as it is now.
    const grown = (scene: Scene): Scene => ({
      ...scene,
      shapes: scene.shapes.map((shape) =>
        shape.element === 'patient'
          ? { ...shape, rect: { ...shape.rect, width: shape.rect.width * 2 } }
          : shape,
      ),
    });
    act(() => view.dress(grown));
    const shown = view.hook.result.current.scene;
    expect(shown.shapes.find((shape) => shape.element === 'whatsapp')?.rect).toEqual(
      buildScene(view.project, VIEW).shapes.find((shape) => shape.element === 'whatsapp')?.rect,
    );
  });

  it('shows the result at once in a tab in the background, which draws no frame (#16)', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const view = canvas(loadSample());
      act(() => view.hook.result.current.control.run());
      await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
      expect(view.hook.result.current.scene).toBe(buildScene(view.project, VIEW));
    } finally {
      hidden.mockRestore();
    }
  });

  it('starts no move when the tab went to the background while the layout ran (#16)', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // Shown when the layout's change is sent, hidden by the time the scene it makes comes.
    const hidden = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValueOnce('visible')
      .mockReturnValue('hidden');
    try {
      const view = canvas(loadSample());
      act(() => view.hook.result.current.control.run());
      await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
      expect(view.hook.result.current.scene).toBe(buildScene(view.project, VIEW));
      expect(frames).toHaveLength(0);
    } finally {
      hidden.mockRestore();
    }
  });

  it('ends a move under way when the tab goes to the background (#16)', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    act(() => frames.shift()?.(1000));
    expect(view.hook.result.current.scene).not.toBe(buildScene(view.project, VIEW));
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(view.hook.result.current.scene).toBe(buildScene(view.project, VIEW));
    } finally {
      hidden.mockRestore();
    }
  });

  it('shows the result at once when the system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const view = canvas(loadSample());
    act(() => view.hook.result.current.control.run());
    await waitFor(() => expect(view.sent).toHaveLength(1), ELK_WAIT);
    expect(view.hook.result.current.scene).toBe(buildScene(view.project, VIEW));
  });
});
