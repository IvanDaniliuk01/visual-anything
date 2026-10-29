import { compareProjects, compareView } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { comparedSample, done, VIEW } from '../../test/comparison';
import { indexSceneAfresh } from '../hit';
import { buildScene, shapeKeyOf, shownBy } from '../scene';
import { comparisonScene, countsOf, lineMarkOf } from './scene';

const marksOf = (map: ReadonlyMap<string, string>) => Object.fromEntries([...map].sort());

describe('comparisonScene', () => {
  const { older, newer, view } = comparedSample();

  it('draws the older version before, marking what was removed, changed and moved', () => {
    const drawn = comparisonScene(older, newer, VIEW, view, 'before');
    expect(drawn.scene).toBe(buildScene(older, VIEW));
    const keyOf = (element: string) => shownBy(drawn.scene, element)?.key ?? element;
    expect(marksOf(drawn.shapes)).toEqual(
      marksOf(
        new Map([
          [keyOf('whatsapp'), 'changed'],
          [keyOf('patient'), 'moved'],
          [keyOf('reminder-service'), 'removed'],
        ]),
      ),
    );
    // The relations that ended on what was deleted went with it.
    expect(drawn.lines.get('api-to-reminders')).toBe('removed');
    expect(drawn.lines.get('reminders-in-scheduling')).toBeUndefined();
    expect(drawn.dashed.has('api-to-reminders')).toBe(true);
    // What the older version cannot show is not marked, and nothing is drawn at an older place.
    expect([...drawn.shapes.values()]).not.toContain('added');
    expect(drawn.removed.size).toBe(0);
    expect(drawn.moves).toEqual([]);
  });

  it('draws the newer version after, marking what was added, changed and moved', () => {
    const drawn = comparisonScene(older, newer, VIEW, view, 'after');
    expect(drawn.scene).toBe(buildScene(newer, VIEW));
    const marks = [...drawn.shapes.values()].sort();
    expect(marks).toEqual(['added', 'changed', 'moved']);
    expect(drawn.free.get('calendar-note')).toBe('moved');
    expect(drawn.lines.get('patient-to-whatsapp')).toBeUndefined();
    expect(drawn.unchanged.has('patient-to-whatsapp')).toBe(true);
  });

  it('draws what was removed at its older place in the comparison, faintly, and where moves came from', () => {
    const before = buildScene(older, VIEW);
    const drawn = comparisonScene(older, newer, VIEW, view, 'comparison');
    const reminder = before.shapes.find((shape) => shape.element === 'reminder-service');
    if (!reminder) throw new Error('The sample draws no reminder service.');
    const ghost = drawn.scene.shapes.find((shape) => shape.element === 'reminder-service');
    expect(ghost?.rect).toEqual(reminder.rect);
    expect(ghost?.containerShape).toBeUndefined();
    expect(drawn.removed.has(reminder.key)).toBe(true);
    expect(drawn.shapes.get(reminder.key)).toBe('removed');
    expect(drawn.scene.relations.some((line) => line.relation === 'api-to-reminders')).toBe(true);
    expect(drawn.removed.has('api-to-reminders')).toBe(true);
    // The patient moved: its older place is kept, as is the note's.
    const patient = drawn.moves.find((move) => move.key === shapeKeyOf(['patient']));
    expect(patient?.was.y).toBe(200);
    expect(patient?.is.y).toBe(360);
    expect(drawn.moves.some((move) => move.key === 'calendar-note')).toBe(true);
    // The scene still indexes, its drawing order holding every shape once.
    const order = drawn.scene.drawing ?? [];
    expect([...order].sort((a, b) => a - b)).toEqual(drawn.scene.shapes.map((_shape, at) => at));
    expect(() => indexSceneAfresh(drawn.scene)).not.toThrow();
    // Its bounds hold what was removed.
    const bounds = drawn.scene.bounds;
    expect(bounds && bounds.x <= reminder.rect.x).toBe(true);
  });

  it('lists what is marked in reading order, top to bottom', () => {
    const drawn = comparisonScene(older, newer, VIEW, view, 'comparison');
    const tops = drawn.targets.map((target) => target.rect.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(drawn.targets.map((target) => target.mark))).toEqual(
      new Set(['added', 'removed', 'changed', 'moved']),
    );
  });

  it('counts the view’s states, changed before moved', () => {
    const drawn = comparisonScene(older, newer, VIEW, view, 'after');
    // The relations that place what was added and removed go with it: they are drawn as containment.
    expect(drawn.counts).toEqual({ added: 1, removed: 2, changed: 1, moved: 2 });
    expect(countsOf(view.states).removed).toBe(3);
  });

  it('counts on a collapsed container the changes it hides', () => {
    const collapse = (state: typeof older) =>
      done(state, { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: true });
    const was = collapse(older);
    const is = collapse(newer);
    const comparison = compareProjects(was, is);
    const states = compareView(comparison, was, is, VIEW);
    const drawn = comparisonScene(was, is, VIEW, states, 'comparison');
    const scheduling = shownBy(drawn.scene, 'scheduling');
    if (!scheduling) throw new Error('Scheduling is not drawn.');
    // The reminder service and the relation from the API to it, deleted with it.
    expect(drawn.hidden.get(scheduling.key)).toBe(2);
    expect(drawn.scene.shapes.some((shape) => shape.element === 'reminder-service')).toBe(false);
  });

  it('draws nothing of a view a version does not have', () => {
    const without = { ...older, views: older.views.filter((each) => each.id !== VIEW) };
    const comparison = compareProjects(without, newer);
    const states = compareView(comparison, without, newer, VIEW);
    const before = comparisonScene(without, newer, VIEW, states, 'before');
    expect(before.scene.shapes).toEqual([]);
    const after = comparisonScene(without, newer, VIEW, states, 'after');
    expect(after.shapes.size).toBe(after.scene.shapes.length);
    expect(new Set(after.shapes.values())).toEqual(new Set(['added']));
  });
});

describe('lineMarkOf', () => {
  it('gives an aggregated line the one mark its relations share, or changed', () => {
    const line = {
      relation: 'aggregated x',
      aggregate: { relationType: 't', relations: ['a', 'b', 'c'] },
    } as unknown as Parameters<typeof lineMarkOf>[0];
    const states = (a: string, b: string) =>
      new Map([
        ['relation:a', { status: a }],
        ['relation:b', { status: b }],
        ['relation:c', { status: 'unchanged' }],
      ]) as unknown as Parameters<typeof lineMarkOf>[1];
    expect(lineMarkOf(line, states('removed', 'removed'))).toBe('removed');
    expect(lineMarkOf(line, states('added', 'removed'))).toBe('changed');
    expect(lineMarkOf(line, states('unchanged', 'unchanged'))).toBeUndefined();
  });
});
