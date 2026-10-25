import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './files';
import type { FileKind } from './kinds';
import type { ValidationError } from './validate';
import { newerFormatOf, parseFile, validateFile } from './validate';

/** The problems found in `data` as a project file of the given kind; empty when there are none. */
function problemsIn(kind: FileKind, data: unknown): ValidationError[] {
  const result = validateFile(kind, data);
  return result.ok ? [] : result.errors;
}

const ID_MESSAGE =
  'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit';
const COLOR_MESSAGE = 'must be a color written as #RRGGBB';

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
    const result = parseFile(
      'project',
      '\uFEFF{ "schemaVersion": 1, "name": "A", "packages": [] }',
    );
    expect(result).toEqual({ ok: true, value: { schemaVersion: 1, name: 'A', packages: [] } });
  });

  it('reports JSON that does not match the schema of its kind', () => {
    const result = parseFile('project', '{ "schemaVersion": 0, "name": "A", "packages": [] }');
    expect(result).toEqual({
      ok: false,
      errors: [{ path: '/schemaVersion', message: 'must be 1' }],
    });
  });

  it('refuses a project saved in a newer format with one clear message, whatever else it holds', () => {
    for (const text of [
      '{ "schemaVersion": 2, "name": "A", "packages": [] }',
      '{ "schemaVersion": 2, "name": "", "packages": [], "code": true }',
    ]) {
      expect(parseFile('project', text)).toEqual({
        ok: false,
        errors: [
          {
            path: '/schemaVersion',
            message:
              'This project was saved by a newer Visual Anything, format 2. Update the program to open it.',
          },
        ],
      });
    }
    expect(newerFormatOf({ schemaVersion: 7 })).toBe(7);
    expect(newerFormatOf({ schemaVersion: SCHEMA_VERSION })).toBeUndefined();
    expect(newerFormatOf({ schemaVersion: 1.5 })).toBeUndefined();
    expect(newerFormatOf({ schemaVersion: '2' })).toBeUndefined();
    expect(newerFormatOf(null)).toBeUndefined();
  });

  it.each([
    ['project', 'project.vaproject'],
    ['model', 'model.vamodel'],
    ['package', 'packages/clinic.vapackage'],
    ['view', 'views/system-overview.vaview'],
    ['scenario', 'scenarios/patient-books-appointment.vascenario'],
  ] as const)('reads the %s file of the sample project (%s)', (kind, path) => {
    const text = readFileSync(
      new URL(`../../../examples/my-systems/${path}`, import.meta.url),
      'utf8',
    );
    expect(parseFile(kind, text)).toEqual({ ok: true, value: JSON.parse(text) as unknown });
  });
});

