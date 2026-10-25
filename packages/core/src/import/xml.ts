/**
 * A strict XML reader for files made elsewhere, such as draw.io's (ADR-0042). Like the SVG cleaner's
 * (ADR-0027), it refuses a DTD of the file's own and every entity but XML's five, so that nothing in a
 * file can expand into more than it holds or refer to anything outside it, and it reads within caps.
 * A DOCTYPE that only names an outside DTD, as draw.io's SVG export writes, is skipped: the DTD is
 * never fetched or read. Namespaces are not worked out; names are kept as written.
 */
import { MAX_READ_CHARACTERS, refuse } from './reading';

/** An element as read: its name as written, its attributes, its children and its own text. */
export interface XmlElement {
  name: string;
  attributes: ReadonlyMap<string, string>;
  children: XmlElement[];
  /** The text directly inside it, with CDATA unwrapped and references decoded. */
  text: string;
}

/** The caps on what the reader reads. */
export const XML_CAPS = Object.freeze({
  characters: MAX_READ_CHARACTERS,
  elements: 500_000,
  depth: 256,
  /** Attributes of one element. */
  attributes: 1_024,
});

/** An XML name, read where it starts. */
const NAME = /[A-Za-z_:\u00C0-\uFFFF][-A-Za-z0-9._:\u00B7\u00C0-\uFFFF]*/y;

interface Building {
  name: string;
  attributes: Map<string, string>;
  children: XmlElement[];
  parts: string[];
}

/** Reads XML text into its outermost element, or refuses it with why. */
export function readXml(text: string): XmlElement {
  if (text.length > XML_CAPS.characters) {
    refuse(
      `The file is over ${XML_CAPS.characters / (1024 * 1024)} MiB, the most an import reads.`,
    );
  }
  const s = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const stack: Building[] = [];
  let root: XmlElement | undefined;
  let elements = 0;
  let doctype = false;
  let i = 0;

  const addText = (value: string) => {
    const parent = stack.at(-1);
    if (parent) parent.parts.push(value);
    else if (value.trim() !== '') refuse('The XML has text outside its outermost element.');
  };

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) {
      addText(decodeReferences(s.slice(i)));
      break;
    }
    if (lt > i) addText(decodeReferences(s.slice(i, lt)));
    i = lt;
    if (s.startsWith('<?', i)) {
      const end = s.indexOf('?>', i + 2);
      if (end === -1) refuse('The XML has an unfinished processing instruction.');
      const target = /^[^\s?]*/.exec(s.slice(i + 2, Math.min(end, i + 64)))?.[0] ?? '';
      if (target.toLowerCase() === 'xml' && (i !== 0 || target !== 'xml')) {
        refuse('The XML declaration is out of place.');
      }
      i = end + 2;
    } else if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end === -1) refuse('The XML has an unfinished comment.');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      if (end === -1) refuse('The XML has an unfinished CDATA section.');
      if (stack.length === 0) refuse('The XML has text outside its outermost element.');
      addText(s.slice(i + 9, end));
      i = end + 3;
    } else if (s.startsWith('<!DOCTYPE', i)) {
      if (doctype || root !== undefined || stack.length > 0) {
        refuse('The XML has a DOCTYPE out of place.');
      }
      doctype = true;
      i = skipDoctype(s, i);
    } else if (s.startsWith('<!', i)) {
      refuse('The XML has a declaration, such as an ENTITY, outside a DOCTYPE; it is not read.');
    } else if (s.startsWith('</', i)) {
      const end = s.indexOf('>', i + 2);
      if (end === -1) refuse('The XML has an unfinished end tag.');
      const name = s.slice(i + 2, end).trimEnd();
      const open = stack.pop();
      if (!open || open.name !== name) refuse(`The XML closes "${name}" out of order.`);
      const element = finished(open);
      const parent = stack.at(-1);
      if (parent) parent.children.push(element);
      else root = element;
      i = end + 1;
    } else {
      const tag = readStartTag(s, i);
      i = tag.end;
      if (stack.length === 0 && root !== undefined) {
        refuse('The XML has more than one outermost element.');
      }
      elements += 1;
      if (elements > XML_CAPS.elements) {
        refuse(`The XML has over ${XML_CAPS.elements.toLocaleString('en')} elements.`);
      }
      const building: Building = {
        name: tag.name,
        attributes: tag.attributes,
        children: [],
        parts: [],
      };
      if (tag.empty) {
        const element = finished(building);
        const parent = stack.at(-1);
        if (parent) parent.children.push(element);
        else root = element;
      } else {
        stack.push(building);
        if (stack.length > XML_CAPS.depth) {
          refuse(`The XML nests elements over ${XML_CAPS.depth} deep.`);
        }
      }
    }
  }
  if (stack.length > 0) refuse(`The XML leaves "${stack.at(-1)?.name ?? ''}" open.`);
  if (!root) refuse('The XML has no element.');
  return root;
}

