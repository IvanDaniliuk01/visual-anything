/**
 * The style subset of faces (ADR 0083): rules whose selectors are an element, a class, both, or those
 * joined by spaces for descendants, in a comma list; and inline `style`. Rules apply in the cascade's
 * order, by specificity and then by place, and inline style last. There are no `@` rules, no `url()`
 * and no `!important`. Everything else is dropped and reported with its line and column, as ADR 0068
 * reports what it drops; values must belong to the narrow class of characters ADR 0068 allows.
 */
import { FACE_CAPS, FACE_FONT_SIZES } from './limits';
import { Positions, type Position } from './reader';

// ——— Values ——————————————————————————————————————————————————————————————————————————————————————

/** A theme's color a face may name with `var(--…)`. */
export type FaceToken =
  | 'fill'
  | 'stroke'
  | 'text'
  | 'text-muted'
  | 'highlight'
  | 'code-back'
  | 'row-separator'
  | 'canvas';

export const FACE_TOKENS: readonly FaceToken[] = [
  'fill',
  'stroke',
  'text',
  'text-muted',
  'highlight',
  'code-back',
  'row-separator',
  'canvas',
];

/** A color in a face: `#RRGGBB` in capitals, or a token, drawn in the theme's color for it. */
export type FaceColor = string;

/** Whether a face's color is one of the theme's tokens. */
export function isFaceToken(color: FaceColor): color is FaceToken {
  return (FACE_TOKENS as readonly string[]).includes(color);
}

export type Length = { px: number } | { percent: number };

export type Track = { px: number } | { fr: number } | 'auto';

export type Align = 'stretch' | 'start' | 'center' | 'end';

export type Justify =
  'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';

export interface Border {
  width: number;
  style: 'solid' | 'dashed';
  color: FaceColor;
}

/** How a box of a face is laid out and drawn, every property worked out. */
export interface FaceStyle {
  display: 'block' | 'flex' | 'grid' | 'none' | 'inline';
  flexDirection: 'row' | 'column';
  flexWrap: boolean;
  flexGrow: number;
  flexShrink: number;
  flexBasis: Length | 'auto';
  rowGap: number;
  columnGap: number;
  alignItems: Align;
  alignSelf: Align | 'auto';
  justifyContent: Justify;
  gridColumns?: readonly Track[];
  width?: Length;
  height?: Length;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  position: 'static' | 'absolute';
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  background?: FaceColor;
  borderTop?: Border;
  borderRight?: Border;
  borderBottom?: Border;
  borderLeft?: Border;
  borderRadius: number;
  overflowHidden: boolean;
  lineClamp?: number;
  // Inherited.
  color: FaceColor;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  /** A multiple of the size, or px. */
  lineHeight: { multiple: number } | { px: number };
  textAlign: 'left' | 'center' | 'right';
  underline: boolean;
  strike: boolean;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  nowrap: boolean;
}

/** The properties a child takes from its parent. */
const INHERITED = [
  'color',
  'fontSize',
  'bold',
  'italic',
  'mono',
  'lineHeight',
  'textAlign',
  'underline',
  'strike',
  'textTransform',
  'nowrap',
] as const satisfies readonly (keyof FaceStyle)[];

/**
 * Every property's value before anything sets it, which is also the face's own, its root's: text at
 * 11 px, as a detail is written, in the theme's text color.
 */
export const INITIAL_STYLE: FaceStyle = Object.freeze({
  display: 'block',
  flexDirection: 'row',
  flexWrap: false,
  flexGrow: 0,
  flexShrink: 1,
  flexBasis: 'auto',
  rowGap: 0,
  columnGap: 0,
  alignItems: 'stretch',
  alignSelf: 'auto',
  justifyContent: 'start',
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  position: 'static',
  borderRadius: 0,
  overflowHidden: false,
  color: 'text',
  fontSize: 11,
  bold: false,
  italic: false,
  mono: false,
  lineHeight: { multiple: 1.3 },
  textAlign: 'left',
  underline: false,
  strike: false,
  textTransform: 'none',
  nowrap: false,
});

/** One property set: a value, or for the font size a multiple of the parent's. */
export type Assignment = {
  [K in keyof FaceStyle]-?: { key: K; value: FaceStyle[K] | { scale: number } };
}[keyof FaceStyle];

