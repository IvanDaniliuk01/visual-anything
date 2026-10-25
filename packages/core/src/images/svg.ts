/**
 * Cleaning SVG text. A strict reader takes the text apart, and a new document is written from what an
 * allow-list keeps of it, so that a browser only ever parses canonical output in which nothing runs or
 * loads: shapes, paths, groups, gradients, clipping and masks, with references only to the picture's own
 * parts, and a rendering cost within caps. Pure TypeScript, with no DOM and no dependency.
 */
import { Removals, cleaning, invalid, tooLarge, type Cleaned } from './result';

/** What cleaning keeps of an SVG picture: its text, and the width and height of its view box. */
export interface CleanedSvg {
  svg: string;
  width: number;
  height: number;
}

/** The caps on SVG text and on the cost of drawing it. */
export const SVG_CAPS = {
  /** Characters of input. */
  input: 512 * 1024,
  /** Elements in the input, before anything is folded. */
  inputElements: 20_000,
  /** How deeply the input's elements nest; deeper input is refused before it is read further. */
  inputDepth: 256,
  /** Namespace declarations in the input. */
  namespaceDeclarations: 256,
  /** `<style>` rules in the input, `@` rules included. */
  styleRules: 256,
  /** Selectors in one rule. */
  selectorsPerRule: 16,
  /** Declarations of the style rules that fold into attributes, each counted once per selector. */
  styleDeclarations: 1_024,
  /**
   * Folding in all: each declaration that a rule or a `style` attribute applies to an element counts
   * once, and each rule that an element's name or one of its classes finds counts once more, before
   * anything is folded. This caps the time cleaning takes, whatever the number of elements and rules.
   */
  foldBudget: 100_000,
  /** Weighted elements of the output: see {@link elementWeight}. */
  weight: 4_000,
  /** How deeply the output's elements nest, its `svg` element at 1. */
  depth: 24,
  /** `use` elements. */
  uses: 64,
  /** Linear and radial gradients. */
  gradients: 32,
  /** Stops in one gradient. */
  stopsPerGradient: 16,
  /** Clip paths and masks together. */
  clipsAndMasks: 16,
  /** Path commands, and the points of polylines and polygons. */
  pathCommands: 20_000,
  /** Characters of output. */
  output: 64 * 1024,
  /** The largest width or height of a view box. */
  viewBoxSide: 100_000,
  /** Entries in a dash pattern. */
  dashEntries: 16,
} as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** The elements kept. */
const KEPT = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
]);

/** Elements that lose themselves but keep their children. */
const UNWRAPPED = new Set(['a', 'switch']);

/** Elements that draw. */
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/** Elements whose contents are never drawn where they stand. */
const NOT_DRAWN_INSIDE = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
]);

const GEOMETRY = new Set(
  (
    'x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height d points offset viewBox preserveAspectRatio ' +
    'transform gradientTransform gradientUnits spreadMethod clipPathUnits maskUnits maskContentUnits pathLength'
  ).split(' '),
);

const PAINT = new Set(
  (
    'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin ' +
    'stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color stop-color stop-opacity clip-path ' +
    'clip-rule mask display visibility vector-effect shape-rendering paint-order'
  ).split(' '),
);

/** Paint that may refer to a part of the picture, as `url(#id)`. */
const PAINT_REFERENCES = new Set(['fill', 'stroke', 'clip-path', 'mask']);

/** Elements whose `href` may name another part of the picture. */
const REFERRING = new Set(['use', 'linearGradient', 'radialGradient']);

/** Functions a value may call; `url` only as `url(#id)`, in {@link PAINT_REFERENCES}. */
const FUNCTIONS = new Set([
  'url',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'matrix',
  'translate',
  'scale',
  'rotate',
  'skewx',
  'skewy',
]);

