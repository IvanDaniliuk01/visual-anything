/**
 * The view state: one typed value for where someone is in a project and how they read it there: the
 * view, the camera, the selection, the filters, focus mode, and the scenario and step being played.
 * A view address carries it in the fragment of the app's address,
 * `#view=…&camera=…&select=…&filters=…&focus=…&scenario=…&step=…`, so that a reload, a copied
 * address and a launch address made by the command line all open the project there (ADR-0030's
 * addendum of 2026-10-25). Tours, comments and the read-only page are to reuse the same value.
 *
 * Everything here is pure. Reading an address refuses anything malformed with a message that says
 * what, and never throws; writing one and reading it back gives exactly the same value. Ids are kept
 * as ids, so an address survives renames. The fragment never carries the session token: reading
 * leaves out the launch code, the theme and a token, which belong to the local program's launch
 * (ADR-0030), and writing never writes them.
 *
 * How the parts are written, once the address's own percent-encoding is taken off:
 * - `view=<id>`: the view; every view state names one.
 * - `camera=<x>,<y>,<zoom>`: the point of the view at the middle of the canvas, in canvas units, and
 *   the zoom, so that the same address shows the same place whatever the window's size.
 * - `select=<id>,<id>…`: elements, relations and free shapes.
 * - `filters=components:<ids>;relation-types:<ids>;where:<of>,<attribute>,<test>[,<value>]…;range:…`:
 *   what the filters hide (ADR-0025); an attribute and a value are percent-encoded once more, so that
 *   they can hold the separators. The time range, last, is
 *   `range:<of>,<attribute>,<kind>,<from>,<to>[,<until>]`: what it is on, its attribute, how its
 *   values read, its ends on that axis as numbers, and the attribute its periods end at, if any
 *   (ADR 0025's clarification of W37, ADR 0044's of W44). An address without it reads as before.
 * - `focus=<degrees>,<direction>[,isolate][;from:<ids>]`: focus mode; without `from` it starts from
 *   the selection.
 * - `scenario=<id>&step=<id>`: the scenario open and the step it is on, by the step's id, so that an
 *   address survives steps added before it.
 * - `choices=<decision>:<alternative>,…`: the alternative chosen at each of that scenario's decisions,
 *   by their ids, in the order of the decisions' ids, so that the same choices write the same address
 *   (ADR 0078); a decision it does not name plays its default.
 * - `space=root:<id>;camera:<x>,<y>,<z>,<azimuth>,<elevation>,<distance>;cut:<axis>,<at>,<keep>;
 *   explode:<factor>;relations;names`: the physical-space panel, open (ADR 0076), each clause only
 *   when it says something, in that order; `space=open` when none does. An address without it reads
 *   as before, with the panel closed.
 */
import type { DecisionChoices, Id, SavedSpace, ScenarioFile } from '@visual-anything/schema';
import { ESSENCE, RELATES_TO } from './builtin';
import { isId } from './ids';
import {
  FILTER_TESTS,
  FOCUS_DIRECTIONS,
  LAUNCH_PARAM,
  MAX_FILTER_CONDITIONS,
  MAX_FILTER_TEXT,
  MAX_FOCUS_DEGREES,
  MAX_GUIDANCE_TARGETS,
  THEME_PARAM,
  TOKEN_PARAM,
  type GuidedCondition,
  type GuidedFilters,
  type GuidedFocus,
} from './protocol';
import { DECISION_CAPS, knownChoices, playedSteps } from './scenarios/blocks';
import { MAX_SPACE_DISTANCE, readSpaceCamera } from './space/camera';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import { RANGE_ENDS, checkTimeRange, type ViewTimeRange } from './time-range';

/** Where the canvas looks: the point of the view at its middle, in canvas units, and the zoom. */
export interface ViewCamera {
  x: number;
  y: number;
  /** How large one canvas unit shows, in screen pixels. */
  zoom: number;
}

// A time range of the filters, which Claude's guidance carries too, is checked where it is defined.
export type { ViewTimeRange } from './time-range';

/** What the filters hide (ADR-0025), in lists, as Claude's guidance carries them, and a time range. */
export interface ViewFilters extends GuidedFilters {
  /** The time range what stays shown must meet; absent, none. */
  range?: ViewTimeRange;
}

/** Focus mode: how far it reaches, which way, whether it isolates, and what it starts from. */
export interface ViewFocus extends GuidedFocus {
  /** The elements and relations it starts from; absent, it starts from the selection. */
  from?: Id[];
}

