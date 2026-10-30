/**
 * A view that draws only key rows (ADR 0080, section 5, `rows: "keys"`): each table draws the rows
 * that are part of its primary key or that a relation the view draws ends on, its header counts the
 * rest, relations still attach at their rows, and the rows left out are shown by their table.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadDataModel } from '../test/dataModel';
import { keyRowsOf } from './keyRows';
import { ROWS_FOOT, ROWS_HEADER, ROW_HEIGHT, rowMiddle } from './rows';
import { buildScene, buildSceneAfresh, shownBy, type ElementShape } from './scene';

const VIEW = 'schema-view';
const base = loadDataModel();

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

const keys = run(base, { type: 'update-view', id: VIEW, changes: { rows: 'keys' } });
const tablesOf = (shapes: readonly ElementShape[]) =>
  shapes.filter((shape) => shape.rowCount !== undefined && shape.collapsed === undefined);

describe('a view that draws only key rows', () => {
  const all = buildSceneAfresh(base, VIEW);
  const scene = buildSceneAfresh(keys, VIEW);
  const view = keys.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('No view');
  const keyRows = keyRowsOf(keys, view, new Set(view.nestingRelationTypes)) ?? new Set();

  it('draws only the rows that are keys, and counts the rest in the header', () => {
    const before = new Map(tablesOf(all.shapes).map((shape) => [shape.key, shape]));
    let fewer = 0;
    for (const table of tablesOf(scene.shapes)) {
      const was = before.get(table.key) as ElementShape;
      const rows = scene.shapes.filter((shape) => shape.containerShape === table.key);
      for (const row of rows) expect(keyRows.has(row.element)).toBe(true);
      expect(table.rowCount).toBe(rows.length);
      const left = (was.rowCount ?? 0) - rows.length;
      expect(table.rowsLeft ?? 0).toBe(left);
      if (left > 0) {
        fewer += 1;
        expect(table.fitted?.detail).toContain(`${left} more`);
      }
      expect(table.rect.height).toBe(
        ROWS_HEADER + Math.max(1, rows.length) * ROW_HEIGHT + ROWS_FOOT,
      );
    }
    expect(fewer).toBeGreaterThan(0);
  });

  it('attaches every relation at a row it draws, at that row’s middle', () => {
    expect(scene.relations.length).toBe(all.relations.length);
    const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
    for (const line of scene.relations) {
      for (const end of [line.ends?.from, line.ends?.to]) {
        if (end?.kind !== 'shape') continue;
        const shape = byKey.get(end.key);
        expect(shape).toBeDefined();
        if (shape?.row === undefined || shape.containerShape === undefined) continue;
        const table = byKey.get(shape.containerShape) as ElementShape;
        const at = end === line.ends?.from ? line.route[0] : line.route.at(-1);
        expect(at?.y).toBeCloseTo(rowMiddle(table.rect, shape.row));
      }
    }
  });

  it('shows a row left out by its table', () => {
    const table = tablesOf(scene.shapes).find((shape) => (shape.rowsLeft ?? 0) > 0);
    if (!table) throw new Error('No table leaves rows out');
    const drawn = new Set(scene.shapes.map((shape) => shape.element));
    const leftOut = base.model.relations.find(
      (relation) => relation.to === table.element && !drawn.has(relation.from),
    );
    if (!leftOut) throw new Error('No row left out');
    expect(shownBy(scene, leftOut.from)?.key).toBe(table.key);
  });

  it('draws every row again with all, and keeps its rows when a relation reaches another', () => {
    const back = run(keys, { type: 'update-view', id: VIEW, changes: { rows: 'all' } });
    expect(buildScene(back, VIEW).shapes.length).toBe(all.shapes.length);
    const first = buildScene(keys, VIEW);
    const table = tablesOf(first.shapes).find((shape) => (shape.rowsLeft ?? 0) > 0);
    if (!table) throw new Error('No table leaves rows out');
    const drawn = new Set(first.shapes.map((shape) => shape.element));
    const hidden = base.model.relations.find(
      (relation) => relation.to === table.element && !drawn.has(relation.from),
    );
    if (!hidden) throw new Error('No row left out');
    const other = tablesOf(first.shapes).find((shape) => shape.key !== table.key) as ElementShape;
    const related = run(keys, {
      type: 'create-relation',
      relation: { relationType: 'data-modeling.references', from: hidden.from, to: other.element },
    });
    const after = buildScene(related, VIEW);
    expect(after.shapes.some((shape) => shape.element === hidden.from)).toBe(true);
  });
});
