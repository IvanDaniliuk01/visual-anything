import { act, render, screen } from '@testing-library/react';
import { Container } from 'pixi.js';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { CanvasArea } from './CanvasArea';
import { fitTransform } from './geometry';
import { buildScene, type Scene } from './scene';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const scene = buildScene(loadSample(), 'system-overview');
const LABEL = 'System overview';

function sizeOf(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
}

function drawnContents(app: FakeApplication): Container[] {
  return app.stage.contents.filter((item): item is Container => item instanceof Container);
}

/** Runs `action`, which settles a pending start, and lets the canvas area react to it. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

describe('CanvasArea', () => {
  it('describes the view to assistive technology', () => {
    render(<CanvasArea scene={scene} label={LABEL} />);
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });

  it('starts a WebGL canvas and attaches it once it is ready', async () => {
    render(<CanvasArea scene={scene} label={LABEL} />);
    const host = screen.getByRole('img', { name: LABEL });
    const [app] = FakeApplication.created;
    expect(app?.initOptions).toMatchObject({ preference: 'webgl' });
    expect(host.querySelector('canvas')).toBeNull();

    await settle(() => app?.finishInit());
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('keeps one canvas when StrictMode mounts twice, destroying the Application of the first mount', async () => {
    render(
      <StrictMode>
        <CanvasArea scene={scene} label={LABEL} />
      </StrictMode>,
    );
    const host = screen.getByRole('img', { name: LABEL });
    expect(FakeApplication.created).toHaveLength(2);
    const [first, second] = FakeApplication.created as [FakeApplication, FakeApplication];

    await settle(() => {
      second.finishInit();
      first.finishInit();
    });

    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(host.contains(second.canvas)).toBe(true);
  });

  it('destroys its Application and removes the canvas when it goes away', async () => {
    const { unmount } = render(<CanvasArea scene={scene} label={LABEL} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());

    unmount();
    expect(app.destroyed).toBe(true);
    expect(app.canvas.isConnected).toBe(false);
  });

  it('destroys an Application whose start finishes after it went away', async () => {
    const { unmount } = render(<CanvasArea scene={scene} label={LABEL} />);
    const [app] = FakeApplication.created as [FakeApplication];
    unmount();
    expect(app.destroyed).toBe(false);

    await settle(() => app.finishInit());
    expect(app.destroyed).toBe(true);
    expect(app.stage.contents).toEqual([]);
  });

  it('fits the scene into the canvas area, and fits it again when the area is resized', async () => {
    render(<CanvasArea scene={scene} label={LABEL} />);
    const host = screen.getByRole('img', { name: LABEL });
    sizeOf(host, 1000, 600);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());

    const [content] = drawnContents(app);
    const fitted = fitTransform(scene.bounds, { width: 1000, height: 600 }, 24);
    expect(app.renderer.screen).toEqual({ width: 1000, height: 600 });
    expect(content?.scale.x).toBeCloseTo(fitted.scale);
    expect(content?.position.x).toBeCloseTo(fitted.x);
    expect(content?.position.y).toBeCloseTo(fitted.y);
    const renders = app.renders;
    expect(renders).toBeGreaterThan(0);

    sizeOf(host, 500, 600);
    act(() => FakeResizeObserver.resizeAll());
    const refitted = fitTransform(scene.bounds, { width: 500, height: 600 }, 24);
    expect(app.renderer.screen).toEqual({ width: 500, height: 600 });
    expect(content?.scale.x).toBeCloseTo(refitted.scale);
    expect(app.renders).toBeGreaterThan(renders);
  });

  it('draws a new scene in place of the old one', async () => {
    const { rerender } = render(<CanvasArea scene={scene} label={LABEL} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());
    const [previous] = drawnContents(app);

    const empty: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };
    rerender(<CanvasArea scene={empty} label={LABEL} />);
    expect(previous?.destroyed).toBe(true);
    expect(drawnContents(app)).toHaveLength(2);
    expect(FakeApplication.created).toHaveLength(1);
  });

  it('says so when the view draws nothing', () => {
    const empty: Scene = { shapes: [], relations: [], notes: [], arrows: [], bounds: undefined };
    render(<CanvasArea scene={empty} label={LABEL} />);
    expect(screen.getByText('This view has no shapes yet.')).toBeInTheDocument();
  });

  it('explains that the canvas could not draw the view when WebGL is unavailable', async () => {
    render(<CanvasArea scene={scene} label={LABEL} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() =>
      app.failInit(new Error('No available renderer for the current environment')),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not draw this view.*No available renderer for the current environment/,
    );
  });

  it('reports a scene it fails to draw in the canvas area, leaving the rest of the app alone', async () => {
    const broken = {
      ...scene,
      shapes: [{ ...scene.shapes[0], rect: undefined }],
    } as unknown as Scene;
    render(<CanvasArea scene={broken} label={LABEL} />);
    const [app] = FakeApplication.created as [FakeApplication];
    await settle(() => app.finishInit());
    expect(screen.getByRole('alert')).toHaveTextContent(/could not draw this view/);
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });
});
