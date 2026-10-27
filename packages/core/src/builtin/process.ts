/**
 * The built-in "Processes and state machines" package (P1, ADR 0079): pools and lanes, events, tasks,
 * subprocesses, gateways, data objects and data stores, drawn in the style of BPMN, and the states,
 * initial and final states and choices of state machines. It is named for what it describes: BPMN and
 * UML are marks of the Object Management Group, and the package only draws in their style.
 *
 * Its symbols (events, gateways, data, and the initial and final states and choices of state
 * machines) are drawn by free geometry of their own (ADR 0066), drawn for Visual Anything and CC0-1.0,
 * which no kind draws. They keep their proportions and write their name beside them, under or over
 * the symbol, in a label area of their box; relations attach on the symbol's middle line and on the
 * side the name leaves free. Free geometry has one stroke, the canvas's, so a thick ring, a double
 * ring, a dot or a mark is drawn as contours set closer than that stroke is wide: the stroke covers
 * the thin holes between them. Its boxes and containers (pools, lanes, tasks, subprocesses and
 * states) are drawn by the kinds, whose corners keep their size however far a container stretches.
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type {
  AttributeDefinition,
  ConnectionPoint,
  EllipseContour,
  GeometryLabel,
  PackageFile,
  SvgImage,
} from '@visual-anything/schema';
import { OWN_CREDITS, OWN_LICENSE, OWN_SOURCE } from './credits';

/** An icon of this package, drawn for Visual Anything, in the cleaned SVG text given. */
function icon(id: string, name: string, svg: string): SvgImage {
  return {
    kind: 'svg',
    id,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width: 24,
    height: 24,
    svg,
  };
}

/**
 * The icons of the triggers an event can have, but none: each in one grey that reads on every event's
 * fill and on the canvas, in both themes, since an icon is written beside the name, under the symbol.
 * No appearance chooses its image by an attribute's value, so an element shows its trigger's icon
 * through an appearance of its own.
 */
