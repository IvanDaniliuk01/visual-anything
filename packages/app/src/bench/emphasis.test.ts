/**
 * The benchmark's phase with text emphasis in every detail (ADR 0082, M3c Stage 2): every shape's
 * detail carries runs that draw differently from their source. The phase itself runs in the browser,
 * with `pnpm bench` and `?emphasis`.
 */
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EMPHASIS_ATTRIBUTE, withEmphasisDetail } from './emphasis';
import { syntheticProject } from './synthetic';

describe('the benchmark’s emphasis in every detail', () => {
  it('gives every element shape a detail with text emphasis', () => {
    const project = withEmphasisDetail(syntheticProject({ elements: 2000 }));
    const view = project.views[0]?.id ?? '';
    const scene = buildScene(project, view);
    const shapes = scene.shapes.filter((shape) => shape.element !== 'world');
    expect(shapes.length).toBeGreaterThan(1000);
    const emphasized = shapes.filter((shape) =>
      shape.detailRuns?.some((run) => run.bold || run.italic || run.code),
    );
    expect(emphasized.length).toBe(shapes.length);
    expect(emphasized[0]?.detail).toContain('**orders');
    expect(EMPHASIS_ATTRIBUTE).toBe('summary');
  });
});
