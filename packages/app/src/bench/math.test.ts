// @vitest-environment node
import { checkProject, typesetMath } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { FORMULAS, MATH_NOTES, formulaAt, typesetDistinct, withMathDetail } from './math';
import { syntheticProject } from './synthetic';

describe('the benchmark’s Math (A9.5)', () => {
  it('typesets every formula, inline and in display style', () => {
    expect(FORMULAS).toHaveLength(50);
    for (const [at] of FORMULAS.entries()) {
      for (const display of [false, true]) {
        const typeset = typesetMath(formulaAt(at), { display });
        expect(typeset.ok, `${formulaAt(at)} ${typeset.ok ? '' : typeset.error}`).toBe(true);
      }
    }
  });

  it('gives every detail a distinct formula and the view notes with a display block each', () => {
    const plain = syntheticProject({ elements: 200 });
    const project = withMathDetail(plain, { math: true });
    expect(checkProject(project).errors).toEqual([]);
    const scene = buildScene(project, project.views[0]!.id);
    const formulas = scene.shapes.map(
      (shape) => shape.detailRuns?.find((run) => run.math)?.math?.tex,
    );
    expect(formulas.every((tex) => tex !== undefined)).toBe(true);
    expect(new Set(formulas).size).toBe(formulas.length);
    expect(scene.notes).toHaveLength(MATH_NOTES);
    expect(scene.notes.every((note) => note.text.includes('$$'))).toBe(true);
    // The notes lie below every shape.
    const lowest = Math.max(...scene.shapes.map((shape) => shape.rect.y + shape.rect.height));
    expect(Math.min(...scene.notes.map((note) => note.rect.y))).toBeGreaterThan(lowest);
  });

  it('has a twin without Math, of the same shapes and notes', () => {
    const plain = syntheticProject({ elements: 200 });
    const twin = buildScene(withMathDetail(plain, { math: false }), plain.views[0]!.id);
    const math = buildScene(withMathDetail(plain, { math: true }), plain.views[0]!.id);
    expect(twin.shapes.map((shape) => shape.rect)).toEqual(math.shapes.map((shape) => shape.rect));
    expect(twin.notes).toHaveLength(MATH_NOTES);
    expect(twin.shapes.some((shape) => shape.detailRuns?.some((run) => run.math))).toBe(false);
    expect(twin.notes.some((note) => note.text.includes('$'))).toBe(false);
  });

  it('times distinct formulas', () => {
    const timing = typesetDistinct(60, 'test', () => performance.now());
    expect(timing.each).toHaveLength(60);
    expect(timing.failed).toBe(0);
  });
});
