/**
 * The checks of what package code answers (ADR 0054). Every answer comes from code nobody trusts: it
 * must be plain data within its size cap, or it is dropped whole, with the reason, and nothing of it
 * is kept. What a check keeps is built afresh from the parts it allows, so nothing else rides along.
 */
import type { Color, Id, JsonValue } from '@visual-anything/schema';
import type { Drawing, DrawingItem } from './drawing';
import { CODE_LIMITS } from './limits';

/** An answer kept, or why it was dropped, in words that follow "The answer … was dropped: ". */
export type CheckedAnswer<T> = { ok: true; value: T } | { ok: false; reason: string };

/** An attribute value that `attributes` computed, shown with a mark and never saved. */
export interface ComputedAttribute {
  name: string;
  value: JsonValue;
}

/** A problem `check` answered, shown as a warning, as relation type limits are. */
export interface CodeProblem {
  message: string;
}

/**
 * The length a plain value has written as JSON, or why it is not plain data: JSON's own values only,
 * objects that derive from nothing but Object, arrays without holes, no `__proto__` key, nested at
 * most `maxDepth` levels and at most `maxChars` long. It never fails, whatever it is given.
 */
export function plainSizeOf(
  value: unknown,
  maxDepth: number,
  maxChars: number,
): { ok: true; size: number } | { ok: false; reason: string } {
  const budget: Budget = { spent: 0, limit: maxChars };
  const reason = measure(value, 0, maxDepth, budget);
  if (reason !== undefined) return { ok: false, reason };
  return { ok: true, size: budget.spent };
}

const NOT_PLAIN = 'it is not plain data';
const PROTO_KEY = 'it has the key "__proto__"';

/** The characters a value took so far as JSON, of at most `limit`. */
interface Budget {
  spent: number;
  readonly limit: number;
}

/** Takes characters from the budget: why the value is too long, once it is. */
function take(budget: Budget, chars: number): string | undefined {
  budget.spent += chars;
  return budget.spent > budget.limit ? `it is over ${budget.limit} characters as JSON` : undefined;
}

