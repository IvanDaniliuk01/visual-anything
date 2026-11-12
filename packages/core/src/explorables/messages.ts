/**
 * The messages between the app and an explorable's frame (ADR 0107), on the one `MessageChannel`
 * port the app hands the frame. Each way, a message is plain data (`null`, booleans, finite numbers,
 * text, lists and plain objects; and, for a still, one `Uint8Array` of its own), at most
 * {@link MAX_FRAME_MESSAGE_BYTES}, checked whole: a message with anything it does not take, or past
 * a cap, is dropped whole and never read in part.
 *
 * The app reads the frame's messages with {@link readFrameMessage}; the frame's runtime, which the
 * app builds with the core, reads the app's with {@link readHostMessage}.
 */
import type { ExplorableParameterValue, JsonValue } from '@visual-anything/schema';
import { isId } from '../ids';
import {
  MAX_DATA_ELEMENTS,
  MAX_FRAME_MESSAGE_BYTES,
  STILL_BUCKETS,
  VA_API,
  type FrameMessage,
  type HostMessage,
  type VaAttribute,
  type VaData,
  type VaElement,
  type VaRelation,
} from './types';

/** The longest console error a frame sends, in characters; the runtime cuts longer ones. */
export const MAX_FRAME_ERROR = 2000;
/** The most bytes a still's PNG takes, so that its message stays within its cap. */
export const MAX_STILL_BYTES = MAX_FRAME_MESSAGE_BYTES - 1024;
/** The deepest a message nests its lists and objects. */
export const MAX_FRAME_MESSAGE_DEPTH = 64;
/** The most parameters an explorable declares, and so the most `va.data.parameters` holds. */
export const MAX_PARAMETERS = 32;
/** The longest a parameter's text value is. */
export const MAX_PARAMETER_TEXT = 200;
/** The widest and tallest an explorable is drawn, in pixels. */
export const MAX_FRAME_SIDE = 100_000;

/** How a parameter is named, as `va.data.parameters` holds it. */
export const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * How many bytes a value takes as plain data, as JSON would write it, near enough; `undefined` when
 * it is not plain data, nests too deep, or passes `most`. A `Uint8Array` counts when `bytes` allows
 * it, and only when it is the whole of its buffer, so that no view drags a larger buffer along.
 */