export const TRIGGER_ICONS = {
  /** An envelope. */
  message: icon(
    'process.message-icon',
    'Message',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="14" rx="2" stroke="#6B7A8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="5"/><path d="M3 7l9 6 9-6" fill="none" stroke="#6B7A8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
  /** A clock face. */
  timer: icon(
    'process.timer-icon',
    'Timer',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="9" stroke="#6B7A8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M12 7v5l3 3" fill="none" stroke="#6B7A8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
  /** A triangle, as a signal is drawn. */
  signal: icon(
    'process.signal-icon',
    'Signal',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5l9 16.5H3z" fill="none" stroke="#6B7A8C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
} as const;

/** Concentric circles about one centre, outermost first. */
function circles(cx: number, cy: number, radii: readonly number[]): EllipseContour[] {
  return radii.map((r) => ({ kind: 'ellipse', cx, cy, rx: r, ry: r }));
}

/** The box of a symbol: 96 tall, the symbol's middle at 24 from its top or bottom. */
const SYMBOL_HEIGHT = 96;

/** Where a symbol 160 wide writes its name, under it. */
const LABEL_BELOW: GeometryLabel = { x: 0, y: 48, width: 160, height: 48 };
/** Where a symbol 160 wide writes its name, over it, so that its paths leave from below. */
const LABEL_ABOVE: GeometryLabel = { x: 0, y: 0, width: 160, height: 48 };
/** The same, for the pseudostates of state machines, 128 wide. */
const NARROW_LABEL_BELOW: GeometryLabel = { x: 0, y: 48, width: 128, height: 48 };
const NARROW_LABEL_ABOVE: GeometryLabel = { x: 0, y: 0, width: 128, height: 48 };

/** Where relations attach to a symbol whose name is under it: its middle line, and its top. */
const POINTS_NAME_BELOW: ConnectionPoint[] = [
  { name: 'left', side: 'left', at: 0.25 },
  { name: 'right', side: 'right', at: 0.25 },
  { name: 'top', side: 'top', at: 0.5 },
];
/** Where relations attach to a symbol whose name is over it: its middle line, and its bottom. */
const POINTS_NAME_ABOVE: ConnectionPoint[] = [
  { name: 'left', side: 'left', at: 0.75 },
  { name: 'right', side: 'right', at: 0.75 },
  { name: 'bottom', side: 'bottom', at: 0.5 },
];

/** The diamond of a gateway, its middle at (80, 72). */
const GATEWAY_DIAMOND = { kind: 'polygon', points: '80,49 103,72 80,95 57,72' } as const;

const TRIGGER: AttributeDefinition = {
  name: 'trigger',
  type: 'string',
  description:
    'What sets it off: "none", "message", "timer" or "signal". The package’s icons show it, set as the element’s own image.',
  choices: ['none', 'message', 'timer', 'signal'],
};

/** The appearance of an event: a circle drawn by `outline`, its name under it. */
function event(fill: string, stroke: string, outline: EllipseContour[]) {
  return {
    fill,
    stroke,
    width: 160,
    height: SYMBOL_HEIGHT,
    detail: { attributes: ['trigger'] },
    connectionPoints: POINTS_NAME_BELOW,
    geometry: {
      width: 160,
      height: SYMBOL_HEIGHT,
      keepProportions: true,
      outline,
      label: LABEL_BELOW,
    },
  };
}

/** The appearance of a gateway: its diamond with a mark cut out of it, its name over it. */
function gateway(mark: readonly ({ kind: 'polygon'; points: string } | EllipseContour)[]) {
  return {
    fill: '#FFF6D6',
    stroke: '#7A5A00',
    width: 160,
    height: SYMBOL_HEIGHT,
    connectionPoints: POINTS_NAME_ABOVE,
    geometry: {
      width: 160,
      height: SYMBOL_HEIGHT,
      keepProportions: true,
      outline: [GATEWAY_DIAMOND, ...mark],
      label: LABEL_ABOVE,
    },
  };
}

/** The events and activities that sequence flows connect. */
const FLOW_NODES = [
  'process.task',
  'process.subprocess',
  'process.exclusive-gateway',
  'process.parallel-gateway',
  'process.inclusive-gateway',
];

export const PROCESS: PackageFile = {
  id: 'process',
  name: 'Processes and state machines',
  description:
    'Pools and lanes, events, tasks, subprocesses, gateways, data objects and data stores, in the style of BPMN, and the states, choices and transitions of state machines.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'process.pool',
      name: 'Pool',
      derivesFrom: 'essence',
      description:
        'A participant in a process, such as a company, a department or a customer, holding the lanes and the work it does.',
      appearance: {
        shape: 'rectangle',
        fill: '#F3F5F7',
        stroke: '#4A5A6A',
        width: 640,
        height: 240,
      },
    },
    {
      id: 'process.lane',
      name: 'Lane',
      derivesFrom: 'essence',
      description: 'A part of a pool, such as a role or a team, holding the work it does.',
      appearance: {
        shape: 'rectangle',
        fill: '#FAFBFC',
        stroke: '#5B6878',
        width: 592,
        height: 176,
      },
    },
    {
      id: 'process.start-event',
      name: 'Start event',
      derivesFrom: 'essence',
      description:
        'Where a process starts, such as an order that arrives or a timer that goes off; drawn as a thin circle.',
      attributes: [TRIGGER],
      appearance: event('#DDF3E6', '#1B6B3F', circles(80, 24, [22])),
    },
    {
      id: 'process.end-event',
      name: 'End event',
      derivesFrom: 'essence',
      description:
        'Where a path of a process ends, perhaps sending a message as it does; drawn as a thick circle.',
      attributes: [TRIGGER],
      appearance: event('#FBE3E1', '#A23B2E', circles(80, 24, [22, 21, 20])),
    },
    {
      id: 'process.intermediate-event',
      name: 'Intermediate event',
      derivesFrom: 'essence',
      description:
        'Something that happens while a process runs, which it waits for or sends, such as a message or a deadline; drawn as a double circle.',
      attributes: [TRIGGER],
      appearance: event('#FFF0D4', '#865400', circles(80, 24, [22, 18.5, 18])),
    },
    {
      id: 'process.task',
      name: 'Task',
      derivesFrom: 'essence',
      description: 'A piece of work, done by a person, by software, or by hand.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          description:
            'Who does it: "user", a person with software; "service", software alone; "manual", a person without software.',
          choices: ['user', 'service', 'manual'],
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#E3EEFB',
        stroke: '#1C5DA6',
        width: 160,
        height: 80,
        detail: { attributes: ['kind'] },
      },
    },
    {
      id: 'process.subprocess',
      name: 'Subprocess',
      derivesFrom: 'essence',
      description:
        'A part of a process that holds events, tasks and gateways of its own, shown inside it or collapsed.',
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EFF5FD',
        stroke: '#2F6DB5',
        width: 320,
        height: 192,
      },
    },
    {
      id: 'process.exclusive-gateway',
      name: 'Exclusive gateway',
      derivesFrom: 'essence',
      description:
        'Where a process takes exactly one of the paths that leave it, by their conditions; drawn as a diamond with an X.',
      appearance: gateway([
        {
          kind: 'polygon',
          points:
            '80,70.94 87.47,63.47 88.53,64.53 81.06,72 88.53,79.47 87.47,80.53 80,73.06 72.53,80.53 71.47,79.47 78.94,72 71.47,64.53 72.53,63.47',
        },
      ]),
    },
    {
      id: 'process.parallel-gateway',
      name: 'Parallel gateway',
      derivesFrom: 'essence',
      description:
        'Where a process splits into paths that all run, or waits for all of them to join; drawn as a diamond with a plus.',
      appearance: gateway([
        {
          kind: 'polygon',
          points:
            '79.25,62 80.75,62 80.75,71.25 90,71.25 90,72.75 80.75,72.75 80.75,82 79.25,82 79.25,72.75 70,72.75 70,71.25 79.25,71.25',
        },
      ]),
    },
    {
      id: 'process.inclusive-gateway',
      name: 'Inclusive gateway',
      derivesFrom: 'essence',
      description:
        'Where a process takes one or more of the paths that leave it, by their conditions; drawn as a diamond with a circle.',
      appearance: gateway(circles(80, 72, [10, 8.5])),
    },
    {
      id: 'process.data-object',
      name: 'Data object',
      derivesFrom: 'essence',
      description:
        'Information a process reads or produces, such as an order or an invoice; drawn as a page with a folded corner.',
      appearance: {
        fill: '#F1ECFB',
        stroke: '#5A3A9C',
        width: 160,
        height: SYMBOL_HEIGHT,
        connectionPoints: POINTS_NAME_BELOW,
        geometry: {
          width: 160,
          height: SYMBOL_HEIGHT,
          keepProportions: true,
          outline: [
            { kind: 'polygon', points: '62,2 88,2 98,12 98,46 62,46' },
            { kind: 'polygon', points: '88.75,3.5 88.75,11.25 96.5,11.25' },
          ],
          label: LABEL_BELOW,
        },
      },
    },
    {
      id: 'process.data-store',
      name: 'Data store',
      derivesFrom: 'essence',
      description:
        'Where a process keeps information that outlasts it, such as a database; drawn as a cylinder with bands.',
      appearance: {
        fill: '#EBE4FB',
        stroke: '#5A3A9C',
        width: 160,
        height: SYMBOL_HEIGHT,
        connectionPoints: POINTS_NAME_BELOW,
        geometry: {
          width: 160,
          height: SYMBOL_HEIGHT,
          keepProportions: true,
          outline: [
            { kind: 'path', d: 'M56 9A24 7 0 0 1 104 9V39A24 7 0 0 1 56 39Z' },
            { kind: 'path', d: 'M57 10A23 7 0 0 0 103 10A23 7.75 0 0 1 57 10Z' },
            { kind: 'path', d: 'M57 15A23 7 0 0 0 103 15A23 7.75 0 0 1 57 15Z' },
            { kind: 'path', d: 'M57 20A23 7 0 0 0 103 20A23 7.75 0 0 1 57 20Z' },
          ],
          label: LABEL_BELOW,
        },
      },
    },
    {
      id: 'process.state',
      name: 'State',
      derivesFrom: 'essence',
      description:
        'A condition something can be in for a while, such as "Paid" or "Shipped"; it can hold states of its own.',
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DDF2F0',
        stroke: '#0D6B60',
        width: 160,
        height: 80,
      },
    },
    {
      id: 'process.initial-state',
      name: 'Initial state',
      derivesFrom: 'essence',
      description: 'Where a state machine, or a state that holds states, starts; drawn as a dot.',
      appearance: {
        fill: '#F3F5F7',
        stroke: '#1F2933',
        width: 128,
        height: SYMBOL_HEIGHT,
        connectionPoints: POINTS_NAME_BELOW,
        geometry: {
          width: 128,
          height: SYMBOL_HEIGHT,
          keepProportions: true,
          outline: circles(64, 24, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5]),
          label: NARROW_LABEL_BELOW,
        },
      },
    },
    {
      id: 'process.final-state',
      name: 'Final state',
      derivesFrom: 'essence',
      description: 'Where a state machine ends; drawn as a dot in a ring.',
      appearance: {
        fill: '#F3F5F7',
        stroke: '#1F2933',
        width: 128,
        height: SYMBOL_HEIGHT,
        connectionPoints: POINTS_NAME_BELOW,
        geometry: {
          width: 128,
          height: SYMBOL_HEIGHT,
          keepProportions: true,
          outline: circles(64, 24, [14, 8, 7, 6, 5, 4, 3, 2, 1, 0.5]),
          label: NARROW_LABEL_BELOW,
        },
      },
    },
    {
      id: 'process.choice',
      name: 'Choice',
      derivesFrom: 'essence',
      description:
        'Where a transition goes one of several ways, by the guards of the transitions that leave it; drawn as a diamond.',
      appearance: {
        fill: '#DDF2F0',
        stroke: '#0D6B60',
        width: 128,
        height: SYMBOL_HEIGHT,
        connectionPoints: POINTS_NAME_ABOVE,
        geometry: {
          width: 128,
          height: SYMBOL_HEIGHT,
          keepProportions: true,
          outline: [{ kind: 'polygon', points: '64,50 86,72 64,94 42,72' }],
          label: NARROW_LABEL_ABOVE,
        },
      },
    },
  ],
  relationTypes: [
    {
      id: 'process.sequence-flow',
      name: 'sequence flow',
      derivesFrom: 'relates-to',
      description: 'The order of the work: what happens next in a process.',
      direction: 'directed',
      attributes: [
        {
          name: 'condition',
          type: 'string',
          description:
            'When it is taken, after a gateway, as text such as "every item in stock"; it is never run.',
        },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
      limits: {
        from: ['process.start-event', 'process.intermediate-event', ...FLOW_NODES],
        to: ['process.intermediate-event', 'process.end-event', ...FLOW_NODES],
      },
    },
    {
      id: 'process.message-flow',
      name: 'message flow',
      derivesFrom: 'relates-to',
      description: 'A message one participant sends another, from pool to pool.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 2, dash: 'dashed' },
      limits: {
        from: [
          'process.pool',
          'process.task',
          'process.subprocess',
          'process.intermediate-event',
          'process.end-event',
        ],
        to: [
          'process.pool',
          'process.task',
          'process.subprocess',
          'process.start-event',
          'process.intermediate-event',
        ],
      },
    },
    {
      id: 'process.association',
      name: 'association',
      derivesFrom: 'relates-to',
      description: 'Ties a data object or a data store to the work that reads or writes it.',
      direction: 'undirected',
      appearance: { stroke: '#64748B', width: 2, dash: 'dotted' },
    },
    {
      id: 'process.transition',
      name: 'transition',
      derivesFrom: 'relates-to',
      description:
        'A change from one state to another, when its trigger happens and its guard holds, doing its effect.',
      direction: 'directed',
      attributes: [
        {
          name: 'trigger',
          type: 'string',
          description: 'What makes it happen, such as "payment received".',
        },
        {
          name: 'guard',
          type: 'string',
          description:
            'What must hold for it to happen, as text such as "stock > 0"; it is never run.',
        },
        {
          name: 'effect',
          type: 'string',
          description:
            'What it does as it happens, as text such as "send the receipt"; it is never run.',
        },
      ],
      appearance: { stroke: '#3D4651', width: 2 },
      limits: {
        from: ['process.state', 'process.initial-state', 'process.choice'],
        to: ['process.state', 'process.final-state', 'process.choice'],
      },
    },
    {
      id: 'process.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description:
        'Places a lane in its pool, work in its lane or its subprocess, or a state in the state that holds it.',
      direction: 'directed',
      nests: true,
      limits: {
        to: ['process.pool', 'process.lane', 'process.subprocess', 'process.state'],
      },
    },
  ],
  images: [TRIGGER_ICONS.message, TRIGGER_ICONS.timer, TRIGGER_ICONS.signal],
};