/** Where someone is in a project, and how they read it there. */
export interface ViewState {
  /** The view open on the canvas. */
  view: Id;
  /** Where the canvas looks; absent, the app shows the selection, or else the whole view. */
  camera?: ViewCamera;
  /** What is selected: elements, relations and free shapes, by id; absent, nothing. */
  select?: Id[];
  /** What the filters hide; absent, nothing. Filters that hide nothing are left out. */
  filters?: ViewFilters;
  /** Focus mode; absent, it is off. */
  focus?: ViewFocus;
  /** The scenario open in the scenario panel, which plays over this view. */
  scenario?: Id;
  /** The step of the scenario playback is on, by its id; it needs `scenario`. */
  step?: Id;
  /**
   * The alternative chosen at each decision of that scenario, by the decision's id (ADR 0078); it
   * needs `scenario`. A decision it does not name plays its default; absent, every one does.
   */
  choices?: DecisionChoices;
  /** The physical-space panel, open beside the canvas (ADR 0076); absent, it is closed. */
  space?: ViewSpace;
}

/**
 * The physical-space panel in a view state (ADR 0076): its root, where it looks and how it reads.
 * What says nothing is left out: no explosion, and relations and names off.
 */
export type ViewSpace = SavedSpace;

/** How far from the root's origin the panel's camera may look and cut, in meters, either way. */
export { MAX_SPACE_DISTANCE };

/** The parts of a view state, in the order an address writes them. */
export const VIEW_STATE_KEYS = [
  'view',
  'camera',
  'select',
  'filters',
  'focus',
  'scenario',
  'step',
  'choices',
  'space',
] as const satisfies readonly (keyof ViewState)[];

/** The most alternatives a view state chooses: as many as a scenario has decisions. */
export const MAX_VIEW_STATE_CHOICES = DECISION_CAPS.blocks;

/** The most ids a view state names in its selection, and in what focus starts from. */
export const MAX_VIEW_STATE_IDS = MAX_GUIDANCE_TARGETS;

/** How far from the origin the camera may look, in canvas units, either way. */
export const MAX_CAMERA_DISTANCE = 1_000_000_000;

/** How far the camera may zoom out and in. */
export const MIN_CAMERA_ZOOM = 0.001;
export const MAX_CAMERA_ZOOM = 1000;

/** The longest fragment read for a view state, in UTF-16 code units. */
export const MAX_VIEW_STATE_ADDRESS = 512 * 1024;

/** The fragment's parts that belong to the local program's launch (ADR-0030), not to a view state. */
const LAUNCH_KEYS: ReadonlySet<string> = new Set([LAUNCH_PARAM, THEME_PARAM, TOKEN_PARAM]);

/** A view state read from an address: none when it holds none, or why it could not be read. */
export type ViewStateRead =
  { ok: true; state: ViewState | undefined } | { ok: false; message: string };

/** A view state checked: the value as the address holds it, or why it is not one. */
export type ViewStateCheck = { ok: true; state: ViewState } | { ok: false; message: string };

/** Raised inside this module for what is malformed; never leaves it. */
class Malformed extends Error {}

function refuse(message: string): never {
  throw new Malformed(message);
}

// ——— Reading an address ———

/**
 * Reads the view state an address's fragment holds, with or without its `#`. Its launch code, theme
 * and any token are left out; with nothing else, it holds no view state. Anything else malformed is
 * refused, with a message that says what.
 */
export function readViewState(fragment: string): ViewStateRead {
  try {
    return { ok: true, state: parseFragment(fragment) };
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, message: error.message };
    throw error;
  }
}

function parseFragment(fragment: string): ViewState | undefined {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text.length > MAX_VIEW_STATE_ADDRESS) {
    refuse('The address is too long to hold a view state.');
  }
  const parts = new Map<string, string>();
  for (const part of text.split('&')) {
    if (part === '') continue;
    const at = part.indexOf('=');
    const key = decodeAddress(at < 0 ? part : part.slice(0, at));
    if (LAUNCH_KEYS.has(key)) continue;
    if (!isViewStateKey(key)) {
      refuse(`The address holds "${shortened(key)}", which a view state does not have.`);
    }
    if (parts.has(key)) refuse(`The address holds "${key}" twice.`);
    const value = at < 0 ? '' : decodeAddress(part.slice(at + 1));
    if (value === '') refuse(`The address holds "${key}" with no value.`);
    parts.set(key, value);
  }
  if (parts.size === 0) return undefined;
  const view = parts.get('view');
  const camera = parts.get('camera');
  const select = parts.get('select');
  const filters = parts.get('filters');
  const focus = parts.get('focus');
  const scenario = parts.get('scenario');
  const step = parts.get('step');
  const choices = parts.get('choices');
  const space = parts.get('space');
  return checked({
    ...(view === undefined ? {} : { view }),
    ...(camera === undefined ? {} : { camera: parseCamera(camera) }),
    ...(select === undefined ? {} : { select: select.split(',') }),
    ...(filters === undefined ? {} : { filters: parseFilters(filters) }),
    ...(focus === undefined ? {} : { focus: parseFocus(focus) }),
    ...(scenario === undefined ? {} : { scenario }),
    ...(step === undefined ? {} : { step }),
    ...(choices === undefined ? {} : { choices: parseChoices(choices) }),
    ...(space === undefined ? {} : { space: parseSpace(space) }),
  });
}

