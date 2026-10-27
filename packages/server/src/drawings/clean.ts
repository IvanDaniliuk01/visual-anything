/**
 * Cleaning HTML for a drawing (ADR 0068), from an allow-list in code of our own, as the SVG cleaner is
 * written (ADR 0027). A new tree is built from what the list keeps of parse5's, so the layout step only
 * ever sees elements, text and styles it lays out:
 *
 * - **elements**: those the ADR lists, `a` unwrapped with its address dropped, and every other element
 *   dropped with its content: scripts, frames, forms, embedded content, SVG, MathML, templates and the
 *   rest. `head`, which the parser always makes, is left out quietly, but what it holds is reported;
 * - **attributes**: only `style`, `class` and `id` are read, to fold styles, then dropped. Every
 *   handler and every address is dropped;
 * - **styles**: folded in the cascade's order, element rules, then class rules, then id rules, then
 *   the `style` attribute, through `styles.ts`'s allow-list;
 * - **tables**: rows and columns of flex boxes, since the layout step lays out no table;
 * - **text**: the characters Roboto draws, within the cap.
 *
 * Every cost is capped (`caps.ts`): elements kept, nesting, text, and the folding steps.
 */
import { html } from 'parse5';
import { HTML_CAPS } from './caps';
import type { HtmlDocument, HtmlElement, HtmlNode, HtmlText } from './read';
import { tooLarge } from './read';
import type { DrawingReport } from './report';
import {
  keptDeclarations,
  parseDeclarations,
  readStyleSheets,
  type FoldedRule,
  type StyleIndex,
} from './styles';

const HTML_NS = html.NS.HTML;

/** An element of the cleaned tree: what the layout step draws, its style in camel case, and its children. */
export interface CleanElement {
  tag: string;
  style: Record<string, string>;
  children: CleanChild[];
}

export type CleanChild = CleanElement | string;

/** The elements kept, as the ADR lists them. */
export const KEPT_ELEMENTS: ReadonlySet<string> = new Set(
  [
    'html body div span p section article header footer main aside nav figure figcaption blockquote pre',
    'h1 h2 h3 h4 h5 h6 ul ol li dl dt dd',
    'code strong em b i u s small sub sup mark br hr',
    'table caption thead tbody tfoot tr th td',
  ]
    .join(' ')
    .split(' '),
);

/** Attributes that hold an address, as HTML names them. */
const ADDRESSES = new Set(
  'href src srcset action formaction poster data cite background longdesc ping manifest codebase archive usemap lowsrc dynsrc icon profile itemtype imagesrcset'.split(
    ' ',
  ),
);

