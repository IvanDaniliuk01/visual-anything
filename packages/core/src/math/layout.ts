/**
 * Lays out KaTeX's HTML tree (`__renderToHTMLTree`) without a browser, by emulating the slice of
 * `katex.css` the tree uses (ADR 0106). Ported from the proof on `prototype/math-layout`, which matched
 * Chrome glyph by glyph on 86 formulas at four sizes.
 *
 * Everything is in ems of the formula's font size, y down, from the left of the content on its
 * baseline. By default nothing is snapped to pixels, so the drawing does not depend on zoom; the
 * golden test turns on the browser's snapping of borders and Blink's rounding of line boxes with
 * `pixelsPerEm`.
 */
import advanceTable from './advances.json';
import type { MathFont, MathPath, MathRule } from './drawing';
import {
  isLineNode,
  isPathNode,
  kindOf,
  type KatexNode,
  type KatexSpan,
  type KatexStyle,
  type KatexSvg,
  type KatexSymbol,
} from './katex-tree';
import type { MathAdvanceTable } from './tables';

const ADVANCES = advanceTable as MathAdvanceTable;

/** Why a tree is not laid out: a construct the layout does not know, or a character no font holds. */
export class MathLayoutRefusal extends Error {}

export interface LayoutOptions {
  /**
   * Pixels per em, to copy the browser's pixel snapping: borders thinner than a pixel drawn 1 px,
   * a column separator at least 1 px wide, line boxes rounded as Blink rounds them. Only the golden
   * test sets it; 0 or absent lays out in ems.
   */
  pixelsPerEm?: number;
  /** Leaves `\tag` out, as the golden test's measurements do; otherwise a tag is refused. */
  skipTags?: boolean;
}

export interface LaidOutGlyph {
  char: string;
  font: MathFont;
  x: number;
  baseline: number;
  size: number;
  /** In a phantom: measured but not drawn. */
  hidden: boolean;
}

export interface LaidOutRule {
  /** KaTeX's classes, joined by dots. */
  kind: string;
  /** The whole box: for a frame (`\fbox`) its outer edge, else the drawn band. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** For a frame (`\fbox`) or a column separator, the borders that show; the rest of its box is empty. */
  frame?: { top: number; right: number; bottom: number; left: number };
  dashed: boolean;
  hidden: boolean;
}

export interface LaidOutPath extends MathPath {
  hidden: boolean;
}

export interface MathLayout {
  width: number;
  height: number;
  depth: number;
  glyphs: LaidOutGlyph[];
  rules: LaidOutRule[];
  paths: LaidOutPath[];
}

// --- Constants of katex.css ------------------------------------------------------------------------

const SIZES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.44, 1.728, 2.074, 2.488];

interface FontSpec {
  family: string;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
}

/** Font rules of katex.css, in stylesheet order (later wins). */
const FONT_RULES: readonly [string, Partial<FontSpec>][] = [
  ['textbf', { weight: 'bold' }],
  ['textit', { style: 'italic' }],
  ['textrm', { family: 'Main' }],
  ['textsf', { family: 'SansSerif' }],
  ['texttt', { family: 'Typewriter' }],
  ['mathnormal', { family: 'Math', style: 'italic' }],
  ['mathit', { family: 'Main', style: 'italic' }],
  ['mathrm', { style: 'normal' }],
  ['mathbf', { family: 'Main', weight: 'bold' }],
  ['boldsymbol', { family: 'Math', weight: 'bold', style: 'italic' }],
  ['amsrm', { family: 'AMS' }],
  ['mathbb', { family: 'AMS' }],
  ['textbb', { family: 'AMS' }],
  ['mathcal', { family: 'Caligraphic' }],
  ['mathfrak', { family: 'Fraktur' }],
  ['textfrak', { family: 'Fraktur' }],
  ['mathboldfrak', { family: 'Fraktur', weight: 'bold' }],
  ['textboldfrak', { family: 'Fraktur', weight: 'bold' }],
  ['mathtt', { family: 'Typewriter' }],
  ['mathscr', { family: 'Script' }],
  ['textscr', { family: 'Script' }],
  ['mathsf', { family: 'SansSerif' }],
  ['textsf', { family: 'SansSerif' }],
  ['mathboldsf', { family: 'SansSerif', weight: 'bold' }],
  ['textboldsf', { family: 'SansSerif', weight: 'bold' }],
  ['mathsfit', { family: 'SansSerif', style: 'italic' }],
  ['mathitsf', { family: 'SansSerif', style: 'italic' }],
  ['textitsf', { family: 'SansSerif', style: 'italic' }],
  ['mainrm', { family: 'Main', style: 'normal' }],
];

/** Absolutely positioned pieces of stretchy SVGs: offsets and widths as fractions of the positioned parent. */
interface AbsSpec {
  left?: number;
  right?: number;
  w: number;
}
const ABS: Readonly<Record<string, AbsSpec>> = {
  'brace-left': { left: 0, w: 0.251 },
  'brace-center': { left: 0.25, w: 0.5 },
  'brace-right': { right: 0, w: 0.251 },
  'halfarrow-left': { left: 0, w: 0.502 },
  'halfarrow-right': { right: 0, w: 0.502 },
};

type Align = 'left' | 'center' | 'right';
const TEXT_ALIGN: Readonly<Record<string, Align>> = {
  'col-align-l': 'left',
  'col-align-c': 'center',
  'col-align-r': 'right',
};

const POSITIONED = new Set([
  'katex-base',
  'delimcenter',
  'op-symbol',
  'accent-body',
  'hide-tail',
  'katex-stretchy',
  'katex-rule',
  'llap',
  'rlap',
  'clap',
  'cd-vert-arrow',
  'halfarrow-left',
  'halfarrow-right',
  'brace-left',
  'brace-center',
  'brace-right',
]);