function measure(
  value: unknown,
  depth: number,
  maxDepth: number,
  budget: Budget,
): string | undefined {
  switch (typeof value) {
    case 'string':
      return take(budget, JSON.stringify(value).length);
    case 'number':
      return Number.isFinite(value) ? take(budget, JSON.stringify(value).length) : NOT_PLAIN;
    case 'boolean':
      return take(budget, value ? 4 : 5);
    case 'object':
      break;
    default:
      return NOT_PLAIN;
  }
  if (value === null) return take(budget, 4);
  if (depth >= maxDepth) return `it nests deeper than ${maxDepth} levels`;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return NOT_PLAIN;
    const brackets = take(budget, 2 + Math.max(0, value.length - 1));
    if (brackets !== undefined) return brackets;
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) return NOT_PLAIN;
      const inner = measure(value[i], depth + 1, maxDepth, budget);
      if (inner !== undefined) return inner;
    }
    return undefined;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return NOT_PLAIN;
  if (Object.hasOwn(value, '__proto__')) return PROTO_KEY;
  const keys = Object.keys(value);
  const braces = take(budget, 2 + Math.max(0, keys.length - 1));
  if (braces !== undefined) return braces;
  for (const key of keys) {
    const name = take(budget, JSON.stringify(key).length + 1);
    if (name !== undefined) return name;
    const inner = measure((value as Record<string, unknown>)[key], depth + 1, maxDepth, budget);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/**
 * Checks what `attributes` answered: an object of attribute values by name, each plain data of at
 * most 1 KiB as JSON, at most 64 of them. Nothing, or null, computes none.
 */
export function checkAttributesAnswer(answer: unknown): CheckedAnswer<ComputedAttribute[]> {
  if (answer === undefined || answer === null) return { ok: true, value: [] };
  if (!isPlainObject(answer)) return dropped('it is not an object of attribute values');
  const names = Object.keys(answer).sort(compareText);
  for (const name of names) {
    if (!isAttributeName(name)) {
      return dropped(`${JSON.stringify(name)} is not a name a computed attribute may have`);
    }
  }
  if (Object.hasOwn(answer, '__proto__')) {
    return dropped('"__proto__" is not a name a computed attribute may have');
  }
  if (names.length > CODE_LIMITS.attributes) {
    return dropped(`it computes more than ${CODE_LIMITS.attributes} attributes`);
  }
  const value: ComputedAttribute[] = [];
  for (const name of names) {
    const each = answer[name];
    const size = sized(each, CODE_LIMITS.attributeText);
    if (!size.ok) {
      if (size.reason.startsWith('it is over')) {
        return dropped(
          `the value of ${JSON.stringify(name)} is over ${CODE_LIMITS.attributeText} characters as JSON`,
        );
      }
      return dropped(
        size.reason === NOT_PLAIN
          ? `the value of ${JSON.stringify(name)} is not plain data`
          : `the value of ${JSON.stringify(name)} is not plain data: ${size.reason}`,
      );
    }
    value.push({ name, value: copyPlain(each) });
  }
  return { ok: true, value };
}

/**
 * Checks what `check` answered: a list of problems, each a message or an object with a message, of
 * at most 300 characters, at most 16 of them. Nothing, or null, finds none.
 */
export function checkProblemsAnswer(answer: unknown): CheckedAnswer<CodeProblem[]> {
  if (answer === undefined || answer === null) return { ok: true, value: [] };
  if (!Array.isArray(answer)) return dropped('it is not a list of problems');
  if (answer.length > CODE_LIMITS.problems) {
    return dropped(`it answers more than ${CODE_LIMITS.problems} problems`);
  }
  const value: CodeProblem[] = [];
  for (let i = 0; i < answer.length; i += 1) {
    const each: unknown = answer[i];
    const message =
      typeof each === 'string'
        ? each
        : isPlainObject(each) && Object.hasOwn(each, 'message')
          ? (each as { message: unknown }).message
          : undefined;
    if (typeof message !== 'string' || message.trim() === '') {
      return dropped(`problem ${i + 1} is not a message`);
    }
    const trimmed = message.trim();
    if (trimmed.length > CODE_LIMITS.problemText) {
      return dropped(`problem ${i + 1} is over ${CODE_LIMITS.problemText} characters`);
    }
    value.push({ message: trimmed });
  }
  return { ok: true, value };
}

/**
 * Checks what `draw` answered: a drawing, in its own box, of at most 256 items; nothing, or null,
 * draws nothing. `hasImage` says whether a package in use defines an image.
 */
export function checkDrawAnswer(
  answer: unknown,
  hasImage: (id: Id) => boolean,
): CheckedAnswer<Drawing | undefined> {
  if (answer === undefined || answer === null) return { ok: true, value: undefined };
  const size = sized(answer, CODE_LIMITS.answerText);
  if (!size.ok) return dropped(size.reason);
  if (!isPlainObject(answer)) return dropped('it is not a drawing');
  const { width, height, items } = answer;
  if (!isSize(width) || !isSize(height)) {
    return dropped(`its box must be over 0 and at most ${CODE_LIMITS.drawingSize} either way`);
  }
  if (!Array.isArray(items)) return dropped('its items are not a list');
  if (items.length > CODE_LIMITS.drawingItems) {
    return dropped(`it holds more than ${CODE_LIMITS.drawingItems} items`);
  }
  const kept: DrawingItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = checkItem(items[i], hasImage);
    if (typeof item === 'string') return dropped(`item ${i + 1} ${item}`);
    kept.push(item);
  }
  return { ok: true, value: { width, height, items: kept } };
}