function isViewStateKey(key: string): key is (typeof VIEW_STATE_KEYS)[number] {
  return (VIEW_STATE_KEYS as readonly string[]).includes(key);
}

/** A number as an address writes it: digits, maybe a fraction, maybe a negative exponent. */
const NUMBER = /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/;

const CAMERA_FORM = 'The camera is three numbers: x,y,zoom.';

function parseCamera(text: string): ViewCamera {
  const numbers = text.split(',');
  if (numbers.length !== 3 || !numbers.every((each) => NUMBER.test(each))) refuse(CAMERA_FORM);
  const [x, y, zoom] = numbers.map(Number) as [number, number, number];
  return { x, y, zoom };
}

const FILTER_CLAUSES = 'Filters hold components, relation-types, where and range';

function parseFilters(text: string): ViewFilters {
  let components: string[] | undefined;
  let relationTypes: string[] | undefined;
  let range: ViewTimeRange | undefined;
  const conditions: GuidedCondition[] = [];
  for (const clause of text.split(';')) {
    const at = clause.indexOf(':');
    const name = at < 0 ? clause : clause.slice(0, at);
    const rest = at < 0 ? '' : clause.slice(at + 1);
    switch (name) {
      case 'components':
        if (components !== undefined) refuse('The filters hold "components" twice.');
        components = rest.split(',');
        break;
      case 'relation-types':
        if (relationTypes !== undefined) refuse('The filters hold "relation-types" twice.');
        relationTypes = rest.split(',');
        break;
      case 'where':
        if (conditions.length === MAX_FILTER_CONDITIONS) {
          refuse(`Filters hold at most ${MAX_FILTER_CONDITIONS} conditions.`);
        }
        conditions.push(parseCondition(rest));
        break;
      case 'range':
        if (range !== undefined) refuse('The filters hold "range" twice.');
        range = parseRange(rest);
        break;
      default:
        refuse(`${FILTER_CLAUSES}, not "${shortened(name)}".`);
    }
  }
  return {
    components: components ?? [],
    relationTypes: relationTypes ?? [],
    conditions,
    ...(range === undefined ? {} : { range }),
  };
}

const RANGE_FORM =
  'A time range is range:<of>,<attribute>,<kind>,<from>,<to>, then the attribute its periods end at, if it is on periods.';

function parseRange(text: string): ViewTimeRange {
  const items = text.split(',');
  if (items.length < 5 || items.length > 6) refuse(RANGE_FORM);
  const [of, attribute, kind, from, to, until] = items as [
    string,
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  if (!NUMBER.test(from) || !NUMBER.test(to)) refuse(RANGE_ENDS);
  return checkRange({
    of,
    attribute: decodeText(attribute),
    ...(until === undefined ? {} : { until: decodeText(until) }),
    kind,
    from: Number(from),
    to: Number(to),
  });
}

const CONDITION_FORM =
  'A condition is where:<of>,<attribute>,<test>, then its value if it takes one.';

function parseCondition(text: string): GuidedCondition {
  const items = text.split(',');
  if (items.length < 3 || items.length > 4) refuse(CONDITION_FORM);
  const [of, attribute, test, value] = items as [string, string, string, string | undefined];
  const raw = {
    of,
    attribute: decodeText(attribute),
    test,
    ...(value === undefined ? {} : { value: decodeText(value) }),
  };
  if (value === undefined && test !== 'set' && test !== 'unset') {
    return checkCondition({ ...raw, value: '' });
  }
  if (value !== undefined && (test === 'set' || test === 'unset')) {
    refuse(`A condition that tests with "${test}" takes no value.`);
  }
  return checkCondition({ ...raw, value: raw.value ?? '' });
}

const CHOICES_FORM = 'Choices are <decision>:<alternative>, separated by commas.';

/** The choices an address writes, as checking takes them as a value, each decision named once. */
function parseChoices(text: string): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const pair of text.split(',')) {
    const items = pair.split(':');
    if (items.length !== 2) refuse(CHOICES_FORM);
    const [decision, alternative] = items as [string, string];
    if (Object.hasOwn(choices, decision)) {
      refuse(`The choices name the decision "${shortened(decision)}" twice.`);
    }
    choices[decision] = alternative;
  }
  return choices;
}

const SPACE_CLAUSES =
  'The physical-space panel holds root, camera, cut, explode, relations and names, or is open alone';

const SPACE_CAMERA_FORM =
  'The camera of the physical-space panel is six numbers: x,y,z,azimuth,elevation,distance.';

const SPACE_CUT_FORM = 'A cut is cut:<axis>,<at>,<keep>: x, y or z, a number, and below or above.';

