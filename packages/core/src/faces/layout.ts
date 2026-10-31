/**
 * Laying a face out (ADR 0083): a compiled face filled from an element, laid out at a width by a small
 * engine of block, flex and a simple grid, and measured in Roboto's widths, into a face drawing: boxes,
 * text runs with their bands, images by id, and the regions where rows, contents and package code's
 * drawing go. It is pure, so that the app, the command line, Claude's tools and the page get the same
 * drawing to the unit.
 *
 * Choices of the engine, where it differs from a browser's (ADR 0083's clarifications):
 * - a block lays its children out as a column; margins never collapse;
 * - nothing is wider than its container: widths past it are cut to it, a flex item shrinks down to
 *   its `min-width` (0 unless set), and a word longer than its line breaks between characters;
 * - text past a face of size `shape`, or past a box with `overflow: hidden`, is cut, its last line
 *   kept ending in "…".
 */
import type { JsonValue } from '@visual-anything/schema';
import { meetsCondition } from '../conditions';
import { emphasisRuns, type EmphasisRun } from '../text/emphasis';
import { robotoWidth, type RobotoVariant } from '../text/roboto';
import {
  compileFace,
  INLINE_TAGS,
  type CompiledFace,
  type CompiledMarkup,
  type FaceNode,
} from './compile';
import { capped, hasValue, plainRun, valueText, type FaceInput, type FaceValue } from './input';
import { FACE_CAPS } from './limits';
import type { FaceProblem } from './problems';
import type { Condition, Reference, SlotText } from './slots';
import {
  cascade,
  computeStyle,
  INITIAL_STYLE,
  TAG_DEFAULTS,
  type Border,
  type FaceColor,
  type FaceStyle,
  type Length,
  type Matched,
} from './style';

// ——— The face drawing ————————————————————————————————————————————————————————————————————————————

export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box that draws: a background, borders, or both. */
export interface FaceBox extends FaceRect {
  background?: FaceColor;
  borders?: { top?: Border; right?: Border; bottom?: Border; left?: Border };
  radius: number;
}

/** A run of text in one font, size and color, placed by its own `x`. */
export interface FaceRun {
  text: string;
  x: number;
  /** Where its letters stand. */
  y: number;
  /** How wide it is in Roboto. */
  width: number;
  size: number;
  variant: RobotoVariant;
  color: FaceColor;
  /** The line it is on, counted through the whole face, for reading the face in order. */
  line: number;
  /** The paragraph it belongs to, counted through the whole face. */
  paragraph: number;
  /** For a link of text emphasis: drawn as its label, underlined, and never fetched. */
  link?: string;
}

/** What is drawn behind a run (`back`), under it or through it. */
export interface FaceBand extends FaceRect {
  kind: 'back' | 'underline' | 'strike';
  color: FaceColor;
}

export type FaceImage = (FaceRect & { kind: 'icon' }) | (FaceRect & { kind: 'image'; ref: string });

/** Where something drawn apart from the face goes. */
export interface FaceRegion extends FaceRect {
  kind: 'rows' | 'contents' | 'drawing';
}

export interface FaceDrawing {
  width: number;
  height: number;
  /** Whether something was left out: past the face's height, a line clamp or a box's overflow. */
  cut: boolean;
  /** In the order they are drawn: the face's flow, then what it places absolutely. */
  boxes: FaceBox[];
  runs: FaceRun[];
  bands: FaceBand[];
  images: FaceImage[];
  regions: FaceRegion[];
  /** Set when the face could not be drawn, and this drawing is the shape's name instead. */
  fallback?: FaceProblem;
}

export interface FaceLayoutOptions {
  /** The shape's width, or its free geometry's `label` rectangle's. */
  width: number;
  /** The shape's height, for a face of size `shape`; left out, the face takes its content's height. */
  height?: number;
  /** A variant to draw in place of the markup. */
  variant?: string;
  /** For a collapsed container: its `collapsed` variant, or the markup without `<contents/>`. */
  collapsed?: boolean;
}

/**
 * The texts of a face drawing in reading order, a paragraph a line, its wrapped lines joined by
 * spaces: what the outline and announcements say of the shape.
 */
export function faceDrawingText(drawing: FaceDrawing): string {
  const paragraphs: string[][] = [];
  let paragraph = -1;
  let line = -1;
  for (const run of drawing.runs) {
    if (run.paragraph !== paragraph) {
      paragraphs.push([]);
      paragraph = run.paragraph;
      line = -1;
    }
    const lines = paragraphs.at(-1)!;
    if (run.line !== line) {
      lines.push('');
      line = run.line;
    }
    lines[lines.length - 1] += run.text;
  }
  return paragraphs
    .map((lines) =>
      lines
        .map((each) => each.trim())
        .filter((each) => each !== '')
        .join(' '),
    )
    .filter((each) => each !== '')
    .join('\n');
}

// ——— Laying out ——————————————————————————————————————————————————————————————————————————————————

const ELLIPSIS = '…';
/** How far below the middle of its line a line's baseline lies, in ems, as the app's text layout. */
const BASELINE_BELOW_MIDDLE = 0.35;
const EPSILON = 1e-6;

/** How a piece of text is drawn. */
interface Ink {
  size: number;
  variant: RobotoVariant;
  color: FaceColor;
  underline: boolean;
  strike: boolean;
  back?: FaceColor;
  /** How far its letters stand from the line's baseline, down. */
  shift: number;
  link?: string;
  /** Its line's height. */
  lineHeight: number;
  key: string;
}

type Inline = { kind: 'text'; text: string; ink: Ink } | { kind: 'break'; ink: Ink };

interface Box {
  kind: 'box';
  tag: string;
  style: FaceStyle;
  children: Child[];
  region?: FaceRegion['kind'];
  image?: { kind: 'icon' } | { kind: 'image'; ref: string };
  /** The paragraph text is still being added to, if any. */
  open?: Paragraph;
}

interface Paragraph {
  kind: 'paragraph';
  /** Its box's style: its alignment, clamp and wrapping. */
  style: FaceStyle;
  items: Inline[];
}

type Child = Box | Paragraph;

/** What slots and conditions read besides the element's attributes. */
interface Scope {
  item?: JsonValue;
  attribute?: FaceValue;
  more?: number;
}

/** The most parts of a markup a face fills, its repetitions counted. */
const MAX_STEPS = 4_096;
/** The most pieces of text a face adds before layout: several make one run when they look alike. */
const MAX_TEXTS = FACE_CAPS.runs * 4;

/** Raised when a face passes a cap while it is laid out. */
class TooLarge extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/**
 * Lays a face out for an element. A face that cannot be laid out, from a problem or past a cap, is
 * drawn as the shape's name, with the problem in `fallback`.
 */
