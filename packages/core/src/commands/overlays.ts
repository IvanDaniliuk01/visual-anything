/**
 * The overlays of a view (ADR 0055): set whole, as Claude and imports do, or added, changed, removed
 * and moved one at a time, as the inspector does, so that the app and Claude do not undo each other's
 * changes. Each is one action that changes only the view's file. Every value is checked as it
 * arrives, with a stable problem code for each refusal; an attribute that nothing has only warns.
 */
import type { Color, Id, Overlay, ViewFile } from '@visual-anything/schema';
import { isColor, storedColor } from '../colors';
import { isId, slug } from '../ids';
import { meetsCondition } from '../conditions';
import { MAX_OVERLAYS, OVERLAY_CHANNELS, type OverlayChannel } from '../overlays/evaluate';
import { defines, heldAttributes } from '../overlays/check';
import { problem } from '../problems';
import { count, reject, requireList, sameJson, type Draft } from './draft';
import type {
  AddOverlayCommand,
  MoveOverlayCommand,
  RemoveOverlaysCommand,
  SetOverlaysCommand,
  UpdateOverlayCommand,
} from './types';
import { viewProperties } from './views';

/** The most values one overlay maps one by one, and the most stops of a range. */
export const MAX_OVERLAY_CASES = 64;
export const MAX_OVERLAY_STOPS = 16;

const OVERLAY_KEYS = ['id', 'name', 'of', 'attribute', 'channel', 'mapping', 'off'] as const;

export function setOverlays(draft: Draft, command: SetOverlaysCommand): string {
  const view = draft.view(command.view);
  const given = requireList(command.overlays, 'The overlays');
  if (given.length > MAX_OVERLAYS) tooMany();
  const taken = new Set<Id>();
  const stored = new Map((view.overlays ?? []).map((each) => [each.id, each]));
  const overlays = given.map((each) => {
    const asked = isRecord(each) ? each.id : undefined;
    const overlay = checkedOverlay(draft, each, view, taken, stored.get(asked as Id));
    taken.add(overlay.id);
    return overlay;
  });
  putOverlays(draft, view, overlays);
  for (const overlay of overlays) warnIfUnread(draft, overlay);
  return overlays.length === 0
    ? `Remove the overlays of "${view.name}"`
    : `Set the overlays of "${view.name}"`;
}

export function addOverlay(draft: Draft, command: AddOverlayCommand): string {
  const view = draft.view(command.view);
  const current = view.overlays ?? [];
  if (current.length >= MAX_OVERLAYS) tooMany();
  const taken = new Set(current.map((each) => each.id));
  const overlay = checkedOverlay(draft, command.overlay, view, taken);
  const at = command.before === undefined ? current.length : indexIn(view, command.before);
  putOverlays(draft, view, [...current.slice(0, at), overlay, ...current.slice(at)]);
  warnIfUnread(draft, overlay);
  return `Add the overlay "${nameOf(overlay)}" to "${view.name}"`;
}

export function updateOverlay(draft: Draft, command: UpdateOverlayCommand): string {
  const view = draft.view(command.view);
  const at = indexIn(view, command.overlay);
  const current = (view.overlays as Overlay[])[at] as Overlay;
  const changes = command.changes as Record<string, unknown> | undefined;
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    reject('invalid-command', 'The changes to an overlay are an object.');
  }
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'id' || !(OVERLAY_KEYS as readonly string[]).includes(key)) {
      reject('invalid-overlay', `An overlay has no "${key}" to change.`);
    }
    if (value === undefined) continue;
    if (value === null && key === 'name') delete next.name;
    else next[key] = value;
  }
  if (next.off === false) delete next.off;
  const taken = new Set((view.overlays ?? []).map((each) => each.id));
  taken.delete(current.id);
  const overlay = checkedOverlay(draft, next, view, taken, current);
  const list = [...(view.overlays ?? [])];
  list[at] = overlay;
  putOverlays(draft, view, list);
  if (overlay.attribute !== current.attribute || overlay.of !== current.of) {
    warnIfUnread(draft, overlay);
  }
  const onlyOff = Object.entries(changes).every(
    ([key, value]) => key === 'off' || value === undefined,
  );
  if (onlyOff && (overlay.off === true) !== (current.off === true)) {
    return overlay.off === true
      ? `Turn off the overlay "${nameOf(overlay)}" in "${view.name}"`
      : `Turn on the overlay "${nameOf(overlay)}" in "${view.name}"`;
  }
  return `Edit the overlay "${nameOf(overlay)}" in "${view.name}"`;
}

