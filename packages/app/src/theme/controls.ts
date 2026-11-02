/**
 * What the control-state test reads: the controls the app's components render, found in their source,
 * and the rules of the stylesheets that give controls their look and their states.
 */
import { readdirSync } from 'node:fs';
import { SOURCE_FOLDER, readSource } from './testing';
import { allRules, closingParenthesis, selectorsOf, type StyleRule } from './stylesheets';

/** The elements that are controls by their tag, and the roles that make any element one. */
const CONTROL_TAGS = ['button', 'select', 'input', 'textarea', 'summary'] as const;
const CONTROL_ROLES =
  /^(?:menuitem|menuitemcheckbox|menuitemradio|option|tab|switch|treeitem|gridcell|button|radio|slider|checkbox)$/;

/** The source files of the app's components, by their paths from `src`. */
export function componentFiles(): string[] {
  return readdirSync(SOURCE_FOLDER, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.tsx') && !/\.test\.tsx$/.test(path))
    .sort();
}

/** An element as a component writes it: its tag and the text of its attributes. */
export interface WrittenElement {
  path: string;
  line: number;
  tag: string;
  attributes: string;
}

/**
 * The opening tags of JSX elements in a component's source, attributes and all: a tag ends at the
 * first `>` outside braces, strings and template literals.
 */
export function elementsIn(path: string): WrittenElement[] {
  const text = readSource(path);
  const elements: WrittenElement[] = [];
  for (const match of text.matchAll(/<([a-z][\w-]*)(?=[\s/>])/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = endOfTag(text, start);
    if (end < 0) continue;
    elements.push({
      path,
      line: text.slice(0, match.index).split('\n').length,
      tag: match[1] ?? '',
      attributes: text.slice(start, end),
    });
  }
  return elements;
}

function endOfTag(text: string, from: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = from; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== undefined) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      // Outside braces, only the quotes of attribute values open strings.
      if (depth > 0 || character !== '`') quote = character;
    } else if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth === 0) return index;
    else if (character === '<' && depth === 0) return -1;
  }
  return -1;
}

/** The value of an attribute written as a string, such as `role="menuitem"`. */
export function stringAttribute(attributes: string, name: string): string | undefined {
  return new RegExp(`(?<![\\w-])${name}=(?:"([^"]*)"|'([^']*)'|\\{'([^']*)'\\})`)
    .exec(attributes)
    ?.slice(1)
    .find((value) => value !== undefined);
}