export function plainDataBytes(value: unknown, most: number, bytes = false): number | undefined {
  let total = 0;
  const visit = (each: unknown, depth: number): boolean => {
    if (depth > MAX_FRAME_MESSAGE_DEPTH) return false;
    if (each === null || typeof each === 'boolean') total += 5;
    else if (typeof each === 'number') {
      if (!Number.isFinite(each)) return false;
      total += 24;
    } else if (typeof each === 'string') {
      total += 2 + utf8Bytes(each);
    } else if (each instanceof Uint8Array) {
      if (!bytes || each.byteOffset !== 0 || each.buffer.byteLength !== each.byteLength) {
        return false;
      }
      if (Object.getPrototypeOf(each) !== Uint8Array.prototype) return false;
      total += each.byteLength;
    } else if (Array.isArray(each)) {
      if (Object.getPrototypeOf(each) !== Array.prototype) return false;
      total += 2;
      for (let i = 0; i < each.length; i += 1) {
        if (!(i in each) || !visit(each[i], depth + 1)) return false;
        if (total > most) return false;
      }
    } else if (typeof each === 'object') {
      const proto: unknown = Object.getPrototypeOf(each);
      if (proto !== Object.prototype && proto !== null) return false;
      total += 2;
      for (const key of Object.keys(each)) {
        total += 3 + utf8Bytes(key);
        if (!visit((each as Record<string, unknown>)[key], depth + 1)) return false;
        if (total > most) return false;
      }
    } else {
      return false;
    }
    return total <= most;
  };
  return visit(value, 0) ? total : undefined;
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isText(value: unknown, most: number, empty = true): value is string {
  return typeof value === 'string' && value.length <= most && (empty || value !== '');
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isBucket(value: unknown): value is (typeof STILL_BUCKETS)[number] {
  return (STILL_BUCKETS as readonly unknown[]).includes(value);
}

/** A message a frame posted, checked whole and within its cap, or `undefined` to drop it. */
export function readFrameMessage(value: unknown): FrameMessage | undefined {
  if (!isRecord(value)) return undefined;
  if (plainDataBytes(value, MAX_FRAME_MESSAGE_BYTES, value.kind === 'va/still') === undefined) {
    return undefined;
  }
  switch (value.kind) {
    case 'va/ready':
      return hasOnly(value, ['kind']) ? { kind: 'va/ready' } : undefined;
    case 'va/pong':
      return hasOnly(value, ['kind', 'at']) && isTime(value.at)
        ? { kind: 'va/pong', at: value.at }
        : undefined;
    case 'va/select':
      return hasOnly(value, ['kind', 'id']) && isId(value.id)
        ? { kind: 'va/select', id: value.id }
        : undefined;
    case 'va/error':
      return hasOnly(value, ['kind', 'message']) && isText(value.message, MAX_FRAME_ERROR, false)
        ? { kind: 'va/error', message: value.message }
        : undefined;
    case 'va/still': {
      const { width, png } = value;
      if (!hasOnly(value, ['kind', 'width', 'png']) || !isBucket(width)) return undefined;
      if (!(png instanceof Uint8Array) || png.byteLength > MAX_STILL_BYTES) return undefined;
      if (png.byteLength < 8 || PNG_SIGNATURE.some((byte, at) => png[at] !== byte)) {
        return undefined;
      }
      return { kind: 'va/still', width, png };
    }
    default:
      return undefined;
  }
}

/** A message the app posts, checked as the frame's runtime checks it, or `undefined` to drop it. */
export function readHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value)) return undefined;
  if (plainDataBytes(value, MAX_FRAME_MESSAGE_BYTES) === undefined) return undefined;
  switch (value.kind) {
    case 'va/hello': {
      if (!hasOnly(value, ['kind', 'api', 'data']) || value.api !== VA_API) return undefined;
      const data = readVaData(value.data);
      return data && { kind: 'va/hello', api: VA_API, data };
    }
    case 'va/data': {
      if (!hasOnly(value, ['kind', 'data'])) return undefined;
      const data = readVaData(value.data);
      return data && { kind: 'va/data', data };
    }
    case 'va/ping':
      return hasOnly(value, ['kind', 'at']) && isTime(value.at)
        ? { kind: 'va/ping', at: value.at }
        : undefined;
    case 'va/still':
      return hasOnly(value, ['kind', 'width']) && isBucket(value.width)
        ? { kind: 'va/still', width: value.width }
        : undefined;
    default:
      return undefined;
  }
}

/** A parameter's value as `va.data` holds one: a finite number, a boolean, or short text. */
export function isParameterValue(value: unknown): value is ExplorableParameterValue {
  return (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    isText(value, MAX_PARAMETER_TEXT)
  );
}

/** `va.data`, version 1, checked whole; `undefined` when any part of it is not what it takes. */
export function readVaData(value: unknown): VaData | undefined {
  if (!isRecord(value)) return undefined;
  const keys = ['api', 'element', 'contents', 'relations', 'omitted', 'parameters'];
  if (!hasOnly(value, [...keys, 'theme', 'language', 'size', 'step'])) return undefined;
  const { api, element, contents, relations, omitted, parameters, theme, language, size, step } =
    value;
  if (api !== VA_API) return undefined;
  if (theme !== 'light' && theme !== 'dark') return undefined;
  if (language !== 'en' && language !== 'es') return undefined;
  if (!isRecord(size) || !hasOnly(size, ['width', 'height'])) return undefined;
  const side = (each: unknown): each is number =>
    typeof each === 'number' && Number.isFinite(each) && each >= 0 && each <= MAX_FRAME_SIDE;
  if (!side(size.width) || !side(size.height)) return undefined;
  if (!isRecord(parameters)) return undefined;
  const names = Object.keys(parameters);
  if (names.length > MAX_PARAMETERS) return undefined;
  if (!names.every((name) => PARAMETER_NAME.test(name) && isParameterValue(parameters[name]))) {
    return undefined;
  }
  const data: VaData = {
    api: VA_API,
    parameters: Object.fromEntries(
      names.map((name) => [name, parameters[name] as ExplorableParameterValue]),
    ),
    theme,
    language,
    size: { width: size.width, height: size.height },
  };
  let count = 0;
  if (element !== undefined) {
    const read = readVaElement(element);
    if (!read) return undefined;
    data.element = read;
    count += 1;
  }
  if (contents !== undefined) {
    if (!Array.isArray(contents) || contents.length > MAX_DATA_ELEMENTS) return undefined;
    const read = contents.map(readVaElement);
    if (!read.every((each): each is VaElement => each !== undefined)) return undefined;
    data.contents = read;
    count += read.length;
  }
  if (relations !== undefined) {
    if (!Array.isArray(relations) || relations.length > MAX_DATA_ELEMENTS) return undefined;
    const read = relations.map(readVaRelation);
    if (!read.every((each): each is VaRelation => each !== undefined)) return undefined;
    data.relations = read;
    count += read.length;
  }
  if (count > MAX_DATA_ELEMENTS) return undefined;
  if (omitted !== undefined) {
    if (typeof omitted !== 'number' || !Number.isInteger(omitted) || omitted < 0) return undefined;
    data.omitted = omitted;
  }
  if (step !== undefined) {
    if (!isRecord(step) || !hasOnly(step, ['kind', 'id', 'step', 'title'])) return undefined;
    if ((step.kind !== 'scenario' && step.kind !== 'tour') || !isId(step.id) || !isId(step.step)) {
      return undefined;
    }
    if (step.title !== undefined && !isText(step.title, 200)) return undefined;
    data.step = {
      kind: step.kind,
      id: step.id,
      step: step.step,
      ...(step.title === undefined ? {} : { title: step.title }),
    };
  }
  return data;
}