export function layOutFace(
  compiled: CompiledFace,
  input: FaceInput,
  options: FaceLayoutOptions,
): FaceDrawing {
  const width = Math.max(0, Number.isFinite(options.width) ? options.width : 0);
  const height =
    options.height === undefined || !Number.isFinite(options.height)
      ? undefined
      : Math.max(0, options.height);
  const failure = compiled.problems.find((each) => each.severity === 'error');
  let markup = compiled.markup;
  let withoutContents = false;
  if (options.variant !== undefined) markup = compiled.variants.get(options.variant) ?? markup;
  else if (options.collapsed) {
    const collapsed =
      compiled.collapsed === undefined ? undefined : compiled.variants.get(compiled.collapsed);
    if (collapsed !== undefined) markup = collapsed;
    else withoutContents = true;
  }
  if (failure !== undefined || markup === undefined) {
    return fallbackDrawing(input, width, height, failure ?? missingMarkup);
  }
  try {
    return new Layout(compiled, input, width, height, withoutContents).drawing(markup);
  } catch (thrown) {
    if (!(thrown instanceof TooLarge)) throw thrown;
    return fallbackDrawing(input, width, height, {
      code: 'face-too-large',
      severity: 'error',
      part: markup.part,
      line: 0,
      column: 0,
      reason: thrown.reason,
    });
  }
}

/**
 * Whether a face is laid out alike at any height its shape gives it: a face of size `content`
 * whose own height, least height and most height are none or in pixels takes its content's height
 * whatever the height given, and lays out the same boxes and runs in it. So a table's face is laid
 * out once for the height of its header and for the header drawn (ADR 0083's clarification, A4).
 * One that cannot be laid out, as one past its caps, is drawn as its name at the height given: a
 * drawing with a `fallback` is not alike at another height.
 */
export function faceIgnoresHeight(compiled: CompiledFace): boolean {
  if (compiled.size !== 'content') return false;
  if (compiled.problems.some((each) => each.severity === 'error')) return false;
  const root = computeStyle(
    INITIAL_STYLE,
    cascade(compiled.rules, { name: 'face', classes: [] }, []),
  );
  const fixed = (length: Length | undefined) => length === undefined || 'px' in length;
  return fixed(root.height) && fixed(root.minHeight) && fixed(root.maxHeight);
}

const missingMarkup: FaceProblem = {
  code: 'invalid-face',
  severity: 'error',
  part: { kind: 'markup' },
  line: 0,
  column: 0,
  reason: 'The face has no markup.',
};

/** The face a shape is drawn with when its own cannot be: its name. */
const FALLBACK = compileFace({
  size: 'shape',
  markup: ['<p>{{name}}</p>'],
  style: [
    'face { justify-content: center; padding: 4px 8px; }',
    'p { font-size: 14px; font-weight: 600; text-align: center; line-clamp: 2; }',
  ],
  variants: [],
});

function fallbackDrawing(
  input: FaceInput,
  width: number,
  height: number | undefined,
  problem: FaceProblem,
): FaceDrawing {
  const drawing = new Layout(FALLBACK, input, width, height, true).drawing(FALLBACK.markup!);
  return { ...drawing, fallback: problem };
}

class Layout {
  private boxes = 0;
  /** Nodes of the face filled, and pieces of text added: bounds on filling, before any layout. */
  private steps = 0;
  private texts = 0;
  private readonly absolutes: Box[] = [];
  private readonly contentSizes = new WeakMap<Child, number>();

  constructor(
    private readonly compiled: CompiledFace,
    private readonly input: FaceInput,
    private readonly width: number,
    private readonly height: number | undefined,
    private readonly withoutContents: boolean,
  ) {}

  drawing(markup: CompiledMarkup): FaceDrawing {
    const rootMatch: Matched = { name: 'face', classes: [] };
    const rootStyle = computeStyle(INITIAL_STYLE, cascade(this.compiled.rules, rootMatch, []));
    const root: Box = { kind: 'box', tag: 'face', style: rootStyle, children: [] };
    this.fill(markup.nodes, root, {}, [rootMatch], undefined);
    const shapeSized = this.compiled.size === 'shape' && this.height !== undefined;
    const laid = this.layOutBox(
      root,
      this.width,
      shapeSized ? this.height : undefined,
      this.height,
    );
    const faceHeight = shapeSized ? this.height : laid.height;
    laid.height = faceHeight;
    const flow: Laid[] = [laid];
    for (const box of this.absolutes) flow.push(this.layOutAbsolute(box, faceHeight));
    const out = new Output(this.width);
    for (const each of flow)
      out.emit(each, 0, 0, { x: 0, y: 0, width: this.width, height: faceHeight });
    out.finish();
    if (out.runs.length > FACE_CAPS.runs) {
      throw new TooLarge(`A face lays out at most ${FACE_CAPS.runs} runs of text.`);
    }
    return {
      width: this.width,
      height: faceHeight,
      cut: out.cut,
      boxes: out.boxes,
      runs: out.runs,
      bands: out.bands,
      images: out.images,
      regions: out.regions,
    };
  }

  // ——— Filling the face —————————————————————————————————————————————————————————————————————————

  private fill(
    nodes: readonly FaceNode[],
    target: Box,
    scope: Scope,
    ancestors: readonly Matched[],
    inline: { style: FaceStyle; back?: FaceColor; shift: number } | undefined,
  ): void {
    let local = scope;
    for (const node of nodes) {
      this.steps += 1;
      if (this.steps > MAX_STEPS)
        throw new TooLarge(`A face fills at most ${MAX_STEPS} parts of its markup.`);
      switch (node.kind) {
        case 'text': {
          const style = inline?.style ?? target.style;
          this.addRuns(target, this.write(node.text, local), style, inline);
          break;
        }
        case 'choice': {
          const chosen = node.branches.find(
            (branch) => branch.condition === undefined || this.holds(branch.condition, local),
          );
          if (chosen === undefined) break;
          if (chosen.node.kind === 'each')
            local = this.each(chosen.node, target, local, ancestors, inline);
          else this.element(chosen.node, target, local, ancestors, inline);
          break;
        }
        case 'each':
          local = this.each(node, target, local, ancestors, inline);
          break;
        case 'element':
          this.element(node, target, local, ancestors, inline);
          break;
      }
    }
  }

  private each(
    node: Extract<FaceNode, { kind: 'each' }>,
    target: Box,
    scope: Scope,
    ancestors: readonly Matched[],
    inline: { style: FaceStyle; back?: FaceColor; shift: number } | undefined,
  ): Scope {
    const scopes: Scope[] = [];
    let total: number;
    if (node.of.kind === 'attributes') {
      const { only, except } = node.of;
      const present = this.input.attributes.filter((each) => hasValue(each.value));
      const chosen =
        only === undefined
          ? present.filter((each) => !except?.includes(each.name))
          : only.flatMap((name) => present.filter((each) => each.name === name));
      total = chosen.length;
      for (const attribute of chosen.slice(0, FACE_CAPS.eachAttributes))
        scopes.push({ ...scope, attribute });
    } else {
      const value = this.read(node.of.ref, scope);
      const items = Array.isArray(value)
        ? value.filter((each) => typeof each === 'string' || typeof each === 'number')
        : [];
      total = items.length;
      for (const item of items.slice(0, FACE_CAPS.eachItems)) scopes.push({ ...scope, item });
    }
    for (const each of scopes) this.fill(node.children, target, each, ancestors, inline);
    const more = total - scopes.length;
    return { ...scope, ...(more > 0 ? { more } : { more: 0 }) };
  }

