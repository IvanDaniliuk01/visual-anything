import { readFileSync, readdirSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import modelSchema from '../schemas/model.schema.json' with { type: 'json' };
import packageSchema from '../schemas/package.schema.json' with { type: 'json' };
import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import scenarioSchema from '../schemas/scenario.schema.json' with { type: 'json' };
import viewSchema from '../schemas/view.schema.json' with { type: 'json' };
import type { ModelFile, PackageFile, ProjectFile, ScenarioFile, ViewFile } from './files';
import { formatFile } from './format';
import type { FileContentByKind, FileKind } from './kinds';
import { FILE_KINDS, fileKindOf } from './kinds';
import { anyJson, bent, shuffleKeys, validContents } from './test/arbitraries';
import { validateFile } from './validate';

/** Formats contents that may not be valid for the kind, as the contents of a file on disk may not be. */
function formatAny(kind: FileKind, value: unknown): string {
  return formatFile(kind, value as FileContentByKind[FileKind]);
}

/** The keys of every object in a JSON text, by JSON pointer, in the order the text writes them. */
function keyOrders(text: string): Record<string, string[]> {
  const orders: Record<string, string[]> = {};
  const visit = (value: unknown, pointer: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${String(index)}`));
    } else if (typeof value === 'object' && value !== null) {
      orders[pointer] = Object.keys(value);
      for (const [key, item] of Object.entries(value)) visit(item, `${pointer}/${key}`);
    }
  };
  visit(JSON.parse(text), '');
  return orders;
}

/**
 * Whether an object in a value has a key that JavaScript enumerates before the others whatever their
 * order, such as "10": an array index.
 */
function hasIndexKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasIndexKeys);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, item]) => /^(?:0|[1-9][0-9]*)$/.test(key) || hasIndexKeys(item),
  );
}

describe('formatFile', () => {
  it('writes a project file with the keys in the order of its schema', () => {
    const project: ProjectFile = {
      packages: ['systems', 'clinic'],
      description: 'A sample project.',
      name: 'My systems',
      schemaVersion: 1,
    };
    expect(formatFile('project', project)).toBe(`{
  "schemaVersion": 1,
  "name": "My systems",
  "description": "A sample project.",
  "packages": [
    "systems",
    "clinic"
  ]
}
`);
  });

  it('writes a model file with the keys in the order of its schema', () => {
    const model: ModelFile = {
      relations: [
        {
          attributes: { pool: 10 },
          description: 'Reads the free slots.',
          name: 'SQL',
          to: 'appointments-db',
          from: 'appointments-api',
          relationType: 'systems.reads-from',
          id: 'api-reads-db',
        },
      ],
      elements: [
        {
          appearance: {
            height: 72,
            width: 180,
            stroke: '#1D4F91',
            fill: '#DCEBFF',
            shape: 'rounded-rectangle',
          },
          attributes: { replicas: 3, owner: 'Scheduling team' },
          description: 'Books appointments.',
          name: 'Appointments API',
          component: 'systems.service',
          id: 'appointments-api',
        },
      ],
      world: { name: 'My systems', component: 'essence', id: 'world' },
    };
    expect(keyOrders(formatFile('model', model))).toEqual({
      '': ['world', 'elements', 'relations'],
      '/world': ['id', 'component', 'name'],
      '/elements/0': ['id', 'component', 'name', 'description', 'attributes', 'appearance'],
      '/elements/0/attributes': ['owner', 'replicas'],
      '/elements/0/appearance': ['shape', 'fill', 'stroke', 'width', 'height'],
      '/relations/0': ['id', 'relationType', 'from', 'to', 'name', 'description', 'attributes'],
      '/relations/0/attributes': ['pool'],
    });
  });

  it('writes a package file with the keys in the order of its schema', () => {
    const pkg: PackageFile = {
      relationTypes: [
        {
          limits: { to: ['systems.person'], from: ['systems.service'] },
          appearance: { dash: 'dashed', width: 2, stroke: '#3D4651' },
          attributes: [
            {
              description: 'Since when.',
              default: { year: 2026, month: 10 },
              type: 'json',
              name: 'since',
            },
          ],
          nests: false,
          direction: 'directed',
          description: 'Sends a person a reminder.',
          derivesFrom: 'systems.communicates-with',
          name: 'reminds',
          id: 'clinic.reminds',
        },
      ],
      components: [
        {
          appearance: {
            height: 72,
            width: 180,
            stroke: '#1D4F91',
            fill: '#DCEBFF',
            shape: 'cylinder',
          },
          attributes: [
            { description: 'The time zone.', default: 'UTC', type: 'string', name: 'timezone' },
          ],
          description: 'Holds the slots.',
          derivesFrom: 'systems.database',
          name: 'Calendar',
          id: 'clinic.calendar',
        },
      ],
      description: 'What this clinic needs.',
      name: 'Clinic',
      id: 'clinic',
    };
    expect(keyOrders(formatFile('package', pkg))).toEqual({
      '': ['id', 'name', 'description', 'components', 'relationTypes'],
      '/components/0': ['id', 'name', 'derivesFrom', 'description', 'attributes', 'appearance'],
      '/components/0/attributes/0': ['name', 'type', 'default', 'description'],
      '/components/0/appearance': ['shape', 'fill', 'stroke', 'width', 'height'],
      '/relationTypes/0': [
        'id',
        'name',
        'derivesFrom',
        'description',
        'direction',
        'nests',
        'attributes',
        'appearance',
        'limits',
      ],
      '/relationTypes/0/attributes/0': ['name', 'type', 'default', 'description'],
      '/relationTypes/0/attributes/0/default': ['month', 'year'],
      '/relationTypes/0/appearance': ['stroke', 'width', 'dash'],
      '/relationTypes/0/limits': ['from', 'to'],
    });
  });

  it('writes a view file with the keys in the order of its schema', () => {
    const view: ViewFile = {
      stackingOrder: { world: ['clinic-booking'], 'clinic-booking': ['scheduling', 'whatsapp'] },
      freeShapes: [],
      positions: [
        {
          pinned: true,
          height: 380,
          width: 440,
          y: 60,
          x: 500,
          container: 'clinic-booking',
          element: 'scheduling',
        },
      ],
      nestingRelationTypes: ['systems.is-part-of'],
      perspective: { description: 'Who sends what to whom.', name: 'Data flow' },
      description: 'How a booking request travels.',
      name: 'System overview',
      id: 'system-overview',
    };
    expect(keyOrders(formatFile('view', view))).toEqual({
      '': [
        'id',
        'name',
        'description',
        'perspective',
        'nestingRelationTypes',
        'positions',
        'freeShapes',
        'stackingOrder',
      ],
      '/perspective': ['name', 'description'],
      '/positions/0': ['element', 'container', 'x', 'y', 'width', 'height', 'pinned'],
      // The keys of the stacking order are ids, so they are sorted; each list keeps its order.
      '/stackingOrder': ['clinic-booking', 'world'],
    });
    expect(JSON.parse(formatFile('view', view))).toMatchObject({
      stackingOrder: { 'clinic-booking': ['scheduling', 'whatsapp'] },
    });
  });

  it('writes a scenario file with the keys in the order of its schema', () => {
    const scenario: ScenarioFile = {
      steps: [
        {
          dataOut: { slots: ['2026-10-27T10:00'], count: 1 },
          dataIn: { to: '2026-10-30', specialty: 'cardiology', from: '2026-10-26' },
          relations: ['api-reads-db'],
          description: 'The API reads the free slots.',
          id: 'read-calendar',
        },
      ],
      view: 'system-overview',
      description: 'A patient books an appointment.',
      name: 'Patient books an appointment',
      id: 'patient-books-appointment',
    };
    expect(keyOrders(formatFile('scenario', scenario))).toEqual({
      '': ['id', 'name', 'description', 'view', 'steps'],
      '/steps/0': ['id', 'description', 'relations', 'dataIn', 'dataOut'],
      '/steps/0/dataIn': ['from', 'specialty', 'to'],
      '/steps/0/dataOut': ['count', 'slots'],
    });
  });

  it('writes each kind of free shape with the keys in the order of its own schema', () => {
    const view: ViewFile = {
      id: 'v',
      name: 'V',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [],
      freeShapes: [
        {
          text: 'A note.',
          height: 72,
          width: 460,
          y: 560,
          x: 240,
          id: 'calendar-note',
          kind: 'note',
        },
        { to: { y: 80, x: 120 }, from: { y: 0, x: 0 }, id: 'look-here', kind: 'arrow' },
      ],
    };
    expect(keyOrders(formatFile('view', view))).toMatchObject({
      '/freeShapes/0': ['kind', 'id', 'x', 'y', 'width', 'height', 'text'],
      '/freeShapes/1': ['kind', 'id', 'from', 'to'],
      '/freeShapes/1/from': ['x', 'y'],
      '/freeShapes/1/to': ['x', 'y'],
    });
  });

  it('writes a free shape of an unknown kind, or of none, with its kind first and the rest sorted', () => {
    const view = {
      id: 'v',
      name: 'V',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [],
      freeShapes: [
        { text: 'A circle?', r: 4, kind: 'circle', id: 'c' },
        { y: 1, kind: 7, id: 'seven', x: 2 },
        { y: 1, id: 'k', x: 2 },
      ],
    };
    expect(keyOrders(formatAny('view', view))).toMatchObject({
      '/freeShapes/0': ['kind', 'id', 'r', 'text'],
      '/freeShapes/1': ['kind', 'id', 'x', 'y'],
      '/freeShapes/2': ['id', 'x', 'y'],
    });
  });

  it('sorts the keys of free-form objects by UTF-16 code units, at any depth', () => {
    // U+1F600 is written in UTF-16 as D83D DE00, so it comes before U+FF21, though its code point is higher.
    const emoji = String.fromCodePoint(0x1f600);
    const fullwidthA = String.fromCharCode(0xff21);
    const model: ModelFile = {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        {
          id: 'api',
          component: 'systems.service',
          name: 'API',
          attributes: {
            [fullwidthA]: 1,
            [emoji]: 2,
            zeta: { b: [{ y: 1, x: [{ d: 1, c: 2 }] }], a: null },
            alpha: 3,
            Alpha: 4,
            '9': 5,
            '10': 6,
            '': 7,
          },
        },
      ],
      relations: [],
    };
    expect(formatFile('model', model)).toBe(`{
  "world": {
    "id": "world",
    "component": "essence",
    "name": "World"
  },
  "elements": [
    {
      "id": "api",
      "component": "systems.service",
      "name": "API",
      "attributes": {
        "": 7,
        "10": 6,
        "9": 5,
        "Alpha": 4,
        "alpha": 3,
        "zeta": {
          "a": null,
          "b": [
            {
              "x": [
                {
                  "c": 2,
                  "d": 1
                }
              ],
              "y": 1
            }
          ]
        },
        "${emoji}": 2,
        "${fullwidthA}": 1
      }
    }
  ],
  "relations": []
}
`);
  });

  it('sorts the keys of the data in and out of steps, at any depth', () => {
    const scenario: ScenarioFile = {
      id: 's',
      name: 'S',
      view: 'v',
      steps: [
        {
          id: 'book',
          description: '',
          relations: ['api-writes-db'],
          dataIn: [{ slot: '2026-10-27T10:00', patient: { name: 'Ana', id: 'patient-1042' } }],
          dataOut: { reminderAt: '2026-10-26T10:00', appointment: 'apt-5531' },
        },
      ],
    };
    expect(keyOrders(formatFile('scenario', scenario))).toMatchObject({
      '/steps/0/dataIn/0': ['patient', 'slot'],
      '/steps/0/dataIn/0/patient': ['id', 'name'],
      '/steps/0/dataOut': ['appointment', 'reminderAt'],
    });
  });

  it('puts the keys a schema does not list after the ones it lists, sorted', () => {
    const model = {
      version: 2,
      world: {
        zIndex: 1,
        id: 'world',
        colour: '#ffffff',
        component: 'essence',
        name: 'World',
        meta: { z: 1, a: { d: [{ f: 1, e: 2 }], c: 3 } },
      },
      relations: [],
      comment: 'Edited by hand.',
      elements: [],
    };
    expect(keyOrders(formatAny('model', model))).toEqual({
      '': ['world', 'elements', 'relations', 'comment', 'version'],
      '/world': ['id', 'component', 'name', 'colour', 'meta', 'zIndex'],
      '/world/meta': ['a', 'z'],
      '/world/meta/a': ['c', 'd'],
      '/world/meta/a/d/0': ['e', 'f'],
    });
  });

  it('puts a key of another kind of free shape after the keys of a note', () => {
    const view = {
      id: 'v',
      name: 'V',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [],
      freeShapes: [
        {
          to: { y: 1, x: 2 },
          kind: 'note',
          color: 'red',
          id: 'n',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          text: '',
        },
      ],
    };
    expect(keyOrders(formatAny('view', view))).toMatchObject({
      '/freeShapes/0': ['kind', 'id', 'x', 'y', 'width', 'height', 'text', 'color', 'to'],
      '/freeShapes/0/to': ['x', 'y'],
    });
  });

  it('keeps the order of arrays', () => {
    const project: ProjectFile = { schemaVersion: 1, name: 'P', packages: ['zeta', 'alpha', 'mu'] };
    const scenario: ScenarioFile = {
      id: 's',
      name: 'S',
      view: 'v',
      steps: [
        { id: 'second', description: '', relations: ['r2', 'r1'], dataIn: [3, 1, 2] },
        { id: 'first', description: '', relations: ['r1'] },
      ],
    };
    expect(JSON.parse(formatFile('project', project))).toMatchObject({
      packages: ['zeta', 'alpha', 'mu'],
    });
    expect(JSON.parse(formatFile('scenario', scenario))).toMatchObject({
      steps: [{ id: 'second', relations: ['r2', 'r1'], dataIn: [3, 1, 2] }, { id: 'first' }],
    });
  });

  it('writes the files of an empty project', () => {
    expect(formatFile('project', { packages: [], name: 'Untitled', schemaVersion: 1 })).toBe(`{
  "schemaVersion": 1,
  "name": "Untitled",
  "packages": []
}
`);
    expect(
      formatFile('model', {
        relations: [],
        elements: [],
        world: { attributes: {}, name: 'Untitled', component: 'essence', id: 'world' },
      }),
    ).toBe(`{
  "world": {
    "id": "world",
    "component": "essence",
    "name": "Untitled",
    "attributes": {}
  },
  "elements": [],
  "relations": []
}
`);
    expect(formatFile('package', { relationTypes: [], components: [], name: 'Own', id: 'own' }))
      .toBe(`{
  "id": "own",
  "name": "Own",
  "components": [],
  "relationTypes": []
}
`);
    expect(
      formatFile('view', {
        freeShapes: [],
        positions: [],
        nestingRelationTypes: [],
        perspective: { name: 'Overview' },
        name: 'Overview',
        id: 'overview',
      }),
    ).toBe(`{
  "id": "overview",
  "name": "Overview",
  "perspective": {
    "name": "Overview"
  },
  "nestingRelationTypes": [],
  "positions": [],
  "freeShapes": []
}
`);
    expect(formatFile('scenario', { steps: [], view: 'overview', name: 'First', id: 'first' }))
      .toBe(`{
  "id": "first",
  "name": "First",
  "view": "overview",
  "steps": []
}
`);
  });

  it('lays the text out as JSON.stringify(value, null, 2) does, with LF line endings', () => {
    const newline = String.fromCharCode(10);
    const tab = String.fromCharCode(9);
    const backslash = String.fromCharCode(92);
    const loneSurrogate = String.fromCharCode(0xd800);
    const lineSeparator = String.fromCharCode(0x2028);
    // Its keys are in canonical order already, so JSON.stringify writes the same text.
    const view: ViewFile = {
      id: 'v',
      name: `Quotes " and ${backslash} backslashes`,
      description: `Lines${newline}and${tab}tabs, ${loneSurrogate} and ${lineSeparator}, ñandú`,
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [{ element: 'e', x: 1e21, y: -1.5e-7, width: 5e-324, height: 0.1 }],
      freeShapes: [{ kind: 'arrow', id: 'a', from: { x: -1.5, y: 2 }, to: { x: 3, y: 4 } }],
    };
    const text = formatFile('view', view);
    expect(text).toBe(`${JSON.stringify(view, null, 2)}${newline}`);
    expect(text).not.toContain(String.fromCharCode(13));
  });

  it('writes -0 as 0, as JSON.stringify does', () => {
    const view: ViewFile = {
      id: 'v',
      name: 'V',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: [],
      positions: [{ element: 'e', x: -0, y: 0 }],
      freeShapes: [],
    };
    expect(JSON.parse(formatFile('view', view))).toMatchObject({ positions: [{ x: 0, y: 0 }] });
    expect(formatFile('view', view)).toContain('"x": 0,');
  });

  it('leaves out keys whose value is undefined, and writes undefined in an array as null', () => {
    const model = {
      world: {
        id: 'world',
        component: 'essence',
        name: 'World',
        description: undefined,
        attributes: { owner: undefined, tags: [1, undefined, 2] },
      },
      elements: [],
      relations: [],
    };
    expect(formatAny('model', model)).toBe(`{
  "world": {
    "id": "world",
    "component": "essence",
    "name": "World",
    "attributes": {
      "tags": [
        1,
        null,
        2
      ]
    }
  },
  "elements": [],
  "relations": []
}
`);
  });

  it('keeps "__proto__" as an ordinary key', () => {
    const model = JSON.parse(
      '{ "world": { "id": "world", "component": "essence", "name": "World", "attributes": { "z": 1, "__proto__": { "polluted": true } } }, "elements": [], "relations": [], "__proto__": 2 }',
    ) as unknown;
    const text = formatAny('model', model);
    expect(keyOrders(text)).toMatchObject({
      '': ['world', 'elements', 'relations', '__proto__'],
      '/world/attributes': ['__proto__', 'z'],
    });
    expect(JSON.parse(text)).toEqual(model);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each(FILE_KINDS)('writes a %s file that holds no object at all', (kind) => {
    const values = [null, true, 42, 'text', [], [{ b: 1, a: 2 }], {}];
    for (const value of values) {
      const text = formatAny(kind, value);
      expect(JSON.parse(text)).toEqual(value);
    }
    expect(formatAny(kind, [{ b: 1, a: 2 }])).toBe(`[
  {
    "a": 2,
    "b": 1
  }
]
`);
  });

  it('writes values of JSON types the schema does not expect, sorting the keys it cannot place', () => {
    const model = {
      world: 'World',
      elements: { b: 1, a: [{ d: 1, c: 2 }] },
      relations: [
        null,
        3,
        [{ y: 1, x: 2 }],
        { to: 'b', relationType: 7, from: 'a', id: 'r', attributes: [{ y: 1, x: 2 }] },
      ],
    };
    const text = formatAny('model', model);
    expect(JSON.parse(text)).toEqual(model);
    expect(keyOrders(text)).toEqual({
      '': ['world', 'elements', 'relations'],
      '/elements': ['a', 'b'],
      '/elements/a/0': ['c', 'd'],
      '/relations/2/0': ['x', 'y'],
      '/relations/3': ['id', 'relationType', 'from', 'to', 'attributes'],
      '/relations/3/attributes/0': ['x', 'y'],
    });
  });

  it('refuses a value that JSON cannot write', () => {
    expect(() => formatAny('project', undefined)).toThrow(TypeError);
    expect(() => formatAny('project', () => 1)).toThrow(TypeError);
  });
});

