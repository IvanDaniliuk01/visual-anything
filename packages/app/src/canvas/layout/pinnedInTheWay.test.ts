import { applyOperations, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { translateMessage } from '../../i18n/translate';
import { loadDataModel } from '../../test/dataModel';
import { buildSceneAfresh } from '../scene';
import { pinnedInTheWay, unpinCommand, unpinLabel } from './pinnedInTheWay';

const base = loadDataModel();

function viewOf(project: ProjectSnapshot, id: string): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

/** The fixture's overview with every container open, as the research measured it. */
function openOverview(): ProjectSnapshot {
  const done = executeCommand(base, {
    type: 'set-collapsed',
    view: 'overview',
    elements: [...(viewOf(base, 'overview').collapsed ?? [])],
    collapsed: false,
  });
  if (!done.ok) throw new Error('Could not expand.');
  return done.state;
}

describe('pinned shapes in the way of Layout (ADR 0080)', () => {
  it("finds overview's pinned schemas, which keep the one-pass layout from placing what they hold", () => {
    const scene = buildSceneAfresh(openOverview(), 'overview');
    const found = pinnedInTheWay(scene);
    const holding = found.filter((each) => each.holdsRelated);
    // The research found four pinned schemas leaving most of the user's overview lines outside ELK's
    // run; of the fixture's six pinned schemas, three hold ends of relations to other schemas.
    expect(holding.map(({ shape }) => shape.element).sort()).toEqual([
      'schema-b',
      'schema-d',
      'schema-e',
    ]);
    for (const { shape } of found) expect(shape.positioned).toBe('pinned');
    // And pinned shapes that cover each other stay overlapped.
    expect(found.some((each) => each.overlaps.length > 0)).toBe(true);
  });

  it('finds none in a view that pins nothing', () => {
    expect(pinnedInTheWay(buildSceneAfresh(base, 'schema-view'))).toEqual([]);
  });

  it('unpins them where they are in one undoable action, after which none is in the way', () => {
    const project = openOverview();
    const scene = buildSceneAfresh(project, 'overview');
    const shapes = pinnedInTheWay(scene).map(({ shape }) => shape);
    const command = unpinCommand(viewOf(project, 'overview'), shapes);
    if (!command) throw new Error('Nothing to unpin.');
    expect(command.type === 'batch' && command.label).toBe(`Unpin ${shapes.length} shapes`);
    const done = executeCommand(project, command);
    if (!done.ok) throw new Error('The unpinning was refused.');
    const after = buildSceneAfresh(done.state, 'overview');
    expect(pinnedInTheWay(after).filter((each) => each.holdsRelated)).toEqual([]);
    // They stay where they were.
    const was = new Map(scene.shapes.map((shape) => [shape.key, shape.rect]));
    for (const shape of after.shapes) {
      if (shapes.some((each) => each.key === shape.key))
        expect(shape.rect).toEqual(was.get(shape.key));
    }
    // Undo pins them again.
    const undone = applyOperations(done.state, done.inverse).state;
    expect(viewOf(undone, 'overview')).toEqual(viewOf(project, 'overview'));
  });

  it('names its action in English and Spanish', () => {
    const shapes = pinnedInTheWay(buildSceneAfresh(openOverview(), 'overview')).map(
      ({ shape }) => shape,
    );
    const [first] = shapes;
    if (!first) throw new Error('None found.');
    expect(translateMessage('es', unpinLabel(shapes))).toBe(`Desfijar ${shapes.length} formas`);
    expect(translateMessage('es', unpinLabel([first]))).toBe(`Desfijar "${first.name}"`);
  });
});
