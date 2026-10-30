/**
 * What package code draws inside shapes (ADR 0054), drawn by the canvas from the declarative drawings
 * its `draw` hook answered: the code never touches the canvas. Each drawing is fitted, keeping its
 * proportions, where its shape's face places `<drawing/>` (ADR 0083), or else in the lower part of its
 * shape, under the name; shapes that hold other shapes or draw rows draw none, and neither do rows.
 *
 * Drawings are drawn above the shapes and under the relations, in cells of the canvas that show only
 * while they are on screen, and only from the scale names show at: only what is on screen is built, a
 * few milliseconds at a time. A new set of drawings rebuilds only the shapes whose drawing or place
 * changed.
 */
import type { Drawing, DrawingItem } from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import { Container, Graphics } from 'pixi.js';
import type { Camera } from './camera';
import { DIMMED_ALPHA } from './colors';
import type { TextFactory } from './draw';
import { faceRect, shapeFaceDrawing } from './faces';
import type { Rect, Size } from './geometry';
import type { ElementShape, Scene } from './scene';

/** The side of a cell of the canvas, in canvas units: a cell shows while any of it is on screen. */
const CELL = 2048;
/** How far inside its shape a drawing keeps, in canvas units. */
const INSET = 6;
/** The smallest box a drawing is drawn in, either way, in canvas units. */
const SMALLEST = 12;

/**
 * Where a shape draws what its package's code drew: where its face places `<drawing/>`, inset as
 * any drawing is, or else under its name; undefined for a shape that draws none, or whose face leaves
 * its drawing too little room.
 */
