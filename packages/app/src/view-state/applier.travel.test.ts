/** How the view state applier moves the camera for a tour's step (ADR 0058). */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { NO_FILTERS } from '../canvas/explore';
import { buildScene } from '../canvas/scene';
import { EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION } from '../editor/selection';
import { ScenarioSession } from '../scenarios/session';
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
    expect(move).toHaveBeenCalledWith(HERE, WHOLE, VIEWPORT, true);
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
    expect(move).toHaveBeenCalledWith(HERE, WHOLE, VIEWPORT, false);
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
