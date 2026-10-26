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
 */
import type { Id } from '@visual-anything/schema';
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
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import { RANGE_KINDS, type RangeKind } from './time-range';

/** Where the canvas looks: the point of the view at its middle, in canvas units, and the zoom. */
export interface ViewCamera {
  x: number;
  y: number;
  /** How large one canvas unit shows, in screen pixels. */
  zoom: number;
}

/**
 * A time range of the filters (ADR-0025's clarification of W37): what is on one side of it is hidden,
 * and what has no value for it stays shown.
 */
export interface ViewTimeRange {
  of: 'elements' | 'relations';
  /** The attribute of the point, or of the start of a period. */
  attribute: string;
  /** The attribute of the end of a period, when the range is on periods. */
  until?: string;
  /** What the values read as: numbers, dates (milliseconds since 1970, UTC) or times of day (seconds). */
  kind: RangeKind;
  /** The range's ends on that axis, both included, whichever way round they are given. */
  from: number;
  to: number;
}

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
}

/** The parts of a view state, in the order an address writes them. */
export const VIEW_STATE_KEYS = [
  'view',
  'camera',
  'select',
  'filters',
  'focus',
  'scenario',
  'step',
] as const satisfies readonly (keyof ViewState)[];

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
  return checked({
    ...(view === undefined ? {} : { view }),
    ...(camera === undefined ? {} : { camera: parseCamera(camera) }),
    ...(select === undefined ? {} : { select: select.split(',') }),
    ...(filters === undefined ? {} : { filters: parseFilters(filters) }),
    ...(focus === undefined ? {} : { focus: parseFocus(focus) }),
    ...(scenario === undefined ? {} : { scenario }),
    ...(step === undefined ? {} : { step }),
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
const RANGE_ENDS = 'A time range runs between two numbers.';

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
  const { camera, select, filters, focus, scenario, step } = state;
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
  return parts.join('&');
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
  return state;
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
  let range: ViewTimeRange | undefined;
  if (value.range !== undefined) {
    if (!isRecord(value.range)) refuse('A time range is an object.');
    for (const key of Object.keys(value.range)) {
      if (!RANGE_KEYS.has(key)) refuse(`A time range has no "${shortened(key)}".`);
    }
    range = checkRange(value.range);
  }
  if (components.length + relationTypes.length + conditions.length === 0 && range === undefined) {
    refuse('Filters that hide nothing are left out.');
  }
  return { components, relationTypes, conditions, ...(range === undefined ? {} : { range }) };
}

const RANGE_KEYS: ReadonlySet<string> = new Set(['of', 'attribute', 'until', 'kind', 'from', 'to']);

/** A time range, as filters keep it (ADR-0025's clarification of W37); throws `Malformed`. */
function checkRange(value: Record<string, unknown>): ViewTimeRange {
  const { of, attribute, until, kind, from, to } = value;
  if (of !== 'elements' && of !== 'relations') {
    refuse(`A time range is on elements or on relations, not "${shortened(String(of))}".`);
  }
  const names = until === undefined ? [attribute] : [attribute, until];
  for (const name of names) {
    if (typeof name !== 'string' || name.trim() === '') {
      refuse('A time range names the attributes it reads.');
    }
    if (name.length > MAX_FILTER_TEXT) {
      refuse(`A time range's attributes hold at most ${MAX_FILTER_TEXT} characters.`);
    }
    if (!encodable(name)) refuse("A time range's attributes are text without broken characters.");
  }
  if (!RANGE_KINDS.some((each) => each === kind)) {
    refuse(`A time range reads its values as one of: ${RANGE_KINDS.join(', ')}.`);
  }
  if (
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    refuse(RANGE_ENDS);
  }
  return {
    of,
    attribute: attribute as string,
    ...(until === undefined ? {} : { until: until as string }),
    kind: kind as RangeKind,
    from: from === 0 ? 0 : from,
    to: to === 0 ? 0 : to,
  };
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
 * that plays over another view, or a step it does not have. Empty when it names only what is there.
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
      if (state.step !== undefined && !scenario.steps.some((step) => step.id === state.step)) {
        problems.push(`The scenario "${scenario.name}" has no step "${state.step}".`);
      }
    }
  }
  return problems;
}
