/**
 * The styles a drawing keeps (ADR 0068): `<style>` rules that select by an element name, a class, an id
 * or a comma list of these, and `style` attributes, each declaration kept only when its property is on
 * the allow-list of what the layout step lays out and the SVG cleaner keeps, and its value is made of a
 * narrow class of characters calling only colour, gradient, size and transform functions. `url(…)` is
 * never kept, so a style can load nothing. Everything else is dropped, and reported.
 *
 * Reading costs no more than a constant times the text: every `@` rule is skipped whole, braces are
 * counted once, and the caps on rules and selectors refuse a sheet before its rules are indexed.
 */
import { HTML_CAPS } from './caps';
import { tooLarge } from './read';
import type { DrawingReport } from './report';

/** A declaration as kept: its property in camel case, as the layout step takes it, and its value. */
export type Declaration = readonly [property: string, value: string];

/** A rule that folds, with its place among the rules. */
export interface FoldedRule {
  order: number;
  declarations: readonly Declaration[];
}

/** The rules that fold, by the element name, the class or the id they select, in order. */
export interface StyleIndex {
  byElement: Map<string, FoldedRule[]>;
  byClass: Map<string, FoldedRule[]>;
  byId: Map<string, FoldedRule[]>;
}

/** The properties kept, by their CSS name. */
const PROPERTIES = new Set(
  [
    // display, and the flex and grid properties
    'display flex flex-direction flex-wrap flex-flow flex-grow flex-shrink flex-basis order',
    'align-items align-content align-self justify-content justify-items justify-self',
    'place-items place-content place-self',
    'grid grid-template grid-template-columns grid-template-rows grid-template-areas',
    'grid-auto-columns grid-auto-rows grid-auto-flow grid-area grid-row grid-row-start grid-row-end',
    'grid-column grid-column-start grid-column-end',
    // sizes, margins, paddings and gaps
    'width height min-width min-height max-width max-height aspect-ratio box-sizing',
    'margin margin-top margin-right margin-bottom margin-left',
    'padding padding-top padding-right padding-bottom padding-left gap row-gap column-gap',
    // borders and their parts, and rounded corners
    'border border-width border-style border-color',
    'border-top border-right border-bottom border-left',
    'border-top-width border-right-width border-bottom-width border-left-width',
    'border-top-style border-right-style border-bottom-style border-left-style',
    'border-top-color border-right-color border-bottom-color border-left-color',
    'border-radius border-top-left-radius border-top-right-radius',
    'border-bottom-left-radius border-bottom-right-radius',
    // backgrounds: colours, and gradients
    'background background-color background-image',
    // text
    'color font-size font-weight font-style line-height letter-spacing text-align',
    'text-decoration text-decoration-line text-decoration-color text-decoration-style',
    'text-transform white-space word-break',
    // the rest
    'opacity position top right bottom left inset overflow transform',
  ]
    .join(' ')
    .split(' '),
);

/** The values a property takes when it takes only keywords. */
const KEYWORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  display: new Set(['flex', 'block', 'grid', 'none']),
  overflow: new Set(['hidden']),
  position: new Set(['static', 'relative', 'absolute']),
  'white-space': new Set(['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces']),
  'word-break': new Set(['normal', 'break-all', 'keep-all', 'break-word']),
  'text-align': new Set(['left', 'right', 'center', 'justify', 'start', 'end']),
  'text-transform': new Set(['none', 'uppercase', 'lowercase', 'capitalize']),
  'font-style': new Set(['normal', 'italic', 'oblique']),
  'box-sizing': new Set(['border-box', 'content-box']),
};

/** The functions a value may call. `url` is never one, nor anything that loads or refers. */
const FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'linear-gradient',
  'radial-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'calc',
  'min',
  'max',
  'clamp',
  'minmax',
  'repeat',
  'fit-content',
  'translate',
  'translatex',
  'translatey',
  'scale',
  'scalex',
  'scaley',
  'rotate',
  'skew',
  'skewx',
  'skewy',
  'matrix',
]);

/** The functions that make a background image: gradients only. */
const GRADIENTS = new Set([
  'linear-gradient',
  'radial-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
]);