describe('the sample project', () => {
  const folder = new URL('../../../examples/my-systems/', import.meta.url);
  const files = readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .sort()
    .flatMap((path) => {
      const kind = fileKindOf(path);
      return kind === undefined ? [] : [{ path, kind }];
    });

  it('holds a file of each kind', () => {
    expect(new Set(files.map(({ kind }) => kind))).toEqual(new Set(FILE_KINDS));
  });

  it.each(files)('has $path in canonical form', ({ path, kind }) => {
    const text = readFileSync(new URL(path, folder), 'utf8');
    expect(text).toBe(formatAny(kind, JSON.parse(text)));
  });
});

describe('formatFile, on generated contents', () => {
  const valid = (kind: FileKind) =>
    validContents[kind] as fc.Arbitrary<FileContentByKind[FileKind]>;
  /** Valid contents, and contents bent out of their schema as a file edited by hand may be. */
  const plausible = (kind: FileKind) => fc.oneof(valid(kind), bent(valid(kind)));

  it.each(FILE_KINDS)('generates %s files that their schema accepts', (kind) => {
    fc.assert(
      fc.property(valid(kind), (value) => {
        expect(validateFile(kind, value)).toEqual({ ok: true, value });
      }),
    );
  });

  it.each(FILE_KINDS)('writes a %s file the same whatever the order of its keys', (kind) => {
    fc.assert(
      fc.property(plausible(kind), fc.integer(), (value, seed) => {
        expect(formatAny(kind, shuffleKeys(value, seed))).toBe(formatAny(kind, value));
      }),
    );
  });

  it.each(FILE_KINDS)('writes a %s file as text that formats to itself', (kind) => {
    fc.assert(
      fc.property(plausible(kind), (value) => {
        const text = formatAny(kind, value);
        expect(formatAny(kind, JSON.parse(text))).toBe(text);
      }),
    );
  });

  it.each(FILE_KINDS)('keeps every value of a %s file', (kind) => {
    fc.assert(
      fc.property(plausible(kind), (value) => {
        expect(JSON.parse(formatAny(kind, value)) as unknown).toEqual(value);
      }),
    );
  });

  it.each(FILE_KINDS)('lays a %s file out as JSON.stringify does', (kind) => {
    fc.assert(
      fc.property(plausible(kind), (value) => {
        // JSON.parse moves keys such as "10" first, so JSON.stringify would write them first.
        fc.pre(!hasIndexKeys(value));
        const text = formatAny(kind, value);
        expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
      }),
    );
  });

  it.each(FILE_KINDS)('writes any JSON value as a %s file', (kind) => {
    fc.assert(
      fc.property(anyJson, (value) => {
        const text = formatAny(kind, value);
        expect(JSON.parse(text) as unknown).toEqual(value);
        expect(formatAny(kind, JSON.parse(text))).toBe(text);
      }),
    );
  });
});

