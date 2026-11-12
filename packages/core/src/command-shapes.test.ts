/**
 * The shapes of commands (ADR 0104): every command refuses a key it does not take, a field it needs
 * and a value of the wrong kind, naming them, before it changes anything; `describeCommand` reads the
 * same table; and no command, however malformed, answers with the JavaScript engine's words.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SHAPES,
  commandShapeProblems,
  describeCommand,
  listCommands,
  type FieldShape,
} from './commands/shapes';
import { executeCommand, type Command, type CommandOutcome, type CommandType } from './commands';
import { applyOperations } from './operations';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';
import { BUILTIN_PACKAGES } from './builtin';

function run(command: unknown, state: ProjectSnapshot = testProject()): CommandOutcome {
  return executeCommand(state, command as Command, { newId: sequentialIds() });
}

function refusal(command: unknown, state?: ProjectSnapshot): string[] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.message);
}

function ok(command: unknown, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  return outcome;
}

const TYPES = Object.keys(COMMAND_SHAPES) as CommandType[];

describe('keys a command does not take', () => {
  it('refuses one in the changes of update-view, naming it, the keys it takes and where scope goes', () => {
    expect(
      refusal({
        type: 'update-view',
        id: 'overview',
        changes: { routeStyle: 'straight', scope: { rules: [] } },
      }),
    ).toEqual([
      'update-view does not take "changes.scope": "changes" takes name, description, perspective, nestingRelationTypes, routeStyle, rows, selectionFadesLines. A view\'s scope is set with set-scope.',
    ]);
  });

  it('refuses a delete given ids, naming the fields it takes', () => {
    expect(refusal({ type: 'delete', ids: ['api'] })).toEqual([
      'delete does not take "ids": it takes elements, relations. Give the elements\' ids in elements and the relations\' in relations.',
    ]);
  });

  it('says where a key given at the wrong level goes', () => {
    expect(refusal({ type: 'update-view', id: 'overview', name: 'Renamed' })).toEqual([
      'update-view does not take "name": it takes id, changes. "name" goes in "changes".',
      'update-view needs "changes".',
    ]);
    expect(
      refusal({
        type: 'create-element',
        element: { component: 'test.box', name: 'Box', before: 'api' },
      }),
    ).toEqual([
      'create-element does not take "element.before": "element" takes id, component, name, description, attributes, appearance, ids, pose. "before" goes at the command\'s level.',
    ]);
  });

  it('refuses every unknown key, at any level, and in a batch says which command', () => {
    expect(
      refusal({
        type: 'batch',
        label: 'Two',
        commands: [
          { type: 'update-element', id: 'api', changes: { name: 'API' } },
          { type: 'update-element', id: 'api', changes: { nam: 'API' }, extra: 1 },
        ],
      }),
    ).toEqual([
      'Command 2 of the batch: update-element does not take "extra": it takes id, changes.',
      'Command 2 of the batch: update-element does not take "changes.nam": "changes" takes name, description, component, appearance, appearanceTraits, attributes, removeAttributes, ids, pose.',
    ]);
  });

  it('takes a key left undefined as left out, as a program building a command leaves it', () => {
    ok({
      type: 'update-view',
      id: 'overview',
      changes: { name: 'Renamed', description: undefined },
    });
  });
});

describe('fields a command needs and values of the wrong kind', () => {
  it('refuses a missing field, naming it', () => {
    expect(refusal({ type: 'update-view', changes: { name: 'Renamed' } })).toEqual([
      'update-view needs "id".',
    ]);
    expect(refusal({ type: 'create-element', element: { name: 'Box' } })).toEqual([
      'create-element needs "element.component".',
    ]);
  });

  it('refuses a value of the wrong kind, naming what it takes', () => {
    expect(refusal({ type: 'update-view', id: 'overview', changes: null })).toEqual([
      'update-view takes "changes" as an object, not null.',
    ]);
    expect(refusal({ type: 'update-view', id: 'overview', changes: { name: 5 } })).toEqual([
      'update-view takes "changes.name" as text, not 5.',
    ]);
    expect(refusal({ type: 'delete', elements: 'api' })).toEqual([
      'delete takes "elements" as a list, not "api".',
    ]);
    expect(refusal({ type: 'update-view', id: 'overview', changes: { routeStyle: 7 } })).toEqual([
      'update-view takes "changes.routeStyle" as text or null, not 7.',
    ]);
    expect(
      refusal({ type: 'set-collapsed', view: 'overview', elements: [], collapsed: 'yes' }),
    ).toEqual(['set-collapsed takes "collapsed" as true or false, not "yes".']);
    expect(
      refusal({ type: 'restack', view: 'overview', moves: [], extra: undefined, id: 1 }),
    ).toEqual(['restack does not take "id": it takes view, moves.']);
  });
});

describe('update-free-shape', () => {
  it('merges partial changes over the stored shape', () => {
    const outcome = ok({
      type: 'update-free-shape',
      view: 'overview',
      id: 'note',
      changes: { height: 340 },
    });
    expect(outcome.state.views[0]?.freeShapes[0]).toEqual({
      kind: 'note',
      id: 'note',
      x: 0,
      y: 320,
      width: 200,
      height: 340,
      text: 'Hi',
    });
    expect(outcome.label).toBe('Edit a note in "Overview"');
  });

  it('takes an optional part out with null, and labels a change of colors as one', () => {
    const colored = ok({
      type: 'update-free-shape',
      view: 'overview',
      id: 'note',
      changes: { fill: '#FFEEAA' },
    });
    expect(colored.label).toBe('Change the colors of a note in "Overview"');
    const reset = ok(
      { type: 'update-free-shape', view: 'overview', id: 'note', changes: { fill: null } },
      colored.state,
    );
    expect(reset.state.views[0]?.freeShapes[0]).not.toHaveProperty('fill');
    expect(reset.label).toBe('Reset the colors of a note in "Overview"');
  });

  it('still replaces a shape whole, as the app sends it', () => {
    const outcome = ok({
      type: 'update-free-shape',
      view: 'overview',
      shape: { kind: 'note', id: 'note', x: 1, y: 2, width: 3, height: 4, text: 'Bye' },
    });
    expect(outcome.state.views[0]?.freeShapes[0]).toMatchObject({ x: 1, text: 'Bye' });
  });

  it.each([
    [
      'changes without an id',
      { changes: { height: 340 } },
      'update-free-shape needs the free shape whole in "shape", or its "id" with "changes".',
    ],
    [
      'an id without changes',
      { id: 'note' },
      'update-free-shape needs the free shape whole in "shape", or its "id" with "changes".',
    ],
    [
      'both forms',
      { id: 'note', changes: { height: 3 }, shape: { kind: 'note', id: 'note' } },
      'update-free-shape takes the free shape whole in "shape", or its "id" with "changes", not both.',
    ],
    [
      'a whole shape without its id',
      { shape: { kind: 'note', x: 0, y: 0, text: 'Hi' } },
      'update-free-shape needs the id of the free shape it replaces in "shape.id".',
    ],
    [
      'an id the view does not have',
      { id: 'nothing', changes: { height: 3 } },
      'The view "Overview" has no free shape "nothing".',
    ],
    [
      'a change a note does not take',
      { id: 'note', changes: { from: { x: 0, y: 0 } } },
      'A note has no "from": it takes x, y, width, height, text, fill, stroke.',
    ],
    [
      'a change of kind',
      { id: 'note', changes: { kind: 'arrow' } },
      'update-free-shape does not take "changes.kind": "changes" takes x, y, width, height, text, fill, stroke, from, to, media, poster, name, explorable, element.',
    ],
  ])('refuses %s, never with a JavaScript error', (_name, fields, message) => {
    expect(refusal({ type: 'update-free-shape', view: 'overview', ...fields })).toEqual([message]);
  });
});

describe('describeCommand', () => {
  it('lists every command with its meaning', () => {
    const list = listCommands();
    expect(list.map((each) => each.type)).toEqual(TYPES);
    expect(list.every((each) => each.meaning.length > 0)).toBe(true);
  });

  it('gives a command its fields, which it needs, what each means, and an example', () => {
    const view = describeCommand('update-view');
    expect(view).toMatchObject({
      type: 'update-view',
      example: { type: 'update-view' },
    });
    expect(view?.fields.map((each) => each.name)).toEqual(['id', 'changes']);
    const changes = view?.fields.find((each) => each.name === 'changes');
    expect(changes).toMatchObject({ type: 'object', required: true });
    expect(changes?.fields?.map((each) => each.name)).toContain('routeStyle');
    expect(changes?.fields?.find((each) => each.name === 'routeStyle')).toMatchObject({
      type: '"straight" | "curved" | null',
      required: false,
    });
  });

  it('describes no command for a type that is none', () => {
    expect(describeCommand('scope')).toBeUndefined();
    expect(describeCommand('constructor')).toBeUndefined();
  });

  it.each(TYPES)(
    'has an example of %s that its own table takes, and a meaning for each field',
    (type) => {
      const shape = COMMAND_SHAPES[type];
      expect(shape.example.type).toBe(type);
      expect(commandShapeProblems(shape.example)).toEqual([]);
      const fields = (all: Readonly<Record<string, FieldShape>>): void => {
        for (const field of Object.values(all)) {
          expect(field.meaning.length).toBeGreaterThan(0);
          expect(field.type.length).toBeGreaterThan(0);
          if (field.fields) fields(field.fields);
        }
      };
      fields(shape.fields);
    },
  );
});

/** A random JSON value, small. */
const json = fc.jsonValue({ maxDepth: 2 });

