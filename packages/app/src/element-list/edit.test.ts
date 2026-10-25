import fc from 'fast-check';
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { cellsText, parseCells, pasteCommand, readCell } from './edit';
import { columnKey, columnsOf, listedElements, type Column } from './rows';

const VIEW = 'system-overview';
const NAME: Column = { kind: 'name' };
const SIZE: Column = { kind: 'attribute', name: 'sizeGb', type: 'number' };
const OWNER: Column = { kind: 'attribute', name: 'owner', type: 'string' };
const FLAG: Column = { kind: 'attribute', name: 'critical', type: 'boolean' };
const LOOSE: Column = { kind: 'attribute', name: 'notes' };
const DOCS: Column = { kind: 'attribute', name: 'docs', type: 'destination' };
const WIKIDATA: Column = { kind: 'id', scheme: 'wikidata' };

describe('readCell', () => {
  it('reads a name, which needs one', () => {
    expect(readCell(NAME, 'Gateway', undefined)).toEqual({ ok: true, change: { name: 'Gateway' } });
    expect(readCell(NAME, '  ', undefined)).toMatchObject({ ok: false });
  });

  it('reads a value by its attribute’s type, and empties a cell by taking its value out', () => {
    expect(readCell(SIZE, '20.5', undefined)).toEqual({
      ok: true,
      change: { attributes: { sizeGb: 20.5 } },
    });
    expect(readCell(SIZE, 'twenty', undefined)).toMatchObject({ ok: false });
    expect(readCell(OWNER, 'Team A', undefined)).toEqual({
      ok: true,
      change: { attributes: { owner: 'Team A' } },
    });
    expect(readCell(FLAG, 'TRUE', undefined)).toEqual({
      ok: true,
      change: { attributes: { critical: true } },
    });
    expect(readCell(FLAG, 'maybe', undefined)).toMatchObject({ ok: false });
    expect(readCell(SIZE, '', 3)).toEqual({ ok: true, change: { removeAttributes: ['sizeGb'] } });
  });

  it('reads an attribute only elements have by the type of its value, or as text', () => {
    expect(readCell(LOOSE, '7', 3)).toEqual({ ok: true, change: { attributes: { notes: 7 } } });
    expect(readCell(LOOSE, '7', undefined)).toEqual({
      ok: true,
      change: { attributes: { notes: '7' } },
    });
  });

  it('reads a destination as JSON, and refuses one that is not', () => {
    expect(readCell(DOCS, '{"url":"https://example.org"}', undefined)).toEqual({
      ok: true,
      change: { attributes: { docs: { url: 'https://example.org' } } },
    });
    expect(readCell(DOCS, '{"url":"javascript:alert(1)"}', undefined)).toMatchObject({ ok: false });
    expect(readCell(DOCS, 'https://example.org', undefined)).toMatchObject({ ok: false });
  });

  it('reads an identifier, and takes it out when the cell is emptied', () => {
    expect(readCell(WIKIDATA, 'Q8513', undefined)).toEqual({
      ok: true,
      change: { ids: { wikidata: 'Q8513' } },
    });
    expect(readCell(WIKIDATA, '', 'Q8513')).toEqual({
      ok: true,
      change: { ids: { wikidata: null } },
    });
    expect(readCell(WIKIDATA, 'a\u0001b', undefined)).toMatchObject({ ok: false });
  });

  it('never edits the component', () => {
    expect(readCell({ kind: 'component' }, 'Service', 'Service')).toMatchObject({ ok: false });
  });
});

