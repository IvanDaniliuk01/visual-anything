/**
 * Slots and conditions of a face (ADR 0083). A slot, `{{…}}`, writes text, never markup:
 *
 * - `{{name}}`, `{{component}}` and `{{count}}`; inside `<each>`, `{{item}}`, or `{{key}}` and
 *   `{{value}}`; after it, `{{more}}`;
 * - an attribute by its name, `{{descripcion}}`, or `{{attr "Fecha de alta"}}` for any name;
 * - `?? "—"` gives the text written when there is no value, and `| plain` writes a value that takes
 *   text emphasis as the characters it is.
 *
 * A condition, in `if` or `else`, is a value (it has one, not empty and not false), `not` a value, or
 * one comparison: `x = 'live'`, `x != 'live'`, `x in 'live' 'frozen'`, or `<`, `<=`, `>` and `>=`.
 */

/** What a slot or a condition reads. */
export type Reference =
  | { kind: 'name' }
  | { kind: 'component' }
  | { kind: 'count' }
  | { kind: 'item' }
  | { kind: 'key' }
  | { kind: 'value' }
  | { kind: 'more' }
  | { kind: 'attribute'; name: string };

export interface Slot {
  ref: Reference;
  /** What it writes when there is no value. */
  fallback?: string;
  /** Whether it writes a value that takes text emphasis as its characters. */
  plain: boolean;
}

/** Text with slots in it: literal parts and slots, in order. */
export type TextTemplate = readonly (string | Slot)[];

export type Comparison = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

export type Condition =
  | { kind: 'has'; ref: Reference; not: boolean }
  | { kind: 'compare'; ref: Reference; op: Comparison; values: readonly (string | number)[] };

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string; offset: number };

/** The names a slot reads without `attr`; an attribute with one of these names is read with it. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'name',
  'component',
  'count',
  'item',
  'key',
  'value',
  'more',
  'attr',
  'not',
  'in',
  'plain',
]);

/** Characters of a bare attribute name: anything but spaces, quotes and the slots' own signs. */
const BARE = /^[^\s"'{}|?=!<>()]+/u;

/** Reads text that may hold slots. A "{{" never closed is refused; a lone "}}" is text. */
export function parseTemplate(text: string): Parsed<TextTemplate> {
  const parts: (string | Slot)[] = [];
  let at = 0;
  let literal = '';
  while (at < text.length) {
    const open = text.indexOf('{{', at);
    if (open === -1) break;
    literal += text.slice(at, open);
    const close = text.indexOf('}}', open + 2);
    if (close === -1)
      return { ok: false, reason: 'A "{{" is never closed with "}}".', offset: open };
    const slot = parseSlot(text.slice(open + 2, close));
    if (!slot.ok) return { ok: false, reason: slot.reason, offset: open + 2 + slot.offset };
    if (literal !== '') parts.push(literal);
    literal = '';
    parts.push(slot.value);
    at = close + 2;
  }
  literal += text.slice(at);
  if (literal !== '') parts.push(literal);
  return { ok: true, value: parts };
}

/** Whether a template holds any slot. */
export function hasSlots(template: TextTemplate): boolean {
  return template.some((part) => typeof part !== 'string');
}

/** The literal text of a template without slots. */
export function literalOf(template: TextTemplate): string {
  return template.map((part) => (typeof part === 'string' ? part : '')).join('');
}

class Tokens {
  at = 0;
  constructor(readonly text: string) {}

  spaces(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) this.at += 1;
  }

  done(): boolean {
    this.spaces();
    return this.at >= this.text.length;
  }

  /** Takes a word or sign if it is next. */
  take(word: string): boolean {
    this.spaces();
    if (!this.text.startsWith(word, this.at)) return false;
    const after = this.text[this.at + word.length];
    if (/\w/.test(word.at(-1)!) && after !== undefined && /[\w-]/.test(after)) return false;
    this.at += word.length;
    return true;
  }

  /** A quoted text, in double or single quotes, a backslash escaping the next character. */
  quoted(): string | undefined {
    this.spaces();
    const quote = this.text[this.at];
    if (quote !== '"' && quote !== "'") return undefined;
    let out = '';
    let at = this.at + 1;
    while (at < this.text.length && this.text[at] !== quote) {
      if (this.text[at] === '\\' && at + 1 < this.text.length) at += 1;
      out += this.text[at];
      at += 1;
    }
    if (at >= this.text.length) return undefined;
    this.at = at + 1;
    return out;
  }

  /** A number, as filters read one. */
  number(): number | undefined {
    this.spaces();
    const found = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.at));
    if (!found) return undefined;
    this.at += found[0].length;
    return Number(found[0]);
  }

  bare(): string | undefined {
    this.spaces();
    const found = BARE.exec(this.text.slice(this.at));
    if (!found) return undefined;
    this.at += found[0].length;
    return found[0];
  }
}