  private element(
    node: Extract<FaceNode, { kind: 'element' }>,
    target: Box,
    scope: Scope,
    ancestors: readonly Matched[],
    inline: { style: FaceStyle; back?: FaceColor; shift: number } | undefined,
  ): void {
    if (node.tag === 'contents' && this.withoutContents) return;
    const classes = node.classes
      .map((each) => this.className(each, scope))
      .filter((each) => each !== '');
    const matched: Matched = { name: node.tag, classes };
    const parent = inline?.style ?? target.style;
    const style = computeStyle(parent, [
      ...(TAG_DEFAULTS[node.tag] ?? []),
      ...cascade(this.compiled.rules, matched, ancestors),
      ...node.inline,
    ]);
    if (style.display === 'none') return;
    const inFlexOrGrid =
      inline === undefined && (target.style.display === 'flex' || target.style.display === 'grid');
    const staysInline =
      INLINE_TAGS.has(node.tag) &&
      style.display === 'inline' &&
      style.position !== 'absolute' &&
      (!inFlexOrGrid || node.tag === 'br');
    if (staysInline) {
      if (node.tag === 'br') {
        if (!inFlexOrGrid)
          this.paragraph(target).items.push({
            kind: 'break',
            ink: this.ink(style, inline?.back, inline?.shift ?? 0),
          });
        return;
      }
      const shift =
        (inline?.shift ?? 0) +
        (node.tag === 'sub'
          ? parent.fontSize * 0.25
          : node.tag === 'sup'
            ? -parent.fontSize * 0.35
            : 0);
      const context = { style, back: style.background ?? inline?.back, shift };
      if (node.tag === 'detail') this.addRuns(target, this.input.detail ?? [], style, context);
      else if (node.tag === 'badges') {
        this.addRuns(target, [plainRun((this.input.badges ?? []).join(' '))], style, context);
      } else this.fill(node.children, target, scope, [...ancestors, matched], context);
      return;
    }
    const box: Box = {
      kind: 'box',
      tag: node.tag,
      style: style.display === 'inline' ? { ...style, display: 'block' } : style,
      children: [],
    };
    this.boxes += 1;
    if (this.boxes > FACE_CAPS.boxes)
      throw new TooLarge(`A face lays out at most ${FACE_CAPS.boxes} boxes.`);
    if (node.tag === 'rows' || node.tag === 'contents' || node.tag === 'drawing')
      box.region = node.tag;
    if (node.tag === 'icon') box.image = { kind: 'icon' };
    if (node.tag === 'image' && node.ref !== undefined)
      box.image = { kind: 'image', ref: node.ref };
    if (style.position === 'absolute') this.absolutes.push(box);
    else {
      target.open = undefined;
      target.children.push(box);
    }
    if (node.tag === 'li' && (target.tag === 'ul' || target.tag === 'ol')) {
      const number = target.children.filter(
        (each) => each.kind === 'box' && each.tag === 'li',
      ).length;
      this.addRuns(box, [plainRun(target.tag === 'ol' ? `${number}. ` : '• ')], style, undefined);
    }
    if (node.tag === 'detail') this.addRuns(box, this.input.detail ?? [], style, undefined);
    else if (node.tag === 'badges')
      this.addRuns(box, [plainRun((this.input.badges ?? []).join(' '))], style, undefined);
    else this.fill(node.children, box, scope, [...ancestors, matched], undefined);
  }

  /** The paragraph text goes on in a box, started when needed. */
  private paragraph(box: Box): Paragraph {
    if (box.open === undefined) {
      box.open = { kind: 'paragraph', style: box.style, items: [] };
      box.children.push(box.open);
    }
    return box.open;
  }

  private addRuns(
    box: Box,
    runs: readonly EmphasisRun[],
    style: FaceStyle,
    inline: { back?: FaceColor; shift: number } | undefined,
  ): void {
    if (runs.length === 0) return;
    const paragraph = this.paragraph(box);
    for (const run of runs) {
      if (run.text === '') continue;
      this.texts += 1;
      if (this.texts > MAX_TEXTS)
        throw new TooLarge(`A face lays out at most ${FACE_CAPS.runs} runs of text.`);
      const ink = this.ink(
        {
          ...style,
          bold: style.bold || run.bold,
          italic: style.italic || run.italic,
          mono: style.mono || run.code,
          underline: style.underline || run.underline || run.link !== undefined,
          strike: style.strike || run.strike,
        },
        run.code ? 'code-back' : run.highlight ? 'highlight' : inline?.back,
        inline?.shift ?? 0,
        run.link,
      );
      paragraph.items.push({ kind: 'text', text: transformed(run.text, style.textTransform), ink });
    }
  }

  private ink(style: FaceStyle, back: FaceColor | undefined, shift: number, link?: string): Ink {
    const variant: RobotoVariant = style.mono
      ? 'mono'
      : style.bold
        ? style.italic
          ? 'boldItalic'
          : 'bold'
        : style.italic
          ? 'italic'
          : 'regular';
    const lineHeight =
      'px' in style.lineHeight ? style.lineHeight.px : style.lineHeight.multiple * style.fontSize;
    const key = [
      style.fontSize,
      variant,
      style.color,
      style.underline,
      style.strike,
      back,
      shift,
      link,
      lineHeight,
    ].join('|');
    return {
      size: style.fontSize,
      variant,
      color: style.color,
      underline: style.underline,
      strike: style.strike,
      ...(back === undefined ? {} : { back }),
      shift,
      ...(link === undefined ? {} : { link }),
      lineHeight,
      key,
    };
  }

  // ——— Slots and conditions —————————————————————————————————————————————————————————————————————

  private attribute(name: string): FaceValue | undefined {
    return this.input.attributes.find((each) => each.name === name);
  }

  /** The raw value a reference reads. */
  private read(ref: Reference, scope: Scope): JsonValue | undefined {
    switch (ref.kind) {
      case 'name':
        return this.input.name;
      case 'component':
        return this.input.component;
      case 'count':
        return this.input.count;
      case 'item':
        return scope.item;
      case 'key':
        return scope.attribute?.name;
      case 'value':
        return scope.attribute?.value;
      case 'more':
        return scope.more === undefined || scope.more <= 0 ? undefined : scope.more;
      case 'attribute':
        return this.attribute(ref.name)?.value;
    }
  }

  /** The attribute a reference reads, with its definition, if it reads one. */
  private attributeRead(ref: Reference, scope: Scope): FaceValue | undefined {
    if (ref.kind === 'attribute') return this.attribute(ref.name);
    if (ref.kind === 'value') return scope.attribute;
    return undefined;
  }