describe('parseCells', () => {
  it('reads the rows and cells of tab-separated text, as spreadsheets copy them', () => {
    expect(parseCells('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCells('one')).toEqual([['one']]);
    expect(parseCells('"quoted\ttab"\t"line\nbreak"\t"say ""hi"""')).toEqual([
      ['quoted\ttab', 'line\nbreak', 'say "hi"'],
    ]);
  });

  it('reads back what it writes, for any block of cells', () => {
    const cell = fc.string({ maxLength: 12, unit: 'binary' });
    const block = fc.integer({ min: 1, max: 4 }).chain((width) =>
      fc.array(fc.array(cell, { minLength: width, maxLength: width }), {
        minLength: 1,
        maxLength: 5,
      }),
    );
    fc.assert(
      fc.property(block, (cells) => {
        expect(parseCells(cellsText(cells))).toEqual(cells);
      }),
    );
  });
});

describe('pasteCommand', () => {
  function project(): ProjectSnapshot {
    return loadSample();
  }

  it('turns a pasted block into one batch, one change for each element, named after the cells', () => {
    const state = project();
    const definitions = definitionsIn(state);
    const elements = listedElements(state, definitions, VIEW, { kind: 'view' });
    const columns: Column[] = [NAME, OWNER, WIKIDATA];
    const pasted = pasteCommand(elements, columns, { row: 0, column: 0 }, [
      ['First', 'Team A', 'Q1'],
      ['Second', 'Team B', ''],
    ]);
    expect(pasted.cells).toBe(6);
    expect(pasted.problems).toEqual([]);
    const command = pasted.command as Extract<Command, { type: 'batch' }>;
    expect(command.label).toBe('Paste 6 cells into the element list');
    expect(command.commands).toEqual([
      {
        type: 'update-element',
        id: elements[0]?.id,
        changes: { name: 'First', attributes: { owner: 'Team A' }, ids: { wikidata: 'Q1' } },
      },
      {
        type: 'update-element',
        id: elements[1]?.id,
        changes: { name: 'Second', attributes: { owner: 'Team B' }, ids: { wikidata: null } },
      },
    ]);
    // The core takes it as one action, which one undo takes back.
    const outcome = executeCommand(state, pasted.command as Command);
    expect(outcome.ok).toBe(true);
  });

  it('starts at the cell it is pasted on, and leaves out what falls outside the list', () => {
    const state = project();
    const elements = listedElements(state, definitionsIn(state), VIEW, { kind: 'view' });
    const last = elements.length - 1;
    const pasted = pasteCommand(elements, [NAME, OWNER], { row: last, column: 1 }, [
      ['x', 'y'],
      ['z', 'w'],
    ]);
    expect(pasted.cells).toBe(1);
    expect((pasted.command as Extract<Command, { type: 'batch' }>).commands).toEqual([
      { type: 'update-element', id: elements[last]?.id, changes: { attributes: { owner: 'x' } } },
    ]);
  });

  it('says which cells it could not read, and pastes the rest', () => {
    const state = project();
    const elements = listedElements(state, definitionsIn(state), VIEW, { kind: 'view' });
    const pasted = pasteCommand(elements, [NAME, SIZE], { row: 0, column: 0 }, [['Ok', 'many']]);
    expect(pasted.cells).toBe(1);
    expect(pasted.problems).toHaveLength(1);
    expect(pasted.problems[0]).toContain('sizeGb');
  });

  it('makes no command when nothing can be pasted', () => {
    const state = project();
    const elements = listedElements(state, definitionsIn(state), VIEW, { kind: 'view' });
    expect(
      pasteCommand(elements, [{ kind: 'component' }], { row: 0, column: 0 }, [['Service']]).command,
    ).toBeUndefined();
  });

  it('pastes a block over every column the list has', () => {
    const state = project();
    const definitions = definitionsIn(state);
    const elements = listedElements(state, definitions, VIEW, { kind: 'view' });
    const columns = columnsOf(definitions, elements);
    const nameAt = columns.findIndex((each) => columnKey(each) === 'name');
    const pasted = pasteCommand(elements, columns, { row: 2, column: nameAt }, [['Renamed']]);
    expect(pasted.cells).toBe(1);
    expect(pasted.command?.label).toBe('Paste 1 cell into the element list');
  });
});
