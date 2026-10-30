/**
 * The canvas area lends the live session what takes Claude's pictures (ADR 0081), for as long as it is
 * mounted: its renderer draws them in its own theme, and a canvas off screen in the other one, with
 * the tab's camera for what it shows now. The renderer is mocked.
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IndexedScene } from '../canvas/hit';
import type { CanvasRenderer, CaptureImage } from '../canvas/renderer';
import { LiveContext, type Live } from '../live/context';
import type { TakeCapture } from '../live/connection';
import { THEMES } from '../theme/themes';
import { canvasFor, useCaptureAnswers } from './useCaptureAnswers';

const drawOffScreen = vi.hoisted(() => vi.fn());
vi.mock('./mirror', () => ({ drawOffScreen }));

const indexed = {
  scene: { bounds: { x: 0, y: 0, width: 400, height: 200 } },
  byElement: new Map(),
} as unknown as IndexedScene;

function renderer(change: Partial<Record<string, unknown>> = {}) {
  const drawn = { blob: new Blob(['png']), width: 10, height: 10 };
  return {
    canvas: document.createElement('canvas'),
    theme: 'light',
    camera: { x: 1, y: 2, scale: 0.5 },
    viewport: { width: 800, height: 600 },
    hiddenShapes: new Set(['hidden']),
    drawnFrom: { indexed, emphasis: {} },
    captureImage: vi.fn(() => Promise.resolve(drawn)),
    ...change,
  } as unknown as CanvasRenderer;
}

const IMAGE: CaptureImage = {
  frame: { x: 0, y: 0, width: 10, height: 10 },
  pixelsPerUnit: 1,
  width: 10,
  height: 10,
  asShown: true,
  whole: false,
};

describe('canvasFor', () => {
  it('reads what the canvas shows, and draws in its own theme with its renderer', async () => {
    const drawer = renderer();
    const canvas = canvasFor(drawer, 'overview');
    expect(canvas.view).toBe('overview');
    expect(canvas.theme).toBe('light');
    expect(canvas.seen()).toEqual({
      indexed,
      camera: { x: 1, y: 2, scale: 0.5 },
      viewport: { width: 800, height: 600 },
      hidden: new Set(['hidden']),
    });
    const { captureImage } = drawer as unknown as { captureImage: ReturnType<typeof vi.fn> };
    await canvas.draw(IMAGE);
    expect(captureImage).toHaveBeenCalledWith(IMAGE);
  });

  it('draws in the other theme off screen, from what the canvas draws, where it looks', async () => {
    const drawer = renderer();
    await canvasFor(drawer, 'overview').drawIn('dark', IMAGE);
    expect(drawOffScreen).toHaveBeenCalledWith(drawer.drawnFrom, THEMES.dark.canvas, IMAGE, {
      camera: { x: 1, y: 2, scale: 0.5 },
      viewport: { width: 800, height: 600 },
    });
    await canvasFor(drawer, 'overview').drawIn('dark', { ...IMAGE, asShown: false });
    expect(drawOffScreen).toHaveBeenLastCalledWith(
      drawer.drawnFrom,
      THEMES.dark.canvas,
      { ...IMAGE, asShown: false },
      undefined,
    );
  });

  it('sees nothing before the canvas starts, or with no renderer', () => {
    expect(canvasFor(renderer({ canvas: undefined }), 'v').seen()).toBeUndefined();
    expect(canvasFor(undefined, 'v').seen()).toBeUndefined();
  });
});

describe('useCaptureAnswers', () => {
  it('lends the live session what takes pictures while mounted, and takes it back', async () => {
    let lent: TakeCapture | undefined;
    const takenBack = vi.fn();
    const live = {
      lendCapture: (capture: TakeCapture) => {
        lent = capture;
        return takenBack;
      },
    } as unknown as Live;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LiveContext value={live}>{children}</LiveContext>
    );
    const drawer = renderer();
    const controller = { current: { renderer: drawer } };
    const { unmount, rerender } = renderHook(
      ({ view }: { view: string }) => useCaptureAnswers(controller, view),
      { wrapper, initialProps: { view: 'overview' } },
    );
    rerender({ view: 'billing' });
    expect(await lent?.({ region: 'whole', width: 400 })).toMatchObject({
      picture: { view: 'billing', theme: 'light' },
    });
    expect(await lent?.({ view: 'overview', region: 'whole', width: 400 })).toEqual({
      failed: 'other-view',
      shows: 'billing',
    });
    unmount();
    expect(takenBack).toHaveBeenCalled();
  });
});