function finished(building: Building): XmlElement {
  return {
    name: building.name,
    attributes: building.attributes,
    children: building.children,
    text: building.parts.join(''),
  };
}

/**
 * Skips a DOCTYPE that names an outside DTD at most, and refuses one with declarations of its own,
 * between `[` and `]`, which is where entities that expand would be declared.
 */
function skipDoctype(s: string, start: number): number {
  let i = start + '<!DOCTYPE'.length;
  while (i < s.length) {
    const char = s[i];
    if (char === '"' || char === "'") {
      const close = s.indexOf(char, i + 1);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (char === '[') {
      refuse('The XML has a DOCTYPE with declarations of its own, which is not read.');
    }
    if (char === '>') return i + 1;
    i++;
  }
  return refuse('The XML has an unfinished declaration.');
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
    if (i >= s.length) refuse(`The XML leaves the tag "${name}" unfinished.`);
    if (i === spaceStart) refuse(`The tag "${name}" runs its attributes together.`);
    const attribute = readName(s, i);
    i += attribute.length;
    while (i < s.length && isSpace(s.charCodeAt(i))) i++;
    if (s[i] !== '=') refuse(`The attribute "${attribute}" of "${name}" has no value.`);
    i++;
    while (i < s.length && isSpace(s.charCodeAt(i))) i++;
    const quote = s[i];
    if (quote !== '"' && quote !== "'") {
      refuse(`The attribute "${attribute}" of "${name}" has an unquoted value.`);
    }
    const close = s.indexOf(quote, i + 1);
    if (close === -1) refuse(`The attribute "${attribute}" of "${name}" is unfinished.`);
    const raw = s.slice(i + 1, close);
    if (raw.includes('<')) refuse(`The attribute "${attribute}" of "${name}" holds "<".`);
    if (attributes.has(attribute)) {
      refuse(`The tag "${name}" has the attribute "${attribute}" twice.`);
    }
    if (attributes.size >= XML_CAPS.attributes) {
      refuse(`The tag "${name}" has over ${XML_CAPS.attributes.toLocaleString('en')} attributes.`);
    }
    // XML turns each tab and line break written in a value into a space; references stay as written.
    attributes.set(attribute, decodeReferences(raw.replace(/[\t\n\r]/g, ' ')));
    i = close + 1;
  }
}

function readName(s: string, at: number): string {
  NAME.lastIndex = at;
  const name = NAME.exec(s)?.[0];
  if (name === undefined) refuse('The XML has a malformed tag.');
  return name;
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/** Text with its references replaced; only XML's own five entities are known. */
function decodeReferences(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&([^;&]{0,32});?/g, (whole, name: string) => {
    if (!whole.endsWith(';')) refuse('The XML has an "&" that starts no reference.');
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
    if (code === undefined) refuse(`The XML uses the entity "&${name};", which is not read.`);
    const allowed =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (!allowed) refuse(`The XML refers to a character XML does not allow (&${name};).`);
    return String.fromCodePoint(code);
  });
}
