/**
 * What package code draws inside shapes (ADR 0054), drawn by the canvas from the declarative drawings
 * its `draw` hook answered: the code never touches the canvas. Each drawing is fitted, keeping its
 * proportions, in the lower part of its shape, under the name; shapes that hold other shapes or draw
 * rows draw none, and neither do rows.
 *
 * Drawings are drawn above the shapes and under the relations, in cells of the canvas that show only
 * while they are on screen, and only from the scale names show at. A new set of drawings rebuilds
 * only the shapes whose drawing or place changed.
 */
import type { Drawing, DrawingItem } from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import { Container, Graphics } from 'pixi.js';
import type { Camera } from './camera';
import { DIMMED_ALPHA } from './colors';
import type { TextFactory } from './draw';
import type { Rect, Size } from './geometry';
import type { ElementShape, Scene } from './scene';

/** The side of a cell of the canvas, in canvas units: a cell shows while any of it is on screen. */
const CELL = 2048;
/** How far inside its shape a drawing keeps, in canvas units. */
const INSET = 6;
/** The smallest box a drawing is drawn in, either way, in canvas units. */
const SMALLEST = 12;

/** Where a shape draws what its package's code drew; undefined for a shape that draws none. */
export function drawingArea(shape: ElementShape): Rect | undefined {
  if (shape.row !== undefined || shape.rowCount !== undefined || shape.plate !== undefined) {
    return undefined;
  }
  if (shape.holdsContents && shape.collapsed === undefined) return undefined;
  const { x, y, width, height } = shape.rect;
  // Under the name, which a shape writes across its middle.
  const top = y + height / 2 + 4;
  const area = {
    x: x + INSET,
    y: top,
    width: width - 2 * INSET,
    height: y + height - INSET - top,
  };
  return area.width >= SMALLEST && area.height >= SMALLEST ? area : undefined;
}

/** Where a drawing's box lands in an area: as large as fits, keeping its proportions, centered. */
export function fitted(drawing: Drawing, area: Rect): { x: number; y: number; scale: number } {
  const scale = Math.min(area.width / drawing.width, area.height / drawing.height);
  return {
    x: area.x + (area.width - drawing.width * scale) / 2,
    y: area.y + (area.height - drawing.height * scale) / 2,
    scale,
  };
}

/**
 * Paints a drawing's shapes, lines and arcs in `graphics`, fitted in `area`, and gives back its texts
 * as `make` writes them; `ink` is the color of whatever sets none. An image is drawn as its outline.
 */
export function paintDrawing(
  graphics: Graphics,
  drawing: Drawing,
  area: Rect,
  ink: Color,
  make?: TextFactory,
): Container[] {
  const at = fitted(drawing, area);
  const X = (x: number) => at.x + x * at.scale;
  const Y = (y: number) => at.y + y * at.scale;
  const width = (item: { strokeWidth?: number }) => (item.strokeWidth ?? 1) * at.scale;
  const texts: Container[] = [];
  for (const item of drawing.items) {
    paintItem(graphics, item, { X, Y, scale: at.scale, width, ink });
    if (item.kind === 'text' && make) {
      const size = (item.size ?? 12) * at.scale;
      const text = make(
        {
          text: item.text,
          x: X(item.x),
          y: Y(item.y),
          anchor: { x: item.align === 'end' ? 1 : item.align === 'middle' ? 0.5 : 0, y: 1 },
          style: { fontSize: size, fill: item.fill ?? ink },
        },
        'detail',
      );
      if (text) texts.push(text);
    }
  }
  return texts;
}

interface Place {
  X: (x: number) => number;
  Y: (y: number) => number;
  scale: number;
  width: (item: { strokeWidth?: number }) => number;
  ink: Color;
}

function paintItem(graphics: Graphics, item: DrawingItem, place: Place): void {
  const { X, Y, scale, width, ink } = place;
  switch (item.kind) {
    case 'rectangle':
    case 'rounded-rectangle':
    case 'ellipse': {
      const x = X(item.x);
      const y = Y(item.y);
      const w = item.width * scale;
      const h = item.height * scale;
      if (item.kind === 'rectangle') graphics.rect(x, y, w, h);
      else if (item.kind === 'ellipse') graphics.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
      else graphics.roundRect(x, y, w, h, Math.min(w, h) * 0.2);
      if (item.fill !== undefined) graphics.fill({ color: item.fill });
      if (item.stroke !== undefined || item.fill === undefined) {
        graphics.stroke({ color: item.stroke ?? ink, width: width(item) });
      }
      return;
    }
    case 'line': {
      const [first, ...rest] = item.points;
      if (!first) return;
      graphics.moveTo(X(first.x), Y(first.y));
      for (const point of rest) graphics.lineTo(X(point.x), Y(point.y));
      graphics.stroke({ color: item.stroke ?? ink, width: width(item) });
      return;
    }
    case 'arc': {
      const radius = item.radius * scale;
      const from = (item.from * Math.PI) / 180;
      const to = (item.to * Math.PI) / 180;
      const cx = X(item.x);
      const cy = Y(item.y);
      graphics.moveTo(cx + radius * Math.cos(from), cy + radius * Math.sin(from));
      graphics.arc(cx, cy, radius, from, to);
      graphics.stroke({ color: item.stroke ?? ink, width: width(item) });
      return;
    }
    case 'image':
      // An image's outline, as the canvas shows a picture it has not drawn yet.
      graphics.rect(X(item.x), Y(item.y), item.width * scale, item.height * scale);
      graphics.stroke({ color: ink, width: scale, alpha: 0.5 });
      return;
    case 'text':
      return;
  }
}

