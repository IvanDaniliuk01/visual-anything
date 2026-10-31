// @vitest-environment node
/**
 * What the panel hands the solid worker (ADR 0076), and what it shows when it opens with nothing
 * chosen: the entries of a space with their solids, parts and markers, and World, the selected
 * element or the first that shows a solid.
 */
import { spaceOf } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { ARM_SOLID, workcell } from '../test/space';
import { MAX_SPACE_NAME, readSolidWorkerRequest } from '../solids/protocol';
import { drawsNothing, spaceEntriesOf } from './entries';
import { chosenSpace } from './root';

const name = (project: ReturnType<typeof workcell>) => (id: string) =>
  [project.model.world, ...project.model.elements].find((each) => each.id === id)?.name ?? id;

describe('the entries a space hands the worker', () => {
  it('draws solids with their bounds, parts in their holders, and markers', () => {
    const project = workcell();
    const space = spaceOf(project, project.views[0]);
    const entries = spaceEntriesOf(space, name(project));
    expect(entries.map((each) => ({ ...each, matrix: undefined }))).toEqual([
      { element: 'world', name: 'World' },
      // The table holds the camera: it is drawn as what is in it.
      { element: 'table', name: 'Table' },
      { element: 'arm', name: 'Arm', solid: ARM_SOLID.hash, bounds: ARM_SOLID.bounds },
      { element: 'camera', name: 'Camera', marker: true },
      { element: 'elbow', name: 'Elbow', part: { of: 'arm', index: 1 } },
    ]);
    expect(entries.find((each) => each.element === 'arm')?.matrix.slice(12, 15)).toEqual([2, 0, 0]);
    // What the worker takes.
    const read = readSolidWorkerRequest({
      type: 'space/show',
      space: 1,
      size: { width: 10, height: 10 },
      entries,
      states: [],
    });
    expect(read.ok).toBe(true);
  });

  it('draws faintly, after the rest, the containers the view does not show', () => {
    const project = workcell({
      view: { scope: { leftOut: ['arm', 'elbow', 'lamp', 'spare', 'table'] } },
    });
    const space = spaceOf(project, project.views[0]);
    const entries = spaceEntriesOf(space, name(project));
    expect(entries.map((each) => each.element)).toEqual(['world', 'camera', 'table']);
    expect(entries.at(-1)).toMatchObject({ element: 'table' });
    expect(entries.at(-1)?.marker).toBeUndefined();
  });

  it('says what a collapsed container draws its contents as, and the fill markers are drawn in', () => {
    const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const space = {
      entries: new Map([
        ['hall', { element: 'hall', how: 'posed' as const, in: 'world', matrix: IDENTITY }],
        [
          'lamp',
          {
            element: 'lamp',
            how: 'posed' as const,
            in: 'world',
            matrix: IDENTITY,
            drawnAs: 'hall',
          },
        ],
      ]),
      faint: new Map(),
    };
    const fills: Record<string, string> = { lamp: '#FFCC00', hall: 'red' };
    const entries = spaceEntriesOf(
      space,
      (id) => id,
      (id) => fills[id],
    );
    expect(entries).toEqual([
      { element: 'hall', name: 'hall', matrix: IDENTITY, marker: true },
      {
        element: 'lamp',
        name: 'lamp',
        matrix: IDENTITY,
        marker: true,
        as: 'hall',
        fill: '#FFCC00',
      },
    ]);
  });

  it('shortens a name past what the worker takes', () => {
    const project = workcell();
    const entries = spaceEntriesOf(spaceOf(project), () => 'x'.repeat(500));
    expect(entries[0]?.name).toHaveLength(MAX_SPACE_NAME);
    expect(entries[0]?.name.endsWith('…')).toBe(true);
  });

  it('says when a space draws nothing', () => {
    expect(drawsNothing(spaceOf(workcell({ posed: false })))).toBe(true);
    expect(drawsNothing(spaceOf(workcell()))).toBe(false);
    // An element that shows a solid draws it, even with nothing in it.
    expect(drawsNothing(spaceOf(workcell({ posed: false }), undefined, 'spare'))).toBe(false);
    // An element that is gone draws nothing.
    expect(drawsNothing(spaceOf(workcell(), undefined, 'gone'))).toBe(true);
  });
});

describe('what the panel shows when it opens with nothing chosen', () => {
  it('shows World when something the view shows is in physical space through it', () => {
    const project = workcell();
    expect(chosenSpace(project, project.views[0], new Set(['spare']))).toEqual({});
  });

  it('shows the selected element that shows a solid, or else the first one', () => {
    const project = workcell({ posed: false });
    const view = project.views[0];
    expect(chosenSpace(project, view, new Set(['spare']))).toEqual({ root: 'spare' });
    expect(chosenSpace(project, view, new Set(['lamp']))).toEqual({ root: 'arm' });
    expect(chosenSpace(project, view, new Set())).toEqual({ root: 'arm' });
  });

  it('leaves out what the view does not show, and shows World when nothing is left', () => {
    const scoped = workcell({
      posed: false,
      view: { scope: { leftOut: ['arm', 'camera', 'elbow', 'table'] } },
    });
    expect(chosenSpace(scoped, scoped.views[0], new Set())).toEqual({ root: 'spare' });
    const bare = workcell({
      posed: false,
      view: { scope: { leftOut: ['arm', 'camera', 'elbow', 'spare', 'table'] } },
    });
    expect(chosenSpace(bare, bare.views[0], new Set(['lamp']))).toEqual({});
  });
});