  private holds(condition: Condition, scope: Scope): boolean {
    const value = this.read(condition.ref, scope);
    const format = this.attributeRead(condition.ref, scope)?.format ?? 'plain';
    if (condition.kind === 'has') return hasValue(value) !== condition.not;
    const is = (wanted: string | number) => meetsCondition(value, 'is', String(wanted), format);
    const [first] = condition.values;
    switch (condition.op) {
      case '=':
        return is(first!);
      case '!=':
        return !is(first!);
      case 'in':
        return condition.values.some(is);
      case '<':
        return meetsCondition(value, 'below', String(first), format);
      case '>':
        return meetsCondition(value, 'above', String(first), format);
      case '<=':
        return meetsCondition(value, 'below', String(first), format) || is(first!);
      case '>=':
        return meetsCondition(value, 'above', String(first), format) || is(first!);
    }
  }

  /** What a text with slots writes, as runs: slots write text, with emphasis where it is taken. */
  private write(slots: SlotText, scope: Scope): EmphasisRun[] {
    const runs: EmphasisRun[] = [];
    for (const part of slots) {
      if (typeof part === 'string') {
        runs.push(plainRun(part));
        continue;
      }
      const attribute = this.attributeRead(part.ref, scope);
      let text: string | undefined;
      if (part.ref.kind === 'key') text = scope.attribute?.name;
      else if (attribute !== undefined) text = valueText(attribute);
      else {
        const value = this.read(part.ref, scope);
        text = hasValue(value)
          ? capped(typeof value === 'string' ? value : JSON.stringify(value))
          : undefined;
        if (typeof value === 'number') text = String(value);
      }
      if (text === undefined || text === '') {
        if (part.fallback !== undefined) runs.push(plainRun(part.fallback));
        continue;
      }
      const emphasis =
        attribute?.format === 'emphasis' && !part.plain && typeof attribute.value === 'string';
      runs.push(...(emphasis ? emphasisRuns(text) : [plainRun(text)]));
    }
    return runs;
  }

  /** A class with its slots filled, their values reduced to `[a-z0-9-]`. */
  private className(slots: SlotText, scope: Scope): string {
    let name = '';
    for (const part of slots) {
      if (typeof part === 'string') name += part;
      else
        name += reduced(
          this.write([part], scope)
            .map((run) => run.text)
            .join(''),
        );
    }
    return name;
  }

  // ——— Sizes ————————————————————————————————————————————————————————————————————————————————————

  /** How wide a child is with nothing wrapped. */
  private contentWidth(child: Child): number {
    const known = this.contentSizes.get(child);
    if (known !== undefined) return known;
    let width: number;
    if (child.kind === 'paragraph') {
      width = 0;
      for (const line of linesOf(child, Infinity).lines) width = Math.max(width, line.width);
    } else {
      const { style } = child;
      const inset = insets(style);
      if (style.width !== undefined && 'px' in style.width) width = style.width.px;
      else {
        const children = child.children.map((each) => this.contentWidth(each) + marginsX(each));
        let inner: number;
        if (style.display === 'flex' && style.flexDirection === 'row') {
          inner =
            children.reduce((sum, each) => sum + each, 0) +
            style.columnGap * Math.max(0, children.length - 1);
        } else if (style.display === 'grid') {
          const columns = Math.max(1, style.gridColumns?.length ?? 1);
          const widths = new Array<number>(columns).fill(0);
          children.forEach((each, at) => {
            const column = at % columns;
            const track = style.gridColumns?.[column];
            widths[column] =
              track !== undefined && typeof track === 'object' && 'px' in track
                ? track.px
                : Math.max(widths[column]!, each);
          });
          inner = widths.reduce((sum, each) => sum + each, 0) + style.columnGap * (columns - 1);
        } else inner = children.reduce((most, each) => Math.max(most, each), 0);
        width = inner + inset.left + inset.right;
      }
      width = clampLength(width, style.minWidth, style.maxWidth, undefined);
    }
    this.contentSizes.set(child, width);
    return width;
  }

  /** Lays a child out at a width; boxes may be given their height. */
  private layOutChild(child: Child, width: number, height?: number, room?: number): Laid {
    if (child.kind === 'paragraph') {
      const laid = linesOf(child, width);
      return {
        x: 0,
        y: 0,
        width,
        height: laid.height,
        children: [],
        lines: laid.lines,
        cut: laid.cut,
      };
    }
    return this.layOutBox(child, width, height, room);
  }

  /** Lays a box out at a width, at `forced` height if given; `room` is what a percent height is of. */
  private layOutBox(box: Box, width: number, forced?: number, room?: number): Laid {
    const { style } = box;
    const inset = insets(style);
    const innerWidth = Math.max(0, width - inset.left - inset.right);
    let definite = forced ?? resolve(style.height, room);
    if (definite !== undefined)
      definite = clampLength(definite, style.minHeight, style.maxHeight, room);
    const innerHeight =
      definite === undefined ? undefined : Math.max(0, definite - inset.top - inset.bottom);
    let children: Laid[] = [];
    let contentHeight = 0;
    if (box.region === 'rows') contentHeight = Math.max(0, this.input.rowsHeight ?? 0);
    else if (box.region === 'contents') contentHeight = Math.max(0, this.input.contentsHeight ?? 0);
    if (box.children.length > 0) {
      const placed =
        style.display === 'grid'
          ? this.grid(box, innerWidth)
          : style.display === 'flex' && style.flexDirection === 'row'
            ? this.row(box, innerWidth, innerHeight)
            : this.column(box, innerWidth, innerHeight);
      children = placed.children;
      contentHeight = Math.max(contentHeight, placed.height);
      for (const child of children) {
        child.x += inset.left;
        child.y += inset.top;
      }
    }
    const height =
      definite ??
      clampLength(contentHeight + inset.top + inset.bottom, style.minHeight, style.maxHeight, room);
    return { x: 0, y: 0, width, height, box, children, cut: false };
  }

