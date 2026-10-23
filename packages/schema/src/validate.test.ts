import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileKind } from './kinds';
import type { ValidationError } from './validate';
import { parseFile, validateFile } from './validate';

/** The problems found in `data` as a project file of the given kind; empty when there are none. */
function problemsIn(kind: FileKind, data: unknown): ValidationError[] {
  const result = validateFile(kind, data);
  return result.ok ? [] : result.errors;
}

const ID_MESSAGE =
  'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit';
const COLOR_MESSAGE = 'must be a color written as #rrggbb';

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
    const result = parseFile('project', '﻿{ "schemaVersion": 1, "name": "A", "packages": [] }');
    expect(result).toEqual({ ok: true, value: { schemaVersion: 1, name: 'A', packages: [] } });
  });

  it('reports JSON that does not match the schema of its kind', () => {
    const result = parseFile('project', '{ "schemaVersion": 2, "name": "A", "packages": [] }');
    expect(result).toEqual({
      ok: false,
      errors: [{ path: '/schemaVersion', message: 'must be 1' }],
    });
  });

  it.each([
    ['project', 'project.vaproject'],
    ['model', 'model.vamodel'],
    ['package', 'packages/systems.vapackage'],
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
      { path: '', message: 'must not have the property "version"' },
      { path: '/elements/0', message: 'must not have the property "colour"' },
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
      errors: [{ path: '', message: 'must not have the property "__proto__"' }],
    });
  });

  describe('of a project file', () => {
    const project = { schemaVersion: 1, name: 'My systems', packages: ['systems'] };

    it('accepts a valid one', () => {
      expect(validateFile('project', project)).toEqual({ ok: true, value: project });
    });

    it.each([
      [
        'a missing required property',
        { schemaVersion: 1, packages: [] },
        [{ path: '', message: 'must have the property "name"' }],
      ],
      [
        'a value of the wrong type',
        { ...project, packages: 'systems' },
        [{ path: '/packages', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...project, version: '1.0' },
        [{ path: '', message: 'must not have the property "version"' }],
      ],
      [
        'an id that breaks the Id pattern',
        { ...project, packages: ['systems', 'Data modeling'] },
        [{ path: '/packages/1', message: ID_MESSAGE }],
      ],
      [
        'a schema version other than 1',
        { ...project, schemaVersion: 2 },
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

    it.each([
      [
        'a missing required property',
        { world, elements: [] },
        [{ path: '', message: 'must have the property "relations"' }],
      ],
      [
        'a value of the wrong type',
        { ...model, elements: {} },
        [{ path: '/elements', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...model, elements: [{ ...api, colour: '#ffffff' }] },
        [{ path: '/elements/0', message: 'must not have the property "colour"' }],
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
        [{ path: '/world', message: 'must have the property "component"' }],
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

    it.each([
      [
        'a missing required property',
        { ...pkg, components: [{ id: 'systems.box', name: 'Box' }] },
        [{ path: '/components/0', message: 'must have the property "derivesFrom"' }],
      ],
      [
        'a value of the wrong type',
        { ...pkg, relationTypes: [{ ...isPartOf, nests: 'yes' }] },
        [{ path: '/relationTypes/0/nests', message: 'must be true or false' }],
      ],
      [
        'an unknown property',
        { ...pkg, components: [{ ...service, appearance: { icon: 'server' } }] },
        [{ path: '/components/0/appearance', message: 'must not have the property "icon"' }],
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

    it.each([
      [
        'a missing required property',
        { ...view, perspective: undefined },
        [{ path: '', message: 'must have the property "perspective"' }],
      ],
      [
        'a value of the wrong type',
        { ...view, positions: [{ element: 'clinic-booking', x: '240', y: 40 }] },
        [{ path: '/positions/0/x', message: 'must be a number' }],
      ],
      [
        'an unknown property',
        { ...view, positions: [{ element: 'clinic-booking', x: 240, y: 40, z: 1 }] },
        [{ path: '/positions/0', message: 'must not have the property "z"' }],
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
        [{ path: '/freeShapes/0', message: 'must have the property "kind"' }],
      ],
      [
        'a note with a property of an arrow',
        { ...view, freeShapes: [{ ...note, from: { x: 0, y: 0 } }] },
        [{ path: '/freeShapes/0', message: 'must not have the property "from"' }],
      ],
      [
        'an arrow without an end',
        { ...view, freeShapes: [note, { ...arrow, to: undefined }] },
        [{ path: '/freeShapes/1', message: 'must have the property "to"' }],
      ],
      [
        'a note that is not positive in size',
        { ...view, freeShapes: [{ ...note, height: -10 }] },
        [{ path: '/freeShapes/0/height', message: 'must be greater than 0' }],
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
        [{ path: '', message: 'must have the property "view"' }],
      ],
      [
        'a value of the wrong type',
        { ...scenario, steps: {} },
        [{ path: '/steps', message: 'must be an array' }],
      ],
      [
        'an unknown property',
        { ...scenario, steps: [{ id: 'ask', description: '', relations: ['r'], branch: 'b' }] },
        [{ path: '/steps/0', message: 'must not have the property "branch"' }],
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