export function drawingArea(shape: ElementShape): Rect | undefined {
  if (shape.row !== undefined || shape.rowCount !== undefined || shape.plate !== undefined) {
    return undefined;
  }
  if (shape.holdsContents && shape.collapsed === undefined) return undefined;
  const region =
    shape.face && shapeFaceDrawing(shape)?.regions.find((each) => each.kind === 'drawing');
  if (region) {
    const at = faceRect(shape);
    const placed = {
      x: at.x + region.x + INSET,
      y: at.y + region.y + INSET,
      width: region.width - 2 * INSET,
      height: region.height - 2 * INSET,
    };
    return placed.width >= SMALLEST && placed.height >= SMALLEST ? placed : undefined;
  }
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

/** One shape's drawing: what it is drawn from, and what draws it once it is built. */
interface Entry {
  drawing: Drawing;
  shape: ElementShape;
  area: Rect;
  dimmed: boolean;
  dark: boolean;
  cell: string;
  /** Built only once its cell is on screen. */
  container?: Container;
}

/** How long one turn of building drawings may take, in milliseconds. */
const BUILD_MS = 6;

/** What the layer needs of the clock and of the frames, which tests replace. */
export interface LayerTiming {
  now: () => number;
  /** Runs `callback` soon, for the drawings still to build. */
  later: (callback: () => void) => unknown;
  cancel: (handle: unknown) => void;
}

const BROWSER_TIMING: LayerTiming = {
  now: () => performance.now(),
  later: (callback) => setTimeout(callback, 16),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The layer of drawings above the shapes, kept by the renderer. It builds only the drawings of the
 * cells on screen, a few milliseconds at a time, so that a view of thousands of drawings never stalls
 * a frame, and tells the renderer to draw again once it built more.
 */
export class CodeDrawingLayer {
  readonly container = new Container();
  private drawings: ReadonlyMap<Id, Drawing> = new Map();
  private shapes: readonly ElementShape[] = [];
  private hidden: ReadonlySet<string> = new Set();
  private dimmed: ReadonlySet<string> = new Set();
  private dark = false;
  private readonly entries = new Map<string, Entry>();
  private readonly cells = new Map<string, Container>();
  private onScreen: ReadonlySet<string> = new Set();
  private shown = false;
  private pending: unknown;

  constructor(
    private readonly make?: TextFactory,
    private readonly built: () => void = () => {},
    private readonly timing: LayerTiming = BROWSER_TIMING,
  ) {}

  /** How many shapes draw a drawing now, built or still to build. */
  get count(): number {
    return this.entries.size;
  }

  /** How many of them are built. */
  get builtCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.container) count += 1;
    return count;
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
    this.shown = camera.scale >= from;
    this.container.visible = this.shown && this.entries.size > 0;
    if (!this.shown) return;
    const left = -camera.x / camera.scale;
    const top = -camera.y / camera.scale;
    const right = left + viewport.width / camera.scale;
    const bottom = top + viewport.height / camera.scale;
    const onScreen = new Set<string>();
    for (let column = Math.floor(left / CELL); column * CELL < right; column += 1) {
      for (let row = Math.floor(top / CELL); row * CELL < bottom; row += 1) {
        onScreen.add(`${column},${row}`);
      }
    }
    this.onScreen = onScreen;
    for (const [key, cell] of this.cells) cell.visible = onScreen.has(key);
    this.build();
  }

  destroy(): void {
    if (this.pending !== undefined) this.timing.cancel(this.pending);
    this.pending = undefined;
    this.entries.clear();
    this.cells.clear();
    this.container.destroy({ children: true });
  }

  /** Works out what each shape draws, keeping what did not change; builds what is on screen. */
  private update(): void {
    const wanted = new Set<string>();
    for (const shape of this.shapes) {
      const drawing = this.drawings.get(shape.element);
      if (!drawing || this.hidden.has(shape.key)) continue;
      const area = drawingArea(shape);
      if (!area) continue;
      wanted.add(shape.key);
      const dimmed = this.dimmed.has(shape.key);
      const before = this.entries.get(shape.key);
      if (
        before &&
        before.drawing === drawing &&
        sameRect(before.shape.rect, shape.rect) &&
        sameRect(before.area, area) &&
        before.dark === this.dark
      ) {
        if (before.dimmed !== dimmed) {
          before.dimmed = dimmed;
          if (before.container) before.container.alpha = dimmed ? DIMMED_ALPHA : 1;
        }
        before.shape = shape;
        continue;
      }
      if (before) this.unbuild(before);
      this.entries.set(shape.key, {
        drawing,
        shape,
        area,
        dimmed,
        dark: this.dark,
        cell: `${Math.floor(area.x / CELL)},${Math.floor(area.y / CELL)}`,
      });
    }
    for (const [key, entry] of [...this.entries]) {
      if (wanted.has(key)) continue;
      this.unbuild(entry);
      this.entries.delete(key);
    }
    this.container.visible = this.shown && this.entries.size > 0;
    this.build();
  }

  /** Builds the drawings of the cells on screen for a few milliseconds, and the rest a turn later. */
  private build(): void {
    if (!this.shown) return;
    const started = this.timing.now();
    let made = 0;
    let left = false;
    for (const entry of this.entries.values()) {
      if (entry.container || !this.onScreen.has(entry.cell)) continue;
      if (made > 0 && this.timing.now() - started > BUILD_MS) {
        left = true;
        break;
      }
      this.buildEntry(entry);
      made += 1;
    }
    if (made > 0) this.built();
    if (left && this.pending === undefined) {
      this.pending = this.timing.later(() => {
        this.pending = undefined;
        this.build();
      });
    }
  }

  private buildEntry(entry: Entry): void {
    const { shape } = entry;
    const ink = this.dark ? (shape.dark?.stroke ?? shape.stroke) : shape.stroke;
    const container = new Container();
    const graphics = new Graphics();
    const texts = paintDrawing(graphics, entry.drawing, entry.area, ink, this.make);
    container.addChild(graphics, ...texts);
    container.alpha = entry.dimmed ? DIMMED_ALPHA : 1;
    this.cellOf(entry.cell).addChild(container);
    entry.container = container;
  }

  private unbuild(entry: Entry): void {
    if (!entry.container) return;
    entry.container.destroy({ children: true });
    entry.container = undefined;
    const cell = this.cells.get(entry.cell);
    if (cell && cell.children.length === 0) {
      cell.destroy();
      this.cells.delete(entry.cell);
    }
  }

  private cellOf(key: string): Container {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Container();
      cell.visible = this.onScreen.has(key);
      this.cells.set(key, cell);
      this.container.addChild(cell);
    }
    return cell;
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