const INLINE_BLOCK = [
  'katex-base',
  'katex-strut',
  'mspace',
  'nulldelimiter',
  'frac-line',
  'overline-line',
  'underline-line',
  'katex-hline',
  'katex-hdashline',
  'katex-rule',
  'vertical-separator',
  'arraycolsep',
  'reflectbox',
  'cd-vert-arrow',
  'accent-body',
  'katex-fix',
  'katex-thinbox',
  'katex-vbox',
];

const LINE_RULES = [
  'frac-line',
  'overline-line',
  'underline-line',
  'katex-hline',
  'katex-hdashline',
];

const TAGS =
  'Math cannot lay out tags or numbered formulas yet: use \\notag, or a starred environment such as align*.';
const CD = 'Math cannot lay out the CD environment yet.';
const COLORS = 'colors come from the theme';

/**
 * Classes whose CSS the layout does not emulate, each with the message that says so: a tree that holds
 * one is refused, never drawn wrong.
 */
const NOT_LAID_OUT: Readonly<Record<string, string>> = {
  'katex-tag': TAGS,
  'eqn-num': TAGS,
  'cd-arrow-pad': CD,
  'cd-label-left': CD,
  'cd-label-right': CD,
  'cd-vert-arrow': CD,
  angl: 'Math cannot lay out \\angl yet.',
  anglpad: 'Math cannot lay out \\angl yet.',
  reflectbox: 'Math cannot lay out \\reflectbox yet.',
  fcolorbox: `Math does not take \\fcolorbox: ${COLORS}.`,
  fleqn: 'Math cannot lay out flush-left formulas yet.',
  leqno: 'Math cannot lay out tags on the left yet.',
};

/** Inline styles that would draw what a math drawing has no place for, each with its message. */
const NOT_LAID_OUT_STYLES: Readonly<Record<string, string>> = {
  backgroundColor: `Math does not take colored backgrounds: ${COLORS}.`,
  borderColor: `Math does not take colored borders: ${COLORS}.`,
  textShadow: 'Math cannot lay out \\pmb yet.',
};

// --- Context and items -----------------------------------------------------------------------------

interface Pos {
  w: number | null;
}

interface Ctx {
  fs: number;
  font: FontSpec;
  align: Align;
  /** The containing block's width, for percentages. */
  cw: number | null;
  /** The nearest positioned ancestor. */
  pos: Pos;
  inVlistBlock: boolean;
  multParent: boolean;
  multDelim: string | null;
  alignForChild: Align | null;
  mfracGrand: boolean;
  hidden: boolean;
}

interface ItemBase {
  x: number;
  y: number;
  inVlist?: boolean;
  absSpec?: AbsSpec;
  absPos?: Pos;
}
interface GlyphItem extends ItemBase {
  t: 'g';
  char: string;
  font: MathFont;
  size: number;
  hidden: boolean;
}
interface FontBoxItem extends ItemBase {
  t: 'fontbox';
  font: MathFont;
  size: number;
}
interface StrutItem extends ItemBase {
  t: 'strut';
  asc: number;
  desc: number;
}
interface RuleItem extends ItemBase {
  t: 'r';
  kind: string;
  w: number;
  h: number;
  frame?: { top: number; right: number; bottom: number; left: number };
  dashed: boolean;
  hidden: boolean;
}
interface SvgItem extends ItemBase {
  t: 'svg';
  node: KatexSvg;
  w: number | null;
  wFrom: Pos | null;
  h: number | null;
  fromParent: boolean;
  /** The font size at the SVG, for its strokes' widths. */
  fs: number;
  hidden: boolean;
}
type Item = GlyphItem | FontBoxItem | StrutItem | RuleItem | SvgItem;

interface Frag {
  /** The border box's width. */
  w: number;
  ml: number;
  mr: number;
  items: Item[];
  hasPct?: boolean;
  lineBoxes?: boolean;
  inlineBlockLike?: boolean;
  /** Absolutely positioned: takes no room in the flow. */
  abs?: boolean;
  /** The box's height, for inline blocks and blocks. */
  h?: number | null;
}

// --- Lengths ---------------------------------------------------------------------------------------

/** Set for one call of `layoutTree`, which is synchronous. */
let pixelsPerEm = 0;

/** A length in ems of the root, from a CSS value and the element's font size. */
function len(value: string | undefined, fs: number, pctBase?: number | null): number | null {
  if (value === undefined || value === '') return null;
  const n = parseFloat(value);
  if (value.endsWith('em')) return n * fs;
  if (value.endsWith('px')) return n / 16;
  if (value.endsWith('%')) return pctBase == null ? null : (n / 100) * pctBase;
  return n === 0 ? 0 : null;
}

function border(value: number): number {
  if (!pixelsPerEm || !value) return value;
  const px = value * pixelsPerEm;
  return (px < 1 ? 1 : Math.floor(px)) / pixelsPerEm;
}

/** margin-left and margin-right, from the longhands or the `margin` shorthand. */
function hMargins(st: KatexStyle, fs: number): [number, number] {
  let ml = 0;
  let mr = 0;
  if (st.margin) {
    const parts = st.margin.trim().split(/\s+/);
    const right = parts.length === 1 ? parts[0] : parts[1];
    const left = parts.length === 4 ? parts[3] : right;
    ml = len(left, fs) || 0;
    mr = len(right, fs) || 0;
  }
  if (st.marginLeft) ml = len(st.marginLeft, fs) || 0;
  if (st.marginRight) mr = len(st.marginRight, fs) || 0;
  return [ml, mr];
}

