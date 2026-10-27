/**
 * The core's labels, refusals and warnings beyond those the core-messages test's run of commands
 * reaches: commands each run alone on the sample, short runs of commands in order, projects broken as
 * their files can be, as they open, and pictures past each of the image cleaner's limits. The
 * core-messages test reads every one of them through the Spanish templates (ADR-0038); a message the
 * core adds needs a fixture here or in that run.
 */
import {
  anchoringCommand,
  checkProject,
  cleanSvg,
  executeCommand,
  planAnchoring,
  prepareDrawingImport,
  readBitmap,
  type AnchorRequest,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  Element,
  PackageFile,
  Relation,
  ScenarioFile,
  ViewFile,
} from '@visual-anything/schema';
import { loadSample } from './sample';

/** One thing the core said, and the fixture that made it say so. */
export interface Said {
  command: string;
  message: string;
}

const VIEW = 'system-overview';
const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1v1z"/></svg>';

/** Runs commands in order on a project, each on what the ones before it left, saying what each said. */
function runInOrder(start: ProjectSnapshot, name: string, commands: readonly unknown[]): Said[] {
  let state = start;
  let made = 0;
  const said: Said[] = [];
  for (const command of commands) {
    const outcome = executeCommand(state, command as Command, {
      newId: (base) => `${base}-${(made += 1)}`,
    });
    if (outcome.ok) {
      state = outcome.state;
      said.push({ command: name, message: outcome.label });
      for (const warning of outcome.warnings)
        said.push({ command: name, message: warning.message });
    } else {
      for (const each of outcome.problems) said.push({ command: name, message: each.message });
    }
  }
  return said;
}

/** What a project says as it opens: its errors and its warnings. */
function checked(name: string, state: ProjectSnapshot): Said[] {
  const { errors, warnings } = checkProject(state);
  return [...errors, ...warnings].map((each) => ({ command: name, message: each.message }));
}

// Commands each run alone on the sample --------------------------------------------------------------

const traits = (name: string, appearanceTraits: unknown, id = 'patient'): [string, unknown] => [
  name,
  { type: 'update-element', id, changes: { appearanceTraits } },
];
const whole = (name: string, appearance: unknown): [string, unknown] => [
  name,
  { type: 'update-element', id: 'patient', changes: { appearance } },
];
const relationTraits = (name: string, changes: unknown): [string, unknown] => [
  name,
  { type: 'update-relation', id: 'agent-to-api', changes },
];
const attributes = (name: string, changes: unknown): [string, unknown] => [
  name,
  { type: 'update-component', id: 'clinic.calendar', changes: { attributes: changes } },
];
const component = (name: string, given: object, createOnly?: true): [string, unknown] => [
  name,
  {
    type: 'define-component',
    package: 'clinic',
    component: { name: 'Ward', derivesFrom: 'systems.box', ...given },
    ...(createOnly ? { createOnly } : {}),
  },
];
const relationType = (name: string, given: object, createOnly?: true): [string, unknown] => [
  name,
  {
    type: 'define-relation-type',
    package: 'clinic',
    relationType: { name: 'pays', derivesFrom: 'relates-to', ...given },
    ...(createOnly ? { createOnly } : {}),
  },
];
const limits = (name: string, changes: unknown): [string, unknown] => [
  name,
  { type: 'update-relation-type', id: 'clinic.reminds', changes: { limits: changes } },
];
const image = (name: string, given: object, createOnly?: true): [string, unknown] => [
  name,
  {
    type: 'define-image',
    package: 'clinic',
    image: { name: 'Bell', svg: SQUARE, ...given },
    ...(createOnly ? { createOnly } : {}),
  },
];
const scope = (name: string, given: unknown): [string, unknown] => [
  name,
  { type: 'set-scope', view: VIEW, scope: given },
];
const route = (name: string, given: object, relation = 'api-writes-db'): [string, unknown] => [
  name,
  { type: 'set-route', view: VIEW, relation, ...given },
];
const restack = (name: string, moves: unknown): [string, unknown] => [
  name,
  { type: 'restack', view: VIEW, moves },
];
const container = (name: string, given: object): [string, unknown] => [
  name,
  { type: 'change-container', view: VIEW, ...given },
];
const points = (count: number, at = 0.5) =>
  Array.from({ length: count }, (_, n) => ({ name: `p${n}`, side: 'top', at }));
const badge = (given: object) => ({ detail: { badges: [given] } });

const createRelation = (relationType: string, from: string, to: string, more: object = {}) => ({
  type: 'create-relation',
  relation: { relationType, from, to, ...more },
});
const defineType = (id: string, more: object = {}) => ({
  type: 'define-relation-type',
  package: 'clinic',
  relationType: { id, name: id.slice('clinic.'.length), derivesFrom: 'relates-to', ...more },
});
const nests = (id: string, value: boolean) => ({
  type: 'update-relation-type',
  id,
  changes: { nests: value },
});
const many = <T>(count: number, make: (n: number) => T): T[] =>
  Array.from({ length: count }, (_, n) => make(n));
const calendars = (count: number) =>
  many(count, (n) => ({
    type: 'create-element',
    element: { component: 'clinic.calendar', name: `Slots ${n}`, attributes: { timezone: 'Mars' } },
  }));
const choices = {
  type: 'update-component',
  id: 'clinic.calendar',
  changes: {
    attributes: { set: [{ name: 'timezone', type: 'string', choices: ['UTC'], default: 'UTC' }] },
  },
};
const reminders = (count: number) =>
  many(count, () => createRelation('clinic.reminds', 'appointments-api', 'patient'));
const toDatabases = {
  type: 'update-relation-type',
  id: 'clinic.reminds',
  changes: { limits: { to: ['systems.database'] } },
};
const wardsView = (id: string, name: string) => ({
  type: 'create-view',
  view: { id, name, perspective: { name: 'Wards' }, nestingRelationTypes: ['clinic.holds'] },
});
const bell = {
  type: 'define-image',
  package: 'clinic',
  image: { id: 'clinic.bell', name: 'Bell', svg: SQUARE },
};

