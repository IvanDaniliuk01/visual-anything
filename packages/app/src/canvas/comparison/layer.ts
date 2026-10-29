/**
 * The marks of a comparison on the canvas (ADR 0070), drawn above the scene and under the selection:
 *
 * - **Outlines** around each marked shape and free shape, in its state's color, with a pattern that
 *   tells the state without color: added and moved solid, removed dashed, changed double.
 * - **Lines** along each marked relation: added drawn over in the state's color, removed dashed,
 *   changed as a double line along both sides of it.
 * - **Badges** with the state's glyph, `+ − ~ →`, at a shape's top right corner and a line's middle.
 * - **Moves,** in the comparison drawing: each moved shape's older place as a dashed outline, joined
 *   to the shape by a thin arrow.
 * - **Counts** on each collapsed container that hides changes, as an aggregated relation says how
 *   many relations it stands for.
 *
 * The marks keep their width on screen, as the selection's do: they are drawn again as the camera
 * zooms while they are few, and once it rests when they are many. However many there are, a frame
 * draws a few chunks of them, so that marking 10,000 shapes never holds a frame up; what it draws is
 * then one drawing for PixiJS, whatever the camera does. A theme switch draws them again in its
 * colors, chunk by chunk.
 */
import { Container, Graphics } from 'pixi.js';
import { traceMark } from '../draw';
import type { Hidden } from '../emphasize';
import { centerOf, type Point, type Rect } from '../geometry';
import type { ElementShape } from '../scene';
import type { MarkText, MarkTextMaker } from '../screenMarks';
import type { CanvasTheme } from '../../theme/themes';
import { borderPoint, isHidden, markColor, markItems, type MarkItem } from './marks';
import type { ChangeMark, ComparisonScene, MovedPlace } from './scene';

/** Up to this many marks are drawn again on every zoom; more wait for the camera to rest. */
export const MARKS_WHILE_ZOOMING = 1000;
/** How many marks one chunk draws, and how many chunks a frame draws. */
export const MARKS_PER_CHUNK = 400;
const CHUNKS_PER_FRAME = 2;
/** The sizes of the marks on screen, in pixels. */
const OUTLINE = 2;
const GAP = 4;
const DOUBLE_GAP = 3;
const BADGE_RADIUS = 7;
const GLYPH = 1.6;
const DASH = 6;
const DASH_GAP = 4;
/** The most dashes one side of an outline is cut into: beyond them the dashes grow longer. */
const MOST_DASHES = 60;
const MOVE_ARROW = 1.25;
const ARROWHEAD = 7;
const COUNT_SIZE = 11;
const COUNT_PADDING = { x: 5, y: 2 };

const NOTHING_HIDDEN: Hidden = { shapes: new Set(), relations: new Set(), free: new Set() };

/** Draws an item's marks into `graphics`, sized for the scale the canvas shows. */
export function drawMarkItem(
  graphics: Graphics,
  item: MarkItem,
  scale: number,
  theme: CanvasTheme,
): void {
  const unit = 1 / scale;
  if (item.kind === 'move') {
    drawMove(graphics, item.move, unit, theme);
    return;
  }
  const color = markColor(theme, item.mark);
  const width = OUTLINE * unit;
  switch (item.kind) {
    case 'shape':
    case 'note': {
      const target = item.kind === 'shape' ? item.shape : item.note.rect;
      const rect = item.kind === 'shape' ? (item.shape.plate ?? item.shape.rect) : item.note.rect;
      outline(graphics, target, rect, item.mark, unit, color);
      badge(graphics, { x: rect.x + rect.width, y: rect.y }, item.mark, unit, color, theme);
      return;
    }
    case 'line': {
      const { line } = item;
      along(graphics, line.route, item.mark, line.width, unit, color);
      badge(graphics, line.middle, item.mark, unit, color, theme);
      return;
    }
    case 'arrow': {
      const { arrow } = item;
      along(graphics, [arrow.from, arrow.to], item.mark, width, unit, color);
      badge(graphics, centerOf(boxOf(arrow.from, arrow.to)), item.mark, unit, color, theme);
    }
  }
}