const VALUE = /^[-+.,%#()\w\s]*$/;
const ID = /^[A-Za-z_][\w.-]{0,63}$/;
const LOCAL_REFERENCE = /^url\(#([A-Za-z_][\w.-]{0,63})\)$/;
const HREF = /^#([A-Za-z_][\w.-]{0,63})$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
/** An XML name, read where it starts. */
const NAME = /[A-Za-z_:\u00C0-\uFFFF][-A-Za-z0-9._:\u00B7\u00C0-\uFFFF]*/y;

/**
 * Rebuilds SVG text from an allow-list, so that nothing in it runs or loads, and reports what went.
 * Cleaning cleaned text gives the same text.
 */
export function cleanSvg(text: string): Cleaned<CleanedSvg> {
  return cleaning((removals) => {
    if (typeof text !== 'string') invalid('An SVG picture is text.');
    if (text.length > SVG_CAPS.input) {
      tooLarge(`The SVG text is over ${SVG_CAPS.input / 1024} KiB.`);
    }
    const root = parse(text, removals);
    if (!isSvg(root) || root.local !== 'svg') {
      invalid('The outermost element is not an SVG element.');
    }
    const styles = readStyles(root, removals);
    const [top] = cleanElement(root, styles, { folded: 0, kept: 0 }, removals);
    if (top === undefined) invalid('The outermost element is not an SVG element.');
    const box = viewBoxOf(top);
    finishValues(top, box, removals);
    checkCosts(top);
    const written = write(top);
    if (written.length > SVG_CAPS.output) {
      tooLarge(`The cleaned SVG text is over ${SVG_CAPS.output / 1024} KiB.`);
    }
    return { svg: written, width: box.width, height: box.height };
  });
}

// --- Reading -------------------------------------------------------------------------------------

/** An element as read, with its namespace worked out. */
interface RawElement {
  /** As written, with its prefix. */
  qname: string;
  /** Its name without a prefix. */
  local: string;
  /** Its namespace; `undefined` when unprefixed and no default namespace is declared. */
  ns: string | undefined;
  /** Attributes by their name as written. */
  attributes: Map<string, string>;
  /** The namespaces of the prefixes in scope, '' for the default one. */
  scope: Map<string, string>;
  children: RawElement[];
  /** Its text, CDATA unwrapped; kept only for `<style>`. */
  text: string;
}

/** Reads XML text strictly into its outermost element. */
function parse(text: string, removals: Removals): RawElement {
  const s = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const stack: RawElement[] = [];
  let root: RawElement | undefined;
  let elements = 0;
  let namespaces = 0;
  let i = 0;
  let first = true;

  const addText = (value: string) => {
    const parent = stack.at(-1);
    if (parent) {
      if (parent.local === 'style') parent.text += value;
    } else if (value.trim() !== '') {
      invalid('The SVG text has text outside its outermost element.');
    }
  };

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) {
      addText(decodeEntities(s.slice(i)));
      break;
    }
    if (lt > i) {
      const between = s.slice(i, lt);
      if (between.trim() !== '') first = false;
      addText(decodeEntities(between));
    }
    i = lt;
    if (s.startsWith('<?', i)) {
      const end = s.indexOf('?>', i + 2);
      if (end === -1) invalid('The SVG text has an unfinished processing instruction.');
      const target = /^[^\s?]*/.exec(s.slice(i + 2, end))?.[0] ?? '';
      if (!(first && target === 'xml' && root === undefined && stack.length === 0)) {
        if (target.toLowerCase() === 'xml') invalid('The XML declaration is out of place.');
        removals.add('processing instruction');
      }
      i = end + 2;
    } else if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end === -1) invalid('The SVG text has an unfinished comment.');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      if (end === -1) invalid('The SVG text has an unfinished CDATA section.');
      addText(s.slice(i + 9, end));
      i = end + 3;
    } else if (s.startsWith('<!', i)) {
      invalid('The SVG text has a declaration, such as a DOCTYPE or an ENTITY; it is not read.');
    } else if (s.startsWith('</', i)) {
      const end = s.indexOf('>', i + 2);
      if (end === -1) invalid('The SVG text has an unfinished end tag.');
      const name = s.slice(i + 2, end).trimEnd();
      const open = stack.pop();
      if (!open || open.qname !== name) invalid(`The SVG text closes "${name}" out of order.`);
      i = end + 1;
    } else {
      const tag = readStartTag(s, i);
      i = tag.end;
      if (stack.length === 0 && root !== undefined) {
        invalid('The SVG text has more than one outermost element.');
      }
      elements += 1;
      if (elements > SVG_CAPS.inputElements) {
        tooLarge(`The SVG text has over ${SVG_CAPS.inputElements} elements.`);
      }
      for (const name of tag.attributes.keys()) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) namespaces += 1;
      }
      // Each element that declares namespaces copies the ones in scope: few declarations keep that cheap.
      if (namespaces > SVG_CAPS.namespaceDeclarations) {
        tooLarge(`The SVG text has over ${SVG_CAPS.namespaceDeclarations} namespace declarations.`);
      }
      const parent = stack.at(-1);
      const element = makeElement(tag.name, tag.attributes, parent?.scope);
      if (parent) parent.children.push(element);
      else root = element;
      if (!tag.empty) {
        stack.push(element);
        if (stack.length > SVG_CAPS.inputDepth) {
          tooLarge(`The SVG text nests elements over ${SVG_CAPS.inputDepth} deep.`);
        }
      }
    }
    first = false;
  }
  if (stack.length > 0) invalid(`The SVG text leaves "${stack.at(-1)?.qname ?? ''}" open.`);
  if (!root) invalid('The SVG text has no element.');
  return root;
}

