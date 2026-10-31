/**
 * The relations a scenario step plays, drawn in physical space (ADR 0076): lines between their ends'
 * points with their markers; an end in a collapsed container at its point; a relation on a relation
 * at the middle of that one's line when it is drawn, and not otherwise; each naming what its ends
 * are the points of, for the exploded view to move them.
 */
import { pointInSpace, spaceOf, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { workcell } from '../test/space';
import { spaceLinesOf, stepElementsInSpace } from './lines';

const FLOWS = 'cell.flows';

/** The workcell with a relation from the camera to the arm, and one from the lamp to that relation. */
function flowing(collapsed: string[] = []): ProjectSnapshot {
  const project = workcell({ view: { collapsed } });
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        { id: 'sees', relationType: FLOWS, from: 'camera', to: 'arm' },
        { id: 'feeds', relationType: FLOWS, from: 'table', to: 'sees' },
        { id: 'lights', relationType: FLOWS, from: 'lamp', to: 'arm' },
        { id: 'moves', relationType: FLOWS, from: 'arm', to: 'elbow' },
      ],
    },
    packages: project.packages.map((each) => ({
      ...each,
      relationTypes: [
        ...(each.relationTypes ?? []),
        { id: FLOWS, name: 'flows to', derivesFrom: 'relates-to' },
      ],
    })),
  };
}

describe('lines in physical space', () => {
  it('runs between its ends’ points, with its markers', () => {
    const project = flowing();
    const view = project.views[0];
    const space = spaceOf(project, view);
    const [line] = spaceLinesOf(project, space, [{ relation: 'sees', progress: 0.25 }]);
    expect(line).toEqual({
      relation: 'sees',
      from: pointInSpace(space, 'camera'),
      to: pointInSpace(space, 'arm'),
      highlighted: true,
      markers: [0.25],
      ends: { from: 'camera', to: 'arm' },
    });
    // The arm's point is the middle of its solid's bounds.
    expect(line?.to).toEqual({ x: 2, y: 1, z: 0 });
  });

  it('ends a relation on a relation at the middle of that one’s line, only while it is drawn', () => {
    const project = flowing();
    const space = spaceOf(project, project.views[0]);
    const lines = spaceLinesOf(project, space, [
      { relation: 'sees', progress: 1 },
      { relation: 'feeds', progress: 1 },
    ]);
    const sees = lines.find((line) => line.relation === 'sees');
    const feeds = lines.find((line) => line.relation === 'feeds');
    expect(feeds?.to).toEqual({
      x: ((sees?.from.x ?? 0) + (sees?.to.x ?? 0)) / 2,
      y: ((sees?.from.y ?? 0) + (sees?.to.y ?? 0)) / 2,
      z: ((sees?.from.z ?? 0) + (sees?.to.z ?? 0)) / 2,
    });
    // Its end on the other line is that line's.
    expect(feeds?.ends).toEqual({ from: 'table', to: 'sees' });
    expect(spaceLinesOf(project, space, [{ relation: 'feeds', progress: 1 }])).toEqual([]);
  });

  it('draws nothing for an end not in physical space, nor for no markers', () => {
    const project = flowing();
    const space = spaceOf(project, project.views[0]);
    expect(spaceLinesOf(project, space, [{ relation: 'lights', progress: 0.5 }])).toEqual([]);
    expect(spaceLinesOf(project, space, [])).toEqual([]);
  });

  it('ends inside a collapsed container at its point, and leaves out a line of no length', () => {
    const project = flowing(['arm']);
    const space = spaceOf(project, project.views[0]);
    expect(spaceLinesOf(project, space, [{ relation: 'moves', progress: 0.5 }])).toEqual([]);
    expect(stepElementsInSpace(project, space, { relations: ['moves', 'sees'] }).sort()).toEqual([
      'arm',
      'camera',
    ]);
  });

  it('brings into view the ends of a step’s relations, through relations on relations', () => {
    const project = flowing();
    const space = spaceOf(project, project.views[0]);
    expect(stepElementsInSpace(project, space, { relations: ['feeds'] }).sort()).toEqual([
      'arm',
      'camera',
      'table',
    ]);
    expect(stepElementsInSpace(project, space, { relations: ['lights'] })).toEqual(['arm']);
    expect(stepElementsInSpace(project, space, { container: 'table' })).toEqual(['table']);
  });
});