/** A shape's or a note's outline: solid, dashed for what was removed, double for what changed. */
function outline(
  graphics: Graphics,
  target: Parameters<typeof traceMark>[1],
  rect: Rect,
  mark: ChangeMark,
  unit: number,
  color: string,
): void {
  const width = OUTLINE * unit;
  const gap = GAP * unit;
  if (mark === 'removed') {
    dashedBox(graphics, grown(rect, gap), unit);
    graphics.stroke({ color, width, cap: 'butt' });
    return;
  }
  traceMark(graphics, target, gap);
  if (mark === 'changed') traceMark(graphics, target, gap + DOUBLE_GAP * unit);
  graphics.stroke({ color, width, join: 'miter' });
}

/** Marks along a route: over it, dashed for what was removed, a double line beside it for what changed. */
function along(
  graphics: Graphics,
  route: readonly Point[],
  mark: ChangeMark,
  lineWidth: number,
  unit: number,
  color: string,
): void {
  const width = OUTLINE * unit;
  if (route.length < 2) return;
  if (mark === 'changed') {
    const away = lineWidth / 2 + DOUBLE_GAP * unit;
    for (const side of [1, -1]) traceOffset(graphics, route, side * away);
    graphics.stroke({ color, width: width * 0.75, cap: 'butt', join: 'round' });
    return;
  }
  if (mark === 'removed') {
    for (let at = 1; at < route.length; at++) {
      dashedSegment(graphics, route[at - 1] as Point, route[at] as Point, unit);
    }
    graphics.stroke({ color, width: lineWidth + width, cap: 'butt' });
    return;
  }
  graphics.moveTo(route[0]?.x ?? 0, route[0]?.y ?? 0);
  for (const point of route.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.stroke({ color, width: lineWidth + width, cap: 'round', join: 'round', alpha: 0.75 });
}

/** The route moved `by` to its left, segment by segment. */
function traceOffset(graphics: Graphics, route: readonly Point[], by: number): void {
  for (let at = 1; at < route.length; at++) {
    const from = route[at - 1] as Point;
    const to = route[at] as Point;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;
    const nx = (-(to.y - from.y) / length) * by;
    const ny = ((to.x - from.x) / length) * by;
    graphics.moveTo(from.x + nx, from.y + ny).lineTo(to.x + nx, to.y + ny);
  }
}

/** Traces a box as dashes, a few dozen at most along each side. */
function dashedBox(graphics: Graphics, rect: Rect, unit: number): void {
  const { x, y, width, height } = rect;
  const corners: Point[] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  for (let at = 0; at < 4; at++) {
    dashedSegment(graphics, corners[at] as Point, corners[(at + 1) % 4] as Point, unit);
  }
}

/** Traces a segment as dashes, longer ones on a long segment. */
function dashedSegment(graphics: Graphics, from: Point, to: Point, unit: number): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return;
  const period = Math.max((DASH + DASH_GAP) * unit, length / MOST_DASHES);
  const on = (period * DASH) / (DASH + DASH_GAP);
  const dx = (to.x - from.x) / length;
  const dy = (to.y - from.y) / length;
  for (let start = 0; start < length; start += period) {
    const end = Math.min(length, start + on);
    graphics.moveTo(from.x + dx * start, from.y + dy * start);
    graphics.lineTo(from.x + dx * end, from.y + dy * end);
  }
}

/** A badge with a state's glyph, on a halo of the canvas's color. */
function badge(
  graphics: Graphics,
  at: Point,
  mark: ChangeMark,
  unit: number,
  color: string,
  theme: CanvasTheme,
): void {
  const radius = BADGE_RADIUS * unit;
  graphics.circle(at.x, at.y, radius).fill(color).stroke({
    color: theme.background,
    width: 1.5 * unit,
  });
  glyph(graphics, at, mark, radius);
  graphics.stroke({ color: theme.background, width: GLYPH * unit, cap: 'round', join: 'round' });
}

