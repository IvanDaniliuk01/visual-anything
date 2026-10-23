import { describe, expect, it } from 'vitest';
import { parseFile } from './validate';

describe('parseFile', () => {
  it('reports text that is not JSON as one error on the whole file', () => {
    const result = parseFile('project', '{ "name": ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe('');
    expect(result.errors[0]?.message).toMatch(/^Not valid JSON: /);
  });

  it('ignores a byte order mark at the start of the file', () => {
    const result = parseFile('project', '﻿{ "schemaVersion": 1, "name": "A", "packages": [] }');
    expect(result).toEqual({ ok: true, value: { schemaVersion: 1, name: 'A', packages: [] } });
  });
});
