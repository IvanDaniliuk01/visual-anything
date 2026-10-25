/**
 * The core's messages through the Spanish templates (ADR-0038): commands run on the sample project,
 * well formed and not, and each label, refusal and warning they produce must read in Spanish, but for
 * the messages listed below, which must stay English. The list is printed, and each of its patterns
 * must still match a message, so that it never holds more than it has to.
 */
import {
  checkProject,
  executeCommand,
  previewDelete,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translateMessage, untranslatedParts } from './translate';

/**
 * What must stay English: a command the core cannot even read, whose reason is the JavaScript
 * engine's own words. Only a command written by hand, as Claude's can be, comes to it, and the app
 * never sends one.
 */
const STAYS_ENGLISH: readonly RegExp[] = [/^The command is not well formed: /];

const sample = loadSample();

interface Outcome {
  command: string;
  message: string;
}

/** Runs commands one after the other, each on the project the ones before it left. */
function run(start: ProjectSnapshot, commands: readonly [string, Command][]): Outcome[] {
  let state = start;
  const said: Outcome[] = [];
  let made = 0;
  for (const [name, command] of commands) {
    const outcome = executeCommand(state, command, {
      newId: (base) => {
        made += 1;
        return `${base}-${made}`;
      },
    });
    if (outcome.ok) {
      state = outcome.state;
      said.push({ command: name, message: outcome.label });
      for (const warning of outcome.warnings)
        said.push({ command: name, message: warning.message });
    } else {
      for (const problem of outcome.problems) {
        said.push({ command: name, message: problem.message });
      }
    }
  }
  return said;
}

const VIEW = 'system-overview';
const IS_PART_OF = 'systems.is-part-of';