/** Traces a state's glyph inside a badge of this radius: `+`, `−`, `~` or `→`. */
export function glyph(graphics: Graphics, at: Point, mark: ChangeMark, radius: number): void {
  const half = radius * 0.5;
  const { x, y } = at;
  switch (mark) {
    case 'added':
      graphics.moveTo(x - half, y).lineTo(x + half, y);
      graphics.moveTo(x, y - half).lineTo(x, y + half);
      return;
    case 'removed':
      graphics.moveTo(x - half, y).lineTo(x + half, y);
      return;
    case 'changed':
      graphics
        .moveTo(x - half * 1.1, y + half * 0.2)
        .quadraticCurveTo(x - half * 0.55, y - half * 0.7, x, y)
        .quadraticCurveTo(x + half * 0.55, y + half * 0.7, x + half * 1.1, y - half * 0.2);
      return;
    case 'moved':
      graphics.moveTo(x - half, y).lineTo(x + half, y);
      graphics.moveTo(x + half * 0.2, y - half * 0.6).lineTo(x + half, y);
      graphics.lineTo(x + half * 0.2, y + half * 0.6);
  }
}

/** A moved shape's older place, dashed, and a thin arrow from it to where the shape is now. */
function drawMove(graphics: Graphics, move: MovedPlace, unit: number, theme: CanvasTheme): void {
  const color = theme.changeMoved;
  if (move.line) dashedSegment(graphics, move.line[0], move.line[1], unit);
  else dashedBox(graphics, move.was, unit);
  graphics.stroke({ color, width: OUTLINE * unit * 0.75, cap: 'butt' });
  const from = centerOf(move.was);
  const to = centerOf(move.is);
  const start = move.line ? from : borderPoint(move.was, from, to);
  const end = borderPoint(move.is, to, from);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < ARROWHEAD * unit) return;
  const dx = (end.x - start.x) / length;
  const dy = (end.y - start.y) / length;
  const head = ARROWHEAD * unit;
  graphics.moveTo(start.x, start.y).lineTo(end.x - dx * head * 0.5, end.y - dy * head * 0.5);
  graphics.stroke({ color, width: MOVE_ARROW * unit, cap: 'butt' });
  graphics
    .poly([
      end.x,
      end.y,
      end.x - dx * head - dy * head * 0.5,
      end.y - dy * head + dx * head * 0.5,
      end.x - dx * head + dy * head * 0.5,
      end.y - dy * head - dx * head * 0.5,
    ])
    .fill(color);
}