/** A style rule, read. */
export interface StyleRule {
  selectors: readonly Selector[];
  assignments: readonly Assignment[];
  /** Its place among the rules. */
  order: number;
}

/** Simple selectors from the outermost to the element itself. */
export interface Selector {
  compounds: readonly Compound[];
  /** Classes count a thousand, elements one. */
  specificity: number;
}

export interface Compound {
  element?: string;
  classes: readonly string[];
}

/** Something the style dropped, where it was. */
export interface Dropped extends Position {
  reason: string;
}

// ——— Reading the style ———————————————————————————————————————————————————————————————————————————

/** The narrow class of characters values may hold (ADR 0068). */
const VALUE = /^[-+.,%#()*/\w\s]*$/;
const CLASS_NAME = /^-?[A-Za-z_][\w-]*$/;

export type StyleRead =
  | { ok: true; rules: StyleRule[]; dropped: Dropped[] }
  | { ok: false; reason: string; at: Position };

/** Reads a face's style. Only its caps refuse it; what the subset does not take is dropped. */
export function readStyle(text: string): StyleRead {
  const positions = new Positions(text);
  const dropped: Dropped[] = [];
  const drop = (offset: number, reason: string) =>
    dropped.push({ reason, ...positions.at(offset) });
  // Comments become spaces, so that places stay where they are.
  const source = text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
  const rules: StyleRule[] = [];
  let at = 0;
  while (at < source.length) {
    while (at < source.length && /\s/.test(source[at]!)) at += 1;
    if (at >= source.length) break;
    const start = at;
    const open = source.indexOf('{', at);
    const semi = source.indexOf(';', at);
    if (source[at] === '@') {
      // An @ rule ends at its ";" or with its block.
      const end = open !== -1 && (semi === -1 || open < semi) ? blockEnd(source, open) : semi;
      drop(start, '"@" rules are not part of a face: they are dropped.');
      at = end === -1 ? source.length : end + 1;
      continue;
    }
    if (open === -1) {
      drop(start, 'This text is not a rule: a rule is selectors, then declarations in braces.');
      break;
    }
    const close = source.indexOf('}', open);
    const end = close === -1 ? source.length : close;
    const nested = source.indexOf('{', open + 1);
    if (nested !== -1 && nested < end) {
      drop(start, 'Rules do not nest: this rule is dropped.');
      at = blockEnd(source, open) + 1 || source.length;
      continue;
    }
    if (rules.length >= FACE_CAPS.styleRules) {
      return {
        ok: false,
        reason: `A face's style holds at most ${FACE_CAPS.styleRules} rules.`,
        at: positions.at(start),
      };
    }
    const selectors = readSelectors(source.slice(start, open), start, drop);
    const assignments = readDeclarations(source.slice(open + 1, end), open + 1, drop);
    if (selectors.length > 0) rules.push({ selectors, assignments, order: rules.length });
    at = end + 1;
  }
  return { ok: true, rules, dropped };
}

/** Where the block opened at `open` closes, counting nested braces; -1 when it never does. */
function blockEnd(source: string, open: number): number {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    else if (source[at] === '}') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

function readSelectors(
  text: string,
  offset: number,
  drop: (offset: number, reason: string) => void,
): Selector[] {
  const parts = text.split(',');
  if (parts.length > FACE_CAPS.selectorsPerRule) {
    drop(offset, `A rule lists at most ${FACE_CAPS.selectorsPerRule} selectors: it is dropped.`);
    return [];
  }
  const selectors: Selector[] = [];
  let at = offset;
  for (const part of parts) {
    const where = at + (part.length - part.trimStart().length);
    at += part.length + 1;
    const trimmed = part.trim();
    const compounds: Compound[] = [];
    let specificity = 0;
    let fine = trimmed !== '';
    for (const word of trimmed.split(/\s+/)) {
      const found = /^([a-z][a-z0-9]*)?((?:\.-?[A-Za-z_][\w-]*)*)$/.exec(word);
      if (!found || word === '') {
        fine = false;
        break;
      }
      const classes = found[2] === '' ? [] : found[2]!.slice(1).split('.');
      if (found[1] === undefined && classes.length === 0) {
        fine = false;
        break;
      }
      compounds.push({ ...(found[1] === undefined ? {} : { element: found[1] }), classes });
      specificity += (found[1] === undefined ? 0 : 1) + classes.length * 1000;
    }
    if (!fine || compounds.length > FACE_CAPS.selectorDepth) {
      drop(
        where,
        compounds.length > FACE_CAPS.selectorDepth
          ? `A selector joins at most ${FACE_CAPS.selectorDepth} parts: "${trimmed}" is dropped.`
          : `The selector "${trimmed}" is not one a face takes: an element, a class, both, or those joined by spaces. It is dropped.`,
      );
      continue;
    }
    if (compounds.some((each) => each.classes.some((name) => !CLASS_NAME.test(name)))) continue;
    selectors.push({ compounds, specificity });
  }
  return selectors;
}

/** Reads declarations, as a rule's block or a `style` attribute holds them. */
export function readDeclarations(
  text: string,
  offset: number,
  drop: (offset: number, reason: string) => void,
): Assignment[] {
  const assignments: Assignment[] = [];
  let at = 0;
  for (const part of text.split(';')) {
    const start = offset + at + (part.length - part.trimStart().length);
    at += part.length + 1;
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      drop(start, `"${clip(trimmed)}" is not a declaration: it is a property, ":" and a value.`);
      continue;
    }
    const property = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (/!\s*important$/i.test(value)) {
      drop(start, `"!important" is not part of a face: "${property}" is dropped.`);
      continue;
    }
    if (!VALUE.test(value) || /url\s*\(/i.test(value)) {
      drop(
        start,
        `The value of "${property}" holds characters a face's style does not take: it is dropped.`,
      );
      continue;
    }
    const read = readProperty(property, value.toLowerCase().replace(/\s+/g, ' '));
    if (typeof read === 'string') drop(start, read);
    else assignments.push(...read);
  }
  return assignments;
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** A length in px, at least `min`; `undefined` when it is not one. */
function px(value: string, min = 0): number | undefined {
  const found = /^(-?(?:\d+\.?\d*|\.\d+))(px)?$/.exec(value);
  if (!found) return undefined;
  if (found[2] === undefined && Number(found[1]) !== 0) return undefined;
  const number = Number(found[1]);
  return Number.isFinite(number) && number >= min && number <= 100_000 ? number : undefined;
}

function length(value: string): Length | undefined {
  const percent = /^(\d+\.?\d*|\.\d+)%$/.exec(value);
  if (percent) {
    const number = Number(percent[1]);
    return number <= 100 ? { percent: number } : undefined;
  }
  const pixels = px(value);
  return pixels === undefined ? undefined : { px: pixels };
}

/** A color: `#RRGGBB`, in capitals, or a token. */
export function readColor(value: string): FaceColor | undefined {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  const token = /^var\(\s*--([a-z-]+)\s*\)$/.exec(value)?.[1];
  return token !== undefined && isFaceToken(token) ? token : undefined;
}

function number(value: string, min = 0): number | undefined {
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
  const read = Number(value);
  return read >= min && read <= 100_000 ? read : undefined;
}

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** Four sides from one to four values, as `padding` and `margin` take them. */
function sides(value: string): [number, number, number, number] | undefined {
  const values = value.split(' ').map((each) => px(each));
  if (values.length > 4 || values.some((each) => each === undefined)) return undefined;
  const [top, right = top, bottom = top, left = right] = values as number[];
  return [top!, right!, bottom!, left!];
}

function border(value: string): Border | null | undefined {
  if (value === 'none' || value === '0') return null;
  let width: number | undefined;
  let style: Border['style'] | undefined;
  let color: FaceColor | undefined;
  for (const word of value.split(' ')) {
    if (word === 'solid' || word === 'dashed') style = word;
    else if (px(word) !== undefined && width === undefined) width = px(word);
    else if (readColor(word) !== undefined && color === undefined) color = readColor(word);
    else return undefined;
  }
  if (width === 0) return null;
  return { width: Math.min(width ?? 1, 16), style: style ?? 'solid', color: color ?? 'stroke' };
}

const ALIGNS: Readonly<Record<string, Align>> = {
  stretch: 'stretch',
  start: 'start',
  'flex-start': 'start',
  baseline: 'start',
  normal: 'stretch',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
};

const JUSTIFIES: Readonly<Record<string, Justify>> = {
  start: 'start',
  'flex-start': 'start',
  normal: 'start',
  left: 'start',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
  right: 'end',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
};

function one<K extends keyof FaceStyle>(key: K, value: FaceStyle[K]): Assignment[] {
  return [{ key, value } as Assignment];
}

/**
 * What a declaration sets, or why it is dropped. Values arrive in lowercase with their spaces
 * folded.
 */
function readProperty(property: string, value: string): Assignment[] | string {
  const bad = `"${value}" is not a value "${property}" takes in a face: it is dropped.`;
  const choose = <K extends keyof FaceStyle>(
    key: K,
    map: Readonly<Record<string, FaceStyle[K]>>,
  ) => (Object.hasOwn(map, value) ? one(key, map[value]!) : bad);
  switch (property) {
    case 'display':
      return choose('display', { block: 'block', flex: 'flex', grid: 'grid', none: 'none' });
    case 'flex-direction':
      return choose('flexDirection', { row: 'row', column: 'column' });
    case 'flex-wrap':
      return choose('flexWrap', { wrap: true, nowrap: false });
    case 'flex': {
      if (value === 'none') return [...one('flexGrow', 0), ...one('flexShrink', 0)];
      if (value === 'auto')
        return [...one('flexGrow', 1), ...one('flexShrink', 1), ...one('flexBasis', 'auto')];
      const words = value.split(' ');
      const grow = number(words[0] ?? '');
      if (grow === undefined || words.length > 3) return bad;
      let shrink = 1;
      let basis: Length | 'auto' = { px: 0 };
      if (words.length >= 2) {
        const second = number(words[1]!);
        if (second !== undefined && words.length === 3) shrink = second;
        else if (second !== undefined && words.length === 2) shrink = second;
        else if (words.length === 2) {
          const read = words[1] === 'auto' ? 'auto' : length(words[1]!);
          if (read === undefined) return bad;
          basis = read;
        } else return bad;
      }
      if (words.length === 3) {
        const read = words[2] === 'auto' ? 'auto' : length(words[2]!);
        if (read === undefined) return bad;
        basis = read;
      }
      return [...one('flexGrow', grow), ...one('flexShrink', shrink), ...one('flexBasis', basis)];
    }
    case 'flex-grow':
    case 'flex-shrink': {
      const read = number(value);
      return read === undefined
        ? bad
        : one(property === 'flex-grow' ? 'flexGrow' : 'flexShrink', read);
    }
    case 'flex-basis': {
      const read = value === 'auto' ? 'auto' : length(value);
      return read === undefined ? bad : one('flexBasis', read);
    }
    case 'gap':
    case 'row-gap':
    case 'column-gap': {
      const values = value.split(' ').map((each) => px(each));
      if (
        values.some((each) => each === undefined) ||
        values.length > (property === 'gap' ? 2 : 1)
      ) {
        return bad;
      }
      const [row, column = row] = values as number[];
      if (property === 'row-gap') return one('rowGap', row!);
      if (property === 'column-gap') return one('columnGap', row!);
      return [...one('rowGap', row!), ...one('columnGap', column!)];
    }
    case 'align-items':
      return choose('alignItems', ALIGNS);
    case 'align-self':
      return value === 'auto' ? one('alignSelf', 'auto') : choose('alignSelf', ALIGNS);
    case 'justify-content':
      return choose('justifyContent', JUSTIFIES);
    case 'grid-template-columns': {
      const tracks: Track[] = [];
      for (const word of value.split(' ')) {
        const fr = /^(\d+\.?\d*|\.\d+)fr$/.exec(word);
        if (word === 'auto') tracks.push('auto');
        else if (fr) tracks.push({ fr: Number(fr[1]) });
        else if (px(word) !== undefined) tracks.push({ px: px(word)! });
        else return bad;
      }
      if (tracks.length > FACE_CAPS.gridColumns) {
        return `A grid has at most ${FACE_CAPS.gridColumns} columns: "${property}" is dropped.`;
      }
      return one('gridColumns', tracks);
    }
    case 'width':
    case 'height':
    case 'min-width':
    case 'min-height':
    case 'max-width':
    case 'max-height': {
      const key = (
        {
          width: 'width',
          height: 'height',
          'min-width': 'minWidth',
          'min-height': 'minHeight',
          'max-width': 'maxWidth',
          'max-height': 'maxHeight',
        } as const
      )[property];
      if (value === 'auto' || value === 'none') return [{ key, value: undefined }];
      const read = length(value);
      return read === undefined ? bad : [{ key, value: read }];
    }
    case 'padding':
    case 'margin': {
      const read = sides(value);
      if (read === undefined) return bad;
      const prefix = property === 'padding' ? 'padding' : 'margin';
      return SIDES.map((side, at) => ({ key: `${prefix}${side}`, value: read[at] }) as Assignment);
    }
    case 'position':
      return choose('position', { absolute: 'absolute', static: 'static' });
    case 'top':
    case 'right':
    case 'bottom':
    case 'left': {
      const read = px(value);
      return read === undefined ? bad : [{ key: property, value: read }];
    }
    case 'background':
    case 'background-color': {
      if (value === 'none' || value === 'transparent') return one('background', undefined);
      const read = readColor(value);
      return read === undefined ? bad : one('background', read);
    }
    case 'border':
    case 'border-top':
    case 'border-right':
    case 'border-bottom':
    case 'border-left': {
      const read = border(value);
      if (read === undefined) return bad;
      const which =
        property === 'border'
          ? SIDES
          : [(property.slice(7, 8).toUpperCase() + property.slice(8)) as (typeof SIDES)[number]];
      return which.map((side) => ({ key: `border${side}`, value: read ?? undefined }));
    }
    case 'border-radius': {
      const read = px(value);
      return read === undefined ? bad : one('borderRadius', read);
    }
    case 'overflow':
      return choose('overflowHidden', { hidden: true, visible: false, clip: true });
    case 'color': {
      const read = readColor(value);
      return read === undefined ? bad : one('color', read);
    }
    case 'font-size': {
      const read = px(value);
      if (read === undefined) return bad;
      if (read < FACE_FONT_SIZES.min || read > FACE_FONT_SIZES.max) {
        return `A face's text is ${FACE_FONT_SIZES.min} to ${FACE_FONT_SIZES.max} px: "font-size: ${value}" is dropped.`;
      }
      return one('fontSize', read);
    }
    case 'font-weight': {
      if (value === 'bold' || value === 'bolder') return one('bold', true);
      if (value === 'normal' || value === 'lighter') return one('bold', false);
      const read = number(value);
      return read === undefined || read < 1 || read > 1000 ? bad : one('bold', read >= 600);
    }
    case 'font-style':
      return choose('italic', { normal: false, italic: true, oblique: true });
    case 'font-family':
      return choose('mono', { sans: false, 'sans-serif': false, mono: true, monospace: true });
    case 'line-height': {
      if (value === 'normal') return one('lineHeight', { multiple: 1.3 });
      const multiple = number(value);
      if (multiple !== undefined)
        return one('lineHeight', { multiple: Math.min(Math.max(multiple, 0.5), 4) });
      const read = px(value);
      return read === undefined ? bad : one('lineHeight', { px: Math.min(Math.max(read, 4), 128) });
    }
    case 'text-align':
      return choose('textAlign', {
        left: 'left',
        start: 'left',
        center: 'center',
        right: 'right',
        end: 'right',
      });
    case 'text-decoration':
    case 'text-decoration-line': {
      if (value === 'none') return [...one('underline', false), ...one('strike', false)];
      const words = value.split(' ');
      if (!words.every((word) => word === 'underline' || word === 'line-through')) return bad;
      return [
        ...one('underline', words.includes('underline')),
        ...one('strike', words.includes('line-through')),
      ];
    }
    case 'text-transform':
      return choose('textTransform', {
        none: 'none',
        uppercase: 'uppercase',
        lowercase: 'lowercase',
        capitalize: 'capitalize',
      });
    case 'white-space':
      return choose('nowrap', { normal: false, nowrap: true });
    case 'line-clamp':
    case '-webkit-line-clamp': {
      if (value === 'none') return one('lineClamp', undefined);
      const read = number(value, 1);
      return read === undefined || !Number.isInteger(read)
        ? bad
        : one('lineClamp', Math.min(read, 100));
    }
  }
  return `"${property}" is not a property a face takes: it is dropped.`;
}

/** What the face's own elements and text elements are before any style. */
export const TAG_DEFAULTS: Readonly<Record<string, readonly Assignment[]>> = (() => {
  const inline: Assignment = { key: 'display', value: 'inline' };
  const box = (width: number): Assignment[] => [
    { key: 'width', value: { px: width } },
    { key: 'height', value: { px: width } },
    { key: 'flexShrink', value: 0 },
  ];
  return {
    span: [inline],
    b: [inline, { key: 'bold', value: true }],
    strong: [inline, { key: 'bold', value: true }],
    i: [inline, { key: 'italic', value: true }],
    em: [inline, { key: 'italic', value: true }],
    u: [inline, { key: 'underline', value: true }],
    s: [inline, { key: 'strike', value: true }],
    code: [inline, { key: 'mono', value: true }, { key: 'background', value: 'code-back' }],
    small: [inline, { key: 'fontSize', value: { scale: 0.85 } }],
    mark: [inline, { key: 'background', value: 'highlight' }],
    sub: [inline, { key: 'fontSize', value: { scale: 0.75 } }],
    sup: [inline, { key: 'fontSize', value: { scale: 0.75 } }],
    br: [inline],
    detail: [inline],
    badges: [inline],
    hr: [
      { key: 'borderTop', value: { width: 1, style: 'solid', color: 'row-separator' } },
      { key: 'marginTop', value: 4 },
      { key: 'marginBottom', value: 4 },
    ],
    ul: [{ key: 'paddingLeft', value: 16 }],
    ol: [{ key: 'paddingLeft', value: 16 }],
    drawing: [{ key: 'flexGrow', value: 1 }],
    icon: box(20),
    image: box(24),
  };
})();

// ——— Matching and computing ——————————————————————————————————————————————————————————————————————

/** An element as selectors see it. */
export interface Matched {
  name: string;
  classes: readonly string[];
}

function compoundMatches(compound: Compound, element: Matched): boolean {
  if (compound.element !== undefined && compound.element !== element.name) return false;
  return compound.classes.every((name) => element.classes.includes(name));
}

/** Whether a selector matches an element, given its ancestors from the outermost. */
export function selectorMatches(
  selector: Selector,
  element: Matched,
  ancestors: readonly Matched[],
): boolean {
  const { compounds } = selector;
  if (!compoundMatches(compounds.at(-1)!, element)) return false;
  let next = compounds.length - 2;
  for (let at = ancestors.length - 1; at >= 0 && next >= 0; at -= 1) {
    if (compoundMatches(compounds[next]!, ancestors[at]!)) next -= 1;
  }
  return next < 0;
}

/** The assignments that apply to an element, in the cascade's order. */
export function cascade(
  rules: readonly StyleRule[],
  element: Matched,
  ancestors: readonly Matched[],
): Assignment[] {
  const matching: { specificity: number; order: number; assignments: readonly Assignment[] }[] = [];
  for (const rule of rules) {
    let best = -1;
    for (const selector of rule.selectors) {
      if (selector.specificity > best && selectorMatches(selector, element, ancestors)) {
        best = selector.specificity;
      }
    }
    if (best >= 0)
      matching.push({ specificity: best, order: rule.order, assignments: rule.assignments });
  }
  matching.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  return matching.flatMap((each) => each.assignments);
}

/** A style worked out from its parent's and what applies, in order. */
export function computeStyle(parent: FaceStyle, applied: readonly Assignment[]): FaceStyle {
  const style: Record<string, unknown> = { ...INITIAL_STYLE };
  for (const key of INHERITED) style[key] = parent[key];
  for (const { key, value } of applied) {
    if (key === 'fontSize' && typeof value === 'object' && value !== null && 'scale' in value) {
      style.fontSize = Math.max(
        FACE_FONT_SIZES.min * 0.75,
        (style.fontSize as number) * value.scale,
      );
    } else if (value === undefined) delete style[key];
    else style[key] = value;
  }
  return style as unknown as FaceStyle;
}
