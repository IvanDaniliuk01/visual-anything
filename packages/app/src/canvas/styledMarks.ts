/**
 * What a tour's step draws in its own style rather than with a halo (ADR 0100): nothing is laid over
 * what it marks; the canvas draws it again, restyled, over the tiles, as it draws the lines the
 * pointer gives their color (ADR 0086).
 *
 * - A relation's line is drawn twice as wide, at least {@link STYLED_LINE_LEAST} pixels on screen, in
 *   the canvas's emphasis color, with a larger arrowhead, keeping its dash. While the tour plays and
 *   motion is not reduced, its dash flows from its `from` end to its `to` end, one period every
 *   {@link FLOW_PERIOD_TIME} milliseconds, a solid line carrying a dash of the caption's color along
 *   it; an undirected line flows from both ends toward its middle. Its name is written bold on a
 *   solid back of the caption's color, bordered in the emphasis color.
 * - An element's shape takes a stronger border along its own outline, in its own stroke color where
 *   that reads at 3:1 on the canvas and in the emphasis color otherwise, and a soft shadow around it,
 *   outside its outline: its fill, its category's color and its face stay as they are. As it comes in,
 *   its border breathes once, wider and back over {@link BREATH_TIME} milliseconds, never again.
 * - A note takes the same border, in the emphasis color; a free arrow is drawn as a line is.
 *
 * Only what is marked is drawn, and only its lines on screen flow, each frame while they do.
 */