  /** Children one under another, as a block and a flex column lay them out. */
  private column(
    box: Box,
    width: number,
    height: number | undefined,
  ): { children: Laid[]; height: number } {
    const { style } = box;
    const items = box.children.filter((child) => !emptyParagraph(child));
    const laid: Laid[] = [];
    const placeOf = (child: Child, used: Laid) => {
      if (child.kind === 'paragraph') return 0;
      const align = child.style.alignSelf === 'auto' ? style.alignItems : child.style.alignSelf;
      const room = width - child.style.marginLeft - child.style.marginRight - used.width;
      return (
        child.style.marginLeft +
        Math.max(0, align === 'center' ? room / 2 : align === 'end' ? room : 0)
      );
    };
    for (const child of items) {
      const childWidth = this.widthIn(child, width, style.alignItems);
      const each = this.layOutChild(child, childWidth, undefined, height);
      each.x = placeOf(child, each);
      laid.push(each);
    }
    const gaps = style.rowGap * Math.max(0, laid.length - 1);
    const outer = (at: number) => {
      const child = items[at]!;
      return (
        laid[at]!.height +
        (child.kind === 'box' ? child.style.marginTop + child.style.marginBottom : 0)
      );
    };
    let used = laid.reduce((sum, _each, at) => sum + outer(at), 0) + gaps;
    let free = height === undefined ? 0 : height - used;
    if (free > EPSILON) {
      const grows = items.map((child) => (child.kind === 'box' ? child.style.flexGrow : 0));
      const total = grows.reduce((sum, each) => sum + each, 0);
      if (total > 0) {
        items.forEach((child, at) => {
          if (grows[at]! <= 0) return;
          const grown = laid[at]!.height + (free * grows[at]!) / total;
          const again = this.layOutChild(child, laid[at]!.width, grown, height);
          again.x = laid[at]!.x;
          laid[at] = again;
        });
        used = laid.reduce((sum, _each, at) => sum + outer(at), 0) + gaps;
        free = height! - used;
      }
    }
    const { start, between } = justified(style.justifyContent, Math.max(0, free), laid.length);
    let y = start;
    items.forEach((child, at) => {
      const each = laid[at]!;
      y += child.kind === 'box' ? child.style.marginTop : 0;
      each.y = y;
      y +=
        each.height +
        (child.kind === 'box' ? child.style.marginBottom : 0) +
        style.rowGap +
        between;
    });
    return { children: laid, height: used };
  }

  /** The width a child of a column takes. */
  private widthIn(child: Child, width: number, alignItems: FaceStyle['alignItems']): number {
    if (child.kind === 'paragraph') return width;
    const { style } = child;
    const room = Math.max(0, width - style.marginLeft - style.marginRight);
    const align = style.alignSelf === 'auto' ? alignItems : style.alignSelf;
    const set = resolve(style.width, width);
    const wanted = set ?? (align === 'stretch' ? room : Math.min(this.contentWidth(child), room));
    return Math.min(clampLength(wanted, style.minWidth, style.maxWidth, width), room);
  }

  /** Children side by side, as a flex row lays them out, wrapping if it wraps. */
  private row(
    box: Box,
    width: number,
    height: number | undefined,
  ): { children: Laid[]; height: number } {
    const { style } = box;
    const items = box.children
      .filter((child) => !emptyParagraph(child))
      .map((child) => {
        const s = child.kind === 'box' ? child.style : undefined;
        const marginX = s === undefined ? 0 : s.marginLeft + s.marginRight;
        let basis: number;
        if (s === undefined) basis = this.contentWidth(child);
        else if (s.flexBasis !== 'auto') basis = resolve(s.flexBasis, width) ?? 0;
        else basis = resolve(s.width, width) ?? this.contentWidth(child);
        const min = s === undefined ? 0 : (resolve(s.minWidth, width) ?? 0);
        const max = s === undefined ? Infinity : (resolve(s.maxWidth, width) ?? Infinity);
        basis = Math.max(min, Math.min(max, basis));
        return {
          child,
          basis,
          min,
          max,
          marginX,
          grow: s?.flexGrow ?? 0,
          shrink: s?.flexShrink ?? 1,
        };
      });
    // Lines of items.
    const lines: (typeof items)[] = [];
    let line: typeof items = [];
    let used = 0;
    for (const item of items) {
      const size = item.basis + item.marginX;
      if (style.flexWrap && line.length > 0 && used + style.columnGap + size > width + EPSILON) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length > 0 ? style.columnGap : 0) + size;
      line.push(item);
    }
    if (line.length > 0) lines.push(line);
    const children: Laid[] = [];
    let y = 0;
    lines.forEach((items, lineAt) => {
      const gaps = style.columnGap * Math.max(0, items.length - 1);
      const free = width - gaps - items.reduce((sum, each) => sum + each.basis + each.marginX, 0);
      const sizes = items.map((each) => each.basis);
      let left = free;
      if (free > EPSILON) {
        const total = items.reduce((sum, each) => sum + each.grow, 0);
        if (total > 0) {
          items.forEach((each, at) => {
            sizes[at] = Math.min(each.max, each.basis + (free * each.grow) / total);
          });
          left = width - gaps - sizes.reduce((sum, each, at) => sum + each + items[at]!.marginX, 0);
        }
      } else if (free < -EPSILON) {
        const total = items.reduce((sum, each) => sum + each.shrink * each.basis, 0);
        if (total > 0) {
          items.forEach((each, at) => {
            sizes[at] = Math.max(each.min, each.basis + (free * each.shrink * each.basis) / total);
          });
        }
        left = 0;
      }
      // Nothing passes the line: what still does is taken from the last items first.
      let over = sizes.reduce((sum, each, at) => sum + each + items[at]!.marginX, 0) + gaps - width;
      for (let at = sizes.length - 1; at >= 0 && over > EPSILON; at -= 1) {
        const taken = Math.min(sizes[at]!, over);
        sizes[at]! -= taken;
        over -= taken;
      }
      const laid = items.map((each, at) =>
        this.layOutChild(each.child, Math.max(0, sizes[at]!), undefined, height),
      );
      const marginsY = (child: Child) =>
        child.kind === 'box' ? child.style.marginTop + child.style.marginBottom : 0;
      let cross = laid.reduce(
        (most, each, at) => Math.max(most, each.height + marginsY(items[at]!.child)),
        0,
      );
      if (!style.flexWrap && height !== undefined) cross = height;
      const { start, between } = justified(style.justifyContent, Math.max(0, left), items.length);
      let x = start;
      items.forEach((each, at) => {
        const { child } = each;
        let placed = laid[at]!;
        const s = child.kind === 'box' ? child.style : undefined;
        const align =
          s === undefined ? 'start' : s.alignSelf === 'auto' ? style.alignItems : s.alignSelf;
        if (s !== undefined && align === 'stretch' && s.height === undefined) {
          placed = this.layOutChild(
            child,
            placed.width,
            Math.max(0, cross - marginsY(child)),
            height,
          );
        }
        x += s?.marginLeft ?? 0;
        placed.x = x;
        const room = cross - placed.height - marginsY(child);
        placed.y =
          y +
          (s?.marginTop ?? 0) +
          Math.max(0, align === 'center' ? room / 2 : align === 'end' ? room : 0);
        x += placed.width + (s?.marginRight ?? 0) + style.columnGap + between;
        children.push(placed);
      });
      y += cross + (lineAt < lines.length - 1 ? style.rowGap : 0);
    });
    return { children, height: y };
  }

  /** Children in the columns of a grid, row by row. */
  private grid(box: Box, width: number): { children: Laid[]; height: number } {
    const { style } = box;
    const items = box.children.filter((child) => !emptyParagraph(child));
    const tracks = style.gridColumns ?? [{ fr: 1 }];
    const columns = tracks.length;
    const room = Math.max(0, width - style.columnGap * (columns - 1));
    const widths = tracks.map((track, column) => {
      if (track === 'auto') {
        let most = 0;
        for (let at = column; at < items.length; at += columns) {
          most = Math.max(most, this.contentWidth(items[at]!) + marginsX(items[at]!));
        }
        return most;
      }
      return 'px' in track ? track.px : 0;
    });
    const isAuto = tracks.map((track) => track === 'auto');
    const fixed = widths.reduce((sum, each) => sum + each, 0);
    if (fixed > room) {
      // Columns of content give way first, then those of a set width.
      const pixels = widths.reduce((sum, each, at) => sum + (isAuto[at] ? 0 : each), 0);
      const auto = fixed - pixels;
      const autoRoom = Math.max(0, room - pixels);
      const scaleAuto = auto > 0 ? Math.min(1, autoRoom / auto) : 1;
      const scalePixels = pixels > room ? room / pixels : 1;
      widths.forEach((each, at) => {
        widths[at] = each * (isAuto[at] ? (pixels > room ? 0 : scaleAuto) : scalePixels);
      });
    } else {
      const fractions = tracks.reduce(
        (sum, track) => sum + (typeof track === 'object' && 'fr' in track ? track.fr : 0),
        0,
      );
      const left = room - fixed;
      tracks.forEach((track, at) => {
        if (typeof track === 'object' && 'fr' in track && fractions > 0)
          widths[at] = (left * track.fr) / fractions;
      });
    }
    const children: Laid[] = [];
    let y = 0;
    for (let first = 0; first < items.length; first += columns) {
      const row = items.slice(first, first + columns);
      const laid = row.map((child, column) => {
        const s = child.kind === 'box' ? child.style : undefined;
        const cell = widths[column]!;
        const childWidth =
          s === undefined
            ? cell
            : Math.min(
                Math.max(0, cell - s.marginLeft - s.marginRight),
                resolve(s.width, cell) ?? Math.max(0, cell - s.marginLeft - s.marginRight),
              );
        return this.layOutChild(child, childWidth);
      });
      const marginsY = (child: Child) =>
        child.kind === 'box' ? child.style.marginTop + child.style.marginBottom : 0;
      const height = laid.reduce(
        (most, each, at) => Math.max(most, each.height + marginsY(row[at]!)),
        0,
      );
      let x = 0;
      row.forEach((child, column) => {
        let placed = laid[column]!;
        const s = child.kind === 'box' ? child.style : undefined;
        const align =
          s === undefined ? 'start' : s.alignSelf === 'auto' ? style.alignItems : s.alignSelf;
        if (s !== undefined && align === 'stretch' && s.height === undefined) {
          placed = this.layOutChild(child, placed.width, Math.max(0, height - marginsY(child)));
        }
        placed.x = x + (s?.marginLeft ?? 0);
        const room = height - placed.height - marginsY(child);
        placed.y =
          y +
          (s?.marginTop ?? 0) +
          Math.max(0, align === 'center' ? room / 2 : align === 'end' ? room : 0);
        x += widths[column]! + style.columnGap;
        children.push(placed);
      });
      y += height + (first + columns < items.length ? style.rowGap : 0);
    }
    return { children, height: y };
  }

  /** A box placed against the face's own box, out of its flow. */
  private layOutAbsolute(box: Box, faceHeight: number): Laid {
    const { style } = box;
    const width = this.width;
    const left = style.left;
    const right = style.right;
    const room = Math.max(0, width - (left ?? 0) - (right ?? 0));
    const wanted =
      left !== undefined && right !== undefined
        ? room
        : (resolve(style.width, width) ?? Math.min(this.contentWidth(box), room));
    const boxWidth = Math.min(
      room,
      Math.max(0, clampLength(wanted, style.minWidth, style.maxWidth, width)),
    );
    const forced =
      style.top !== undefined && style.bottom !== undefined
        ? Math.max(0, faceHeight - style.top - style.bottom)
        : undefined;
    const laid = this.layOutBox(box, boxWidth, forced, faceHeight);
    const x = left ?? (right !== undefined ? width - right - laid.width : 0);
    laid.x = Math.max(0, Math.min(x, width - laid.width));
    laid.y =
      style.top ?? (style.bottom !== undefined ? faceHeight - style.bottom - laid.height : 0);
    return laid;
  }
}