export function removeOverlays(draft: Draft, command: RemoveOverlaysCommand): string {
  const view = draft.view(command.view);
  const ids = requireList(command.overlays, 'The overlays');
  if (ids.length === 0) reject('invalid-command', 'No overlays were given to remove.');
  const named = new Set<Id>();
  for (const id of ids) {
    const overlay = (view.overlays as Overlay[])[indexIn(view, id)] as Overlay;
    if (named.has(id))
      reject('invalid-command', `The overlay "${nameOf(overlay)}" is given twice.`);
    named.add(id);
  }
  const removed = (view.overlays ?? []).filter((each) => named.has(each.id));
  putOverlays(
    draft,
    view,
    (view.overlays ?? []).filter((each) => !named.has(each.id)),
  );
  const [only] = removed;
  return removed.length === 1 && only !== undefined
    ? `Remove the overlay "${nameOf(only)}" from "${view.name}"`
    : `Remove ${count(removed.length, 'overlay')} from "${view.name}"`;
}

export function moveOverlay(draft: Draft, command: MoveOverlayCommand): string {
  const view = draft.view(command.view);
  const at = indexIn(view, command.overlay);
  const list = [...(view.overlays ?? [])];
  const [overlay] = list.splice(at, 1) as [Overlay];
  if (command.before === overlay.id) {
    reject('invalid-command', 'An overlay cannot go before itself.');
  }
  const to =
    command.before === undefined
      ? list.length
      : list.findIndex((each) => each.id === command.before);
  if (to === -1) unknownOverlay(view, command.before as Id);
  list.splice(to, 0, overlay);
  putOverlays(draft, view, list);
  return `Move the overlay "${nameOf(overlay)}" in "${view.name}"`;
}

/** What the history and the legend call an overlay: its name, or the attribute it reads. */
function nameOf(overlay: Overlay): string {
  return overlay.name ?? overlay.attribute;
}

function tooMany(): never {
  reject('invalid-overlay', `A view has at most ${MAX_OVERLAYS} overlays.`);
}

function unknownOverlay(view: ViewFile, id: Id): never {
  reject('unknown-overlay', `The view "${view.name}" has no overlay "${String(id)}".`, [view.id]);
}

/** Where an overlay of a view is in its list; refused when the view has none with that id. */
function indexIn(view: ViewFile, id: unknown): number {
  const at = (view.overlays ?? []).findIndex((each) => each.id === id);
  if (at === -1) unknownOverlay(view, id as Id);
  return at;
}

/** Stores a view's overlays; with none, the view has no list at all. */
function putOverlays(draft: Draft, view: ViewFile, overlays: readonly Overlay[]): void {
  if (sameJson(overlays, view.overlays ?? [])) return;
  const properties = viewProperties(view);
  if (overlays.length === 0) delete properties.overlays;
  else properties.overlays = [...overlays];
  draft.apply({ op: 'set-view', view: view.id, properties });
}

/**
 * Warns when nothing has the attribute an overlay reads, neither a definition in use nor an element
 * or relation itself: the overlay is kept, and changes nothing until something has it.
 */
function warnIfUnread(draft: Draft, overlay: Overlay): void {
  if (overlay.off === true) return;
  if (defines(draft.definitions, overlay)) return;
  if (heldAttributes(draft.state)[overlay.of].has(overlay.attribute)) return;
  draft.warnings.push(
    problem(
      'unknown-attribute',
      overlay.of === 'elements'
        ? `No element has "${overlay.attribute}", which the overlay "${nameOf(overlay)}" reads: it changes nothing yet.`
        : `No relation has "${overlay.attribute}", which the overlay "${nameOf(overlay)}" reads: it changes nothing yet.`,
    ),
  );
}

// Checking an overlay ------------------------------------------------------------------------------

function invalid(message: string): never {
  reject('invalid-overlay', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function characters(text: string): number {
  return [...text].length;
}

function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  refuse: (key: string) => never,
) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) refuse(key);
}

/** What a channel's cases and stops give their value under. */
const VALUE_KEYS: Readonly<Record<OverlayChannel, string>> = {
  fill: 'color',
  stroke: 'color',
  size: 'size',
  badge: 'text',
  opacity: 'opacity',
};

/**
 * An overlay a command sets, checked, with an id unused among `taken`, the ids of the view's other
 * overlays: the one given, or one made from its attribute and channel. Colors are written in capitals,
 * but a color `stored`, the overlay as the view keeps it, already holds keeps its spelling, so that
 * nothing rewrites a color read from a file (ADR 0033).
 */