const ALONE: readonly [string, unknown][] = [
  // An element's appearance, trait by trait and whole (ADR-0034).
  traits('unknown shape', { shape: 'star' }),
  traits('detail attributes not a list', { detail: { attributes: 'owner' } }),
  traits('detail writing too many', {
    detail: { attributes: Array.from({ length: 9 }, (_, n) => `a${n}`) },
  }),
  traits('detail naming by number', { detail: { attributes: [1] } }),
  traits('detail writing twice', { detail: { attributes: ['role', 'role'] } }),
  traits('badge not an object', { detail: { badges: [1] } }),
  traits('badge too long', badge({ when: 'attribute', text: 'LONGER', attribute: 'role' })),
  traits('badge with more', badge({ when: 'attribute', text: 'PK', attribute: 'a', glow: 1 })),
  traits('badge without its attribute', badge({ when: 'attribute', text: 'PK' })),
  traits(
    'end badge with more',
    badge({ when: 'from-end', text: 'FK', relationType: 'systems.reads-from', glow: 1 }),
  ),
  traits('end badge without its type', badge({ when: 'from-end', text: 'FK', relationType: 5 })),
  traits('badge never written', badge({ when: 'never', text: 'PK' })),
  traits('too many badges', {
    detail: {
      badges: Array.from({ length: 9 }, () => ({ when: 'attribute', text: 'B', attribute: 'a' })),
    },
  }),
  traits('detail changes with more', { detail: { glow: true } }),
  whole('detail not an object', { detail: 'name' }),
  whole('detail with more', { detail: { glow: true } }),
  whole('appearance not an object', 'blue'),
  traits('too many connection points', { connectionPoints: points(33) }),
  traits('connection point not an object', { connectionPoints: [1] }),
  traits('connection point with more', {
    connectionPoints: [{ name: 'a', side: 'top', at: 0.5, glow: 1 }],
  }),
  traits('connection point unnamed', { connectionPoints: [{ name: '', side: 'top', at: 0.5 }] }),
  traits('connection points named alike', {
    connectionPoints: [
      { name: 'a', side: 'top', at: 0.5 },
      { name: 'a', side: 'left', at: 0.5 },
    ],
  }),
  traits('connection point on no side', {
    connectionPoints: [{ name: 'a', side: 'middle', at: 0.5 }],
  }),
  traits('connection point past its side', { connectionPoints: points(1, 2) }),
  traits('image not a reference', { image: 5 }),
  traits('image with more', { image: { image: 'clinic.logo', glow: 1 } }),
  traits('image unnamed', { image: { image: 5 } }),
  traits('image placed elsewhere', { image: { image: 'clinic.logo', placement: 'back' } }),
  traits('image no package defines', { image: { image: 'clinic.nope' } }),
  traits('detail of no attribute', { detail: { attributes: ['nope'] } }),
  traits('badge of no attribute', badge({ when: 'attribute', text: 'PK', attribute: 'nope' })),
  traits(
    'badge of a text attribute',
    badge({ when: 'attribute', text: 'PK', attribute: 'engine' }),
    'appointments-db',
  ),
  traits(
    'badge of no relation type',
    badge({ when: 'from-end', text: 'FK', relationType: 'gone.type' }),
  ),
  // A relation's own appearance (ADR-0035).
  relationTraits('relation drawn no width', { appearanceTraits: { width: 0 } }),
  relationTraits('relation appearance not an object', { appearance: 'blue' }),
  relationTraits('relation appearance with more', { appearance: { glow: 1 } }),
  relationTraits('relation traits not an object', { appearanceTraits: 'blue' }),
  relationTraits('relation traits with more', { appearanceTraits: { glow: 1 } }),
  relationTraits('both relation appearances', { appearance: {}, appearanceTraits: { width: 2 } }),
  ['appearance given neither way', { type: 'set-component-appearance', component: 'systems.box' }],
  [
    'appearance given both ways',
    {
      type: 'set-relation-type-appearance',
      relationType: 'systems.reads-from',
      appearance: {},
      appearanceTraits: {},
    },
  ],
  // Attribute definitions.
  attributes('attribute not an object', { set: [1] }),
  attributes('attribute with more', { set: [{ name: 'a', type: 'string', glow: 1 }] }),
  attributes('attribute unnamed', { set: [{ name: '', type: 'string' }] }),
  attributes('attribute of no type', { set: [{ name: 'a', type: 'date' }] }),
  attributes('destination default', { set: [{ name: 'a', type: 'destination', default: 5 }] }),
  attributes('number default', { set: [{ name: 'a', type: 'number', default: 'x' }] }),
  attributes('description not text', { set: [{ name: 'a', type: 'string', description: 5 }] }),
  attributes('choices of a number', { set: [{ name: 'a', type: 'number', choices: ['x'] }] }),
  attributes('no choices', { set: [{ name: 'a', type: 'string', choices: [] }] }),
  attributes('default outside its choices', {
    set: [{ name: 'a', type: 'string', choices: ['x'], default: 'y' }],
  }),
  attributes('unit of a text', { set: [{ name: 'a', type: 'string', unit: 'ms' }] }),
  attributes('unit too long', { set: [{ name: 'a', type: 'number', unit: 'x'.repeat(17) }] }),
  attributes('attribute changes not an object', 'all'),
  attributes('attribute changes with more', { glow: 1 }),
  attributes('rename one not its own', { rename: [{ from: 'nope', to: 'b' }] }),
  attributes('rename to nothing', { rename: [{ from: 'timezone', to: ' ' }] }),
  attributes('rename to a name taken', { rename: [{ from: 'timezone', to: 'engine' }] }),
  attributes('rename to a value held', { rename: [{ from: 'timezone', to: 'sizeGb' }] }),
  attributes('remove one not its own', { remove: ['nope'] }),
  attributes('order one not its own', { order: ['nope'] }),
  attributes('order twice', { order: ['timezone', 'timezone'] }),
  component('attributes not a list', { attributes: 'x' }),
  component('attribute defined twice', {
    attributes: [
      { name: 'a', type: 'string' },
      { name: 'a', type: 'string' },
    ],
  }),
  // Limits of a relation type.
  limits('limit not a list', { to: 'person' }),
  limits('limit naming nothing', { to: [] }),
  limits('limit with a bad id', { to: ['Bad Id'] }),
  limits('limit naming twice', { to: ['systems.person', 'systems.person'] }),
  limits('limit naming no definition', { to: ['gone.thing'] }),
  limits('limit changes not an object', 'any'),
  limits('limit changes with more', { middle: 'any' }),
  relationType('limits not an object', { limits: 'any' }),
  relationType('limits with more', { limits: { middle: 'any' } }),
  // Packages and definitions.
  ['package with a bad id', { type: 'create-package', package: { id: 'Bad Id', name: 'X' } }],
  ['package of a built-in id', { type: 'create-package', package: { id: 'systems', name: 'X' } }],
  ['package of a kept id', { type: 'create-package', package: { id: 'neuroscience', name: 'X' } }],
  [
    'package described',
    { type: 'update-package', id: 'clinic', changes: { description: 'Ours.' } },
  ],
  component(
    'component again, to create',
    { id: 'clinic.calendar', name: 'Calendar', derivesFrom: 'systems.database' },
    true,
  ),
  component('component redefined', {
    id: 'clinic.calendar',
    name: 'Calendar',
    derivesFrom: 'systems.database',
  }),
  relationType('relation type again, to create', { id: 'clinic.reminds', name: 'reminds' }, true),
  relationType('relation type redefined', {
    id: 'clinic.reminds',
    name: 'reminds',
    derivesFrom: 'systems.communicates-with',
  }),
  [
    'component described',
    { type: 'update-component', id: 'clinic.calendar', changes: { description: 'Slots.' } },
  ],
  [
    'component description not text',
    { type: 'update-component', id: 'clinic.calendar', changes: { description: 5 } },
  ],
  [
    'relation type renamed',
    { type: 'update-relation-type', id: 'clinic.reminds', changes: { name: 'nudges' } },
  ],
  [
    'relation type described',
    { type: 'update-relation-type', id: 'clinic.reminds', changes: { description: 'Nudges.' } },
  ],
  [
    'relation type of no direction',
    { type: 'update-relation-type', id: 'clinic.reminds', changes: { direction: 'sideways' } },
  ],
  relationType('nesting not a flag', { nests: 'yes' }),
  relationType('relation type unnamed', { name: ' ' }),
  [
    'relation type renamed to nothing',
    { type: 'update-relation-type', id: 'clinic.reminds', changes: { name: '' } },
  ],
  component('component with a bad id', { id: 'Bad Id' }),
  component('component outside its package', { id: 'other.ward' }),
  component('component deriving from no id', { derivesFrom: 5 }),
  component('component deriving from itself', { id: 'clinic.ward', derivesFrom: 'clinic.ward' }),
  component('component deriving from nothing known', { derivesFrom: 'gone.base' }),
  // Images.
  image('image both ways', { format: 'png', data: 'AAAA' }),
  image('image with a bad id', { id: 'Bad Id' }),
  image('image outside its package', { id: 'other.bell' }),
  image('image taking an id', { id: 'clinic.calendar' }),
  image('image name too long', { name: 'x'.repeat(201) }),
  image('image source too long', { source: 'x'.repeat(501) }),
  image('image not text', { svg: 5 }),
  image('image the cleaner refuses', { svg: '<svg' }),
  [
    'bitmap of no format',
    { type: 'define-image', package: 'clinic', image: { name: 'B', format: 'gif', data: 'AAAA' } },
  ],
  [
    'bitmap not text',
    { type: 'define-image', package: 'clinic', image: { name: 'B', format: 'png', data: 5 } },
  ],
  [
    'bitmap far too large',
    {
      type: 'define-image',
      package: 'clinic',
      image: { name: 'B', format: 'png', data: 'A'.repeat(400_000) },
    },
  ],
  [
    'bitmap not base64',
    { type: 'define-image', package: 'clinic', image: { name: 'B', format: 'png', data: '***' } },
  ],
  ['remove no image', { type: 'remove-image', id: 'clinic.nope' }],
  [
    'component showing a malformed image',
    {
      type: 'define-component',
      package: 'clinic',
      component: {
        name: 'Ward',
        derivesFrom: 'systems.box',
        appearance: { image: { image: 'Bad Id' } },
      },
    },
  ],
  // Containers.
  container('no shapes', { to: 'scheduling', shapes: [] }),
  container('through a type that does not nest', {
    to: 'scheduling',
    relationType: 'systems.reads-from',
    shapes: [{ element: 'patient' }],
  }),
  container('World as a shape', { to: 'scheduling', shapes: [{ element: 'world' }] }),
  container('given twice from World', {
    to: 'scheduling',
    shapes: [{ element: 'patient' }, { element: 'patient' }],
  }),
  container('given twice from a container', {
    shapes: [
      { element: 'appointments-api', from: 'scheduling' },
      { element: 'appointments-api', from: 'scheduling' },
    ],
  }),
  container('placed twice', {
    to: 'scheduling',
    shapes: [
      { element: 'patient', at: { x: 0, y: 0 } },
      { element: 'patient', from: 'scheduling', at: { x: 0, y: 0 } },
    ],
  }),
  container('inside itself, alone', {
    to: 'scheduling',
    shapes: [{ element: 'scheduling', from: 'clinic-booking' }],
  }),
  container('pinned not a flag', {
    to: 'scheduling',
    shapes: [{ element: 'patient', pinned: 'yes' }],
  }),
  container('inside what it holds', {
    to: 'appointments-api',
    shapes: [{ element: 'scheduling', from: 'clinic-booking' }],
  }),
  container('take one out', { shapes: [{ element: 'whatsapp', from: 'clinic-booking' }] }),
  container('move one across', {
    to: 'scheduling',
    shapes: [{ element: 'whatsapp', from: 'clinic-booking' }],
  }),
  container('move two across', {
    to: 'scheduling',
    shapes: [
      { element: 'whatsapp', from: 'clinic-booking' },
      { element: 'booking-agent', from: 'clinic-booking' },
    ],
  }),
  container('put two inside', {
    to: 'scheduling',
    shapes: [{ element: 'patient' }, { element: 'whatsapp', from: 'clinic-booking' }],
  }),
  container('take two out of one', {
    shapes: [
      { element: 'appointments-api', from: 'scheduling' },
      { element: 'reminder-service', from: 'scheduling' },
    ],
  }),
  container('take two out of theirs', {
    shapes: [
      { element: 'whatsapp', from: 'clinic-booking' },
      { element: 'appointments-api', from: 'scheduling' },
    ],
  }),
  // Positions and free shapes.
  ['no positions', { type: 'set-positions', view: VIEW, positions: [] }],
  [
    'World placed',
    { type: 'set-positions', view: VIEW, positions: [{ element: 'world', x: 0, y: 0 }] },
  ],
  [
    'placed where it does not sit',
    {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'patient', container: 'scheduling', x: 0, y: 0 }],
    },
  ],
  [
    'position given twice',
    {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'patient', x: 0, y: 0 },
        { element: 'patient', x: 1, y: 1 },
      ],
    },
  ],
  ['no positions to forget', { type: 'remove-positions', view: VIEW, positions: [] }],
  [
    'forget a position not kept',
    {
      type: 'remove-positions',
      view: VIEW,
      positions: [{ element: 'appointments-db', container: 'clinic-booking' }],
    },
  ],
  [
    'edit no free shape',
    {
      type: 'update-free-shape',
      view: VIEW,
      shape: { kind: 'note', id: 'nope', x: 0, y: 0, width: 10, height: 10, text: 'x' },
    },
  ],
  ['delete no free shapes', { type: 'delete-free-shapes', view: VIEW, ids: [] }],
  ['delete an unknown free shape', { type: 'delete-free-shapes', view: VIEW, ids: ['nope'] }],
  [
    'note without text',
    {
      type: 'create-free-shape',
      view: VIEW,
      shape: { kind: 'note', x: 0, y: 0, width: 9, height: 9 },
    },
  ],
  [
    'view arranged by a type that does not nest',
    {
      type: 'create-view',
      view: {
        name: 'Data',
        perspective: { name: 'Data' },
        nestingRelationTypes: ['systems.reads-from'],
      },
    },
  ],
  [
    'view arranged twice by one type',
    {
      type: 'create-view',
      view: {
        name: 'Data',
        perspective: { name: 'Data' },
        nestingRelationTypes: ['systems.is-part-of', 'systems.is-part-of'],
      },
    },
  ],
  // The stacking order.
  restack('no moves', []),
  restack('World moved', [{ shape: { element: 'world' }, to: 'front' }]),
  restack('moved twice', [
    { shape: { element: 'patient' }, to: 'front' },
    { shape: { element: 'patient' }, to: 'back' },
  ]),
  restack('in front of itself', [{ shape: { element: 'patient' }, to: { inFrontOf: 'patient' } }]),
  restack('moved nowhere', [{ shape: { element: 'patient' }, to: 'up' }]),
  restack('moved where it does not sit', [
    { shape: { element: 'patient', container: 'scheduling' }, to: 'front' },
  ]),
  restack('one to the front', [{ shape: { element: 'patient' }, to: 'front' }]),
  restack('one to the back', [{ shape: { element: 'patient' }, to: 'back' }]),
  restack('one in front of another', [
    { shape: { element: 'patient' }, to: { inFrontOf: 'clinic-booking' } },
  ]),
  restack('one behind another', [
    { shape: { element: 'patient' }, to: { behind: 'clinic-booking' } },
  ]),
  restack('two to the front', [
    { shape: { element: 'patient' }, to: 'front' },
    { shape: { element: 'clinic-booking' }, to: 'front' },
  ]),
  restack('two to the back', [
    { shape: { element: 'patient' }, to: 'back' },
    { shape: { element: 'clinic-booking' }, to: 'back' },
  ]),
  restack('two forward', [
    {
      shape: { element: 'appointments-api', container: 'scheduling' },
      to: { inFrontOf: 'reminder-service' },
    },
    { shape: { element: 'patient' }, to: { inFrontOf: 'clinic-booking' } },
  ]),
  restack('two backward', [
    {
      shape: { element: 'appointments-api', container: 'scheduling' },
      to: { behind: 'reminder-service' },
    },
    { shape: { element: 'patient' }, to: { behind: 'clinic-booking' } },
  ]),
  restack('two in two ways', [
    { shape: { element: 'patient' }, to: 'front' },
    { shape: { element: 'clinic-booking' }, to: 'back' },
  ]),
  // What a view shows (ADR 0040).
  ['add nothing to a view', { type: 'add-to-view', view: VIEW, elements: [] }],
  scope('scope not an object', 'all'),
  scope('scope with more', { glow: 1 }),
  scope('scope rules not a list', { include: 'all' }),
  scope('too many scope rules', {
    include: Array.from({ length: 65 }, () => ({
      kind: 'component',
      component: 'systems.service',
    })),
  }),
  scope('scope rule not an object', { include: [1] }),
  scope('exactly not a flag', {
    include: [{ kind: 'component', component: 'systems.service', exactly: 'yes' }],
  }),
  scope('rule reaching nowhere', {
    include: [{ kind: 'contents', container: 'scheduling', depth: 0 }],
  }),
  scope('attribute rule unnamed', { include: [{ kind: 'attribute', attribute: '', test: 'set' }] }),
  scope('attribute rule of no test', {
    include: [{ kind: 'attribute', attribute: 'owner', test: 'like' }],
  }),
  scope('attribute rule without its value', {
    include: [{ kind: 'attribute', attribute: 'owner', test: 'equals' }],
  }),
  scope('scope added not a list', { added: 'patient' }),
  scope('scope adding a bad id', { added: ['Bad Id'] }),
  // Routes drawn by hand (ADR 0039).
  route('route of a relation drawn as containment', { style: 'curved' }, 'api-in-scheduling'),
  route('container without bend points', { container: 'scheduling', bendPoints: [] }),
  route('container alone', { container: 'scheduling' }),
  route('too many bend points', {
    bendPoints: Array.from({ length: 65 }, (_, n) => ({ x: n, y: n })),
  }),
  route('bend point down past the canvas', { bendPoints: [{ x: 0, y: 1e9 }] }),
  route(
    'bend points relative to the wrong container',
    {
      bendPoints: [{ x: 1, y: 1 }],
      container: 'clinic-booking',
    },
    'patient-to-whatsapp',
  ),
  route('connection point unnamed', { from: { kind: 'connection-point', name: '' } }),
  route('connection point no shape has', { from: { kind: 'connection-point', name: 'north' } }),
  route('inside past the shape', { to: { kind: 'inside', x: 1.5, y: 0.5 } }),
  ['route a relation not given by its id', { type: 'reset-route', view: VIEW, relations: [5] }],
  // The model's order, its ends and what a project uses.
  ['collapse nothing', { type: 'set-collapsed', view: VIEW, elements: [], collapsed: true }],
  ['reorder nothing', { type: 'reorder-elements', elements: [] }],
  ['reorder World, alone', { type: 'reorder-elements', elements: ['world'] }],
  [
    'reorder before one moved',
    { type: 'reorder-elements', elements: ['patient', 'whatsapp'], before: 'patient' },
  ],
  [
    'create before World',
    { type: 'create-element', element: { component: 'systems.box', name: 'X' }, before: 'world' },
  ],
  ['relate to nothing', createRelation('systems.communicates-with', 'patient', 'nobody')],
  ['nest inside a relation', createRelation('systems.is-part-of', 'patient', 'agent-to-api')],
  ['edit no scenario', { type: 'update-scenario', id: 'nope', changes: { name: 'X' } }],
  ['edit no package', { type: 'update-package', id: 'nope', changes: { name: 'X' } }],
  [
    'size not positive',
    {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'patient', x: 0, y: 0, width: -1 }],
    },
  ],
  [
    'size past the canvas',
    {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'patient', x: 0, y: 0, width: 1e9 }],
    },
  ],
  [
    'list a package twice',
    { type: 'update-project', changes: { packages: ['systems', 'systems', 'clinic'] } },
  ],
  [
    'use no package there is',
    { type: 'update-project', changes: { packages: ['systems', 'clinic', 'nope'] } },
  ],
  [
    'use one more package',
    { type: 'update-project', changes: { packages: ['systems', 'clinic', 'c4'] } },
  ],
  ...(['twice', 'unknown', 'undescribed', 'not a list'] as const).map((how): [string, unknown] => [
    `step ${how}`,
    {
      type: 'update-scenario',
      id: 'patient-books-appointment',
      changes: {
        steps: [
          how === 'twice'
            ? { relations: ['patient-to-whatsapp', 'patient-to-whatsapp'], description: 'Asks.' }
            : how === 'unknown'
              ? { relations: ['gone'], description: 'Asks.' }
              : how === 'undescribed'
                ? { relations: ['patient-to-whatsapp'] }
                : { relations: 'patient-to-whatsapp', description: 'Asks.' },
        ],
      },
    },
  ]),
  scope('attribute rule comparing nothing', {
    include: [{ kind: 'attribute', attribute: 'owner', test: 'is' }],
  }),
  [
    'bitmap past what is read',
    {
      type: 'define-image',
      package: 'clinic',
      image: { name: 'B', format: 'png', data: 'A'.repeat(4_200_000) },
    },
  ],
];

