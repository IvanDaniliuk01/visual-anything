/**
 * The JSON reader (ADR-0042, R35): a project's own model file, checked against the published model
 * schema, and the simple form of elements and relations, checked against its own schema; importing
 * again by a key; and refusals and reports for what it cannot read, hostile input included.
 */
import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { MODEL_FILE, SIMPLE_FORM } from './fixtures/json';
import { JSON_READER, SIMPLE_FORM_SCHEMA, readJson } from './json';
import { IMPORT_LIMITS, type ImportPlan } from './plan';
import type { ReadOptions } from './reader';
import { checkAgainstSchema } from './schema-check';

function read(text: string, name = 'model.json', options: ReadOptions = {}): ImportPlan {
  const result = readJson({ name, text }, options);
  if (!result.ok) throw new Error(result.problems.join(' '));
  return result.plan;
}

describe('a project’s own model file', () => {
  const plan = read(MODEL_FILE, 'model.vamodel');

  it('reads its elements, but World, with their components as kinds', () => {
    expect(plan.format).toBe('vamodel');
    expect(plan.elements).toEqual([
      { key: 'shop', sourceId: 'shop', name: 'Shop', kind: 'systems.system' },
      {
        key: 'api',
        sourceId: 'api',
        name: 'Checkout API',
        kind: 'systems.service',
        description: 'Takes the orders.',
        attributes: { technology: 'Node.js' },
      },
      { key: 'orders', sourceId: 'orders', name: 'Orders', kind: 'systems.database' },
      { key: 'contract', sourceId: 'contract', name: 'Contract', kind: 'clinic.contract' },
    ]);
    expect(plan.kinds.elements.map((each) => [each.kind, each.label, each.suggested])).toEqual([
      ['systems.system', 'systems.system', 'systems.system'],
      ['systems.service', 'systems.service', 'systems.service'],
      ['systems.database', 'systems.database', 'systems.database'],
      ['clinic.contract', 'clinic.contract', 'clinic.contract'],
    ]);
  });

  it('reads its relations, a relation on a relation after the one it ends on', () => {
    expect(plan.relations).toEqual([
      {
        key: 'relation 1',
        sourceId: 'api-in-shop',
        from: 'api',
        to: 'shop',
        kind: 'systems.is-part-of',
      },
      {
        key: 'relation 2',
        sourceId: 'api-writes',
        from: 'api',
        to: 'orders',
        kind: 'systems.writes-to',
        name: 'Stores orders',
        attributes: { description: 'Every order, once paid.' },
      },
      {
        key: 'relation 3',
        sourceId: 'governs',
        from: 'contract',
        to: 'relation 2',
        kind: 'relates-to',
      },
    ]);
    expect(plan.containment).toEqual([]);
    expect(plan.views).toEqual([]);
  });

  it('reports appearances, descriptions of relations and relations on World', () => {
    expect(plan.unmatched).toEqual([
      { text: 'Orders', why: 'Its own appearance is left out: an import brings no appearances.' },
      {
        text: 'in-world',
        why: 'It ends on World, which an import does not bring, so it is left out.',
      },
      {
        text: 'Stores orders',
        why: 'An import gives a relation no description, so its description is kept as its attribute "description".',
      },
    ]);
  });

  it('refuses a model file that the published schema refuses, saying where', () => {
    const broken = JSON.parse(MODEL_FILE) as { elements: Record<string, unknown>[] };
    delete broken.elements[0]?.name;
    (broken.elements[1] as Record<string, unknown>).appearance = { fill: 'red' };
    expect(readJson({ name: 'model.vamodel', text: JSON.stringify(broken) })).toEqual({
      ok: false,
      problems: [
        '/elements/0 in the file must have the key "name".',
        '/elements/1/appearance/fill in the file must be a color written as #RRGGBB.',
      ],
    });
  });

  it('reports a relation that ends on something the file does not hold, or on a cycle of relations', () => {
    const odd = JSON.parse(MODEL_FILE) as { relations: Record<string, unknown>[] };
    odd.relations = [
      { id: 'a', relationType: 'relates-to', from: 'shop', to: 'ghost' },
      { id: 'b', relationType: 'relates-to', from: 'shop', to: 'c' },
      { id: 'c', relationType: 'relates-to', from: 'shop', to: 'b' },
    ];
    expect(read(JSON.stringify(odd)).unmatched.slice(1)).toEqual([
      { text: 'a', why: 'It ends on "ghost", which the file does not hold, so it is left out.' },
      { text: 'b', why: 'It ends on a relation that ends on it in turn, so it is left out.' },
      { text: 'c', why: 'It ends on a relation that ends on it in turn, so it is left out.' },
    ]);
  });

  it('matches elements to the project by id when importing again', () => {
    const again = read(
      JSON.stringify({
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [
          { id: 'api', component: 'test.service', name: 'API v3', attributes: { latency: 7 } },
        ],
        relations: [],
      }),
      'model.vamodel',
      { project: testProject() },
    );
    expect(again.elements).toEqual([
      {
        key: 'api',
        name: 'API v3',
        kind: 'test.service',
        existing: 'api',
        attributes: { latency: 7 },
      },
    ]);
  });
});