/** Keys the items of commands' lists hold, so that random items reach past their first check. */
const ITEM_KEYS = [
  'element',
  'id',
  'x',
  'y',
  'view',
  'container',
  'relationType',
  'kind',
  'shape',
  'to',
  'from',
  'at',
  'pose',
  'description',
  'relations',
  'conflict',
  'take',
  'name',
  'entries',
  'exactly',
];

/** Keys of the objects commands hold whole, such as a free shape, a scope or a package. */
const OBJECT_KEYS = [
  'text',
  'width',
  'height',
  'media',
  'include',
  'exclude',
  'added',
  'leftOut',
  'anchor',
  'comment',
  'of',
  'attribute',
  'channel',
  'mapping',
  'components',
  'derivesFrom',
  'svg',
  'format',
  'data',
  'detail',
  'fill',
  'stroke',
];

/** A value for a field: often of its kind, with keys it takes when it is an object, or any JSON. */
function valueFor(field: FieldShape, ids: readonly string[]): fc.Arbitrary<unknown> {
  const id = fc.constantFrom(...ids);
  const of: fc.Arbitrary<unknown>[] = [json];
  if (field.kind === 'text') of.push(id, fc.string());
  if (field.kind === 'number') of.push(fc.integer({ min: -500, max: 500 }), fc.double());
  if (field.kind === 'boolean') of.push(fc.boolean());
  if (field.kind === 'list') {
    of.push(
      fc.array(id, { maxLength: 3 }),
      fc.array(
        fc.dictionary(
          fc.constantFrom(...ITEM_KEYS),
          fc.oneof(id, json, fc.dictionary(fc.constantFrom(...ITEM_KEYS), fc.oneof(id, json))),
        ),
        { maxLength: 3 },
      ),
    );
  }
  if (field.kind === 'object' || field.kind === 'any') {
    if (field.fields) of.push(objectFor(field.fields, ids));
    of.push(fc.dictionary(fc.constantFrom(...ITEM_KEYS, ...OBJECT_KEYS), fc.oneof(id, json)));
  }
  if (field.nullable) of.push(fc.constant(null));
  return fc.oneof(...of);
}

