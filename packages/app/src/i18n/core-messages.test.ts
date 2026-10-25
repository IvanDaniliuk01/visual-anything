/**
 * The core's messages through the Spanish templates (ADR-0038): commands run on the sample project,
 * well formed and not, and each label, refusal and warning they produce must read in Spanish, but for
 * the messages listed below, which must stay English. The list is printed, and each of its patterns
 * must still match a message, so that it never holds more than it has to.
 */
import {
  checkProject,
  definitionsIn,
  executeCommand,
  legendOf,
  previewDelete,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Component, Element, Overlay, PackageFile, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { importMessages } from '../test/importMessages';
import { readerMessages } from '../test/reader-messages';
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

/** A component of a package shared between projects, as its file holds it. */
function kiosk(id: string, derivesFrom = 'systems.box'): Component {
  return { id, name: 'Kiosk', derivesFrom };
}

/** A package from another project, with the components given. */
function shared(id: string, components: Partial<Component>[]): PackageFile {
  return {
    id,
    name: 'Plaza',
    components: components.map((each) => ({ ...kiosk(each.id ?? `${id}.kiosk`), ...each })),
    relationTypes: [],
  };
}

/** A package from another project, with an image that needs cleaning. */
const MALL: PackageFile = {
  id: 'mall',
  name: 'Mall',
  version: '1.0.0',
  license: 'MIT',
  attribution: 'Jane Doe',
  components: [kiosk('mall.kiosk')],
  relationTypes: [],
  images: [
    {
      kind: 'svg',
      id: 'mall.logo',
      name: 'Logo',
      width: 1,
      height: 1,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script><path d="M0 0h1v1z"/></svg>',
    },
  ],
};

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
  // Tours (ADR 0058).
  ...tourCommands(),
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
  // Packages shared between projects (ADR 0051).
  ['add package', { type: 'add-package', package: MALL }],
  ['add a package again', { type: 'add-package', package: MALL }],
  [
    'make an id a package takes',
    {
      type: 'create-element',
      element: { id: 'arcade.hall', component: 'systems.box', name: 'Hall' },
    },
  ],
  [
    'add a package whose ids are taken',
    { type: 'add-package', package: shared('arcade', [{ id: 'arcade.hall' }]) },
  ],
  [
    'add a package with ids outside it',
    { type: 'add-package', package: shared('plaza', [{ id: 'mall.stall' }]) },
  ],
  [
    'add a package using an id twice',
    { type: 'add-package', package: shared('plaza', [{ id: 'plaza.a' }, { id: 'plaza.a' }]) },
  ],
  [
    'add a package that needs more',
    {
      type: 'add-package',
      package: shared('plaza', [{ id: 'plaza.a', derivesFrom: 'gone.base' }]),
    },
  ],
  [
    'add a package with a bad version',
    { type: 'add-package', package: { ...shared('plaza', []), version: 'v1' } },
  ],
  [
    'add a package with a bad license',
    { type: 'add-package', package: { ...shared('plaza', []), license: 'CC BY 4.0' } },
  ],
  [
    'add a package with a bad attribution',
    { type: 'add-package', package: { ...shared('plaza', []), attribution: '' } },
  ],
  [
    'update package',
    {
      type: 'replace-package',
      package: {
        ...MALL,
        version: '1.1.0',
        relationTypes: [{ id: 'mall.sells', name: 'sells', derivesFrom: 'relates-to' }],
      },
    },
  ],
  ['use a kiosk', { type: 'create-element', element: { component: 'mall.kiosk', name: 'Kiosk' } }],
  [
    'sell at a kiosk',
    {
      type: 'create-relation',
      relation: { relationType: 'mall.sells', from: 'patient', to: 'appointments-api' },
    },
  ],
  [
    'update removing a used component',
    { type: 'replace-package', package: { ...MALL, components: [] } },
  ],
  [
    'update removing a used relation type',
    { type: 'replace-package', package: { ...MALL, relationTypes: [] } },
  ],
  [
    'make an id the mall takes',
    {
      type: 'create-element',
      element: { id: 'mall.taken', component: 'systems.box', name: 'Taken' },
    },
  ],
  [
    'update with a taken id',
    {
      type: 'replace-package',
      package: {
        ...MALL,
        relationTypes: [{ id: 'mall.sells', name: 'sells', derivesFrom: 'relates-to' }],
        components: [...MALL.components, kiosk('mall.taken')],
      },
    },
  ],
  [
    'update with an id outside it',
    {
      type: 'replace-package',
      package: {
        ...MALL,
        relationTypes: [{ id: 'mall.sells', name: 'sells', derivesFrom: 'relates-to' }],
        components: [...MALL.components, kiosk('plaza.stall')],
      },
    },
  ],
  [
    'image with a bad license',
    {
      type: 'define-image',
      package: 'clinic',
      image: { name: 'Bell', license: 'CC BY', svg: '<svg viewBox="0 0 1 1"/>' },
    },
  ],
  // Overlays and levels of detail (ADR 0055).
  ...overlayCommands(),
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
    ['add no package', { type: 'add-package' }],
    ['add a package without lists', { type: 'add-package', package: { id: 'p', name: 'P' } }],
    [
      'add a package whose images are no list',
      { type: 'add-package', package: { ...shared('p', []), images: 5 } },
    ],
    [
      'add a package with a definition that is no object',
      { type: 'add-package', package: { ...shared('p', []), components: [5] } },
    ],
    [
      'add a package with an image of no kind',
      { type: 'add-package', package: { ...shared('p', []), images: [{ id: 'p.i', name: 'I' }] } },
    ],
    ['update no package', { type: 'replace-package' }],
    [
      'add a package with a key no package has',
      { type: 'add-package', package: { ...shared('p', []), code: 'alert(1)' } },
    ],
    [
      'add a package with an image that has a key no image has',
      {
        type: 'add-package',
        package: {
          ...shared('p', []),
          images: [{ kind: 'svg', id: 'p.i', name: 'I', svg: '<svg/>', onload: 'alert(1)' }],
        },
      },
    ],
    ['description not text', { type: 'update-package', id: 'clinic', changes: { description: 5 } }],
    ['unreadable position', { type: 'set-positions', view: VIEW, positions: [null] }],
  ]),
];