/** The physical-space panel an address writes, as checking takes it as a value. */
function parseSpace(text: string): Record<string, unknown> {
  if (text === 'open') return {};
  const space: Record<string, unknown> = {};
  for (const clause of text.split(';')) {
    const at = clause.indexOf(':');
    const name = at < 0 ? clause : clause.slice(0, at);
    const rest = at < 0 ? undefined : clause.slice(at + 1);
    if (Object.hasOwn(space, name)) refuse(`The physical-space panel holds "${name}" twice.`);
    const numbers = (count: number, form: string): number[] => {
      const items = (rest ?? '').split(',');
      if (items.length !== count || !items.every((each) => NUMBER.test(each))) refuse(form);
      return items.map(Number);
    };
    switch (name) {
      case 'root':
        space.root = rest ?? '';
        break;
      case 'camera': {
        const [x, y, z, azimuth, elevation, distance] = numbers(6, SPACE_CAMERA_FORM);
        space.camera = { target: { x, y, z }, azimuth, elevation, distance };
        break;
      }
      case 'cut': {
        const items = (rest ?? '').split(',');
        if (items.length !== 3 || !NUMBER.test(items[1] ?? '')) refuse(SPACE_CUT_FORM);
        space.cut = { axis: items[0], at: Number(items[1]), keep: items[2] };
        break;
      }
      case 'explode':
        space.explode = numbers(1, 'Explode is one number: explode:<factor>.')[0];
        break;
      case 'relations':
      case 'names':
        if (rest !== undefined) refuse(`"${name}" in the physical-space panel takes no value.`);
        space[name] = true;
        break;
      default:
        refuse(`${SPACE_CLAUSES}, not "${shortened(name)}".`);
    }
  }
  return space;
}

const FOCUS_FORM = 'Focus is degrees,direction, then isolate or nothing.';

function parseFocus(text: string): ViewFocus {
  const [settings = '', ...clauses] = text.split(';');
  const [degrees, direction, ...rest] = settings.split(',');
  if (degrees === undefined || direction === undefined) refuse(FOCUS_FORM);
  if (rest.length > 1 || (rest.length === 1 && rest[0] !== 'isolate')) refuse(FOCUS_FORM);
  let from: string[] | undefined;
  for (const clause of clauses) {
    const at = clause.indexOf(':');
    const name = at < 0 ? clause : clause.slice(0, at);
    if (name !== 'from') refuse(`Focus starts from:<ids>, not "${shortened(name)}".`);
    if (from !== undefined) refuse('The focus holds "from" twice.');
    from = (at < 0 ? '' : clause.slice(at + 1)).split(',');
  }
  return {
    degrees: degrees === 'all' ? 'all' : /^\d+$/.test(degrees) ? Number(degrees) : Number.NaN,
    direction: direction as ViewFocus['direction'],
    isolate: rest.length === 1,
    ...(from === undefined ? {} : { from }),
  };
}

/** Takes off the address's percent-encoding, where `+` is a space as a form writes it. */
function decodeAddress(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll('+', ' '));
  } catch {
    return refuse('The address is not well formed.');
  }
}

/** Takes off the encoding a condition's attribute or value has inside its part. */
function decodeText(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return refuse('The address is not well formed.');
  }
}