const ELEMENT_KEYS = ['id', 'name', 'component', 'description', 'attributes'];
const ATTRIBUTE_KEYS = [
  'name',
  'value',
  'source',
  'kind',
  'unit',
  'label',
  'min',
  'max',
  'description',
  'choices',
];

function readVaElement(value: unknown): VaElement | undefined {
  if (!isRecord(value) || !hasOnly(value, ELEMENT_KEYS)) return undefined;
  const { id, name, component, description, attributes } = value;
  if (!isId(id) || !isId(component) || typeof name !== 'string') return undefined;
  if (description !== undefined && typeof description !== 'string') return undefined;
  if (!Array.isArray(attributes)) return undefined;
  const read = attributes.map(readVaAttribute);
  if (!read.every((each): each is VaAttribute => each !== undefined)) return undefined;
  return {
    id,
    name,
    component,
    ...(description === undefined ? {} : { description }),
    attributes: read,
  };
}

function readVaAttribute(value: unknown): VaAttribute | undefined {
  if (!isRecord(value) || !hasOnly(value, ATTRIBUTE_KEYS)) return undefined;
  const attribute: VaAttribute = { name: '', value: null };
  if (typeof value.name !== 'string' || value.name === '') return undefined;
  attribute.name = value.name;
  if (!('value' in value) || !isJson(value.value)) return undefined;
  attribute.value = value.value;
  const { source, kind, unit, label, min, max, description, choices } = value;
  if (source !== undefined) {
    if (source !== 'computed' && source !== 'live' && source !== 'simulated') return undefined;
    attribute.source = source;
  }
  for (const [key, each] of [
    ['kind', kind],
    ['unit', unit],
    ['label', label],
    ['description', description],
  ] as const) {
    if (each === undefined) continue;
    if (typeof each !== 'string') return undefined;
    attribute[key] = each;
  }
  for (const [key, each] of [
    ['min', min],
    ['max', max],
  ] as const) {
    if (each === undefined) continue;
    if (typeof each !== 'number' || !Number.isFinite(each)) return undefined;
    attribute[key] = each;
  }
  if (choices !== undefined) {
    if (!Array.isArray(choices) || !choices.every((each) => typeof each === 'string')) {
      return undefined;
    }
    attribute.choices = [...choices];
  }
  return attribute;
}

function readVaRelation(value: unknown): VaRelation | undefined {
  if (!isRecord(value) || !hasOnly(value, ['id', 'type', 'direction', 'other'])) return undefined;
  const { id, type, direction, other } = value;
  if (!isId(id) || !isId(type) || (direction !== 'out' && direction !== 'in')) return undefined;
  const end = readVaElement(other);
  return end && { id, type, direction, other: end };
}

/** Whether a value is JSON: what an attribute's value may be. Plain data is checked already. */
function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (isRecord(value)) return Object.values(value).every(isJson);
  return false;
}
