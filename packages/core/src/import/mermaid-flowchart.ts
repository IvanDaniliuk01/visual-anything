/**
 * Mermaid flowcharts: nodes with their shapes, written in brackets or with `@{ shape: … }`, become
 * elements whose kind is their class when they have one and their shape otherwise; edges in each of
 * their forms become relations whose kind is their line and heads; subgraphs become containers.
 * Styles, links, callbacks and images are reported, never read or followed.
 */
import { RELATES_TO_ID } from '@visual-anything/schema';
import type { DiagramReader } from './mermaid';
import { mermaidText, splitOutsideQuotes } from './mermaid';
import { own } from './reader';
import { FLOWCHART_SHAPES, componentForWords } from './suggest';

/** How each bracket form writes its kind, for the mapping dialog. */
const SHAPE_LABELS: Readonly<Record<string, string>> = {
  rectangle: '[ ]',
  round: '( )',
  stadium: '([ ])',
  subroutine: '[[ ]]',
  cylinder: '[( )]',
  circle: '(( ))',
  'double-circle': '((( )))',
  asymmetric: '> ]',
  rhombus: '{ }',
  hexagon: '{{ }}',
  parallelogram: '[/ /]',
  'parallelogram-alt': '[\\ \\]',
  trapezoid: '[/ \\]',
  'trapezoid-alt': '[\\ /]',
};

/** The bracket forms, longest first, with the closings each may end with and the kind each gives. */
const BRACKETS: readonly { open: string; closes: readonly [string, string][] }[] = [
  { open: '(((', closes: [[')))', 'double-circle']] },
  { open: '((', closes: [['))', 'circle']] },
  { open: '([', closes: [['])', 'stadium']] },
  { open: '[[', closes: [[']]', 'subroutine']] },
  { open: '[(', closes: [[')]', 'cylinder']] },
  { open: '{{', closes: [['}}', 'hexagon']] },
  {
    open: '[/',
    closes: [
      ['/]', 'parallelogram'],
      ['\\]', 'trapezoid'],
    ],
  },
  {
    open: '[\\',
    closes: [
      ['\\]', 'parallelogram-alt'],
      ['/]', 'trapezoid-alt'],
    ],
  },
  { open: '(', closes: [[')', 'round']] },
  { open: '[', closes: [[']', 'rectangle']] },
  { open: '{', closes: [['}', 'rhombus']] },
  { open: '>', closes: [[']', 'asymmetric']] },
];

/** The names `@{ shape: … }` takes, for the shapes the brackets also write. */
const NAMED_SHAPES: Readonly<Record<string, string>> = {
  rect: 'rectangle',
  rectangle: 'rectangle',
  proc: 'rectangle',
  process: 'rectangle',
  rounded: 'round',
  event: 'round',
  stadium: 'stadium',
  pill: 'stadium',
  terminal: 'stadium',
  'fr-rect': 'subroutine',
  subproc: 'subroutine',
  subprocess: 'subroutine',
  subroutine: 'subroutine',
  cyl: 'cylinder',
  cylinder: 'cylinder',
  db: 'cylinder',
  database: 'cylinder',
  circle: 'circle',
  circ: 'circle',
  'dbl-circ': 'double-circle',
  'double-circle': 'double-circle',
  odd: 'asymmetric',
  diam: 'rhombus',
  diamond: 'rhombus',
  decision: 'rhombus',
  question: 'rhombus',
  hex: 'hexagon',
  hexagon: 'hexagon',
  prepare: 'hexagon',
  'lean-r': 'parallelogram',
  'lean-right': 'parallelogram',
  'in-out': 'parallelogram',
  'lean-l': 'parallelogram-alt',
  'lean-left': 'parallelogram-alt',
  'out-in': 'parallelogram-alt',
  'trap-b': 'trapezoid',
  trapezoid: 'trapezoid',
  priority: 'trapezoid',
  'trap-t': 'trapezoid-alt',
  'inv-trapezoid': 'trapezoid-alt',
  manual: 'trapezoid-alt',
};

const STYLES = 'Styles are not read: the components’ appearances draw the shapes.';
const LINKS = 'Links and callbacks are never followed.';
const IMAGES = 'Images in imports are left out; a component’s own image shows instead.';

