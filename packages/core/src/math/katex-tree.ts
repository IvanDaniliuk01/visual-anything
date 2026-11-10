/**
 * The slice of KaTeX's internals Math leans on (ADR 0106), typed here since KaTeX's own declarations
 * leave them out: `__renderToHTMLTree` and the classes of its tree, `__domTree`. KaTeX is pinned
 * exactly, since these change between versions; the golden test holds them.
 */
import katex from 'katex';
import type { KatexOptions } from 'katex';

/** Inline styles KaTeX sets, by their CSSOM names, such as `marginRight`. */
export type KatexStyle = Partial<Record<string, string>>;

/** A `<span>`: what most of the tree is. */
export interface KatexSpan {
  classes: string[];
  children: KatexNode[];
  style: KatexStyle;
  attributes: Record<string, string>;
  height: number;
  depth: number;
}

/** Text in one font: one or more characters. */
export interface KatexSymbol {
  text: string;
  /** KaTeX's TeX width, in ems. */
  width: number;
  /** The italic correction, in ems, given as a right margin. */
  italic: number;
  classes: string[];
  style: KatexStyle;
}

/** An inline `<svg>` for a surd, a stretchy delimiter, a brace, a wide accent, an arrow or a cancel stroke. */
export interface KatexSvg {
  children: (KatexPath | KatexLine)[];
  attributes: Record<string, string>;
}

export interface KatexPath {
  pathName: string;
  alternate?: string | null;
  toMarkup(): string;
}

export interface KatexLine {
  attributes: Record<string, string>;
}

/** Children without an element of their own. */
export interface KatexFragment {
  children: readonly KatexNode[];
}

export type KatexNode = KatexSpan | KatexSymbol | KatexSvg | KatexFragment;

type NodeClass<T> = abstract new (...args: never[]) => T;

interface KatexInternals {
  __renderToHTMLTree(tex: string, options: KatexOptions): KatexSpan;
  __domTree: {
    Span: NodeClass<KatexSpan>;
    Anchor: NodeClass<KatexSpan>;
    SymbolNode: NodeClass<KatexSymbol>;
    SvgNode: NodeClass<KatexSvg>;
    PathNode: NodeClass<KatexPath>;
    LineNode: NodeClass<KatexLine>;
  };
}

const internals = katex as unknown as KatexInternals;
const { Span, Anchor, SymbolNode, SvgNode, PathNode, LineNode } = internals.__domTree;

export const renderToHTMLTree = (tex: string, options: KatexOptions): KatexSpan =>
  internals.__renderToHTMLTree(tex, options);

/** What a node of the tree is, told by KaTeX's own classes, so a minifier cannot break it. */
export type KatexNodeKind =
  | { kind: 'symbol'; node: KatexSymbol }
  | { kind: 'svg'; node: KatexSvg }
  | { kind: 'span'; node: KatexSpan }
  | { kind: 'link'; node: KatexSpan }
  | { kind: 'fragment'; node: KatexFragment }
  | { kind: 'other' };

export function kindOf(node: KatexNode): KatexNodeKind {
  if (node instanceof SymbolNode) return { kind: 'symbol', node };
  if (node instanceof SvgNode) return { kind: 'svg', node };
  if (node instanceof Span) return { kind: 'span', node };
  if (node instanceof Anchor) return { kind: 'link', node };
  // KaTeX does not export DocumentFragment: it is the node with children and no attributes.
  if (
    typeof node === 'object' &&
    'children' in node &&
    !('attributes' in node) &&
    !('src' in node)
  ) {
    return { kind: 'fragment', node };
  }
  return { kind: 'other' };
}

export const isPathNode = (node: unknown): node is KatexPath => node instanceof PathNode;
export const isLineNode = (node: unknown): node is KatexLine => node instanceof LineNode;

export { ParseError } from 'katex';