/** The class names an element may take: every word of every string in its `className`. */
export function classNamesOf(attributes: string): string[] {
  const at = /(?<![\w-])className=/.exec(attributes);
  if (at === null) return [];
  const rest = attributes.slice(at.index + at[0].length);
  const value = rest.startsWith('{')
    ? rest.slice(0, closingBrace(rest) + 1)
    : (/^"[^"]*"|^'[^']*'/.exec(rest)?.[0] ?? '');
  // The words of a template literal outside its `${…}`, and every quoted string, inside them too.
  const strings = [
    ...[...value.matchAll(/`([^`]*)`/g)].map(([, template = '']) =>
      template.replace(/\$\{[^}]*\}/g, ' '),
    ),
    ...[...value.matchAll(/"([^"]*)"|'([^']*)'/g)].map(
      ([, double, single]) => double ?? single ?? '',
    ),
  ];
  return strings.flatMap((text) => text.split(/\s+/)).filter((name) => /^[a-z][\w-]*$/i.test(name));
}

function closingBrace(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

/** Whether an element is a control: a button, field, list of choices, disclosure or menu item. */
export function isControl(element: WrittenElement): boolean {
  if ((CONTROL_TAGS as readonly string[]).includes(element.tag)) {
    return stringAttribute(element.attributes, 'type') !== 'hidden';
  }
  if (CONTROL_ROLES.test(stringAttribute(element.attributes, 'role') ?? '')) return true;
  // A `<pre>` the keyboard reaches only scrolls, as the code to approve does: it is no control.
  if (element.tag === 'pre') return false;
  // An element the keyboard reaches by its tabIndex is a control too, whatever its tag.
  return /(?<![\w-])tabIndex=(?:\{0\}|"0")/.test(element.attributes);
}

/**
 * The class names the app's components put on controls, each with the others written beside it on
 * the same control, such as a modifier beside the base class it shares (`scenario-record` beside
 * `scenario-button`), and the tag it is written on as `<button>`, `<select>` and so on.
 */
export function controlClasses(): Map<string, Set<string>> {
  const classes = new Map<string, Set<string>>();
  for (const element of componentFiles().flatMap(elementsIn).filter(isControl)) {
    const names = classNamesOf(element.attributes);
    for (const name of names) {
      const beside = classes.get(name) ?? new Set<string>();
      for (const other of names) if (other !== name) beside.add(other);
      if ((CONTROL_TAGS as readonly string[]).includes(element.tag)) beside.add(`<${element.tag}>`);
      classes.set(name, beside);
    }
  }
  return classes;
}

/** The states a control shows, as the selectors of its rules name them. */
export type ControlState = 'hover' | 'active' | 'disabled' | 'focus-visible';

const STATE_PATTERNS: Record<ControlState, RegExp> = {
  hover: /:hover\b/,
  active: /:active\b/,
  disabled: /:disabled\b|\[aria-disabled/,
  'focus-visible': /:focus-visible\b/,
};

/** Properties whose values make a control's look: setting one takes over the browser's own states. */
const LOOK =
  /^(?:background(?:-color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?|box-shadow|outline)$/;

/** A selector with what says a state taken out: the pseudo-classes of states and the ARIA and data attributes. */
export function withoutStates(selector: string): string {
  let result = '';
  for (let index = 0; index < selector.length; index += 1) {
    const rest = selector.slice(index);
    const functional = /^:(?:not|has)\(/.exec(rest);
    if (functional !== null) {
      index = closingParenthesis(selector, index + functional[0].length - 1);
      continue;
    }
    const pseudo =
      /^:(?:hover|active|focus-visible|focus-within|focus|disabled|enabled|checked|indeterminate)\b/.exec(
        rest,
      );
    if (pseudo !== null) {
      index += pseudo[0].length - 1;
      continue;
    }
    const attribute = /^\[(?:aria-[\w-]+|data-[\w-]+|open)(?:[~|^$*]?=[^\]]*)?\]/.exec(rest);
    if (attribute !== null) {
      index += attribute[0].length - 1;
      continue;
    }
    result += selector[index];
  }
  return (
    result
      .replace(/\s*([>+~])\s*/g, ' $1 ')
      .replace(/\s+/g, ' ')
      // `button.comment-mention` is the control `.comment-mention` names.
      .replace(/(^|[\s>+~])(?:button|select|textarea|input)(?=\.)/g, '$1')
      .trim()
  );
}

/** The last compound of a selector: what it selects. */
export function subjectOf(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(character ?? '')) start = index + 1;
  }
  return selector.slice(start);
}

/** Whether what a selector selects is a control, by its tag, its role or one of the classes given. */
export function selectsControl(selector: string, classes: ReadonlyMap<string, unknown>): boolean {
  const subject = subjectOf(withoutStates(selector));
  // A pseudo-element is drawn by the control, and what is visually hidden is not drawn at all.
  if (subject.includes('::') || subject.includes('.visually-hidden')) return false;
  if (/^(?:button|select|textarea|summary)\b/.test(subject)) return true;
  if (/^input\b/.test(subject)) return !/\[type=['"]?hidden/.test(subject);
  if (/\[role=['"]?(?:menuitem|option|tab|switch)/.test(subject)) return true;
  // An element of another tag that shares a control's class, such as a mention written as text.
  if (/^[a-z]/i.test(subject)) return false;
  return [...subject.matchAll(/\.([\w-]+)/g)].some(([, name]) => classes.has(name ?? ''));
}

/** A control as the stylesheets style it: the selector of its look and the states its rules give. */
export interface StyledControl {
  selector: string;
  where: string;
  /** The look properties its rules set without a state. */
  look: Set<string>;
  states: Set<ControlState>;
}

/** Every control the stylesheets give a look of their own, by its selector without states. */
export function styledControls(
  classes: ReadonlyMap<string, unknown> = controlClasses(),
  rules: readonly StyleRule[] = allRules(),
): Map<string, StyledControl> {
  const controls = new Map<string, StyledControl>();
  const entry = (key: string, rule: StyleRule): StyledControl => {
    let control = controls.get(key);
    if (control === undefined) {
      control = {
        selector: key,
        where: `${rule.path}:${rule.line}`,
        look: new Set(),
        states: new Set(),
      };
      controls.set(key, control);
    }
    return control;
  };
  for (const rule of rules) {
    for (const selector of selectorsOf(rule.selector)) {
      if (!selectsControl(selector, classes)) continue;
      const key = withoutStates(selector);
      const control = entry(key, rule);
      const states = (Object.keys(STATE_PATTERNS) as ControlState[]).filter((state) =>
        STATE_PATTERNS[state].test(subjectOf(selector)),
      );
      for (const state of states) control.states.add(state);
      if (states.length === 0 && !/:(?:hover|active|focus)/.test(selector)) {
        for (const { property } of rule.declarations)
          if (LOOK.test(property)) control.look.add(property);
      }
    }
  }
  return controls;
}

/**
 * The states the rules give a control: its own, those of rules for what it selects in any place
 * (`.option:hover` gives `.option + .option` its hover too), and those of the base class written
 * beside its class on the same control (`.scenario-button:hover` gives `.scenario-record` its hover).
 */
export function statesGiven(
  selector: string,
  controls: ReadonlyMap<string, StyledControl>,
  classes: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Set<ControlState> {
  const subject = subjectOf(selector);
  const context = selector.slice(0, selector.length - subject.length);
  const alike = [selector];
  for (const [, name = ''] of subject.matchAll(/\.([\w-]+)/g)) {
    for (const base of classes.get(name) ?? []) {
      const tag = /^<(\w+)>$/.exec(base)?.[1];
      if (tag !== undefined) {
        // `.canvas-menu button:hover` reaches `.canvas-menu .canvas-menu-cancel`, written on a button.
        alike.push(`${context}${tag}${subject}`);
        continue;
      }
      alike.push(`${context}${subject.replace(`.${name}`, `.${base}`)}`);
      alike.push(`.${base}`);
    }
  }
  const states = new Set<ControlState>();
  for (const [other, control] of controls) {
    if (!alike.some((one) => covers(other, one))) continue;
    for (const state of control.states) states.add(state);
  }
  return states;
}

/**
 * Whether the rules of one selector reach every element another selects: the same place or a wider
 * one, and a subject that asks for no more, as `.inspector input` reaches `.inspector input[type='text']`.
 */
function covers(wider: string, narrower: string): boolean {
  if (wider === narrower || narrower.endsWith(` ${wider}`)) return true;
  const subject = subjectOf(wider);
  const place = wider.slice(0, wider.length - subject.length).trim();
  const narrowerSubject = subjectOf(narrower);
  const narrowerPlace = narrower.slice(0, narrower.length - narrowerSubject.length).trim();
  if (place !== '' && narrowerPlace !== place && !narrowerPlace.endsWith(` ${place}`)) return false;
  const parts = (compound: string) => [...new Set(compound.match(/[.#]?[\w-]+|\[[^\]]*\]/g) ?? [])];
  // The shared rules of bare elements, such as `button:disabled`, lose to any class's own look.
  if (place === '' && !parts(subject).some((part) => part.startsWith('.'))) return false;
  const asked = new Set(parts(narrowerSubject));
  return parts(subject).every((part) => asked.has(part));
}

/**
 * The states a control styled with this look must give itself, since the shared rules of `styles.css`
 * cannot: the browser's own hover and pressed looks go once a control has a background or a border
 * of its own, the shared muted color of what cannot be used loses to a color it sets, and the shared
 * focus ring to an outline it sets.
 */
export function statesNeeded(look: ReadonlySet<string>, selector = ''): ControlState[] {
  if (look.size === 0) return [];
  const needed: ControlState[] = ['hover', 'active'];
  // A disclosure's summary cannot be disabled: HTML gives it no such state.
  if (look.has('color') && !/(?:^|\s)summary$/.test(subjectOf(selector))) needed.push('disabled');
  if (look.has('outline')) needed.push('focus-visible');
  return needed;
}