const COMMANDS: readonly [string, Command][] = [
  // Elements and relations.
  [
    'create',
    { type: 'create-element', element: { component: 'systems.service', name: 'Billing' } },
  ],
  [
    'create unnamed',
    { type: 'create-element', element: { component: 'systems.service', name: ' ' } },
  ],
  [
    'create of unknown component',
    { type: 'create-element', element: { component: 'nope', name: 'X' } },
  ],
  ['rename', { type: 'update-element', id: 'patient', changes: { name: 'Client' } }],
  ['edit', { type: 'update-element', id: 'patient', changes: { description: 'Who books.' } }],
  [
    'bad fill',
    { type: 'update-element', id: 'patient', changes: { appearanceTraits: { fill: 'red' } } },
  ],
  [
    'bad width',
    { type: 'update-element', id: 'patient', changes: { appearanceTraits: { width: -1 } } },
  ],
  ['unknown element', { type: 'update-element', id: 'nobody', changes: { name: 'X' } }],
  [
    'relate',
    {
      type: 'create-relation',
      relation: { relationType: 'systems.communicates-with', from: 'patient', to: 'booking-agent' },
    },
  ],
  [
    'relation breaking limits',
    {
      type: 'create-relation',
      relation: { relationType: 'systems.reads-from', from: 'patient', to: 'whatsapp' },
    },
  ],
  [
    'cycle',
    {
      type: 'create-relation',
      relation: { relationType: IS_PART_OF, from: 'clinic-booking', to: 'scheduling' },
    },
  ],
  [
    'relation on itself',
    { type: 'update-relation', id: 'agent-to-api', changes: { from: 'agent-to-api' } },
  ],
  ['edit relation', { type: 'update-relation', id: 'agent-to-api', changes: { name: 'Books' } }],
  ['delete one', { type: 'delete', elements: ['reminder-service'] }],
  ['delete a relation', { type: 'delete', relations: ['api-reads-db'] }],
  ['delete several', { type: 'delete', elements: ['whatsapp', 'booking-agent'] }],
  ['delete world', { type: 'delete', elements: ['world'] }],
  ['delete nothing', { type: 'delete' }],
  ['reorder', { type: 'reorder-elements', elements: ['appointments-db'] }],
  [
    'reorder before',
    { type: 'reorder-elements', elements: ['appointments-db'], before: 'patient' },
  ],
  ['reorder world', { type: 'reorder-elements', elements: ['world'] }],
  // Views, positions and free shapes.
  ['create view', { type: 'create-view', view: { name: 'Data', perspective: { name: 'Data' } } }],
  [
    'create unnamed view',
    { type: 'create-view', view: { name: '', perspective: { name: 'Data' } } },
  ],
  ['edit view', { type: 'update-view', id: VIEW, changes: { description: 'All of it.' } }],
  [
    'move a shape',
    { type: 'set-positions', view: VIEW, positions: [{ element: 'patient', x: 1, y: 2 }] },
  ],
  [
    'let layout place',
    { type: 'remove-positions', view: VIEW, positions: [{ element: 'patient' }] },
  ],
  [
    'add a note',
    {
      type: 'create-free-shape',
      view: VIEW,
      shape: { kind: 'note', x: 0, y: 0, width: 100, height: 40, text: 'Hi' },
    },
  ],
  ['delete a note', { type: 'delete-free-shapes', view: VIEW, ids: ['calendar-note'] }],
  ['delete played view', { type: 'delete-view', id: VIEW }],
  ['unknown view', { type: 'update-view', id: 'nowhere', changes: { name: 'X' } }],
  // Containers, collapse and stacking.
  [
    'put inside',
    { type: 'change-container', view: VIEW, to: 'scheduling', shapes: [{ element: 'patient' }] },
  ],
  [
    'take out',
    {
      type: 'change-container',
      view: VIEW,
      shapes: [{ element: 'appointments-api', from: 'scheduling' }],
    },
  ],
  [
    'inside itself',
    { type: 'change-container', view: VIEW, to: 'scheduling', shapes: [{ element: 'scheduling' }] },
  ],
  ['collapse', { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: true }],
  [
    'expand several',
    {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['scheduling', 'clinic-booking'],
      collapsed: false,
    },
  ],
  ['collapse world', { type: 'set-collapsed', view: VIEW, elements: ['world'], collapsed: true }],
  [
    'bring to front',
    { type: 'restack', view: VIEW, moves: [{ shape: { element: 'patient' }, to: 'front' }] },
  ],
  [
    'send to back',
    { type: 'restack', view: VIEW, moves: [{ shape: { element: 'patient' }, to: 'back' }] },
  ],
  // What a view shows (ADR 0040).
  [
    'scope a view',
    {
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'systems.service' }] },
    },
  ],
  ['add to a view', { type: 'add-to-view', view: VIEW, elements: ['appointments-db'] }],
  [
    'add two to a view',
    { type: 'add-to-view', view: VIEW, elements: ['appointments-db', 'patient'] },
  ],
  ['leave out of a view', { type: 'leave-out-of-view', view: VIEW, elements: ['patient'] }],
  [
    'leave two out of a view',
    { type: 'leave-out-of-view', view: VIEW, elements: ['patient', 'appointments-db'] },
  ],
  ['leave World out', { type: 'leave-out-of-view', view: VIEW, elements: ['world'] }],
  ['leave nothing out', { type: 'leave-out-of-view', view: VIEW, elements: [] }],
  [
    'scope with a bad rule',
    { type: 'set-scope', view: VIEW, scope: { include: [{ kind: 'nothing' } as never] } },
  ],
  [
    'scope both ways',
    { type: 'set-scope', view: VIEW, scope: { added: ['patient'], leftOut: ['patient'] } },
  ],
  ['show the whole model', { type: 'set-scope', view: VIEW, scope: null }],
  // Routes drawn by hand (ADR 0039).
  ['curve a route', { type: 'set-route', view: VIEW, relation: 'api-writes-db', style: 'curved' }],
  [
    'bend a route',
    {
      type: 'set-route',
      view: VIEW,
      relation: 'api-writes-db',
      bendPoints: [{ x: 120, y: 40 }],
    },
  ],
  [
    'attach an end',
    {
      type: 'set-route',
      view: VIEW,
      relation: 'api-writes-db',
      from: { kind: 'border', side: 'top', at: 0.5 },
    },
  ],
  ['route nothing', { type: 'set-route', view: VIEW, relation: 'nothing-here', style: 'straight' }],
  ['reset routes', { type: 'reset-route', view: VIEW, relations: ['api-writes-db'] }],
  // Scenarios.
  [
    'create scenario',
    { type: 'create-scenario', scenario: { name: 'Lost', view: VIEW, steps: [] } },
  ],
  [
    'edit scenario',
    {
      type: 'update-scenario',
      id: 'patient-books-appointment',
      changes: { description: 'Booking.' },
    },
  ],
  [
    'empty step',
    {
      type: 'update-scenario',
      id: 'patient-books-appointment',
      changes: { steps: [{ relations: [], description: 'Nothing' }] },
    },
  ],
  ['delete scenario', { type: 'delete-scenario', id: 'patient-books-appointment' }],
  // Packages and definitions.
  ['create package', { type: 'create-package', package: { id: 'shop', name: 'Shop' } }],
  ['create taken package', { type: 'create-package', package: { id: 'clinic', name: 'Clinic' } }],
  ['change built-in package', { type: 'update-package', id: 'systems', changes: { name: 'S' } }],
  ['rename package', { type: 'update-package', id: 'clinic', changes: { name: 'Hospital' } }],
  [
    'define component',
    {
      type: 'define-component',
      package: 'clinic',
      component: { name: 'Ward', derivesFrom: 'systems.box' },
    },
  ],
  [
    'rename component',
    { type: 'update-component', id: 'clinic.calendar', changes: { name: 'Agenda' } },
  ],
  ['remove used component', { type: 'remove-component', id: 'clinic.calendar' }],
  [
    'define relation type',
    {
      type: 'define-relation-type',
      package: 'clinic',
      relationType: { name: 'pays', derivesFrom: 'relates-to' },
    },
  ],
  [
    'component with a bad stroke',
    {
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { stroke: 'blue' } },
    },
  ],
  [
    'component with rows on an ellipse',
    {
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { shape: 'ellipse', contentsAsRows: true } },
    },
  ],
  [
    'relation type with a bad dash',
    {
      type: 'update-relation-type',
      id: 'clinic.reminds',
      changes: { appearance: { dash: 'wavy' } } as never,
    },
  ],
  ['remove relation type', { type: 'remove-relation-type', id: 'clinic.reminds' }],
  ['edit project', { type: 'update-project', changes: { description: 'A clinic.' } }],
  ['stop using a package', { type: 'update-project', changes: { packages: ['systems'] } }],
  // A batch.
  [
    'batch',
    {
      type: 'batch',
      label: 'Rename the scenario “A” to “B”',
      commands: [{ type: 'update-element', id: 'nobody', changes: { name: 'X' } }],
    },
  ],
  // Commands written by hand that are not as commands are written, as Claude's can be.
  ...malformed([
    ['no type', { name: 'X' }],
    ['unknown type', { type: 'paint' }],
    ['empty batch', { type: 'batch', label: 'Nothing', commands: [] }],
    ['elements not a list', { type: 'delete', elements: 'patient' }],
    [
      'x not a number',
      { type: 'set-positions', view: VIEW, positions: [{ element: 'patient', x: 'one', y: 2 }] },
    ],
    [
      'collapsed not a flag',
      { type: 'set-collapsed', view: VIEW, elements: ['scheduling'], collapsed: 'yes' },
    ],
    [
      'nests not a flag',
      { type: 'update-relation-type', id: 'clinic.reminds', changes: { nests: 'yes' } },
    ],
    ['changes not an object', { type: 'update-component', id: 'clinic.calendar', changes: 'all' }],
    ['component not an object', { type: 'define-component', package: 'clinic', component: 5 }],
    [
      'appearance not an object',
      { type: 'update-component', id: 'clinic.calendar', changes: { appearance: 'blue' } },
    ],
    [
      'badges not a list',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { detail: { badges: 'PK' } } },
      },
    ],
    [
      'detail not an object',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { detail: 'name' } },
      },
    ],
    [
      'rows not a flag',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { contentsAsRows: 'yes' } },
      },
    ],
    [
      'component name not a flag',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { detail: { componentName: 'yes' } } },
      },
    ],
    [
      'connection points not a list',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { connectionPoints: 'top' } },
      },
    ],
    [
      'unknown trait',
      { type: 'update-element', id: 'patient', changes: { appearanceTraits: { glow: true } } },
    ],
    [
      'both appearances',
      {
        type: 'update-element',
        id: 'patient',
        changes: { appearance: {}, appearanceTraits: { fill: '#FFFFFF' } },
      },
    ],
    [
      'attributes not a list',
      { type: 'update-component', id: 'clinic.calendar', changes: { attributes: { set: 'all' } } },
    ],
    [
      'rename without names',
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { attributes: { rename: [{}] } },
      },
    ],
    [
      'unknown route style',
      { type: 'set-route', view: VIEW, relation: 'api-writes-db', style: 'wavy' },
    ],
    [
      'bend points not a list',
      { type: 'set-route', view: VIEW, relation: 'api-writes-db', bendPoints: 'here' },
    ],
    [
      'bend point not a number',
      { type: 'set-route', view: VIEW, relation: 'api-writes-db', bendPoints: [{ x: 'a', y: 1 }] },
    ],
    [
      'unknown side',
      {
        type: 'set-route',
        view: VIEW,
        relation: 'api-writes-db',
        from: { kind: 'border', side: 'middle', at: 0.5 },
      },
    ],
    [
      'attached past the side',
      {
        type: 'set-route',
        view: VIEW,
        relation: 'api-writes-db',
        from: { kind: 'border', side: 'top', at: 2 },
      },
    ],
    [
      'unknown attachment',
      { type: 'set-route', view: VIEW, relation: 'api-writes-db', from: { kind: 'magnet' } },
    ],
    ['no relations to reset', { type: 'reset-route', view: VIEW, relations: [] }],
    [
      'unknown stacking move',
      { type: 'restack', view: VIEW, moves: [{ shape: { element: 'patient' }, to: 'up' }] },
    ],
    [
      'unknown free shape',
      { type: 'create-free-shape', view: VIEW, shape: { kind: 'star', x: 0, y: 0 } },
    ],
    [
      'arrow with a fill',
      {
        type: 'create-free-shape',
        view: VIEW,
        shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, fill: '#FFFFFF' },
      },
    ],
    // Package code (ADR 0054).
    ['add code', { type: 'set-package-code', package: 'clinic', code: 'export const a = 1;' }],
    ['code reaching', { type: 'set-package-code', package: 'clinic', capabilities: ['time'] }],
    ['change code', { type: 'set-package-code', package: 'clinic', code: 'export const b = 2;' }],
    ['code with nothing', { type: 'set-package-code', package: 'clinic' }],
    ['code not text', { type: 'set-package-code', package: 'clinic', code: 5 }],
    ['empty code', { type: 'set-package-code', package: 'clinic', code: ' ' }],
    ['code too long', { type: 'set-package-code', package: 'clinic', code: 'x'.repeat(262145) }],
    [
      'code line too long',
      { type: 'set-package-code', package: 'clinic', code: ['x'.repeat(10001)] },
    ],
    ['code line broken', { type: 'set-package-code', package: 'clinic', code: ['a();\nb();'] }],
    [
      'code too many lines',
      {
        type: 'set-package-code',
        package: 'clinic',
        code: Array.from({ length: 20001 }, () => 'a'),
      },
    ],
    ['unknown capability', { type: 'set-package-code', package: 'clinic', capabilities: ['x'] }],
    [
      'capability with a path',
      { type: 'set-package-code', package: 'clinic', capabilities: ['network:https://a.com/x'] },
    ],
    [
      'capabilities not a list',
      { type: 'set-package-code', package: 'clinic', capabilities: 'time' },
    ],
    [
      'too many capabilities',
      {
        type: 'set-package-code',
        package: 'clinic',
        capabilities: Array.from({ length: 17 }, (_, i) => `network:https://h${i}.example.com`),
      },
    ],
    ['remove code', { type: 'set-package-code', package: 'clinic', code: null }],
    [
      'capabilities without code',
      { type: 'set-package-code', package: 'clinic', capabilities: ['time'] },
    ],
    ['image without one', { type: 'define-image', package: 'clinic' }],
    ['description not text', { type: 'update-package', id: 'clinic', changes: { description: 5 } }],
    ['unreadable position', { type: 'set-positions', view: VIEW, positions: [null] }],
  ]),
];