// Short runs of commands, in order --------------------------------------------------------------------

const IN_ORDER: readonly [string, readonly unknown[]][] = [
  [
    'remove an unused component',
    [
      {
        type: 'define-component',
        package: 'clinic',
        component: { id: 'clinic.ward', name: 'Ward', derivesFrom: 'systems.box' },
      },
      { type: 'remove-component', id: 'clinic.ward' },
    ],
  ],
  [
    'remove a relation type in use',
    [
      createRelation('clinic.reminds', 'appointments-api', 'patient'),
      { type: 'remove-relation-type', id: 'clinic.reminds' },
    ],
  ],
  [
    'stop nesting while a view nests by it',
    [
      defineType('clinic.holds', { nests: true }),
      wardsView('wards', 'Wards'),
      nests('clinic.holds', false),
      wardsView('beds', 'Beds'),
      nests('clinic.holds', false),
    ],
  ],
  ['one more relation breaks limits', [...reminders(21), toDatabases]],
  ['more relations break limits', [...reminders(22), toDatabases]],
  ['one more value outside its choices', [...calendars(21), choices]],
  ['more values outside their choices', [...calendars(22), choices]],
  [
    'nest a relation that ends on a relation',
    [
      defineType('clinic.governs'),
      createRelation('clinic.governs', 'appointments-api', 'agent-to-api'),
      nests('clinic.governs', true),
    ],
  ],
  [
    'nest World inside something',
    [
      defineType('clinic.governs'),
      createRelation('clinic.governs', 'world', 'scheduling'),
      nests('clinic.governs', true),
    ],
  ],
  [
    'nest in a cycle',
    [
      defineType('clinic.governs'),
      createRelation('clinic.governs', 'scheduling', 'appointments-api'),
      nests('clinic.governs', true),
    ],
  ],
  [
    'rename to what a derived component defines',
    [
      {
        type: 'define-component',
        package: 'clinic',
        component: {
          id: 'clinic.agenda',
          name: 'Agenda',
          derivesFrom: 'clinic.calendar',
          attributes: [{ name: 'zone', type: 'string' }],
        },
      },
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { attributes: { rename: [{ from: 'timezone', to: 'zone' }] } },
      },
    ],
  ],
  [
    'rename to what a derived relation type defines',
    [
      {
        type: 'update-relation-type',
        id: 'clinic.reminds',
        changes: { attributes: { set: [{ name: 'how', type: 'string' }] } },
      },
      defineType('clinic.urgent', {
        derivesFrom: 'clinic.reminds',
        attributes: [{ name: 'level', type: 'string' }],
      }),
      {
        type: 'update-relation-type',
        id: 'clinic.reminds',
        changes: { attributes: { rename: [{ from: 'how', to: 'level' }] } },
      },
    ],
  ],
  [
    'rename to a value a relation holds',
    [
      {
        type: 'update-relation-type',
        id: 'clinic.reminds',
        changes: { attributes: { set: [{ name: 'how', type: 'string' }] } },
      },
      createRelation('clinic.reminds', 'appointments-api', 'patient', {
        attributes: { note: 'x' },
      }),
      {
        type: 'update-relation-type',
        id: 'clinic.reminds',
        changes: { attributes: { rename: [{ from: 'how', to: 'note' }] } },
      },
    ],
  ],
  [
    'remove an attribute a detail writes',
    [
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { detail: { attributes: ['timezone'] } } },
      },
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { attributes: { remove: ['timezone'] } },
      },
    ],
  ],
  [
    'images added, replaced and removed',
    [
      bell,
      { ...bell, createOnly: true },
      bell,
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { image: { image: 'clinic.bell' } } },
      },
      { type: 'remove-image', id: 'clinic.bell' },
      { type: 'update-component', id: 'clinic.calendar', changes: { appearance: { image: null } } },
      { type: 'remove-image', id: 'clinic.bell' },
    ],
  ],
  [
    'a view of nothing that nests',
    [
      {
        type: 'create-view',
        view: { id: 'flat', name: 'Flat', perspective: { name: 'Flat' }, nestingRelationTypes: [] },
      },
      {
        type: 'change-container',
        view: 'flat',
        to: 'scheduling',
        shapes: [{ element: 'patient' }],
      },
      { type: 'delete-view', id: 'flat' },
    ],
  ],
  [
    'a view that does not show what nests',
    [
      defineType('clinic.holds', { nests: true }),
      {
        type: 'change-container',
        view: VIEW,
        relationType: 'clinic.holds',
        to: 'scheduling',
        shapes: [{ element: 'patient' }],
      },
      wardsView('wards', 'Wards'),
      {
        type: 'change-container',
        view: 'wards',
        to: 'appointments-api',
        shapes: [{ element: 'scheduling' }],
      },
    ],
  ],
  ...([undefined, 'booking-agent'] as const).map((to): [string, readonly unknown[]] => [
    `an element in two containers, ${to === undefined ? 'taken out' : 'moved'}`,
    [
      createRelation('systems.is-part-of', 'whatsapp', 'scheduling'),
      {
        type: 'change-container',
        view: VIEW,
        ...(to === undefined ? {} : { to }),
        shapes: [
          { element: 'whatsapp', from: 'clinic-booking' },
          { element: 'whatsapp', from: 'scheduling' },
        ],
      },
    ],
  ]),
  [
    'overlays set and removed',
    [
      {
        type: 'set-overlays',
        view: VIEW,
        overlays: [
          {
            id: 'tier',
            name: 'Tier',
            of: 'elements',
            attribute: 'tier',
            channel: 'fill',
            mapping: { kind: 'discrete', cases: [{ value: 'gold', color: '#FFFF00' }] },
          },
        ],
      },
      { type: 'set-overlays', view: VIEW, overlays: [] },
    ],
  ],
  [
    'a shape the view leaves out',
    [
      { type: 'leave-out-of-view', view: VIEW, elements: ['patient'] },
      {
        type: 'set-route',
        view: VIEW,
        relation: 'patient-to-whatsapp',
        from: { kind: 'border', side: 'top', at: 0.5 },
      },
    ],
  ],
  [
    'rows of a table',
    [
      { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
      {
        type: 'create-view',
        view: {
          id: 'tables',
          name: 'Tables',
          perspective: { name: 'Data' },
          nestingRelationTypes: ['data-modeling.is-column-of'],
        },
      },
      {
        type: 'create-element',
        element: { id: 'users', component: 'data-modeling.table', name: 'Users' },
      },
      {
        type: 'create-element',
        element: { id: 'email', component: 'data-modeling.column', name: 'email' },
        containers: [{ container: 'users', relationType: 'data-modeling.is-column-of' }],
      },
      {
        type: 'create-element',
        element: { id: 'inner', component: 'systems.box', name: 'Inner' },
        containers: [{ container: 'email', relationType: 'data-modeling.is-column-of' }],
      },
      {
        type: 'set-positions',
        view: 'tables',
        positions: [{ element: 'email', container: 'users', x: 0, y: 0 }],
      },
      createRelation('systems.reads-from', 'appointments-api', 'email', { id: 'reads-email' }),
      { type: 'add-to-view', view: 'tables', elements: ['appointments-api'] },
      {
        type: 'set-route',
        view: 'tables',
        relation: 'reads-email',
        to: { kind: 'border', side: 'top', at: 0.5 },
      },
      createRelation('systems.reads-from', 'appointments-api', 'inner', { id: 'reads-inner' }),
      {
        type: 'set-route',
        view: 'tables',
        relation: 'reads-inner',
        to: { kind: 'border', side: 'left', at: 0.5 },
      },
    ],
  ],
  [
    'edit a note and an arrow',
    [
      {
        type: 'create-free-shape',
        view: VIEW,
        shape: { kind: 'arrow', id: 'pointer', from: { x: 0, y: 0 }, to: { x: 9, y: 9 } },
      },
      {
        type: 'update-free-shape',
        view: VIEW,
        shape: { kind: 'arrow', id: 'pointer', from: { x: 0, y: 0 }, to: { x: 20, y: 9 } },
      },
      {
        type: 'update-free-shape',
        view: VIEW,
        shape: {
          kind: 'note',
          id: 'calendar-note',
          x: 0,
          y: 0,
          width: 464,
          height: 72,
          text: 'Moved.',
        },
      },
    ],
  ],
  [
    'attach to World',
    [
      createRelation('systems.communicates-with', 'world', 'patient', { id: 'from-world' }),
      {
        type: 'set-route',
        view: VIEW,
        relation: 'from-world',
        from: { kind: 'border', side: 'top', at: 0.5 },
      },
    ],
  ],
];

