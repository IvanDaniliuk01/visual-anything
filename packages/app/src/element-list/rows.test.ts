import { definitionsIn, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import { loadSample } from '../test/sample';
import {
  cellText,
  cellValue,
  columnKey,
  columnLabel,
  columnsOf,
  filterElements,
  listedElements,
  sortElements,
} from './rows';

const VIEW = 'system-overview';
const t = translatorFor('en');

function sample(): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'batch',
    label: 'Set up',
    commands: [
      {
        type: 'update-element',
        id: 'appointments-db',
        changes: { ids: { wikidata: 'Q8513' }, attributes: { sizeGb: 20 } },
      },
      {
        type: 'update-element',
        id: 'appointments-api',
        changes: { attributes: { sizeGb: 3, docs: { url: 'https://docs.example.org' } } },
      },
    ],
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('what the list lists', () => {
  const project = sample();

  it('lists what the open view shows, in the model’s order, World left out', () => {
    const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
    expect(listed.map((each) => each.id)).toEqual(project.model.elements.map((each) => each.id));
  });

  it('lists only what a scope shows', () => {
    const scoped = executeCommand(project, {
      type: 'leave-out-of-view',
      view: VIEW,
      elements: ['patient'],
    });
    if (!scoped.ok) throw new Error('It leaves out.');
    const listed = listedElements(scoped.state, definitionsIn(scoped.state), VIEW, {
      kind: 'view',
    });
    expect(listed.some((each) => each.id === 'patient')).toBe(false);
  });

  it('lists a component’s elements, with those of components derived from it unless exactly', () => {
    const service = listedElements(project, definitionsIn(project), VIEW, {
      kind: 'component',
      component: 'systems.service',
      exactly: true,
    });
    expect(service.every((each) => each.component === 'systems.service')).toBe(true);
    const derived = listedElements(project, definitionsIn(project), VIEW, {
      kind: 'component',
      component: 'systems.service',
      exactly: false,
    });
    expect(derived.length).toBeGreaterThanOrEqual(service.length);
  });
});

describe('its columns', () => {
  const project = sample();
  const definitions = definitionsIn(project);
  const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
  const columns = columnsOf(definitions, listed);

  it('has the name, the component when several are listed, the attributes and the identifiers', () => {
    const keys = columns.map(columnKey);
    expect(keys.slice(0, 2)).toEqual(['name', 'component']);
    expect(keys).toContain('attribute sizeGb');
    expect(keys).toContain('attribute docs');
    expect(keys.at(-1)).toBe('id wikidata');
  });

  it('names each column', () => {
    const byKey = new Map(columns.map((each) => [columnKey(each), each]));
    expect(columnLabel(t, byKey.get('name')!)).toBe('Name');
    expect(columnLabel(t, byKey.get('id wikidata')!)).toBe('wikidata');
    expect(columnLabel(translatorFor('es'), byKey.get('component')!)).toBe('Componente');
  });

  it('gives each cell its value and its text', () => {
    const db = project.model.elements.find((each) => each.id === 'appointments-db')!;
    const api = project.model.elements.find((each) => each.id === 'appointments-api')!;
    const byKey = new Map(columns.map((each) => [columnKey(each), each]));
    expect(cellValue(db, byKey.get('id wikidata')!, definitions)).toBe('Q8513');
    expect(cellValue(db, byKey.get('attribute sizeGb')!, definitions)).toBe(20);
    expect(cellText(t, project, cellValue(api, byKey.get('attribute docs')!, definitions))).toBe(
      'a page of docs.example.org',
    );
  });
});

describe('sorting and filtering', () => {
  const project = sample();
  const definitions = definitionsIn(project);
  const listed = listedElements(project, definitionsIn(project), VIEW, { kind: 'view' });
  const columns = columnsOf(definitions, listed);
  const size = columns.find((each) => columnKey(each) === 'attribute sizeGb')!;

  it('sorts numbers as numbers, with empty cells last both ways, and keeps the order of ties', () => {
    const up = sortElements(listed, size, 'ascending', definitions).map((each) => each.id);
    expect(up.slice(0, 2)).toEqual(['appointments-api', 'appointments-db']);
    const down = sortElements(listed, size, 'descending', definitions).map((each) => each.id);
    expect(down.slice(0, 2)).toEqual(['appointments-db', 'appointments-api']);
    // Empty cells keep the model's order, after the others.
    expect(up.slice(2)).toEqual(
      listed.filter((each) => each.attributes?.sizeGb === undefined).map((each) => each.id),
    );
  });

  it('filters by words that each cell of a row, or of one column, holds', () => {
    const found = filterElements(t, project, listed, columns, 'q8513', undefined, definitions);
    expect(found.map((each) => each.id)).toEqual(['appointments-db']);
    const named = filterElements(
      t,
      project,
      listed,
      columns,
      'appointments',
      columns[0],
      definitions,
    );
    expect(named.every((each) => each.name.toLowerCase().includes('appointments'))).toBe(true);
    expect(filterElements(t, project, listed, columns, '', undefined, definitions)).toBe(listed);
  });
});
