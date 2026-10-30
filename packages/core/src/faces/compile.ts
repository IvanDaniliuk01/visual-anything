/**
 * Compiling a face (ADR 0083): its markup read by the strict reader and checked against the subset,
 * its slots and conditions read, and its style read, into the nodes `layOutFace` fills. Compiled faces
 * are kept by their text, so that a face shared by many shapes is compiled once.
 */
import type { FaceVariant } from '@visual-anything/schema';
import { sha256 } from '../code/hash';
import { FACE_CAPS } from './limits';
import { faceMessage, type FacePart, type FaceProblem } from './problems';
import { readMarkup, type MarkupElement, type MarkupNode, type Position } from './reader';
import {
  hasSlots,
  parseCondition,
  parseSlots,
  type Condition,
  type Reference,
  type SlotText,
} from './slots';
import { readDeclarations, readStyle, type Assignment, type StyleRule } from './style';

/** A face with each of its parts worked out along its component's chain. */
export interface ResolvedFace {
  size: 'content' | 'shape';
  markup: readonly string[];
  style: readonly string[];
  variants: readonly FaceVariant[];
  collapsed?: string;
}

/** The elements a face's markup may hold, and what each is. */
export type FaceTag =
  // Boxes.
  | 'div'
  | 'span'
  | 'p'
  | 'header'
  | 'footer'
  | 'section'
  | 'ul'
  | 'ol'
  | 'li'
  // Text.
  | 'b'
  | 'strong'
  | 'i'
  | 'em'
  | 'u'
  | 's'
  | 'code'
  | 'small'
  | 'mark'
  | 'sub'
  | 'sup'
  | 'br'
  | 'hr'
  // The face's own.
  | 'rows'
  | 'contents'
  | 'detail'
  | 'badges'
  | 'drawing'
  | 'icon'
  | 'image';

const TAGS: ReadonlySet<string> = new Set<FaceTag>([
  'div',
  'span',
  'p',
  'header',
  'footer',
  'section',
  'ul',
  'ol',
  'li',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'code',
  'small',
  'mark',
  'sub',
  'sup',
  'br',
  'hr',
  'rows',
  'contents',
  'detail',
  'badges',
  'drawing',
  'icon',
  'image',
]);

/** Elements that hold nothing. */
const EMPTY: ReadonlySet<string> = new Set([
  'br',
  'hr',
  'rows',
  'contents',
  'detail',
  'badges',
  'drawing',
  'icon',
  'image',
]);

/** The face's own elements that a markup holds at most once. */
const ONCE: ReadonlySet<string> = new Set([
  'rows',
  'contents',
  'detail',
  'badges',
  'drawing',
  'icon',
]);

/** Elements that are part of a line of text, unless their style makes them boxes. */
export const INLINE_TAGS: ReadonlySet<string> = new Set([
  'span',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'code',
  'small',
  'mark',
  'sub',
  'sup',
  'br',
  'detail',
  'badges',
]);

/** A class of an element: literal text and slots, whose values are reduced to `[a-z0-9-]`. */
export type ClassSlots = SlotText;

export interface FaceElement {
  kind: 'element';
  tag: FaceTag;
  classes: readonly ClassSlots[];
  /** Whether a class holds a slot, so that its style is worked out for each element. */
  dynamicClasses: boolean;
  /** Its `style`, read. */
  inline: readonly Assignment[];
  children: readonly FaceNode[];
  /** For `<image ref="…"/>`: the image's id. */
  ref?: string;
  at: Position;
}

export interface FaceText {
  kind: 'text';
  text: SlotText;
  at: Position;
}

/** `<each>`: what it repeats over, and its content. */
export interface FaceEach {
  kind: 'each';
  of:
    | { kind: 'attributes'; only?: readonly string[]; except?: readonly string[] }
    | { kind: 'list'; ref: Reference };
  children: readonly FaceNode[];
  at: Position;
}

