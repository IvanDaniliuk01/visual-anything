/**
 * The relations a scenario step plays, drawn in physical space (ADR 0076): lines between their ends'
 * points with their markers; an end in a collapsed container at its point; a relation on a relation
 * at the middle of that one's line when it is drawn, and not otherwise; each naming what its ends
 * are the points of, for the exploded view to move them.
 */
import { pointInSpace, spaceOf, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { workcell } from '../test/space';
import { NOTHING_EMPHASIZED } from '../canvas/emphasize';
import { buildScene } from '../canvas/scene';
import { selectionOf } from '../editor/selection';
import { selectionRelationsOf, spaceLinesOf, stepElementsInSpace } from './lines';

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

describe('the relations of the selection in physical space', () => {
  const nothing = { hidden: NOTHING_EMPHASIZED.hidden, dimmed: NOTHING_EMPHASIZED.dimmed };
  const hiding = (relations: string[], dimmed: string[] = []) => ({
    hidden: { ...NOTHING_EMPHASIZED.hidden, relations: new Set(relations) },
    dimmed: { ...NOTHING_EMPHASIZED.dimmed, relations: new Set(dimmed) },
  });

  it('are those the view draws that are selected or end on what is, the selected first', () => {
    const project = flowing();
    const space = spaceOf(project, project.views[0]);
    const scene = buildScene(project, 'cell-view');
    const selection = selectionOf([
      { kind: 'element', id: 'arm' },
      { kind: 'relation', id: 'feeds' },
    ]);
    // Not "elbow-in-arm": the view nests by it, so the canvas draws no line for it.
    expect(selectionRelationsOf(project, space, scene, nothing, selection)).toEqual([
      { relation: 'feeds', selected: true },
      { relation: 'sees' },
      { relation: 'lights' },
      { relation: 'moves' },
    ]);
    expect(
      selectionRelationsOf(project, space, scene, hiding(['sees'], ['moves']), selection),
    ).toEqual([
      { relation: 'feeds', selected: true },
      { relation: 'lights' },
      { relation: 'moves', faint: true },
    ]);
  });

  it('draws them after the markers’ lines, once each, ending on each other', () => {
    const project = flowing();
    const space = spaceOf(project, project.views[0]);
    const lines = spaceLinesOf(
      project,
      space,
      [{ relation: 'sees', progress: 0.5 }],
      [{ relation: 'feeds', selected: true }, { relation: 'sees' }, { relation: 'lights' }],
    );
    // "lights" starts at the lamp, which is in no place.
    expect(lines.map((line) => [line.relation, line.highlighted, line.selected])).toEqual([
      ['sees', true, undefined],
      ['feeds', undefined, true],
    ]);
    // Without the markers, "feeds" still ends at the middle of "sees", drawn for the selection.
    const plain = spaceLinesOf(
      project,
      space,
      [],
      [{ relation: 'sees', faint: true }, { relation: 'feeds' }],
    );
    expect(plain.map((line) => line.relation)).toEqual(['sees', 'feeds']);
    expect(plain[0]?.faint).toBe(true);
    expect(plain[1]?.ends).toEqual({ from: 'table', to: 'sees' });
  });

  it('takes a selected collapsed container’s relations to be those of what it is drawn as', () => {
    const project = flowing(['arm']);
    const space = spaceOf(project, project.views[0]);
    const scene = buildScene(project, 'cell-view');
    const found = selectionRelationsOf(
      project,
      space,
      scene,
      nothing,
      selectionOf([{ kind: 'element', id: 'arm' }]),
    ).map((each) => each.relation);
    expect(found).toContain('sees');
    // The arm's relation to its own elbow, inside it, is drawn by no line on the canvas.
    expect(found).not.toContain('moves');
  });
});