function fontKey(f: FontSpec): MathFont {
  const bold = f.weight === 'bold';
  const italic = f.style === 'italic';
  switch (f.family) {
    case 'Main':
      return bold
        ? italic
          ? 'Main-BoldItalic'
          : 'Main-Bold'
        : italic
          ? 'Main-Italic'
          : 'Main-Regular';
    case 'Math':
      return bold ? 'Math-BoldItalic' : 'Math-Italic';
    case 'SansSerif':
      return bold ? 'SansSerif-Bold' : italic ? 'SansSerif-Italic' : 'SansSerif-Regular';
    case 'Caligraphic':
      return bold ? 'Caligraphic-Bold' : 'Caligraphic-Regular';
    case 'Fraktur':
      return bold ? 'Fraktur-Bold' : 'Fraktur-Regular';
    case 'AMS':
      return 'AMS-Regular';
    case 'Script':
      return 'Script-Regular';
    case 'Typewriter':
      return 'Typewriter-Regular';
    case 'Size1':
      return 'Size1-Regular';
    case 'Size2':
      return 'Size2-Regular';
    case 'Size3':
      return 'Size3-Regular';
    case 'Size4':
      return 'Size4-Regular';
    default:
      throw new MathLayoutRefusal(`Math has no font ${f.family}.`);
  }
}

/** The advance the font itself gives, which is what the browser places glyphs by. */
function charWidth(char: string, font: MathFont): number | undefined {
  return ADVANCES[font].advances[char.codePointAt(0) ?? 0];
}

/** A zero-width or white space: it advances the pen and draws nothing. */
const isBlank = (char: string) => char === String.fromCharCode(0x200b) || /\s/.test(char);

// --- The interpreter -------------------------------------------------------------------------------

interface Computed {
  fs: number;
  font: FontSpec;
  align: Align;
  multDelim: string | null;
  hidden: boolean;
}

function computed(classes: readonly string[], style: KatexStyle, pc: Ctx): Computed {
  let fs = pc.fs;
  if (classes.includes('katex-sizing') || classes.includes('fontsize-ensurer')) {
    const reset = classes.find((c) => c.startsWith('reset-size'));
    const size = classes.find((c) => /^size\d+$/.test(c));
    if (reset && size) {
      const to = SIZES[Number(size.slice(4)) - 1];
      const from = SIZES[Number(reset.slice(10)) - 1];
      if (to !== undefined && from !== undefined) fs = (pc.fs * to) / from;
    }
  }
  if (style.fontSize) fs = len(style.fontSize, pc.fs) ?? fs;
  const font = { ...pc.font };
  for (const [c, f] of FONT_RULES) if (classes.includes(c)) Object.assign(font, f);
  if (classes.includes('delimsizing')) {
    const size = classes.find((c) => /^size[1-4]$/.test(c));
    if (size) font.family = `Size${size.slice(4)}`;
  }
  if (pc.multDelim) font.family = pc.multDelim;
  if (classes.includes('op-symbol')) {
    if (classes.includes('small-op')) font.family = 'Size1';
    if (classes.includes('large-op')) font.family = 'Size2';
  }
  let align = pc.align;
  if (classes.includes('msupsub') || classes.includes('svg-align')) align = 'left';
  if (classes.includes('x-arrow') || classes.includes('mover') || classes.includes('munder')) {
    align = 'center';
  }
  if (style.textAlign === 'left' || style.textAlign === 'center' || style.textAlign === 'right') {
    align = style.textAlign;
  }
  // Rules keyed on the parent: .mfrac > span > span, .op-limits > .vlist-t, .katex-accent > .vlist-t, .col-align-X > .vlist-t
  if (pc.alignForChild) align = pc.alignForChild;
  let multDelim: string | null = null;
  if (pc.multParent && classes.includes('delim-size1')) multDelim = 'Size1';
  if (pc.multParent && classes.includes('delim-size4')) multDelim = 'Size4';
  return { fs, font, align, multDelim, hidden: pc.hidden || style.color === 'transparent' };
}

function shift(src: readonly Item[], dx: number, dy: number, out: Item[]): void {
  for (const it of src) out.push({ ...it, x: it.x + dx, y: it.y + dy });
}

function layoutChildrenInline(children: readonly KatexNode[], ctx: Ctx): Frag {
  let x = 0;
  const items: Item[] = [];
  let hasPct = false;
  let lineBoxes = false;
  for (const child of children) {
    const kind = kindOf(child);
    if (kind.kind === 'fragment') {
      const f = layoutChildrenInline(kind.node.children, ctx);
      shift(f.items, x, 0, items);
      x += f.w;
      hasPct ||= !!f.hasPct;
      lineBoxes ||= !!f.lineBoxes;
      continue;
    }
    const f = layoutNode(child, ctx);
    if (f.abs) {
      items.push(...f.items);
      continue;
    }
    shift(f.items, x + f.ml, 0, items);
    x += f.ml + f.w + f.mr;
    hasPct ||= !!f.hasPct;
    lineBoxes ||= !!f.lineBoxes;
  }
  return { w: x, ml: 0, mr: 0, items, hasPct, lineBoxes };
}

