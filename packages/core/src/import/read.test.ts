/** Choosing the reader for a file: by the format named, the file's name, or its content. */
import { describe, expect, it } from 'vitest';
import { FLOWCHART } from './fixtures/mermaid';
import { ELEMENTS_AND_RELATIONS } from './fixtures/tables';
import { SIMPLE_FORM } from './fixtures/json';
import { IMPORT_READERS, readImport, readerFor } from './read';

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

describe('readImport', () => {
  it('reads with the reader that fits, and says which', () => {
    const read = readImport({ name: 'checkout.mmd', text: FLOWCHART });
    expect(read.ok && read.plan.format).toBe('mermaid-flowchart');
    expect(read.reader?.name).toBe('Mermaid');
  });

  it('says what it reads when nothing fits, and when a format is unknown', () => {
    expect(readImport({ name: 'notes.txt', text: 'Just some words.' })).toEqual({
      ok: false,
      problems: [
        'Visual Anything cannot tell how to read this file. It imports these formats: JSON, Mermaid and Spreadsheet (CSV or TSV).',
      ],
    });
    expect(readImport({ name: 'x', text: '' }, { format: 'visio' })).toEqual({
      ok: false,
      problems: ['There is no import reader for "visio".'],
    });
  });
});
