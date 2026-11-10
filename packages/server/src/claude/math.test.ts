/**
 * Math in what Claude reads and writes (ADR 0106): the instructions say how to write TeX, the tools
 * that read texts answer the TeX as written, a write's answer tells of the Math it wrote as notices
 * and of Math that cannot be typeset as warnings, and `escapeText` keeps a dollar sign a character.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEmphasis, plainText, type Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { EMPHASIS_INSTRUCTIONS, TAKES_MARKDOWN, escapeTextInput, escapeTexts } from './emphasis';
import { INSTRUCTIONS } from './mcp';
import { TOOLS, runTool } from './tools';

let folder: string;
let session: Session;

function programOf(target: Session): Program {
  return {
    project: () => Promise.resolve(target.snapshot),
    execute: async (command: Command) => {
      const outcome = await target.execute(command, 'claude');
      return outcome.ok
        ? {
            ok: true,
            label: outcome.label,
            changed: outcome.recorded,
            created: outcome.created,
            warnings: outcome.warnings,
          }
        : { ok: false, problems: outcome.problems };
    },
    guide: (guidance) => target.guide(guidance),
    openApp: () => Promise.resolve({ how: 'browser' as const }),
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-math-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
});

afterEach(async () => {
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** The value of a tool call that worked. */
async function value(name: string, args: unknown): Promise<Record<string, unknown>> {
  const definition = TOOLS.find((each) => each.name === name);
  if (!definition) throw new Error(`There is no tool ${name}.`);
  const outcome = await runTool(definition, args, programOf(session));
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.message}`);
  return outcome.value as Record<string, unknown>;
}

const element = (id: string) => session.snapshot.model.elements.find((each) => each.id === id);

/** A description with Math within a line and a block, and emphasis around them. */
const WITH_MATH = [
  'The **loss** is $L = \\frac{1}{n}\\sum_i (y_i - \\hat y_i)^2$, for $n$ rows.',
  '',
  '$$',
  '\\sigma(z) = \\frac{1}{1 + e^{-z}}',
  '$$',
].join('\n');

const READS_AS_MATH = (where: string) =>
  `Math is read in ${where}: write \\$ for a dollar sign that is not Math.`;

describe('what Claude is told of Math', () => {
  it('says how to write TeX in a text that takes emphasis, and how to keep a dollar sign', () => {
    expect(INSTRUCTIONS).toContain(EMPHASIS_INSTRUCTIONS);
    for (const said of [
      '$\\sigma(z)$ within a line',
      'two lines that are $$ alone',
      "Pandoc's rule",
      'no digit right after the closing one',
      '"$20 and $30" stays text',
      'write \\$ for a dollar sign',
      'without \\color, \\textcolor, \\colorbox or \\href',
      'at most 2,000 characters a formula and 200 formulas a text',
      'never in a name',
      'Every tool reads the TeX back as written',
    ]) {
      expect(EMPHASIS_INSTRUCTIONS, said).toContain(said);
    }
    // Every field that takes Markdown says it takes Math too.
    expect(TAKES_MARKDOWN).toContain('Math, TeX between $…$ within a line');
    expect(escapeTextInput().description).toContain('a *, a _ or a $ stays a character');
  });
});

describe('the tools that read texts', () => {
  it('answer the TeX as written: get_item, read_view, read_scenario and get_project', async () => {
    await value('update_element', { id: 'api', description: WITH_MATH });
    await value('update_free_shape', {
      view: 'overview',
      shape: { id: 'note', text: 'Each row: $\\hat y = w^\\top x + b$' },
    });
    await value('update_project', { description: 'Shop, with $\\sum$ inside.' });
    await value('update_scenario', { scenario: 'request', description: WITH_MATH });

    expect((await value('get_item', { id: 'api' })).description).toBe(WITH_MATH);
    const view = await value('read_view', { view: 'overview' });
    expect(JSON.stringify(view)).toContain(
      JSON.stringify('Each row: $\\hat y = w^\\top x + b$').slice(1, -1),
    );
    expect((await value('read_scenario', { scenario: 'request' })).description).toBe(WITH_MATH);
    expect((await value('get_project', {})).description).toBe('Shop, with $\\sum$ inside.');
    // As the text is read without its markers, the TeX stays as written.
    expect(plainText(WITH_MATH)).toContain('$L = \\frac{1}{n}\\sum_i (y_i - \\hat y_i)^2$');
  });
});

describe('what a write says of the Math it wrote', () => {
  it('tells, as a notice, each text it set that reads as Math', async () => {
    const answer = await value('update_element', { id: 'api', description: WITH_MATH });
    expect(answer.notices).toEqual([READS_AS_MATH('the description of the element "API"')]);
    expect(answer.warnings).toBeUndefined();
  });

  it('warns of Math that cannot be typeset, which is drawn as its TeX', async () => {
    const answer = await value('add_free_shape', {
      view: 'overview',
      shape: {
        kind: 'note',
        x: 0,
        y: 400,
        width: 200,
        height: 80,
        text: 'In red: $\\color{red}{x}$',
      },
    });
    expect(answer.notices).toEqual([READS_AS_MATH('a note in the view "Overview"')]);
    expect(answer.warnings).toEqual([
      'Math in a note in the view "Overview" is drawn as its TeX, "\\color{red}{x}", since it cannot be typeset: Math does not take \\color: colors come from the theme.',
    ]);
  });

  it('tells nothing of dollars that stay text, of escaped ones, or of texts it did not change', async () => {
    const prices = await value('update_element', {
      id: 'api',
      description: 'Plans at $20 and $30, or $ 5 a call.',
    });
    expect(prices.notices).toBeUndefined();

    const escaped = await value('update_element', {
      id: 'db',
      escapeText: true,
      description: 'SELECT * FROM t WHERE a = $1 AND b = $x$',
    });
    expect(escaped.notices).toBeUndefined();
    expect(element('db')?.description).toBe('SELECT \\* FROM t WHERE a = \\$1 AND b = \\$x$');

    await value('update_element', { id: 'cart', description: '$x$' });
    // A later write that changes another text says nothing of the Math already there.
    const other = await value('update_element', {
      id: 'customer',
      description: 'Pays in $US',
      name: 'Buyer',
    });
    expect(other.notices).toBeUndefined();
    // Renaming what holds Math does not make its text new.
    const renamed = await value('update_element', { id: 'cart', name: 'Basket $' });
    expect(renamed.notices).toBeUndefined();
  });
});

describe('escapeText, for outside material with dollars', () => {
  it('keeps SQL placeholders and dollar-quoted bodies reading as typed, with no Math', () => {
    const sql = [
      'CREATE FUNCTION total(id int) RETURNS numeric AS $$',
      'SELECT sum(price) FROM items WHERE order_id = $1',
      '$$ LANGUAGE sql; -- costs $20 and $30, $tag$x$tag$',
    ].join('\n');
    const command = escapeTexts(session.snapshot, {
      type: 'update-element',
      id: 'db',
      changes: { description: sql },
    });
    const written = (command as Extract<Command, { type: 'update-element' }>).changes
      .description as string;
    expect(plainText(written)).toBe(sql);
    expect(holdsMath(written)).toBe(false);
    // Unescaped, the same text reads as Math.
    expect(holdsMath(sql)).toBe(true);
  });
});

/** Whether a text, read with its blocks, holds a math block or Math within a line. */
function holdsMath(text: string): boolean {
  return parseEmphasis(text, { blocks: true }).some(
    (block) =>
      block.kind === 'math' ||
      (block.kind === 'paragraph' && block.runs.some((run) => run.math !== undefined)),
  );
}
