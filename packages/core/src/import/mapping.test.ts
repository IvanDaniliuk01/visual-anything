/**
 * From a plan to the one action (ADR-0042): the mapping the dialog starts with, from the built-in
 * suggestions; the definitions it may choose, built-in packages not in use included; and the prepared
 * batch, which starts using those packages, types the file's text as the attributes' types say, and
 * matches the relations that importing again would repeat to the project's own, in the same one
 * undoable action.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { ER, FLOWCHART } from './fixtures/mermaid';
import { systemsProject } from './fixtures/projects';
import { mappingChoices, prepareImport, suggestMapping } from './mapping';
import { readMermaid } from './mermaid';
import type { ImportMapping, ImportPlan, PlannedElement } from './plan';
import { readTable } from './table';

function mermaid(text: string): ImportPlan {
  const read = readMermaid({ name: 'diagram.mmd', text });
  if (!read.ok) throw new Error(read.problems.join(' '));
  return read.plan;
}

function table(text: string, state: ProjectSnapshot): ImportPlan {
  const read = readTable({ name: 'again.csv', text }, { project: state });
  if (!read.ok) throw new Error(read.problems.join(' '));
  return read.plan;
}

/** Prepares and applies an import, and checks that one undo restores the project exactly. */
function land(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping = suggestMapping(state, plan),
) {
  const prepared = prepareImport(state, plan, mapping, sequentialIds());
  if (!prepared.ok) throw new Error(prepared.problems.join(' '));
  const outcome = executeCommand(state, prepared.command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return { prepared, after: outcome.state };
}

describe('suggestMapping', () => {
  it('chooses each kind’s suggestion the project has, and the nesting relation type', () => {
    const state = systemsProject();
    expect(suggestMapping(state, mermaid(FLOWCHART), { view: 'overview' })).toEqual({
      elements: {
        circle: 'systems.box',
        rectangle: 'systems.box',
        'class:service': 'systems.service',
        cylinder: 'systems.database',
        hexagon: 'systems.box',
        subgraph: 'systems.system',
      },
      relations: {
        arrow: 'systems.communicates-with',
        'thick-arrow': 'systems.communicates-with',
        'dotted-arrow': 'systems.communicates-with',
        line: 'relates-to',
      },
      nesting: 'systems.is-part-of',
    });
  });

  it('prefers the project’s own definition of the same name to a built-in one it does not use', () => {
    const mapping = suggestMapping(testProject(), mermaid('flowchart LR\n  a[(Stock)] --> b[Box]'));
    expect(mapping.elements).toEqual({ cylinder: 'test.database', rectangle: 'test.box' });
  });

  it('chooses a built-in definition the project does not use yet, and Essence for no suggestion', () => {
    const mapping = suggestMapping(
      testProject(),
      mermaid('flowchart LR\n  a@{ shape: doc } --> b((Round))\n  subgraph s\n    b\n  end'),
    );
    // The project has a Box of its own, but no System.
    expect(mapping.elements).toEqual({
      'shape:doc': 'essence',
      circle: 'test.box',
      subgraph: 'systems.system',
    });
    expect(mapping.relations).toEqual({ arrow: 'systems.communicates-with' });
  });

  it('nests columns in tables through the relation type whose limits fit them', () => {
    const mapping = suggestMapping(systemsProject(), mermaid(ER));
    expect(mapping.elements).toEqual({
      entity: 'data-modeling.table',
      attribute: 'data-modeling.column',
    });
    expect(mapping.nesting).toBe('data-modeling.is-column-of');
  });

  it('chooses no nesting for a plan where nothing sits inside anything', () => {
    expect(
      suggestMapping(systemsProject(), mermaid('flowchart LR\n a --> b')).nesting,
    ).toBeUndefined();
  });

  it('keeps every kind the plan names as an entry of its own, whatever the name', () => {
    const plan = mermaid('flowchart LR\n  a:::__proto__ --> b:::constructor');
    const mapping = suggestMapping(testProject(), plan);
    expect(Object.hasOwn(mapping.elements, 'class:__proto__')).toBe(true);
    expect(mapping.elements['class:constructor']).toBe('essence');
    expect(Object.hasOwn(mapping.elements, 'toString')).toBe(false);
    expect(Object.getPrototypeOf(mapping.elements)).toBeNull();
  });
});

describe('mappingChoices', () => {
  it('lists the project’s definitions first, then those of built-in packages it does not use', () => {
    const choices = mappingChoices(systemsProject());
    const ids = choices.components.map((each) => each.id);
    expect(ids[0]).toBe('essence');
    expect(ids).toContain('systems.database');
    expect(choices.components.find((each) => each.id === 'data-modeling.table')).toEqual({
      id: 'data-modeling.table',
      name: 'Table',
      package: 'data-modeling',
      inUse: false,
    });
    expect(ids.indexOf('systems.database')).toBeLessThan(ids.indexOf('data-modeling.table'));
    const nesting = choices.relationTypes.filter((each) => each.nests).map((each) => each.id);
    // The project's own first, then the built-in packages' it does not use, the starter packages' too.
    expect(nesting[0]).toBe('systems.is-part-of');
    expect(nesting).toContain('data-modeling.is-column-of');
  });
});

describe('prepareImport', () => {
  it('lands a flowchart as one action, with its view, containers and relations', () => {
    const state = systemsProject();
    const { prepared, after } = land(state, mermaid(FLOWCHART));
    expect(prepared.command.label).toBe('Import "diagram.mmd"');
    expect(prepared.creates).toEqual({ elements: 7, relations: 10, views: 1 });
    expect(prepared.updates).toEqual({ elements: 0, relations: 0 });
    expect(prepared.packages).toEqual([]);
    expect(after.model.elements).toHaveLength(7);
    const view = after.views.find((each) => each.name === 'Checkout');
    expect(view?.nestingRelationTypes).toEqual(['systems.is-part-of']);
  });

  it('starts using a built-in package the mapping chooses, in the same action', () => {
    const { prepared, after } = land(systemsProject(), mermaid(ER));
    expect(prepared.packages).toEqual(['data-modeling']);
    expect(prepared.command.commands[0]).toEqual({
      type: 'update-project',
      changes: { packages: ['systems', 'data-modeling'] },
    });
    expect(after.project.packages).toEqual(['systems', 'data-modeling']);
    const columns = after.model.relations.filter(
      (each) => each.relationType === 'data-modeling.is-column-of',
    );
    expect(columns).toHaveLength(9);
  });

  it('types the text of a spreadsheet as the attributes’ types say, keeping what does not parse', () => {
    const state = testProject();
    const plan = table(
      'name,component,latency,owner\nA,test.service,120,Team\nB,test.service,fast,\n',
      state,
    );
    const { after } = land(state, plan);
    const byName = (name: string) => after.model.elements.find((each) => each.name === name);
    expect(byName('A')?.attributes).toEqual({ latency: 120, owner: 'Team' });
    expect(byName('B')?.attributes).toEqual({ latency: 'fast' });
  });

  it('leaves out, and reports, a relation the project already has when importing again', () => {
    const state = testProject();
    const plan = table('from,to,kind\nclient,api,calls\napi,client,calls\n', state);
    const { prepared, after } = land(state, plan);
    expect(prepared.creates.relations).toBe(1);
    expect(prepared.plan.unmatched).toContainEqual({
      text: 'Client → API',
      why: 'The project already has this relation, so it is not created again.',
    });
    expect(after.model.relations).toHaveLength(state.model.relations.length + 1);
  });

  it('updates a relation the project already has when importing again changes its values', () => {
    const state = testProject();
    const plan = table('from,to,kind,protocol\nclient,api,calls,https\napi,client,calls,\n', state);
    const { prepared, after } = land(state, plan);
    expect(prepared.updates).toEqual({ elements: 0, relations: 1 });
    expect(prepared.creates.relations).toBe(1);
    const call = after.model.relations.find((each) => each.id === 'client-calls-api');
    expect(call).toEqual({ ...state.model.relations[2], attributes: { protocol: 'https' } });
    expect(after.model.relations).toHaveLength(state.model.relations.length + 1);
  });

  it('counts the elements it updates by what changes in them', () => {
    const state = testProject();
    const { prepared } = land(state, table('id,name,latency\napi,API,20\ndb,Database,\n', state));
    // "api" keeps its name and latency, so only "db", renamed, changes.
    expect(prepared.updates).toEqual({ elements: 1, relations: 0 });
    expect(prepared.creates.elements).toBe(0);
  });

  it('says why it cannot, with the plan’s own problems', () => {
    const prepared = prepareImport(systemsProject(), mermaid(FLOWCHART), {
      elements: {},
      relations: {},
    });
    expect(prepared.ok).toBe(false);
    expect(!prepared.ok && prepared.problems).toContain('No component is chosen for "circle".');
  });

  it('lands any small plan as one action that one undo takes back exactly', () => {
    const KINDS = ['box', 'db', '__proto__', 'constructor', 'toString', 'prototype'];
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'api', 'constructor', 'toString'), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.array(fc.constantFrom(...KINDS), { minLength: 6, maxLength: 6 }),
        fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 6 }),
        fc.boolean(),
        (keys, kindsOf, pairs, withView) => {
          const state = testProject();
          const elements: PlannedElement[] = keys.map((key, at) => ({
            key,
            sourceId: key,
            name: key.toUpperCase(),
            kind: kindsOf[at] ?? 'box',
          }));
          const plan: ImportPlan = {
            format: 'test',
            source: 'random.json',
            elements,
            relations: pairs
              .filter(([from, to]) => from < keys.length && to < keys.length)
              .map(([from, to], at) => ({
                key: `relation ${at + 1}`,
                from: keys[from] as string,
                to: keys[to] as string,
                kind: at % 2 === 0 ? 'calls' : '__proto__',
              })),
            containment: [],
            views: withView ? [{ key: 'view', name: 'Random', shows: [...keys] }] : [],
            kinds: { elements: [], relations: [] },
            unmatched: [],
          };
          const mapping: ImportMapping = {
            elements: Object.fromEntries(
              KINDS.map((kind) => [kind, kind === 'db' ? 'test.database' : 'test.box']),
            ),
            relations: Object.fromEntries([
              ['calls', 'relates-to'],
              ['__proto__', 'test.governs'],
            ]),
          };
          const { prepared, after } = land(state, plan, mapping);
          expect(after.model.elements).toHaveLength(state.model.elements.length + keys.length);
          expect(prepared.creates.elements).toBe(keys.length);
          expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        },
      ),
      { numRuns: 60 },
    );
  });
});
