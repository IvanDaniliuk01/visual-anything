// @vitest-environment node
/**
 * The handles that move and rotate posed elements (ADR 0076): where they are drawn in a frame, at a
 * fixed size on the screen, and which of them a pixel points at, as the page hit-tests them.
 */
import { describe, expect, it } from 'vitest';
import { HANDLE_LENGTH, HANDLE_RADIUS, handleAt, handleAxes, handleShapes } from './handles';

const SIZE = { width: 400, height: 400 };
const FRONT = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 4 };

describe('the handles', () => {
  it('draws an arrow along each axis, as long on the screen whatever the distance', () => {
    for (const distance of [0.5, 4, 400]) {
      const shapes = handleShapes(
        { mode: 'move', at: { x: 0, y: 0, z: 0 } },
        { ...FRONT, distance },
        SIZE,
      );
      const x = shapes.find((shape) => shape.axis === 'x');
      expect(x?.kind).toBe('arrow');
      const [from, to] = x?.points ?? [];
      expect(from).toEqual({ x: 200, y: 200 });
      expect((to?.x ?? 0) - 200).toBeCloseTo(HANDLE_LENGTH, 6);
      expect(to?.y).toBeCloseTo(200, 6);
      const y = shapes.find((shape) => shape.axis === 'y');
      expect(200 - (y?.points[1]?.y ?? 0)).toBeCloseTo(HANDLE_LENGTH, 6);
    }
  });

  it('sizes them by the pixel ratio and turns them with their rotation', () => {
    const shapes = handleShapes(
      {
        mode: 'move',
        at: { x: 0, y: 0, z: 0 },
        // A quarter turn about +Z takes +X to +Y.
        rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
      },
      FRONT,
      SIZE,
      2,
    );
    const x = shapes.find((shape) => shape.axis === 'x');
    expect(x?.points[1]?.x).toBeCloseTo(200, 6);
    expect(200 - (x?.points[1]?.y ?? 0)).toBeCloseTo(2 * HANDLE_LENGTH, 6);
    const axes = handleAxes({ rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } });
    expect(axes.x.y).toBeCloseTo(1, 12);
    expect(axes.y.x).toBeCloseTo(-1, 12);
  });

  it('draws a ring around each axis to rotate', () => {
    const shapes = handleShapes({ mode: 'rotate', at: { x: 0, y: 0, z: 0 } }, FRONT, SIZE);
    expect(shapes.map((shape) => shape.kind)).toEqual(['ring', 'ring', 'ring']);
    // The ring around Z faces the camera: a circle of the radius on the screen.
    const z = shapes.find((shape) => shape.axis === 'z');
    for (const point of z?.points ?? []) {
      expect(Math.hypot(point.x - 200, point.y - 200)).toBeCloseTo(HANDLE_RADIUS, 0);
    }
  });

  it('says which handle a pixel points at, within its reach', () => {
    const shapes = handleShapes({ mode: 'move', at: { x: 0, y: 0, z: 0 } }, FRONT, SIZE);
    expect(handleAt(shapes, 260, 203)).toBe('x');
    expect(handleAt(shapes, 198, 140)).toBe('y');
    expect(handleAt(shapes, 260, 230)).toBeUndefined();
    expect(handleAt(shapes, 260, 209, 2)).toBe('x');
  });

  it('draws nothing behind the camera', () => {
    expect(handleShapes({ mode: 'move', at: { x: 0, y: 0, z: 10 } }, FRONT, SIZE)).toEqual([]);
  });
});