export function checkedOverlay(
  draft: Draft,
  value: unknown,
  view: ViewFile,
  taken: ReadonlySet<Id>,
  stored?: Overlay,
): Overlay {
  if (!isRecord(value)) invalid('An overlay is an object with a channel.');
  onlyKeys(value, OVERLAY_KEYS, (key) =>
    invalid(`An overlay holds id, name, of, attribute, channel, mapping and off, not "${key}".`),
  );
  const { name, of, attribute, channel, mapping, off } = value;
  if (typeof attribute !== 'string' || attribute.trim() === '') {
    invalid('An overlay names the attribute it reads.');
  }
  if (
    name !== undefined &&
    (typeof name !== 'string' || characters(name) < 1 || characters(name) > 64)
  ) {
    invalid('The name of an overlay has 1 to 64 characters.');
  }
  const called = name ?? attribute;
  if (of !== 'elements' && of !== 'relations') {
    invalid(`The overlay "${called}" reads the attributes of "elements" or of "relations".`);
  }
  if (!(OVERLAY_CHANNELS as readonly unknown[]).includes(channel)) {
    invalid(`The overlay "${called}" sets "fill", "stroke", "size", "badge" or "opacity".`);
  }
  const theChannel = channel as OverlayChannel;
  if (of === 'relations' && theChannel === 'fill') {
    invalid(
      `A relation has no fill: the overlay "${called}" can color the stroke of relations instead.`,
    );
  }
  if (off !== undefined && typeof off !== 'boolean') {
    invalid(`Whether the overlay "${called}" is off is true or false.`);
  }
  const id = overlayIdOf(draft, value.id, attribute, theChannel, taken, view);
  const spellings = new Map(colorsIn(stored).map((color) => [color.toUpperCase(), color]));
  const color = (given: Color) => storedColor(given, spellings.get(given.toUpperCase()));
  return {
    id,
    ...(name === undefined ? {} : { name: name }),
    of,
    attribute,
    ...(off === true ? { off: true } : {}),
    channel: theChannel,
    mapping: checkedMapping(mapping, theChannel, called, color),
  } as Overlay;
}

/** The colors an overlay's mapping holds. */
function colorsIn(overlay: Overlay | undefined): Color[] {
  if (overlay === undefined) return [];
  const mapping = overlay.mapping as {
    cases?: { color?: Color }[];
    stops?: { color?: Color }[];
    otherwise?: unknown;
  };
  const colors = [...(mapping.cases ?? []), ...(mapping.stops ?? [])].flatMap((each) =>
    each.color === undefined ? [] : [each.color],
  );
  return isColor(mapping.otherwise) ? [...colors, mapping.otherwise] : colors;
}

/** How a checked color is written: in capitals, or as the overlay already spells it. */
type ColorSpelling = (color: Color) => Color;

/** The id an overlay gets: the one asked for, which must be unused in the view, or a new one. */
function overlayIdOf(
  draft: Draft,
  asked: unknown,
  attribute: string,
  channel: OverlayChannel,
  taken: ReadonlySet<Id>,
  view: ViewFile,
): Id {
  if (asked === undefined) {
    return draft.newId(`${slug(attribute, 'overlay')}-${channel}`, (id) => taken.has(id));
  }
  if (!isId(asked))
    reject('invalid-id', `${JSON.stringify(asked) ?? 'undefined'} is not a valid id.`);
  if (taken.has(asked)) {
    reject('id-taken', `The view "${view.name}" already has an overlay "${asked}".`, [view.id]);
  }
  return asked;
}

/** How an overlay maps its attribute, checked for its channel. */
function checkedMapping(
  value: unknown,
  channel: OverlayChannel,
  called: string,
  color: ColorSpelling,
): Overlay['mapping'] {
  if (!isRecord(value)) {
    invalid(
      `The overlay "${called}" maps its attribute "discrete", "continuous" or "passthrough".`,
    );
  }
  switch (value.kind) {
    case 'discrete':
      return checkedCases(value, channel, called, color);
    case 'continuous':
      if (channel === 'badge') {
        invalid(
          `The overlay "${called}" writes badges, which take no range: map its values one by one, or write the value itself.`,
        );
      }
      return checkedStops(value, channel, called, color);
    case 'passthrough':
      onlyKeys(value, ['kind'], (key) =>
        invalid(`The mapping of the overlay "${called}" has no "${key}".`),
      );
      if (channel === 'size' || channel === 'opacity') {
        invalid(
          `Only an overlay of "fill", "stroke" or "badge" takes the value itself; "${called}" sets "${channel}".`,
        );
      }
      return { kind: 'passthrough' };
    default:
      invalid(
        `The overlay "${called}" maps its attribute "discrete", "continuous" or "passthrough".`,
      );
  }
}