/** Commands written by hand, which the core reads as it reads any; their types say nothing of them. */
function malformed(commands: readonly [string, unknown][]): [string, Command][] {
  return commands.map(([name, command]) => [name, command as Command]);
}

/** Everything the commands said, and what the project and a deletion's preview say. */
function allMessages(): Outcome[] {
  const said = run(sample, COMMANDS);
  const broken: ProjectSnapshot = {
    ...sample,
    model: {
      ...sample.model,
      elements: [
        ...sample.model.elements,
        { id: 'stray', component: 'gone.component', name: 'Stray' },
      ],
    },
  };
  for (const warning of checkProject(broken).warnings) {
    said.push({ command: 'check', message: warning.message });
  }
  for (const problem of previewDelete(sample, { elements: [sample.model.world.id] }).problems) {
    said.push({ command: 'preview', message: problem.message });
  }
  return said;
}

describe('the core’s messages in Spanish', () => {
  const said = allMessages();

  it('runs the commands it means to', () => {
    expect(said.length).toBeGreaterThan(COMMANDS.length);
  });

  it('lists only what it has to as staying English', () => {
    const unused = STAYS_ENGLISH.filter(
      (pattern) => !said.some(({ message }) => pattern.test(message)),
    );
    expect(unused).toEqual([]);
  });

  it('has a Spanish template for every label, refusal and warning, but those listed', () => {
    const englishOnly = said.filter(({ message }) =>
      STAYS_ENGLISH.some((pattern) => pattern.test(message)),
    );
    if (englishOnly.length > 0) {
      console.info(
        `The core's messages that stay English for now:\n${englishOnly
          .map(({ command, message }) => `  ${command}: ${message}`)
          .join('\n')}`,
      );
    }
    const missing = said
      .filter(({ message }) => !STAYS_ENGLISH.some((pattern) => pattern.test(message)))
      .flatMap(({ command, message }) =>
        untranslatedParts('es', message).map((part) => `${command}: ${part}`),
      );
    expect(missing).toEqual([]);
  });

  it('keeps what people wrote as they wrote it', () => {
    const rename = said.find((each) => each.command === 'rename');
    expect(rename && translateMessage('es', rename.message)).toBe(
      'Cambiar el nombre de "Patient" a "Client"',
    );
    const deleted = said.find((each) => each.command === 'delete several');
    expect(deleted && translateMessage('es', deleted.message)).toMatch(
      /^Eliminar 2 elementos y \d+ relaciones$/,
    );
    const limits = said.find(
      (each) => each.command === 'relation breaking limits' && each.message.includes('expects'),
    );
    expect(limits && translateMessage('es', limits.message)).toBe(
      '"reads from" espera que su extremo de destino sea "Database" o "Object storage", pero "WhatsApp channel" no lo es.',
    );
  });
});