/** An element with `if`, and the elements with `else` that follow it: the first that holds shows. */
export interface FaceChoice {
  kind: 'choice';
  branches: readonly { condition?: Condition; node: FaceElement | FaceEach }[];
}

export type FaceNode = FaceElement | FaceText | FaceEach | FaceChoice;

/** A markup compiled: its nodes, and the face's own elements it holds. */
export interface CompiledMarkup {
  nodes: readonly FaceNode[];
  part: FacePart;
  /** The face's own elements it holds. */
  holds: ReadonlySet<string>;
}

/** An attribute a slot or a condition names, and where. */
export interface NamedAttribute {
  name: string;
  part: FacePart;
  at: Position;
}

export interface CompiledFace {
  /** The SHA-256 of the face's parts, for caches of what is drawn from it. */
  hash: string;
  size: 'content' | 'shape';
  rules: readonly StyleRule[];
  /** Its markup. */
  markup?: CompiledMarkup;
  variants: ReadonlyMap<string, CompiledMarkup>;
  collapsed?: string;
  /** Whether it can be laid out: no problem of it is an error. */
  ok: boolean;
  problems: readonly FaceProblem[];
  /** The attributes its slots and conditions name. */
  attributes: readonly NamedAttribute[];
}

const cache = new Map<string, CompiledFace>();
const CACHE_SIZE = 512;

/** A face compiled, from the cache when the same face was compiled before. */
export function compileFace(face: ResolvedFace): CompiledFace {
  // A face past its caps is refused before anything reads the whole of it, its cache key included.
  const tooLarge = capProblems(face);
  if (tooLarge.length > 0) return refusedAsTooLarge(face, tooLarge);
  const key = JSON.stringify([face.size, face.markup, face.style, face.variants, face.collapsed]);
  const known = cache.get(key);
  if (known !== undefined) return known;
  const compiled = compileUncached(face, key);
  if (cache.size >= CACHE_SIZE) cache.clear();
  cache.set(key, compiled);
  return compiled;
}

/** A face past its caps: refused with nothing of it read, and hashed by its size and problems. */
function refusedAsTooLarge(face: ResolvedFace, problems: readonly FaceProblem[]): CompiledFace {
  return {
    hash: sha256(JSON.stringify(['face-too-large', face.size, problems])),
    size: face.size,
    rules: [],
    variants: new Map(),
    ok: false,
    problems,
    attributes: [],
  };
}

function compileUncached(face: ResolvedFace, key: string): CompiledFace {
  const problems: FaceProblem[] = [];
  const attributes: NamedAttribute[] = [];
  const error: ErrorSink = (part, at, reason, code = 'invalid-face') =>
    problems.push({ code, severity: 'error', part, line: at.line, column: at.column, reason });
  const warn = (part: FacePart, at: Position, reason: string) =>
    problems.push({ code: 'invalid-face', severity: 'warning', part, ...at, reason });

  checkLines(face, error);

  const style = face.style.join('\n');
  const read = readStyle(style);
  let rules: StyleRule[] = [];
  if (read.ok) {
    rules = read.rules;
    for (const dropped of read.dropped) warn({ kind: 'style' }, dropped, dropped.reason);
  } else {
    error({ kind: 'style' }, read.at, read.reason, 'face-too-large');
  }

  const markup =
    face.markup.length === 0
      ? undefined
      : compileMarkup(face.markup, { kind: 'markup' }, error, warn, attributes);
  const variants = new Map<string, CompiledMarkup>();
  for (const variant of face.variants) {
    const part: FacePart = { kind: 'variant', id: variant.id };
    if (variants.has(variant.id)) {
      error(part, START, `Two variants are named "${variant.id}".`);
      continue;
    }
    const compiled = compileMarkup(variant.markup, part, error, warn, attributes);
    if (compiled !== undefined) variants.set(variant.id, compiled);
  }
  if (face.collapsed !== undefined && !face.variants.some((each) => each.id === face.collapsed)) {
    // The variant a collapsed container shows is a setting of the face, in none of its texts.
    error(
      { kind: 'markup' },
      WHOLE_FACE,
      `A collapsed container shows the variant "${face.collapsed}", which the face does not have.`,
    );
  }
  return {
    hash: sha256(key),
    size: face.size,
    rules,
    ...(markup === undefined ? {} : { markup }),
    variants,
    ...(face.collapsed === undefined ? {} : { collapsed: face.collapsed }),
    ok: !problems.some((each) => each.severity === 'error'),
    problems,
    attributes,
  };
}