interface Drawn {
  drawing: Drawing;
  rect: Rect;
  dimmed: boolean;
  dark: boolean;
  cell: string;
  container: Container;
}

/** The layer of drawings above the shapes, kept by the renderer. */
export class CodeDrawingLayer {
  readonly container = new Container();
  private drawings: ReadonlyMap<Id, Drawing> = new Map();
  private shapes: readonly ElementShape[] = [];
  private hidden: ReadonlySet<string> = new Set();
  private dimmed: ReadonlySet<string> = new Set();
  private dark = false;
  private readonly drawn = new Map<string, Drawn>();
  private readonly cells = new Map<string, Container>();
  private shownFrom = 0;

  constructor(private readonly make?: TextFactory) {}

  /** How many shapes draw a drawing now. */
  get count(): number {
    return this.drawn.size;
  }

  /** Draws these drawings, by element, from now on. */
  setDrawings(drawings: ReadonlyMap<Id, Drawing>): void {
    if (drawings === this.drawings) return;
    this.drawings = drawings;
    this.update();
  }

  /** Draws in the shapes of this scene, leaving out what the emphasis hides and drawing faintly what it dims. */
  setScene(
    scene: Scene | undefined,
    hidden: ReadonlySet<string>,
    dimmed: ReadonlySet<string>,
  ): void {
    const shapes = scene?.shapes ?? [];
    if (shapes === this.shapes && hidden === this.hidden && dimmed === this.dimmed) return;
    this.shapes = shapes;
    this.hidden = hidden;
    this.dimmed = dimmed;
    this.update();
  }

  /** Draws in the dark theme's shades of the shapes' strokes, or the light theme's. */
  setDark(dark: boolean): void {
    if (dark === this.dark) return;
    this.dark = dark;
    this.update();
  }

  /** Shows only the cells on screen, and nothing below `from`, the scale names show at. */
  setCamera(camera: Camera, viewport: Size, from: number): void {
    this.shownFrom = from;
    this.container.visible = camera.scale >= from && this.drawn.size > 0;
    if (!this.container.visible) return;
    const left = -camera.x / camera.scale;
    const top = -camera.y / camera.scale;
    const right = left + viewport.width / camera.scale;
    const bottom = top + viewport.height / camera.scale;
    for (const [key, cell] of this.cells) {
      const [column = 0, row = 0] = key.split(',').map(Number);
      const x = column * CELL;
      const y = row * CELL;
      cell.visible = x < right && x + CELL > left && y < bottom && y + CELL > top;
    }
  }

  /** The scale the layer shows from, as last set. */
  get from(): number {
    return this.shownFrom;
  }

  destroy(): void {
    for (const each of this.drawn.values()) each.container.destroy({ children: true });
    this.drawn.clear();
    this.container.destroy({ children: true });
  }

  /** Builds again only what changed: a drawing, a place, the dimming or the theme. */
  private update(): void {
    const wanted = new Set<string>();
    for (const shape of this.shapes) {
      const drawing = this.drawings.get(shape.element);
      if (!drawing || this.hidden.has(shape.key)) continue;
      const area = drawingArea(shape);
      if (!area) continue;
      wanted.add(shape.key);
      const dimmed = this.dimmed.has(shape.key);
      const before = this.drawn.get(shape.key);
      if (
        before &&
        before.drawing === drawing &&
        sameRect(before.rect, shape.rect) &&
        before.dark === this.dark
      ) {
        if (before.dimmed !== dimmed) {
          before.container.alpha = dimmed ? DIMMED_ALPHA : 1;
          before.dimmed = dimmed;
        }
        continue;
      }
      if (before) this.remove(shape.key, before);
      const ink = this.dark ? (shape.dark?.stroke ?? shape.stroke) : shape.stroke;
      const container = new Container();
      const graphics = new Graphics();
      const texts = paintDrawing(graphics, drawing, area, ink, this.make);
      container.addChild(graphics, ...texts);
      container.alpha = dimmed ? DIMMED_ALPHA : 1;
      const cell = `${Math.floor(area.x / CELL)},${Math.floor(area.y / CELL)}`;
      this.cellOf(cell).addChild(container);
      this.drawn.set(shape.key, {
        drawing,
        rect: shape.rect,
        dimmed,
        dark: this.dark,
        cell,
        container,
      });
    }
    for (const [key, drawn] of [...this.drawn]) if (!wanted.has(key)) this.remove(key, drawn);
    this.container.visible = this.drawn.size > 0;
  }

  private remove(key: string, drawn: Drawn): void {
    drawn.container.destroy({ children: true });
    this.drawn.delete(key);
    const cell = this.cells.get(drawn.cell);
    if (cell && cell.children.length === 0) {
      cell.destroy();
      this.cells.delete(drawn.cell);
    }
  }

  private cellOf(key: string): Container {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Container();
      this.cells.set(key, cell);
      this.container.addChild(cell);
    }
    return cell;
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