function layoutSymbol(n: KatexSymbol, ctx: Ctx): Frag {
  const c = computed(n.classes, n.style, ctx);
  const font = fontKey(c.font);
  const items: Item[] = [];
  const chars = [...n.text];
  let x = 0;
  for (const char of chars) {
    let w = charWidth(char, font);
    if (w === undefined) {
      if (!isBlank(char)) {
        throw new MathLayoutRefusal(
          `Math cannot draw “${char}”: KaTeX’s fonts do not hold it. Write it inside \\text{} as plain text, outside the formula.`,
        );
      }
      w = chars.length === 1 ? n.width : 0;
    }
    w *= c.fs;
    if (!isBlank(char)) items.push({ t: 'g', char, font, x, y: 0, size: c.fs, hidden: c.hidden });
    x += w;
  }
  const st = n.style;
  const [ml, marginRight] = hMargins(st, c.fs);
  const mr = n.italic > 0 && !st.marginRight ? n.italic * c.fs : marginRight;
  let dy = 0;
  if (st.verticalAlign) dy -= len(st.verticalAlign, c.fs) || 0;
  if (st.top) dy += len(st.top, c.fs) || 0;
  if (dy) for (const it of items) it.y += dy;
  items.push({
    t: 'fontbox',
    font,
    size: c.fs,
    x: 0,
    y: st.verticalAlign ? -(len(st.verticalAlign, c.fs) || 0) : 0,
  });
  return { w: x, ml, mr, items, lineBoxes: true };
}

function layoutNode(node: KatexNode, ctx: Ctx): Frag {
  const kind = kindOf(node);
  switch (kind.kind) {
    case 'symbol':
      return layoutSymbol(kind.node, ctx);
    case 'svg':
      return layoutSvg(kind.node, ctx);
    case 'span':
      return layoutSpan(kind.node, ctx);
    case 'fragment':
      return layoutChildrenInline(kind.node.children, ctx);
    case 'link':
      throw new MathLayoutRefusal(
        'Math does not take links: a link is written with its own syntax.',
      );
    case 'other':
      throw new MathLayoutRefusal('Math cannot draw an image in a formula.');
  }
}