/** A package of another project, with an image, and with a component that shows one. */
const MALL: PackageFile = {
  id: 'mall',
  name: 'Mall',
  components: [],
  relationTypes: [],
  images: [{ kind: 'svg', id: 'mall.logo', name: 'Logo', width: 10, height: 10, svg: SQUARE }],
};
const mallShowing = (image: unknown): PackageFile => ({
  ...MALL,
  components: [
    { id: 'mall.kiosk', name: 'Kiosk', derivesFrom: 'systems.box', appearance: { image } as never },
  ],
});

/** Runs of commands on projects whose files hold what commands never make. */
function inOrderOn(sample: ProjectSnapshot): [string, ProjectSnapshot, readonly unknown[]][] {
  const tiny = (n: number) => ({
    kind: 'svg' as const,
    id: `clinic.i${n}`,
    name: `I${n}`,
    width: 10,
    height: 10,
    svg: SQUARE,
  });
  const withClinicImages = (images: PackageFile['images']): ProjectSnapshot => ({
    ...sample,
    packages: sample.packages.map((file) => (file.id === 'clinic' ? { ...file, images } : file)),
  });
  return [
    [
      'ids another package defines',
      withPackage(sample, {
        id: 'other',
        name: 'Other',
        components: [{ id: 'clinic.ward', name: 'Ward', derivesFrom: 'systems.box' }],
        relationTypes: [],
        images: [{ ...tiny(0), id: 'clinic.bell' }],
      }),
      [
        {
          type: 'define-component',
          package: 'clinic',
          component: { id: 'clinic.ward', name: 'Ward', derivesFrom: 'systems.box' },
        },
        {
          type: 'define-image',
          package: 'clinic',
          image: { id: 'clinic.bell', name: 'Bell', svg: SQUARE },
        },
      ],
    ],
    [
      'a package full of images',
      withClinicImages(many(128, tiny)),
      [{ type: 'define-image', package: 'clinic', image: { name: 'One more', svg: SQUARE } }],
    ],
    [
      'a package heavy with images',
      withClinicImages(many(5, (n) => ({ ...tiny(n), svg: `${SQUARE}${' '.repeat(450_000)}` }))),
      [{ type: 'define-image', package: 'clinic', image: { name: 'One more', svg: SQUARE } }],
    ],
    [
      'a shared package and its images',
      sample,
      [
        { type: 'add-package', package: MALL },
        {
          type: 'update-element',
          id: 'patient',
          changes: { appearanceTraits: { image: { image: 'mall.logo' } } },
        },
        { type: 'replace-package', package: { ...MALL, images: [] } },
      ],
    ],
    [
      'a shared package showing a malformed image',
      sample,
      [{ type: 'add-package', package: mallShowing({ image: 'Bad Id' }) }],
    ],
    [
      'a shared package showing an image no package defines',
      sample,
      [{ type: 'add-package', package: mallShowing({ image: 'gone.logo' }) }],
    ],
  ];
}