/** The keywords formatFile reads to order the keys of a file. */
const READ_KEYWORDS = [
  '$ref',
  'definitions',
  'properties',
  'additionalProperties',
  'items',
  'anyOf',
  'oneOf',
  'allOf',
  'if',
  'then',
  'type',
  'const',
  'enum',
  'required',
];

/** Keywords that never change which keys or items a value has, nor which schema describes them. */
const IDLE_KEYWORDS = [
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  // Only checks the names of keys; formatFile sorts the keys of a map whatever they are.
  'propertyNames',
];

/** A schema and every schema inside it, at any depth. */
function subschemasOf(schema: unknown): Record<string, unknown>[] {
  if (typeof schema !== 'object' || schema === null) return [];
  const subschema = schema as Record<string, unknown>;
  const inner: unknown[] = [];
  for (const [keyword, value] of Object.entries(subschema)) {
    if (keyword === 'properties' || keyword === 'definitions') {
      inner.push(...Object.values(value as Record<string, unknown>));
    } else if (keyword === 'anyOf' || keyword === 'oneOf' || keyword === 'allOf') {
      inner.push(...(value as unknown[]));
    } else if (['additionalProperties', 'items', 'if', 'then'].includes(keyword)) {
      inner.push(value);
    }
  }
  return [subschema, ...inner.flatMap(subschemasOf)];
}

