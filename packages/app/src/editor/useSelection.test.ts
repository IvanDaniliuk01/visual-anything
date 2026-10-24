import type { ProjectSnapshot } from '@visual-anything/core';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { selectionOf } from './selection';
import { useSelection } from './useSelection';

const sample = loadSample();

/** The sample without one element, as an undo of its creation or an edit by Claude leaves it. */
function without(project: ProjectSnapshot, id: string): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.filter((each) => each.id !== id),
      relations: project.model.relations.filter((each) => each.from !== id && each.to !== id),
    },
  };
}

/** The project with one element renamed: a change that removes nothing. */
function renamed(project: ProjectSnapshot, id: string, name: string): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((each) => (each.id === id ? { ...each, name } : each)),
    },
  };
}

function render(project: ProjectSnapshot) {
  return renderHook(({ project: current }) => useSelection(current, current.views[0]), {
    initialProps: { project },
  });
}

describe('useSelection', () => {
  const both = selectionOf([
    { kind: 'element', id: 'patient' },
    { kind: 'element', id: 'appointments-db' },
  ]);

  it('keeps what is selected while all of it exists', () => {
    const { result, rerender } = render(sample);
    act(() => result.current[1](both));
    rerender({ project: renamed(sample, 'patient', 'Client') });
    expect(result.current[0]).toBe(both);
  });

  it('drops what an edit removed, and keeps one identity from then on', () => {
    const { result, rerender } = render(sample);
    act(() => result.current[1](both));
    const gone = without(sample, 'patient');
    rerender({ project: gone });
    const pruned = result.current[0];
    expect([...pruned.elements]).toEqual(['appointments-db']);
    rerender({ project: renamed(gone, 'appointments-db', 'Calendar') });
    expect(result.current[0]).toBe(pruned);
    rerender({ project: renamed(gone, 'scheduling', 'Planning') });
    expect(result.current[0]).toBe(pruned);
  });
});
