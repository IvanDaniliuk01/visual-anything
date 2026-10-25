/** Choosing the reader for a file: by the format named, the file's name, or its content. */
import { describe, expect, it } from 'vitest';
import { FLOWCHART } from './fixtures/mermaid';
import { ELEMENTS_AND_RELATIONS } from './fixtures/tables';
import { SIMPLE_FORM } from './fixtures/json';
import { IMPORT_READERS, readImport, readerFor } from './read';
import structurizr from './fixtures/big-bank.structurizr.json';
import likec4Model from './fixtures/shop.likec4.json';
import drawio from './fixtures/checkout.drawio?raw';
import { systemsProject } from './fixtures/projects';

describe('readerFor', () => {
  it('finds the reader by the format named, the name’s ending, then the content', () => {
    expect(readerFor({ name: 'a.mmd', text: '' })?.format).toBe('mermaid');
    expect(readerFor({ name: 'a.CSV', text: '' })?.format).toBe('table');
    expect(readerFor({ name: 'model.vamodel', text: '' })?.format).toBe('json');
    expect(readerFor({ name: 'pasted text', text: FLOWCHART })?.format).toBe('mermaid');
    expect(readerFor({ name: 'pasted text', text: ELEMENTS_AND_RELATIONS })?.format).toBe('table');
    expect(readerFor({ name: 'pasted text', text: SIMPLE_FORM })?.format).toBe('json');
    expect(readerFor({ name: 'notes.txt', text: 'Just some words.' })).toBeUndefined();
    expect(readerFor({ name: 'a.mmd', text: '' }, 'table')?.format).toBe('table');
  });

  it('lists every reader once, by format', () => {
    const formats = IMPORT_READERS.map((reader) => reader.format);
    expect(new Set(formats).size).toBe(formats.length);
  });
});

describe('the Structurizr, LikeC4 and draw.io files', () => {
  const workspace = JSON.stringify(structurizr);
  const likec4 = JSON.stringify(likec4Model);

  it('go to their readers by what they hold, whatever their names say', () => {
    expect(readerFor({ name: 'workspace.json', text: workspace })?.format).toBe('structurizr');
    expect(readerFor({ name: 'model.json', text: likec4 })?.format).toBe('likec4');
    expect(readerFor({ name: 'checkout.xml', text: drawio })?.format).toBe('drawio');
    expect(readerFor({ name: 'pasted text', text: drawio })?.format).toBe('drawio');
  });

  it('are read with one look, and say which reader read them', () => {
    const read = readImport({ name: 'workspace.json', text: workspace });
    expect(read.ok && read.plan.format).toBe('structurizr');
    expect(read.reader?.name).toBe('Structurizr workspace');
    const page = readImport({ name: 'checkout.drawio', text: drawio });
    expect(page.ok && page.plan.views.length).toBeGreaterThan(0);
    expect(page.reader?.format).toBe('drawio');
  });

  it('suggest only what a project uses, when told the project', () => {
    const project = systemsProject();
    const read = readImport({ name: 'workspace.json', text: workspace }, { project });
    if (!read.ok) throw new Error(read.problems.join(' '));
    const suggested = [...read.plan.kinds.elements, ...read.plan.kinds.relations]
      .map((kind) => kind.suggested)
      .filter((id) => id !== undefined);
    expect(suggested.length).toBeGreaterThan(0);
    expect(
      suggested.every((id) => id === 'essence' || id === 'relates-to' || id.startsWith('systems.')),
    ).toBe(true);
  });

  it('can be named as a format, to be read as that format', () => {
    const read = readImport({ name: 'x.json', text: workspace }, { format: 'likec4' });
    expect(read.reader?.format).toBe('likec4');
  });
});

describe('readImport', () => {
  it('reads with the reader that fits, and says which', () => {
    const read = readImport({ name: 'checkout.mmd', text: FLOWCHART });
    expect(read.ok && read.plan.format).toBe('mermaid-flowchart');
    expect(read.reader?.name).toBe('Mermaid');
  });

  it('says what it reads when nothing fits, and when a format is unknown', () => {
    expect(readImport({ name: 'notes.txt', text: 'Just some words.' })).toEqual({
      ok: false,
      problems: ['Visual Anything cannot tell what this file is: name its format.'],
    });
    expect(readImport({ name: 'x', text: '' }, { format: 'visio' })).toEqual({
      ok: false,
      problems: ['There is no import reader for "visio".'],
    });
  });
});