/** A node as the statement wrote it, before it is added. */
interface NodeMention {
  id: string;
  /** Its label, when the statement gives one. */
  label?: string;
  /** Its shape kind, when the statement gives one. */
  shape?: string;
  /** How `@{ shape: … }` named a shape the brackets do not write. */
  namedShape?: string;
  className?: string;
  /** Whether it shows an image or an icon, which imports leave out. */
  picture?: boolean;
}

/** An edge between two groups of nodes, as the statement wrote it. */
interface EdgeMention {
  id?: string;
  kind: string;
  label: string;
  /** Whether it runs from its right end to its left. */
  reversed: boolean;
  invisible: boolean;
}

/** What each node ends up as, beyond what the builder holds. */
interface NodeState {
  shape: string;
  namedShape?: string;
  className?: string;
  subgraph: boolean;
}

/** Reads a flowchart's statements. */
export const readFlowchart: DiagramReader = (lines, makeBuilder) => {
  const builder = makeBuilder();
  const nodes = new Map<string, NodeState>();
  const open: { key: string; line: number }[] = [];
  let subgraphs = 0;
  let inDescription = false;

  const ensure = (id: string): NodeState => {
    let state = nodes.get(id);
    if (state === undefined) {
      state = { shape: 'rectangle', subgraph: false };
      nodes.set(id, state);
      builder.add(
        { key: id, sourceId: id, name: builder.name(id, id), kind: 'rectangle' },
        shapeInfo('rectangle'),
      );
    }
    return state;
  };
  /** The subgraph a node is mentioned in holds it, unless another already does. */
  const mentioned = (id: string) => {
    const inside = open[open.length - 1];
    if (inside !== undefined && inside.key !== id) builder.contain(id, inside.key);
  };
  const apply = (mention: NodeMention) => {
    const state = ensure(mention.id);
    const element = builder.element(mention.id);
    if (element === undefined) return;
    if (mention.label !== undefined)
      element.name = builder.name(mermaidText(mention.label), mention.id);
    if (mention.shape !== undefined) {
      state.shape = mention.shape;
      delete state.namedShape;
    }
    if (mention.namedShape !== undefined) state.namedShape = mention.namedShape;
    if (mention.className !== undefined) state.className = mention.className;
    mentioned(mention.id);
  };

  for (const { text, line } of lines) {
    if (inDescription) {
      if (text.includes('}')) inDescription = false;
      continue;
    }
    for (const part of statementsOf(text)) {
      const statement = part.trim();
      if (statement === '') continue;
      const word = /^[A-Za-z]+/.exec(statement)?.[0] ?? '';
      switch (word) {
        case 'subgraph': {
          if (!/^subgraph\b/.test(statement)) break;
          const { id, title } = subgraphOf(statement.slice('subgraph'.length).trim(), ++subgraphs);
          const state = ensure(id);
          state.subgraph = true;
          const element = builder.element(id);
          if (element !== undefined && title !== undefined) {
            element.name = builder.name(mermaidText(title), id);
          }
          mentioned(id);
          open.push({ key: id, line });
          continue;
        }
        case 'end':
          if (statement !== 'end') break;
          if (open.pop() === undefined) {
            builder.report(statement, 'This line ends no subgraph, so it is not read.');
          }
          continue;
        case 'direction':
          continue;
        case 'classDef':
        case 'style':
        case 'linkStyle':
          if (!/^(classDef|style|linkStyle)\s/.test(statement)) break;
          builder.report(statement, STYLES);
          continue;
        case 'class': {
          const found = /^class\s+(\S+)\s+([\w-]+)\s*$/.exec(statement);
          if (found === null) break;
          for (const id of (found[1] ?? '').split(',').filter((each) => each !== '')) {
            ensure(id).className = found[2];
          }
          continue;
        }
        case 'click':
        case 'href':
          if (!/^(click|href)\s/.test(statement)) break;
          builder.report(statement, LINKS);
          continue;
        case 'accTitle':
          if (/^accTitle\s*:/.test(statement)) continue;
          break;
        case 'accDescr':
          if (/^accDescr\s*:/.test(statement)) continue;
          if (/^accDescr\s*\{/.test(statement)) {
            inDescription = !statement.includes('}');
            continue;
          }
          break;
        default:
          break;
      }
      const chain = readChain(statement);
      if (chain === undefined) {
        builder.report(
          statement,
          'This line is not read: it is not a node, an edge or a subgraph.',
        );
        continue;
      }
      for (const group of chain.groups) {
        for (const mention of group) {
          apply(mention);
          if (mention.picture === true) builder.report(statement, IMAGES);
        }
      }
      chain.edges.forEach((edge, at) => {
        const left = chain.groups[at] ?? [];
        const right = chain.groups[at + 1] ?? [];
        if (edge.invisible) {
          builder.report(
            statement,
            'An invisible link only spaces shapes out, so it brings no relation.',
          );
          return;
        }
        for (const from of left) {
          for (const to of right) {
            const [start, end] = edge.reversed ? [to.id, from.id] : [from.id, to.id];
            const name = edge.label === '' ? '' : builder.name(mermaidText(edge.label), '');
            builder.relate(
              {
                ...(edge.id === undefined ? {} : { sourceId: edge.id }),
                from: start,
                to: end,
                kind: edge.kind,
                ...(name === '' || name === '?' ? {} : { name }),
              },
              edgeInfo(edge.kind),
            );
          }
        }
      });
    }
  }
  const unclosed = open[0];
  if (unclosed !== undefined) {
    return {
      problems: [`The subgraph "${unclosed.key}" that starts on line ${unclosed.line} never ends.`],
    };
  }
  for (const [id, state] of nodes) {
    const element = builder.element(id);
    if (element === undefined) continue;
    const kind = kindOf(state);
    if (element.kind !== kind.kind) builder.setKind(element, kind.kind, kind.info);
  }
  return { builder };
};

/** The kind a node ends up with: a subgraph, its class, its named shape, or its bracket shape. */
function kindOf(state: NodeState): { kind: string; info: { label: string; suggested?: string } } {
  if (state.subgraph) return { kind: 'subgraph', info: shapeInfo('subgraph') };
  if (state.className !== undefined) {
    const suggested = componentForWords(state.className);
    return {
      kind: `class:${state.className}`,
      info: { label: `:::${state.className}`, ...(suggested ? { suggested } : {}) },
    };
  }
  if (state.namedShape !== undefined) {
    return {
      kind: `shape:${state.namedShape}`,
      info: { label: `@{ shape: ${state.namedShape} }` },
    };
  }
  return { kind: state.shape, info: shapeInfo(state.shape) };
}

function shapeInfo(shape: string): { label: string; suggested?: string } {
  const suggested = own(FLOWCHART_SHAPES, shape);
  return {
    label: shape === 'subgraph' ? 'subgraph' : (own(SHAPE_LABELS, shape) ?? shape),
    ...(suggested === undefined ? {} : { suggested }),
  };
}

/** How each edge kind is written, for the mapping dialog. */
const EDGE_LABELS: Readonly<Record<string, string>> = {
  arrow: '-->',
  line: '---',
  both: '<-->',
  circle: '--o',
  cross: '--x',
  'thick-arrow': '==>',
  'thick-line': '===',
  'thick-both': '<==>',
  'thick-circle': '==o',
  'thick-cross': '==x',
  'dotted-arrow': '-.->',
  'dotted-line': '-.-',
  'dotted-both': '<-.->',
  'dotted-circle': '-.-o',
  'dotted-cross': '-.-x',
};

function edgeInfo(kind: string): { label: string; suggested: string } {
  return {
    label: own(EDGE_LABELS, kind) ?? kind,
    suggested: kind.endsWith('line') ? RELATES_TO_ID : 'systems.communicates-with',
  };
}

/**
 * The statements of a line: split at each `;` outside double quotes, but for one that ends an entity
 * such as `&amp;` or Mermaid's `#quot;`.
 */
function statementsOf(text: string): string[] {
  if (!text.includes(';')) return [text];
  const statements: string[] = [];
  let quoted = false;
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '"') quoted = !quoted;
    else if (
      char === ';' &&
      !quoted &&
      !/[&#]#?[A-Za-z0-9]{1,32}$/.test(text.slice(Math.max(start, at - 34), at))
    ) {
      statements.push(text.slice(start, at));
      start = at + 1;
    }
  }
  statements.push(text.slice(start));
  return statements;
}