// ——— Text ————————————————————————————————————————————————————————————————————————————————————————

interface Piece {
  text: string;
  x: number;
  width: number;
  ink: Ink;
}

interface Line {
  top: number;
  height: number;
  baseline: number;
  width: number;
  pieces: Piece[];
}

function measure(text: string, ink: Ink): number {
  return robotoWidth(text, ink.variant, ink.size);
}

function transformed(text: string, transform: FaceStyle['textTransform']): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(
        /(^|\s)(\S)/gu,
        (_all, space: string, first: string) => space + first.toUpperCase(),
      );
    case 'none':
      return text;
  }
}

function reduced(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 64);
}

function emptyParagraph(child: Child): boolean {
  return (
    child.kind === 'paragraph' &&
    child.items.every((item) => item.kind === 'text' && item.text.trim() === '')
  );
}

type Atom = { kind: 'word' | 'space'; text: string; ink: Ink } | { kind: 'break'; ink: Ink };

/** The paragraph's text as words, spaces and breaks, spaces folded as HTML folds them. */
function atomsOf(paragraph: Paragraph): Atom[] {
  const atoms: Atom[] = [];
  let spaced = true;
  for (const item of paragraph.items) {
    if (item.kind === 'break') {
      // A space before a line break is not drawn.
      if (atoms.at(-1)?.kind === 'space') atoms.pop();
      atoms.push(item);
      spaced = true;
      continue;
    }
    for (const part of item.text.split(/(\s+)/u)) {
      if (part === '') continue;
      if (/^\s+$/u.test(part)) {
        if (!spaced) atoms.push({ kind: 'space', text: ' ', ink: item.ink });
        spaced = true;
      } else {
        atoms.push({ kind: 'word', text: part, ink: item.ink });
        spaced = false;
      }
    }
  }
  if (atoms.at(-1)?.kind === 'space') atoms.pop();
  return atoms;
}

