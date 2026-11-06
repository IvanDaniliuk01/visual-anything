/**
 * The canvas area lends the live session what takes Claude's pictures (ADR 0081), for as long as it is
 * mounted: its renderer draws them in its own theme, and a canvas off screen in the other one, with
 * the tab's camera for what it shows now. The renderer is mocked.
 */
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type CaptureRequestMessage,
} from '@visual-anything/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IndexedScene } from '../canvas/hit';
import type { CanvasRenderer, CaptureImage } from '../canvas/renderer';
import { LiveContext, type Live } from '../live/context';
import { LiveConnection, type CaptureWaitsFor, type TakeCapture } from '../live/connection';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { THEMES } from '../theme/themes';
import { canvasFor, useCaptureAnswers, type CaptureDrawn } from './useCaptureAnswers';

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
    expect(drawOffScreen).toHaveBeenCalledWith(
      drawer.drawnFrom,
      THEMES.dark.canvas,
      IMAGE,
      { camera: { x: 1, y: 2, scale: 0.5 }, viewport: { width: 800, height: 600 } },
      document,
      undefined,
    );
    // By the picture's deadline (#16).
    await canvasFor(drawer, 'overview').drawIn('dark', { ...IMAGE, asShown: false }, 1234);
    expect(drawOffScreen).toHaveBeenLastCalledWith(
      drawer.drawnFrom,
      THEMES.dark.canvas,
      { ...IMAGE, asShown: false },
      undefined,
      document,
      1234,
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

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** A scene of its own bounds, as another view's scene is. */
const sceneAt = (x: number) =>
  ({
    scene: { bounds: { x, y: 0, width: 400, height: 200 } },
    byElement: new Map(),
  }) as unknown as IndexedScene;

describe('a picture right after the view changed (#16)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says what it waits for while the canvas draws another scene than the view’s, or moves a layout in', () => {
    let waitsFor: CaptureWaitsFor | undefined;
    const live = {
      lendCapture: (_: TakeCapture, waits?: CaptureWaitsFor) => {
        waitsFor = waits;
        return () => undefined;
      },
    } as unknown as Live;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LiveContext value={live}>{children}</LiveContext>
    );
    const billing = sceneAt(1000);
    const drawer = renderer();
    const controller = { current: { renderer: drawer } };
    const { rerender } = renderHook(
      ({ drawn }: { drawn: CaptureDrawn }) => useCaptureAnswers(controller, 'billing', true, drawn),
      { wrapper, initialProps: { drawn: { indexed: billing, settled: true } } },
    );
    expect(waitsFor?.()).toBe('the canvas to draw the view "billing"');
    Object.assign(drawer, { drawnFrom: { indexed: billing, emphasis: {} } });
    expect(waitsFor?.()).toBeUndefined();
    rerender({ drawn: { indexed: billing, settled: false } });
    expect(waitsFor?.()).toBe('the layout moving in on the view "billing" to end');
    // Right after open_app, the canvas is starting.
    Object.assign(drawer, { starting: true, canvas: undefined });
    expect(waitsFor?.()).toBe('the canvas to start');
    // A canvas that failed to start is waited for no more: the picture says there is none.
    Object.assign(drawer, { starting: false });
    expect(waitsFor?.()).toBeUndefined();
  });

  it('is taken of the view guidance opened once the canvas draws its scene, not of the one before', async () => {
    FakeWebSocket.created = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    // A tab in the background: the browser draws no frame, and requestAnimationFrame never runs.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const connection = new LiveConnection('ws://localhost:3000/live?token=t', {
      isLastUsed: () => true,
    });
    connection.connect();
    const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
    socket.accept();
    socket.receive(
      encodeServerMessage({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: loadSample(),
        history: {},
      }),
    );
    const live = {
      lendCapture: connection.lendCapture,
      captureChanged: connection.captureChanged,
    } as unknown as Live;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LiveContext value={live}>{children}</LiveContext>
    );
    const overview = sceneAt(0);
    const billing = sceneAt(5000);
    // The canvas draws the overview, in pictures that are PNGs.
    const png = Uint8Array.from(atob(PNG), (char) => char.charCodeAt(0));
    const drawer = renderer({
      drawnFrom: { indexed: overview, emphasis: {} },
      captureImage: vi.fn(() => Promise.resolve({ blob: new Blob([png]), width: 1, height: 1 })),
    });
    const controller = { current: { renderer: drawer } };
    const { rerender } = renderHook(
      ({ view, drawn }: { view: string; drawn: CaptureDrawn }) =>
        useCaptureAnswers(controller, view, true, drawn),
      { wrapper, initialProps: { view: 'overview', drawn: { indexed: overview, settled: true } } },
    );
    // Guidance opened billing: the canvas area shows it, but its canvas still draws the overview.
    rerender({ view: 'billing', drawn: { indexed: billing, settled: true } });
    const request: CaptureRequestMessage = {
      type: 'capture/request',
      requestId: 'capture-1',
      view: 'billing',
      region: 'whole',
      width: 800,
    };
    socket.receive(encodeServerMessage(request));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { captureImage } = drawer as unknown as { captureImage: ReturnType<typeof vi.fn> };
    expect(captureImage).not.toHaveBeenCalled();
    expect(socket.sent.some((each) => each.type === 'capture/answer')).toBe(false);
    // The canvas draws billing's scene now.
    Object.assign(drawer, { drawnFrom: { indexed: billing, emphasis: {} } });
    act(() => rerender({ view: 'billing', drawn: { indexed: billing, settled: true } }));
    const answer = await vi.waitFor(() => {
      const sent = socket.sent.find((each) => each.type === 'capture/answer');
      if (sent === undefined) throw new Error('Not answered yet.');
      return sent;
    });
    expect(answer).toMatchObject({ requestId: 'capture-1', picture: { view: 'billing' } });
    // Framed in billing's scene, not the overview's.
    const [image] = captureImage.mock.calls[0] as [CaptureImage];
    expect(image.frame.x).toBeGreaterThan(4000);
  });
});