describe('the app’s own labels and notices in Spanish', () => {
  it.each([
    'Delete the selection',
    'Collapsed "Scheduling".',
    'Expanded 3 containers.',
    'Lay out',
    'Lay out "System overview"',
    'Lay out the contents of "Scheduling"',
    'Lay out "Patient" in "System overview"',
    'Lay out 4 new shapes in "System overview"',
    'Change the appearance of the component "Service"',
    'Change the appearance of the relation type "reads from"',
    'Change the appearance of 3 shapes',
    'Use the package "Systems"',
    'Define the component "Ward"',
    'Derive the component "Ward"',
    'Define the relation type "pays"',
    'Derive the relation type "pays"',
    'Stop using the package "Data modeling"',
    'Move 3 shapes in "System overview"',
    'Create "Service"',
    'Add a row to "Users"',
    'Add 1 column to "Users"',
    'Add 3 columns to "Users"',
    'Set the image of "Patient"',
    'Draw 2 relations curved in "System overview"',
    'Route "Books" by hand in "System overview"',
    'Reset the route of "Books" in "System overview"',
    'Reconnect "Books" to "Patient"',
  ])('reads %j', (label) => {
    expect(untranslatedParts('es', label)).toEqual([]);
  });
});

describe('the local program’s messages in Spanish', () => {
  it.each([
    'The project has 2 warnings:\nmodel.vamodel: World cannot sit inside anything.\nviews/a.vaview /positions/0: The relation "r" ends on itself.',
    'Reloaded the project: model.vamodel changed on disk.',
    'Your preference applies until Visual Anything stops: it could not be saved (EACCES).',
    'Could not undo: There is nothing to undo.',
    'Could not save model.vamodel (disk full); nothing was changed.',
  ])('translates %j', (message) => {
    expect(untranslatedParts('es', message)).toEqual([]);
  });

  it('joins lists as Spanish does', () => {
    expect(
      translateMessage(
        'es',
        'The component "Calendar" cannot be removed: 3 elements, 1 relation and 2 views use it.',
      ),
    ).toBe(
      'El componente "Calendar" no se puede quitar: lo usan 3 elementos, 1 relación y 2 vistas.',
    );
  });
});