describe('the published schemas', () => {
  const schemas = [projectSchema, modelSchema, packageSchema, viewSchema, scenarioSchema];
  const subschemas = schemas.flatMap(subschemasOf);

  it('use only keywords that formatFile reads or that cannot change the order of keys', () => {
    const known = new Set([...READ_KEYWORDS, ...IDLE_KEYWORDS]);
    const keywords = new Set(subschemas.flatMap((schema) => Object.keys(schema)));
    expect([...keywords].filter((keyword) => !known.has(keyword))).toEqual([]);
  });

  it('tell the members of a discriminated union apart by the const value of a key', () => {
    const conditions = subschemas.flatMap((schema) => (schema.if === undefined ? [] : [schema.if]));
    expect(conditions.length).toBeGreaterThan(0);
    for (const condition of conditions as Record<string, unknown>[]) {
      expect(Object.keys(condition).filter((k) => k !== 'properties' && k !== 'required')).toEqual(
        [],
      );
      for (const test of Object.values(condition.properties as Record<string, object>)) {
        expect(Object.keys(test).filter((k) => !['type', 'const', 'enum'].includes(k))).toEqual([]);
      }
    }
  });

  // formatFile picks the member of a union by the JSON type of the value. Two objects or two arrays
  // in one union would need a discriminator, as FreeShape has.
  it('tell the members of any other union apart by their JSON type', () => {
    for (const schema of schemas as { definitions?: Record<string, { type?: unknown }> }[]) {
      for (const subschema of subschemasOf(schema)) {
        const union = (subschema.anyOf ?? subschema.oneOf) as Record<string, unknown>[] | undefined;
        const types = (union ?? []).map((member) => {
          const ref = member.$ref;
          const target =
            typeof ref === 'string'
              ? schema.definitions?.[ref.replace('#/definitions/', '')]
              : member;
          return target?.type;
        });
        expect(types).not.toContain(undefined);
        expect(new Set(types).size).toBe(types.length);
      }
    }
  });
});