/** Breaks a paragraph into lines at a width, as its style says: wrapped, on one line, or clamped. */
function linesOf(
  paragraph: Paragraph,
  width: number,
): { lines: Line[]; height: number; cut: boolean } {
  const { style } = paragraph;
  const wraps = !style.nowrap && Number.isFinite(width);
  const lines: Line[] = [];
  let cut = false;
  let current: Piece[] = [];
  let x = 0;
  let space: Atom | undefined;
  let stopped = false;
  const finish = () => {
    lines.push(lineOf(current));
    current = [];
    x = 0;
    space = undefined;
  };
  const place = (text: string, ink: Ink) => {
    const w = measure(text, ink);
    const last = current.at(-1);
    if (
      last !== undefined &&
      last.ink.key === ink.key &&
      Math.abs(last.x + last.width - x) < EPSILON
    ) {
      last.text += text;
      last.width += w;
    } else current.push({ text, x, width: w, ink });
    x += w;
  };
  const atoms = atomsOf(paragraph);
  for (let at = 0; at < atoms.length && !stopped; at += 1) {
    const atom = atoms[at]!;
    if (atom.kind === 'break') {
      finish();
      continue;
    }
    if (atom.kind === 'space') {
      space = atom;
      continue;
    }
    // A word: the atoms up to the next space or break.
    const word: Atom[] = [atom];
    while (atoms[at + 1]?.kind === 'word') word.push(atoms[++at]!);
    const wordWidth = word.reduce(
      (sum, each) => sum + (each.kind === 'break' ? 0 : measure(each.text, each.ink)),
      0,
    );
    const spaceWidth = space !== undefined && current.length > 0 ? measure(' ', space.ink) : 0;
    if (current.length > 0 && wraps && x + spaceWidth + wordWidth > width + EPSILON) finish();
    if (current.length > 0 && space !== undefined && space.kind !== 'break') place(' ', space.ink);
    space = undefined;
    if (!wraps || x + wordWidth <= width + EPSILON) {
      for (const each of word) if (each.kind !== 'break') place(each.text, each.ink);
      continue;
    }
    // A word longer than its line breaks between characters.
    for (const each of word) {
      if (each.kind === 'break') continue;
      for (const character of each.text) {
        const w = measure(character, each.ink);
        if (x + w > width + EPSILON) {
          if (current.length === 0) {
            stopped = true;
            cut = true;
            break;
          }
          finish();
        }
        place(character, each.ink);
      }
      if (stopped) break;
    }
  }
  if (current.length > 0) finish();
  // Past its clamp, or on one line wider than its box: cut, ending in "…".
  const clamp = style.lineClamp;
  if (clamp !== undefined && lines.length > clamp) {
    lines.length = clamp;
    cut = true;
    if (Number.isFinite(width)) ellipsized(lines.at(-1)!, width);
  }
  if (Number.isFinite(width)) {
    for (const line of lines) {
      if (line.width > width + EPSILON) {
        ellipsized(line, width);
        cut = true;
      }
    }
  }
  // Lines one under another, each aligned in the width.
  let y = 0;
  const paragraphInk = lineHeightOf(style);
  for (const line of lines) {
    const height = line.pieces.length === 0 ? paragraphInk : line.height;
    const size =
      line.pieces.reduce((most, piece) => Math.max(most, piece.ink.size), 0) || style.fontSize;
    line.top = y;
    line.height = height;
    line.baseline = y + height / 2 + BASELINE_BELOW_MIDDLE * size;
    y += height;
    if (Number.isFinite(width)) {
      const shift =
        style.textAlign === 'center'
          ? (width - line.width) / 2
          : style.textAlign === 'right'
            ? width - line.width
            : 0;
      if (shift > 0) for (const piece of line.pieces) piece.x += shift;
    }
  }
  return { lines, height: y, cut };
}

function lineHeightOf(style: FaceStyle): number {
  return 'px' in style.lineHeight
    ? style.lineHeight.px
    : style.lineHeight.multiple * style.fontSize;
}

function lineOf(pieces: Piece[]): Line {
  const last = pieces.at(-1);
  return {
    top: 0,
    height: pieces.reduce((most, piece) => Math.max(most, piece.ink.lineHeight), 0),
    baseline: 0,
    width: last === undefined ? 0 : last.x + last.width - (pieces[0]?.x ?? 0),
    pieces,
  };
}

/** Ends a line in "…" within a width, taking characters from its end until it fits. */
function ellipsized(line: Line, width: number): void {
  const start = line.pieces[0]?.x ?? 0;
  const lastInk = line.pieces.at(-1)?.ink;
  if (lastInk === undefined) return;
  const ellipsis = measure(ELLIPSIS, lastInk);
  const end = () => {
    const last = line.pieces.at(-1);
    return last === undefined ? start : last.x + last.width;
  };
  for (;;) {
    const last = line.pieces.at(-1);
    if (last === undefined) break;
    const trimmed = last.text.replace(/\s+$/u, '');
    if (trimmed !== last.text) {
      last.text = trimmed;
      last.width = measure(trimmed, last.ink);
    }
    if (last.text === '') {
      line.pieces.pop();
      continue;
    }
    if (end() + ellipsis <= start + width + EPSILON) break;
    const characters = [...last.text];
    characters.pop();
    last.text = characters.join('');
    last.width = measure(last.text, last.ink);
  }
  if (ellipsis <= width + EPSILON) {
    const last = line.pieces.at(-1);
    if (last !== undefined && last.ink.key === lastInk.key) {
      last.text += ELLIPSIS;
      last.width = measure(last.text, last.ink);
    } else line.pieces.push({ text: ELLIPSIS, x: end(), width: ellipsis, ink: lastInk });
  }
  line.width = end() - start;
}

// ——— Lengths —————————————————————————————————————————————————————————————————————————————————————

function resolve(length: Length | undefined, of: number | undefined): number | undefined {
  if (length === undefined) return undefined;
  if ('px' in length) return length.px;
  return of === undefined || !Number.isFinite(of) ? undefined : (of * length.percent) / 100;
}

function clampLength(
  value: number,
  min: Length | undefined,
  max: Length | undefined,
  of: number | undefined,
): number {
  const most = resolve(max, of);
  const least = resolve(min, of);
  let out = value;
  if (most !== undefined) out = Math.min(out, most);
  if (least !== undefined) out = Math.max(out, least);
  return out;
}

function insets(style: FaceStyle): { top: number; right: number; bottom: number; left: number } {
  return {
    top: style.paddingTop + (style.borderTop?.width ?? 0),
    right: style.paddingRight + (style.borderRight?.width ?? 0),
    bottom: style.paddingBottom + (style.borderBottom?.width ?? 0),
    left: style.paddingLeft + (style.borderLeft?.width ?? 0),
  };
}

function marginsX(child: Child): number {
  return child.kind === 'box' ? child.style.marginLeft + child.style.marginRight : 0;
}

/** Where the first child starts and what goes between children, by `justify-content`. */
function justified(
  justify: FaceStyle['justifyContent'],
  free: number,
  count: number,
): { start: number; between: number } {
  switch (justify) {
    case 'center':
      return { start: free / 2, between: 0 };
    case 'end':
      return { start: free, between: 0 };
    case 'space-between':
      return count > 1 ? { start: 0, between: free / (count - 1) } : { start: 0, between: 0 };
    case 'space-around':
      return { start: free / count / 2, between: free / count };
    case 'space-evenly':
      return { start: free / (count + 1), between: free / (count + 1) };
    case 'start':
      return { start: 0, between: 0 };
  }
}

// ——— The drawing —————————————————————————————————————————————————————————————————————————————————

interface Laid extends FaceRect {
  box?: Box;
  children: Laid[];
  lines?: Line[];
  cut: boolean;
}

function intersect(a: FaceRect, b: FaceRect): FaceRect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right - x > EPSILON && bottom - y > EPSILON
    ? { x, y, width: right - x, height: bottom - y }
    : undefined;
}

function sameRect(a: FaceRect, b: FaceRect): boolean {
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON
  );
}