/** The commands on tours, well formed and not, on the sample's tour (ADR 0058). */
function tourCommands(): [string, Command][] {
  const tour = 'how-booking-works';
  const steps = sample.tours.find((each) => each.id === tour)?.steps ?? [];
  const [first, second, third] = steps;
  if (!first || !second || !third) throw new Error('The sample has no tour of three steps.');
  const step = { viewState: { view: VIEW }, caption: { title: 'Here' } };
  const created = (name: string, made: unknown): [string, Command] => [
    name,
    { type: 'create-tour', tour: { name: 'T', steps: [made] } } as Command,
  ];
  return [
    ['create tour', { type: 'create-tour', tour: { name: 'Walk', steps: [step] } }],
    ['add tour step', { type: 'update-tour', id: tour, changes: { steps: [...steps, step] } }],
    ['delete tour step', { type: 'update-tour', id: tour, changes: { steps: [first, second] } }],
    ['reorder tour steps', { type: 'update-tour', id: tour, changes: { steps: [second, first] } }],
    ['edit tour', { type: 'update-tour', id: tour, changes: { description: 'Booking.' } }],
    ['unknown tour', { type: 'update-tour', id: 'gone', changes: {} }],
    ['tour without name', { type: 'create-tour', tour: { name: '' } }],
    ['tour name too long', { type: 'create-tour', tour: { name: 'x'.repeat(201) } }],
    [
      'tour description too long',
      { type: 'create-tour', tour: { name: 'T', description: 'x'.repeat(4001) } },
    ],
    [
      'tour too long',
      { type: 'create-tour', tour: { name: 'T', steps: Array.from({ length: 1001 }, () => step) } },
    ],
    created('step over no view', { ...step, viewState: { view: 'gone' } }),
    created('step selecting nothing there', {
      ...step,
      viewState: { view: VIEW, select: ['gone'] },
    }),
    created('step marking nothing there', { ...step, marks: ['gone'] }),
    created('step marking twice', { ...step, marks: ['patient', 'patient'] }),
    created('step marking too much', {
      ...step,
      marks: Array.from({ length: 501 }, (_, at) => `e${at}`),
    }),
    created('step playing backwards', {
      ...step,
      play: { scenario: 'patient-books-appointment', from: 'book', to: 'ask' },
    }),
    created('step playing no scenario', { ...step, play: { scenario: 'gone' } }),
    created('step with a title too long', { ...step, caption: { title: 'x'.repeat(201) } }),
    created('step with a text too long', {
      ...step,
      caption: { title: 'T', text: 'x'.repeat(4001) },
    }),
    created('step with notes too long', { ...step, notes: 'x'.repeat(20001) }),
    created('step without its view state', { caption: { title: 'T' } }),
    ...malformed([
      ['tour not an object', { type: 'create-tour', tour: 5 }],
      ['tour changes not an object', { type: 'update-tour', id: tour, changes: 5 }],
      ['tour description not text', { type: 'update-tour', id: tour, changes: { description: 5 } }],
      ['tour step not an object', { type: 'create-tour', tour: { name: 'T', steps: [5] } }],
      [
        'tour steps with one id',
        {
          type: 'create-tour',
          tour: {
            name: 'T',
            steps: [
              { ...step, id: 'a' },
              { ...step, id: 'a' },
            ],
          },
        },
      ],
      [
        'step without a caption',
        { type: 'create-tour', tour: { name: 'T', steps: [{ viewState: { view: VIEW } }] } },
      ],
      [
        'caption with HTML',
        {
          type: 'create-tour',
          tour: { name: 'T', steps: [{ ...step, caption: { title: 'T', html: '<b>' } }] },
        },
      ],
      [
        'caption text not text',
        {
          type: 'create-tour',
          tour: { name: 'T', steps: [{ ...step, caption: { title: 'T', text: 5 } }] },
        },
      ],
      [
        'notes not text',
        { type: 'create-tour', tour: { name: 'T', steps: [{ ...step, notes: 5 }] } },
      ],
      [
        'marks not a list',
        { type: 'create-tour', tour: { name: 'T', steps: [{ ...step, marks: 'patient' }] } },
      ],
      [
        'play not an object',
        { type: 'create-tour', tour: { name: 'T', steps: [{ ...step, play: 'x' }] } },
      ],
      [
        'play with more',
        {
          type: 'create-tour',
          tour: { name: 'T', steps: [{ ...step, play: { scenario: 'x', speed: 2 } }] },
        },
      ],
    ]),
    ['delete tour', { type: 'delete-tour', id: tour }],
  ];
}