/** What a table's parts become: flex boxes in rows and columns. */
const TABLE_PARTS = new Set(['table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);

/** The parts of a table that hold rows or cells, where text between them is only spacing. */
const TABLE_STRUCTURE = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

/** The styles an element starts from, before its own fold over them, for those the layout step lacks. */
const STARTING_STYLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  html: { display: 'block' },
  body: { display: 'block' },
  table: { display: 'flex', flexDirection: 'column' },
  caption: { display: 'block', textAlign: 'center' },
  thead: { display: 'flex', flexDirection: 'column' },
  tbody: { display: 'flex', flexDirection: 'column' },
  tfoot: { display: 'flex', flexDirection: 'column' },
  tr: { display: 'flex', flexDirection: 'row' },
  th: { display: 'block', flex: '1 1 0', padding: '1px', fontWeight: 'bold', textAlign: 'center' },
  td: { display: 'block', flex: '1 1 0', padding: '1px' },
  sub: { verticalAlign: 'sub', fontSize: 'smaller' },
  sup: { verticalAlign: 'super', fontSize: 'smaller' },
};

/** The element the layout step draws for one of the page: its own, or a box for what it lacks. */
function layoutTag(tag: string): string {
  if (tag === 'html' || tag === 'body' || TABLE_PARTS.has(tag)) return 'div';
  if (tag === 'sub' || tag === 'sup') return 'span';
  return tag;
}

export interface CleanOptions {
  /** Whether the font draws a character. */
  covers: (codePoint: number) => boolean;
}

/** Cleans a read page into the tree the layout step draws, with what it dropped in the report. */
export function cleanHtml(
  document: HtmlDocument,
  report: DrawingReport,
  options: CleanOptions,
): CleanElement {
  const root = document.childNodes.find(
    (node): node is HtmlElement => 'tagName' in node && node.tagName === 'html',
  );
  const styles = readStyleSheets(styleTexts(document), report);
  const cleaner = new Cleaner(styles, report, options);
  for (const node of document.childNodes) {
    if (node.nodeName === '#comment') report.add('comment');
  }
  const cleaned = root === undefined ? [] : cleaner.element(root, 1);
  cleaner.finish();
  return (cleaned[0] as CleanElement | undefined) ?? { tag: 'div', style: {}, children: [] };
}

/** The longest element name a report quotes, so that a page's own names never make it long. */
const MAX_REPORTED_NAME = 40;

/** An element's name as the report quotes it, cut to {@link MAX_REPORTED_NAME} characters. */
function named(tag: string): string {
  return tag.length <= MAX_REPORTED_NAME ? tag : `${tag.slice(0, MAX_REPORTED_NAME - 1)}…`;
}

/** Whether a node of the page is text. */
function isText(node: HtmlNode): node is HtmlText {
  return node.nodeName === '#text';
}

/** The text of every `<style>` of the page, in document order, as HTML reads it. */
function styleTexts(document: HtmlDocument): string[] {
  const texts: string[] = [];
  const stack: HtmlNode[] = [...document.childNodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as HtmlNode;
    if (!('tagName' in node) || node.namespaceURI !== HTML_NS) continue;
    if (node.tagName === 'style') {
      texts.push(node.childNodes.map((child) => (isText(child) ? child.value : '')).join(''));
      continue;
    }
    // A template's content is never part of the page.
    for (let at = node.childNodes.length - 1; at >= 0; at--) {
      stack.push(node.childNodes[at] as HtmlNode);
    }
  }
  return texts;
}

class Cleaner {
  #kept = 0;
  #text = 0;
  #textDropped = 0;
  #missing = 0;
  #folded = 0;

  constructor(
    readonly styles: StyleIndex,
    readonly report: DrawingReport,
    readonly options: CleanOptions,
  ) {}

  /** What an element of the page becomes: itself cleaned, its children when unwrapped, or nothing. */
  element(element: HtmlElement, depth: number, hiding = false): CleanChild[] {
    const { report } = this;
    const tag = element.tagName;
    if (element.namespaceURI !== HTML_NS) {
      report.add(`${named(tag)} element`, `${named(tag)} elements`);
      return [];
    }
    if (tag === 'style') return [];
    if (tag === 'head') {
      this.#reportDropped(element.childNodes);
      return [];
    }
    if (tag === 'a') {
      report.add(
        'a element unwrapped, its contents kept',
        'a elements unwrapped, their contents kept',
      );
      this.#attributes(element);
      return this.#children(element, depth - 1, false, hiding);
    }
    if (!KEPT_ELEMENTS.has(tag)) {
      report.add(`${named(tag)} element`, `${named(tag)} elements`);
      return [];
    }
    if (depth > HTML_CAPS.depth) {
      report.add(
        `element nested deeper than ${HTML_CAPS.depth} levels, with its contents`,
        `elements nested deeper than ${HTML_CAPS.depth} levels, with their contents`,
      );
      return [];
    }
    if (this.#kept >= HTML_CAPS.elements) {
      report.add(
        `element past the ${HTML_CAPS.elements} a drawing keeps, with its contents`,
        `elements past the ${HTML_CAPS.elements} a drawing keeps, with their contents`,
      );
      return [];
    }
    this.#kept += 1;
    if (tag === 'table') {
      report.add(
        'table laid out as rows and columns of boxes',
        'tables laid out as rows and columns of boxes',
      );
    }
    const read = this.#attributes(element);
    const style = this.#fold(tag, read);
    // satori clips a box that hides its overflow with a mask, and one inside another refers to the
    // other's, which the SVG cleaner refuses (ADR 0027): only the outermost keeps hiding.
    const hides = style.overflow === 'hidden';
    if (hides && hiding) {
      delete style.overflow;
      report.add(
        'box that hides its overflow inside another that does',
        'boxes that hide their overflow inside another that does',
      );
    }
    const children = this.#children(element, depth, TABLE_STRUCTURE.has(tag), hiding || hides);
    return [{ tag: layoutTag(tag), style, children }];
  }

  /** What the cleaner says once it is done: the text it dropped. */
  finish(): void {
    if (this.#textDropped > 0) {
      this.report.add(
        `character of text past the ${HTML_CAPS.text} a drawing holds`,
        `characters of text past the ${HTML_CAPS.text} a drawing holds`,
        this.#textDropped,
      );
    }
    if (this.#missing > 0) {
      this.report.add(
        'character Roboto cannot draw, such as an emoji',
        'characters Roboto cannot draw, such as emoji',
        this.#missing,
      );
    }
  }

  #children(
    element: HtmlElement,
    depth: number,
    spacingOnly: boolean,
    hiding: boolean,
  ): CleanChild[] {
    const children: CleanChild[] = [];
    // Text joins the text before it, such as an unwrapped link's.
    const add = (each: CleanChild) => {
      const last = children.at(-1);
      if (typeof each === 'string' && typeof last === 'string') {
        children[children.length - 1] = last + each;
      } else children.push(each);
    };
    for (const child of element.childNodes) {
      if (isText(child)) {
        if (spacingOnly && child.value.trim() === '') continue;
        const text = this.#textOf(child.value);
        if (text !== '') add(text);
      } else if (child.nodeName === '#comment') {
        this.report.add('comment');
      } else if ('tagName' in child) {
        for (const each of this.element(child, depth + 1, hiding)) add(each);
      }
    }
    return children;
  }

  /** Reports what a dropped part of the page held, without keeping any of it. */
  #reportDropped(nodes: readonly HtmlNode[]): void {
    for (const node of nodes) {
      if (node.nodeName === '#comment') this.report.add('comment');
      else if ('tagName' in node && !(node.tagName === 'style' && node.namespaceURI === HTML_NS)) {
        this.report.add(`${named(node.tagName)} element`, `${named(node.tagName)} elements`);
      }
    }
  }

  /** The `style`, `class` and `id` an element has, every other attribute reported as dropped. */
  #attributes(element: HtmlElement): { style?: string; classes: string[]; id?: string } {
    const read: { style?: string; classes: string[]; id?: string } = { classes: [] };
    for (const attribute of element.attrs) {
      const name = attribute.name.toLowerCase();
      if (attribute.namespace !== undefined && attribute.namespace !== '') {
        this.report.add('attribute of another namespace', 'attributes of other namespaces');
      } else if (name === 'style') read.style = attribute.value;
      else if (name === 'class') {
        read.classes = [...new Set(attribute.value.split(/[\t\n\f\r ]+/).filter(Boolean))];
      } else if (name === 'id') read.id = attribute.value;
      else if (name.startsWith('on')) this.report.add('event handler attribute');
      else if (ADDRESSES.has(name)) this.report.add('outside reference');
      else this.report.add('other attribute');
    }
    return read;
  }

  /** An element's style, folded in the cascade's order, within the budget on folding. */
  #fold(tag: string, read: { style?: string; classes: string[]; id?: string }) {
    const style = new Map<string, string>(Object.entries(STARTING_STYLES[tag] ?? {}));
    const spend = (work: number) => {
      this.#folded += work;
      if (this.#folded > HTML_CAPS.foldBudget) {
        tooLarge('The HTML’s style rules match too many of its elements to fold them in.');
      }
    };
    const apply = (declarations: readonly (readonly [string, string])[]) => {
      spend(declarations.length);
      for (const [property, value] of declarations) style.set(property, value);
    };
    const byElement = this.styles.byElement.get(tag) ?? [];
    spend(byElement.length);
    for (const rule of byElement) apply(rule.declarations);
    const byClass = new Set<FoldedRule>();
    for (const name of read.classes) {
      const rules = this.styles.byClass.get(name) ?? [];
      spend(rules.length);
      for (const rule of rules) byClass.add(rule);
    }
    for (const rule of [...byClass].sort((a, b) => a.order - b.order)) apply(rule.declarations);
    if (read.id !== undefined) {
      const rules = this.styles.byId.get(read.id) ?? [];
      spend(rules.length);
      for (const rule of rules) apply(rule.declarations);
    }
    if (read.style !== undefined) {
      apply(keptDeclarations(parseDeclarations(read.style), this.report));
    }
    return Object.fromEntries(style);
  }

  /** Text as the drawing keeps it: the characters Roboto draws, within the cap on text. */
  #textOf(value: string): string {
    let kept = '';
    for (const character of value) {
      const code = character.codePointAt(0) as number;
      // Spacing and line breaks are kept; any other character the font lacks is left out.
      if (code > 0x20 && !this.options.covers(code)) {
        this.#missing += 1;
        continue;
      }
      if (this.#text + character.length > HTML_CAPS.text) {
        this.#textDropped += 1;
        continue;
      }
      this.#text += character.length;
      kept += character;
    }
    return kept;
  }
}
