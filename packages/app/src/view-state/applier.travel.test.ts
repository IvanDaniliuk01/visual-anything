/** How the view state applier moves the camera for a tour's step (ADR 0058). */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { NO_FILTERS } from '../canvas/explore';
import { buildScene } from '../canvas/scene';
import { EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION } from '../editor/selection';
import { ScenarioSession } from '../scenarios/session';
import { jointStepGlide } from '../space/joints';
import { SpacePanelStore } from '../space/store';
import { loadSample } from '../test/sample';
import { ViewStateApplier, type ApplyContext, type Travel } from './applier';
import type { CanvasCamera } from './canvas';
import { cameraFor } from './state';

const sample = loadSample();
const VIEW = 'system-overview';
const HERE: Camera = { x: 0, y: 0, scale: 1 };
const WHOLE: Camera = { x: -120, y: 40, scale: 0.5 };
const VIEWPORT = { width: 1000, height: 600 };

function fakeCanvas() {
  return {
    camera: () => HERE,
    viewport: () => VIEWPORT,
    setCamera: vi.fn(),
    subscribe: () => () => {},
    reveal: vi.fn(),
    targetOf: vi.fn(() => WHOLE),
    glideTo: vi.fn(),
  } satisfies CanvasCamera;
}

function contextOf(project: ProjectSnapshot, canvas: CanvasCamera, viewId = VIEW): ApplyContext {
  return {
    project,
    viewId,
    scene: buildScene(project, viewId),
    selection: EMPTY_SELECTION,
    select: vi.fn(),
    explore: {
      filters: NO_FILTERS,
      focus: { on: false },
      setFilters: vi.fn(),
      setFocus: vi.fn(),
      startFocus: vi.fn(),
      focusOn: vi.fn(),
    } as never,
    openView: vi.fn(),
    reveal: vi.fn(),
    scenarios: new ScenarioSession(),
    emphasis: new EmphasisStore(),
    canvas,
    reduced: false,
  };
}

describe('a tour step’s move', () => {
  it('shows the whole view when the step has neither a camera nor a selection, eased as its travel says', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const along = (): Camera => WHOLE;
    const move = vi.fn<Travel['move']>(() => ({ duration: 320, along, delay: 150 }));
    const travel: Travel = { move };
    const applier = new ViewStateApplier();
    applier.goTo({ kind: 'address', state: { view: VIEW }, travel }, context);
    applier.sync(context);
    expect(canvas.targetOf).toHaveBeenCalledWith({ whole: true });
    expect(move).toHaveBeenCalledWith(HERE, WHOLE, VIEWPORT, true, expect.anything());
    expect(canvas.glideTo).toHaveBeenCalledWith(WHOLE, 320, { along, delay: 150 });
    expect(canvas.setCamera).not.toHaveBeenCalled();
  });

  it('goes to the step’s camera, at once when its travel says to cut', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const camera = { x: 300, y: 200, zoom: 2 };
    const applier = new ViewStateApplier();
    applier.goTo(
      { kind: 'address', state: { view: VIEW, camera }, travel: { move: () => ({ duration: 0 }) } },
      context,
    );
    applier.sync(context);
    expect(canvas.targetOf).not.toHaveBeenCalled();
    expect(canvas.glideTo).toHaveBeenCalledWith(cameraFor(camera, VIEWPORT), 0, {});
  });

  it('brings the selection into sight when the step has no camera', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const applier = new ViewStateApplier();
    applier.goTo(
      {
        kind: 'address',
        state: { view: VIEW, select: ['booking-agent'] },
        travel: { move: () => ({ duration: 250 }) },
      },
      context,
    );
    applier.sync({
      ...context,
      selection: { ...EMPTY_SELECTION, elements: new Set(['booking-agent']) },
    });
    expect(canvas.targetOf).toHaveBeenCalledWith({ key: expect.any(String) as string });
    expect(canvas.glideTo).toHaveBeenCalledWith(WHOLE, 250, {});
  });

  it('says a step in another view is not in the same view', () => {
    const second = {
      ...sample,
      views: [
        ...sample.views,
        { ...(sample.views[0] as ProjectSnapshot['views'][number]), id: 'other' },
      ],
    };
    const canvas = fakeCanvas();
    const move = vi.fn<Travel['move']>(() => ({ duration: 0 }));
    const travel: Travel = { move };
    const applier = new ViewStateApplier();
    const before = contextOf(second, canvas, 'other');
    applier.goTo({ kind: 'address', state: { view: VIEW }, travel }, before);
    expect(before.openView).toHaveBeenCalledWith(VIEW);
    const opened = contextOf(second, canvas);
    applier.sync(opened);
    applier.sync(opened);
    // It goes with the scene of the view it goes to, for its shapes to glide to (ADR 0084).
    expect(move).toHaveBeenCalledWith(HERE, WHOLE, VIEWPORT, false, expect.anything());
  });

  // ADR 0077: a step without a camera that plays a scenario frames everything its range plays.
  it('frames what its travel says to frame when the step has no camera, before its selection', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const frame = vi.fn(() => ({ x: 100, y: 100, width: 400, height: 200 }));
    const move = vi.fn<Travel['move']>(() => ({ duration: 250 }));
    const applier = new ViewStateApplier();
    applier.goTo(
      {
        kind: 'address',
        state: { view: VIEW, select: ['booking-agent'] },
        travel: { move, frame },
      },
      context,
    );
    applier.sync({
      ...context,
      selection: { ...EMPTY_SELECTION, elements: new Set(['booking-agent']) },
    });
    expect(frame).toHaveBeenCalledWith(context.scene);
    expect(canvas.targetOf).not.toHaveBeenCalled();
    const [, to] = move.mock.calls[0] ?? [];
    // All of it shows, with room around it.
    expect(to?.scale).toBeGreaterThan(1);
    expect(to?.x).toBeCloseTo(500 - 300 * (to?.scale ?? 0));
    expect(to?.y).toBeCloseTo(300 - 200 * (to?.scale ?? 0));
  });

  it('keeps the step’s camera over what its travel would frame', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const frame = vi.fn(() => ({ x: 100, y: 100, width: 400, height: 200 }));
    const camera = { x: 300, y: 200, zoom: 2 };
    const applier = new ViewStateApplier();
    applier.goTo(
      {
        kind: 'address',
        state: { view: VIEW, camera },
        travel: { move: () => ({ duration: 0 }), frame },
      },
      context,
    );
    applier.sync(context);
    expect(frame).not.toHaveBeenCalled();
    expect(canvas.glideTo).toHaveBeenCalledWith(cameraFor(camera, VIEWPORT), 0, {});
  });

  it('falls back on the whole view when there is nothing to frame', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const applier = new ViewStateApplier();
    applier.goTo(
      {
        kind: 'address',
        state: { view: VIEW },
        travel: { move: () => ({ duration: 0 }), frame: () => undefined },
      },
      context,
    );
    applier.sync(context);
    expect(canvas.targetOf).toHaveBeenCalledWith({ whole: true });
  });

  it('leaves an address without a travel to jump as it did', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const applier = new ViewStateApplier();
    applier.goTo({ kind: 'address', state: { view: VIEW } }, context);
    applier.sync(context);
    expect(canvas.targetOf).not.toHaveBeenCalled();
    expect(canvas.glideTo).not.toHaveBeenCalled();
    expect(canvas.setCamera).not.toHaveBeenCalled();
  });
});