/** Commands written by hand, which the core reads as it reads any; their types say nothing of them. */
function malformed(commands: readonly [string, unknown][]): [string, Command][] {
  return commands.map(([name, command]) => [name, command as Command]);
}

/**
 * The sample with overlays that only warn, an id twice, colors hard to tell apart, and an element
 * whose levels start twice at one scale (ADR 0055).
 */
function overlaidSample(): ProjectSnapshot {
  const [view, ...views] = sample.views as [ViewFile, ...ViewFile[]];
  const close: Overlay = {
    id: 'close',
    name: 'Tier',
    of: 'elements',
    attribute: 'tier',
    channel: 'stroke',
    mapping: {
      kind: 'discrete',
      cases: Array.from({ length: 5 }, (_, at) => ({ value: `v${at}`, color: `#FFFFF${at}` })),
      otherwise: '#16191E',
    },
  };
  const overlays: Overlay[] = [
    close,
    {
      ...close,
      id: 'pair',
      mapping: {
        kind: 'discrete',
        cases: [{ value: 'a', color: '#FFFF00' }],
        otherwise: '#FFFF10',
      },
    },
    { ...close, id: 'close', of: 'relations', channel: 'fill', attribute: 'rate' },
    {
      ...close,
      id: 'down',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 2, color: '#000000' },
          { at: 1, color: '#FFFFFF' },
        ],
      },
    },
    {
      ...close,
      id: 'twice',
      mapping: {
        kind: 'discrete',
        cases: [
          { value: '1', color: '#000000' },
          { value: '1.0', color: '#000000' },
        ],
      },
    },
  ];
  const [first, ...elements] = sample.model.elements as [Element, ...Element[]];
  return {
    ...sample,
    views: [{ ...view, overlays }, ...views],
    model: {
      ...sample.model,
      elements: [
        {
          ...first,
          appearance: {
            levels: [
              { from: 1, shows: ['name'] },
              { from: 1, shows: ['silhouette', 'image'] },
            ],
          },
        },
        ...elements,
      ],
    },
  };
}