// Projects broken as files can be, as they open ---------------------------------------------------

function withModel(
  sample: ProjectSnapshot,
  elements: Element[],
  relations: Relation[],
): ProjectSnapshot {
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: [...sample.model.elements, ...elements],
      relations: [...sample.model.relations, ...relations],
    },
  };
}

function withView(sample: ProjectSnapshot, changes: Partial<ViewFile>): ProjectSnapshot {
  const [view, ...rest] = sample.views as [ViewFile, ...ViewFile[]];
  return { ...sample, views: [{ ...view, ...changes }, ...rest] };
}

function withPackage(sample: ProjectSnapshot, file: PackageFile): ProjectSnapshot {
  return {
    ...sample,
    project: { ...sample.project, packages: [...sample.project.packages, file.id] },
    packages: [...sample.packages, file],
  };
}

function broken(sample: ProjectSnapshot): [string, ProjectSnapshot][] {
  const is = 'systems.is-part-of';
  return [
    ['a newer format', { ...sample, project: { ...sample.project, schemaVersion: 99 as never } }],
    [
      'a model that breaks its rules',
      withModel(
        sample,
        [
          { id: 'stray', component: 'gone.component', name: 'Stray' },
          {
            id: 'shelf',
            component: 'systems.person',
            name: 'Shelf',
            appearance: {
              shape: 'ellipse',
              contentsAsRows: true,
              connectionPoints: [
                { name: 'a', side: 'top', at: 0.5 },
                { name: 'a', side: 'left', at: 0.5 },
              ],
            },
          },
        ],
        [
          { id: 'odd', relationType: 'gone.type', from: 'patient', to: 'whatsapp' },
          { id: 'loop', relationType: 'systems.communicates-with', from: 'loop', to: 'patient' },
          { id: 'lost', relationType: 'systems.communicates-with', from: 'patient', to: 'nowhere' },
          { id: 'nested-relation', relationType: is, from: 'agent-to-api', to: 'scheduling' },
          { id: 'world-inside', relationType: is, from: 'world', to: 'scheduling' },
          { id: 'cycle', relationType: is, from: 'clinic-booking', to: 'appointments-api' },
        ],
      ),
    ],
    [
      'a view that names what is not there',
      withView(sample, {
        nestingRelationTypes: [is, 'gone.nesting', 'systems.reads-from'],
        positions: [{ element: 'nobody', x: 0, y: 0 }],
        collapsed: ['nobody'],
        scope: {
          include: [
            { kind: 'component', component: 'gone.component' },
            { kind: 'relation-type', relationType: 'gone.type' },
            { kind: 'contents', container: 'nobody' },
          ],
          added: ['nobody'],
        },
        stackingOrder: { nobody: ['patient'], world: ['patient', 'patient', 'nobody'] },
        routes: {
          gone: { style: 'curved' },
          'patient-to-whatsapp': {
            from: { kind: 'connection-point', name: 'north' },
            container: 'nobody',
            bendPoints: [{ x: 0, y: 0 }],
          },
        },
      }),
    ],
    [
      'routes attached where there is no shape',
      withView(
        withModel(
          sample,
          [],
          [
            {
              id: 'from-world',
              relationType: 'systems.communicates-with',
              from: 'world',
              to: 'patient',
            },
            {
              id: 'governs',
              relationType: 'systems.communicates-with',
              from: 'agent-to-api',
              to: 'patient',
            },
          ],
        ),
        {
          routes: {
            'from-world': { from: { kind: 'border', side: 'top', at: 0.5 } },
            governs: {
              from: { kind: 'border', side: 'top', at: 0.5 },
              to: { kind: 'connection-point', name: 'north' },
            },
          },
        },
      ),
    ],
    [
      'images that are refused, need cleaning, weigh much or are missing',
      {
        ...withPackage(sample, {
          id: 'pictures',
          name: 'Pictures',
          components: [
            {
              id: 'pictures.framed',
              name: 'Framed',
              derivesFrom: 'systems.box',
              appearance: { image: { image: 'pictures.gone' } },
            },
          ],
          relationTypes: [],
          images: [
            {
              kind: 'svg',
              id: 'pictures.broken',
              name: 'Broken',
              width: 10,
              height: 10,
              svg: '<svg',
            },
            {
              kind: 'svg',
              id: 'pictures.scripted',
              name: 'Scripted',
              width: 10,
              height: 10,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0h1v1z"/></svg>',
            },
            {
              kind: 'bitmap',
              id: 'pictures.garbled',
              name: 'Garbled',
              format: 'png',
              width: 1,
              height: 1,
              data: '***',
            },
            ...many(3, (n) => ({
              kind: 'svg' as const,
              id: `pictures.heavy-${n}`,
              name: `Heavy ${n}`,
              width: 10,
              height: 10,
              svg: `${SQUARE}${' '.repeat(800_000)}`,
            })),
          ],
        }),
        project: {
          ...sample.project,
          packages: [...sample.project.packages, 'pictures'],
          appearances: { components: { 'systems.service': { image: { image: 'gone.logo' } } } },
        },
      },
    ],
    [
      'a package of images under the cap but heavy',
      withPackage(sample, {
        id: 'sketches',
        name: 'Sketches',
        components: [],
        relationTypes: [],
        images: many(2, (n) => ({
          kind: 'svg' as const,
          id: `sketches.s${n}`,
          name: `S${n}`,
          width: 10,
          height: 10,
          svg: `${SQUARE}${' '.repeat(600_000)}`,
        })),
      }),
    ],
    [
      'an image two packages define',
      withPackage(
        {
          ...sample,
          packages: sample.packages.map((file) =>
            file.id === 'clinic'
              ? {
                  ...file,
                  images: [
                    {
                      kind: 'svg',
                      id: 'gallery.logo',
                      name: 'Logo',
                      width: 10,
                      height: 10,
                      svg: SQUARE,
                    },
                  ],
                }
              : file,
          ),
        },
        {
          id: 'gallery',
          name: 'Gallery',
          components: [],
          relationTypes: [],
          images: [
            { kind: 'svg', id: 'gallery.logo', name: 'Logo', width: 10, height: 10, svg: SQUARE },
          ],
        },
      ),
    ],
    [
      'a package defining what is built in',
      withPackage(sample, {
        id: 'shadows',
        name: 'Shadows',
        components: [{ id: 'essence', name: 'Essence', derivesFrom: 'essence' }],
        relationTypes: [{ id: 'relates-to', name: 'relates to', derivesFrom: 'relates-to' }],
      }),
    ],
    [
      'a scenario over no view',
      { ...sample, scenarios: sample.scenarios.map((each) => ({ ...each, view: 'gone' })) },
    ],
    [
      'ids used twice',
      {
        ...sample,
        views: [...sample.views, ...sample.views],
        scenarios: [...sample.scenarios, ...sample.scenarios],
        packages: [...sample.packages, ...sample.packages],
      },
    ],
    [
      'a package that breaks its rules',
      withPackage(sample, {
        id: 'neuroscience',
        name: 'Neuroscience',
        components: [
          { id: 'systems.service', name: 'Service', derivesFrom: 'essence' },
          { id: 'clinic.calendar', name: 'Calendar', derivesFrom: 'essence' },
          { id: 'elsewhere.neuron', name: 'Neuron', derivesFrom: 'essence' },
          { id: 'neuroscience.orphan', name: 'Orphan', derivesFrom: 'gone.base' },
          { id: 'neuroscience.a', name: 'A', derivesFrom: 'neuroscience.b' },
          { id: 'neuroscience.b', name: 'B', derivesFrom: 'neuroscience.a' },
          {
            id: 'neuroscience.cell',
            name: 'Cell',
            derivesFrom: 'essence',
            attributes: [{ name: 'label', type: 'string' }],
            appearance: {
              detail: {
                attributes: ['missing'],
                badges: [
                  { when: 'from-end', text: 'FK', relationType: 'gone.type' },
                  { when: 'attribute', text: 'PK', attribute: 'missing' },
                  { when: 'attribute', text: 'ID', attribute: 'label' },
                ],
              },
            },
          },
        ],
        relationTypes: [
          {
            id: 'neuroscience.fires',
            name: 'fires',
            derivesFrom: 'relates-to',
            limits: { to: ['gone.thing'] },
          },
        ],
      }),
    ],
    [
      'values outside their choices',
      {
        ...withModel(
          sample,
          many(22, (n) => ({
            id: `slot-${n}`,
            component: 'clinic.calendar',
            name: `Slot ${n}`,
            attributes: { timezone: 'Mars' },
          })),
          [],
        ),
        packages: sample.packages.map((file) =>
          file.id === 'clinic'
            ? {
                ...file,
                components: file.components.map((each) =>
                  each.id === 'clinic.calendar'
                    ? {
                        ...each,
                        attributes: [{ name: 'timezone', type: 'string', choices: ['UTC'] }],
                      }
                    : each,
                ),
              }
            : file,
        ),
      },
    ],
  ];
}