function layoutSpan(n: KatexSpan, ctx: Ctx): Frag {
  const cl = n.classes;
  if (cl.includes('vlist-t')) return layoutVlistT(n, ctx);
  const st = n.style;
  const c = computed(cl, st, ctx);
  const fs = c.fs;
  const absKey = cl.find((k) => ABS[k]);
  const absSpec = absKey ? ABS[absKey] : undefined;
  if (absSpec) {
    const own: Pos = { w: null };
    const f = layoutChildrenInline(n.children, {
      ...ctx,
      fs,
      font: c.font,
      pos: own,
      inVlistBlock: false,
      hidden: c.hidden,
    });
    return {
      abs: true,
      w: 0,
      ml: 0,
      mr: 0,
      items: f.items.map((it) => ({ ...it, absSpec, absPos: own })),
    };
  }
  if (cl.includes('rlap') || cl.includes('llap') || cl.includes('clap')) {
    // Width 0; .katex-inner is absolute: rlap from the left edge, llap ending at it, clap centered on it.
    const inner = n.children.find(
      (k) => kindOf(k).kind === 'span' && (k as KatexSpan).classes.includes('katex-inner'),
    );
    const cc: Ctx = { ...ctx, fs, font: c.font, inVlistBlock: false, hidden: c.hidden };
    const f = inner ? layoutNode(inner, cc) : { w: 0, ml: 0, mr: 0, items: [] };
    const iw = f.ml + f.w + f.mr;
    const off = cl.includes('rlap') ? 0 : cl.includes('llap') ? -iw : -iw / 2;
    const [ml, mr] = hMargins(st, fs);
    return {
      w: 0,
      ml,
      mr,
      items: f.items.map((it) => ({ ...it, x: it.x + off + f.ml })),
      lineBoxes: true,
      inlineBlockLike: true,
    };
  }
  const inlineBlock = ctx.inVlistBlock || INLINE_BLOCK.some((k) => cl.includes(k));
  const block =
    !ctx.inVlistBlock && (cl.includes('katex-overlay') || cl.includes('katex-stretchy'));
  const lineRule = LINE_RULES.some((k) => cl.includes(k));
  const pctW = lineRule || cl.includes('hide-tail') || cl.includes('katex-stretchy');
  const positioned = cl.some((k) => POSITIONED.has(k)) || st.position === 'relative';
  const pos = positioned ? { w: null } : ctx.pos;
  const child: Ctx = {
    fs,
    font: c.font,
    align: c.align,
    cw: null,
    pos,
    inVlistBlock: false,
    multParent: ctx.multParent || (cl.includes('delimsizing') && cl.includes('mult')),
    multDelim: c.multDelim,
    alignForChild: null,
    mfracGrand: false,
    hidden: c.hidden,
  };
  // Padding and borders (horizontal).
  let pl = len(st.paddingLeft, fs) || 0;
  let pr = len(st.paddingRight, fs) || 0;
  if (cl.includes('x-arrow-pad')) {
    pl += 0.5 * fs;
    pr += 0.5 * fs;
  }
  if (cl.includes('boxpad')) {
    pl += 0.3 * fs;
    pr += 0.3 * fs;
  }
  if (cl.includes('cancel-pad')) {
    pl += 0.2 * fs;
    pr += 0.2 * fs;
  }
  let bl = len(st.borderLeftWidth, fs) || 0;
  let br = len(st.borderRightWidth, fs) || 0;
  let bt = len(st.borderTopWidth, fs) || 0;
  let bb = len(st.borderBottomWidth, fs) || 0;
  if (cl.includes('fbox') || cl.includes('fcolorbox')) {
    bl = br = bt = bb = len(st.borderWidth, fs) ?? 0.04 * fs;
  }
  if (cl.includes('katex-sout')) bb = 0.08 * fs;
  [bl, br, bt, bb] = [border(bl), border(br), border(bt), border(bb)];
  // Children: which selector-based alignment they inherit.
  const alignClass = cl.find((k) => TEXT_ALIGN[k]);
  const childCtxFor = (k: KatexNode): Ctx => {
    const cc = { ...child };
    const kk = kindOf(k);
    if (kk.kind === 'span') {
      const kc = kk.node.classes;
      if (kc.includes('vlist-t') && (cl.includes('op-limits') || cl.includes('katex-accent'))) {
        cc.alignForChild = 'center';
      } else if (kc.includes('vlist-t') && alignClass) {
        cc.alignForChild = TEXT_ALIGN[alignClass] ?? null;
      } else cc.alignForChild = null;
      cc.mfracGrand = cl.includes('mfrac') && kc.includes('vlist-t');
    }
    return cc;
  };
  let ownW = inlineBlock || block ? len(st.width, fs, ctx.cw) : null;
  if (pctW) ownW = ctx.cw;
  if (cl.includes('accent-body') && !cl.includes('accent-full')) ownW = 0;
  const minW = len(st.minWidth, fs, ctx.cw);
  // Lay out the content.
  let x = 0;
  const items: Item[] = [];
  let hasPct = pctW && ctx.cw == null;
  let lineBoxes = false;
  const blocks: KatexNode[] = [];
  const pre = ownW != null ? ownW - pl - pr - bl - br : null;
  for (const k of n.children) {
    const cc = childCtxFor(k);
    cc.cw = pre;
    const kk = kindOf(k);
    if (kk.kind === 'fragment') {
      const f = layoutChildrenInline(kk.node.children, cc);
      shift(f.items, x, 0, items);
      x += f.w;
      hasPct ||= !!f.hasPct;
      lineBoxes ||= !!f.lineBoxes;
      continue;
    }
    if (
      kk.kind === 'span' &&
      (kk.node.classes.includes('katex-overlay') || kk.node.classes.includes('katex-stretchy'))
    ) {
      blocks.push(k);
      continue;
    }
    const f = layoutNode(k, cc);
    hasPct ||= !!f.hasPct;
    if (f.abs) {
      items.push(...f.items);
      continue;
    }
    shift(f.items, x + f.ml, 0, items);
    x += f.ml + f.w + f.mr;
    if (kk.kind === 'symbol' || f.lineBoxes || f.inlineBlockLike || f.ml || f.mr) lineBoxes = true;
  }
  let contentW = x;
  // Block children (katex-overlay, katex-stretchy): stacked; width = own width or the containing width.
  let blockH = 0;
  const blockItems: Item[] = [];
  for (const k of blocks) {
    const cc = childCtxFor(k);
    cc.cw = pre ?? null;
    const f = layoutNode(k, cc);
    const h = f.h ?? 0;
    shift(f.items, f.ml, blockH, blockItems);
    contentW = Math.max(contentW, f.ml + f.w + f.mr);
    blockH += h;
  }
  let innerW =
    ownW != null && (inlineBlock || block) ? Math.max(ownW - pl - pr - bl - br, 0) : contentW;
  if (minW != null) innerW = Math.max(innerW, minW - pl - pr - bl - br);
  if (cl.includes('nulldelimiter')) innerW = 0.12 * fs;
  if (cl.includes('katex-thinbox')) innerW = 0;
  // katex.css gives a column separator `min-width: 1px`: a whole pixel when snapping, else 1/16 em, a
  // pixel at the 16 px an em the layout reads every px length at.
  if (cl.includes('vertical-separator')) {
    innerW = Math.max(innerW, pixelsPerEm ? 1 / pixelsPerEm : 1 / 16);
  }
  const w = pl + bl + innerW + pr + br;
  if (positioned) pos.w = w - bl - br;
  // Height for boxes without line boxes (their baseline is their bottom margin edge).
  const ownH = len(st.height, fs);
  const noLines =
    (inlineBlock || block) &&
    (!lineBoxes ||
      cl.includes('hide-tail') ||
      st.overflow === 'hidden' ||
      cl.includes('katex-stretchy'));
  let h: number | null = null;
  if (inlineBlock || block) {
    h =
      (ownH ?? blockH) + bt + bb + (len(st.paddingTop, fs) || 0) + (len(st.paddingBottom, fs) || 0);
  }
  // Place content.
  const out: Item[] = [];
  for (const it of items) out.push({ ...it, x: it.x + pl + bl });
  if (noLines || block) {
    // Content top is at -h (bottom edge on the baseline) for inline blocks; blocks report from their top.
    const top = block ? 0 : -(h ?? 0);
    for (const it of blockItems) out.push({ ...it, x: it.x + pl + bl, y: it.y + top + bt });
    for (const it of out) {
      if (it.t === 'svg' && it.fromParent) {
        it.x = pl + bl;
        it.y = top + bt;
        it.h ??= ownH ?? h;
        it.fromParent = false;
      }
    }
  }
  // Absolutely positioned children: left/right/width as fractions of this (positioned) box.
  for (const it of out) {
    if (it.absSpec && it.absPos) {
      const inner = w - bl - br;
      const spec = it.absSpec;
      it.absPos.w = spec.w * inner;
      it.x +=
        spec.left != null ? spec.left * inner : inner - (spec.right ?? 0) * inner - spec.w * inner;
      delete it.absSpec;
      delete it.absPos;
    }
  }
  // Rules drawn by this element (borders).
  const kindName = cl.join('.');
  const hidden = c.hidden;
  if (bb && (lineRule || cl.includes('katex-sout'))) {
    const dashed = cl.includes('katex-hdashline');
    out.push({ t: 'r', kind: kindName, x: 0, y: -bb, w, h: bb, dashed, hidden });
  } else if (cl.includes('vertical-separator')) {
    // Only its right border shows; its box is wider by its minimum width.
    const dashed = st.borderRightStyle === 'dashed';
    const frame = { top: 0, right: br, bottom: 0, left: 0 };
    out.push({ t: 'r', kind: kindName, x: 0, y: -(h ?? 0), w, h: h ?? 0, frame, dashed, hidden });
  } else if (cl.includes('katex-rule')) {
    out.push({ t: 'r', kind: kindName, x: 0, y: -(h ?? 0), w, h: h ?? 0, dashed: false, hidden });
  } else if (cl.includes('fbox')) {
    out.push({
      t: 'r',
      kind: kindName,
      x: 0,
      y: -(h ?? 0),
      w,
      h: h ?? 0,
      frame: { top: bt, right: br, bottom: bb, left: bl },
      dashed: false,
      hidden,
    });
  }
  // Vertical shifts: vertical-align (raise) and relative top, bottom and left.
  let dy = 0;
  let dx = 0;
  if (st.verticalAlign) dy -= len(st.verticalAlign, fs) || 0;
  if (st.top) dy += len(st.top, fs) || 0;
  if (st.bottom && positioned) dy -= len(st.bottom, fs) || 0;
  if (st.left) dx += len(st.left, fs) || 0;
  for (const it of out) {
    it.x += dx;
    it.y += dy;
  }
  let [ml, mr] = hMargins(st, fs);
  if (cl.includes('katex-strut')) {
    const va = len(st.verticalAlign, fs) || 0;
    out.push({ t: 'strut', x: 0, y: 0, asc: (ownH || 0) + va, desc: -va });
  }
  if (cl.includes('katex-root')) {
    ml = 0.2777777778 * fs;
    mr = -0.5555555556 * fs;
  }
  if (cl.includes('cancel-lap')) {
    ml -= 0.2 * fs;
    mr -= 0.2 * fs;
  }
  return {
    w,
    ml,
    mr,
    items: out,
    hasPct,
    lineBoxes: lineBoxes || inlineBlock,
    inlineBlockLike: inlineBlock,
    h,
  };
}