/** The commands of overlays and levels of detail (ADR 0055), done and refused. */
function overlayCommands(): [string, Command][] {
  const tier = {
    id: 'tier',
    name: 'Tier',
    of: 'elements',
    attribute: 'tier',
    channel: 'fill',
    mapping: {
      kind: 'discrete',
      cases: [
        { value: 'gold', color: '#FFFF00' },
        { value: 'silver', color: '#FFFF66' },
      ],
    },
  };
  const set = (name: string, overlay: unknown): [string, unknown] => [
    name,
    { type: 'set-overlays', view: VIEW, overlays: [overlay] },
  ];
  const service = (name: string, appearanceTraits: unknown): [string, unknown] => [
    name,
    { type: 'set-component-appearance', component: 'systems.service', appearanceTraits },
  ];
  return malformed([
    set('set overlays', tier),
    [
      'add an overlay',
      {
        type: 'add-overlay',
        view: VIEW,
        overlay: {
          ...tier,
          id: 'size',
          channel: 'size',
          mapping: {
            kind: 'continuous',
            stops: [
              { at: 0, size: 0.5 },
              { at: 1, size: 2 },
            ],
          },
        },
      },
    ],
    [
      'turn an overlay off',
      { type: 'update-overlay', view: VIEW, overlay: 'tier', changes: { off: true } },
    ],
    [
      'turn an overlay on',
      { type: 'update-overlay', view: VIEW, overlay: 'tier', changes: { off: false } },
    ],
    [
      'edit an overlay',
      { type: 'update-overlay', view: VIEW, overlay: 'tier', changes: { name: 'Level' } },
    ],
    [
      'change no overlay part',
      { type: 'update-overlay', view: VIEW, overlay: 'tier', changes: { id: 'x' } },
    ],
    [
      'changes not an object',
      { type: 'update-overlay', view: VIEW, overlay: 'tier', changes: 'off' },
    ],
    ['move an overlay', { type: 'move-overlay', view: VIEW, overlay: 'tier' }],
    ['move before itself', { type: 'move-overlay', view: VIEW, overlay: 'tier', before: 'tier' }],
    ['remove an overlay', { type: 'remove-overlays', view: VIEW, overlays: ['size'] }],
    ['remove no overlays', { type: 'remove-overlays', view: VIEW, overlays: [] }],
    ['remove twice', { type: 'remove-overlays', view: VIEW, overlays: ['tier', 'tier'] }],
    ['unknown overlay', { type: 'remove-overlays', view: VIEW, overlays: ['gone'] }],
    ['add a taken overlay', { type: 'add-overlay', view: VIEW, overlay: tier }],
    [
      'too many overlays',
      {
        type: 'set-overlays',
        view: VIEW,
        overlays: Array.from({ length: 17 }, (_, at) => ({ ...tier, id: `t${at}` })),
      },
    ],
    set('overlay not an object', 'fill'),
    set('overlay with more', { ...tier, glow: true }),
    set('overlay without an attribute', { ...tier, attribute: '' }),
    set('overlay without a name', { ...tier, name: '' }),
    set('overlay of views', { ...tier, of: 'views' }),
    set('unknown channel', { ...tier, channel: 'glow' }),
    set('relations filled', { ...tier, of: 'relations' }),
    set('off not a boolean', { ...tier, off: 'yes' }),
    set('unknown mapping', { ...tier, mapping: { kind: 'bands' } }),
    set('ranged badges', { ...tier, channel: 'badge', mapping: { kind: 'continuous', stops: [] } }),
    set('mapping with more', { ...tier, mapping: { kind: 'passthrough', stops: [] } }),
    set('sizes taken as they are', { ...tier, channel: 'size', mapping: { kind: 'passthrough' } }),
    set('no cases', { ...tier, mapping: { kind: 'discrete', cases: [] } }),
    set('case not an object', { ...tier, mapping: { kind: 'discrete', cases: [1] } }),
    set('case with more', {
      ...tier,
      mapping: { kind: 'discrete', cases: [{ value: 'a', color: '#000000', size: 1 }] },
    }),
    set('case value not text', {
      ...tier,
      mapping: { kind: 'discrete', cases: [{ value: null, color: '#000000' }] },
    }),
    set('case twice', {
      ...tier,
      mapping: {
        kind: 'discrete',
        cases: [
          { value: 'a', color: '#000000' },
          { value: 'A', color: '#000000' },
        ],
      },
    }),
    set('one stop', {
      ...tier,
      mapping: { kind: 'continuous', stops: [{ at: 0, color: '#000000' }] },
    }),
    set('stop not an object', { ...tier, mapping: { kind: 'continuous', stops: [1, 2] } }),
    set('stop with more', {
      ...tier,
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 0, color: '#000000', text: 'x' },
          { at: 1, color: '#000000' },
        ],
      },
    }),
    set('stop not at a number', {
      ...tier,
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 'low', color: '#000000' },
          { at: 1, color: '#000000' },
        ],
      },
    }),
    set('stops down', {
      ...tier,
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 2, color: '#000000' },
          { at: 1, color: '#000000' },
        ],
      },
    }),
    set('not a color', {
      ...tier,
      mapping: { kind: 'discrete', cases: [{ value: 'a', color: 'gold' }] },
    }),
    set('size too large', {
      ...tier,
      channel: 'size',
      mapping: { kind: 'discrete', cases: [{ value: 'a', size: 3 }] },
    }),
    set('opacity zero', {
      ...tier,
      channel: 'opacity',
      mapping: { kind: 'discrete', cases: [{ value: 'a', opacity: 0 }] },
    }),
    set('badge too long', {
      ...tier,
      channel: 'badge',
      mapping: { kind: 'discrete', cases: [{ value: 'a', text: 'a badge far too long' }] },
    }),
    set('legend label empty', {
      ...tier,
      mapping: { kind: 'discrete', cases: [{ value: 'a', color: '#000000', label: '' }] },
    }),
    set('relations read nothing', {
      ...tier,
      of: 'relations',
      channel: 'stroke',
      attribute: 'rate',
    }),
    service('levels', {
      levels: [
        { from: 0.9, shows: ['name', 'detail'] },
        { from: 0.3, shows: ['name'] },
      ],
      expandFrom: 2,
    }),
    service('levels not a list', { levels: 'near' }),
    service('too many levels', {
      levels: Array.from({ length: 9 }, (_, at) => ({ from: at / 4, shows: ['name'] })),
    }),
    service('level not an object', { levels: [1] }),
    service('level with more', { levels: [{ from: 1, shows: ['name'], to: 2 }] }),
    service('level far out', { levels: [{ from: 9, shows: ['name'] }] }),
    service('levels at one scale', {
      levels: [
        { from: 1, shows: ['name'] },
        { from: 1, shows: ['image'] },
      ],
    }),
    service('level shows nothing', { levels: [{ from: 1, shows: [] }] }),
    service('level shows a part twice', { levels: [{ from: 1, shows: ['name', 'name'] }] }),
    service('silhouette with more', { levels: [{ from: 1, shows: ['silhouette', 'name'] }] }),
    service('expands from nothing', { expandFrom: 0 }),
  ]);
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
  // What overlays and levels break as a project opens, and what a legend warns about (ADR 0055).
  const overlaid = overlaidSample();
  const check = checkProject(overlaid);
  for (const problem of [...check.errors, ...check.warnings]) {
    said.push({ command: 'check overlays', message: problem.message });
  }
  for (const theme of ['light', 'dark'] as const) {
    const view = overlaid.views[0] as ViewFile;
    for (const part of legendOf(view, definitionsIn(overlaid), theme).overlays) {
      for (const warning of part.warnings) said.push({ command: 'legend', message: warning });
    }
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
    'No project is open here yet: choose how to start one first.',
    'The project here is being started already.',
    'There is no sample "my-systems" to start from.',
    'C:/Users/ana/My projects/shop already holds files, or is no folder; a new project starts in an empty folder.',
    'The new project could not be written in /home/ana/shop: EACCES',
    'A project is open here already.',
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

describe('what imports say, in Spanish', () => {
  const said = importMessages();

  it('says each thing a reader can say', () => {
    expect(said.length).toBeGreaterThan(60);
  });

  it('has a Spanish template for every refusal, reason and label', () => {
    const missing = [...new Set(said.map(({ message }) => message))].flatMap((message) =>
      untranslatedParts('es', message),
    );
    expect([...new Set(missing)]).toEqual([]);
  });

  it('keeps the file’s name as written', () => {
    expect(translateMessage('es', 'Import "checkout.mmd"')).toBe('Importar "checkout.mmd"');
  });
});

describe('the Structurizr, LikeC4 and draw.io readers’ messages in Spanish', () => {
  const said = readerMessages();

  it('says what each hostile file is made to say', () => {
    expect(said.length).toBeGreaterThan(80);
  });

  it('has a Spanish template for every refusal and for why each thing matched nothing', () => {
    expect(said.flatMap((message) => untranslatedParts('es', message))).toEqual([]);
  });

  it('keeps what the file wrote as it wrote it', () => {
    expect(translateMessage('es', 'It ends on "ghost", which the page does not hold.')).toBe(
      'Termina en "ghost", que la página no tiene.',
    );
    expect(
      translateMessage(
        'es',
        `The workspace's "model.people[0].name" is not what Structurizr writes.`,
      ),
    ).toBe('El "model.people[0].name" del espacio de trabajo no es lo que escribe Structurizr.');
  });
});
