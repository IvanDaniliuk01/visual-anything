import type { ProjectSnapshot } from '@visual-anything/core';
import { runsText } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { EMPHASIS_VIEW as VIEW, calendarOf, withEmphasis as withNote } from '../test/emphasis';
import { buildScene, buildSceneAfresh } from './scene';

function calendarShape(project: ProjectSnapshot) {
  const id = calendarOf(project);
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === id);
  if (!shape) throw new Error('The sample draws no calendar.');
  return shape;
}

describe('a shape’s detail with text emphasis (ADR 0082)', () => {
  it('carries the runs of the values that take emphasis, the others as written', () => {
    const shape = calendarShape(withNote('the **slots** table'));
    expect(shape.detail).toContain('the **slots** table');
    expect(runsText(shape.detailRuns ?? [])).toBe("Calendar · the slots table · '**'::text");
    expect(shape.detailRuns?.find((run) => run.bold)?.text).toBe('slots');
  });

  it('carries none when its values draw as written', () => {
    expect(calendarShape(withNote('plain slots')).detailRuns).toBeUndefined();
  });

  it('carries its lines and its placement only when they are not the default', () => {
    const plain = calendarShape(withNote('x'));
    expect(plain.detailLines).toBeUndefined();
    expect(plain.textPlacement).toBeUndefined();
    const own = calendarShape(
      withNote('x', { detail: { attributes: ['note'], lines: 5 }, textPlacement: 'top' }),
    );
    expect(own.detailLines).toBe(5);
    expect(own.textPlacement).toBe('top');
  });

  it('equals one built from nothing, and is the same object when built again', () => {
    const project = withNote('the **slots** table', { textPlacement: 'bottom' });
    const first = buildScene(project, VIEW);
    expect(first).toEqual(buildSceneAfresh(project, VIEW));
    const again = buildScene({ ...project }, VIEW);
    const key = first.shapes.find((shape) => shape.detailRuns)?.key;
    expect(again.shapes.find((shape) => shape.key === key)).toBe(
      first.shapes.find((shape) => shape.key === key),
    );
  });
});