function objectFor(
  fields: Readonly<Record<string, FieldShape>>,
  ids: readonly string[],
): fc.Arbitrary<Record<string, unknown>> {
  const model = Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, valueFor(field, ids)]),
  );
  return fc.record(model, { requiredKeys: [] });
}

/** What the JavaScript engine says of a value it cannot read, which no refusal may pass on. */
const ENGINE_WORDS =
  /not well formed|Cannot read|Cannot convert|Cannot use|is not a function|is not iterable|is not an object|Invalid array length|Maximum call stack/;

describe('malformed commands', () => {
  const state = testProject();
  const ids = [
    ...state.model.elements.map((each) => each.id),
    ...state.model.relations.map((each) => each.id),
    ...state.views.map((each) => each.id),
    'note',
    'test',
    'test.box',
    'test.inside',
    'request',
    'world',
  ];

  it.each(TYPES)(
    "of type %s are only ever done or refused, never with the engine's words",
    (type) => {
      fc.assert(
        fc.property(objectFor(COMMAND_SHAPES[type].fields, ids), (fields) => {
          // As it comes over the wire: JSON, read back.
          const command: unknown = JSON.parse(JSON.stringify({ ...fields, type }));
          const outcome = run(command, state);
          if (outcome.ok) return;
          expect(outcome.problems.length).toBeGreaterThan(0);
          for (const each of outcome.problems) {
            expect(each.message).not.toMatch(ENGINE_WORDS);
          }
        }),
        { numRuns: Number(process.env.FUZZ_RUNS ?? 150) },
      );
    },
  );
});

describe('the command shapes, from review', () => {
  it('names no inherited property as a hint for a key such as "constructor"', () => {
    for (const key of ['constructor', 'toString', '__proto__']) {
      const [message] = refusal(JSON.parse(`{"type":"delete","elements":[],"${key}":1}`));
      expect(message).toContain(`does not take "${key}"`);
      expect(message).not.toMatch(/native code|\[object Object\]/);
    }
  });

  it('gives examples whose built-in relation types and components exist', () => {
    const defined = new Set(
      BUILTIN_PACKAGES.flatMap((file) => [
        ...file.components.map((each) => each.id),
        ...file.relationTypes.map((each) => each.id),
      ]),
    );
    const prefixes = new Set(BUILTIN_PACKAGES.map((file) => `${file.id}.`));
    const named: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') {
        if ([...prefixes].some((prefix) => value.startsWith(prefix))) named.push(value);
      } else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    for (const shape of Object.values(COMMAND_SHAPES)) walk(shape.example);
    expect(named.filter((id) => !defined.has(id))).toEqual([]);
  });
});