// Pictures past what the cleaner keeps, as the image picker shows its reasons ---------------------------

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const PATH = '<path d="M0 0h1v1z"/>';
const svg = (inside: string, attributes = '') =>
  `<svg ${NS} viewBox="0 0 10 10"${attributes}>${inside}</svg>`;
const times = (count: number, text: string) => text.repeat(count);

/** SVG texts, each past one of the cleaner's caps. */
const PAST_SVG_CAPS: readonly [string, string][] = [
  ['text too large', svg(PATH) + ' '.repeat(600_000)],
  ['cleaned text too large', svg(times(2000, '<path d="M0 0h1v1z" fill="#123456"/>'))],
  ['too many elements', svg(times(20_001, '<g/>'))],
  ['too many namespaces', svg(PATH, many(257, (n) => ` xmlns:a${n}="urn:a${n}"`).join(''))],
  ['nested too deep as text', svg(times(257, '<g>') + PATH + times(257, '</g>'))],
  ['too many style rules', svg(`<style>${times(257, '.a{fill:red}')}</style>${PATH}`)],
  [
    'too many selectors',
    svg(`<style>${many(17, (n) => `.a${n}`).join(',')}{fill:red}</style>${PATH}`),
  ],
  ['too many declarations', svg(`<style>.a{${times(1025, 'fill:red;')}}</style>${PATH}`)],
  ['too many elements to draw', svg(times(4001, PATH))],
  [
    'style rules matching too much',
    svg(`<style>${times(256, 'path{fill:red}')}</style>${times(400, PATH)}`),
  ],
  ['nested too deep to draw', svg(times(25, '<g>') + PATH + times(25, '</g>'))],
  [
    'use within use',
    svg(`<defs><g id="a"><use href="#b"/></g><path id="b" d="M0 0h1v1z"/></defs><use href="#a"/>`),
  ],
  [
    'gradient with too many stops',
    svg(
      `<defs><linearGradient id="g">${times(17, '<stop offset="0"/>')}</linearGradient></defs><path d="M0 0h1v1z" fill="url(#g)"/>`,
    ),
  ],
  [
    'clip within a clip',
    svg(
      `<defs><clipPath id="c"><clipPath id="d">${PATH}</clipPath>${PATH}</clipPath></defs><path d="M0 0h1v1z" clip-path="url(#c)"/>`,
    ),
  ],
  [
    'clip referring to a clip',
    svg(
      `<defs><clipPath id="d">${PATH}</clipPath><clipPath id="c" clip-path="url(#d)">${PATH}</clipPath></defs><path d="M0 0h1v1z" clip-path="url(#c)"/>`,
    ),
  ],
  [
    'too many uses',
    svg(`<defs><path id="p" d="M0 0h1v1z"/></defs>${times(65, '<use href="#p"/>')}`),
  ],
  [
    'too many gradients',
    svg(
      `<defs>${many(33, (n) => `<linearGradient id="g${n}"><stop offset="0"/></linearGradient>`).join('')}</defs>${many(33, (n) => `<path d="M0 0h1v1z" fill="url(#g${n})"/>`).join('')}`,
    ),
  ],
  [
    'too many clips',
    svg(
      `<defs>${many(17, (n) => `<clipPath id="c${n}">${PATH}</clipPath>`).join('')}</defs>${many(17, (n) => `<path d="M0 0h1v1z" clip-path="url(#c${n})"/>`).join('')}`,
    ),
  ],
  ['too many path commands', svg(`<path d="M0 0${times(20_001, 'h1')}"/>`)],
  [
    'too costly to draw',
    svg(`<defs><g id="h">${times(100, PATH)}</g></defs>${times(60, '<use href="#h"/>')}`),
  ],
];

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array([...type].map((each) => each.charCodeAt(0)));
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typed, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