/** The first line and column of a text. */
const START: Position = { line: 1, column: 1 };
/** Where a problem with a setting of the face, rather than with a place in one of its texts, is. */
const WHOLE_FACE: Position = { line: 0, column: 0 };

/**
 * The caps a face's text is held to before it is read (`face-too-large`), each at the first line
 * and column past it. Nothing is read past a cap: lines are counted by their number, and bytes only
 * until the cap is passed.
 */
function capProblems(face: ResolvedFace): FaceProblem[] {
  const problems: FaceProblem[] = [];
  const tooLarge = (part: FacePart, at: Position, reason: string) =>
    problems.push({
      code: 'face-too-large',
      severity: 'error',
      part,
      line: at.line,
      column: at.column,
      reason,
    });
  const markups: { part: FacePart; lines: readonly string[] }[] = [
    { part: { kind: 'markup' }, lines: face.markup },
    ...face.variants.map((each) => ({
      part: { kind: 'variant' as const, id: each.id },
      lines: each.markup,
    })),
  ];
  const past = face.variants[FACE_CAPS.variants];
  if (past !== undefined) {
    tooLarge(
      { kind: 'variant', id: past.id },
      START,
      `A face has at most ${FACE_CAPS.variants} variants.`,
    );
  }
  let counted = 0;
  for (const markup of markups) {
    if (counted + markup.lines.length > FACE_CAPS.markupLines) {
      tooLarge(
        markup.part,
        { line: FACE_CAPS.markupLines - counted + 1, column: 1 },
        `A face's markup, its variants' included, holds at most ${FACE_CAPS.markupLines} lines.`,
      );
      break;
    }
    counted += markup.lines.length;
  }
  let bytes = 0;
  for (const markup of markups) {
    const found = bytesWithin(markup.lines, FACE_CAPS.markupBytes - bytes);
    if (typeof found !== 'number') {
      tooLarge(
        markup.part,
        found,
        `A face's markup, its variants' included, holds at most 16 KiB.`,
      );
      break;
    }
    bytes += found;
  }
  const style = bytesWithin(face.style, FACE_CAPS.styleBytes);
  if (typeof style !== 'number') {
    tooLarge({ kind: 'style' }, style, `A face's style holds at most 16 KiB.`);
  }
  return problems;
}

/**
 * The UTF-8 bytes of lines joined by line feeds, when they are at most `room`; otherwise where the
 * first byte past it is: at the character it belongs to, or past the end of the line whose line feed
 * it is. It reads no further than that byte.
 */
function bytesWithin(lines: readonly string[], room: number): number | Position {
  let bytes = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line]!;
    if (line > 0) {
      bytes += 1;
      if (bytes > room) return { line, column: lines[line - 1]!.length + 1 };
    }
    for (let at = 0; at < text.length; at += 1) {
      const pair = surrogatePairAt(text, at);
      const code = text.charCodeAt(at);
      // A lone surrogate is written as U+FFFD, three bytes, as `utf8` writes it.
      bytes += pair ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (bytes > room) return { line: line + 1, column: at + 1 };
      if (pair) at += 1;
    }
  }
  return bytes;
}

function surrogatePairAt(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code < 0xd800 || code > 0xdbff || at + 1 >= text.length) return false;
  const next = text.charCodeAt(at + 1);
  return next >= 0xdc00 && next <= 0xdfff;
}