function layoutSvg(n: KatexSvg, ctx: Ctx): Frag {
  // .katex svg: position absolute, width 100% of the positioned ancestor, height inherit.
  const styleW = /width:\s*([\d.]+em)/.exec(n.attributes.style ?? '');
  const w = styleW ? len(styleW[1], ctx.fs) : null;
  return {
    abs: true,
    w: 0,
    ml: 0,
    mr: 0,
    items: [
      {
        t: 'svg',
        node: n,
        x: 0,
        y: 0,
        w,
        wFrom: ctx.pos,
        h: len(n.attributes.height, ctx.fs),
        fromParent: true,
        fs: ctx.fs,
        hidden: ctx.hidden,
      },
    ],
  };
}

function layoutVlistT(n: KatexSpan, ctx: Ctx): Frag {
  const c = computed(n.classes, n.style, ctx);
  const fs = c.fs;
  const row1 = asSpan(n.children[0]);
  const vlist = asSpan(row1.children[0]);
  const vc = computed(vlist.classes, vlist.style, {
    ...ctx,
    fs,
    font: c.font,
    align: c.align,
    alignForChild: null,
    hidden: c.hidden,
  });
  interface Block {
    f: Frag;
    ml: number;
    mr: number;
    top: number;
    P: number;
    lctx: Ctx;
    content: KatexNode[];
    align: Align;
    bpos: Pos;
  }
  const blocks: Block[] = [];
  for (const child of vlist.children) {
    const b = asSpan(child);
    const bc = computed(b.classes, b.style, {
      ...ctx,
      fs: vc.fs,
      font: vc.font,
      align: vc.align,
      alignForChild: ctx.mfracGrand ? 'center' : null,
      hidden: vc.hidden,
    });
    const bfs = bc.fs;
    const st = b.style;
    const bpos: Pos = { w: null };
    const [ml, mr] = hMargins(st, bfs);
    let P = 0;
    const content: KatexNode[] = [];
    for (const k of b.children) {
      const kk = kindOf(k);
      if (kk.kind === 'span' && kk.node.classes.includes('pstrut')) {
        P = len(kk.node.style.height, bfs) ?? 0;
        continue;
      }
      content.push(k);
    }
    const top = len(st.top, bfs) || 0;
    const lctx: Ctx = {
      fs: bfs,
      font: bc.font,
      align: bc.align,
      cw: null,
      pos: bpos,
      inVlistBlock: true,
      multParent: ctx.multParent,
      multDelim: ctx.multDelim,
      alignForChild: null,
      mfracGrand: false,
      hidden: bc.hidden,
    };
    const f = layoutChildrenInline(content, lctx);
    blocks.push({ f, ml, mr, top, P, lctx, content, align: bc.align, bpos });
  }
  let cellW = 0;
  for (const B of blocks) cellW = Math.max(cellW, B.ml + B.f.w + B.mr);
  const items: Item[] = [];
  for (const B of blocks) {
    const avail = cellW - B.ml - B.mr;
    let f = B.f;
    if (f.hasPct) f = layoutChildrenInline(B.content, { ...B.lctx, cw: avail });
    B.bpos.w = avail;
    let off = 0;
    if (f.w <= avail + 1e-9) {
      if (B.align === 'center') off = (avail - f.w) / 2;
      else if (B.align === 'right') off = avail - f.w;
    }
    const base = B.top + B.P;
    for (const it of f.items) {
      const o: Item = { ...it, x: it.x + B.ml + off, y: it.y + base, inVlist: true };
      if (o.t === 'svg' && o.wFrom === B.bpos) o.w ??= avail;
      items.push(o);
    }
  }
  resolveSvg(items);
  return { w: cellW, ml: 0, mr: 0, items, hasPct: false, lineBoxes: true, inlineBlockLike: true };
}

