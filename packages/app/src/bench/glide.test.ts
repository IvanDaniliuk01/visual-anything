import { describe, expect, it, vi } from 'vitest';
import type { CanvasRenderer } from '../canvas/renderer';
import { buildScene } from '../canvas/scene';
import { syntheticProject } from './synthetic';
import { measureGlide, type GlideBench } from './glide';

describe('the benchmark’s gliding step', () => {
  it('glides at most 400 shapes on the layer, one eased part of the way each frame', async () => {
    const project = syntheticProject({ elements: 2000 });
    const view = project.views[0];
    if (!view) throw new Error('No view.');
    const scene = buildScene(project, view.id);
    let drawn = 0;
    const context = new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'measureText'
            ? () => ({ width: 10 })
            : key === 'fillRect'
              ? () => {
                  drawn += 1;
                }
              : () => undefined,
        set: () => true,
      },
    );
    const element = {
      getContext: () => context,
      remove: vi.fn(),
      width: 10,
      height: 10,
    };
    const renderer = {
      viewport: { width: 1200, height: 800 },
      glideSurface: () => ({ element, background: '#fff', dark: false, resolution: 1 }),
    } as unknown as CanvasRenderer;
    const bench: GlideBench = {
      renderer,
      scene: () => scene,
      settle: () => Promise.resolve(),
      measure: (name, count, step) => {
        for (let frame = 0; frame < count; frame++) step(frame);
        return Promise.resolve({ name, frames: Array.from({ length: count }, () => 1) });
      },
      move: () => undefined,
      // Looking at the view's top left corner.
      cameraAt: (scale) => ({
        x: -(scene.bounds?.x ?? 0) * scale,
        y: -(scene.bounds?.y ?? 0) * scale,
        scale,
      }),
    };
    const phase = await measureGlide(bench, 0.5);
    const count = Number(/gliding (\d+) shapes/.exec(phase.name)?.[1]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(400);
    expect(drawn).toBe(phase.frames.length);
    expect(element.remove).toHaveBeenCalled();
  });
});