function reference(tokens: Tokens): Parsed<Reference> {
  const start = tokens.at;
  if (tokens.take('attr')) {
    const name = tokens.quoted();
    if (name === undefined || name === '') {
      return { ok: false, reason: 'A slot names an attribute as attr "its name".', offset: start };
    }
    return { ok: true, value: { kind: 'attribute', name } };
  }
  const word = tokens.bare();
  if (word === undefined) {
    return {
      ok: false,
      reason: 'A slot names what it writes: name, component, count, or an attribute.',
      offset: start,
    };
  }
  switch (word) {
    case 'name':
    case 'component':
    case 'count':
    case 'item':
    case 'key':
    case 'value':
    case 'more':
      return { ok: true, value: { kind: word } };
    case 'not':
    case 'in':
    case 'plain':
      return {
        ok: false,
        reason: `"${word}" is a word of slots: write attr "${word}" for an attribute of that name.`,
        offset: start,
      };
  }
  return { ok: true, value: { kind: 'attribute', name: word } };
}

/** Reads what is between "{{" and "}}". */
export function parseSlot(text: string): Parsed<Slot> {
  const tokens = new Tokens(text);
  const ref = reference(tokens);
  if (!ref.ok) return ref;
  let fallback: string | undefined;
  let plain = false;
  while (!tokens.done()) {
    const at = tokens.at;
    if (tokens.take('??')) {
      const text = tokens.quoted();
      if (text === undefined || fallback !== undefined) {
        return { ok: false, reason: 'A slot gives one text in quotes after "??".', offset: at };
      }
      fallback = text;
    } else if (tokens.take('|')) {
      if (!tokens.take('plain') || plain) {
        return { ok: false, reason: 'A slot takes "| plain" only.', offset: at };
      }
      plain = true;
    } else {
      return {
        ok: false,
        reason: 'A slot is a name, then ?? "a text" or | plain if wanted.',
        offset: at,
      };
    }
  }
  return {
    ok: true,
    value: { ref: ref.value, plain, ...(fallback === undefined ? {} : { fallback }) },
  };
}

const OPERATORS: readonly Comparison[] = ['!=', '<=', '>=', '=', '<', '>'];

/** Reads a condition, as `if` and `else` hold one. */
export function parseCondition(text: string): Parsed<Condition> {
  const tokens = new Tokens(text);
  const negated = tokens.take('not');
  const ref = reference(tokens);
  if (!ref.ok) return ref;
  if (tokens.done()) return { ok: true, value: { kind: 'has', ref: ref.value, not: negated } };
  if (negated) {
    return {
      ok: false,
      reason: '"not" goes before a value alone, as in "not archived".',
      offset: 0,
    };
  }
  const at = tokens.at;
  let op: Comparison | undefined;
  if (tokens.take('in')) op = 'in';
  else op = OPERATORS.find((each) => tokens.take(each));
  if (op === undefined) {
    return {
      ok: false,
      reason: "A condition compares with =, !=, <, <=, >, >= or in, as in status = 'live'.",
      offset: at,
    };
  }
  const values: (string | number)[] = [];
  while (!tokens.done()) {
    const valueAt = tokens.at;
    const value = tokens.quoted() ?? tokens.number();
    if (value === undefined) {
      return {
        ok: false,
        reason: 'A condition compares with a text in quotes or a number.',
        offset: valueAt,
      };
    }
    values.push(value);
    if (op !== 'in') break;
  }
  if (values.length === 0 || !tokens.done()) {
    return {
      ok: false,
      reason:
        op === 'in'
          ? "A condition with in lists texts in quotes or numbers, as in status in 'live' 'frozen'."
          : 'A condition compares with one text in quotes or one number.',
      offset: at,
    };
  }
  if (['<', '<=', '>', '>='].includes(op) && typeof values[0] !== 'number') {
    return { ok: false, reason: `"${op}" compares with a number.`, offset: at };
  }
  return { ok: true, value: { kind: 'compare', ref: ref.value, op, values } };
}

/** The attributes a reference names, if it names one. */
export function attributeOf(ref: Reference): string | undefined {
  return ref.kind === 'attribute' ? ref.name : undefined;
}