function asSpan(node: KatexNode | undefined): KatexSpan {
  const kind = node && kindOf(node);
  if (kind?.kind !== 'span') throw new MathLayoutRefusal('Math cannot lay out this formula.');
  return kind.node;
}

function resolveSvg(items: Item[]): void {
  for (const it of items) {
    if (it.t === 'svg' && it.w == null && it.wFrom && it.wFrom.w != null) it.w = it.wFrom.w;
  }
}

/**
 * The height of a CSS line box: the root inline box and every font's inline box (line-height 1.2),
 * and the struts. With pixel snapping, ascent and descent are rounded to whole pixels as Blink does.
 */
function lineMetrics(items: readonly Item[]): { asc: number; desc: number } {
  const box = (font: MathFont, size: number): [number, number] => {
    const { ascent, descent } = ADVANCES[font];
    if (!pixelsPerEm) {
      const leading = 1.2 * size - (ascent + descent) * size;
      return [ascent * size + leading / 2, descent * size + leading / 2];
    }
    const px = pixelsPerEm;
    const s = size * px;
    // Blink: the ascent gets floor(leading / 2), the descent the rest (line-height in 1/64 px units).
    const a = Math.round(ascent * s);
    const d = Math.round(descent * s);
    const leading = Math.floor(1.2 * s * 64) / 64 - a - d;
    const half = Math.floor(leading / 2);
    return [(a + half) / px, (d + leading - half) / px];
  };
  let [asc, desc] = box('Main-Regular', 1);
  for (const it of items) {
    if (it.inVlist) continue;
    if (it.t === 'strut') {
      asc = Math.max(asc, it.asc);
      desc = Math.max(desc, it.desc);
    }
    if (it.t === 'fontbox') {
      const [a, d] = box(it.font, it.size);
      asc = Math.max(asc, a - it.y);
      desc = Math.max(desc, d + it.y);
    }
  }
  return { asc, desc };
}

/** The color KaTeX draws a command it does not trust in, its `errorColor` by default. */
const KATEX_ERROR_COLOR = '#cc0000';

/** Refuses a tree that holds what the layout does not emulate, before laying it out. */
function check(node: KatexNode, options: LayoutOptions): void {
  const kind = kindOf(node);
  if (kind.kind === 'span' || kind.kind === 'symbol') {
    for (const c of kind.node.classes) {
      if (options.skipTags && c === 'katex-tag') return;
      const what = NOT_LAID_OUT[c];
      if (what) throw new MathLayoutRefusal(what);
    }
    const style = kind.node.style;
    for (const [key, what] of Object.entries(NOT_LAID_OUT_STYLES)) {
      if (style[key]) throw new MathLayoutRefusal(what);
    }
    if (style.color && style.color !== 'transparent') {
      // KaTeX draws a command it does not trust in its error color; any other color comes from a
      // macro such as `\red` or `\blue`, which expands to `\textcolor`.
      throw new MathLayoutRefusal(
        style.color.toLowerCase() === KATEX_ERROR_COLOR
          ? 'Math cannot draw a command that KaTeX does not trust.'
          : 'Math does not take colors: colors come from the theme.',
      );
    }
  }
  if (kind.kind === 'link') {
    throw new MathLayoutRefusal('Math does not take links: a link is written with its own syntax.');
  }
  if (kind.kind === 'other') throw new MathLayoutRefusal('Math cannot draw an image in a formula.');
  if (kind.kind === 'span' || kind.kind === 'fragment') {
    for (const child of kind.node.children) check(child, options);
  }
}

function findHtmlRoot(node: KatexNode): KatexSpan | undefined {
  const kind = kindOf(node);
  if (kind.kind === 'span' && kind.node.classes.includes('katex-html')) return kind.node;
  if (kind.kind === 'span' || kind.kind === 'fragment') {
    for (const child of kind.node.children) {
      const found = findHtmlRoot(child);
      if (found) return found;
    }
  }
  return undefined;
}

const hasClass = (node: KatexNode, name: string): boolean => {
  const kind = kindOf(node);
  return kind.kind === 'span' && kind.node.classes.includes(name);
};

/** Lays out the tree `__renderToHTMLTree` gave. Throws `MathLayoutRefusal` for what it does not know. */
export function layoutTree(
  tree: KatexSpan,
  display: boolean,
  options: LayoutOptions = {},
): MathLayout {
  pixelsPerEm = options.pixelsPerEm ?? 0;
  try {
    return layoutRoot(tree, display, options);
  } finally {
    pixelsPerEm = 0;
  }
}