function grown(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

function boxOf(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** A count written on a collapsed container, on a pill of the changed mark's color. */
interface CountLabel {
  key: string;
  at: Point;
  count: number;
  text: MarkText | undefined;
}

/** The comparison's marks, as the renderer draws them above its scene. */
export class ComparisonLayer {
  /** Added to the scene's world after relations and free shapes, under the selection's marks. */
  readonly container = new Container({ label: 'comparison', isRenderGroup: true });
  private readonly chunks: Graphics[] = [];
  private readonly pills = new Graphics();
  private readonly labels = new Container({ label: 'comparison counts' });
  private used = 0;
  private items: MarkItem[] = [];
  private shownItems: MarkItem[] = [];
  private drawn = 0;
  private counts: CountLabel[] = [];
  private shown: ComparisonScene | undefined;
  private hidden: Hidden = NOTHING_HIDDEN;
  private scale = 1;
  /** Whether the marks wait to be drawn again for the scale or the theme shown now. */
  private stale = false;

  constructor(
    private readonly makeText: MarkTextMaker,
    private readonly needsFrame: () => void,
    private theme: CanvasTheme,
  ) {
    this.container.addChild(this.pills, this.labels);
  }

  /** How many things the layer marks: shapes, lines, free shapes and moves. */
  get size(): number {
    return this.items.length;
  }

  /** Whether chunks are left to draw, which the next frames draw. */
  get pending(): boolean {
    return this.drawn < this.shownItems.length;
  }

  /** The texts written on collapsed containers, for tests and the benchmark. */
  get countTexts(): string[] {
    return this.counts.map((count) => String(count.count));
  }

  /** Marks this comparison's scene from now on, or nothing. */
  set(shown: ComparisonScene | undefined): void {
    if (shown === this.shown) return;
    this.shown = shown;
    this.items = shown ? markItems(shown) : [];
    this.placeCounts();
    this.redraw();
  }

  /** Leaves out the marks of what the emphasis hides, as filters hide it. */
  setHidden(hidden: Hidden): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (this.items.length > 0) this.redraw();
  }

  /** Draws in a theme's colors from now on. */
  setTheme(theme: CanvasTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.items.length > 0 || this.counts.length > 0) this.redraw();
  }

  /** Keeps the marks' width on screen at a scale: at once while they are few, or once at rest. */
  setScale(scale: number, resting: boolean): void {
    const changed = scale !== this.scale;
    this.scale = scale;
    this.fitCounts();
    if (!changed && !(resting && this.stale)) return;
    if (resting || this.items.length <= MARKS_WHILE_ZOOMING) this.redraw();
    else this.stale = true;
  }

  /** Draws the next chunks; says whether chunks are left, which ask for another frame. */
  frame(): boolean {
    const until = Math.min(this.shownItems.length, this.drawn + MARKS_PER_CHUNK * CHUNKS_PER_FRAME);
    while (this.drawn < until) {
      let chunk = this.chunks[this.used];
      if (!chunk) {
        chunk = new Graphics();
        this.chunks.push(chunk);
        this.container.addChildAt(chunk, this.chunks.length - 1);
      }
      const end = Math.min(until, this.drawn + MARKS_PER_CHUNK);
      for (let at = this.drawn; at < end; at++) {
        drawMarkItem(chunk, this.shownItems[at] as MarkItem, this.scale, this.theme);
      }
      this.drawn = end;
      this.used += 1;
    }
    if (this.pending) this.needsFrame();
    return this.pending;
  }

  destroy(): void {
    for (const label of this.labels.removeChildren()) label.destroy();
    this.container.destroy({ children: true });
  }

  private redraw(): void {
    this.stale = false;
    for (const chunk of this.chunks.slice(0, this.used)) chunk.clear();
    this.used = 0;
    this.drawn = 0;
    const hidden = this.hidden;
    this.shownItems =
      hidden.shapes.size + hidden.relations.size + hidden.free.size === 0
        ? this.items
        : this.items.filter((item) => !isHidden(item, hidden));
    this.drawPills();
    this.frame();
    this.needsFrame();
  }

  /** The counts on the collapsed containers that hide changes, at their top left corners. */
  private placeCounts(): void {
    for (const label of this.labels.removeChildren()) label.destroy();
    const shown = this.shown;
    this.counts = [];
    if (!shown || shown.hidden.size === 0) return;
    const byKey = new Map<string, ElementShape>(shown.scene.shapes.map((shape) => [shape.key, shape]));
    for (const [key, count] of shown.hidden) {
      const shape = byKey.get(key);
      if (!shape) continue;
      const text = this.makeText();
      if (text) {
        text.text = String(count);
        this.labels.addChild(text);
      }
      this.counts.push({ key, at: { x: shape.rect.x, y: shape.rect.y }, count, text });
    }
    this.fitCounts();
  }

  /** Writes the counts at their size on screen, in the canvas's color on the changed mark's. */
  private fitCounts(): void {
    const unit = 1 / this.scale;
    for (const count of this.counts) {
      const text = count.text;
      if (!text) continue;
      text.scale.set((unit * COUNT_SIZE) / 11);
      text.tint = this.theme.background;
      text.position.set(count.at.x + COUNT_PADDING.x * unit, count.at.y - (COUNT_SIZE + COUNT_PADDING.y * 2) * unit / 2);
    }
    this.drawPills();
  }

  private drawPills(): void {
    const pills = this.pills;
    pills.clear();
    if (this.counts.length === 0) return;
    const unit = 1 / this.scale;
    const color = this.theme.changeChanged;
    const hidden = this.hidden.shapes;
    for (const count of this.counts) {
      if (hidden.has(count.key)) continue;
      const height = (COUNT_SIZE + COUNT_PADDING.y * 2) * unit;
      const width = Math.max(height, (String(count.count).length * COUNT_SIZE * 0.62 + COUNT_PADDING.x * 2) * unit);
      pills.roundRect(count.at.x, count.at.y - height / 2, width, height, height / 2);
    }
    pills.fill(color).stroke({ color: this.theme.background, width: 1.5 * unit });
  }
}
