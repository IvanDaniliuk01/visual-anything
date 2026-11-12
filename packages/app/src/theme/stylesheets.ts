/**
 * The app's stylesheets read as text, for the tests that hold them to the tokens and to the states of
 * controls: jsdom loads no CSS, so these tests read the files themselves.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SOURCE_FOLDER, readSource } from './testing';

/** A style rule of a stylesheet: its selector, as written, and its declarations. */
export interface StyleRule {
  path: string;
  /** The line its selector starts on. */
  line: number;
  selector: string;
  declarations: Declaration[];
}

export interface Declaration {
  property: string;
  value: string;
}

/**
 * Stylesheets generated from what others wrote, which keep their own values: the tokens, and KaTeX's
 * rules and fonts, taken from the pinned KaTeX by `text/generate-katex-css.ts` (ADR 0106), whose
 * lengths are TeX's and whose sizes are relative to the text a formula sits in.
 */
const GENERATED = new Set(['theme/tokens.css', 'text/katex.css', 'text/katex-fonts.css']);

/** Every stylesheet of the app, by its path from `src`, but the generated ones. */
export function stylesheets(): string[] {
  return readdirSync(SOURCE_FOLDER, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => relative(SOURCE_FOLDER, join(SOURCE_FOLDER, path)).replaceAll('\\', '/'))
    .filter((path) => !GENERATED.has(path))
    .sort();
}

/** The text of a stylesheet with its comments blanked out, so that positions keep their lines. */
export function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/**
 * The rules of a stylesheet that hold declarations. At-rules that wrap rules, such as `@media`, are
 * looked through, and their conditions, which cannot take a CSS variable, are not rules.
 */
export function rulesOf(path: string): StyleRule[] {
  const text = withoutComments(readSource(path));
  const rules: StyleRule[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, whole = '', body = ''] = match;
    // A statement such as `@import …;` may come before the selector.
    const cut = whole.lastIndexOf(';') + 1;
    const prelude = whole.slice(cut);
    const selector = prelude.trim();
    if (selector.startsWith('@')) continue;
    const offset = (match.index ?? 0) + cut + prelude.length - prelude.trimStart().length;
    rules.push({
      path,
      line: text.slice(0, offset).split('\n').length,
      selector: selector.replace(/\s+/g, ' '),
      declarations: declarationsOf(body),
    });
  }
  return rules;
}

function declarationsOf(body: string): Declaration[] {
  return [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)(?:;|$)/g)].map(
    ([, property = '', value = '']) => ({
      property: property.toLowerCase(),
      value: value.trim(),
    }),
  );
}

/** Every rule of every stylesheet of the app. */
export function allRules(): StyleRule[] {
  return stylesheets().flatMap(rulesOf);
}

/**
 * The selectors of a selector list, one by one, with each `:is()` or `:where()` list opened into its
 * alternatives: `:where(.a, .b):hover` is `.a:hover` and `.b:hover`.
 */
export function selectorsOf(list: string): string[] {
  return splitTopLevel(list).flatMap(openAlternatives);
}

function openAlternatives(selector: string): string[] {
  const match = /:(?:is|where)\(/.exec(selector);
  if (match === null) return [selector.trim()];
  const start = match.index + match[0].length;
  const end = closingParenthesis(selector, start - 1);
  const before = selector.slice(0, match.index);
  const after = selector.slice(end + 1);
  return splitTopLevel(selector.slice(start, end)).flatMap((alternative) =>
    openAlternatives(`${before}${alternative.trim()}${after}`),
  );
}

/** The index of the parenthesis that closes the one at `open`. */
export function closingParenthesis(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

/** A list split at its commas, but not at those inside parentheses or brackets. */
export function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of list) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}