/** A text shown in a message, cut short when it is long. */
function shortened(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// ——— Writing an address ———

/**
 * The fragment that holds a view state, without its `#`, its parts in the order `VIEW_STATE_KEYS`
 * names them. It is what `readViewState` reads back as the same value.
 */
export function writeViewState(state: ViewState): string {
  const parts = [`view=${state.view}`];
  const { camera, select, filters, focus, scenario, step, choices, space } = state;
  if (camera) {
    parts.push(
      `camera=${writeNumber(camera.x)},${writeNumber(camera.y)},${writeNumber(camera.zoom)}`,
    );
  }
  if (select) parts.push(`select=${select.join(',')}`);
  if (filters) parts.push(`filters=${writeFilters(filters)}`);
  if (focus) parts.push(`focus=${writeFocus(focus)}`);
  if (scenario !== undefined) parts.push(`scenario=${scenario}`);
  if (step !== undefined) parts.push(`step=${step}`);
  if (choices) {
    const pairs = sortedChoices(Object.entries(choices)).map(
      ([decision, alternative]) => `${decision}:${alternative}`,
    );
    parts.push(`choices=${pairs.join(',')}`);
  }
  if (space) parts.push(`space=${writeSpace(space)}`);
  return parts.join('&');
}

function writeSpace(space: ViewSpace): string {
  const clauses: string[] = [];
  const number = writeRangeEnd;
  if (space.root !== undefined) clauses.push(`root:${space.root}`);
  if (space.camera) {
    const { target, azimuth, elevation, distance } = space.camera;
    const numbers = [target.x, target.y, target.z, azimuth, elevation, distance].map(number);
    clauses.push(`camera:${numbers.join(',')}`);
  }
  if (space.cut) clauses.push(`cut:${space.cut.axis},${number(space.cut.at)},${space.cut.keep}`);
  if (space.explode !== undefined) clauses.push(`explode:${number(space.explode)}`);
  if (space.relations) clauses.push('relations');
  if (space.names) clauses.push('names');
  return clauses.length === 0 ? 'open' : clauses.join(';');
}

/**
 * An address with a view state added to its fragment, after the parts it holds already, such as a
 * launch address's code and theme.
 */
export function withViewState(address: string, state: ViewState): string {
  const written = writeViewState(state);
  const hash = address.indexOf('#');
  if (hash < 0) return `${address}#${written}`;
  return hash === address.length - 1 ? `${address}${written}` : `${address}&${written}`;
}

/** The shortest digits that read back as the same number; a negative zero is written as 0. */
function writeNumber(value: number): string {
  return String(value === 0 ? 0 : value);
}

function writeFilters(filters: ViewFilters): string {
  const clauses: string[] = [];
  if (filters.components.length > 0) clauses.push(`components:${filters.components.join(',')}`);
  if (filters.relationTypes.length > 0) {
    clauses.push(`relation-types:${filters.relationTypes.join(',')}`);
  }
  for (const { of, attribute, test, value } of filters.conditions) {
    const takesValue = test !== 'set' && test !== 'unset';
    clauses.push(
      `where:${of},${writeText(attribute)},${test}${takesValue ? `,${writeText(value)}` : ''}`,
    );
  }
  const { range } = filters;
  if (range) {
    const { of, attribute, until, kind, from, to } = range;
    const ends = `${writeRangeEnd(from)},${writeRangeEnd(to)}`;
    const period = until === undefined ? '' : `,${writeText(until)}`;
    clauses.push(`range:${of},${writeText(attribute)},${kind},${ends}${period}`);
  }
  return clauses.join(';');
}

/**
 * A time range's end: the shortest digits that read back as the same number, a large one's exponent
 * without its "+", which an address would read as a space.
 */
function writeRangeEnd(value: number): string {
  return writeNumber(value).replace('e+', 'e');
}

function writeFocus(focus: ViewFocus): string {
  const settings = `${focus.degrees},${focus.direction}${focus.isolate ? ',isolate' : ''}`;
  return focus.from === undefined ? settings : `${settings};from:${focus.from.join(',')}`;
}

/**
 * A condition's attribute or value, encoded inside its part so that it can hold the separators, then
 * for the address, whose percent-encoding comes off first when it is read.
 */
function writeText(text: string): string {
  return encodeURIComponent(text).replaceAll('%', '%25');
}

// ——— Checking a value ———

/**
 * Checks a view state given as a value, as Claude's tools and the command line give one, and returns
 * it as an address holds it: with nothing but its own parts, and the filters' lists all there.
 */
export function checkViewState(value: unknown): ViewStateCheck {
  try {
    if (!isRecord(value)) refuse('A view state is an object.');
    for (const key of Object.keys(value)) {
      if (!isViewStateKey(key)) refuse(`A view state has no "${shortened(key)}".`);
    }
    return { ok: true, state: checked(value) };
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, message: error.message };
    throw error;
  }
}

/** The view state these parts make, checked part by part; throws `Malformed`. */
function checked(value: Record<string, unknown>): ViewState {
  if (value.view === undefined) refuse('A view state names its view: view=<id>.');
  if (value.step !== undefined && value.scenario === undefined) {
    refuse('A step needs its scenario: scenario=<id>.');
  }
  if (value.choices !== undefined && value.scenario === undefined) {
    refuse('Choices need their scenario: scenario=<id>.');
  }
  const state: ViewState = { view: checkId(value.view) };
  if (value.camera !== undefined) state.camera = checkCamera(value.camera);
  if (value.select !== undefined) {
    if (Array.isArray(value.select) && value.select.length === 0) {
      refuse('A view state that selects nothing leaves select out.');
    }
    state.select = checkIds(value.select, 'select');
  }
  if (value.filters !== undefined) state.filters = checkFilters(value.filters);
  if (value.focus !== undefined) state.focus = checkFocus(value.focus);
  if (value.scenario !== undefined) state.scenario = checkId(value.scenario);
  if (value.step !== undefined) state.step = checkId(value.step);
  if (value.choices !== undefined) state.choices = checkChoices(value.choices);
  if (value.space !== undefined) state.space = checkSpace(value.space);
  return state;
}

const SPACE_KEYS: ReadonlySet<string> = new Set([
  'root',
  'camera',
  'cut',
  'explode',
  'relations',
  'names',
]);

/**
 * The physical-space panel (ADR 0076), with what says nothing left out: an explosion of 0, and
 * relations and names off.
 */
