/**
 * How the app's texts are translated (ADR-0038). The code writes English, and each English text is the
 * key of a catalog entry; a language other than English looks the text up in its catalog, and a text
 * with no entry shows in English. Values go in braces, as in `Open “{name}”`. A text that changes with
 * a count is written as its "one" and "other" forms, and `Intl.PluralRules` picks between them.
 *
 * The core and the local program write English too. Their messages are translated here with entries
 * written as templates of those messages, so the core needs no language: see {@link translateMessage}.
 */
import { messages as esMessages, ui as esUi } from './es';

/** The languages the app reads in. */
export type Language = 'en' | 'es';

export const LANGUAGES: readonly Language[] = Object.freeze(['en', 'es']);

/**
 * A text whose words change with a count, as its forms for one and for any other count. Its key in a
 * catalog is its "other" form. The count is the value named `count`.
 */
export interface PluralText {
  readonly one: string;
  readonly other: string;
}

/** An English text, as the code writes it: plain, or in its plural forms. */
export type Text = string | PluralText;

/** What a catalog gives for an English key: the text, or its forms by count. */
export type Entry = string | PluralText;

/** Translations keyed by the exact English text. */
export type Catalog = Readonly<Record<string, Entry>>;

/** The values a text names in braces. */
export type Values = Readonly<Record<string, string | number>>;

/**
 * The catalog of each language but English, which needs none: every entry, and the templates of the
 * messages that are kept in English and translated where they are shown.
 */
const CATALOGS: Readonly<Record<Exclude<Language, 'en'>, { all: Catalog; messages: Catalog }>> = {
  es: { all: { ...esUi, ...esMessages }, messages: esMessages },
};

/** The catalog a language looks texts up in; none for English. */
export function catalogOf(language: Language): Catalog | undefined {
  return language === 'en' ? undefined : CATALOGS[language].all;
}

/** The templates a language matches messages against: its catalog's `messages` section. */
function templatesIn(language: Language): Template[] {
  return language === 'en' ? [] : templatesOf(CATALOGS[language].messages);
}

/**
 * A catalog's entry for a key, if it has one of its own: a text such as "constructor" never finds
 * what every object inherits.
 */
function entryOf(catalog: Catalog | undefined, key: string): Entry | undefined {
  return catalog !== undefined && Object.hasOwn(catalog, key) ? catalog[key] : undefined;
}

/** The key a text has in a catalog: the text itself, or the "other" form of a plural. */
export function keyOf(text: Text): string {
  return typeof text === 'string' ? text : text.other;
}

const pluralRules = new Map<Language, Intl.PluralRules>();

/**
 * The form a count takes in a language: "one" or "other". The forms other languages have, such as
 * Spanish's "many" for a million, take "other".
 */
export function formOf(language: Language, count: number): 'one' | 'other' {
  let rules = pluralRules.get(language);
  if (rules === undefined) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(count) === 'one' ? 'one' : 'other';
}

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
const ENGLISH_ORDINALS: Readonly<Record<string, string>> = { one: 'st', two: 'nd', few: 'rd' };

/** A place in an order, as a language writes it: "21st" in English, "21.º" in Spanish. */
export function ordinalIn(language: Language, place: number): string {
  if (language === 'es') return `${place}.º`;
  return `${place}${ENGLISH_ORDINALS[ordinalRules.select(place)] ?? 'th'}`;
}

const BRACES = /\{(\w+)\}/g;

