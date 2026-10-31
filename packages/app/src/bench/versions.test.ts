import { checkProject, compareProjects } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from './synthetic';
import { READING_SIZE, changedVersion, renamedEverywhere, sideOfMerge } from './versions';

describe('the benchmark’s versions', () => {
  const older = syntheticProject({ elements: 1_000 });

  it('change a quarter each by renames, moves, additions and removals', () => {
    const newer = changedVersion(older, 100);
    expect(checkProject(newer).errors).toEqual([]);
    const { changes } = compareProjects(older, newer);
    const ofElements = (status: string) =>
      changes.filter((each) => each.status === status && each.ref.kind === 'element').length;
    expect(ofElements('added')).toBe(25);
    expect(ofElements('removed')).toBe(25);
    expect(ofElements('changed')).toBe(25);
    expect(changes.filter((each) => each.status === 'moved')).toHaveLength(25);
  });

  it('make the same version every time', () => {
    expect(changedVersion(older, 40)).toEqual(changedVersion(older, 40));
  });

  it('rename every element but World', () => {
    const { counts } = compareProjects(older, renamedEverywhere(older));
    expect(counts.changed).toBe(older.model.elements.length);
  });

  it('give each side of a merge its own edits of the model', () => {
    const ours = sideOfMerge(older.model, 'ours', { changes: 20, additions: 5 });
    const theirs = sideOfMerge(older.model, 'theirs', { changes: 20, additions: 5 });
    expect(ours.elements).toHaveLength(older.model.elements.length + 5);
    const changedIds = (side: typeof ours) =>
      side.elements
        .filter((each, at) => at < older.model.elements.length && each !== older.model.elements[at])
        .map((each) => each.id);
    expect(changedIds(ours)).toHaveLength(20);
    expect(changedIds(ours).some((id) => changedIds(theirs).includes(id))).toBe(false);
  });

  it('build the reading benchmark’s size: 100,000 elements and about 200,000 relations', () => {
    expect(READING_SIZE.elements).toBe(100_000);
    const small = syntheticProject({ ...READING_SIZE, elements: 10_000 });
    expect(small.model.relations.length).toBeGreaterThan(19_000);
    expect(small.model.relations.length).toBeLessThan(21_000);
  });
});