function checkSpace(value: unknown): ViewSpace {
  if (!isRecord(value)) refuse('The physical-space panel is an object.');
  for (const key of Object.keys(value)) {
    if (!SPACE_KEYS.has(key)) refuse(`The physical-space panel has no "${shortened(key)}".`);
  }
  const space: ViewSpace = {};
  if (value.root !== undefined) space.root = checkId(value.root);
  if (value.camera !== undefined) space.camera = checkSpaceCamera(value.camera);
  if (value.cut !== undefined) space.cut = checkSpaceCut(value.cut);
  if (value.explode !== undefined) {
    const explode = within(value.explode, 0, 2);
    if (explode === undefined) refuse('The physical-space panel explodes by a factor from 0 to 2.');
    if (explode > 0) space.explode = explode;
  }
  for (const key of ['relations', 'names'] as const) {
    const on = value[key];
    if (on === undefined) continue;
    if (typeof on !== 'boolean') {
      refuse(
        key === 'relations'
          ? 'Whether the physical-space panel draws relations is true or false.'
          : 'Whether the physical-space panel draws names is true or false.',
      );
    }
    if (on) space[key] = true;
  }
  return space;
}

/** A finite number from `min` to `max`, a negative zero as 0; otherwise `undefined`. */
function within(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return undefined;
  }
  return value === 0 ? 0 : value;
}

function checkSpaceCamera(value: unknown): NonNullable<ViewSpace['camera']> {
  const read = readSpaceCamera(value, SPACE_CAMERA_FORM);
  if (!read.ok) refuse(read.message);
  return read.camera;
}

function checkSpaceCut(value: unknown): NonNullable<ViewSpace['cut']> {
  if (!isRecord(value) || Object.keys(value).length !== 3) refuse(SPACE_CUT_FORM);
  const { axis, keep } = value;
  if (axis !== 'x' && axis !== 'y' && axis !== 'z') refuse(SPACE_CUT_FORM);
  if (keep !== 'below' && keep !== 'above') refuse(SPACE_CUT_FORM);
  const at = within(value.at, -MAX_SPACE_DISTANCE, MAX_SPACE_DISTANCE);
  if (at === undefined) {
    refuse(
      `A cut crosses its axis at most ${MAX_SPACE_DISTANCE} m from the origin of what it cuts.`,
    );
  }
  return { axis, at, keep };
}

/** A copy of the physical-space panel of a view state, sharing nothing with it. */
export function copiedSpace(space: ViewSpace): ViewSpace {
  return {
    ...space,
    ...(space.camera ? { camera: { ...space.camera, target: { ...space.camera.target } } } : {}),
    ...(space.cut ? { cut: { ...space.cut } } : {}),
  };
}

const CHOICES_MAP = 'Choices map the id of each decision to the id of an alternative.';

/**
 * Choices, each the id of a decision to the id of an alternative, at most
 * {@link MAX_VIEW_STATE_CHOICES}, in the order of their decisions' ids.
 */
function checkChoices(value: unknown): DecisionChoices {
  if (!isRecord(value)) refuse(CHOICES_MAP);
  const entries = Object.entries(value);
  if (entries.length === 0) refuse('A view state that chooses nothing leaves choices out.');
  if (entries.length > MAX_VIEW_STATE_CHOICES) {
    refuse(`A view state chooses at most ${MAX_VIEW_STATE_CHOICES} alternatives.`);
  }
  const checked = entries.map(([decision, alternative]): [Id, Id] => {
    if (typeof alternative !== 'string') refuse(CHOICES_MAP);
    return [checkId(decision), checkId(alternative)];
  });
  return Object.fromEntries(sortedChoices(checked));
}

