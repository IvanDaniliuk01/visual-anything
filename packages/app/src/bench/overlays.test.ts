/**
 * The benchmark's overlays and levels of detail are ones the core accepts, and do to the synthetic
 * view what their phases mean to measure (ADR 0055).
 */
import { executeCommand } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildSceneAfresh } from '../canvas/scene';
import { LOAD_FILL, LOAD_SIZE, SERVICE_LEVELS, withLoad } from './overlays';
import { syntheticProject } from './synthetic';

describe('the benchmark’s overlays and levels', () => {
  const project = withLoad(syntheticProject({ elements: 200 }));
  const view = project.views[0]?.id ?? '';

  it('color and size the shapes by their load', () => {
    const outcome = executeCommand(project, {
      type: 'set-overlays',
      view,
      overlays: [LOAD_FILL, LOAD_SIZE],
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(outcome.warnings).toEqual([]);
    const plain = buildSceneAfresh(project, view);
    const overlaid = buildSceneAfresh(outcome.state, view);
    const leaves = overlaid.shapes.filter((shape) => !shape.holdsContents);
    expect(leaves.length).toBeGreaterThan(100);
    // Every leaf whose load is not the middle one is sized, keeping where layout put it.
    const sized = leaves.filter((shape) => shape.laidOut !== undefined);
    expect(sized.length).toBeGreaterThan(leaves.length * 0.9);
    for (const shape of sized) expect(shape.rect.width).not.toBe(shape.laidOut?.width);
    const fills = new Set(leaves.map((shape) => shape.fill));
    expect(fills.size).toBeGreaterThan(10);
    expect(overlaid.shapes.map((shape) => shape.key)).toEqual(
      plain.shapes.map((shape) => shape.key),
    );
  });

  it('give every Service levels of detail', () => {
    const outcome = executeCommand(project, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { levels: SERVICE_LEVELS },
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const scene = buildSceneAfresh(outcome.state, view);
    expect(scene.shapes.some((shape) => shape.levels !== undefined)).toBe(true);
  });
});
