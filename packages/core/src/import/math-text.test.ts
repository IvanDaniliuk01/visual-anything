/**
 * Imported text keeps its dollar signs as typed (ADR 0106): a spreadsheet's prices, SQL's placeholders
 * and dollar-quoted bodies, written into descriptions and into the values of attributes that take text
 * emphasis, are escaped through `escapeEmphasis`, so that they read back as the file wrote them and
 * none of them reads as Math.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import { sequentialIds, testProject } from '../test/fixtures';
import { parseEmphasis, plainText } from '../text/emphasis';
import { systemsProject } from './fixtures/projects';
import { planToCommand, type ImportPlan } from './plan';
import { readTable } from './table';
import { applyPlan, planOf } from './test/apply';

/** Whether a text holds Math, read with its blocks or as one line. */
function holdsMath(text: string, blocks: boolean): boolean {
  return parseEmphasis(text, { blocks }).some(
    (block) =>
      block.kind === 'math' ||
      ((block.kind === 'paragraph' || block.kind === 'heading') &&
        block.runs.some((run) => run.math !== undefined)),
  );
}

/** Texts with dollar signs as outside material writes them; each would read as Math unescaped. */
const DOLLARS = [
  'Plans at $20 and $30, or $x$ a seat',
  'WHERE id = $1 AND kind = $tag$open$tag$',
  'Totals in $US$ only',
];

describe('a spreadsheet with dollar signs', () => {
  it('imports its descriptions as typed, with no Math', () => {
    const csv = [
      'id,name,component,description',
      ...DOLLARS.map((text, at) => `row-${at},Row ${at},Service,"${text}"`),
    ].join('\n');
    const read = readTable({ name: 'prices.csv', text: csv });
    const { state, ids } = applyPlan(systemsProject(), planOf(read));
    DOLLARS.forEach((typed, at) => {
      expect(holdsMath(typed, true), typed).toBe(true);
      const description = state.model.elements.find(
        (each) => each.id === ids.get(`row-${at}`),
      )?.description;
      expect(description).toBeDefined();
      expect(plainText(description!), typed).toBe(typed);
      expect(holdsMath(description!, true), typed).toBe(false);
    });
  });
});

describe('an import into attributes that take text emphasis', () => {
  it('escapes SQL’s placeholders and a dollar-quoted body, which read back as typed', () => {
    const base = testProject();
    const state = {
      ...base,
      packages: base.packages.map((file) => ({
        ...file,
        components: file.components.map((component) =>
          component.id === 'test.database'
            ? {
                ...component,
                attributes: [
                  ...(component.attributes ?? []),
                  { name: 'query', type: 'string' as const, format: 'emphasis' as const },
                ],
              }
            : component,
        ),
      })),
    };
    const query = 'SELECT $1, $$total$$ FROM orders, costs $20 and $30';
    const body = 'CREATE FUNCTION f() AS\n$$\nSELECT 1\n$$\nLANGUAGE sql';
    expect(holdsMath(query, false)).toBe(true);
    expect(holdsMath(body, true)).toBe(true);
    const plan: ImportPlan = {
      format: 'test',
      source: 'schema.sql',
      elements: [
        {
          key: 'orders',
          name: 'Orders',
          kind: 'db',
          description: body,
          attributes: { query },
        },
      ],
      relations: [],
      containment: [],
      views: [],
      kinds: { elements: [], relations: [] },
      unmatched: [],
    };
    const planned = planToCommand(
      state,
      plan,
      { elements: { db: 'test.database' }, relations: {} },
      sequentialIds(),
    );
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const orders = outcome.state.model.elements.find(
      (element) => element.id === planned.ids.get('orders'),
    );
    const written = orders?.attributes?.query as string;
    expect(holdsMath(written, false)).toBe(false);
    expect(plainText(written, { blocks: false })).toBe(query);
    expect(holdsMath(orders!.description!, true)).toBe(false);
    expect(plainText(orders!.description!)).toBe(body);
  });
});
