import type { ProjectSnapshot } from '@visual-anything/core';
import { runsText } from '@visual-anything/core';
import type { Component } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { buildScene, buildSceneAfresh } from './scene';

const VIEW = 'system-overview';

/**
 * The sample with its Calendar taking a `note` that takes text emphasis, shown in its detail with
 * its own lines and placement, and the calendar's note written with emphasis.
 */
function withNote(note: string, own: Partial<Component['appearance']> = {}): ProjectSnapshot {
  const sample = loadSample();
  const packages = sample.packages.map((each) =>
    each.id !== 'clinic'
      ? each
      : {
          ...each,
          components: (each.components ?? []).map((component) =>
            component.id !== 'clinic.calendar'
              ? component
              : {
                  ...component,
                  attributes: [
                    ...(component.attributes ?? []),
                    { name: 'note', type: 'string' as const, format: 'emphasis' as const },
                    { name: 'code', type: 'string' as const },
                  ],
                  appearance: {
                    ...component.appearance,
                    detail: { attributes: ['note', 'code'] },
                    ...own,
                  },
                },
          ),
        },
  );
  const elements = sample.model.elements.map((element) =>
    element.component === 'clinic.calendar'
      ? { ...element, attributes: { ...element.attributes, note: note, code: "'**'::text" } }
      : element,
  );
  return { ...sample, packages, model: { ...sample.model, elements } };
}

function calendarShape(project: ProjectSnapshot) {
  const shape = buildScene(project, VIEW).shapes.find((each) =>
    project.model.elements.some(
      (element) => element.id === each.element && element.component === 'clinic.calendar',
    ),
  );
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