/** Reads a start tag at `<`, strictly: quoted values, no repeated attribute. */
function readStartTag(
  s: string,
  start: number,
): { name: string; attributes: Map<string, string>; empty: boolean; end: number } {
  let i = start + 1;
  const name = readName(s, i);
  i += name.length;
  const attributes = new Map<string, string>();
  for (;;) {
    const spaceStart = i;
    while (i < s.length && isSpace(s.charCodeAt(i))) i++;
    if (s.startsWith('/>', i)) return { name, attributes, empty: true, end: i + 2 };
    if (s[i] === '>') return { name, attributes, empty: false, end: i + 1 };
    if (i >= s.length) invalid(`The SVG text leaves the tag "${name}" unfinished.`);
    if (i === spaceStart) invalid(`The tag "${name}" runs its attributes together.`);
    const attribute = readName(s, i);
    i += attribute.length;
    while (i < s.length && isSpace(s.charCodeAt(i))) i++;
    if (s[i] !== '=') invalid(`The attribute "${attribute}" of "${name}" has no value.`);
    i++;
    while (i < s.length && isSpace(s.charCodeAt(i))) i++;
    const quote = s[i];
    if (quote !== '"' && quote !== "'") {
      invalid(`The attribute "${attribute}" of "${name}" has an unquoted value.`);
    }
    const close = s.indexOf(quote, i + 1);
    if (close === -1) invalid(`The attribute "${attribute}" of "${name}" is unfinished.`);
    const raw = s.slice(i + 1, close);
    if (raw.includes('<')) invalid(`The attribute "${attribute}" of "${name}" holds "<".`);
    if (attributes.has(attribute)) {
      invalid(`The tag "${name}" has the attribute "${attribute}" twice.`);
    }
    // XML turns each tab and line break written in a value into a space; character references stay.
    attributes.set(attribute, decodeEntities(raw.replace(/[\t\n\r]/g, ' ')));
    i = close + 1;
  }
}

function readName(s: string, at: number): string {
  NAME.lastIndex = at;
  const name = NAME.exec(s)?.[0];
  if (name === undefined) invalid('The SVG text has a malformed tag.');
  return name;
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/** Text with its entity and character references replaced; only XML's own five entities are known. */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&([^;&]*);?/g, (whole, name: string) => {
    if (!whole.endsWith(';')) invalid('The SVG text has an "&" that starts no reference.');
    switch (name) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const code = /^#x[0-9a-fA-F]{1,6}$/.test(name)
      ? parseInt(name.slice(2), 16)
      : /^#[0-9]{1,7}$/.test(name)
        ? parseInt(name.slice(1), 10)
        : undefined;
    if (code === undefined) invalid(`The SVG text uses the entity "&${name};", which is not read.`);
    const allowed =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (!allowed) invalid(`The SVG text refers to a character XML does not allow (&${name};).`);
    return String.fromCodePoint(code);
  });
}

function makeElement(
  qname: string,
  attributes: Map<string, string>,
  parentScope: Map<string, string> | undefined,
): RawElement {
  let scope = parentScope ?? new Map<string, string>();
  for (const [name, value] of attributes) {
    if (name === 'xmlns' || name.startsWith('xmlns:')) {
      if (scope === parentScope) scope = new Map(scope);
      scope.set(name === 'xmlns' ? '' : name.slice(6), value);
    }
  }
  const colon = qname.indexOf(':');
  const prefix = colon === -1 ? '' : qname.slice(0, colon);
  const local = colon === -1 ? qname : qname.slice(colon + 1);
  const ns = scope.get(prefix);
  return { qname, local, ns, attributes, scope, children: [], text: '' };
}

