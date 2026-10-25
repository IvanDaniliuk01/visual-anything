/**
 * Hostile input across the readers (ADR-0042): names every object inherits, used as shapes, classes,
 * columns, kinds and attributes, find nothing on a prototype and change none; and files built to make
 * a reader's work grow faster than the file are refused or read in a moment.
 */
import modelSchema from '@visual-anything/schema/schemas/model.schema.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { testProject } from '../test/fixtures';
import { readJson } from './json';
import { readMermaid } from './mermaid';
import { IMPORT_LIMITS, type ImportPlan } from './plan';
import type { ReadResult } from './reader';
import { checkAgainstSchema } from './schema-check';
import { componentForWords, kindSuggester, relationTypeForWords } from './suggest';
import { readTable } from './table';

const INHERITED = [
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'hasOwnProperty',
  'valueOf',
];

function planOf(result: ReadResult): ImportPlan {
  if (!result.ok) throw new Error(result.problems.join(' '));
  return result.plan;
}

/** Whether every kind's label and suggestion is text or absent, never something inherited. */
function plainKinds(plan: ImportPlan): void {
  for (const kind of [...plan.kinds.elements, ...plan.kinds.relations]) {
    expect(typeof kind.kind).toBe('string');
    expect(typeof kind.label).toBe('string');
    expect(['string', 'undefined']).toContain(typeof kind.suggested);
  }
  for (const element of plan.elements) expect(typeof element.kind).toBe('string');
}

describe('names every object inherits', () => {
  it.each(INHERITED)('are only text as a Mermaid shape, class, node or diagram: %s', (name) => {
    const plan = planOf(
      readMermaid({
        name: 'x.mmd',
        text: `flowchart LR\n  a@{ shape: ${name} } --> b:::${name}\n  class a ${name}\n  ${name} --> c`,
      }),
    );
    plainKinds(plan);
    expect(plan.elements.find((each) => each.key === 'b')?.kind).toBe(`class:${name}`);
    expect(readMermaid({ name: 'x.mmd', text: `${name}\n  a --> b` })).toEqual({
      ok: false,
      problems: ['The text holds no Mermaid diagram.'],
    });
  });

  it.each(INHERITED)('are only text as C4 macros, ER cardinalities and class names: %s', (name) => {
    plainKinds(
      planOf(
        readMermaid({ name: 'x.mmd', text: `C4Context\n  ${name}(a, "A")\n  Person(p, "P")` }),
      ),
    );
    plainKinds(
      planOf(
        readMermaid({
          name: 'x.mmd',
          text: `erDiagram\n  A ||--o{ B : ${name}\n  ${name} { string ${name} }`,
        }),
      ),
    );
    plainKinds(
      planOf(
        readMermaid({
          name: 'x.mmd',
          text: `classDiagram\n  class ${name.replace(/_/g, 'x')}\n  A <|-- B : ${name}`,
        }),
      ),
    );
  });

  it.each(INHERITED)(
    'are only text as spreadsheet columns, components and relation types: %s',
    (name) => {
      const project = testProject();
      const plan = planOf(
        readTable(
          {
            name: 'x.csv',
            text: `name,component,${name}\nA,${name},1\nB,box,2\n\nfrom,to,kind\nA,B,${name}\n`,
          },
          { project, key: 'name' },
        ),
      );
      plainKinds(plan);
      const a = plan.elements.find((each) => each.name === 'A');
      if (name === '__proto__') {
        expect(a?.attributes).toBeUndefined();
        expect(plan.unmatched).toContainEqual({
          text: '1',
          why: 'No attribute may be named "__proto__", so this column is not read.',
        });
      } else {
        expect(a?.attributes && Object.hasOwn(a.attributes, name)).toBe(true);
      }
      expect(kindSuggester(project).component(name)).toBeUndefined();
      expect(componentForWords(name)).toBeUndefined();
      expect(relationTypeForWords(name)).toBeUndefined();
    },
  );

  it.each(INHERITED)('are only text as JSON kinds, keys and attributes: %s', (name) => {
    const text = `{"elements":[{"name":"A","component":"${name}","attributes":{"${name}":{"polluted":true},"kept":1}}],"relations":[{"from":"A","to":"A","relationType":"${name}"}]}`;
    const plan = planOf(readJson({ name: 'x.json', text }, { project: testProject(), key: name }));
    plainKinds(plan);
    const attributes = plan.elements[0]?.attributes ?? {};
    expect(Object.hasOwn(attributes, name)).toBe(name !== '__proto__');
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // A key every object inherits, at the top or in an element, is a key the schema does not have.
    const top = readJson({ name: 'x.json', text: `{"${name}": {}, "elements": []}` });
    expect(top).toEqual({
      ok: false,
      problems: [`The file as a whole must not have the key "${name}".`],
    });
  });

  it('are checked as keys of the data, never looked up on the schema’s prototype', () => {
    const model = JSON.parse(
      '{"world":{"id":"w","component":"essence","name":"W","constructor":1,"__proto__":2},"elements":[],"relations":[]}',
    ) as unknown;
    expect(checkAgainstSchema(modelSchema, model)).toEqual([
      { path: '/world', message: 'must not have the key "constructor"' },
      { path: '/world', message: 'must not have the key "__proto__"' },
    ]);
  });
});