/** A PNG of a size, whose image data is that many bytes; the cleaner reads its chunks only. */
function png(width: number, height: number, data: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', new Uint8Array(data)),
    pngChunk('IEND', new Uint8Array()),
  ];
  const bytes = new Uint8Array(parts.reduce((sum, each) => sum + each.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** A JPEG of one pixel with that many scans. */
function jpeg(scans: number): Uint8Array {
  const frame = [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0];
  const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x00];
  return new Uint8Array([0xff, 0xd8, ...frame, ...many(scans, () => scan).flat(), 0xff, 0xd9]);
}

/** What the cleaner refuses, as its reasons say it. */
function cleaningRefusals(): Said[] {
  const said: Said[] = [];
  for (const [name, text] of PAST_SVG_CAPS) {
    const cleaned = cleanSvg(text);
    said.push({
      command: `svg ${name}`,
      message: cleaned.ok ? `Kept: ${name}` : cleaned.problem.message,
    });
  }
  for (const [name, bytes, format] of [
    ['bitmap too large', png(64, 64, 200 * 1024), 'png'],
    ['bitmap too wide', png(2000, 1, 16), 'png'],
    ['bitmap of too many scans', jpeg(65), 'jpeg'],
  ] as const) {
    const cleaned = readBitmap(bytes, format);
    said.push({ command: name, message: cleaned.ok ? `Kept: ${name}` : cleaned.problem.message });
  }
  return said;
}

// M8b seam 1: free geometry, named parts and automatic route styles (ADR 0066, 0067, 0069) ---------

const BOX = { width: 100, height: 100 };
const shaped = (outline: unknown, more: object = {}) => ({
  geometry: { ...BOX, outline, ...more },
});
const ring = (count: number, digits: number) =>
  many(count, (at) => {
    const angle = (2 * Math.PI * at) / count;
    return `${(50 + 40 * Math.cos(angle)).toFixed(digits)},${(50 + 40 * Math.sin(angle)).toFixed(digits)}`;
  }).join(' ');

const GEOMETRY: readonly [string, unknown][] = [
  traits('geometry not an outline', { geometry: 5 }),
  traits('geometry with more', { geometry: { ...BOX, outline: [], colour: 'red' } }),
  traits('geometry not an object at all', { geometry: { outline: [] } }),
  traits('geometry of no width', { geometry: { width: 0, height: 10, outline: [] } }),
  traits('geometry of no height', { geometry: { width: 10, height: -1, outline: [] } }),
  traits('geometry too wide', { geometry: { width: 200000, height: 10, outline: [] } }),
  traits('geometry too high', { geometry: { width: 10, height: 200000, outline: [] } }),
  traits('geometry of no contours', shaped([])),
  traits(
    'geometry of too many contours',
    shaped(many(65, () => ({ kind: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 5 }))),
  ),
  traits(
    'geometry keeping proportions badly',
    shaped([{ kind: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 5 }], { keepProportions: 'yes' }),
  ),
  traits(
    'geometry of too much text',
    shaped([{ kind: 'path', d: `M0 0 L10 0 L10 10 Z${' '.repeat(33000)}` }]),
  ),
  traits('geometry of too many segments', shaped([{ kind: 'polygon', points: ring(2001, 2) }])),
  traits('geometry contour not a contour', shaped([5])),
  traits('geometry path without data', shaped([{ kind: 'path' }])),
  traits('geometry polygon without points', shaped([{ kind: 'polygon' }])),
  traits('geometry path empty', shaped([{ kind: 'path', d: '' }])),
  traits('geometry path without a move', shaped([{ kind: 'path', d: 'L0 0' }])),
  traits('geometry close with numbers', shaped([{ kind: 'path', d: 'M0 0 Z 1 1' }])),
  traits('geometry line short of a number', shaped([{ kind: 'path', d: 'M0 0 L1' }])),
  traits('geometry arc with a bad flag', shaped([{ kind: 'path', d: 'M0 0 A1 1 0 2 0 1 1' }])),
  traits('geometry past finite', shaped([{ kind: 'path', d: 'm1e308 0 l1e308 0 l0 1 z' }])),
  traits('geometry comma before a command', shaped([{ kind: 'path', d: 'M0,0,L1,1' }])),
  traits('geometry polygon of odd numbers', shaped([{ kind: 'polygon', points: '0,0 1' }])),
  traits('geometry polygon of two points', shaped([{ kind: 'polygon', points: '0,0 10,10' }])),
  traits(
    'geometry ellipse not finite',
    shaped([{ kind: 'ellipse', cx: 'x', cy: 0, rx: 1, ry: 1 }]),
  ),
  traits(
    'geometry ellipse of no radius',
    shaped([{ kind: 'ellipse', cx: 5, cy: 5, rx: 0, ry: 1 }]),
  ),
  traits('geometry drawing nothing', shaped([{ kind: 'path', d: 'M0 0 L10 0' }])),
  traits('geometry leaving its box', shaped([{ kind: 'polygon', points: '0,0 200,0 0,10' }])),
  traits(
    'geometry label of no size',
    shaped([{ kind: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 5 }], {
      label: { x: 0, y: 0, width: 0, height: 1 },
    }),
  ),
  traits(
    'geometry label outside',
    shaped([{ kind: 'ellipse', cx: 50, cy: 50, rx: 5, ry: 5 }], {
      label: { x: 90, y: 90, width: 50, height: 5 },
    }),
  ),
  traits('part not a part', { part: 5 }),
  traits('part with more', { part: { part: 'lv', colour: 'red' } }),
  traits('part of a bad id', { part: { part: '1 bad' } }),
  traits('part of a bad image', { part: { part: 'lv', image: '1 bad' } }),
  relationTraits('route zigzag', { appearanceTraits: { route: 'zigzag' } }),
  ['view routes zigzag', { type: 'update-view', id: VIEW, changes: { routeStyle: 'zigzag' } }],
];

/** Projects whose free geometry opening warns about: not geometry, and past a file's caps. */
function geometryOnOpening(sample: ProjectSnapshot): [string, ProjectSnapshot][] {
  const withElements = (elements: Element[]): ProjectSnapshot => ({
    ...sample,
    model: { ...sample.model, elements: [...sample.model.elements, ...elements] },
  });
  const shapes = (count: number, points: string) =>
    many(count, (at) => ({
      id: `shape-${at}`,
      component: 'systems.service',
      name: `Shape ${at}`,
      appearance: { geometry: { ...BOX, outline: [{ kind: 'polygon' as const, points }] } },
    }));
  // About 31 KiB a geometry: 40 of them pass the model's warning, 68 its cap by one, 70 by more.
  const points = ring(1200, 9);
  return [
    [
      'geometry broken on opening',
      withElements([
        {
          id: 'odd',
          component: 'systems.service',
          name: 'Odd',
          appearance: { geometry: { ...BOX, outline: [{ kind: 'polygon', points: '0,0 1,1' }] } },
        },
      ]),
    ],
    ['geometry heavy on opening', withElements(shapes(40, points))],
    ['geometry past its cap by one on opening', withElements(shapes(68, points))],
    ['geometry past its cap on opening', withElements(shapes(70, points))],
  ];
}

// M8b seam 2: named parts (ADR 0067) -------------------------------------------------------------

const PARTS: readonly [string, unknown][] = [
  traits('part of an image no package defines', { part: { part: 'lv', image: 'clinic.nothing' } }),
];

/** Projects whose named parts opening warns about: missing images and parts, and pictures past the caps. */
function partsOnOpening(sample: ProjectSnapshot): [string, ProjectSnapshot][] {
  const picture = (id: string, content: string, viewBox = '0 0 100 100') => ({
    kind: 'svg' as const,
    id,
    name: id.slice('clinic.'.length),
    width: 10,
    height: 10,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>`,
  });
  const organs = picture('clinic.organs', '<path id="lung" d="M0 0h10v10h-10z"/>');
  const atlas = picture(
    'clinic.atlas',
    many(1030, (at) => `<path id="p${at}" d="M${at} 0h1v1z"/>`).join(''),
    '0 0 1100 1',
  );
  const rings = picture(
    'clinic.rings',
    `<path id="rings" d="${many(300, (at) => `M${at} ${at}h${600 - 2 * at}v${600 - 2 * at}h-${600 - 2 * at}z`).join('')}"/>`,
    '0 0 600 600',
  );
  const zig = many(1800, (at) => `L${at % 2 ? 9 : 1} ${(at / 180).toFixed(1)}`).join('');
  const uses = picture(
    'clinic.uses',
    `<defs><path id="zig" d="M0 0${zig}Z"/></defs>${many(60, (at) => `<use id="u${at}" href="#zig" x="${at * 10}"/>`).join('')}`,
    '0 0 700 20',
  );
  const drawnAs = (
    part: NonNullable<Element['appearance']>['part'],
    images: PackageFile['images'],
  ): ProjectSnapshot => ({
    ...sample,
    packages: sample.packages.map((file) => (file.id === 'clinic' ? { ...file, images } : file)),
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) =>
        each.id === 'patient' ? { ...each, appearance: { ...each.appearance, part } } : each,
      ),
    },
  });
  return [
    [
      'part of an image no package defines on opening',
      drawnAs({ part: 'lv', image: 'clinic.nothing' }, [organs]),
    ],
    ['part its image lacks on opening', drawnAs({ part: 'heart', image: organs.id }, [organs])],
    ['part past the first parts on opening', drawnAs({ part: 'p1029', image: atlas.id }, [atlas])],
    ['shapes past the caps on parts on opening', drawnAs('none', [rings, uses])],
  ];
}

// M8b W54: Anchor parts… (ADR 0067) ------------------------------------------------------------------

/**
 * What Anchor parts… says: the labels of its action for one part and for several, and why a plan is
 * refused, on the patient drawn with the parts of a picture of organs, holding a lung and a liver.
 */
function anchoring(sample: ProjectSnapshot): Said[] {
  const organs = {
    kind: 'svg' as const,
    id: 'clinic.organs',
    name: 'Organs',
    width: 20,
    height: 10,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path id="lung" d="M0 0h10v10h-10z"/><path id="liver" d="M10 0h10v10h-10z"/></svg>',
  };
  const inPatient = (id: string): Relation => ({
    id: `${id}-in-patient`,
    relationType: 'systems.is-part-of',
    from: id,
    to: 'patient',
  });
  const drawing = (contents: readonly string[]): ProjectSnapshot => ({
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [...(file.images ?? []), organs] } : file,
    ),
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements.map((each) =>
          each.id === 'patient'
            ? { ...each, appearance: { image: { image: organs.id, placement: 'parts' as const } } }
            : each,
        ),
        ...contents.map((id) => ({ id, component: 'systems.service', name: id })),
      ],
      relations: [...sample.model.relations, ...contents.map(inPatient)],
    },
  });
  const state = drawing(['lung', 'liver']);
  const said: Said[] = [];
  const plan = (name: string, on: ProjectSnapshot, request: Partial<AnchorRequest>) => {
    const planning = planAnchoring(on, {
      drawing: 'patient',
      matching: { by: 'name' },
      ...request,
    });
    if (!planning.ok) {
      said.push({ command: name, message: planning.problem.message });
      return;
    }
    const command = anchoringCommand(planning.plan);
    if (command) said.push(...runInOrder(on, name, [command]));
  };
  plan('anchor one part', state, { parts: ['lung'] });
  plan('anchor two parts', state, {});
  plan('anchor what is no drawing', state, { drawing: 'lung' });
  plan('anchor by a scheme that is none', state, {
    matching: { by: 'external', scheme: 'Not one' },
  });
  plan('anchor a part the picture lacks', state, { parts: ['heart'] });
  plan(
    'anchor by creating where nothing nests',
    { ...drawing([]), views: [] },
    { create: { component: 'systems.service' } },
  );
  return said;
}

// M11c seam 2: decisions in scenarios (ADR 0078) ---------------------------------------------------

const SCENARIO = 'patient-books-appointment';
const decided = (name: string, blocks: unknown): [string, unknown] => [
  name,
  { type: 'update-scenario', id: SCENARIO, changes: { blocks } },
];
const slots = (alternatives: unknown[], more: object = {}) => ({
  id: 'slots',
  kind: 'decision',
  question: 'Are there free slots?',
  alternatives,
  ...more,
});
const nested = (depth: number): unknown =>
  slots(
    [
      {
        id: `yes-${depth}`,
        label: 'Yes',
        steps: ['ask', 'hand-over', 'find-slots', 'read-calendar', 'book'],
      },
      { id: `no-${depth}`, label: 'No', steps: [] },
    ],
    { id: `slots-${depth}` },
  );

const DECISIONS: readonly [string, unknown][] = [
  decided('decision malformed', [{ id: 'slots', kind: 'gateway' }]),
  decided('decision naming no step', [
    slots([
      { id: 'yes', label: 'Yes', steps: ['nope'] },
      { id: 'no', label: 'No', steps: [] },
    ]),
  ]),
  decided('decision with steps apart', [
    slots([
      { id: 'yes', label: 'Yes', steps: ['ask', 'book'] },
      { id: 'no', label: 'No', steps: [] },
    ]),
  ]),
  decided('decision with alternatives apart', [
    slots([
      { id: 'yes', label: 'Yes', steps: ['book'] },
      { id: 'no', label: 'No', steps: ['ask'] },
    ]),
  ]),
  decided('decision without steps', [
    slots([
      { id: 'yes', label: 'Yes', steps: [] },
      { id: 'no', label: 'No', steps: [] },
    ]),
  ]),
  decided('decision with an unknown default', [
    slots(
      [
        { id: 'yes', label: 'Yes', steps: ['book'] },
        { id: 'no', label: 'No', steps: [] },
      ],
      { default: 'maybe' },
    ),
  ]),
  decided('decision with an id twice', [
    slots([
      { id: 'book', label: 'Yes', steps: ['book'] },
      { id: 'no', label: 'No', steps: [] },
    ]),
  ]),
  decided('decisions that cross', [
    slots([
      { id: 'yes', label: 'Yes', steps: ['find-slots'] },
      { id: 'no', label: 'No', steps: ['read-calendar'] },
    ]),
    {
      id: 'agent',
      kind: 'decision',
      question: 'Does the agent answer?',
      alternatives: [
        { id: 'answers', label: 'Yes', steps: ['read-calendar'] },
        { id: 'waits', label: 'No', steps: ['book'] },
      ],
    },
  ]),
  decided('decisions too deep', [nested(1), nested(2), nested(3), nested(4)]),
  decided(
    'too many decisions',
    many(65, (at) =>
      slots(
        [
          { id: `yes-${at}`, label: 'Yes', steps: [] },
          { id: `no-${at}`, label: 'No', steps: [] },
        ],
        { id: `slots-${at}` },
      ),
    ),
  ),
];

/** A project whose scenario's decisions do not hold together, as a file may hold them. */
function decisionsOnOpening(sample: ProjectSnapshot): [string, ProjectSnapshot][] {
  const withBlocks = (blocks: unknown): ProjectSnapshot => ({
    ...sample,
    scenarios: sample.scenarios.map((scenario) =>
      scenario.id === SCENARIO
        ? { ...scenario, blocks: blocks as ScenarioFile['blocks'] }
        : scenario,
    ),
  });
  return [
    [
      'decision of one alternative on opening',
      withBlocks([slots([{ id: 'yes', label: 'Yes', steps: ['book'] }])]),
    ],
  ];
}

// M8b W56: HTML imported as a drawing (ADR 0068) ------------------------------------------------------

/** What preparing a drawing's one action says, and the action's label as it runs. */
function drawings(sample: ProjectSnapshot): Said[] {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><path d="M0 0h800v400H0z"/></svg>';
  const said: Said[] = [];
  for (const [name, target] of [
    ['a drawing on an element the project lacks', { element: 'gone' }],
    ['a drawing of a component no package defines', { component: 'nothing.box' }],
    ['a drawing in a view the project lacks', { view: 'gone' }],
  ] as const) {
    const prepared = prepareDrawingImport(sample, { name: 'card.html', svg, target });
    if (!prepared.ok) {
      for (const message of prepared.problems) said.push({ command: name, message });
    }
  }
  const prepared = prepareDrawingImport(sample, {
    name: 'card.html',
    svg,
    target: { view: VIEW },
  });
  if (prepared.ok) said.push(...runInOrder(sample, 'a drawing imported', [prepared.command]));
  return said;
}

/** Everything these fixtures make the core say. */
export function coreRefusals(): Said[] {
  const sample = loadSample();
  const said: Said[] = [];
  for (const [name, command] of ALONE) said.push(...runInOrder(sample, name, [command]));
  for (const [name, commands] of IN_ORDER) said.push(...runInOrder(sample, name, commands));
  for (const [name, state, commands] of inOrderOn(sample)) {
    said.push(...runInOrder(state, name, commands));
  }
  for (const [name, state] of broken(sample)) said.push(...checked(name, state));
  for (const [name, command] of GEOMETRY) said.push(...runInOrder(sample, name, [command]));
  for (const [name, state] of geometryOnOpening(sample)) said.push(...checked(name, state));
  for (const [name, command] of PARTS) said.push(...runInOrder(sample, name, [command]));
  for (const [name, state] of partsOnOpening(sample)) said.push(...checked(name, state));
  said.push(...anchoring(sample));
  for (const [name, command] of DECISIONS) said.push(...runInOrder(sample, name, [command]));
  for (const [name, state] of decisionsOnOpening(sample)) said.push(...checked(name, state));
  said.push(...cleaningRefusals());
  said.push(...drawings(sample));
  return said;
}
