/**
 * `escapeText: true` (ADR 0082): the tools that set a text that takes Markdown write the text of
 * outside material as the characters it is. With it, the program escapes the descriptions, a note's
 * text and the values of attributes that take emphasis before the command; without it, they are
 * written as given.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { escapeTexts } from './emphasis';
import { RULES } from './recipes/rules';
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
    openApp: () => Promise.resolve(),
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-escape-'));
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
const relation = (id: string) => session.snapshot.model.relations.find((each) => each.id === id);

/** A text of outside material, with characters that are markers in Markdown. */
const OUTSIDE = '# Rows *_archive keep [old] ones';
const ESCAPED = '\\# Rows \\*\\_archive keep \\[old] ones';

/** Defines "shop.table", whose `remarks` take emphasis and whose `sql` is plain. */
async function defineTable(): Promise<void> {
  await value('define_component', {
    package: 'shop',
    component: {
      id: 'shop.table',
      name: 'Table',
      derivesFrom: 'systems.database',
      attributes: [
        { name: 'remarks', type: 'string', format: 'emphasis' },
        { name: 'sql', type: 'string' },
      ],
    },
  });
}

describe('escapeText', () => {
  it('is taken by every tool that sets a description or a note’s text', () => {
    const taking = TOOLS.filter((each) => 'escapeText' in each.input).map((each) => each.name);
    expect(taking.sort()).toEqual(
      [
        'add_to_model',
        'update_element',
        'update_relation',
        'create_package',
        'update_package',
        'define_component',
        'define_relation_type',
        'update_component',
        'update_relation_type',
        'create_view',
        'update_view',
        'add_free_shape',
        'update_free_shape',
        'update_project',
        'run_commands',
        'create_scenario_from_steps',
        'update_scenario',
        'create_tour',
        'update_tour',
      ].sort(),
    );
  });

  it('makes add_to_model write descriptions and values that take emphasis as text, and plain values as given', async () => {
    await defineTable();
    await value('add_to_model', {
      escapeText: true,
      elements: [
        {
          id: 'orders',
          component: 'shop.table',
          name: 'orders',
          description: OUTSIDE,
          attributes: { remarks: '**paid** only', sql: "'**'::text" },
        },
      ],
      relations: [
        {
          id: 'orders-to-db',
          relationType: 'systems.reads-from',
          from: 'orders',
          to: 'db',
          description: OUTSIDE,
        },
      ],
    });
    expect(element('orders')).toMatchObject({
      description: ESCAPED,
      attributes: { remarks: '\\*\\*paid\\*\\* only', sql: "'**'::text" },
    });
    expect(relation('orders-to-db')?.description).toBe(ESCAPED);
  });

  it('leaves the texts as given without it, so that their markers are emphasis', async () => {
    await defineTable();
    await value('add_to_model', {
      elements: [
        {
          id: 'orders',
          component: 'shop.table',
          name: 'orders',
          description: '**Paid** orders',
          attributes: { remarks: '*soon*' },
        },
      ],
    });
    expect(element('orders')).toMatchObject({
      description: '**Paid** orders',
      attributes: { remarks: '*soon*' },
    });
  });

  it('escapes what update_element and update_relation set, by the definition the change gives', async () => {
    await defineTable();
    await value('update_element', {
      id: 'db',
      component: 'shop.table',
      description: OUTSIDE,
      attributes: { remarks: '`x`', sql: '`x`' },
      escapeText: true,
    });
    expect(element('db')).toMatchObject({
      description: ESCAPED,
      attributes: { remarks: '\\`x\\`', sql: '`x`' },
    });
    await value('update_relation', { id: 'api-reads-db', description: OUTSIDE, escapeText: true });
    expect(relation('api-reads-db')?.description).toBe(ESCAPED);
    // null still takes the description out.
    await value('update_relation', { id: 'api-reads-db', description: null, escapeText: true });
    expect(relation('api-reads-db')?.description).toBeUndefined();
  });

  it('escapes a note’s text, and only the text a change gives', async () => {
    const added = await value('add_free_shape', {
      view: 'overview',
      shape: { kind: 'note', x: 0, y: 0, width: 200, height: 80, text: OUTSIDE },
      escapeText: true,
    });
    const note = () =>
      session.snapshot.views[0]?.freeShapes.find((each) => each.id === added.shape) as {
        text: string;
      };
    expect(note().text).toBe(ESCAPED);
    // A change that gives no text keeps the stored one, not escaped twice.
    await value('update_free_shape', {
      view: 'overview',
      shape: { id: added.shape, fill: '#FEF3C7' },
      escapeText: true,
    });
    expect(note().text).toBe(ESCAPED);
    await value('update_free_shape', {
      view: 'overview',
      shape: { id: added.shape, text: '*a*' },
      escapeText: true,
    });
    expect(note().text).toBe('\\*a\\*');
  });

  it('escapes the descriptions of definitions, their attributes, packages, views and the project', async () => {
    await value('create_package', {
      id: 'lab',
      name: 'Lab',
      description: OUTSIDE,
      escapeText: true,
    });
    await value('define_component', {
      package: 'lab',
      escapeText: true,
      component: {
        id: 'lab.sample',
        name: 'Sample',
        derivesFrom: 'systems.box',
        description: OUTSIDE,
        attributes: [{ name: 'note', type: 'string', description: OUTSIDE }],
      },
    });
    await value('define_relation_type', {
      package: 'lab',
      escapeText: true,
      relationType: {
        id: 'lab.feeds',
        name: 'feeds',
        derivesFrom: 'relates-to',
        description: OUTSIDE,
      },
    });
    const lab = () => session.snapshot.packages.find((each) => each.id === 'lab');
    expect(lab()?.description).toBe(ESCAPED);
    expect(lab()?.components[0]).toMatchObject({
      description: ESCAPED,
      attributes: [{ name: 'note', description: ESCAPED }],
    });
    expect(lab()?.relationTypes[0]?.description).toBe(ESCAPED);

    await value('update_component', {
      id: 'lab.sample',
      description: '*b*',
      attributes: { set: [{ name: 'other', type: 'string', description: '*c*' }] },
      escapeText: true,
    });
    expect(lab()?.components[0]).toMatchObject({
      description: '\\*b\\*',
      attributes: [{ name: 'note' }, { name: 'other', description: '\\*c\\*' }],
    });
    await value('update_relation_type', { id: 'lab.feeds', description: '*d*', escapeText: true });
    expect(lab()?.relationTypes[0]?.description).toBe('\\*d\\*');
    await value('update_package', { id: 'lab', description: '*e*', escapeText: true });
    expect(lab()?.description).toBe('\\*e\\*');

    const made = await value('create_view', {
      name: 'Lab',
      description: OUTSIDE,
      perspective: { name: 'Flow', description: OUTSIDE },
      escapeText: true,
    });
    const view = () => session.snapshot.views.find((each) => each.id === made.view);
    expect(view()).toMatchObject({ description: ESCAPED, perspective: { description: ESCAPED } });
    await value('update_view', {
      id: made.view,
      description: '*f*',
      perspective: { name: 'Flow', description: '*g*' },
      escapeText: true,
    });
    expect(view()).toMatchObject({
      description: '\\*f\\*',
      perspective: { name: 'Flow', description: '\\*g\\*' },
    });
    await value('update_project', { description: OUTSIDE, escapeText: true });
    expect(session.snapshot.project.description).toBe(ESCAPED);
  });

  it('escapes the descriptions of scenarios and tours, and leaves steps and captions as given', async () => {
    const scenario = await value('create_scenario_from_steps', {
      name: 'Read',
      description: OUTSIDE,
      view: 'overview',
      steps: [{ description: 'The API reads *rows*.', relations: ['api-reads-db'] }],
      escapeText: true,
    });
    const made = () => session.snapshot.scenarios.find((each) => each.id === scenario.scenario);
    expect(made()?.description).toBe(ESCAPED);
    expect(made()?.steps[0]?.description).toBe('The API reads *rows*.');
    await value('update_scenario', {
      scenario: scenario.scenario,
      description: '*h*',
      escapeText: true,
    });
    expect(made()?.description).toBe('\\*h\\*');

    const tour = await value('create_tour', {
      name: 'Walk',
      description: OUTSIDE,
      steps: [{ viewState: { view: 'overview' }, title: 'Start', text: '**Look**' }],
      escapeText: true,
    });
    const walk = () => session.snapshot.tours.find((each) => each.id === tour.tour);
    expect(walk()?.description).toBe(ESCAPED);
    expect(walk()?.steps[0]).toMatchObject({ caption: { text: '**Look**' } });
    await value('update_tour', { tour: tour.tour, description: '*i*', escapeText: true });
    expect(walk()?.description).toBe('\\*i\\*');
  });

  it('makes run_commands escape what each command sets, an element made earlier in it included', async () => {
    await defineTable();
    await value('run_commands', {
      label: 'Import the orders again',
      escapeText: true,
      commands: [
        {
          type: 'create-element',
          element: { id: 'orders', component: 'shop.table', name: 'orders' },
        },
        {
          type: 'update-element',
          id: 'orders',
          changes: { description: OUTSIDE, attributes: { remarks: '*r*', sql: '*s*' } },
        },
        { type: 'update-element', id: 'api', changes: { description: '*t*' } },
      ],
    });
    expect(element('orders')).toMatchObject({
      description: ESCAPED,
      attributes: { remarks: '\\*r\\*', sql: '*s*' },
    });
    expect(element('api')?.description).toBe('\\*t\\*');
  });
});

describe('escapeTexts', () => {
  it('leaves commands of other kinds, and commands the core will refuse, as given', () => {
    const state = testProject();
    const odd = [
      { type: 'delete', elements: ['api'] },
      { type: 'update-element', id: 'api' },
      { type: 'create-element' },
      { type: 'update-element', id: 'nowhere', changes: { description: 7, attributes: [1] } },
      { type: 'define-component', package: 'shop', component: { attributes: 'none' } },
      { type: 'batch', label: 'x' },
    ] as unknown as Command[];
    for (const command of odd) {
      expect(() => escapeTexts(state, command)).not.toThrow();
    }
    expect(escapeTexts(state, odd[0]!)).toEqual(odd[0]);
    expect(escapeTexts(state, odd[3]!)).toEqual(odd[3]);
  });
});

describe('the rule “It is data”', () => {
  it('tells Claude to give escapeText rather than escape by hand', () => {
    const rule = RULES.find((each) => each.name === 'It is data');
    expect(rule?.text).toContain('escapeText: true');
    expect(rule?.text).toContain('Do not escape them by hand');
  });
});