describe('the physical-space panel of a view state (ADR 0076)', () => {
  const AT = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 20, distance: 2 };
  const TURNED = { ...AT, azimuth: 90 };
  const TRAVEL: Travel = { move: () => ({ duration: 0 }) };

  function withPanel(reduced = false) {
    let time = 0;
    const frames: (() => void)[] = [];
    const space = new SpacePanelStore({
      frames: { request: (callback) => frames.push(callback), cancel: () => undefined },
      windowWidth: () => 1600,
      now: () => time,
    });
    const context = { ...contextOf(sample, fakeCanvas()), space, reduced };
    const tick = (ms: number) => {
      time += ms;
      for (const frame of frames.splice(0)) frame();
    };
    const go = (request: Parameters<ViewStateApplier['goTo']>[0]) => {
      const applier = new ViewStateApplier();
      applier.goTo(request, context);
      applier.sync(context);
    };
    return { space, tick, go };
  }

  it('opens the panel an address holds, as it holds it, and closes it when the address has none', () => {
    const { space, go } = withPanel();
    go({ kind: 'address', state: { view: VIEW, space: { root: 'booking-agent', camera: AT } } });
    expect(space.state(VIEW)).toEqual({ root: 'booking-agent', camera: AT });
    go({ kind: 'address', state: { view: VIEW } });
    expect(space.state(VIEW)).toBeUndefined();
  });

  it('moves the panel’s camera of a tour’s step as a tour does, eased, when it shows the same', () => {
    const { space, tick, go } = withPanel();
    space.set(VIEW, { camera: AT });
    go({
      kind: 'address',
      state: { view: VIEW, space: { camera: TURNED, names: true } },
      travel: TRAVEL,
    });
    // The rest at once, the camera from where it is.
    expect(space.state(VIEW)).toEqual({ camera: AT, names: true });
    expect(space.moves.moving(VIEW)).toBe(true);
    tick(150);
    const azimuth = space.state(VIEW)?.camera?.azimuth ?? 0;
    expect(azimuth).toBeGreaterThan(0);
    expect(azimuth).toBeLessThan(90);
    tick(550);
    expect(space.state(VIEW)).toEqual({ camera: TURNED, names: true });
  });

  it('cuts into another element shown, from a closed panel, under reduced motion, and for a step that always cuts', () => {
    const into = withPanel();
    into.space.set(VIEW, { camera: AT });
    into.go({
      kind: 'address',
      state: { view: VIEW, space: { root: 'booking-agent', camera: TURNED } },
      travel: TRAVEL,
    });
    expect(into.space.state(VIEW)).toEqual({ root: 'booking-agent', camera: TURNED });

    const closed = withPanel();
    closed.go({
      kind: 'address',
      state: { view: VIEW, space: { camera: TURNED } },
      travel: TRAVEL,
    });
    expect(closed.space.state(VIEW)).toEqual({ camera: TURNED });

    const reduced = withPanel(true);
    reduced.space.set(VIEW, { camera: AT });
    reduced.go({
      kind: 'address',
      state: { view: VIEW, space: { camera: TURNED } },
      travel: TRAVEL,
    });
    expect(reduced.space.state(VIEW)?.camera).toBe(TURNED);

    const cutting = withPanel();
    cutting.space.set(VIEW, { camera: AT });
    cutting.go({
      kind: 'address',
      state: { view: VIEW, space: { camera: TURNED } },
      travel: { ...TRAVEL, cutsSpace: () => true },
    });
    expect(cutting.space.state(VIEW)?.camera).toBe(TURNED);
  });

  it('leaves the panel as it is when the view state shows it the same way', () => {
    const { space, go } = withPanel();
    const shown = { root: 'booking-agent', camera: AT };
    space.set(VIEW, shown);
    go({
      kind: 'address',
      state: { view: VIEW, space: { root: 'booking-agent', camera: { ...AT } } },
    });
    expect(space.state(VIEW)).toBe(shown);
  });

  describe('the joints of a tour’s step (ADR 0090)', () => {
    const arm = loadSample('robot-arm');
    const CELL = 'workcell';
    const REACH = { 'joint-1': -34, 'joint-2': 28, 'joint-3': 18, 'joint-5': 36 };

    function withArm(reduced = false) {
      let time = 0;
      const frames: (() => void)[] = [];
      const space = new SpacePanelStore({
        frames: { request: (callback) => frames.push(callback), cancel: () => undefined },
        windowWidth: () => 1600,
        now: () => time,
      });
      const context = { ...contextOf(arm, fakeCanvas(), CELL), space, reduced };
      const tick = (ms: number) => {
        time += ms;
        for (const frame of frames.splice(0)) frame();
      };
      const go = (request: Parameters<ViewStateApplier['goTo']>[0]) => {
        const applier = new ViewStateApplier();
        applier.goTo(request, context);
        applier.sync(context);
      };
      return { space, tick, go };
    }

    it('glide from the step before to the step’s own, on the tour’s ease, ending on them', () => {
      const { space, tick, go } = withArm();
      space.set(CELL, { names: true });
      go({
        kind: 'address',
        state: { view: CELL, space: { names: true, joints: REACH } },
        travel: TRAVEL,
      });
      // They start where they were, at their stored positions, and glide.
      expect(space.state(CELL)?.joints).toBeUndefined();
      expect(space.joints.gliding(CELL)).toBe(true);
      const time = jointStepGlide(arm, undefined, REACH);
      expect(time).toBeGreaterThan(250);
      tick(time / 2);
      const shoulder = space.state(CELL)?.joints?.['joint-2'] ?? 0;
      expect(shoulder).toBeGreaterThan(0);
      expect(shoulder).toBeLessThan(28);
      tick(time);
      expect(space.state(CELL)).toEqual({ names: true, joints: REACH });
      // A step that gives none glides back to the stored positions.
      go({ kind: 'address', state: { view: CELL, space: { names: true } }, travel: TRAVEL });
      expect(space.state(CELL)?.joints).toEqual(REACH);
      tick(time * 2);
      expect(space.state(CELL)).toEqual({ names: true });
    });

    it('jump under reduced motion, for a step that always cuts, and for an address', () => {
      const reduced = withArm(true);
      reduced.space.set(CELL, {});
      reduced.go({
        kind: 'address',
        state: { view: CELL, space: { joints: REACH } },
        travel: TRAVEL,
      });
      expect(reduced.space.state(CELL)?.joints).toEqual(REACH);
      expect(reduced.space.joints.gliding(CELL)).toBe(false);

      const cutting = withArm();
      cutting.space.set(CELL, {});
      cutting.go({
        kind: 'address',
        state: { view: CELL, space: { joints: REACH } },
        travel: { ...TRAVEL, cutsSpace: () => true },
      });
      expect(cutting.space.state(CELL)?.joints).toEqual(REACH);

      const address = withArm();
      address.space.set(CELL, {});
      address.go({ kind: 'address', state: { view: CELL, space: { joints: REACH } } });
      expect(address.space.state(CELL)?.joints).toEqual(REACH);
      expect(address.space.joints.gliding(CELL)).toBe(false);
    });
  });

  it('leaves the panel alone when search jumps', () => {
    const { space, go } = withPanel();
    space.set(VIEW, {});
    go({ kind: 'jump', view: VIEW, target: { kind: 'element', id: 'booking-agent' } });
    expect(space.state(VIEW)).toEqual({});
  });
});