function checkedCases(
  mapping: Record<string, unknown>,
  channel: OverlayChannel,
  called: string,
  color: ColorSpelling,
): Overlay['mapping'] {
  onlyKeys(mapping, ['kind', 'cases', 'otherwise'], (key) =>
    invalid(`The mapping of the overlay "${called}" has no "${key}".`),
  );
  const { cases, otherwise } = mapping;
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > MAX_OVERLAY_CASES) {
    invalid(`The overlay "${called}" maps 1 to ${MAX_OVERLAY_CASES} values one by one.`);
  }
  const key = VALUE_KEYS[channel];
  const values: string[] = [];
  const checked = cases.map((each: unknown) => {
    if (!isRecord(each)) invalid(`A value the overlay "${called}" maps is an object.`);
    onlyKeys(each, ['value', key, 'label'], (other) =>
      invalid(`A value the overlay "${called}" maps has no "${other}".`),
    );
    const named = each.value;
    if (typeof named !== 'string' && typeof named !== 'boolean' && !isFiniteNumber(named)) {
      invalid(`A value the overlay "${called}" maps is text, a number, or true or false.`);
    }
    const text = String(named);
    if (values.some((before) => meetsCondition(text, 'is', before))) {
      invalid(`The overlay "${called}" maps "${text}" twice.`);
    }
    values.push(text);
    return {
      value: text,
      [key]: checkedValue(each[key], channel, called, color),
      ...labelOf(each.label, called),
    };
  });
  return {
    kind: 'discrete',
    cases: checked,
    ...(otherwise === undefined
      ? {}
      : { otherwise: checkedValue(otherwise, channel, called, color) }),
  } as Overlay['mapping'];
}

function checkedStops(
  mapping: Record<string, unknown>,
  channel: OverlayChannel,
  called: string,
  color: ColorSpelling,
): Overlay['mapping'] {
  onlyKeys(mapping, ['kind', 'stops'], (key) =>
    invalid(`The mapping of the overlay "${called}" has no "${key}".`),
  );
  const { stops } = mapping;
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > MAX_OVERLAY_STOPS) {
    invalid(`The overlay "${called}" maps a range through 2 to ${MAX_OVERLAY_STOPS} stops.`);
  }
  const key = VALUE_KEYS[channel];
  let last = -Infinity;
  const checked = stops.map((stop: unknown) => {
    if (!isRecord(stop)) invalid(`A stop of the overlay "${called}" is an object.`);
    onlyKeys(stop, ['at', key, 'label'], (other) =>
      invalid(`A stop of the overlay "${called}" has no "${other}".`),
    );
    if (!isFiniteNumber(stop.at)) invalid(`A stop of the overlay "${called}" is at a number.`);
    if (stop.at <= last) {
      invalid(
        `The stops of the overlay "${called}" go up: each at a number above the one before it.`,
      );
    }
    last = stop.at;
    return {
      at: stop.at,
      [key]: checkedValue(stop[key], channel, called, color),
      ...labelOf(stop.label, called),
    };
  });
  return { kind: 'continuous', stops: checked } as Overlay['mapping'];
}

/** What a case or a stop gives the channel, checked for it. */
function checkedValue(
  value: unknown,
  channel: OverlayChannel,
  called: string,
  color: ColorSpelling,
): Color | number {
  switch (channel) {
    case 'fill':
    case 'stroke':
      if (!isColor(value)) {
        invalid(
          `The overlay "${called}" colors with colors written as #RRGGBB, not ${JSON.stringify(value) ?? String(value)}.`,
        );
      }
      return color(value);
    case 'size':
      if (!isFiniteNumber(value) || value < 0.5 || value > 2) {
        invalid(`The overlay "${called}" sizes by a factor from 0.5 to 2.`);
      }
      return value;
    case 'opacity':
      if (!isFiniteNumber(value) || value < 0.1 || value > 1) {
        invalid(`The overlay "${called}" fades to an opacity from 0.1 to 1.`);
      }
      return value;
    case 'badge':
      if (typeof value !== 'string' || characters(value) < 1 || characters(value) > 12) {
        invalid(`The overlay "${called}" writes badges of 1 to 12 characters.`);
      }
      return value;
  }
}

function labelOf(value: unknown, called: string): { label?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string' || characters(value) < 1 || characters(value) > 64) {
    invalid(`What the legend of "${called}" says for a value has 1 to 64 characters.`);
  }
  return { label: value };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