/** The characters a value may hold: no quotes, colons, semicolons, backslashes, braces or `@`. */
const VALUE = /^[-+.,%#()*/\w\s]*$/;
/** The characters of a grid's areas, which name them in quotes. */
const AREAS = /^[-.\w\s"']*$/;
/** A function called in a value, by the name right before its parenthesis. */
const CALL = /([A-Za-z-]*)\(/g;

const CLASS = /^\.(-?[A-Za-z_][\w-]*)$/;
const ID = /^#(-?[A-Za-z_][\w-]*)$/;
const ELEMENT = /^[A-Za-z][A-Za-z0-9]*$/;

/** The property's name in camel case, as the layout step takes it: `background-color`, `backgroundColor`. */
export function camelCase(property: string): string {
  return property.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase());
}

/** Reads every `<style>` element's text into the rules that fold, refusing a sheet past the caps. */
export function readStyleSheets(texts: readonly string[], report: DrawingReport): StyleIndex {
  const index: StyleIndex = { byElement: new Map(), byClass: new Map(), byId: new Map() };
  let counted = 0;
  for (const text of texts) {
    for (const rule of parseCss(text)) {
      counted += 1;
      if (counted > HTML_CAPS.styleRules) {
        tooLarge(`The HTML has over ${HTML_CAPS.styleRules} style rules.`);
      }
      if (rule.at) {
        report.add('@ rule');
        continue;
      }
      const selectors = rule.selectors.split(',').map((each) => each.trim());
      if (selectors.length > HTML_CAPS.selectorsPerRule) {
        tooLarge(`A style rule has over ${HTML_CAPS.selectorsPerRule} selectors.`);
      }
      const read = selectors.map(selectorOf);
      if (read.some((each) => each === undefined)) {
        report.add(
          'style rule that selects by more than an element name, a class or an id',
          'style rules that select by more than an element name, a class or an id',
        );
        continue;
      }
      const folded: FoldedRule = {
        order: counted,
        declarations: keptDeclarations(parseDeclarations(rule.body), report),
      };
      if (folded.declarations.length === 0) continue;
      const seen = new Set<string>();
      for (const selector of read as Selector[]) {
        const key = `${selector.kind}|${selector.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const byName =
          selector.kind === 'class'
            ? index.byClass
            : selector.kind === 'id'
              ? index.byId
              : index.byElement;
        const list = byName.get(selector.name);
        if (list) list.push(folded);
        else byName.set(selector.name, [folded]);
      }
    }
  }
  return index;
}

interface Selector {
  kind: 'element' | 'class' | 'id';
  name: string;
}

/** A selector of one element name, one class or one id; anything else is not one. */
function selectorOf(text: string): Selector | undefined {
  const byClass = CLASS.exec(text);
  if (byClass) return { kind: 'class', name: byClass[1] as string };
  const byId = ID.exec(text);
  if (byId) return { kind: 'id', name: byId[1] as string };
  if (ELEMENT.test(text)) return { kind: 'element', name: text.toLowerCase() };
  return undefined;
}

/** The rules of a style sheet: `@` rules, or selectors with a block of declarations. */
function parseCss(text: string): { at: boolean; selectors: string; body: string }[] {
  const css = text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
  const rules: { at: boolean; selectors: string; body: string }[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css.charAt(i))) i++;
    if (i >= css.length) break;
    const at = css[i] === '@';
    let j = i;
    while (j < css.length && css[j] !== '{' && !(at && css[j] === ';')) j++;
    const selectors = css.slice(i, j);
    if (j >= css.length || css[j] === ';') {
      if (at) rules.push({ at, selectors, body: '' });
      i = j + 1;
      continue;
    }
    let depth = 0;
    let k = j;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}' && --depth === 0) break;
    }
    rules.push({ at, selectors, body: css.slice(j + 1, k) });
    i = k + 1;
  }
  return rules;
}

/** The declarations of a block or a `style` attribute, by property name in lower case. */
export function parseDeclarations(body: string): [string, string][] {
  const declarations: [string, string][] = [];
  const text = body.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    if (property !== '') declarations.push([property, value]);
  }
  return declarations;
}

/** The declarations kept, in camel case, each one dropped reported. */
export function keptDeclarations(
  declarations: readonly (readonly [string, string])[],
  report: DrawingReport,
): Declaration[] {
  const kept: Declaration[] = [];
  for (const [property, value] of declarations) {
    if (!PROPERTIES.has(property)) {
      report.add(
        'style declaration the drawing does not lay out',
        'style declarations the drawing does not lay out',
      );
      continue;
    }
    if (!keptValue(property, value)) {
      report.add('value that is not allowed', 'values that are not allowed');
      continue;
    }
    // satori paints gradients through SVG patterns, which the SVG cleaner drops (ADR 0027).
    if (BACKGROUNDS.has(property) && hasGradient(value)) {
      report.add(
        'gradient background the picture cannot keep',
        'gradient backgrounds the picture cannot keep',
      );
      continue;
    }
    kept.push([camelCase(property), value]);
  }
  return kept;
}

/** The properties that paint a background. */
const BACKGROUNDS = new Set(['background', 'background-image']);

/** Whether a value calls a gradient. */
function hasGradient(value: string): boolean {
  return [...value.matchAll(CALL)].some((each) => GRADIENTS.has((each[1] ?? '').toLowerCase()));
}

/** Whether a property's value is kept. */
function keptValue(property: string, value: string): boolean {
  if (value === '' || value.length > HTML_CAPS.valueLength) return false;
  const keywords = KEYWORDS[property];
  if (keywords !== undefined) return keywords.has(value.toLowerCase());
  const areas = property === 'grid-template-areas';
  if (!(areas ? AREAS : VALUE).test(value)) return false;
  // Every parenthesis opens a function of the list, named right before it.
  const opened = (value.match(/\(/g) ?? []).length;
  const called = [...value.matchAll(CALL)].map((each) => (each[1] ?? '').toLowerCase());
  if (called.length !== opened || called.some((name) => !FUNCTIONS.has(name))) return false;
  if (property === 'background-image') {
    return value.toLowerCase() === 'none' || called.some((name) => GRADIENTS.has(name));
  }
  return true;
}
