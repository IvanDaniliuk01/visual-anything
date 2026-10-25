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
    const move = vi.fn<Travel['move']>(() => 320);
    const travel: Travel = { move };
    const applier = new ViewStateApplier();
    applier.goTo({ kind: 'address', state: { view: VIEW }, travel }, context);
    applier.sync(context);
    expect(canvas.targetOf).toHaveBeenCalledWith({ whole: true });
    expect(move).toHaveBeenCalledWith(HERE, WHOLE, VIEWPORT, true);
    expect(canvas.glideTo).toHaveBeenCalledWith(WHOLE, 320);
    expect(canvas.setCamera).not.toHaveBeenCalled();
  });

  it('goes to the step’s camera, at once when its travel says to cut', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const camera = { x: 300, y: 200, zoom: 2 };
    const applier = new ViewStateApplier();
    applier.goTo(
      { kind: 'address', state: { view: VIEW, camera }, travel: { move: () => 0 } },
      context,
    );
    applier.sync(context);
    expect(canvas.targetOf).not.toHaveBeenCalled();
    expect(canvas.glideTo).toHaveBeenCalledWith(cameraFor(camera, VIEWPORT), 0);
  });

  it('brings the selection into sight when the step has no camera', () => {
    const canvas = fakeCanvas();
    const context = contextOf(sample, canvas);
    const applier = new ViewStateApplier();
    applier.goTo(
      {
        kind: 'address',
        state: { view: VIEW, select: ['booking-agent'] },
        travel: { move: () => 250 },
      },
      context,
    );
    applier.sync({
      ...context,
      selection: { ...EMPTY_SELECTION, elements: new Set(['booking-agent']) },
    });
    expect(canvas.targetOf).toHaveBeenCalledWith({ key: expect.any(String) as string });
    expect(canvas.glideTo).toHaveBeenCalledWith(WHOLE, 250);
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
    const move = vi.fn<Travel['move']>(() => 0);
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