/** Each line of a face's texts is at most 2,000 characters and holds no line break. */
function checkLines(face: ResolvedFace, error: ErrorSink): void {
  const long = (lines: readonly string[], part: FacePart) => {
    for (let at = 0; at < lines.length; at += 1) {
      const line = lines[at]!;
      const broken = line.search(/[\r\n]/);
      const column =
        broken !== -1 && broken < FACE_CAPS.lineCharacters
          ? broken + 1
          : line.length > FACE_CAPS.lineCharacters
            ? FACE_CAPS.lineCharacters + 1
            : -1;
      if (column !== -1) {
        error(
          part,
          { line: at + 1, column },
          'A line holds at most 2,000 characters and no line break.',
        );
        return;
      }
    }
  };
  long(face.markup, { kind: 'markup' });
  long(face.style, { kind: 'style' });
  for (const variant of face.variants) long(variant.markup, { kind: 'variant', id: variant.id });
}

type ErrorSink = (part: FacePart, at: Position, reason: string, code?: FaceProblem['code']) => void;

/** Compiles one markup; `undefined` when it cannot be read. */
function compileMarkup(
  lines: readonly string[],
  part: FacePart,
  error: ErrorSink,
  warn: (part: FacePart, at: Position, reason: string) => void,
  attributes: NamedAttribute[],
): CompiledMarkup | undefined {
  const read = readMarkup(lines.join('\n'));
  if (!read.ok) {
    error(part, read.at, read.reason, read.code);
    return undefined;
  }
  const holds = new Set<string>();
  const before = attributes.length;
  const compiler = new Compiler(part, error, warn, attributes, holds);
  const nodes = compiler.nodes(read.nodes, 0, true);
  if (compiler.failed) {
    attributes.length = before;
    return undefined;
  }
  return { nodes, part, holds };
}

class Compiler {
  failed = false;

  constructor(
    private readonly part: FacePart,
    private readonly sink: ErrorSink,
    private readonly warnSink: (part: FacePart, at: Position, reason: string) => void,
    private readonly attributes: NamedAttribute[],
    private readonly holds: Set<string>,
  ) {}

  private error(at: Position, reason: string): void {
    this.failed = true;
    this.sink(this.part, at, reason);
  }

  nodes(nodes: readonly MarkupNode[], depth: number, top: boolean): FaceNode[] {
    const out: FaceNode[] = [];
    const elements = nodes.filter((node): node is MarkupElement => node.kind === 'element');
    const last = elements.at(-1);
    for (const node of nodes) {
      if (node.kind === 'text') {
        const text = this.slotText(node.text, node);
        if (text !== undefined) out.push({ kind: 'text', text, at: node });
        continue;
      }
      if (node.name === 'rows' || node.name === 'contents') {
        if (!top || node !== last) {
          this.error(
            node,
            `<${node.name}/> is the last element at the top of the markup, under what the face shows above it.`,
          );
        }
      }
      const elseAttribute = node.attributes.find((each) => each.name === 'else');
      const ifAttribute = node.attributes.find((each) => each.name === 'if');
      const compiled = this.element(node, depth);
      if (compiled === undefined) continue;
      if (elseAttribute !== undefined) {
        // Spaces between an element with "if" and the next with "else" are passed over.
        const previous = out.findLast(
          (each) =>
            !(
              each.kind === 'text' &&
              each.text.every((part) => typeof part === 'string' && part.trim() === '')
            ),
        );
        const condition =
          elseAttribute.value.trim() === ''
            ? undefined
            : this.condition(elseAttribute.value, elseAttribute.valueAt);
        if (ifAttribute !== undefined) {
          this.error(
            elseAttribute,
            `An element takes "if" or "else", not both: write the condition in "else".`,
          );
        } else if (
          previous?.kind !== 'choice' ||
          previous.branches.at(-1)!.condition === undefined
        ) {
          this.error(
            elseAttribute,
            '"else" follows an element with "if", or one with "else" and a condition.',
          );
        } else {
          (previous.branches as { condition?: Condition; node: FaceElement | FaceEach }[]).push({
            ...(condition === undefined ? {} : { condition }),
            node: compiled,
          });
        }
        continue;
      }
      if (ifAttribute !== undefined) {
        const condition = this.condition(ifAttribute.value, ifAttribute.valueAt);
        if (condition !== undefined)
          out.push({ kind: 'choice', branches: [{ condition, node: compiled }] });
        continue;
      }
      out.push(compiled);
    }
    return out;
  }