/** A subgraph's id and title, from what follows `subgraph`. */
function subgraphOf(rest: string, count: number): { id: string; title?: string } {
  const bracketed = /^([^\s[]+)\s*\[(.*)\]\s*$/.exec(rest);
  if (bracketed !== null) return { id: bracketed[1] ?? '', title: bracketed[2] ?? '' };
  if (rest === '') return { id: `subgraph ${count}` };
  if (rest.startsWith('"') && rest.endsWith('"')) return { id: rest.slice(1, -1), title: rest };
  return { id: rest, title: rest };
}

/** A cursor over one statement. */
class Cursor {
  at = 0;
  constructor(readonly text: string) {}

  get done(): boolean {
    return this.at >= this.text.length;
  }

  spaces(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at] ?? '')) this.at += 1;
  }

  /** Matches a sticky pattern here, moving past it. */
  match(pattern: RegExp): RegExpExecArray | undefined {
    pattern.lastIndex = this.at;
    const found = pattern.exec(this.text);
    if (found === null) return undefined;
    this.at = pattern.lastIndex;
    return found;
  }
}

/** Whether a character may be part of a node's id. */
function isWord(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

/** A statement of nodes joined by edges, or undefined when it is not one. */
function readChain(
  statement: string,
): { groups: NodeMention[][]; edges: EdgeMention[] } | undefined {
  const cursor = new Cursor(statement);
  const groups: NodeMention[][] = [];
  const edges: EdgeMention[] = [];
  const first = readGroup(cursor);
  if (first === undefined) return undefined;
  groups.push(first);
  for (;;) {
    cursor.spaces();
    if (cursor.done) break;
    const edge = readEdge(cursor);
    if (edge === undefined) return undefined;
    cursor.spaces();
    const group = readGroup(cursor);
    if (group === undefined) return undefined;
    edges.push(edge);
    groups.push(group);
  }
  return { groups, edges };
}

function readGroup(cursor: Cursor): NodeMention[] | undefined {
  const group: NodeMention[] = [];
  for (;;) {
    cursor.spaces();
    const node = readNode(cursor);
    if (node === undefined) return undefined;
    group.push(node);
    const before = cursor.at;
    cursor.spaces();
    if (cursor.text[cursor.at] === '&') {
      cursor.at += 1;
      continue;
    }
    cursor.at = before;
    return group;
  }
}

function readNode(cursor: Cursor): NodeMention | undefined {
  const { text } = cursor;
  const start = cursor.at;
  while (cursor.at < text.length) {
    const char = text[cursor.at];
    if (isWord(char)) cursor.at += 1;
    else if ((char === '-' || char === '.') && isWord(text[cursor.at + 1])) cursor.at += 1;
    else break;
  }
  if (cursor.at === start) return undefined;
  const id = text.slice(start, cursor.at);
  const mention: NodeMention = { id };
  if (text.startsWith('@{', cursor.at)) {
    const object = readObject(cursor);
    if (object === undefined) return undefined;
    const shape = object.get('shape');
    if (shape !== undefined) {
      const known = own(NAMED_SHAPES, shape.toLowerCase());
      if (known !== undefined) mention.shape = known;
      else {
        mention.shape = 'rectangle';
        mention.namedShape = shape.toLowerCase();
      }
    }
    const label = object.get('label');
    if (label !== undefined) mention.label = label;
    if (object.has('img') || object.has('icon')) {
      mention.picture = true;
      mention.shape ??= 'rectangle';
    }
  } else {
    const shaped = readShape(cursor);
    if (shaped === null) return undefined;
    if (shaped !== undefined) {
      mention.shape = shaped.shape;
      mention.label = shaped.label;
    }
  }
  const className = cursor.match(/:::([\w-]+)/y);
  if (className !== undefined) mention.className = className[1];
  return mention;
}

/** A bracketed shape and its label at the cursor; undefined when none starts there, null when it never closes. */
function readShape(cursor: Cursor): { shape: string; label: string } | undefined | null {
  const { text } = cursor;
  const bracket = BRACKETS.find(({ open }) => text.startsWith(open, cursor.at));
  if (bracket === undefined) return undefined;
  let at = cursor.at + bracket.open.length;
  let label: string;
  let closing: number;
  if (text[at] === '"') {
    const end = text.indexOf('"', at + 1);
    if (end < 0) return null;
    label = text.slice(at, end + 1);
    at = end + 1;
    closing = at;
  } else {
    closing = -1;
    label = '';
  }
  let best: { index: number; close: string; shape: string } | undefined;
  for (const [close, shape] of bracket.closes) {
    const index =
      closing >= 0 ? (text.startsWith(close, closing) ? closing : -1) : text.indexOf(close, at);
    if (index >= 0 && (best === undefined || index < best.index)) best = { index, close, shape };
  }
  if (best === undefined) return null;
  if (closing < 0) label = text.slice(at, best.index);
  cursor.at = best.index + best.close.length;
  return { shape: best.shape, label };
}

/** An `@{ key: value, … }` object at the cursor, its values as written without quotes. */
function readObject(cursor: Cursor): Map<string, string> | undefined {
  const { text } = cursor;
  let at = cursor.at + 2;
  let quoted = false;
  for (; at < text.length; at++) {
    const char = text[at];
    if (char === '"') quoted = !quoted;
    else if (char === '}' && !quoted) break;
  }
  if (at >= text.length) return undefined;
  const body = text.slice(cursor.at + 2, at);
  cursor.at = at + 1;
  const values = new Map<string, string>();
  for (const pair of splitOutsideQuotes(body, ',')) {
    const found = /^\s*([\w-]+)\s*:([\s\S]*)$/.exec(pair);
    if (found === null) continue;
    let value = (found[2] ?? '').trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    values.set((found[1] ?? '').toLowerCase(), value);
  }
  return values;
}

/** An edge's id written before it, as in `e1@-->`. */
const EDGE_ID = /([\p{L}\p{N}_-]+)@(?=[-=~<ox])/uy;

/** An edge that opens a label it closes later, as `-- text -->`. */
const OPENER = /([<ox])?(--|==|-\.)(?=\s)/y;

/** An edge written whole: its start, its line and its end. */
const WHOLE = /([<ox](?=[-=~]))?(-{2,}|-\.+-|={2,}|~{3,})([>ox])?/y;

function readEdge(cursor: Cursor): EdgeMention | undefined {
  const id = cursor.match(EDGE_ID)?.[1];
  let start: string | undefined;
  let line: string;
  let end: string | undefined;
  let label = '';
  const opener = cursor.match(OPENER);
  if (opener !== undefined) {
    start = opener[1];
    const open = opener[2] ?? '';
    const closer =
      open === '--'
        ? /(-{2,}[>ox]|-{3,})/g
        : open === '=='
          ? /(={2,}[>ox]|={3,})/g
          : /(\.-+[>ox]?)/g;
    closer.lastIndex = cursor.at;
    const found = closer.exec(cursor.text);
    if (found === null) return undefined;
    label = cursor.text.slice(cursor.at, found.index).trim();
    const token = found[1] ?? '';
    cursor.at = found.index + token.length;
    line = open === '-.' ? '-.-' : open;
    end =
      /[>ox]$/.test(token) && !/^-{3,}$/.test(token) && !/^={3,}$/.test(token)
        ? token.slice(-1)
        : undefined;
  } else {
    const whole = cursor.match(WHOLE);
    if (whole === undefined) return undefined;
    start = whole[1];
    line = whole[2] ?? '';
    end = whole[3];
  }
  const piped = cursor.match(/\s*\|([^|]*)\|/y);
  if (piped !== undefined) label = piped[1] ?? '';
  if (line.startsWith('~')) {
    return {
      ...(id === undefined ? {} : { id }),
      kind: 'invisible',
      label,
      reversed: false,
      invisible: true,
    };
  }
  const style = line.startsWith('=') ? 'thick-' : line.includes('.') ? 'dotted-' : '';
  let head: string;
  let reversed = false;
  if (start === '<' && end === '>') head = 'both';
  else if (end === '>') head = 'arrow';
  else if (end === 'o' || start === 'o') head = 'circle';
  else if (end === 'x' || start === 'x') head = 'cross';
  else if (start === '<') {
    head = 'arrow';
    reversed = true;
  } else head = 'line';
  return {
    ...(id === undefined ? {} : { id }),
    kind: `${style}${head}`,
    label,
    reversed,
    invisible: false,
  };
}
