/**
 * Where the app reads a text that takes text emphasis without its markers (ADR 0082): find, the
 * explore filters, the element list's filter and sorting, and what is announced.
 */
import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { describeSelection } from '../canvas/announce';
import { indexScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { selectionOf } from '../editor/selection';
import { translatorFor } from '../i18n/t';
import { loadSample } from '../test/sample';
import {
  columnKey,
  columnsOf,
  filterElements,
  listedElements,
  shownCell,
  sortElements,
} from '../element-list/rows';
import { find, indexProject } from '../search/find';

const VIEW = 'system-overview';
const t = translatorFor('en');

/** The sample, with a `summary` that takes emphasis on the component of two of its elements. */
function project(): ProjectSnapshot {
  const sample = loadSample();
  const component = sample.model.elements.find((each) => each.id === 'appointments-db')!.component;
  return {
    ...sample,
    packages: sample.packages.map((file) => ({
      ...file,
      components: file.components.map((each) =>
        each.id === component
          ? {
              ...each,
              attributes: [
                ...(each.attributes ?? []),
                { name: 'summary', type: 'string' as const, format: 'emphasis' as const },
                { name: 'code', type: 'string' as const },
              ],
            }
          : each,
      ),
    })),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) =>
        each.id === 'appointments-db'
          ? { ...each, attributes: { ...each.attributes, summary: '**zebra** rows', code: '*x*' } }
          : each.component === component
            ? { ...each, attributes: { ...each.attributes, summary: 'apple rows' } }
            : each,
      ),
    },
    views: sample.views.map((view) =>
      view.id === VIEW
        ? {
            ...view,
            freeShapes: [
              ...view.freeShapes,
              {
                id: 'note-emphasis',
                kind: 'note' as const,
                x: 0,
                y: 900,
                width: 200,
                height: 80,
                text: 'Watch the **orders** table',
              },
            ],
          }
        : view,
    ),
  };
}

describe('find', () => {
  it('reads a note and an attribute that takes emphasis without their markers', () => {
    const state = project();
    const index = indexProject(state, definitionsIn(state));
    const note = find(index, 'the orders table').found[0];
    expect(note?.entry).toMatchObject({ kind: 'free-shape', name: 'Watch the orders table' });
    expect(find(index, 'zebra rows').found.map(({ entry }) => entry.id)).toEqual([
      'appointments-db',
    ]);
    // An attribute that takes no emphasis keeps its markers.
    expect(find(index, '*x*').found.map(({ entry }) => entry.id)).toContain('appointments-db');
  });
});

describe('the element list', () => {
  const state = project();
  const definitions = definitionsIn(state);
  const listed = listedElements(state, definitions, VIEW, { kind: 'view' });
  const columns = columnsOf(definitions, listed);
  const summary = columns.find((each) => columnKey(each) === 'attribute summary')!;

  it('shows a value that takes emphasis by its runs, and filters and sorts it by its plain text', () => {
    const db = listed.find((each) => each.id === 'appointments-db')!;
    expect(shownCell(t, state, db, summary, definitions)).toMatchObject({
      text: 'zebra rows',
      emphasis: '**zebra** rows',
    });
    expect(
      filterElements(t, state, listed, columns, 'zebra rows', summary, definitions).map(
        (each) => each.id,
      ),
    ).toEqual(['appointments-db']);
    const sorted = sortElements(listed, summary, 'descending', definitions).map((each) => each.id);
    expect(sorted[0]).toBe('appointments-db');
  });
});

describe('announcements', () => {
  it('say a note’s text without its markers', () => {
    const state = project();
    const indexed = indexScene(buildScene(state, VIEW));
    expect(
      describeSelection(indexed, state, selectionOf([{ kind: 'free-shape', id: 'note-emphasis' }])),
    ).toBe('Note: Watch the orders table.');
  });
});
