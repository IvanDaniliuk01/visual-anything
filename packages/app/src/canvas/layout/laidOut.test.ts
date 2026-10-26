import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { buildScene, type ElementShape } from '../scene';
import { laidOutBounds } from './laidOut';

const scene = buildScene(loadSample(), 'system-overview');
const container = scene.shapes.find((shape) => shape.holdsContents) as ElementShape;

describe('laidOutBounds', () => {
  it('is the whole view after a layout of the view', () => {
    expect(laidOutBounds(scene, [{ kind: 'view' }])).toEqual(scene.bounds);
    expect(laidOutBounds(scene, [{ kind: 'contents', container: 'x' }, { kind: 'view' }])).toEqual(
      scene.bounds,
    );
  });

  it('is the container whose contents were laid out, with what sticks out of it', () => {
    expect(laidOutBounds(scene, [{ kind: 'contents', container: container.element }])).toEqual(
      container.extent,
    );
  });

  it('holds every container laid out, and nothing for one the scene does not draw', () => {
    const other = scene.shapes.find(
      (shape) => shape.element !== container.element && !shape.key.startsWith(container.key),
    ) as ElementShape;
    const both = laidOutBounds(scene, [
      { kind: 'contents', container: container.element },
      { kind: 'contents', container: other.element },
    ]);
    for (const rect of [container.extent, other.extent]) {
      expect(both?.x).toBeLessThanOrEqual(rect.x);
      expect(both?.y).toBeLessThanOrEqual(rect.y);
      expect((both?.x ?? 0) + (both?.width ?? 0)).toBeGreaterThanOrEqual(rect.x + rect.width);
      expect((both?.y ?? 0) + (both?.height ?? 0)).toBeGreaterThanOrEqual(rect.y + rect.height);
    }
    expect(laidOutBounds(scene, [{ kind: 'contents', container: 'gone' }])).toBeUndefined();
  });
});