/** Writes laid boxes and lines into a face drawing, cut to what clips them. */
class Output {
  boxes: FaceBox[] = [];
  runs: FaceRun[] = [];
  bands: FaceBand[] = [];
  images: FaceImage[] = [];
  regions: FaceRegion[] = [];
  cut = false;
  private line = 0;
  private paragraph = 0;
  /** The lowest line written so far, to end in "…" if lines below it are left out. */
  private lowest?: Written;
  /** The top of the highest line left out under what clips it. */
  private droppedTop = Infinity;

  constructor(private readonly width: number) {}

  emit(laid: Laid, left: number, top: number, clip: FaceRect): void {
    const rect = { x: left + laid.x, y: top + laid.y, width: laid.width, height: laid.height };
    if (laid.cut) this.cut = true;
    if (laid.lines !== undefined) {
      this.text(laid.lines, rect, clip);
      return;
    }
    const box = laid.box!;
    const shown = rect.width > 0 && rect.height > 0 ? intersect(rect, clip) : undefined;
    if (shown === undefined && rect.width > 0 && rect.height > 0) this.cut = true;
    if (shown !== undefined) {
      if (!sameRect(shown, rect)) this.cut = true;
      const { style } = box;
      const borders = {
        ...(style.borderTop === undefined ? {} : { top: style.borderTop }),
        ...(style.borderRight === undefined ? {} : { right: style.borderRight }),
        ...(style.borderBottom === undefined ? {} : { bottom: style.borderBottom }),
        ...(style.borderLeft === undefined ? {} : { left: style.borderLeft }),
      };
      const bordered = Object.keys(borders).length > 0;
      if (style.background !== undefined || bordered) {
        this.boxes.push({
          ...shown,
          ...(style.background === undefined ? {} : { background: style.background }),
          ...(bordered ? { borders } : {}),
          radius: Math.min(style.borderRadius, shown.width / 2, shown.height / 2),
        });
      }
      if (box.image !== undefined) {
        this.images.push(
          box.image.kind === 'icon'
            ? { kind: 'icon', ...shown }
            : { kind: 'image', ref: box.image.ref, ...shown },
        );
      }
    }
    if (box.region !== undefined) {
      const region = intersect(rect, clip) ?? {
        x: rect.x,
        y: Math.min(rect.y, clip.y + clip.height),
        width: rect.width,
        height: 0,
      };
      this.regions.push({ kind: box.region, ...region });
    }
    const inner = box.style.overflowHidden ? intersect(rect, clip) : clip;
    if (inner === undefined) {
      if (laid.children.length > 0) this.cut = true;
      return;
    }
    for (const child of laid.children) this.emit(child, rect.x, rect.y, inner);
  }

  private text(lines: Line[], rect: FaceRect, clip: FaceRect): void {
    const paragraph = this.paragraph++;
    const bottom = clip.y + clip.height + EPSILON;
    const kept = lines.filter(
      (line) => rect.y + line.top >= clip.y - EPSILON && rect.y + line.top + line.height <= bottom,
    );
    for (const line of lines) {
      if (!kept.includes(line) && rect.y + line.top >= clip.y - EPSILON) {
        this.droppedTop = Math.min(this.droppedTop, rect.y + line.top);
      }
    }
    if (kept.length < lines.length) {
      this.cut = true;
      const last = kept.at(-1);
      if (last !== undefined) kept[kept.length - 1] = endedInEllipsis(last, rect, clip);
    }
    for (const line of kept) {
      const index = this.line++;
      const written = this.lineParts(line, rect, clip, index, paragraph);
      const lineBottom = rect.y + line.top + line.height;
      if (this.lowest === undefined || lineBottom >= this.lowest.bottom - EPSILON) {
        this.lowest = {
          line,
          rect,
          clip,
          index,
          paragraph,
          bottom: lineBottom,
          runAt: this.runs.length,
          runCount: written.runs.length,
          bandAt: this.bands.length,
          bandCount: written.bands.length,
        };
      }
      this.runs.push(...written.runs);
      this.bands.push(...written.bands);
    }
  }

  /** Ends the lowest line written in "…" when lines under it were left out. */
  finish(): void {
    const lowest = this.lowest;
    if (
      lowest === undefined ||
      this.droppedTop < lowest.bottom - EPSILON ||
      this.droppedTop === Infinity
    )
      return;
    if (lowest.line.pieces.at(-1)?.text.endsWith(ELLIPSIS)) return;
    const written = this.lineParts(
      endedInEllipsis(lowest.line, lowest.rect, lowest.clip),
      lowest.rect,
      lowest.clip,
      lowest.index,
      lowest.paragraph,
    );
    this.runs.splice(lowest.runAt, lowest.runCount, ...written.runs);
    this.bands.splice(lowest.bandAt, lowest.bandCount, ...written.bands);
  }

  /** The runs and bands of a line. */
  private lineParts(
    line: Line,
    rect: FaceRect,
    clip: FaceRect,
    index: number,
    paragraph: number,
  ): { runs: FaceRun[]; bands: FaceBand[] } {
    const runs: FaceRun[] = [];
    const bands: FaceBand[] = [];
    const right = Math.min(this.width, clip.x + clip.width) + EPSILON;
    for (const piece of line.pieces) {
      const x = rect.x + piece.x;
      if (piece.text === '' || x + piece.width > right || x < clip.x - EPSILON) {
        this.cut = true;
        continue;
      }
      const y = rect.y + line.baseline + piece.ink.shift;
      const { ink } = piece;
      runs.push({
        text: piece.text,
        x,
        y,
        width: piece.width,
        size: ink.size,
        variant: ink.variant,
        color: ink.color,
        line: index,
        paragraph,
        ...(ink.link === undefined ? {} : { link: ink.link }),
      });
      const thickness = Math.max(0.5, ink.size / 14);
      const band = (kind: FaceBand['kind'], color: FaceColor, top: number, height: number) => {
        const shown = intersect({ x, y: top, width: piece.width, height }, clip);
        if (shown !== undefined) bands.push({ kind, color, ...shown });
      };
      if (ink.back !== undefined) band('back', ink.back, y - ink.size * 0.93, ink.size * 1.2);
      if (ink.underline) band('underline', ink.color, y + ink.size * 0.1, thickness);
      if (ink.strike) band('strike', ink.color, y - ink.size * 0.3, thickness);
    }
    return { runs, bands };
  }
}

/** A line written so far, and where its runs and bands are. */
interface Written {
  line: Line;
  rect: FaceRect;
  clip: FaceRect;
  index: number;
  paragraph: number;
  bottom: number;
  runAt: number;
  runCount: number;
  bandAt: number;
  bandCount: number;
}

/** A copy of a line that ends in "…" within its paragraph and what clips it. */
function endedInEllipsis(line: Line, rect: FaceRect, clip: FaceRect): Line {
  const copy = { ...line, pieces: line.pieces.map((piece) => ({ ...piece })) };
  const right = Math.min(rect.x + rect.width, clip.x + clip.width);
  ellipsized(copy, Math.max(0, right - (rect.x + (copy.pieces[0]?.x ?? 0))));
  return copy;
}
