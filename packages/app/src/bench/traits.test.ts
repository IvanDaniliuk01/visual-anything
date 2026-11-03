/**
 * The benchmark's run with every trait set (ADR 0088, A6.5): every shape carries a style and a text
 * of its own, and some are turned and mirrored. The run itself is in the browser, with `pnpm bench`
 * and `?traits`.
 */
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { syntheticProject } from './synthetic';
import { withEveryTrait } from './traits';

describe('the benchmark’s every trait set', () => {
  const project = withEveryTrait(syntheticProject({ elements: 2000 }));
  const view = project.views[0]?.id ?? '';
  const scene = buildScene(project, view);
  const shapes = scene.shapes.filter((shape) => shape.element !== 'world');

  it('gives every shape every Style trait and a text of its own', () => {
    expect(shapes.length).toBeGreaterThan(1000);
    expect(shapes.every((shape) => shape.style?.gradient !== undefined)).toBe(true);
    expect(shapes.every((shape) => shape.style?.shadow === 'soft')).toBe(true);
    expect(shapes.every((shape) => shape.style?.borderWidth !== undefined)).toBe(true);
    expect(shapes.some((shape) => shape.style?.dash === 'dotted')).toBe(true);
    expect(shapes.some((shape) => (shape.style?.opacity ?? 1) < 1)).toBe(true);
    expect(shapes.every((shape) => shape.text !== undefined)).toBe(true);
  });

  it('turns and mirrors some shapes, never a container', () => {
    expect(shapes.some((shape) => shape.rotation !== undefined)).toBe(true);
    expect(shapes.some((shape) => shape.flip !== undefined)).toBe(true);
    const containers = new Set(shapes.map((shape) => shape.container));
    expect(
      shapes.some((shape) => containers.has(shape.element) && shape.rotation !== undefined),
    ).toBe(false);
  });

  it('sets no shadow with unshadowed', () => {
    const plain = buildScene(
      withEveryTrait(syntheticProject({ elements: 200 }), { shadow: false }),
      view,
    );
    expect(plain.shapes.every((shape) => shape.style?.shadow !== 'soft')).toBe(true);
  });
});
