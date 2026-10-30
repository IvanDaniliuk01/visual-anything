/**
 * The canvas off screen for a picture in the other theme (ADR 0081): a renderer of its own, started in
 * that theme outside the window, given what the tab's canvas draws from, which draws the picture and
 * goes. The renderer is mocked, as jsdom has no WebGL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureImage, DrawnFrom, RendererCallbacks } from '../canvas/renderer';
import { THEMES } from '../theme/themes';
import { drawOffScreen } from './mirror';

/** The renderers made, and what each was asked. */
const made: FakeRenderer[] = [];

class FakeRenderer {
  readonly calls: string[] = [];
  readonly hostInWindow: boolean;
  constructor(
    readonly host: HTMLElement,
    readonly callbacks: RendererCallbacks,
    readonly options: { theme?: unknown; firstFit?: string },
  ) {
    this.hostInWindow = host.isConnected;
    made.push(this);
  }
  setCodeDrawings = (drawings: unknown) =>
    this.calls.push(`code ${String(drawings !== undefined)}`);
  setLegend = (legend: unknown) => this.calls.push(`legend ${String(legend !== undefined)}`);
  setComparison = () => this.calls.push('comparison');
  setEmphasis = () => this.calls.push('emphasis');
  show = () => this.calls.push('show');
  setCamera = (camera: { scale: number }) => this.calls.push(`camera ${camera.scale}`);
  afterNextFrame = (listener: () => void) => {
    this.calls.push('frame');
    setTimeout(listener, 0);
    return () => undefined;
  };
  captureImage = (image: CaptureImage) => {
    this.calls.push(`capture ${image.width}×${image.height}`);
    return Promise.resolve({ blob: new Blob(['png']), width: image.width, height: image.height });
  };
  destroy = () => this.calls.push('destroy');
}

vi.mock('../canvas/renderer', () => ({
  CanvasRenderer: vi.fn(function make(
    this: unknown,
    host: HTMLElement,
    callbacks: RendererCallbacks,
    options: { theme?: unknown },
  ) {
    return new FakeRenderer(host, callbacks, options);
  }),
}));

const IMAGE: CaptureImage = {
  frame: { x: 0, y: 0, width: 400, height: 200 },
  pixelsPerUnit: 2,
  width: 800,
  height: 400,
  asShown: false,
  whole: true,
};

const FROM: DrawnFrom = {
  indexed: { scene: {} } as never,
  emphasis: {},
  legend: { overlays: [] },
  codeDrawings: new Map(),
};

/** Starts the fake renderer made last, as PixiJS's start does: it says the theme it shows. */
async function startLast() {
  await vi.waitFor(() => expect(made.length).toBeGreaterThan(0));
  made.at(-1)?.callbacks.onThemeShown?.('dark');
}

beforeEach(() => {
  made.length = 0;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('drawOffScreen', () => {
  it('starts a renderer in the theme asked for, outside the window, gives it what the canvas draws from, and lets it go', async () => {
    const drawn = drawOffScreen(FROM, THEMES.dark.canvas, IMAGE);
    await startLast();
    expect(await drawn).toMatchObject({ width: 800, height: 400 });
    const [renderer] = made;
    expect(renderer?.options).toEqual({ theme: THEMES.dark.canvas, firstFit: 'whole' });
    expect(renderer?.hostInWindow).toBe(true);
    expect(renderer?.host.getAttribute('aria-hidden')).toBe('true');
    expect(renderer?.host.style.left).toBe('-100000px');
    expect(renderer?.host.style.width).toBe('800px');
    expect(renderer?.calls).toEqual([
      'code true',
      'legend true',
      'emphasis',
      'show',
      'frame',
      'capture 800×400',
      'destroy',
    ]);
    // Gone, host and all.
    expect(document.body.children).toHaveLength(0);
  });

  it('looks where the tab looks, at its size, for what the tab shows now', async () => {
    const drawn = drawOffScreen(FROM, THEMES.dark.canvas, IMAGE, {
      camera: { x: 10, y: 20, scale: 0.5 },
      viewport: { width: 1200, height: 700 },
    });
    await startLast();
    await drawn;
    expect(made[0]?.host.style.width).toBe('1200px');
    expect(made[0]?.calls).toContain('camera 0.5');
  });

  it('goes, saying why, when the renderer cannot start', async () => {
    const drawn = drawOffScreen(FROM, THEMES.dark.canvas, IMAGE);
    await vi.waitFor(() => expect(made.length).toBe(1));
    made[0]?.callbacks.onFailure(new Error('No WebGL.'));
    await expect(drawn).rejects.toThrow('No WebGL.');
    expect(made[0]?.calls).toEqual(['destroy']);
    expect(document.body.children).toHaveLength(0);
  });

  it('refuses before the canvas drew a scene', async () => {
    await expect(drawOffScreen({ emphasis: {} }, THEMES.dark.canvas, IMAGE)).rejects.toMatchObject({
      problem: { reason: 'not-ready' },
    });
    expect(made).toEqual([]);
  });
});
