import { describe, expect, it } from 'vitest';
import { revealCamera, visibleRect } from './camera';

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

  it('zooms in on a shape too small to read', () => {
    const far = { x: 0, y: 0, scale: 0.2 };
    const next = revealCamera(far, viewport, { x: 100, y: 100, width: 160, height: 72 }, 0.75);
    expect(next?.scale).toBe(0.75);
  });
});
