import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileKind } from '../src/kinds';
import { FILE_KINDS } from '../src/kinds';
import { generateSchemas } from './generate';

/** Every subschema whose `type` is "object", at any depth. */
function objectSchemas(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(objectSchemas);
  if (typeof node !== 'object' || node === null) return [];
  const schema = node as Record<string, unknown>;
  const nested = Object.values(schema).flatMap(objectSchemas);
  return schema.type === 'object' ? [schema, ...nested] : nested;
}

describe('generateSchemas', () => {
  let schemas: Record<FileKind, string>;

  beforeAll(() => {
    schemas = generateSchemas();
  }, 60_000);

  it.each(FILE_KINDS)('matches the committed schemas/%s.schema.json', (kind) => {
    const committed = readFileSync(
      new URL(`../schemas/${kind}.schema.json`, import.meta.url),
      'utf8',
    );
    expect(committed, 'The types changed: run `pnpm generate` and commit schemas/.').toBe(
      schemas[kind],
    );
  });

  it.each(FILE_KINDS)(
    'writes the %s schema as 2-space JSON with LF and a final newline',
    (kind) => {
      const text = schemas[kind];
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
      expect(text).not.toContain('\r');
    },
  );

  it.each(FILE_KINDS)(
    'names the %s schema with a stable $id, a title and a description',
    (kind) => {
      expect(JSON.parse(schemas[kind])).toMatchObject({
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: `urn:visual-anything:schema:${kind}`,
        title: expect.stringMatching(/^Visual Anything \w+ file$/) as unknown,
        description: expect.stringContaining('The contents of') as unknown,
      });
    },
  );

  it.each(FILE_KINDS)(
    'rejects unknown properties in every object type of the %s schema',
    (kind) => {
      for (const schema of objectSchemas(JSON.parse(schemas[kind]))) {
        // A discriminated union leaves that to each of its members.
        if (schema.allOf !== undefined) continue;
        if (schema.properties === undefined) {
          // A map from any name to a value, such as Attributes.
          expect(schema.additionalProperties).toEqual(expect.any(Object));
        } else {
          expect(schema.additionalProperties).toBe(false);
        }
      }
    },
  );

  it('keeps the machine it ran on out of the schemas', () => {
    const packageDir = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
    for (const text of Object.values(schemas)) {
      expect(text).not.toContain(JSON.stringify(packageDir).slice(1, -1));
      expect(text).not.toContain(packageDir.replaceAll('\\', '/'));
      expect(text).not.toContain('file://');
    }
  });
});
