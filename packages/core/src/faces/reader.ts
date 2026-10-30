/**
 * The strict reader of a face's markup (ADR 0083): well-formed XHTML, the kind the SVG cleaner reads.
 * Every element is closed (`<br/>`), every attribute has a quoted value, names are in lowercase, and
 * the only entities are `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric ones. Comments are
 * skipped; doctypes, CDATA and processing instructions are refused. It reads in one pass, in time
 * linear in the text, never throws, and stops at the first problem, which it gives with its line and
 * column. It only reads: which elements and attributes a face may use is `compile.ts`'s to say.
 */
import { FACE_CAPS } from './limits';

/** A place in the text, from 1. */
export interface Position {
  line: number;
  column: number;
}

export interface MarkupAttribute extends Position {
  name: string;
  /** Its value, entities read. */
  value: string;
  /** Where its value starts, after the quote. */
  valueAt: Position;
}

export interface MarkupElement extends Position {
  kind: 'element';
  name: string;
  attributes: MarkupAttribute[];
  children: MarkupNode[];
}

export interface MarkupText extends Position {
  kind: 'text';
  /** Its characters, entities read. */
  text: string;
}

export type MarkupNode = MarkupElement | MarkupText;

export type MarkupRead =
  | { ok: true; nodes: MarkupNode[] }
  | { ok: false; code: 'invalid-face' | 'face-too-large'; reason: string; at: Position };

/** Turns offsets into lines and columns. */
export class Positions {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
      this.starts.push(at + 1);
    }
  }

  at(offset: number): Position {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.starts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - this.starts[low]! + 1 };
  }
}

const NAME_START = /[a-z]/;
const NAME_PART = /[a-z0-9-]/;

/** Thrown inside the reader only, and turned into its answer. */
class Refusal extends Error {
  constructor(
    readonly offset: number,
    readonly reason: string,
    readonly code: 'invalid-face' | 'face-too-large' = 'invalid-face',
  ) {
    super(reason);
  }
}

/** Reads markup into elements and text. */
export function readMarkup(text: string): MarkupRead {
  const positions = new Positions(text);
  try {
    return { ok: true, nodes: new Reader(text, positions).read() };
  } catch (thrown) {
    if (thrown instanceof Refusal) {
      return {
        ok: false,
        code: thrown.code,
        reason: thrown.reason,
        at: positions.at(thrown.offset),
      };
    }
    throw thrown;
  }
}

class Reader {
  private at = 0;

  constructor(
    private readonly text: string,
    private readonly positions: Positions,
  ) {}

  read(): MarkupNode[] {
    const root: MarkupNode[] = [];
    const open: MarkupElement[] = [];
    const children = () => open.at(-1)?.children ?? root;
    const { text } = this;
    while (this.at < text.length) {
      const lt = text.indexOf('<', this.at);
      const end = lt === -1 ? text.length : lt;
      if (end > this.at) {
        const start = this.at;
        children().push({
          kind: 'text',
          text: this.entities(start, end),
          ...this.positions.at(start),
        });
        this.at = end;
        continue;
      }
      // At a "<".
      if (text.startsWith('<!--', this.at)) {
        const close = text.indexOf('-->', this.at + 4);
        if (close === -1) this.refuse(this.at, 'A comment is never closed with "-->".');
        const inside = text.slice(this.at + 4, close);
        if (inside.includes('--'))
          this.refuse(this.at, 'A comment holds "--", which XHTML refuses.');
        this.at = close + 3;
        continue;
      }
      if (text.startsWith('<!', this.at) || text.startsWith('<?', this.at)) {
        this.refuse(
          this.at,
          'Doctypes, CDATA sections and processing instructions are not part of a face.',
        );
      }
      if (text.startsWith('</', this.at)) {
        const start = this.at;
        this.at += 2;
        const name = this.name('A closing tag');
        this.spaces();
        if (text[this.at] !== '>')
          this.refuse(this.at, `The closing tag of "${name}" ends with ">".`);
        this.at += 1;
        const current = open.pop();
        if (current === undefined) {
          this.refuse(start, `"</${name}>" closes no open element.`);
        }
        if (current.name !== name) {
          this.refuse(
            start,
            `"</${name}>" closes "${current.name}", opened at line ${current.line}, column ${current.column}.`,
          );
        }
        continue;
      }
      const element = this.startTag();
      children().push(element.node);
      if (!element.closed) {
        open.push(element.node);
        if (open.length > FACE_CAPS.depth) {
          this.refuse(
            this.offsetOf(element.node),
            `Elements nest more than ${FACE_CAPS.depth} deep.`,
            'face-too-large',
          );
        }
      } else if (open.length + 1 > FACE_CAPS.depth) {
        this.refuse(
          this.offsetOf(element.node),
          `Elements nest more than ${FACE_CAPS.depth} deep.`,
          'face-too-large',
        );
      }
    }
    const unclosed = open.at(-1);
    if (unclosed !== undefined) {
      this.refuse(
        this.offsetOf(unclosed),
        `"<${unclosed.name}>" is never closed: write "</${unclosed.name}>", or "<${unclosed.name}/>" when it is empty.`,
      );
    }
    return root;
  }

