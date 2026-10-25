/** What the import dialog does besides drawing: reading files, keeping choices, measuring the batch. */
import { MAX_IMPORT_TEXT } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  ACCEPTED,
  keysOf,
  mappingOf,
  prepare,
  readChosenFile,
  readInput,
  suggestedChoices,
} from './importing';

describe('readChosenFile', () => {
  it('reads a file as text and bytes, and refuses one larger than an import reads', async () => {
    const read = await readChosenFile(new File(['flowchart LR\n a --> b'], 'a.mmd'));
    expect(read.ok && read.input.text).toBe('flowchart LR\n a --> b');
    expect(read.ok && read.input.bytes?.length).toBe(21);
    const huge = { size: MAX_IMPORT_TEXT + 1, name: 'huge.csv' } as File;
    expect(await readChosenFile(huge)).toEqual({ ok: false, problem: 'too-large' });
  });

  it('offers every reader’s file endings', () => {
    expect(ACCEPTED.split(',')).toEqual(expect.arrayContaining(['.mmd', '.csv', '.tsv', '.json']));
  });
});

describe('choices', () => {
  it('start from the suggestions, and become a mapping with no prototype', () => {
    const project = loadSample();
    const read = readInput(project, { name: 'x.mmd', text: 'flowchart LR\n a:::__proto__ --> b' });
    if (!read.ok) throw new Error(read.problems.join(' '));
    const choices = suggestedChoices(project, read.reading.plan, 'system-overview');
    expect(choices.elements.get('class:__proto__')).toBe('essence');
    const mapping = mappingOf(choices);
    expect(Object.getPrototypeOf(mapping.elements)).toBeNull();
    expect(Object.hasOwn(mapping.elements, 'class:__proto__')).toBe(true);
  });

  it('prepare the one batch and measure the message that carries it', () => {
    const project = loadSample();
    const read = readInput(project, { name: 'x.mmd', text: 'flowchart LR\n a --> b' });
    if (!read.ok) throw new Error(read.problems.join(' '));
    const prepared = prepare(
      project,
      read.reading.plan,
      suggestedChoices(project, read.reading.plan, undefined),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.size).toBeGreaterThan(JSON.stringify(prepared.prepared.command).length);
  });
});

describe('keysOf', () => {
  it('lists a spreadsheet’s columns, and a JSON element’s id and name', () => {
    const project = loadSample();
    const table = readInput(project, { name: 'x.csv', text: 'id;name;owner\na;A;x' });
    expect(table.ok && keysOf(table.reading)).toEqual(['id', 'name', 'owner']);
    const json = readInput(project, { name: 'x.json', text: '{"elements":[{"name":"A"}]}' });
    expect(json.ok && keysOf(json.reading)).toEqual(['id', 'name']);
    const mermaid = readInput(project, { name: 'x.mmd', text: 'flowchart LR\n a --> b' });
    expect(mermaid.ok && keysOf(mermaid.reading)).toEqual([]);
  });
});