/** Whether a read element is in the SVG namespace; unprefixed ones are when no namespace is declared. */
function isSvg(element: RawElement): boolean {
  if (element.ns === SVG_NS) return true;
  return element.ns === undefined && !element.qname.includes(':');
}

// --- Styles --------------------------------------------------------------------------------------

/** The declarations of a rule that folds into attributes, with its place among the rules. */
interface Folded {
  order: number;
  declarations: readonly [string, string][];
}

/** The rules that fold into attributes, by the element name or the class they select, in order. */
interface StyleIndex {
  byElement: Map<string, Folded[]>;
  byClass: Map<string, Folded[]>;
}

/**
 * Reads every `<style>` element's rules, counting them against the caps before folding any, and
 * indexes them, so that each element looks up only the rules that select it.
 */
function readStyles(root: RawElement, removals: Removals): StyleIndex {
  const texts: string[] = [];
  const visit = (element: RawElement) => {
    if (isSvg(element) && element.local === 'style') texts.push(element.text);
    for (const child of element.children) visit(child);
  };
  visit(root);
  const index: StyleIndex = { byElement: new Map(), byClass: new Map() };
  let counted = 0;
  let declared = 0;
  for (const text of texts) {
    for (const parsed of parseCss(text)) {
      counted += 1;
      if (counted > SVG_CAPS.styleRules) {
        tooLarge(`The SVG text has over ${SVG_CAPS.styleRules} style rules.`);
      }
      if (parsed.at) {
        removals.add('@ rule');
        continue;
      }
      const selectors = parsed.selectors.split(',').map((each) => each.trim());
      if (selectors.length > SVG_CAPS.selectorsPerRule) {
        tooLarge(`A style rule has over ${SVG_CAPS.selectorsPerRule} selectors.`);
      }
      const simple = selectors.every(
        (each) => /^\.[A-Za-z_-][\w-]*$/.test(each) || /^[A-Za-z][\w-]*$/.test(each),
      );
      if (!simple) {
        removals.add(
          'style rule that selects by more than a class or an element name',
          'style rules that select by more than a class or an element name',
        );
        continue;
      }
      const declarations = parseDeclarations(parsed.body);
      declared += declarations.length * selectors.length;
      if (declared > SVG_CAPS.styleDeclarations) {
        tooLarge(
          `The SVG text's style rules hold over ${SVG_CAPS.styleDeclarations} declarations, counted once per selector.`,
        );
      }
      const folded: Folded = { order: counted, declarations };
      for (const selector of new Set(selectors)) {
        const [byName, name] = selector.startsWith('.')
          ? [index.byClass, selector.slice(1)]
          : [index.byElement, selector];
        const list = byName.get(name);
        if (list) list.push(folded);
        else byName.set(name, [folded]);
      }
    }
  }
  return index;
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

/** The declarations of a block, by property name in lower case, `!important` dropped. */
function parseDeclarations(body: string): [string, string][] {
  const declarations: [string, string][] = [];
  for (const part of body.split(';')) {
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

// --- Rebuilding ----------------------------------------------------------------------------------

/** An element of the cleaned picture. */
interface Clean {
  name: string;
  attributes: Map<string, string>;
  children: Clean[];
}

/**
 * The cleaned elements a read element gives: itself, its children when it is unwrapped, or nothing
 * when it is dropped with its content.
 */
/** The work cleaning has done so far, against the caps that bound its time. */
interface Budget {
  /** Declarations folded, and rules matched: see {@link SVG_CAPS.foldBudget}. */
  folded: number;
  /** Elements kept. */
  kept: number;
}

function cleanElement(
  element: RawElement,
  styles: StyleIndex,
  budget: Budget,
  removals: Removals,
): Clean[] {
  if (!isSvg(element)) {
    removals.add(`${element.qname} element`);
    return [];
  }
  const children = () =>
    element.children.flatMap((child) => cleanElement(child, styles, budget, removals));
  if (UNWRAPPED.has(element.local)) {
    removals.add(
      `${element.local} element unwrapped, its contents kept`,
      `${element.local} elements unwrapped, their contents kept`,
    );
    return children();
  }
  if (element.local === 'style') return [];
  if (!KEPT.has(element.local)) {
    if (['text', 'tspan', 'textPath'].includes(element.local)) {
      removals.add(
        'text element (turn text into paths to keep it)',
        'text elements (turn text into paths to keep it)',
      );
    } else {
      removals.add(`${element.local} element`);
    }
    return [];
  }
  // Each element kept weighs at least 1, so too many are refused before their styles are folded.
  budget.kept += 1;
  if (budget.kept > SVG_CAPS.weight) {
    tooLarge(`The SVG picture has over ${SVG_CAPS.weight} elements to draw.`);
  }
  return [
    {
      name: element.local,
      attributes: cleanAttributes(element, styles, budget, removals),
      children: children(),
    },
  ];
}

/**
 * The attributes kept of an element, with styles folded in. Precedence, lowest first: presentation
 * attribute, element rule, class rule, `style` attribute.
 */
function cleanAttributes(
  element: RawElement,
  styles: StyleIndex,
  budget: Budget,
  removals: Removals,
): Map<string, string> {
  const kept = new Map<string, string>();
  let href: string | undefined;
  let xlinkHref: string | undefined;
  let classes: string[] = [];
  let style: string | undefined;
  for (const [name, value] of element.attributes) {
    const colon = name.indexOf(':');
    if (colon !== -1) {
      const prefix = name.slice(0, colon);
      const local = name.slice(colon + 1);
      // `xml:` is bound by XML itself, and an undeclared `xlink:` is taken as XLink, as it is meant.
      const ns =
        prefix === 'xml'
          ? XML_NS
          : (element.scope.get(prefix) ?? (prefix === 'xlink' ? XLINK_NS : undefined));
      // Namespace declarations and `xml:` attributes go without a word: they draw nothing.
      if (prefix === 'xmlns' || ns === XML_NS) continue;
      if (ns === XLINK_NS && local === 'href') {
        xlinkHref = value;
        continue;
      }
      removals.add('attribute of another namespace', 'attributes of other namespaces');
      continue;
    }
    if (name === 'xmlns') continue;
    if (name === 'href') {
      href = value;
      continue;
    }
    if (name === 'class') {
      classes = value.split(/\s+/).filter((each) => each !== '');
      continue;
    }
    if (name === 'style') {
      style = value;
      continue;
    }
    if (name === 'id' || GEOMETRY.has(name) || PAINT.has(name)) {
      kept.set(name, value);
      continue;
    }
    if (/^on/i.test(name)) removals.add('event handler attribute');
    else removals.add('other attribute');
  }

  const spend = (work: number) => {
    budget.folded += work;
    if (budget.folded > SVG_CAPS.foldBudget) {
      tooLarge('The SVG picture’s style rules match too many of its elements to fold them in.');
    }
  };
  const fold = (declarations: readonly [string, string][]) => {
    spend(declarations.length);
    for (const [property, value] of declarations) {
      if (PAINT.has(property)) kept.set(property, value);
      else
        removals.add(
          'style declaration that is not paint',
          'style declarations that are not paint',
        );
    }
  };
  // Each rule that matches counts against the budget as it is looked up, before anything is folded.
  const byElement = styles.byElement.get(element.local) ?? [];
  spend(byElement.length);
  for (const rule of byElement) fold(rule.declarations);
  if (classes.length > 0) {
    // A rule that selects two of the element's classes folds once, in its place among the rules.
    const matched = new Set<Folded>();
    for (const name of new Set(classes)) {
      const rules = styles.byClass.get(name) ?? [];
      spend(rules.length);
      for (const rule of rules) matched.add(rule);
    }
    for (const rule of [...matched].sort((a, b) => a.order - b.order)) fold(rule.declarations);
  }
  if (style !== undefined) fold(parseDeclarations(style));

  const reference = href ?? xlinkHref;
  if (reference !== undefined) {
    if (REFERRING.has(element.local)) kept.set('href', reference);
    else removals.add('outside reference');
  }
  return kept;
}

// --- The view box --------------------------------------------------------------------------------

interface ViewBox {
  text: string;
  width: number;
  height: number;
  diagonal: number;
}

/** The outermost element's view box, made from its width and height when it has none. */
function viewBoxOf(svg: Clean): ViewBox {
  const fromAttribute = parseViewBox(svg.attributes.get('viewBox'));
  let box = fromAttribute;
  if (!box) {
    const width = plainLength(svg.attributes.get('width'));
    const height = plainLength(svg.attributes.get('height'));
    if (width !== undefined && height !== undefined) {
      box = parseViewBox(`0 0 ${width.text} ${height.text}`);
    }
  }
  if (!box) invalid('The SVG picture has no usable view box.');
  for (const name of ['x', 'y', 'width', 'height']) svg.attributes.delete(name);
  svg.attributes.set('viewBox', box.text);
  svg.attributes.set('xmlns', SVG_NS);
  return box;
}

function parseViewBox(value: string | undefined): ViewBox | undefined {
  if (value === undefined) return undefined;
  const parts = value.trim().split(/[\s,]+/);
  if (parts.length !== 4 || !parts.every((part) => NUMBER.test(part))) return undefined;
  const [x, y, width, height] = parts.map(Number) as [number, number, number, number];
  const finite = [x, y, width, height].every(Number.isFinite);
  if (!finite || Math.abs(x) > 1e9 || Math.abs(y) > 1e9) return undefined;
  if (!(width > 0 && height > 0)) return undefined;
  if (width > SVG_CAPS.viewBoxSide || height > SVG_CAPS.viewBoxSide) return undefined;
  return { text: parts.join(' '), width, height, diagonal: Math.hypot(width, height) };
}

/** A length written as a plain number, or in `px`. */
function plainLength(value: string | undefined): { text: string; value: number } | undefined {
  if (value === undefined) return undefined;
  const text = value.trim().replace(/px$/, '');
  if (!NUMBER.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? { text, value: number } : undefined;
}

// --- Values and references -----------------------------------------------------------------------

/** Checks every value, keeps only references to the picture's own parts, and limits strokes. */
function finishValues(root: Clean, box: ViewBox, removals: Removals): void {
  const ids = new Set<string>();
  const visitIds = (element: Clean) => {
    const id = element.attributes.get('id');
    if (id !== undefined) {
      const trimmed = id.trim();
      if (!ID.test(trimmed)) {
        element.attributes.delete('id');
        removals.add('id that is not allowed', 'ids that are not allowed');
      } else if (ids.has(trimmed)) {
        element.attributes.delete('id');
        removals.add('repeated id');
      } else {
        element.attributes.set('id', trimmed);
        ids.add(trimmed);
      }
    }
    for (const child of element.children) visitIds(child);
  };
  visitIds(root);

  const visit = (element: Clean) => {
    for (const [name, written] of [...element.attributes]) {
      if (name === 'id' || name === 'xmlns') continue;
      const value = written
        .replace(/\s+/g, ' ')
        .trim()
        // Style sheets often quote a reference to a part: `url("#a")` is `url(#a)`.
        .replace(/url\(\s*(["']?)(#[\w.-]*)\1\s*\)/gi, 'url($2)');
      const checked = checkedValue(name, value, ids, box, removals);
      if (checked === undefined) element.attributes.delete(name);
      else element.attributes.set(name, checked);
    }
    for (const child of element.children) visit(child);
  };
  visit(root);
}

/** A value as kept, or `undefined` when it is removed. */
function checkedValue(
  name: string,
  value: string,
  ids: ReadonlySet<string>,
  box: ViewBox,
  removals: Removals,
): string | undefined {
  if (name === 'href') {
    const target = HREF.exec(value)?.[1];
    if (target === undefined || !ids.has(target)) {
      removals.add('outside reference');
      return undefined;
    }
    return value;
  }
  if (!VALUE.test(value)) {
    if (/url\s*\(|:|\/\//i.test(value)) removals.add('outside reference');
    else removals.add('value that is not allowed', 'values that are not allowed');
    return undefined;
  }
  for (const calledName of calledNames(value)) {
    const called = calledName.toLowerCase();
    if (!FUNCTIONS.has(called)) {
      removals.add('value that is not allowed', 'values that are not allowed');
      return undefined;
    }
    if (called === 'url') {
      const target = PAINT_REFERENCES.has(name) ? LOCAL_REFERENCE.exec(value)?.[1] : undefined;
      if (target === undefined || !ids.has(target)) {
        removals.add('outside reference');
        return undefined;
      }
    }
  }
  if (name === 'stroke-dasharray') return checkedDashes(value, box, removals);
  if (name === 'stroke-width') return checkedStrokeWidth(value, box, removals);
  return value;
}

/** A dash pattern of at most 16 entries, none finer than 1/1000 of the view box's diagonal. */
function checkedDashes(value: string, box: ViewBox, removals: Removals): string | undefined {
  if (value === 'none' || value === '') return value;
  const entries = value.split(/[\s,]+/).filter((each) => each !== '');
  const lengths = entries.map((each) => plainLength(each)?.value);
  const fine = box.diagonal / 1000;
  if (
    entries.length > SVG_CAPS.dashEntries ||
    lengths.some((length) => length === undefined || length < fine)
  ) {
    removals.add(
      'stroke dash pattern finer than the picture can show',
      'stroke dash patterns finer than the picture can show',
    );
    return undefined;
  }
  return value;
}

/** A stroke width of at most the view box's diagonal, or 100%. */
function checkedStrokeWidth(value: string, box: ViewBox, removals: Removals): string | undefined {
  const percent = /^([+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)%$/.exec(value)?.[1];
  if (percent !== undefined) {
    if (Number(percent) <= 100) return value;
    removals.add('stroke width wider than the picture', 'stroke widths wider than the picture');
    return '100%';
  }
  const length = plainLength(value);
  if (length === undefined || length.value < 0) {
    removals.add('value that is not allowed', 'values that are not allowed');
    return undefined;
  }
  if (length.value > box.diagonal) {
    removals.add('stroke width wider than the picture', 'stroke widths wider than the picture');
    return String(box.diagonal);
  }
  return value;
}

// --- Costs ---------------------------------------------------------------------------------------

/**
 * Refuses a picture whose drawing would cost too much, or that draws nothing. Each element weighs 1;
 * one that refers to a mask 64, to a clip path 16, and one with an opacity below 1 16 with children
 * and 4 without; a `use` also weighs what it refers to.
 */
function checkCosts(root: Clean): void {
  const byId = new Map<string, Clean>();
  const index = (element: Clean) => {
    const id = element.attributes.get('id');
    if (id !== undefined) byId.set(id, element);
    element.children.forEach(index);
  };
  index(root);

  const containsUse = new Map<Clean, boolean>();
  const hasUse = (element: Clean): boolean => {
    let known = containsUse.get(element);
    if (known === undefined) {
      known = element.name === 'use' || element.children.some(hasUse);
      containsUse.set(element, known);
    }
    return known;
  };
  const weights = new Map<Clean, number>();
  const weightOf = (element: Clean): number => {
    let known = weights.get(element);
    if (known === undefined) {
      known =
        elementWeight(element) + element.children.reduce((sum, child) => sum + weightOf(child), 0);
      if (element.name === 'use') {
        const target = referenced(element);
        if (target) known += weightOf(target);
      }
      weights.set(element, known);
    }
    return known;
  };
  const referenced = (use: Clean): Clean | undefined => {
    const href = use.attributes.get('href');
    return href === undefined ? undefined : byId.get(href.slice(1));
  };

  let uses = 0;
  let gradients = 0;
  let clipsAndMasks = 0;
  let pathCommands = 0;
  let drawable = false;
  const visit = (element: Clean, depth: number, hidden: boolean, inClipOrMask: boolean) => {
    if (depth > SVG_CAPS.depth)
      tooLarge(`The SVG picture nests elements over ${SVG_CAPS.depth} deep.`);
    const { name, attributes } = element;
    if (name === 'use') {
      uses += 1;
      const target = referenced(element);
      if (target && hasUse(target)) {
        tooLarge('A use element refers to a part that holds a use element.');
      }
      if (target && !hidden) drawable = true;
    }
    if (name === 'linearGradient' || name === 'radialGradient') {
      gradients += 1;
      const stops = element.children.filter((child) => child.name === 'stop').length;
      if (stops > SVG_CAPS.stopsPerGradient) {
        tooLarge(`A gradient has over ${SVG_CAPS.stopsPerGradient} stops.`);
      }
    }
    const isClipOrMask = name === 'clipPath' || name === 'mask';
    if (isClipOrMask) {
      clipsAndMasks += 1;
      if (inClipOrMask) tooLarge('A clip path or mask holds another.');
    }
    if (inClipOrMask || isClipOrMask) {
      if (attributes.has('clip-path') || attributes.has('mask')) {
        tooLarge('A clip path or mask refers to another.');
      }
    }
    if (SHAPES.has(name) && !hidden) drawable = true;
    if (name === 'path') pathCommands += pathCommandCount(attributes.get('d') ?? '');
    if (name === 'polyline' || name === 'polygon') {
      pathCommands += Math.ceil(numbersIn(attributes.get('points') ?? '') / 2);
    }
    for (const child of element.children) {
      visit(child, depth + 1, hidden || NOT_DRAWN_INSIDE.has(name), inClipOrMask || isClipOrMask);
    }
  };
  visit(root, 1, false, false);

  if (uses > SVG_CAPS.uses) tooLarge(`The SVG picture has over ${SVG_CAPS.uses} use elements.`);
  if (gradients > SVG_CAPS.gradients) {
    tooLarge(`The SVG picture has over ${SVG_CAPS.gradients} gradients.`);
  }
  if (clipsAndMasks > SVG_CAPS.clipsAndMasks) {
    tooLarge(`The SVG picture has over ${SVG_CAPS.clipsAndMasks} clip paths and masks.`);
  }
  if (pathCommands > SVG_CAPS.pathCommands) {
    tooLarge(`The SVG picture has over ${SVG_CAPS.pathCommands} path commands.`);
  }
  if (weightOf(root) > SVG_CAPS.weight) {
    tooLarge(
      'The SVG picture would cost too much to draw: it has too many masks, clips, transparent groups or elements.',
    );
  }
  if (!drawable) invalid('Nothing drawable is left in the SVG picture.');
}

/** What one element weighs, without its children. */
export function elementWeight(element: {
  attributes: ReadonlyMap<string, string>;
  children: readonly unknown[];
}): number {
  let weight = 1;
  if (element.attributes.has('mask')) weight += 63;
  if (element.attributes.has('clip-path')) weight += 15;
  const opacity = element.attributes.get('opacity');
  if (opacity !== undefined && opacityBelowOne(opacity)) {
    weight += element.children.length > 0 ? 15 : 3;
  }
  return weight;
}

function opacityBelowOne(value: string): boolean {
  const percent = value.endsWith('%');
  const number = Number(percent ? value.slice(0, -1) : value);
  return Number.isFinite(number) ? number < (percent ? 100 : 1) : false;
}

const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  t: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  a: 7,
  z: 0,
};

/** How many segments a path's data draws, counting the ones a command repeats implicitly. */
export function pathCommandCount(d: string): number {
  let count = 0;
  for (const match of d.matchAll(/([MmLlTtHhVvCcSsQqAaZz])([^MmLlTtHhVvCcSsQqAaZz]*)/g)) {
    const arity = ARITY[(match[1] ?? '').toLowerCase()] ?? 0;
    const numbers = numbersIn(match[2] ?? '');
    count += arity === 0 ? 1 : Math.max(1, Math.ceil(numbers / arity));
  }
  return count;
}

/**
 * The names of the functions a value calls, as `name(` with spaces allowed before the parenthesis, in
 * order. Each name is read back from its parenthesis, so the scan stays linear however long the value,
 * as a pattern tried at every position is not on long path data.
 */
export function calledNames(value: string): string[] {
  const names: string[] = [];
  for (let at = value.indexOf('('); at !== -1; at = value.indexOf('(', at + 1)) {
    let end = at;
    while (end > 0 && /\s/.test(value[end - 1] as string)) end -= 1;
    let start = end;
    while (start > 0 && /[\w-]/.test(value[start - 1] as string)) start -= 1;
    // A name starts with a letter or an underscore; what comes before it in the run is not its own.
    while (start < end && !/[A-Za-z_]/.test(value[start] as string)) start += 1;
    if (start < end) names.push(value.slice(start, end));
  }
  return names;
}

function numbersIn(text: string): number {
  return text.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.length ?? 0;
}

// --- Writing -------------------------------------------------------------------------------------

/** Writes the cleaned picture on one line: attributes sorted by name, empty elements self-closed. */
function write(root: Clean): string {
  const parts: string[] = [];
  const visit = (element: Clean) => {
    parts.push('<', element.name);
    const names = [...element.attributes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names)
      parts.push(' ', name, '="', escape(element.attributes.get(name) ?? ''), '"');
    if (element.children.length === 0) {
      parts.push('/>');
      return;
    }
    parts.push('>');
    element.children.forEach(visit);
    parts.push('</', element.name, '>');
  };
  visit(root);
  return parts.join('');
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The names the cleaner keeps, for checks that the output holds nothing else. */
export const SVG_ALLOWED = {
  elements: KEPT,
  attributes: new Set(['id', 'href', 'xmlns', ...GEOMETRY, ...PAINT]),
} as const;