import { Container, Graphics } from 'pixi.js';
import type { ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import type { CanvasTheme } from '../theme/themes';
import { contrastRatio } from './colors';
import { strokeFlowing, strokeStyledRoute, traceMark, type MarkTarget } from './draw';
import { DASH_PATTERNS } from './drawing';
import type { Lit } from './emphasize';
import {
  boundsOf,
  untilArrowhead,
  type Arrowhead,
  type Dash,
  type Point,
  type Rect,
} from './geometry';
import { flowPieces } from './lineDraw';
import { MARK_UNIT, markTargetOf, startOnScreen } from './emphasisMarks';
import type { ArrowShape, ElementShape, NoteShape, RelationLine } from './scene';
import { isAnchoredSolidPart } from './solidMark';
import { paintedShape } from './theme/paint';

/** How much wider than its line a line drawn in its own style is. */
export const STYLED_LINE_FACTOR = 2;
/** The narrowest a line drawn in its own style is, in pixels on screen. */
export const STYLED_LINE_LEAST = 3;
/** How much larger its arrowhead is, at least and at most, as its line widens. */
export const STYLED_ARROWHEAD = { least: 1.5, most: 2.5 } as const;
/** How long a dash takes to flow one period along its line, in milliseconds. */
export const FLOW_PERIOD_TIME = 600;
/** How wide a solid line's flowing dash is, a part of its line's width, and how opaque. */
export const FLOW_DASH = { part: 0.45, alpha: 0.75 } as const;
/** How wide a shape's border drawn in its own style is, in pixels on screen. */
export const STYLED_BORDER = 3;
/** How much wider the border is at the height of its breath, in pixels on screen. */
export const BREATH_WIDER = 3;
/** How long a shape's breath takes as it comes in, in milliseconds. */
export const BREATH_TIME = 300;
/**
 * The soft shadow around a shape drawn in its own style: strokes from its outline outward, each its
 * width in pixels on screen and its opacity, darker on the dark canvas, where a light one would glow.
 */
export const LIFT: readonly { width: number; alpha: number }[] = [
  { width: 2, alpha: 0.2 },
  { width: 5, alpha: 0.1 },
  { width: 9, alpha: 0.05 },
];
const LIFT_DARK = 2.2;
/** The border of a relation's name written in its own style, and how far its back reaches past it. */
const LABEL_BORDER = 1.5;
const LABEL_PADDING = 2;

/** A line's width drawn in its own style, in canvas units at this scale. */
export function styledWidth(width: number, scale: number): number {
  return Math.max(width * STYLED_LINE_FACTOR, STYLED_LINE_LEAST / scale);
}

/** An arrowhead made larger about its tip, by `factor`. */
function largerArrowhead(arrowhead: Arrowhead, factor: number): Arrowhead {
  const { tip } = arrowhead;
  const out = (point: Point): Point => ({
    x: tip.x + (point.x - tip.x) * factor,
    y: tip.y + (point.y - tip.y) * factor,
  });
  return { ...arrowhead, left: out(arrowhead.left), right: out(arrowhead.right) };
}

/**
 * A line as drawn in its own style at this scale: wider, in `color`, opaque, its arrowhead larger,
 * keeping its route and its dash.
 */
export function styledLineOf(line: RelationLine, scale: number, color: Color): RelationLine {
  const width = styledWidth(line.width, scale);
  const factor = Math.min(
    STYLED_ARROWHEAD.most,
    Math.max(STYLED_ARROWHEAD.least, line.width > 0 ? width / line.width : STYLED_ARROWHEAD.least),
  );
  const drawn: RelationLine = {
    ...line,
    stroke: color,
    width,
    ...(line.arrowhead ? { arrowhead: largerArrowhead(line.arrowhead, factor) } : {}),
  };
  // Opaque, even where its appearance fades it (ADR 0088).
  delete drawn.opacity;
  return drawn;
}

/**
 * The color a shape's border takes in its own style: its stroke as this theme draws it where that
 * reads at 3:1 or more on the canvas, the emphasis color otherwise.
 */
export function styledBorderColor(
  shape: ElementShape,
  theme: Pick<CanvasTheme, 'name' | 'background' | 'highlight'>,
): Color {
  const { stroke } = paintedShape(shape, theme.name);
  try {
    return contrastRatio(stroke, theme.background) >= 3 ? stroke : theme.highlight;
  } catch {
    return theme.highlight;
  }
}

/** How far a dash has flowed along its line `elapsed` milliseconds in, in canvas units. */
export function flowOffset(elapsed: number, width: number, dash: Exclude<Dash, 'solid'>): number {
  const period = DASH_PATTERNS[dash].period * width;
  return ((Math.max(0, elapsed) / FLOW_PERIOD_TIME) % 1) * period;
}

/** How far through its breath a shape is `elapsed` milliseconds after it came in: 0, up to 1, and 0. */
export function breathAt(elapsed: number): number {
  if (!(elapsed > 0) || elapsed >= BREATH_TIME) return 0;
  return Math.sin((Math.PI * elapsed) / BREATH_TIME);
}

/** Whether two rectangles overlap. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

/** What the canvas gives the marks to draw with. */
export interface StyledTheme {
  name: ThemeName;
  background: Color;
  highlight: Color;
  captionBack: Color;
}

/** Writes relations' names in bold, as the painter writes them, on the caption's back. */
export type BoldLabels = (lines: readonly RelationLine[]) => Container[];

/** A line drawn in its own style, and what flows along it. */
interface Styled {
  line: RelationLine;
  drawn: RelationLine;
  directed: boolean;
  bounds: Rect;
}

/**
 * What is drawn in its own style (ADR 0100), in one container: the shadows, the borders, the lines
 * and their arrowheads, what flows along them, and the names. `show` draws it again; `frame` moves
 * what flows and what breathes, and says whether it wants another frame.
 */
export class StyledMarks {
  readonly container = new Container();
  private readonly lifts = new Graphics();
  private readonly borders = new Graphics();
  private readonly lines = new Graphics();
  private readonly flows = new Graphics();
  private readonly labels = new Container();
  private styled: Styled[] = [];
  private shapes: { target: MarkTarget; color: Color }[] = [];
  private scale = 1;
  private theme: StyledTheme | undefined;
  private moves = false;
  /** The shapes shown last, by key, and when the ones breathing came in. */
  private shown = new Set<string>();
  private breathing: number | undefined;

  constructor() {
    this.container.addChild(this.lifts, this.borders, this.lines, this.flows, this.labels);
  }

  /**
   * Draws what is lit in its own style, at this scale, in this theme; `moves` lets its lines flow,
   * and with `breathes` too, the shapes that come in breathe once. `now` is when, in milliseconds.
   */
  show(
    lit: Lit,
    scale: number,
    theme: StyledTheme,
    options: { moves: boolean; now: number; breathes?: boolean; labels?: BoldLabels },
  ): void {
    this.scale = scale;
    this.theme = theme;
    this.moves = options.moves;
    const shapes = lit.shapes.some(isAnchoredSolidPart)
      ? lit.shapes.filter((shape) => !isAnchoredSolidPart(shape))
      : lit.shapes;
    const keys = new Set(shapes.map((shape) => shape.key));
    const coming = shapes.some((shape) => !this.shown.has(shape.key));
    this.shown = keys;
    if (options.moves && options.breathes === true && coming) this.breathing = options.now;
    else if (!options.moves) this.breathing = undefined;
    this.shapes = [
      ...shapes.map((shape) => ({
        target: markTargetOf(shape),
        color: styledBorderColor(shape, theme),
      })),
      ...lit.notes.map((note: NoteShape) => ({ target: note.rect, color: theme.highlight })),
    ];
    this.styled = [
      ...lit.lines.map((line) => this.styledOf(line, line.arrowhead !== undefined)),
      ...lit.arrows.map((arrow) => this.styledOf(arrowLine(arrow), true)),
    ];
    this.drawLifts();
    this.drawBorders(0);
    this.drawLines();
    this.drawLabels(lit.lines, options.labels);
    this.drawFlows(options.now, undefined);
  }

  /** Takes everything away. */
  clear(): void {
    this.styled = [];
    this.shapes = [];
    this.shown = new Set();
    this.breathing = undefined;
    this.lifts.clear();
    this.borders.clear();
    this.lines.clear();
    this.flows.clear();
    for (const label of this.labels.removeChildren()) label.destroy({ children: true });
  }

  /** Whether it draws anything. */
  get drawsAnything(): boolean {
    return this.styled.length + this.shapes.length > 0;
  }

  /**
   * Moves what flows along the lines on `shown`, and the border of what breathes, at `now`; says
   * whether it wants another frame.
   */
  frame(now: number, shown: Rect): boolean {
    let more = false;
    if (this.breathing !== undefined) {
      const elapsed = now - this.breathing;
      if (elapsed >= BREATH_TIME) {
        this.breathing = undefined;
        this.drawBorders(0);
      } else {
        this.drawBorders(breathAt(elapsed));
        more = true;
      }
    }
    if (this.moves && this.styled.length > 0) {
      more = this.drawFlows(now, shown) || more;
    }
    return more;
  }

  /** The lines it draws now, as drawn: for the tests. */
  get drawnLines(): readonly RelationLine[] {
    return this.styled.map((each) => each.drawn);
  }

  /** The names it writes now: for the tests. */
  get labelsWritten(): number {
    return this.labels.children.length;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private styledOf(line: RelationLine, directed: boolean): Styled {
    const color = this.theme?.highlight ?? line.stroke;
    const drawn = styledLineOf(line, this.scale, color);
    const points = [...line.route];
    if (line.arrowhead) points.push(line.arrowhead.left, line.arrowhead.right);
    const bounds = boundsOf([], points) ?? { x: 0, y: 0, width: 0, height: 0 };
    return { line, drawn, directed, bounds };
  }

  private drawLifts(): void {
    const graphics = this.lifts;
    startOnScreen(graphics, this.scale);
    if (this.shapes.length === 0) return;
    const dark = this.theme?.name === 'dark';
    for (const { width, alpha } of LIFT) {
      for (const { target } of this.shapes) traceMark(graphics, target, width / 2 / this.scale);
      graphics.stroke({
        color: '#000000',
        alpha: Math.min(0.6, alpha * (dark ? LIFT_DARK : 1)),
        width: width / MARK_UNIT,
        join: 'round',
      });
    }
  }

  private drawBorders(breath: number): void {
    const graphics = this.borders;
    startOnScreen(graphics, this.scale);
    const width = (STYLED_BORDER + BREATH_WIDER * breath) / MARK_UNIT;
    const byColor = new Map<Color, MarkTarget[]>();
    for (const { target, color } of this.shapes) {
      const same = byColor.get(color);
      if (same) same.push(target);
      else byColor.set(color, [target]);
    }
    for (const [color, targets] of byColor) {
      for (const target of targets) traceMark(graphics, target, 0);
      graphics.stroke({ color, width, join: 'round' });
    }
  }

  /** The lines in their style: whole, but for a dashed one that flows, whose arrowhead alone stays. */
  private drawLines(): void {
    const graphics = this.lines;
    graphics.clear();
    for (const { drawn } of this.styled) {
      const flowsItself = this.moves && drawn.dash !== 'solid';
      strokeStyledRoute(graphics, drawn, { route: !flowsItself });
    }
  }

  /**
   * Traces what flows along the lines at `now`: a dashed line's own dashes, moved along it, and a
   * dash of the caption's color along a solid one; only the lines on `shown`, when given. Without
   * motion, a dashed line's dashes where they stand. Says whether any line flowed.
   */
  private drawFlows(now: number, shown: Rect | undefined): boolean {
    const graphics = this.flows;
    graphics.clear();
    const theme = this.theme;
    if (!theme) return false;
    let flowed = false;
    // Counted from one clock, so that a line handed from what arrives to what shows flows on.
    const elapsed = now;
    for (const { drawn, directed, bounds } of this.styled) {
      if (!this.moves) continue;
      if (shown && !overlaps(bounds, shown)) continue;
      const own = drawn.dash !== 'solid';
      const dash = own ? (drawn.dash as Exclude<Dash, 'solid'>) : 'dashed';
      const width = own ? drawn.width : drawn.width * FLOW_DASH.part;
      const offset = flowOffset(elapsed, width, dash);
      const route = own ? untilArrowhead(drawn.route, drawn.arrowhead) : drawn.route;
      for (const piece of flowPieces(route, directed)) {
        strokeFlowing(
          graphics,
          piece,
          own
            ? { color: drawn.stroke, width, dash }
            : { color: theme.captionBack, width, dash, alpha: FLOW_DASH.alpha },
          offset,
        );
      }
      flowed = true;
    }
    return flowed;
  }

  private drawLabels(lines: readonly RelationLine[], write: BoldLabels | undefined): void {
    for (const label of this.labels.removeChildren()) label.destroy({ children: true });
    const theme = this.theme;
    if (!write || !theme) return;
    const named = lines.filter((line) => line.label !== undefined && line.countBadge !== true);
    if (named.length === 0) return;
    const backs = new Graphics();
    this.labels.addChild(backs);
    const border = LABEL_BORDER / this.scale;
    for (const label of write(named)) {
      const width = label.width;
      const height = label.height;
      if (width > 0 && height > 0) {
        const pad = LABEL_PADDING;
        backs
          .roundRect(
            label.x - width / 2 - pad,
            label.y - height / 2 - pad,
            width + 2 * pad,
            height + 2 * pad,
            Math.min(height / 2 + pad, 6),
          )
          .fill(theme.captionBack)
          .stroke({ color: theme.highlight, width: border });
      }
      this.labels.addChild(label);
    }
  }
}

/** A free arrow, as a line drawn from its start to its tip. */
function arrowLine(arrow: ArrowShape): RelationLine {
  return {
    relation: arrow.id,
    route: [arrow.from, arrow.to],
    from: arrow.from,
    to: arrow.to,
    middle: { x: (arrow.from.x + arrow.to.x) / 2, y: (arrow.from.y + arrow.to.y) / 2 },
    arrowhead: arrow.arrowhead,
    stroke: arrow.stroke ?? '#000000',
    width: 2,
    dash: 'solid',
  };
}
