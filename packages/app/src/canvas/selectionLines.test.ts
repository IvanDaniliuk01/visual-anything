/**
 * The selection's relations, with the rest faint (ADR 0080, section 5): in a view with more than 40
 * lines, selecting a shape, a row or a relation draws the lines that do not touch it faintly.
 */
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { loadDataModel } from '../test/dataModel';
import { loadSample } from '../test/sample';
import { buildScene, standsFor, type Scene } from './scene';
import { MANY_LINES, selectionLinesEmphasis } from './selectionLines';

const model = loadDataModel();
const tables = buildScene(model, 'schema-view');

/** A table of the schema view that draws rows, with a relation on one of its rows. */
function tableWithRelations(scene: Scene) {
  for (const line of scene.relations) {
    const end = line.ends?.from;
    if (end?.kind !== 'shape') continue;
    const row = scene.shapes.find((shape) => shape.key === end.key);
    if (row?.row === undefined || row.containerShape === undefined) continue;
    const table = scene.shapes.find((shape) => shape.key === row.containerShape);
    if (table) return { table, row, line };
  }
  throw new Error('No relation on a row.');
}

describe('the selection’s relations, with the rest faint', () => {
  it('fades every line that does not touch a selected row', () => {
    expect(tables.relations.length).toBeLessThanOrEqual(MANY_LINES);
    const overview = buildScene(model, 'overview');
    expect(overview.relations.length).toBeGreaterThan(MANY_LINES);
    const { row, line } = tableWithRelations(overview);
    const shown = selectionLinesEmphasis(
      overview,
      selectionOf([{ kind: 'element', id: row.element }]),
    );
    const dimmed = shown?.dimmed ?? new Set();
    expect(dimmed.has(line.relation)).toBe(false);
    expect(dimmed.size).toBeGreaterThan(0);
    for (const each of overview.relations) {
      const touches = [each.ends?.from, each.ends?.to].some(
        (end) => end?.kind === 'shape' && end.key === row.key,
      );
      if (touches) expect(dimmed.has(each.relation)).toBe(false);
    }
  });

  it('keeps the lines of a selected table’s rows, and of a selected relation', () => {
    const overview = buildScene(model, 'overview');
    const { table, line } = tableWithRelations(overview);
    const byTable = selectionLinesEmphasis(
      overview,
      selectionOf([{ kind: 'element', id: table.element }]),
    );
    expect(byTable?.dimmed?.has(line.relation)).toBe(false);
    const byLine = selectionLinesEmphasis(
      overview,
      selectionOf([{ kind: 'relation', id: standsFor(line)[0] as string }]),
    );
    expect(byLine?.dimmed?.has(line.relation)).toBe(false);
    expect(byLine?.dimmed?.size).toBe(overview.relations.length - 1);
  });

  it('fades nothing with few lines, nothing selected, or what the filters hide', () => {
    const sample = buildScene(loadSample(), 'system-overview');
    const first = sample.shapes[0];
    if (!first) throw new Error('No shape');
    expect(sample.relations.length).toBeLessThanOrEqual(MANY_LINES);
    expect(
      selectionLinesEmphasis(sample, selectionOf([{ kind: 'element', id: first.element }])),
    ).toBeUndefined();
    const overview = buildScene(model, 'overview');
    expect(selectionLinesEmphasis(overview, selectionOf([]))).toBeUndefined();
    const { row } = tableWithRelations(overview);
    const hidden = new Set(overview.relations.map((each) => each.relation));
    expect(
      selectionLinesEmphasis(overview, selectionOf([{ kind: 'element', id: row.element }]), hidden),
    ).toBeUndefined();
  });
});