describe('validateFile', () => {
  it('rejects data that is not a JSON object', () => {
    expect(problemsIn('model', [])).toEqual([{ path: '', message: 'must be an object' }]);
    expect(problemsIn('project', null)).toEqual([{ path: '', message: 'must be an object' }]);
  });

  it('reports every problem at once, in a stable order', () => {
    const model = {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [{ id: 'api one', component: 'systems.service', name: 'API', colour: '#ffffff' }],
      relations: [{ id: 'r', relationType: 'systems.reads-from', from: 'api', to: 'db?' }],
      version: 2,
    };
    const expected = [
      { path: '', message: 'must not have the key "version"' },
      { path: '/elements/0', message: 'must not have the key "colour"' },
      { path: '/elements/0/id', message: ID_MESSAGE },
      { path: '/relations/0/to', message: ID_MESSAGE },
    ];
    expect(problemsIn('model', model)).toEqual(expected);
    expect(problemsIn('model', model)).toEqual(expected);
  });

  it('treats a "__proto__" key as an unknown property', () => {
    const result = parseFile(
      'project',
      '{ "schemaVersion": 1, "name": "A", "packages": [], "__proto__": { "polluted": true } }',
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ path: '', message: 'must not have the key "__proto__"' }],
    });
  });

  describe('of a project file', () => {
    const project = { schemaVersion: 1, name: 'My systems', packages: ['systems'] };

    it('accepts a valid one', () => {
      expect(validateFile('project', project)).toEqual({ ok: true, value: project });
    });

    it('accepts the project appearances it gives to definitions it cannot change', () => {
      const withAppearances = {
        ...project,
        appearances: {
          components: {
            'systems.service': { fill: '#FFE8D6', stroke: '#b4531a' },
            essence: { shape: 'rounded-rectangle', width: 176 },
          },
          relationTypes: {
            'systems.writes-to': { stroke: '#B42318', width: 3 },
            'relates-to': { dash: 'dotted' },
          },
        },
      };
      expect(validateFile('project', withAppearances)).toEqual({
        ok: true,
        value: withAppearances,
      });
      const componentsOnly = { ...project, appearances: { components: { essence: {} } } };
      expect(validateFile('project', componentsOnly)).toEqual({
        ok: true,
        value: componentsOnly,
      });
    });

    it('reports each key of a project appearance that is not an id on its own', () => {
      expect(
        problemsIn('project', {
          ...project,
          appearances: {
            components: { 'a service': { fill: '#FFFFFF' }, 'a/b': {}, essence: {} },
          },
        }),
      ).toEqual([
        {
          path: '/appearances/components',
          message: 'must have ids as its keys, and "a service" is not one',
        },
        {
          path: '/appearances/components',
          message: 'must have ids as its keys, and "a/b" is not one',
        },
      ]);
    });

    it.each([
      [
        'a project appearance with a trait no appearance has',
        { ...project, appearances: { components: { 'systems.service': { opacity: 0.5 } } } },
        [
          {
            path: '/appearances/components/systems.service',
            message: 'must not have the key "opacity"',
          },
        ],
      ],
      [
        'a project appearance with a color that has an alpha',
        { ...project, appearances: { components: { 'systems.service': { fill: '#FFE8D6CC' } } } },
        [{ path: '/appearances/components/systems.service/fill', message: COLOR_MESSAGE }],
      ],
      [
        'a relation type appearance with a trait of a component',
        { ...project, appearances: { relationTypes: { 'relates-to': { fill: '#FFFFFF' } } } },
        [
          {
            path: '/appearances/relationTypes/relates-to',
            message: 'must not have the key "fill"',
          },
        ],
      ],
      [
        'project appearances for something other than definitions',
        { ...project, appearances: { elements: {} } },
        [{ path: '/appearances', message: 'must not have the key "elements"' }],
      ],
      [
        'empty project appearances',
        { ...project, appearances: {} },
        [{ path: '/appearances', message: 'must not be empty' }],
      ],
      [
        'an empty map of project appearances',
        { ...project, appearances: { relationTypes: {} } },
        [{ path: '/appearances/relationTypes', message: 'must not be empty' }],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('project', data)).toEqual(errors);
    });

    it.each([
      [
        'a missing required property',
        { schemaVersion: 1, packages: [] },
        [{ path: '', message: 'must have the key "name"' }],
      ],
      [
        'a value of the wrong type',
        { ...project, packages: 'systems' },
        [{ path: '/packages', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...project, version: '1.0' },
        [{ path: '', message: 'must not have the key "version"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...project, packages: ['systems', 'Data modeling'] },
        [{ path: '/packages/1', message: ID_MESSAGE }],
      ],
      [
        'a schema version other than 1',
        { ...project, schemaVersion: 1.5 },
        [{ path: '/schemaVersion', message: 'must be 1' }],
      ],
      [
        'an empty name',
        { ...project, name: '' },
        [{ path: '/name', message: 'must not be empty' }],
      ],
      [
        'a package listed twice',
        { ...project, packages: ['systems', 'systems'] },
        [
          {
            path: '/packages',
            message: 'must not have duplicate items (items 0 and 1 are the same)',
          },
        ],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('project', data)).toEqual(errors);
    });
  });

  describe('of a model file', () => {
    const world = { id: 'world', component: 'essence', name: 'My systems' };
    const api = {
      id: 'appointments-api',
      component: 'systems.service',
      name: 'Appointments API',
      description: 'Books appointments.',
      attributes: {
        owner: 'Scheduling team',
        replicas: 3,
        tags: ['http', null],
        limits: { rps: 50 },
      },
      appearance: { shape: 'rounded-rectangle', fill: '#DCEBFF', stroke: '#1d4f91', width: 180 },
    };
    const db = { id: 'appointments-db', component: 'systems.database', name: 'Appointments DB' };
    const reads = {
      id: 'api-reads-db',
      relationType: 'systems.reads-from',
      from: 'appointments-api',
      to: 'appointments-db',
      name: 'SQL',
      attributes: { pool: 10 },
    };
    // A relation can end on another relation.
    const contract = {
      id: 'contract',
      relationType: 'systems.governs',
      from: 'world',
      to: 'api-reads-db',
    };
    const model = { world, elements: [api, db], relations: [reads, contract] };

    it('accepts a valid one', () => {
      expect(validateFile('model', model)).toEqual({ ok: true, value: model });
    });

    it('accepts a relation with an appearance of its own', () => {
      const marked = {
        ...model,
        relations: [{ ...reads, appearance: { stroke: '#D6336C', width: 3, dash: 'dashed' } }],
      };
      expect(validateFile('model', marked)).toEqual({ ok: true, value: marked });
    });

    it.each([
      [
        'a missing required property',
        { world, elements: [] },
        [{ path: '', message: 'must have the key "relations"' }],
      ],
      [
        'a value of the wrong type',
        { ...model, elements: {} },
        [{ path: '/elements', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...model, elements: [{ ...api, colour: '#ffffff' }] },
        [{ path: '/elements/0', message: 'must not have the key "colour"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...model, elements: [api, { ...db, id: '-appointments-db' }] },
        [{ path: '/elements/1/id', message: ID_MESSAGE }],
      ],
      [
        'a color that is not #rrggbb',
        { ...model, elements: [{ ...api, appearance: { fill: '#DCEBF' } }] },
        [{ path: '/elements/0/appearance/fill', message: COLOR_MESSAGE }],
      ],
      [
        'a width that is not positive',
        { ...model, elements: [{ ...api, appearance: { width: 0 } }] },
        [{ path: '/elements/0/appearance/width', message: 'must be greater than 0' }],
      ],
      [
        'a World without a component',
        { ...model, world: { id: 'world', name: 'My systems' } },
        [{ path: '/world', message: 'must have the key "component"' }],
      ],
      [
        'a relation appearance with a color that is not #RRGGBB',
        { ...model, relations: [{ ...reads, appearance: { stroke: 'red' } }] },
        [{ path: '/relations/0/appearance/stroke', message: COLOR_MESSAGE }],
      ],
      [
        'a relation appearance with a trait of an element',
        { ...model, relations: [{ ...reads, appearance: { fill: '#FFFFFF' } }] },
        [{ path: '/relations/0/appearance', message: 'must not have the key "fill"' }],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('model', data)).toEqual(errors);
    });
  });

  describe('of a package file', () => {
    const service = {
      id: 'systems.service',
      name: 'Service',
      derivesFrom: 'essence',
      description: 'A running program that others call.',
      attributes: [
        { name: 'owner', type: 'string', description: 'The team that runs it.' },
        { name: 'replicas', type: 'number', default: 1 },
      ],
      appearance: { shape: 'rounded-rectangle', fill: '#DCEBFF', stroke: '#1D4F91', height: 72 },
    };
    const isPartOf = {
      id: 'systems.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      direction: 'directed',
      nests: true,
      attributes: [{ name: 'since', type: 'json', default: { year: 2026 } }],
      appearance: { stroke: '#3D4651', width: 2, dash: 'dashed' },
    };
    const pkg = {
      id: 'systems',
      name: 'Systems',
      components: [service],
      relationTypes: [isPartOf],
    };

    it('accepts a valid one', () => {
      expect(validateFile('package', pkg)).toEqual({ ok: true, value: pkg });
    });

    /** A component that sets every appearance trait, and a relation type with every kind of limit. */
    const queue = {
      id: 'clinic.queue',
      name: 'Queue',
      derivesFrom: 'systems.service',
      attributes: [
        { name: 'depth', type: 'number', description: 'Messages waiting.', unit: 'msgs' },
        {
          name: 'delivery',
          type: 'string',
          default: 'at least once',
          choices: ['at most once', 'at least once', 'exactly once'],
        },
        { name: 'ordered', type: 'boolean' },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FFF4E5',
        width: 100_000,
        detail: {
          componentName: false,
          attributes: ['depth'],
          badges: [
            { when: 'attribute', text: 'ORD', attribute: 'ordered' },
            { when: 'from-end', text: 'FK', relationType: 'clinic.feeds' },
          ],
        },
        contentsAsRows: true,
        connectionPoints: [
          { name: 'in', side: 'left', at: 0.5 },
          { name: 'out', side: 'right', at: 1 },
        ],
      },
    };
    const feeds = {
      id: 'clinic.feeds',
      name: 'feeds',
      derivesFrom: 'relates-to',
      limits: { from: 'any', to: ['clinic.queue'] },
    };
    const clinic = { id: 'clinic', name: 'Clinic', components: [queue], relationTypes: [feeds] };

    // Package code (ADR 0054): data in the file, run only once the person approves it.
    describe('with code', () => {
      const coded = {
        ...pkg,
        id: 'gauges',
        code: ['export function attributes(element) {', '  return { fahrenheit: 1 };', '}'],
        capabilities: ['model:read', 'time', 'network:https://status.example.com:8443'],
      };

      it('accepts its lines and its capabilities', () => {
        expect(validateFile('package', coded)).toEqual({ ok: true, value: coded });
      });

      it.each([
        [
          'a line that holds a line break',
          { ...coded, code: ['export const a = 1;\nexport const b = 2;'] },
          [{ path: '/code/0', message: 'must be one line, without a line break' }],
        ],
        [
          'a line that holds a carriage return',
          { ...coded, code: ['export const a = 1;\r'] },
          [{ path: '/code/0', message: 'must be one line, without a line break' }],
        ],
        [
          'code with no line',
          { ...coded, code: [] },
          [{ path: '/code', message: 'must have at least 1 item' }],
        ],
        [
          'code written as one text',
          { ...coded, code: 'export const a = 1;' },
          [{ path: '/code', message: 'must be an array' }],
        ],
        [
          'a capability it does not know',
          { ...coded, capabilities: ['files:read'] },
          [
            {
              path: '/capabilities/0',
              message:
                'must be "model:read", "time", or "network:" and one web origin, such as "network:https://status.example.com"',
            },
          ],
        ],
        [
          'a network capability with a path',
          { ...coded, capabilities: ['network:https://example.com/api'] },
          [
            {
              path: '/capabilities/0',
              message:
                'must be "model:read", "time", or "network:" and one web origin, such as "network:https://status.example.com"',
            },
          ],
        ],
        [
          'a capability declared twice',
          { ...coded, capabilities: ['time', 'time'] },
          [
            {
              path: '/capabilities',
              message: 'must not have duplicate items (items 0 and 1 are the same)',
            },
          ],
        ],
      ])('rejects %s', (_, data, errors) => {
        expect(problemsIn('package', data)).toEqual(errors);
      });
    });

    it('accepts every appearance trait, attribute choices and units, and limits lifted with "any"', () => {
      expect(validateFile('package', clinic)).toEqual({ ok: true, value: clinic });
      const empty = { ...queue, appearance: { connectionPoints: [], detail: {} } };
      expect(problemsIn('package', { ...clinic, components: [empty] })).toEqual([]);
    });

    const appearanceOf = (appearance: object) => ({
      ...clinic,
      components: [{ ...queue, appearance: { ...queue.appearance, ...appearance } }],
    });
    const detailOf = (detail: object) => appearanceOf({ detail: { ...detail } });
    const badge = { when: 'attribute', text: 'PK', attribute: 'ordered' };

    it.each([
      [
        'an empty limit list',
        { ...clinic, relationTypes: [{ ...feeds, limits: { to: [] } }] },
        [{ path: '/relationTypes/0/limits/to', message: 'must have at least 1 item' }],
      ],
      [
        'a limit that is neither a list nor "any"',
        { ...clinic, relationTypes: [{ ...feeds, limits: { from: 'all' } }] },
        [{ path: '/relationTypes/0/limits/from', message: 'must be an array or "any"' }],
      ],
      [
        'a width above 100,000',
        appearanceOf({ width: 100_001 }),
        [{ path: '/components/0/appearance/width', message: 'must be at most 100000' }],
      ],
      [
        'a detail that writes an attribute twice',
        detailOf({ attributes: ['depth', 'type', 'depth'] }),
        [
          {
            path: '/components/0/appearance/detail/attributes',
            message: 'must not have duplicate items (items 2 and 0 are the same)',
          },
        ],
      ],
      [
        'a limit list that names an id that is not one',
        { ...clinic, relationTypes: [{ ...feeds, limits: { to: ['clinic queue'] } }] },
        [{ path: '/relationTypes/0/limits/to/0', message: ID_MESSAGE }],
      ],
      [
        'a ninth badge',
        detailOf({ badges: Array.from({ length: 9 }, () => badge) }),
        [
          {
            path: '/components/0/appearance/detail/badges',
            message: 'must have at most 8 items',
          },
        ],
      ],
      [
        'a badge text longer than 4',
        detailOf({ badges: [{ ...badge, text: 'PRIMARY' }] }),
        [
          {
            path: '/components/0/appearance/detail/badges/0/text',
            message: 'must have at most 4 characters',
          },
        ],
      ],
      [
        'a badge with an unknown condition',
        detailOf({ badges: [{ ...badge, when: 'always' }] }),
        [
          {
            path: '/components/0/appearance/detail/badges/0/when',
            message: 'must be one of "attribute", "from-end"',
          },
        ],
      ],
      [
        'a connection point beyond the end of its side',
        appearanceOf({ connectionPoints: [{ name: 'in', side: 'left', at: 1.5 }] }),
        [
          {
            path: '/components/0/appearance/connectionPoints/0/at',
            message: 'must be at most 1',
          },
        ],
      ],
      [
        'a connection point on an unknown side',
        appearanceOf({ connectionPoints: [{ name: 'in', side: 'middle', at: 0.5 }] }),
        [
          {
            path: '/components/0/appearance/connectionPoints/0/side',
            message: 'must be one of "top", "right", "bottom", "left"',
          },
        ],
      ],
      [
        'an empty list of choices',
        {
          ...clinic,
          components: [{ ...queue, attributes: [{ name: 'x', type: 'string', choices: [] }] }],
        },
        [{ path: '/components/0/attributes/0/choices', message: 'must have at least 1 item' }],
      ],
      [
        'a unit longer than 16 characters',
        {
          ...clinic,
          components: [
            { ...queue, attributes: [{ name: 'x', type: 'number', unit: 'requests a second' }] },
          ],
        },
        [
          {
            path: '/components/0/attributes/0/unit',
            message: 'must have at most 16 characters',
          },
        ],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('package', data)).toEqual(errors);
    });

    it.each([
      [
        'a missing required property',
        { ...pkg, components: [{ id: 'systems.box', name: 'Box' }] },
        [{ path: '/components/0', message: 'must have the key "derivesFrom"' }],
      ],
      [
        'a value of the wrong type',
        { ...pkg, relationTypes: [{ ...isPartOf, nests: 'yes' }] },
        [{ path: '/relationTypes/0/nests', message: 'must be true or false' }],
      ],
      [
        'an unknown property',
        { ...pkg, components: [{ ...service, appearance: { icon: 'server' } }] },
        [{ path: '/components/0/appearance', message: 'must not have the key "icon"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...pkg, components: [{ ...service, id: 'systems/service' }] },
        [{ path: '/components/0/id', message: ID_MESSAGE }],
      ],
      [
        'an attribute definition with an unknown type',
        { ...pkg, components: [{ ...service, attributes: [{ name: 'since', type: 'date' }] }] },
        [
          {
            path: '/components/0/attributes/0/type',
            message: 'must be one of "string", "number", "boolean", "json"',
          },
        ],
      ],
      [
        'a color that is not #rrggbb',
        { ...pkg, relationTypes: [{ ...isPartOf, appearance: { stroke: 'black' } }] },
        [{ path: '/relationTypes/0/appearance/stroke', message: COLOR_MESSAGE }],
      ],
      [
        'an unknown direction',
        { ...pkg, relationTypes: [{ ...isPartOf, direction: 'both' }] },
        [
          {
            path: '/relationTypes/0/direction',
            message: 'must be one of "directed", "undirected"',
          },
        ],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('package', data)).toEqual(errors);
    });
  });

  describe('of a view file', () => {
    const note = {
      kind: 'note',
      id: 'calendar-note',
      x: 240,
      y: 560,
      width: 460,
      height: 72,
      text: 'Scheduling owns the calendar.',
    };
    const arrow = { kind: 'arrow', id: 'look-here', from: { x: 0, y: 0 }, to: { x: 120, y: 80 } };
    const view = {
      id: 'system-overview',
      name: 'System overview',
      perspective: { name: 'Data flow', description: 'Who sends what to whom.' },
      nestingRelationTypes: ['systems.is-part-of'],
      positions: [
        { element: 'clinic-booking', x: 240, y: 40, width: 980, height: 480 },
        { element: 'appointments-api', container: 'clinic-booking', x: 40, y: 104, pinned: true },
      ],
      freeShapes: [note, arrow],
    };

    it('accepts a valid one', () => {
      expect(validateFile('view', view)).toEqual({ ok: true, value: view });
    });

    it('accepts notes and arrows with colors of their own', () => {
      const colored = {
        ...view,
        freeShapes: [
          { ...note, fill: '#DCEBFF', stroke: '#1d4f91' },
          { ...note, id: 'stroked', stroke: '#1D4F91' },
          { ...arrow, stroke: '#B42318' },
        ],
      };
      expect(validateFile('view', colored)).toEqual({ ok: true, value: colored });
    });

    it('accepts the containers it keeps collapsed', () => {
      const collapsed = { ...view, collapsed: ['clinic-booking', 'scheduling'] };
      expect(validateFile('view', collapsed)).toEqual({ ok: true, value: collapsed });
    });

    it.each([
      [
        'a missing required property',
        { ...view, perspective: undefined },
        [{ path: '', message: 'must have the key "perspective"' }],
      ],
      [
        'a value of the wrong type',
        { ...view, positions: [{ element: 'clinic-booking', x: '240', y: 40 }] },
        [{ path: '/positions/0/x', message: 'must be a number' }],
      ],
      [
        'an unknown property',
        { ...view, positions: [{ element: 'clinic-booking', x: 240, y: 40, z: 1 }] },
        [{ path: '/positions/0', message: 'must not have the key "z"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...view, nestingRelationTypes: ['is part of'] },
        [{ path: '/nestingRelationTypes/0', message: ID_MESSAGE }],
      ],
      [
        'a free shape with an unknown kind',
        { ...view, freeShapes: [{ ...note, kind: 'circle' }] },
        [{ path: '/freeShapes/0/kind', message: 'must be one of "note", "arrow"' }],
      ],
      [
        'a free shape without a kind',
        { ...view, freeShapes: [{ ...note, kind: undefined }] },
        [{ path: '/freeShapes/0', message: 'must have the key "kind"' }],
      ],
      [
        'a note with a property of an arrow',
        { ...view, freeShapes: [{ ...note, from: { x: 0, y: 0 } }] },
        [{ path: '/freeShapes/0', message: 'must not have the key "from"' }],
      ],
      [
        'an arrow without an end',
        { ...view, freeShapes: [note, { ...arrow, to: undefined }] },
        [{ path: '/freeShapes/1', message: 'must have the key "to"' }],
      ],
      [
        'a note that is not positive in size',
        { ...view, freeShapes: [{ ...note, height: -10 }] },
        [{ path: '/freeShapes/0/height', message: 'must be greater than 0' }],
      ],
      [
        'a note whose fill is not #RRGGBB',
        { ...view, freeShapes: [{ ...note, fill: '#FFF' }] },
        [{ path: '/freeShapes/0/fill', message: COLOR_MESSAGE }],
      ],
      [
        'an arrow with a fill',
        { ...view, freeShapes: [{ ...arrow, fill: '#FFFFFF' }] },
        [{ path: '/freeShapes/0', message: 'must not have the key "fill"' }],
      ],
      [
        'an empty stacking order',
        { ...view, stackingOrder: {} },
        [{ path: '/stackingOrder', message: 'must not be empty' }],
      ],
      [
        'an empty stacking list',
        { ...view, stackingOrder: { 'clinic-booking': [] } },
        [{ path: '/stackingOrder/clinic-booking', message: 'must have at least 1 item' }],
      ],
      [
        'a stacking list that names an element twice',
        { ...view, stackingOrder: { 'clinic-booking': ['scheduling', 'whatsapp', 'scheduling'] } },
        [
          {
            path: '/stackingOrder/clinic-booking',
            message: 'must not have duplicate items (items 0 and 2 are the same)',
          },
        ],
      ],
      [
        'a stacking order keyed by something that is not an id',
        { ...view, stackingOrder: { 'clinic booking': ['scheduling'] } },
        [
          {
            path: '/stackingOrder',
            message: 'must have ids as its keys, and "clinic booking" is not one',
          },
        ],
      ],
      [
        'a stacking list with an item that is not an id',
        { ...view, stackingOrder: { 'clinic-booking': [7] } },
        [{ path: '/stackingOrder/clinic-booking/0', message: 'must be a string' }],
      ],
      [
        'an empty list of collapsed containers',
        { ...view, collapsed: [] },
        [{ path: '/collapsed', message: 'must have at least 1 item' }],
      ],
      [
        'a container collapsed twice',
        { ...view, collapsed: ['clinic-booking', 'clinic-booking'] },
        [
          {
            path: '/collapsed',
            message: 'must not have duplicate items (items 0 and 1 are the same)',
          },
        ],
      ],
    ])('rejects %s', (_, data, errors) => {
      // A property set to undefined is left out of the JSON, as JSON.stringify does.
      expect(problemsIn('view', JSON.parse(JSON.stringify(data)))).toEqual(errors);
    });
  });

  describe('of a scenario file', () => {
    const scenario = {
      id: 'patient-books-appointment',
      name: 'Patient books an appointment',
      view: 'system-overview',
      steps: [
        {
          id: 'ask',
          description: 'The patient asks for an appointment on WhatsApp.',
          relations: ['patient-to-whatsapp'],
          dataIn: { text: 'Hi! Can I see a cardiologist next week?' },
          dataOut: 'msg-7f3a',
        },
        { id: 'book', description: '', relations: ['api-writes-db', 'api-to-reminders'] },
      ],
    };

    it('accepts a valid one', () => {
      expect(validateFile('scenario', scenario)).toEqual({ ok: true, value: scenario });
    });

    it('keeps a step whose relation no longer exists, because it is a broken step', () => {
      const broken = {
        ...scenario,
        steps: [{ id: 'ask', description: '', relations: ['deleted'] }],
      };
      expect(validateFile('scenario', broken)).toEqual({ ok: true, value: broken });
    });

    it.each([
      [
        'a missing required property',
        { id: 'a', name: 'A', steps: [] },
        [{ path: '', message: 'must have the key "view"' }],
      ],
      [
        'a value of the wrong type',
        { ...scenario, steps: {} },
        [{ path: '/steps', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...scenario, steps: [{ id: 'ask', description: '', relations: ['r'], branch: 'b' }] },
        [{ path: '/steps/0', message: 'must not have the key "branch"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...scenario, steps: [{ id: 'ask?', description: '', relations: ['r'] }] },
        [{ path: '/steps/0/id', message: ID_MESSAGE }],
      ],
      [
        'a step with an empty relations array',
        { ...scenario, steps: [{ id: 'ask', description: '', relations: [] }] },
        [{ path: '/steps/0/relations', message: 'must have at least 1 item' }],
      ],
      [
        'a step that activates the same relation twice',
        { ...scenario, steps: [{ id: 'ask', description: '', relations: ['r', 's', 'r'] }] },
        [
          {
            path: '/steps/0/relations',
            message: 'must not have duplicate items (items 0 and 2 are the same)',
          },
        ],
      ],
    ])('rejects %s', (_, data, errors) => {
      expect(problemsIn('scenario', data)).toEqual(errors);
    });
  });
});
