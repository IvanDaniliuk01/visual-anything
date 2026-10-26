import { describe, expect, it } from 'vitest';
import { MIN_SCALE, fitCamera, readableFitCamera, revealCamera, visibleRect } from './camera';

describe('revealCamera', () => {
  const viewport = { width: 800, height: 600 };
  const camera = { x: 0, y: 0, scale: 1 };

  it('leaves the camera alone when the shape shows whole and large enough', () => {
    expect(revealCamera(camera, viewport, { x: 100, y: 100, width: 160, height: 72 }, 0.75)).toBe(
      undefined,
    );
  });

  it('centers a shape that is off screen, keeping the scale', () => {
    const rect = { x: 2000, y: 1500, width: 160, height: 72 };
    const next = revealCamera(camera, viewport, rect, 0.75);
    expect(next?.scale).toBe(1);
    const shown = visibleRect(next ?? camera, viewport);
    expect(shown.x + shown.width / 2).toBeCloseTo(2080);
    expect(shown.y + shown.height / 2).toBeCloseTo(1536);
  });

  it('keeps a shape out from under the rulers, revealing it within the room they leave', () => {
    const inset = { left: 20, top: 20 };
    // Under the left ruler: shown, but not whole in the room beside it.
    const under = { x: 4, y: 100, width: 160, height: 72 };
    expect(revealCamera(camera, viewport, under, 0.75)).toBeUndefined();
    const moved = revealCamera(camera, viewport, under, 0.75, inset);
    expect(moved).toBeDefined();
    const shown = visibleRect(moved!, viewport);
    // Centered in the room right of and below the rulers.
    expect((under.x + under.width / 2) * moved!.scale + moved!.x).toBeCloseTo(20 + (800 - 20) / 2);
    expect((under.y + under.height / 2) * moved!.scale + moved!.y).toBeCloseTo(20 + (600 - 20) / 2);
    expect(under.x).toBeGreaterThan(shown.x + 20 / moved!.scale);
    // Clear of them, it stays put.
    expect(revealCamera(camera, viewport, { ...under, x: 30 }, 0.75, inset)).toBeUndefined();
  });

  it('zooms in on a shape too small to read', () => {
    const far = { x: 0, y: 0, scale: 0.2 };
    const next = revealCamera(far, viewport, { x: 100, y: 100, width: 160, height: 72 }, 0.75);
    expect(next?.scale).toBe(0.75);
  });
});

describe('fitCamera', () => {
  const viewport = { width: 1000, height: 600 };

  it('shows the whole scene in the middle of the canvas', () => {
    const camera = fitCamera({ x: 100, y: 50, width: 2000, height: 600 }, viewport, 32);
    const shown = visibleRect(camera, viewport);
    expect(shown.x + shown.width / 2).toBeCloseTo(1100);
    expect(shown.y + shown.height / 2).toBeCloseTo(350);
  });

  it('fits the scene in the room the rulers leave', () => {
    const bounds = { x: 0, y: 0, width: 1000, height: 500 };
    const fit = fitCamera(bounds, { width: 1020, height: 620 }, 10, { left: 20, top: 20 });
    expect(fit.scale).toBeCloseTo(1000 / 1000 - 0.02, 2);
    expect(bounds.x * fit.scale + fit.x).toBeGreaterThanOrEqual(20 + 10 - 1e-9);
    expect(bounds.y * fit.scale + fit.y).toBeGreaterThanOrEqual(20 + 10 - 1e-9);
    expect((bounds.x + bounds.width) * fit.scale + fit.x).toBeLessThanOrEqual(1020 - 10 + 1e-9);
  });

  it('centers a scene too large to fit at the smallest scale, rather than its corner', () => {
    const camera = fitCamera({ x: 0, y: 0, width: 200_000, height: 100_000 }, viewport, 32);
    expect(camera.scale).toBe(MIN_SCALE);
    const shown = visibleRect(camera, viewport);
    expect(shown.x + shown.width / 2).toBeCloseTo(100_000);
    expect(shown.y + shown.height / 2).toBeCloseTo(50_000);
  });
});

describe('readableFitCamera', () => {
  const viewport = { width: 1000, height: 600 };
  const NAMES = 0.45;

  it('shows the whole scene when names draw at the scale that fits it', () => {
    const bounds = { x: 100, y: 50, width: 1500, height: 600 };
    expect(readableFitCamera(bounds, viewport, 32, NAMES)).toEqual(fitCamera(bounds, viewport, 32));
  });

  it('keeps to the scale names draw from, from the scene’s top left, when the whole would draw none', () => {
    // 84 shapes in nested containers, 6,000 units wide: the whole view fits at about 15%.
    const bounds = { x: -40, y: 20, width: 6000, height: 2400 };
    expect(fitCamera(bounds, viewport, 32).scale).toBeLessThan(NAMES);
    const camera = readableFitCamera(bounds, viewport, 32, NAMES);
    expect(camera.scale).toBe(NAMES);
    // Its top level from where it starts, the margin left of and above it.
    expect(bounds.x * camera.scale + camera.x).toBeCloseTo(32);
    expect(bounds.y * camera.scale + camera.y).toBeCloseTo(32);
  });

  it('centers along a side that fits whole at that scale', () => {
    const wide = { x: 0, y: 0, width: 6000, height: 400 };
    const camera = readableFitCamera(wide, viewport, 32, NAMES);
    expect(camera.scale).toBe(NAMES);
    expect(camera.x).toBeCloseTo(32);
    const shown = visibleRect(camera, viewport);
    expect(shown.y + shown.height / 2).toBeCloseTo(200);
  });

  it('starts right of and below the rulers', () => {
    const bounds = { x: 0, y: 0, width: 6000, height: 2400 };
    const camera = readableFitCamera(bounds, viewport, 32, NAMES, { left: 20, top: 20 });
    expect(camera.x).toBeCloseTo(52);
    expect(camera.y).toBeCloseTo(52);
  });
});