  private slotText(text: string, at: Position): SlotText | undefined {
    const parsed = parseSlots(text);
    if (!parsed.ok) {
      this.error(shifted(at, text, parsed.offset), parsed.reason);
      return undefined;
    }
    for (const part of parsed.value) {
      if (typeof part !== 'string' && part.ref.kind === 'attribute') {
        this.attributes.push({ name: part.ref.name, part: this.part, at });
      }
    }
    return parsed.value;
  }

  private condition(text: string, at: Position): Condition | undefined {
    const parsed = parseCondition(text);
    if (!parsed.ok) {
      this.error(shifted(at, text, parsed.offset), parsed.reason);
      return undefined;
    }
    if (parsed.value.ref.kind === 'attribute') {
      this.attributes.push({ name: parsed.value.ref.name, part: this.part, at });
    }
    return parsed.value;
  }

  private element(node: MarkupElement, depth: number): FaceElement | FaceEach | undefined {
    const name = node.name;
    if (name === 'each') return this.each(node, depth);
    if (!TAGS.has(name)) {
      this.error(
        node,
        [
          'script',
          'style',
          'img',
          'a',
          'svg',
          'iframe',
          'template',
          'object',
          'embed',
          'link',
          'form',
          'input',
          'video',
          'audio',
          'canvas',
        ].includes(name)
          ? `<${name}> is not part of a face: nothing in a face runs or is fetched.`
          : `<${name}> is not an element a face takes.`,
      );
      return undefined;
    }
    if (ONCE.has(name)) {
      if (this.holds.has(name)) this.error(node, `A markup holds <${name}/> once.`);
      this.holds.add(name);
      if (this.holds.has('rows') && this.holds.has('contents')) {
        this.error(node, 'A markup holds <rows/> or <contents/>, not both.');
      }
    }
    if (EMPTY.has(name) && node.children.length > 0) {
      this.error(node, `<${name}/> holds nothing: write it "<${name}/>".`);
    }
    let classes: ClassSlots[] = [];
    let inline: Assignment[] = [];
    let ref: string | undefined;
    for (const attribute of node.attributes) {
      switch (attribute.name) {
        case 'class': {
          const read = this.classes(attribute.value, attribute.valueAt);
          if (read !== undefined) classes = read;
          break;
        }
        case 'style':
          inline = readDeclarations(attribute.value, 0, (offset, reason) =>
            this.warnSink(
              this.part,
              { line: attribute.valueAt.line, column: attribute.valueAt.column + offset },
              reason,
            ),
          );
          break;
        case 'if':
        case 'else':
          if (name === 'rows' || name === 'contents') {
            this.error(
              attribute,
              `<${name}/> takes no condition: it shows where the shape's ${name} go.`,
            );
          }
          break;
        case 'ref':
          if (name !== 'image') {
            this.error(attribute, `"ref" belongs to <image/> only.`);
          } else if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(attribute.value)) {
            this.error(attribute.valueAt, 'An image is named by the id its package gives it.');
          } else ref = attribute.value;
          break;
        default:
          this.error(
            attribute,
            attribute.name.startsWith('on')
              ? `"${attribute.name}" is refused: nothing in a face runs.`
              : [
                    'href',
                    'src',
                    'srcset',
                    'action',
                    'xlink',
                    'data',
                    'poster',
                    'formaction',
                  ].includes(attribute.name)
                ? `"${attribute.name}" is refused: nothing in a face is fetched.`
                : `"${attribute.name}" is not an attribute a face takes: only class, style, if and else.`,
          );
      }
    }
    if (name === 'image' && ref === undefined && !this.failed) {
      this.error(node, '<image/> names an image of the package with ref="its id".');
    }
    const children = this.nodes(node.children, depth + 1, false);
    return {
      kind: 'element',
      tag: name as FaceTag,
      classes,
      dynamicClasses: classes.some(hasSlots),
      inline,
      children,
      ...(ref === undefined ? {} : { ref }),
      at: { line: node.line, column: node.column },
    };
  }

  private classes(value: string, at: Position): ClassSlots[] | undefined {
    const text = this.slotText(value, at);
    if (text === undefined) return undefined;
    // Split into classes at spaces in the literal parts; a slot belongs to the class it touches.
    const classes: (string | SlotText[number])[][] = [[]];
    for (const part of text) {
      if (typeof part !== 'string') {
        classes.at(-1)!.push(part);
        continue;
      }
      const words = part.split(/\s+/);
      words.forEach((word, index) => {
        if (index > 0) classes.push([]);
        if (word !== '') classes.at(-1)!.push(word);
      });
    }
    return classes.filter((each) => each.length > 0);
  }

  private each(node: MarkupElement, depth: number): FaceEach | undefined {
    let of: FaceEach['of'] | undefined;
    let only: string[] | undefined;
    let except: string[] | undefined;
    for (const attribute of node.attributes) {
      switch (attribute.name) {
        case 'of': {
          const value = attribute.value.trim();
          if (value === 'attributes') of = { kind: 'attributes' };
          else {
            const parsed = parseCondition(value);
            if (
              !parsed.ok ||
              parsed.value.kind !== 'has' ||
              parsed.value.not ||
              parsed.value.ref.kind !== 'attribute'
            ) {
              this.error(
                attribute.valueAt,
                '"of" names "attributes", or a list attribute by its name.',
              );
            } else {
              of = { kind: 'list', ref: parsed.value.ref };
              this.attributes.push({
                name: parsed.value.ref.name,
                part: this.part,
                at: attribute.valueAt,
              });
            }
          }
          break;
        }
        case 'only':
        case 'except': {
          const names = attribute.value
            .trim()
            .split(/\s+/)
            .filter((each) => each !== '');
          if (attribute.name === 'only') only = names;
          else except = names;
          break;
        }
        case 'if':
        case 'else':
          break;
        case 'class':
        case 'style':
          this.error(
            attribute,
            `<each> makes no box of its own: put "${attribute.name}" on what it repeats.`,
          );
          break;
        default:
          this.error(
            attribute,
            `"${attribute.name}" is not an attribute <each> takes: only of, only, except, if and else.`,
          );
      }
    }
    if (of === undefined) {
      if (!node.attributes.some((each) => each.name === 'of'))
        this.error(node, '<each> says what it repeats over with "of".');
      return undefined;
    }
    if ((only !== undefined || except !== undefined) && of.kind !== 'attributes') {
      this.error(node, '"only" and "except" choose among the attributes, with of="attributes".');
    }
    if (of.kind === 'attributes') {
      of = {
        kind: 'attributes',
        ...(only === undefined ? {} : { only }),
        ...(except === undefined ? {} : { except }),
      };
    }
    const children = this.nodes(node.children, depth + 1, false);
    return { kind: 'each', of, children, at: { line: node.line, column: node.column } };
  }
}

/** Where a place inside a text is, given where the text starts. */
function shifted(at: Position, text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const breaks = before.split('\n');
  if (breaks.length === 1) return { line: at.line, column: at.column + offset };
  return { line: at.line + breaks.length - 1, column: breaks.at(-1)!.length + 1 };
}

/** The problems of a compiled face as sentences, errors first. */
export function faceMessages(compiled: CompiledFace): string[] {
  return [...compiled.problems]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
    .map(faceMessage);
}
