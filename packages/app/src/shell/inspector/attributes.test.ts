import type { AttributeDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import {
  attributeRows,
  fitsType,
  initialValue,
  jsonText,
  readJson,
  readNumber,
  sameJson,
  typeOfValue,
} from './attributes';

const OWNER: AttributeDefinition = {
  name: 'owner',
  type: 'string',
  description: 'Who looks after it.',
};
const TIMEZONE: AttributeDefinition = { name: 'timezone', type: 'string', default: 'UTC' };
const RETENTION: AttributeDefinition = { name: 'retention', type: 'json', default: { days: 30 } };
const REPLICAS: AttributeDefinition = { name: 'replicas', type: 'number', default: 1 };

describe('attributeRows', () => {
  it('lists the defined attributes in order, then the ones only the values have', () => {
    const rows = attributeRows([OWNER, TIMEZONE], { sizeGb: 12, owner: 'Ops', zone: 'b' });
    expect(rows.map((row) => row.name)).toEqual(['owner', 'timezone', 'sizeGb', 'zone']);
    expect(rows.map((row) => row.definition?.name)).toEqual([
      'owner',
      'timezone',
      undefined,
      undefined,
    ]);
  });

  it('takes the default when there is no value of its own, and nothing when there is no default', () => {
    const [owner, timezone] = attributeRows([OWNER, TIMEZONE], undefined);
    expect(owner).toMatchObject({
      stored: false,
      value: undefined,
      differs: false,
      reset: undefined,
    });
    expect(timezone).toMatchObject({
      stored: false,
      value: 'UTC',
      differs: false,
      reset: undefined,
    });
  });

  it('marks a value of its own that differs from the default, which can go back to it', () => {
    const [timezone] = attributeRows([TIMEZONE], { timezone: 'America/Lima' });
    expect(timezone).toMatchObject({ stored: true, value: 'America/Lima', differs: true });
    expect(timezone?.reset).toBe('default');
  });

  it('does not mark a value of its own equal to the default, whatever the order of its keys', () => {
    const [retention] = attributeRows([RETENTION], { retention: { days: 30 } });
    expect(retention).toMatchObject({ stored: true, differs: false, reset: undefined });
  });

  it('does not mark a value for an attribute without a default, which can be cleared', () => {
    const [owner] = attributeRows([OWNER], { owner: 'Ops' });
    expect(owner).toMatchObject({ stored: true, value: 'Ops', differs: false, reset: 'clear' });
  });

  it('types an attribute of its own by its value, and lets it be removed', () => {
    const rows = attributeRows([], { a: 'text', b: 2, c: false, d: null, e: [1], f: { g: 1 } });
    expect(rows.map((row) => row.type)).toEqual([
      'string',
      'number',
      'boolean',
      'json',
      'json',
      'json',
    ]);
    expect(rows.every((row) => row.reset === 'remove' && row.stored)).toBe(true);
  });

  it('says when a value does not fit the type its definition gives', () => {
    const [replicas, owner] = attributeRows([REPLICAS, OWNER], { replicas: '3', owner: 'Ops' });
    expect(replicas?.mismatched).toBe(true);
    expect(owner?.mismatched).toBe(false);
  });
});

describe('sameJson', () => {
  it('compares values deeply, whatever the order of their keys', () => {
    expect(sameJson({ a: 1, b: [1, { c: true }] }, { b: [1, { c: true }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson(null, null)).toBe(true);
    expect(sameJson(null, undefined)).toBe(false);
    expect(sameJson(undefined, undefined)).toBe(true);
    expect(sameJson('1', 1)).toBe(false);
    expect(sameJson([], {})).toBe(false);
  });
});

describe('types of values', () => {
  it('checks whether a value fits a type', () => {
    expect(fitsType('a', 'string')).toBe(true);
    expect(fitsType(1, 'string')).toBe(false);
    expect(fitsType(1.5, 'number')).toBe(true);
    expect(fitsType('1', 'number')).toBe(false);
    expect(fitsType(true, 'boolean')).toBe(true);
    expect(fitsType(null, 'boolean')).toBe(false);
    expect(fitsType({ any: ['thing'] }, 'json')).toBe(true);
  });

  it('gives the type of a value', () => {
    expect(typeOfValue('a')).toBe('string');
    expect(typeOfValue(0)).toBe('number');
    expect(typeOfValue(true)).toBe('boolean');
    expect(typeOfValue(null)).toBe('json');
  });

  it('starts a new attribute with an empty value of its type', () => {
    expect(initialValue('string')).toBe('');
    expect(initialValue('number')).toBe(0);
    expect(initialValue('boolean')).toBe(false);
    expect(initialValue('json')).toBeNull();
  });
});

describe('reading what is typed', () => {
  it('writes JSON indented, and nothing for no value', () => {
    expect(jsonText({ days: 30 })).toBe('{\n  "days": 30\n}');
    expect(jsonText('text')).toBe('"text"');
    expect(jsonText(null)).toBe('null');
    expect(jsonText(undefined)).toBe('');
  });

  it('reads JSON, or says why it cannot', () => {
    expect(readJson(' {"days": 7} ')).toEqual({ ok: true, value: { days: 7 } });
    expect(readJson('null')).toEqual({ ok: true, value: null });
    expect(readJson('{days: 7}')).toMatchObject({ ok: false, message: /^Not valid JSON/ });
    expect(readJson('  ')).toEqual({ ok: false, message: 'Enter a JSON value, such as null.' });
  });

  it('reads a number, or says that one is needed', () => {
    expect(readNumber('12.5')).toEqual({ ok: true, value: 12.5 });
    expect(readNumber(' -3 ')).toEqual({ ok: true, value: -3 });
    expect(readNumber('')).toEqual({ ok: false, message: 'Enter a number.' });
    expect(readNumber('twelve')).toEqual({ ok: false, message: 'Enter a number.' });
    expect(readNumber('Infinity')).toEqual({ ok: false, message: 'Enter a number.' });
  });
});