  /** Where each element starts, to refuse it there. */
  private readonly starts = new WeakMap<MarkupElement, number>();

  private offsetOf(element: MarkupElement): number {
    return this.starts.get(element) ?? 0;
  }

  private startTag(): { node: MarkupElement; closed: boolean } {
    const start = this.at;
    this.at += 1;
    const name = this.name('An element');
    const node: MarkupElement = {
      kind: 'element',
      name,
      attributes: [],
      children: [],
      ...this.positions.at(start),
    };
    this.starts.set(node, start);
    const { text } = this;
    for (;;) {
      const spaced = this.spaces();
      if (this.at >= text.length) this.refuse(start, `The tag "<${name}" is never ended with ">".`);
      if (text[this.at] === '>') {
        this.at += 1;
        return { node, closed: false };
      }
      if (text.startsWith('/>', this.at)) {
        this.at += 2;
        return { node, closed: true };
      }
      if (!spaced) this.refuse(this.at, `Attributes of "${name}" are separated by spaces.`);
      const attributeAt = this.at;
      const attribute = this.name(`An attribute of "${name}"`);
      this.spaces();
      if (text[this.at] !== '=') {
        this.refuse(
          attributeAt,
          `The attribute "${attribute}" of "${name}" needs a quoted value, such as ${attribute}="…".`,
        );
      }
      this.at += 1;
      this.spaces();
      const quote = text[this.at];
      if (quote !== '"' && quote !== "'") {
        this.refuse(this.at, `The value of "${attribute}" is written in quotes.`);
      }
      const valueStart = this.at + 1;
      const close = text.indexOf(quote, valueStart);
      if (close === -1) this.refuse(this.at, `The value of "${attribute}" is never closed.`);
      const lt = text.indexOf('<', valueStart);
      if (lt !== -1 && lt < close) {
        this.refuse(lt, `The value of "${attribute}" holds "<", which is written "&lt;".`);
      }
      if (node.attributes.some((each) => each.name === attribute)) {
        this.refuse(attributeAt, `"${name}" has the attribute "${attribute}" twice.`);
      }
      node.attributes.push({
        name: attribute,
        value: this.entities(valueStart, close),
        valueAt: this.positions.at(valueStart),
        ...this.positions.at(attributeAt),
      });
      this.at = close + 1;
    }
  }

  /** A name in lowercase, as XHTML writes them, at the cursor. */
  private name(what: string): string {
    const { text } = this;
    const start = this.at;
    if (!NAME_START.test(text[this.at] ?? '')) {
      const found = text[this.at];
      if (found !== undefined && /[A-Z]/.test(found)) {
        this.refuse(start, `${what} is named in lowercase.`);
      }
      this.refuse(start, `${what} needs a name, a letter first.`);
    }
    this.at += 1;
    while (this.at < text.length && NAME_PART.test(text[this.at]!)) this.at += 1;
    if (/[A-Z_:.]/.test(text[this.at] ?? '')) {
      this.refuse(this.at, `${what} is named in lowercase letters, digits and "-".`);
    }
    return text.slice(start, this.at);
  }

  /** Skips spaces, answering whether there were any. */
  private spaces(): boolean {
    const start = this.at;
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) this.at += 1;
    return this.at > start;
  }

  /** The text between two offsets with its entities read. */
  private entities(start: number, end: number): string {
    const { text } = this;
    let out = '';
    let at = start;
    for (let amp = text.indexOf('&', at); amp !== -1 && amp < end; amp = text.indexOf('&', at)) {
      out += text.slice(at, amp);
      const semi = text.indexOf(';', amp);
      if (semi === -1 || semi >= end || semi - amp > 10) {
        this.refuse(amp, 'A "&" starts an entity, such as "&amp;", which ends with ";".');
      }
      out += this.entity(text.slice(amp + 1, semi), amp);
      at = semi + 1;
    }
    return out + text.slice(at, end);
  }

  private entity(name: string, offset: number): string {
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
    const numeric = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(name);
    if (numeric) {
      const point = numeric[1] !== undefined ? parseInt(numeric[1], 16) : Number(numeric[2]);
      const allowed =
        point === 0x9 ||
        point === 0xa ||
        point === 0xd ||
        (point >= 0x20 && point <= 0xd7ff) ||
        (point >= 0xe000 && point <= 0xfffd) ||
        (point >= 0x10000 && point <= 0x10ffff);
      if (!allowed) this.refuse(offset, `"&${name};" is not a character XHTML allows.`);
      return String.fromCodePoint(point);
    }
    this.refuse(
      offset,
      `"&${name};" is not an entity a face takes: only &amp;, &lt;, &gt;, &quot;, &apos; and numeric ones.`,
    );
  }

  private refuse(offset: number, reason: string, code?: 'invalid-face' | 'face-too-large'): never {
    throw new Refusal(offset, reason, code);
  }
}
