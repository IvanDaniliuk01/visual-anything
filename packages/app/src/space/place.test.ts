// @vitest-environment node
/**
 * Place in physical space and Take out of physical space in the panel (ADR 0076), the panel's list
 * by what each is posed or anchored in, and where an element is in words: each action one
 * `set-poses`, which the core takes.
 */
import { executeCommand, spaceOf, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n';
import { shownRows } from '../shell/tree';
import { workcell } from '../test/space';
import { holdersOf, spaceListOf } from './list';
import { placeable, placeCommand, removable, takeOutCommand } from './place';
import { whereIs, whereSelected } from './where';

const t = translatorFor('en');

/** The workcell with the lamp held by the table, which is in physical space, and the spare by none. */
function cell(): ProjectSnapshot {
  const project = workcell();
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        { id: 'lamp-in-table', relationType: 'cell.inside', from: 'lamp', to: 'table' },
      ],
    },
  };
}

describe('Place in physical space', () => {
  it('poses what is not in the space in its first container there, at the camera’s target', () => {
    const project = cell();
    const space = spaceOf(project, project.views[0]);
    const selected = new Set(['lamp', 'spare', 'arm', 'world']);
    expect(placeable(project, space, selected)).toEqual(['lamp', 'spare']);
    const placed = placeCommand(project, space, ['lamp', 'spare'], { x: 1, y: 2, z: 3 });
    expect(placed?.command).toEqual({
      type: 'set-poses',
      poses: [
        { element: 'lamp', pose: { in: 'table', at: { x: 1, y: 2, z: 3 } } },
        { element: 'spare', pose: { at: { x: 1, y: 2, z: 3 } } },
      ],
    });
    expect(placed?.placed).toEqual([
      { element: 'lamp', in: 'table', shown: true },
      { element: 'spare', in: 'world', shown: true },
    ]);
    const done = executeCommand(project, placed!.command);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(spaceOf(done.state).entries.get('lamp')?.matrix.slice(12, 15)).toEqual([1, 2, 3]);
    expect(placeCommand(project, space, [], { x: 0, y: 0, z: 0 })).toBeUndefined();
  });

  it('carries the target into World while the panel shows an element in it, else uses World’s origin', () => {
    const project = cell();
    // The panel shows the arm, at x = 2 in World.
    const armSpace = spaceOf(project, project.views[0], 'arm');
    const placed = placeCommand(project, armSpace, ['spare'], { x: 0.5, y: 0, z: 0 });
    expect(placed?.command.poses).toEqual([
      { element: 'spare', pose: { at: { x: 2.5, y: 0, z: 0 } } },
    ]);
    expect(placed?.placed[0]?.shown).toBe(false);
    // The spare arm is in no place under World, and holds no lamp: the lamp goes to World's origin.
    const spareSpace = spaceOf(project, project.views[0], 'spare');
    const lost = placeCommand(project, spareSpace, ['lamp'], { x: 0.5, y: 0, z: 0 });
    expect(lost?.command.poses).toEqual([{ element: 'lamp', pose: { at: { x: 0, y: 0, z: 0 } } }]);
  });
});

describe('Take out of physical space', () => {
  it('takes away only the poses of what is posed in the space', () => {
    const project = cell();
    const space = spaceOf(project, project.views[0]);
    const elements = removable(space, new Set(['camera', 'elbow', 'world', 'lamp']));
    expect(elements).toEqual(['camera']);
    const command = takeOutCommand(elements);
    expect(command).toEqual({ type: 'set-poses', poses: [{ element: 'camera', pose: null }] });
    expect(executeCommand(project, command!).ok).toBe(true);
    expect(takeOutCommand([])).toBeUndefined();
  });
});

describe('the panel’s list', () => {
  it('gives what the panel shows as a tree, by what each is posed or anchored in', () => {
    const project = workcell();
    const items = spaceListOf(spaceOf(project, project.views[0]));
    const rows = shownRows(items, () => true).rows;
    expect(rows.map((row) => [row.item.element, row.level, row.item.how])).toEqual([
      ['world', 1, 'root'],
      ['table', 2, 'posed'],
      ['camera', 3, 'posed'],
      ['arm', 2, 'posed'],
      ['elbow', 3, 'anchored'],
    ]);
    expect(holdersOf(items, 'camera')).toEqual(['world', 'table']);
    expect(holdersOf(items, 'world')).toEqual([]);
  });

  it('keeps the containers the view does not show where they hold what it does', () => {
    const project = workcell({
      view: { scope: { leftOut: ['arm', 'elbow', 'lamp', 'spare', 'table'] } },
    });
    const rows = shownRows(spaceListOf(spaceOf(project, project.views[0])), () => true).rows;
    expect(rows.map((row) => [row.item.element, row.level, row.item.how])).toEqual([
      ['world', 1, 'root'],
      ['table', 2, 'faint'],
      ['camera', 3, 'posed'],
    ]);
  });
});

describe('where an element is, in words', () => {
  it('says how each is there and how far from what it is posed in', () => {
    const project = cell();
    const space = spaceOf(project, project.views[0]);
    expect(whereIs(t, project, space, 'camera')).toBe('Camera, posed in Table, 80 cm from it');
    expect(whereIs(t, project, space, 'table')).toBe('Table, posed in World, at its origin');
    expect(whereIs(t, project, space, 'elbow')).toBe('Elbow, anchored to the part “elbow” of Arm');
    expect(whereIs(t, project, space, 'world')).toBe('World, which the panel shows');
    expect(whereIs(t, project, space, 'lamp')).toBe('Lamp, not in this physical space');
    expect(whereSelected(t, project, space, ['camera'])).toBe(
      'Camera, posed in Table, 80 cm from it.',
    );
    expect(whereSelected(t, project, space, ['camera', 'lamp'])).toBe(
      '2 elements selected, 1 of them in this physical space.',
    );
    const collapsed = workcell({ view: { collapsed: ['table'] } });
    expect(whereIs(t, collapsed, spaceOf(collapsed, collapsed.views[0]), 'camera')).toBe(
      'Camera, posed in Table, 80 cm from it, drawn as Table, which is collapsed',
    );
    const faint = workcell({ view: { scope: { leftOut: ['table'] } } });
    expect(whereIs(t, faint, spaceOf(faint, faint.views[0]), 'table')).toBe(
      'Table, drawn faintly: this view does not show it',
    );
  });

  it('reads in Spanish', () => {
    const project = cell();
    const space = spaceOf(project, project.views[0]);
    expect(whereIs(translatorFor('es'), project, space, 'camera')).toBe(
      'Camera, ubicado en Table, a 80 cm de él',
    );
  });
});