function layoutRoot(tree: KatexSpan, display: boolean, options: LayoutOptions): MathLayout {
  const root = findHtmlRoot(tree);
  if (!root) throw new MathLayoutRefusal('Math cannot lay out this formula.');
  check(root, options);
  const ctx: Ctx = {
    fs: 1,
    font: { family: 'Main', weight: 'normal', style: 'normal' },
    align: 'left',
    cw: null,
    pos: { w: null },
    inVlistBlock: false,
    multParent: false,
    multDelim: null,
    alignForChild: null,
    mfracGrand: false,
    hidden: false,
  };
  const kids = root.children.filter((k) => !hasClass(k, 'katex-tag'));
  // Top-level \\ breaks: .katex-newline is display: block, so each run of bases is its own line box.
  const runs: KatexNode[][] = [[]];
  const gaps: number[] = [];
  for (const k of kids) {
    const kind = kindOf(k);
    if (kind.kind === 'span' && kind.node.classes.includes('katex-newline')) {
      runs.push([]);
      // An empty block's margins collapse through it: `\\[1em]` opens a gap of its margin.
      gaps.push(len(kind.node.style.marginTop, 1) ?? 0);
    } else runs[runs.length - 1]?.push(k);
  }
  const lines = runs.map((run) => {
    const f = layoutChildrenInline(run, ctx);
    resolveSvg(f.items);
    return { f, ...lineMetrics(f.items), ...strutExtent(f.items) };
  });
  const first = lines[0];
  if (!first) throw new MathLayoutRefusal('Math cannot lay out this formula.');
  const all: Item[] = [];
  let y = 0;
  let height = 0;
  let depth = 0;
  lines.forEach((line, i) => {
    const previous = lines[i - 1];
    if (previous) y += previous.desc + (gaps[i - 1] ?? 0) + line.asc;
    const dx = display ? (first.f.w - line.f.w) / 2 : 0;
    shift(line.f.items, dx, y, all);
    height = Math.max(height, line.top - y);
    depth = Math.max(depth, y + line.bottom);
  });
  const glyphs: LaidOutGlyph[] = [];
  const rules: LaidOutRule[] = [];
  const paths: LaidOutPath[] = [];
  for (const it of all) {
    if (it.t === 'g') {
      glyphs.push({
        char: it.char,
        font: it.font,
        x: it.x,
        baseline: it.y,
        size: it.size,
        hidden: it.hidden,
      });
    } else if (it.t === 'r') {
      const rule: LaidOutRule = {
        kind: it.kind,
        x: it.x,
        y: it.y,
        width: it.w,
        height: it.h,
        dashed: it.dashed,
        hidden: it.hidden,
      };
      if (it.frame) rule.frame = it.frame;
      rules.push(rule);
    } else if (it.t === 'svg') {
      paths.push(svgPath(it));
    }
  }
  return { width: first.f.w, height, depth, glyphs, rules, paths };
}

/** How far the struts of a line reach above and below its baseline: KaTeX's own box. */
function strutExtent(items: readonly Item[]): { top: number; bottom: number } {
  let top = 0;
  let bottom = 0;
  for (const it of items) {
    if (it.t !== 'strut' || it.inVlist) continue;
    top = Math.max(top, it.asc - it.y);
    bottom = Math.max(bottom, it.desc + it.y);
  }
  return { top, bottom };
}

/** An SVG piece as a path: KaTeX's own `d`, or a cancel stroke turned into the band it draws. */
function svgPath(it: SvgItem): LaidOutPath {
  const width = it.w ?? 0;
  const height = it.h ?? 0;
  const attributes = it.node.attributes;
  const pieces: string[] = [];
  let viewBox = parseViewBox(attributes.viewBox);
  let preserveAspectRatio = attributes.preserveAspectRatio ?? 'xMidYMid meet';
  for (const child of it.node.children) {
    if (isPathNode(child)) {
      const d = child.alternate ?? /\sd="([^"]*)"/.exec(child.toMarkup())?.[1];
      if (d === undefined) throw new MathLayoutRefusal('Math cannot lay out this formula.');
      pieces.push(unescapeMarkup(d));
    } else if (isLineNode(child)) {
      // A stroke across the whole box: drawn as the band it covers, in the box's own ems.
      viewBox = { x: 0, y: 0, width, height };
      preserveAspectRatio = 'none';
      pieces.push(lineBand(child.attributes, width, height, it.fs));
    } else throw new MathLayoutRefusal('Math cannot lay out this formula.');
  }
  if (!viewBox) viewBox = { x: 0, y: 0, width, height };
  return {
    d: pieces.join(' '),
    x: it.x,
    y: it.y,
    width,
    height,
    viewBox,
    preserveAspectRatio,
    hidden: it.hidden,
  };
}

function parseViewBox(value: string | undefined): MathPath['viewBox'] | undefined {
  if (value === undefined) return undefined;
  const [x, y, width, height] = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if ([x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))) return undefined;
  return { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 };
}

function unescapeMarkup(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function lineBand(
  attributes: Record<string, string>,
  width: number,
  height: number,
  fs: number,
): string {
  const coordinate = (value: string | undefined, whole: number) =>
    value?.endsWith('%') ? (parseFloat(value) / 100) * whole : parseFloat(value ?? '0') / 16;
  const x1 = coordinate(attributes.x1, width);
  const y1 = coordinate(attributes.y1, height);
  const x2 = coordinate(attributes.x2, width);
  const y2 = coordinate(attributes.y2, height);
  const stroke = len(attributes['stroke-width'], fs) ?? 0.046 * fs;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * (stroke / 2);
  const ny = ((x2 - x1) / length) * (stroke / 2);
  const p = (x: number, y: number) => `${round(x)} ${round(y)}`;
  return `M${p(x1 + nx, y1 + ny)}L${p(x2 + nx, y2 + ny)}L${p(x2 - nx, y2 - ny)}L${p(x1 - nx, y1 - ny)}Z`;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Turns a layout into the rules a math drawing holds: a frame becomes its four bands. */
export function drawnRules(rule: LaidOutRule): MathRule[] {
  const band = (x: number, y: number, width: number, height: number): MathRule =>
    rule.dashed ? { x, y, width, height, dashed: true } : { x, y, width, height };
  const frame = rule.frame;
  if (!frame) return [band(rule.x, rule.y, rule.width, rule.height)];
  const { x, y, width, height } = rule;
  if (!frame.top && !frame.bottom && !frame.left) {
    return [band(x + width - frame.right, y, frame.right, height)];
  }
  return [
    band(x, y, width, frame.top),
    band(x, y + height - frame.bottom, width, frame.bottom),
    band(x, y + frame.top, frame.left, height - frame.top - frame.bottom),
    band(x + width - frame.right, y + frame.top, frame.right, height - frame.top - frame.bottom),
  ].filter((r) => r.width > 0 && r.height > 0);
}