/** The keys each kind of drawing item may have, `kind` included. */
const ITEM_KEYS: Readonly<Record<DrawingItem['kind'], readonly string[]>> = {
  rectangle: ['kind', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth'],
  'rounded-rectangle': ['kind', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth'],
  ellipse: ['kind', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth'],
  line: ['kind', 'points', 'stroke', 'strokeWidth'],
  arc: ['kind', 'x', 'y', 'radius', 'from', 'to', 'stroke', 'strokeWidth'],
  text: ['kind', 'x', 'y', 'text', 'size', 'fill', 'align'],
  image: ['kind', 'image', 'x', 'y', 'width', 'height'],
};

const COLOR = /^#[0-9a-fA-F]{6}$/;
/** How far from its box a drawing may reach. */
const REACH = 2 * CODE_LIMITS.drawingSize;

/** One item kept, or what is wrong with it, in words that follow "item n ". */
function checkItem(raw: unknown, hasImage: (id: Id) => boolean): DrawingItem | string {
  const unknownItem = 'is not something a drawing holds';
  if (!isPlainObject(raw)) return unknownItem;
  const item = raw;
  const kind = item.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(ITEM_KEYS, kind)) return unknownItem;
  const keys = ITEM_KEYS[kind as DrawingItem['kind']];
  for (const key of Object.keys(item)) {
    if (!keys.includes(key)) {
      return `has the key ${JSON.stringify(key)}, which a drawing item does not have`;
    }
  }
  const colors: Partial<Record<'fill' | 'stroke', Color>> = {};
  for (const key of ['fill', 'stroke'] as const) {
    const color = item[key];
    if (color === undefined) continue;
    if (typeof color !== 'string' || !COLOR.test(color)) {
      return 'has a color that is not written #RRGGBB';
    }
    colors[key] = color.toUpperCase();
  }
  const outOfRange = 'has a number out of range';
  const strokeWidth = item.strokeWidth;
  if (strokeWidth !== undefined && !isSize(strokeWidth)) return outOfRange;
  const stroke = {
    ...(colors.stroke === undefined ? {} : { stroke: colors.stroke }),
    ...(strokeWidth === undefined ? {} : { strokeWidth }),
  };
  switch (kind as DrawingItem['kind']) {
    case 'rectangle':
    case 'rounded-rectangle':
    case 'ellipse': {
      const { x, y, width, height } = item;
      if (!isCoordinate(x) || !isCoordinate(y) || !isExtent(width) || !isExtent(height)) {
        return outOfRange;
      }
      return {
        kind: kind as 'rectangle',
        x,
        y,
        width,
        height,
        ...(colors.fill === undefined ? {} : { fill: colors.fill }),
        ...stroke,
      };
    }
    case 'line': {
      const points = item.points;
      if (
        !Array.isArray(points) ||
        points.length < 2 ||
        points.length > CODE_LIMITS.drawingPoints
      ) {
        return `needs from 2 to ${CODE_LIMITS.drawingPoints} points`;
      }
      const kept: { x: number; y: number }[] = [];
      for (const point of points as unknown[]) {
        if (!isPlainObject(point)) return outOfRange;
        const { x, y, ...rest } = point;
        if (Object.keys(rest).length > 0 || !isCoordinate(x) || !isCoordinate(y)) {
          return outOfRange;
        }
        kept.push({ x, y });
      }
      return { kind: 'line', points: kept, ...stroke };
    }
    case 'arc': {
      const { x, y, radius, from, to } = item;
      if (
        !isCoordinate(x) ||
        !isCoordinate(y) ||
        !isExtent(radius) ||
        !isAngle(from) ||
        !isAngle(to)
      ) {
        return outOfRange;
      }
      return { kind: 'arc', x, y, radius, from, to, ...stroke };
    }
    case 'text': {
      const { x, y, text, size, align } = item;
      if (!isCoordinate(x) || !isCoordinate(y)) return outOfRange;
      if (typeof text !== 'string') return unknownItem;
      if (text.length > CODE_LIMITS.drawingText) {
        return `has a text over ${CODE_LIMITS.drawingText} characters`;
      }
      if (hasControl(text)) return 'has a text that is not one line';
      if (size !== undefined && !isSize(size)) return outOfRange;
      if (align !== undefined && align !== 'start' && align !== 'middle' && align !== 'end') {
        return unknownItem;
      }
      return {
        kind: 'text',
        x,
        y,
        text,
        ...(size === undefined ? {} : { size }),
        ...(colors.fill === undefined ? {} : { fill: colors.fill }),
        ...(align === undefined ? {} : { align }),
      };
    }
    case 'image': {
      const { image, x, y, width, height } = item;
      if (typeof image !== 'string') return unknownItem;
      if (!hasImage(image)) {
        return `shows the image ${JSON.stringify(image)}, which no package in use defines`;
      }
      if (!isCoordinate(x) || !isCoordinate(y) || !isExtent(width) || !isExtent(height)) {
        return outOfRange;
      }
      return { kind: 'image', image, x, y, width, height };
    }
  }
}

function sized(value: unknown, maxChars: number) {
  return plainSizeOf(value, CODE_LIMITS.depth, maxChars);
}

/** A copy of a value already found plain, with objects that derive from Object only. */
function copyPlain(value: unknown): JsonValue {
  if (typeof value !== 'object' || value === null) return value as JsonValue;
  if (Array.isArray(value)) return value.map(copyPlain);
  const copy: Record<string, JsonValue> = {};
  for (const key of Object.keys(value)) {
    copy[key] = copyPlain((value as Record<string, unknown>)[key]);
  }
  return copy;
}

function dropped(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAttributeName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= CODE_LIMITS.attributeName &&
    name.trim() === name &&
    name !== '__proto__' &&
    !hasControl(name)
  );
}

/** Whether a text holds a control character, or one of the two that end a line besides CR and LF. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= CODE_LIMITS.drawingSize;
}

function isExtent(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= REACH;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && value >= -REACH && value <= REACH;
}

function isAngle(value: unknown): value is number {
  return typeof value === 'number' && value >= -720 && value <= 720;
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