describe('work that could grow faster than the file', () => {
  const quick = (run: () => unknown, ms = 1_500) => {
    const start = Date.now();
    const result = run();
    expect(Date.now() - start).toBeLessThan(ms);
    return result;
  };

  it('stops at a list longer than the schema allows, however its items repeat', () => {
    const attributes = Array.from({ length: 1_000_000 }, () => 'same');
    const errors = quick(() =>
      checkAgainstSchema(modelSchema, {
        world: { id: 'w', component: 'essence', name: 'W', appearance: { detail: { attributes } } },
        elements: [],
        relations: [],
      }),
    );
    expect(errors).toEqual([
      { path: '/world/appearance/detail/attributes', message: 'must have at most 8 items' },
    ]);
  });

  it('finds repeated items in one pass', () => {
    const many = Array.from({ length: 200_000 }, (_, at) => ({ at, tags: ['x'] }));
    many.push({ at: 3, tags: ['x'] });
    const errors = quick(
      () => checkAgainstSchema({ type: 'array', uniqueItems: true }, many),
      3_000,
    );
    expect(errors).toEqual([
      { path: '', message: 'must not have duplicate items (items 3 and 200000 are the same)' },
    ]);
  });

  it('refuses 50,001 relations before ordering them', () => {
    const relations = Array.from({ length: IMPORT_LIMITS.relations + 1 }, (_, at) => ({
      id: `r${at}`,
      relationType: 'relates-to',
      from: 'a',
      to: at === 0 ? 'b' : `r${at - 1}`,
    }));
    const text = JSON.stringify({
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'a', component: 'essence', name: 'A' },
        { id: 'b', component: 'essence', name: 'B' },
      ],
      relations,
    });
    expect(quick(() => readJson({ name: 'chain.vamodel', text }), 500)).toEqual({
      ok: false,
      problems: [
        'The file holds more than 50,000 relations, those that put one thing inside another included; an import brings at most 50,000.',
      ],
    });
  });

  it('orders a long chain of relations on relations in one pass', () => {
    const length = IMPORT_LIMITS.relations - 1;
    // Written last first, so that each relation comes before the one it ends on.
    const relations = Array.from({ length }, (_, at) => {
      const index = length - 1 - at;
      return {
        id: `r${index}`,
        relationType: 'relates-to',
        from: 'a',
        to: index === 0 ? 'b' : `r${index - 1}`,
      };
    });
    const text = JSON.stringify({
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'a', component: 'essence', name: 'A' },
        { id: 'b', component: 'essence', name: 'B' },
      ],
      relations,
    });
    const plan = planOf(
      quick(() => readJson({ name: 'chain.vamodel', text }), 3_000) as ReadResult,
    );
    expect(plan.relations).toHaveLength(length);
    expect(plan.relations[0]?.sourceId).toBe('r0');
    expect(plan.relations[1]?.to).toBe(plan.relations[0]?.key);
  });

  it('refuses a spreadsheet of more rows than an import brings, without reading them all', () => {
    const text = `name\n${'x\n'.repeat(200_000)}`;
    expect(quick(() => readTable({ name: 'x.csv', text }), 1_000)).toEqual({
      ok: false,
      problems: ['The file holds more rows than an import brings: at most 71,000.'],
    });
  });

  it('reads rows that all share a name, and relations that all end on one, in one pass', () => {
    const rows = 'Same\n'.repeat(IMPORT_LIMITS.elements - 1);
    const plan = planOf(
      quick(() => readTable({ name: 'x.csv', text: `name\n${rows}` }), 3_000) as ReadResult,
    );
    expect(plan.elements).toHaveLength(IMPORT_LIMITS.elements - 1);
    const fan = Array.from({ length: 40_000 }, (_, at) => ({
      id: `f${at}`,
      relationType: 'relates-to',
      from: 'a',
      to: 'hub',
    }));
    const text = JSON.stringify({
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [{ id: 'a', component: 'essence', name: 'A' }],
      relations: [{ id: 'hub', relationType: 'relates-to', from: 'a', to: 'a' }, ...fan],
    });
    expect(
      planOf(quick(() => readJson({ name: 'fan.vamodel', text }), 3_000) as ReadResult).relations,
    ).toHaveLength(40_001);
  });
});