describe('the simple form', () => {
  const plan = read(SIMPLE_FORM);

  it('reads elements with containers named by id or name, and relations', () => {
    expect(plan.format).toBe('json');
    expect(plan.elements).toEqual([
      { key: 'shop', sourceId: 'shop', name: 'Shop', kind: 'System' },
      { key: 'api', sourceId: 'api', name: 'Checkout API', kind: 'Service' },
      {
        key: 'Orders',
        name: 'Orders',
        kind: 'Database',
        attributes: { engine: 'postgres', replicas: 3 },
      },
    ]);
    expect(plan.containment).toEqual([
      { element: 'api', container: 'shop' },
      { element: 'Orders', container: 'shop' },
    ]);
    expect(plan.relations).toEqual([
      { key: 'relation 1', from: 'api', to: 'Orders', kind: 'writes to', name: 'Stores orders' },
      {
        key: 'relation 2',
        sourceId: 'r2',
        from: 'Orders',
        to: 'shop',
        kind: '',
        attributes: { weight: 0.5 },
      },
    ]);
    expect(plan.kinds.elements.map((each) => each.suggested)).toEqual([
      'systems.system',
      'systems.service',
      'systems.database',
    ]);
    expect(plan.kinds.relations.map((each) => [each.label, each.suggested])).toEqual([
      ['writes to', 'systems.writes-to'],
      ['', undefined],
    ]);
  });

  it('refuses keys its schema does not have, and missing names', () => {
    expect(
      readJson({ name: 'x.json', text: '{"elements":[{"name":"A","color":"red"},{"id":"b"}]}' }),
    ).toEqual({
      ok: false,
      problems: [
        '/elements/0 in the file must not have the key "color".',
        '/elements/1 in the file must have the key "name".',
      ],
    });
  });

  it('publishes a schema that its own example passes', () => {
    expect(checkAgainstSchema(SIMPLE_FORM_SCHEMA, JSON.parse(SIMPLE_FORM))).toEqual([]);
  });
});

describe('hostile JSON', () => {
  it('refuses what is not JSON, or holds neither form', () => {
    const broken = readJson({ name: 'x.json', text: '{"elements": [' });
    expect(broken.ok === false && broken.problems[0]).toMatch(/^The file is not valid JSON: /);
    for (const text of ['[1, 2]', '{"nodes": []}', '"text"', 'null']) {
      expect(readJson({ name: 'x.json', text })).toEqual({
        ok: false,
        problems: [
          'The file holds neither a model, with world, elements and relations, nor a list of elements and relations.',
        ],
      });
    }
  });

  it('refuses nesting deeper than 64, without overflowing the stack', () => {
    const deep = `{"elements":[{"name":"a","attributes":{"x":${'['.repeat(100_000)}${']'.repeat(100_000)}}}]}`;
    expect(readJson({ name: 'x.json', text: deep })).toEqual({
      ok: false,
      problems: ['The file nests more than 64 levels deep.'],
    });
  });

  it('keeps entities and markup in strings as text, exactly as written', () => {
    const plan = read(
      JSON.stringify({
        elements: [
          { name: '&lt;script&gt;alert(1)&lt;/script&gt;' },
          { name: '<img src=x onerror=alert(1)>', description: '&amp;&#60;' },
        ],
      }),
    );
    expect(plan.elements.map((each) => [each.name, each.description])).toEqual([
      ['&lt;script&gt;alert(1)&lt;/script&gt;', undefined],
      ['<img src=x onerror=alert(1)>', '&amp;&#60;'],
    ]);
  });

  it('cuts a megabyte name, and refuses more elements than an import brings', () => {
    const long = read(JSON.stringify({ elements: [{ name: 'z'.repeat(1024 * 1024) }] }));
    expect(long.elements[0]?.name).toHaveLength(200);
    const many = JSON.stringify({
      elements: Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) => ({ name: `n${at}` })),
    });
    expect(readJson({ name: 'x.json', text: many })).toEqual({
      ok: false,
      problems: ['The file holds more than 20,000 elements; an import brings at most 20,000.'],
    });
  });
});

describe('the JSON reader', () => {
  it('recognizes JSON by name, and pasted text by its keys', () => {
    expect(JSON_READER.recognizes({ name: 'x.json', text: '' })).toBe(true);
    expect(JSON_READER.recognizes({ name: 'model.vamodel', text: '' })).toBe(true);
    expect(JSON_READER.recognizes({ name: 'pasted', text: ' {"elements": []}' })).toBe(true);
    expect(JSON_READER.recognizes({ name: 'pasted', text: 'name,component' })).toBe(false);
  });
});