/** Choices in the order of their decisions' ids, by UTF-16 code units, as project files write keys. */
function sortedChoices(entries: readonly [Id, Id][]): [Id, Id][] {
  return [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function checkId(value: unknown): Id {
  if (!isId(value)) refuse(`"${shortened(String(value))}" is not an id.`);
  return value;
}

/** A list of ids, each once, at most `MAX_VIEW_STATE_IDS`. */
function checkIds(value: unknown, part: string): Id[] {
  if (!Array.isArray(value)) refuse(`The ${part} of a view state is a list of ids.`);
  if (value.length > MAX_VIEW_STATE_IDS) {
    refuse(`A view state names at most ${MAX_VIEW_STATE_IDS} ids in ${part}.`);
  }
  const seen = new Set<Id>();
  for (const each of value) {
    const id = checkId(each);
    if (seen.has(id)) refuse(`"${id}" is named twice in ${part}.`);
    seen.add(id);
  }
  return [...seen];
}

function checkCamera(value: unknown): ViewCamera {
  if (!isRecord(value)) refuse(CAMERA_FORM);
  const { x, y, zoom } = value;
  const numbers = [x, y, zoom];
  if (
    Object.keys(value).length !== 3 ||
    !numbers.every((each) => typeof each === 'number' && Number.isFinite(each))
  ) {
    refuse(CAMERA_FORM);
  }
  const [cx, cy, scale] = numbers as [number, number, number];
  if (Math.abs(cx) > MAX_CAMERA_DISTANCE || Math.abs(cy) > MAX_CAMERA_DISTANCE) {
    refuse(`The camera looks at most ${MAX_CAMERA_DISTANCE} canvas units from the origin.`);
  }
  if (scale < MIN_CAMERA_ZOOM || scale > MAX_CAMERA_ZOOM) {
    refuse(`The camera zooms from ${MIN_CAMERA_ZOOM} to ${MAX_CAMERA_ZOOM}.`);
  }
  return { x: cx === 0 ? 0 : cx, y: cy === 0 ? 0 : cy, zoom: scale };
}

function checkFilters(value: unknown): ViewFilters {
  if (!isRecord(value)) refuse('Filters are an object.');
  for (const key of Object.keys(value)) {
    if (
      key !== 'components' &&
      key !== 'relationTypes' &&
      key !== 'conditions' &&
      key !== 'range'
    ) {
      refuse(`Filters have no "${shortened(key)}".`);
    }
  }
  const list = (items: unknown, what: string): Id[] => {
    if (items === undefined) return [];
    if (!Array.isArray(items)) refuse(`The ${what} of filters are a list of ids.`);
    if (items.length > MAX_GUIDANCE_TARGETS) {
      refuse(`Filters name at most ${MAX_GUIDANCE_TARGETS} ${what}.`);
    }
    return items.map(checkId);
  };
  const components = list(value.components, 'components');
  const relationTypes = list(value.relationTypes, 'relation types');
  const given = value.conditions ?? [];
  if (!Array.isArray(given)) refuse('The conditions of filters are a list.');
  if (given.length > MAX_FILTER_CONDITIONS) {
    refuse(`Filters hold at most ${MAX_FILTER_CONDITIONS} conditions.`);
  }
  const conditions = given.map((each: unknown) => {
    if (!isRecord(each)) refuse('A condition of filters is an object.');
    return checkCondition(each);
  });
  const range = value.range === undefined ? undefined : checkRange(value.range);
  if (components.length + relationTypes.length + conditions.length === 0 && range === undefined) {
    refuse('Filters that hide nothing are left out.');
  }
  return { components, relationTypes, conditions, ...(range === undefined ? {} : { range }) };
}

/** A time range, as filters keep it (ADR-0025's clarification of W37); throws `Malformed`. */
function checkRange(value: unknown): ViewTimeRange {
  const checked = checkTimeRange(value, MAX_FILTER_TEXT);
  if (!checked.ok) refuse(checked.message);
  return checked.range;
}

/** A condition, as filters test it (ADR-0025), with the limits guidance has. */
function checkCondition(value: Record<string, unknown>): GuidedCondition {
  const { of, attribute, test } = value;
  if (of !== 'elements' && of !== 'relations') {
    refuse(`A condition is on elements or on relations, not "${shortened(String(of))}".`);
  }
  if (typeof attribute !== 'string' || attribute.trim() === '') {
    refuse('A condition names an attribute.');
  }
  if (!FILTER_TESTS.some((each) => each === test)) {
    refuse(`A condition tests with one of: ${FILTER_TESTS.join(', ')}.`);
  }
  const tested = test as GuidedCondition['test'];
  const takesValue = tested !== 'set' && tested !== 'unset';
  const given = value.value ?? '';
  if (typeof given !== 'string') refuse('The value of a condition is text.');
  if (takesValue && given.trim() === '') {
    refuse(`A condition that tests with "${tested}" needs a value.`);
  }
  if (!takesValue && given !== '')
    refuse(`A condition that tests with "${tested}" takes no value.`);
  if (attribute.length > MAX_FILTER_TEXT || given.length > MAX_FILTER_TEXT) {
    refuse(`A condition's attribute and value hold at most ${MAX_FILTER_TEXT} characters.`);
  }
  if (!encodable(attribute) || !encodable(given)) {
    refuse("A condition's attribute and value are text without broken characters.");
  }
  return { of, attribute, test: tested, value: given };
}

function checkFocus(value: unknown): ViewFocus {
  if (!isRecord(value)) refuse('Focus is an object.');
  for (const key of Object.keys(value)) {
    if (key !== 'degrees' && key !== 'direction' && key !== 'isolate' && key !== 'from') {
      refuse(`Focus has no "${shortened(key)}".`);
    }
  }
  const { degrees, direction, isolate } = value;
  if (
    degrees !== 'all' &&
    !(
      typeof degrees === 'number' &&
      Number.isInteger(degrees) &&
      degrees >= 1 &&
      degrees <= MAX_FOCUS_DEGREES
    )
  ) {
    refuse(`Focus reaches 1 to ${MAX_FOCUS_DEGREES} degrees, or all.`);
  }
  if (!FOCUS_DIRECTIONS.some((each) => each === direction)) {
    refuse(
      `Focus goes one of these ways: ${FOCUS_DIRECTIONS.join(', ')}; not "${shortened(String(direction))}".`,
    );
  }
  if (typeof isolate !== 'boolean') refuse('Whether focus isolates is true or false.');
  const focus: ViewFocus = {
    degrees,
    direction: direction as ViewFocus['direction'],
    isolate,
  };
  if (value.from !== undefined) {
    if (Array.isArray(value.from) && value.from.length === 0) {
      refuse('Focus that starts from the selection leaves from out.');
    }
    focus.from = checkIds(value.from, 'focus');
  }
  return focus;
}

/** Whether a text can be percent-encoded: it holds no half of a surrogate pair on its own. */
function encodable(text: string): boolean {
  try {
    encodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ——— Against a project ———

/**
 * What a view state names that the project does not hold, in words: a view, a selected id that is
 * not an element, a relation or a free shape of the view, focus that starts from something other than
 * elements and relations, a component or relation type no package in use defines, a scenario, one
 * that plays over another view, or a step it does not have; and a decision or an alternative it
 * chooses that the scenario does not have, or a step the alternatives it chooses do not play (ADR
 * 0078). Without choices, a step of an alternative not chosen is no problem: going there chooses
 * what reaches it. Empty when it names only what is there.
 */
export function viewStateProblems(project: ProjectSnapshot, state: ViewState): string[] {
  const view = project.views.find((each) => each.id === state.view);
  if (view === undefined) return [`The project has no view "${state.view}".`];
  const problems: string[] = [];
  const index = modelIndexOf(project);
  const freeShapes = new Set(view.freeShapes.map((shape) => shape.id));
  const inModel = (id: Id) => index.element(id) !== undefined || index.relation(id) !== undefined;
  for (const id of state.select ?? []) {
    if (!inModel(id) && !freeShapes.has(id)) {
      problems.push(`Nothing in the view "${view.name}" has the id "${id}".`);
    }
  }
  for (const id of state.focus?.from ?? []) {
    if (!inModel(id)) {
      problems.push(`Focus starts from elements and relations, and "${id}" is neither.`);
    }
  }
  const root = state.space?.root;
  if (root !== undefined && index.element(root) === undefined) {
    problems.push(spaceRootProblem(root));
  }
  if (state.filters) {
    const definitions = definitionsIn(project);
    for (const id of state.filters.components) {
      if (id !== ESSENCE.id && !definitions.components.has(id)) {
        problems.push(`No package in use defines the component "${id}".`);
      }
    }
    for (const id of state.filters.relationTypes) {
      if (id !== RELATES_TO.id && !definitions.relationTypes.has(id)) {
        problems.push(`No package in use defines the relation type "${id}".`);
      }
    }
  }
  if (state.scenario !== undefined) {
    const scenario = project.scenarios.find((each) => each.id === state.scenario);
    if (scenario === undefined) {
      problems.push(`The project has no scenario "${state.scenario}".`);
    } else {
      if (scenario.view !== view.id) {
        const over = project.views.find((each) => each.id === scenario.view);
        problems.push(
          `The scenario "${scenario.name}" plays over the view "${over?.name ?? scenario.view}", not "${view.name}".`,
        );
      }
      const at =
        state.step === undefined ? -1 : scenario.steps.findIndex((step) => step.id === state.step);
      if (state.step !== undefined && at < 0) {
        problems.push(`The scenario "${scenario.name}" has no step "${state.step}".`);
      }
      if (state.choices) {
        problems.push(...choiceProblems(scenario, state.choices).map((each) => each.message));
        if (at >= 0 && !playedSteps(scenario, knownChoices(scenario, state.choices)).includes(at)) {
          problems.push(
            `With the alternatives it chooses, the scenario "${scenario.name}" does not play the step "${state.step ?? ''}".`,
          );
        }
      }
    }
  }
  return problems;
}

/** What a view state says of a physical-space panel that shows what is not an element. */
export function spaceRootProblem(root: Id): string {
  return `The physical-space panel shows "${root}", which is not an element of the project.`;
}

/**
 * What choices name that a scenario does not have, in words, each with the id it names: a decision,
 * or an alternative of one of its decisions (ADR 0078). Tours' steps say the same of the choices
 * they play.
 */
export function choiceProblems(
  scenario: Pick<ScenarioFile, 'name' | 'blocks'>,
  choices: DecisionChoices,
): { message: string; subject: Id }[] {
  return Object.entries(choices).flatMap(([decision, alternative]) => {
    const block = scenario.blocks?.find((each) => each.id === decision);
    if (!block) {
      return [
        {
          message: `The scenario "${scenario.name}" has no decision "${decision}".`,
          subject: decision,
        },
      ];
    }
    if (block.alternatives.some((each) => each.id === alternative)) return [];
    return [
      {
        message: `The decision "${block.question}" has no alternative "${alternative}".`,
        subject: alternative,
      },
    ];
  });
}
