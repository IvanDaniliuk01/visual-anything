/** A second run when the view as laid out draws lines the first run was not given (ADR 0080, Stage 3). */
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { usersAndOrders, VIEW } from '../../test/tables';
import { buildSceneAfresh } from '../scene';
import { layOut } from './engine';
import { layoutInput } from './input';
import { inputAfter, sameRelations } from './settle';

const elk = new ELK();

describe('a second run for the lines a layout lets the view draw', () => {
  it('gives the reference between two tables that touched, which drew no line before', async () => {
    const width = buildSceneAfresh(usersAndOrders(), VIEW).shapes.find(
      (shape) => shape.element === 'users',
    )?.rect.width as number;
    // Orders stands against users' right side, at the height of its rows: the line has no length.
    const project = usersAndOrders({
      positions: [],
      tables: [
        {
          id: 'users',
          at: { x: 0, y: 0 },
          columns: [{ id: 'users-id', name: 'id', primaryKey: true }],
        },
        {
          id: 'orders',
          at: { x: width, y: -24 },
          columns: [
            { id: 'orders-id', name: 'id', primaryKey: true },
            { id: 'orders-user', name: 'user_id' },
          ],
        },
      ],
    });
    const scene = buildSceneAfresh(project, VIEW);
    expect(scene.relations).toHaveLength(0);
    const input = layoutInput(scene, project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const first = await layOut(input, elk);
    const again = inputAfter(project, VIEW, scene, { kind: 'view' }, input, first.shapes);
    expect(again?.relations).toHaveLength(1);
    // Laid out again with it, the view draws nothing the run was not given.
    if (!again) return;
    const second = await layOut(again, elk);
    expect(
      inputAfter(project, VIEW, scene, { kind: 'view' }, again, second.shapes),
    ).toBeUndefined();
  });

  it('runs once only when the view draws the same relations, and not for new shapes', async () => {
    const project = usersAndOrders();
    const scene = buildSceneAfresh(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    expect(input.relations).toHaveLength(1);
    const laid = await layOut(input, elk);
    expect(inputAfter(project, VIEW, scene, { kind: 'view' }, input, laid.shapes)).toBeUndefined();
    const keys = new Set(scene.shapes.map((shape) => shape.key));
    expect(
      inputAfter(project, VIEW, scene, { kind: 'new', keys }, input, laid.shapes),
    ).toBeUndefined();
    expect(sameRelations(input, input)).toBe(true);
    expect(sameRelations(input, { ...input, relations: [] })).toBe(false);
  });
});