/** Writes the values into a text's braces; a brace with no value stays as it is. */
export function fill(text: string, values?: Values): string {
  if (values === undefined) return text;
  return text.replace(BRACES, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/** The names a text has in braces, in order. */
export function bracesOf(text: string): string[] {
  return [...text.matchAll(BRACES)].map((match) => match[1] as string);
}

/**
 * A text in a language: the catalog's entry for it, or the English when there is none, with the right
 * form for the count and the values written in.
 */
export function translate(language: Language, text: Text, values?: Values): string {
  const found = entryOf(catalogOf(language), keyOf(text));
  // A text with no entry shows in English, with English's form for the count.
  const [entry, rules] = found === undefined ? [text, 'en' as const] : [found, language];
  return fill(typeof entry === 'string' ? entry : pick(entry, rules, values), values);
}

function pick(entry: PluralText, language: Language, values: Values | undefined): string {
  const count = Number(values?.count);
  return Number.isFinite(count) && formOf(language, count) === 'one' ? entry.one : entry.other;
}

/*
 * Messages: what the core and the local program write, and what the app keeps in English to show
 * later, such as notices and the labels of the undo history.
 *
 * A message is matched first as it is against every entry, then against the keys of the catalog's
 * `messages` section, as templates; the app's own texts with braces are never templates, so that a
 * loose one such as "{from} to {to}" never takes a message apart. A template's braces stand for parts
 * of the message: what people wrote, such as names, which is never translated, or, for the names
 * below, a part that is a message itself and is translated in turn. A message that matches no template
 * as a whole is translated sentence by sentence, and line by line, as the problems of a refused
 * command are joined.
 */

/**
 * The braces whose parts are messages themselves, such as the reason after "Could not undo:", a phrase
 * the core builds, such as `the component "Service"` in "The fill of {of} must be a color", or a list
 * of such phrases, such as "3 elements, 2 relations and 1 view" or `"A" and "B"`.
 */
export const NESTED_VALUES: ReadonlySet<string> = new Set([
  'of',
  'Of',
  'why',
  'things',
  'shapes',
  'moved',
  'base',
  'owner',
  'users',
  'step',
  'names',
  'members',
  'images',
  'scenarios',
  'choices',
  'removed',
]);

/**
 * What each brace matches by its name: a number, a path, a message, or what people wrote, which never
 * runs on from a quoted name's sentence into the next one.
 */
function patternOf(name: string): string {
  if (/^(n|m|number|total|position|first|last|amount|limit|rest)$/.test(name)) {
    return '(\\d+(?:[.,]\\d+)?)';
  }
  if (name === 'file' || name === 'path') return '(\\S+)';
  if (NESTED_VALUES.has(name)) return '(.+?)';
  return '((?:(?!["”][.!?] \\p{Lu}).)+?)';
}

interface Template {
  key: string;
  names: string[];
  pattern: RegExp;
  /** How many characters of the key are not braces: the more, the sooner it is tried. */
  literal: number;
  prefix: string;
  suffix: string;
}

const compiled = new WeakMap<Catalog, Template[]>();

function templatesOf(catalog: Catalog): Template[] {
  let templates = compiled.get(catalog);
  if (templates !== undefined) return templates;
  templates = [];
  for (const key of Object.keys(catalog)) {
    const names = bracesOf(key);
    if (names.length === 0) continue;
    const parts = key.split(BRACES);
    // split() with a capture group alternates text and brace names.
    const literals = parts.filter((_, at) => at % 2 === 0);
    const source = parts
      .map((part, at) => (at % 2 === 0 ? escapeRegExp(part) : patternOf(part)))
      .join('');
    templates.push({
      key,
      names,
      pattern: new RegExp(`^${source}$`, 'u'),
      literal: literals.join('').length,
      prefix: literals[0] ?? '',
      suffix: literals.at(-1) ?? '',
    });
  }
  templates.sort((a, b) => b.literal - a.literal);
  compiled.set(catalog, templates);
  return templates;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A message in a language, and the parts of it no entry translates. */
interface Translated {
  text: string;
  missing: string[];
}

/**
 * A message the core or the local program wrote, in a language: through the catalog's templates, part
 * by part, with what no entry translates left in English.
 */
export function translateMessage(language: Language, message: string): string {
  return messageIn(language, message).text;
}

/** The parts of a message that no entry translates into a language: none when all of it is. */
export function untranslatedParts(language: Language, message: string): string[] {
  return messageIn(language, message).missing;
}

function messageIn(language: Language, message: string): Translated {
  const catalog = catalogOf(language);
  if (catalog === undefined) return { text: message, missing: [] };
  const lines = message.split('\n').map((line) => lineIn(language, catalog, line, 0));
  return {
    text: lines.map((line) => line.text).join('\n'),
    missing: lines.flatMap((line) => line.missing),
  };
}

/** How deep parts that are messages may nest; deeper ones stay as they are. */
const MAX_DEPTH = 6;

/** A line: as a whole, or sentence by sentence. */
function lineIn(language: Language, catalog: Catalog, line: string, depth: number): Translated {
  if (line.trim() === '') return { text: line, missing: [] };
  const whole = matchIn(language, catalog, line, depth);
  if (whole !== undefined) return whole;
  const ends = sentenceEnds(line);
  // The longest first part that a key matches, then the rest the same way.
  for (let at = ends.length - 1; at >= 0; at--) {
    const end = ends[at] as number;
    const first = matchIn(language, catalog, line.slice(0, end), depth);
    if (first === undefined) continue;
    const rest = lineIn(language, catalog, line.slice(end).trimStart(), depth);
    return { text: `${first.text} ${rest.text}`, missing: [...first.missing, ...rest.missing] };
  }
  const [end] = ends;
  if (end === undefined) return { text: line, missing: [line] };
  const sentence = line.slice(0, end);
  const rest = lineIn(language, catalog, line.slice(end).trimStart(), depth);
  return { text: `${sentence} ${rest.text}`, missing: [sentence, ...rest.missing] };
}

/** Where the sentences of a line end: after a full stop, a question or an exclamation and a space. */
function sentenceEnds(line: string): number[] {
  const ends: number[] = [];
  for (const match of line.matchAll(/[.!?][”"')]?(?= )/g)) {
    ends.push(match.index + match[0].length);
  }
  return ends;
}

/** A text as a whole: an entry for it, or a template it fits; undefined when none. */
function matchIn(
  language: Language,
  catalog: Catalog,
  text: string,
  depth: number,
): Translated | undefined {
  const exact = entryOf(catalog, text);
  if (exact !== undefined) {
    return { text: typeof exact === 'string' ? exact : exact.other, missing: [] };
  }
  if (depth >= MAX_DEPTH) return undefined;
  for (const template of templatesIn(language)) {
    if (!text.startsWith(template.prefix) || !text.endsWith(template.suffix)) continue;
    const found = template.pattern.exec(text);
    if (found === null) continue;
    const values: Record<string, string> = {};
    const missing: string[] = [];
    template.names.forEach((name, at) => {
      const value = found[at + 1] as string;
      if (!NESTED_VALUES.has(name) || /^\d+$/.test(value)) {
        values[name] = value;
        return;
      }
      const part = valueIn(language, catalog, value, depth + 1);
      values[name] = part.text;
      missing.push(...part.missing);
    });
    const entry = catalog[template.key] as Entry;
    const count = Number(values.count ?? values.n);
    const form =
      typeof entry === 'string'
        ? entry
        : Number.isFinite(count) && formOf(language, count) === 'one'
          ? entry.one
          : entry.other;
    return { text: fillJoined(language, form, values), missing };
  }
  return undefined;
}

/**
 * A part of a message that is a message itself: a list of such parts, when every item has an entry,
 * so that `"A" or "B"` is not read as one name; or else as a whole.
 */
function valueIn(language: Language, catalog: Catalog, value: string, depth: number): Translated {
  return listIn(language, catalog, value, depth) ?? lineIn(language, catalog, value, depth);
}

/**
 * A list, as in "3 elements, 2 relations and 1 view" or `"A" or "B"`: each item translated, and joined
 * as the language joins lists, with the catalog's entries for " and " and " or ". Undefined unless every
 * item has an entry. A list whose items say "and" or "or" themselves, as in "1 EXIF or XMP segment, 2
 * comments", is read by its commas alone.
 */
function listIn(
  language: Language,
  catalog: Catalog,
  value: string,
  depth: number,
): Translated | undefined {
  return (
    listBy(/(, | and | or )/, language, catalog, value, depth) ??
    listBy(/(, )/, language, catalog, value, depth)
  );
}

function listBy(
  separators: RegExp,
  language: Language,
  catalog: Catalog,
  value: string,
  depth: number,
): Translated | undefined {
  const parts = value.split(separators);
  if (parts.length < 3) return undefined;
  let text = '';
  for (const [at, part] of parts.entries()) {
    if (at % 2 === 1) {
      const joiner = entryOf(catalog, part);
      text += typeof joiner === 'string' ? joiner : part;
      continue;
    }
    const item = matchIn(language, catalog, part, depth);
    if (item === undefined || item.missing.length > 0) return undefined;
    text += item.text;
  }
  return { text, missing: [] };
}

/** Writes the values in, joining each to the words before it as the language does. */
function fillJoined(language: Language, text: string, values: Values): string {
  let result = '';
  let last = 0;
  for (const match of text.matchAll(BRACES)) {
    result += text.slice(last, match.index);
    last = match.index + match[0].length;
    const value = values[match[1] as string];
    if (value === undefined) {
      result += match[0];
      continue;
    }
    const joined = join(language, result, String(value));
    result = joined.before + joined.value;
  }
  return result + text.slice(last);
}

/** Spanish says "del" for "de el" and "al" for "a el", where a phrase starting "el" follows. */
function join(
  language: Language,
  before: string,
  value: string,
): { before: string; value: string } {
  if (language !== 'es' || !value.startsWith('el ')) return { before, value };
  const found = /(^|\s)(de|a) $/i.exec(before);
  if (found === null) return { before, value };
  const contracted = found[2]?.toLowerCase() === 'de' ? 'del' : 'al';
  return {
    before: `${before.slice(0, found.index)}${found[1] ?? ''}${contracted} `,
    value: value.slice('el '.length),
  };
}
