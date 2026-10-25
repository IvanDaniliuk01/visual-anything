/**
 * What the canvas draws in screen space, above the scene: the rulers along its top and left sides, in
 * canvas units, with where the selection lies; and the readout beside the pointer while shapes are
 * dragged, which says where the moving shape lands. Its labels come from a pool, so that panning only
 * moves them and changes the text of those that come on screen.
 */
import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Selection } from '../editor/selection';
import { THEMES, type CanvasTheme } from '../theme/themes';
import type { Camera } from './camera';
import type { Hidden } from './emphasize';
import type { Point, Rect, Size } from './geometry';
import type { IndexedScene } from './hit';
import { relationLinesOf } from './scene';
import { crispLine, rulerLabelPool, rulerLabels, rulerSteps, unitsText } from './grid';
import { installFonts } from './labels';

/** How wide the rulers' bands are, in CSS pixels: the `--ruler-size` token. */
export const RULER_SIZE = 20;
/** A ruler's labels are left out this close to the ends of the selection's extent, in CSS pixels. */
const CLEAR_OF_EXTENT = 24;
/** How long the rulers' ticks are: at every tick, and where a label is. */
const TICK = 4;
const LABEL_TICK = 8;
/** How far a label sits from its tick and from the band's edge. */
const LABEL_GAP = 3;
const LABEL_EDGE = 3;
/** How far the readout sits from the pointer, and the room around its text. */
const READOUT_OFFSET = { x: 16, y: -30 };
const READOUT_PADDING = { x: 6, y: 3 };
const FONT_SIZE = 11;

/** A short text the screen marks write and change: a bitmap label, or a stand-in in tests. */
export type MarkText = Container & { text: string };

/** Makes a text to write marks with, or nothing where no font can be drawn. */
export type MarkTextMaker = () => MarkText | undefined;

/** A label in the existing white detail font, tinted where it is used; none without fonts. */
export const bitmapMarkText: MarkTextMaker = () => {
  try {
    installFonts();
    return new BitmapText({
      text: '',
      style: { fontFamily: 'visual-anything-detail', fontSize: FONT_SIZE },
    });
  } catch {
    // Without fonts, the rulers have ticks and no numbers.
    return undefined;
  }
};

/** The labels shown along one ruler, by the value they write. */
type Shown = Map<number, MarkText>;

export class ScreenMarks {
  /** Added to the stage after the scene. */
  readonly container = new Container({ label: 'screenMarks', isRenderGroup: true });
  private readonly rulers = new Container({ label: 'rulers' });
  private readonly bands = new Graphics();
  private readonly extentBands = new Graphics();
  private readonly ticks = new Graphics();
  private readonly labels = new Container();
  private readonly extentMarks = new Graphics();
  private readonly extentLabels = new Container();
  private readonly corner = new Graphics();
  private readonly readout = new Container({ label: 'readout' });
  private readonly readoutBorder = new Sprite(Texture.WHITE);
  private readonly readoutBack = new Sprite(Texture.WHITE);
  private readoutText: MarkText | undefined;
  private readonly free: MarkText[] = [];
  private pooled = 0;
  private readonly across: Shown = new Map();
  private readonly down: Shown = new Map();
  private readonly ends: MarkText[] = [];
  private shown = false;
  private theme: CanvasTheme = THEMES.light.canvas;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private viewport: Size = { width: 0, height: 0 };
  private resolution = 1;
  /** The selection's bounds in canvas units, and how far a drag has moved them. */
  private extent: Rect | undefined;
  private extentDelta: Point = { x: 0, y: 0 };
  /** How many ticks the rulers drew last, for tests and the benchmark. */
  tickCount = 0;
  /** How many times the ticks and the selection's extent were drawn, for tests. */
  drawings = 0;

  constructor(private readonly makeText: MarkTextMaker = bitmapMarkText) {
    this.rulers.addChild(
      this.bands,
      this.extentBands,
      this.ticks,
      this.labels,
      this.extentMarks,
      this.extentLabels,
      this.corner,
    );
    this.rulers.visible = false;
    this.readout.addChild(this.readoutBorder, this.readoutBack);
    this.readout.visible = false;
    this.container.addChild(this.rulers, this.readout);
  }

  /** Whether the rulers show. */
  get rulersShown(): boolean {
    return this.shown;
  }

  /** How far in from the canvas's top and left the rulers leave room for shapes. */
  get inset(): { left: number; top: number } {
    return this.shown ? { left: RULER_SIZE, top: RULER_SIZE } : { left: 0, top: 0 };
  }

  /** Whether a point on screen, relative to the canvas, lies on a ruler's band. */
  contains(point: Point): boolean {
    if (!this.shown) return false;
    const { width, height } = this.viewport;
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return false;
    return point.x < RULER_SIZE || point.y < RULER_SIZE;
  }

  setRulers(shown: boolean): void {
    if (shown === this.shown) return;
    this.shown = shown;
    this.rulers.visible = shown;
    if (shown) {
      this.drawBands();
      this.drawRulers();
    }
  }

  setTheme(theme: CanvasTheme): void {
    this.theme = theme;
    for (const label of [...this.across.values(), ...this.down.values(), ...this.free]) {
      label.tint = theme.rulerText;
    }
    for (const label of this.ends) label.tint = theme.selected;
    this.tintReadout();
    if (this.shown) {
      this.drawBands();
      this.drawRulers();
    }
  }

  /** Follows the camera and the canvas's size: the ticks, the labels and the extent move with them. */
  follow(camera: Camera, viewport: Size, resolution: number): void {
    const resized =
      viewport.width !== this.viewport.width ||
      viewport.height !== this.viewport.height ||
      resolution !== this.resolution;
    this.camera = camera;
    this.viewport = viewport;
    this.resolution = resolution;
    if (!this.shown) return;
    if (resized) this.drawBands();
    this.drawRulers();
  }

  /** Marks where the selection lies, in canvas units; nothing when it is empty. */
  setExtent(extent: Rect | undefined): void {
    this.extent = extent;
    this.extentDelta = { x: 0, y: 0 };
    if (this.shown) this.drawRulers();
  }

  /** Moves the selection's marks by a drag's distance, in canvas units. */
  moveExtent(delta: Point): void {
    this.extentDelta = delta;
    if (this.shown && this.extent) this.drawRulers();
  }

  /** Shows the readout beside a point on screen, saying `text`; it stays within the canvas. */
  showReadout(text: string, at: Point): void {
    this.readoutText ??= this.makeLabel(this.readout);
    const label = this.readoutText;
    if (!label) return;
    if (label.text !== text) label.text = text;
    this.tintReadout();
    const width = label.width + 2 * READOUT_PADDING.x;
    const height = (label.height || FONT_SIZE + 2) + 2 * READOUT_PADDING.y;
    const x = clamp(at.x + READOUT_OFFSET.x, this.inset.left, this.viewport.width - width);
    const y = clamp(at.y + READOUT_OFFSET.y, this.inset.top, this.viewport.height - height);
    this.readout.position.set(Math.round(x), Math.round(y));
    this.readoutBorder.position.set(-1, -1);
    this.readoutBorder.setSize(width + 2, height + 2);
    this.readoutBack.setSize(width, height);
    label.position.set(READOUT_PADDING.x, READOUT_PADDING.y);
    this.readout.visible = true;
  }

  hideReadout(): void {
    this.readout.visible = false;
  }

  /** What the readout says while it shows. */
  get readoutShown(): string | undefined {
    return this.readout.visible ? this.readoutText?.text : undefined;
  }

  private tintReadout(): void {
    const { colors } = THEMES[this.theme.name].shell;
    this.readoutBorder.tint = this.theme.rulerBorder;
    this.readoutBack.tint = colors.surfaceRaised;
    if (this.readoutText) this.readoutText.tint = colors.text;
  }

  private makeLabel(parent: Container): MarkText | undefined {
    const label = this.makeText();
    if (label) parent.addChild(label);
    return label;
  }

  /** The bands and the corner, drawn again when the canvas is resized or the theme changes. */
  private drawBands(): void {
    const { width, height } = this.viewport;
    const { rulerBand, rulerBorder } = this.theme;
    const line = crispLine(RULER_SIZE - 0.5, this.resolution);
    this.bands
      .clear()
      .rect(0, 0, width, RULER_SIZE)
      .rect(0, 0, RULER_SIZE, height)
      .fill(rulerBand)
      .rect(0, line.start, width, line.width)
      .rect(line.start, 0, line.width, height)
      .fill(rulerBorder);
    this.corner
      .clear()
      .rect(0, 0, RULER_SIZE, RULER_SIZE)
      .fill(rulerBand)
      .rect(0, line.start, RULER_SIZE, line.width)
      .rect(line.start, 0, line.width, RULER_SIZE)
      .fill(rulerBorder);
    // Enough labels for both rulers wherever the camera is, made once for the canvas's size.
    const pool = rulerLabelPool(this.viewport);
    while (this.pooled < pool) {
      const label = this.makeLabel(this.labels);
      if (!label) break;
      label.tint = this.theme.rulerText;
      label.visible = false;
      this.free.push(label);
      this.pooled += 1;
    }
  }

  /** The ticks, the labels and the selection's extent, drawn again whenever the camera moves. */
  private drawRulers(): void {
    this.drawings += 1;
    const { camera, viewport, resolution } = this;
    const { width, height } = viewport;
    const { tick, label: step } = rulerSteps(camera.scale);
    const ticks = this.ticks.clear();
    let count = 0;
    const along = (origin: number, length: number, mark: (at: number, long: boolean) => void) => {
      const first = Math.ceil((RULER_SIZE - origin) / camera.scale / tick);
      for (let k = first; ; k++) {
        const value = k * tick;
        const at = origin + value * camera.scale;
        if (at > length) break;
        mark(at, Math.abs(value / step - Math.round(value / step)) < 1e-9);
        count += 1;
      }
    };
    along(camera.x, width, (at, long) => {
      const line = crispLine(at, resolution);
      const length = long ? LABEL_TICK : TICK;
      ticks.rect(line.start, RULER_SIZE - length, line.width, length);
    });
    along(camera.y, height, (at, long) => {
      const line = crispLine(at, resolution);
      const length = long ? LABEL_TICK : TICK;
      ticks.rect(RULER_SIZE - length, line.start, length, line.width);
    });
    if (count > 0) ticks.fill(this.theme.rulerText);
    this.tickCount = count;

    const extent = this.drawExtent();
    this.placeLabels(
      this.across,
      rulerLabels(camera.x, camera.scale, width, step),
      extent?.across,
      false,
    );
    this.placeLabels(
      this.down,
      rulerLabels(camera.y, camera.scale, height, step),
      extent?.down,
      true,
    );
  }

  /**
   * Marks the selection's extent on both rulers: a band in the selection's color, its ends marked and
   * numbered. Says where its ends are on screen, along each ruler.
   */
  private drawExtent(): { across: [number, number]; down: [number, number] } | undefined {
    const bands = this.extentBands.clear();
    const marks = this.extentMarks.clear();
    const extent = this.extent;
    if (!extent) {
      for (const label of this.ends) label.visible = false;
      return undefined;
    }
    const { camera, viewport } = this;
    const x0 = camera.x + (extent.x + this.extentDelta.x) * camera.scale;
    const x1 = x0 + extent.width * camera.scale;
    const y0 = camera.y + (extent.y + this.extentDelta.y) * camera.scale;
    const y1 = y0 + extent.height * camera.scale;
    const { selected } = this.theme;
    const left = clamp(x0, RULER_SIZE, viewport.width);
    const right = clamp(x1, RULER_SIZE, viewport.width);
    const top = clamp(y0, RULER_SIZE, viewport.height);
    const bottom = clamp(y1, RULER_SIZE, viewport.height);
    if (right > left) bands.rect(left, 0, right - left, RULER_SIZE);
    if (bottom > top) bands.rect(0, top, RULER_SIZE, bottom - top);
    bands.fill({ color: selected, alpha: 0.2 });
    for (const at of [x0, x1]) marks.rect(Math.round(at) - 1, 0, 2, RULER_SIZE);
    for (const at of [y0, y1]) marks.rect(0, Math.round(at) - 1, RULER_SIZE, 2);
    marks.fill(selected);

    while (this.ends.length < 4) {
      const label = this.makeLabel(this.extentLabels);
      if (!label) break;
      label.tint = selected;
      this.ends.push(label);
    }
    const [start, end, high, low] = this.ends;
    const left0 = extent.x + this.extentDelta.x;
    const top0 = extent.y + this.extentDelta.y;
    if (start && end && high && low) {
      setText(start, unitsText(left0));
      setText(end, unitsText(left0 + extent.width));
      setText(high, unitsText(top0));
      setText(low, unitsText(top0 + extent.height));
      start.rotation = 0;
      end.rotation = 0;
      high.rotation = -Math.PI / 2;
      low.rotation = -Math.PI / 2;
      start.position.set(Math.round(x0 - LABEL_GAP - start.width), LABEL_EDGE);
      end.position.set(Math.round(x1 + LABEL_GAP), LABEL_EDGE);
      high.position.set(LABEL_EDGE, Math.round(y0 - LABEL_GAP));
      low.position.set(LABEL_EDGE, Math.round(y1 + LABEL_GAP + low.width));
      start.visible = x0 - LABEL_GAP - start.width >= RULER_SIZE;
      end.visible = x1 + LABEL_GAP + end.width <= viewport.width;
      high.visible = y0 - LABEL_GAP - high.width >= RULER_SIZE;
      low.visible = y1 + LABEL_GAP + low.width <= viewport.height;
    }
    return { across: [x0, x1], down: [y0, y1] };
  }

  /**
   * Puts the labels of one ruler where they go: a label already showing a value keeps it, and the free
   * ones take the values that came on screen. Labels under the corner, or near the selection's ends,
   * are left out.
   */
  private placeLabels(
    shown: Shown,
    wanted: readonly { at: number; value: number; text: string }[],
    ends: readonly [number, number] | undefined,
    rotated: boolean,
  ): void {
    const keep = new Set<number>();
    for (const { at, value } of wanted) {
      const near = ends?.some((end) => Math.abs(at - end) < CLEAR_OF_EXTENT) ?? false;
      if (at >= RULER_SIZE && !near) keep.add(value);
    }
    for (const [value, label] of shown) {
      if (keep.has(value)) continue;
      label.visible = false;
      shown.delete(value);
      this.free.push(label);
    }
    for (const { at, value, text } of wanted) {
      if (!keep.has(value)) continue;
      let label = shown.get(value);
      if (!label) {
        label = this.free.pop();
        if (!label) continue;
        setText(label, text);
        label.rotation = rotated ? -Math.PI / 2 : 0;
        label.visible = true;
        shown.set(value, label);
      }
      if (rotated) label.position.set(LABEL_EDGE, Math.round(at - LABEL_GAP));
      else label.position.set(Math.round(at + LABEL_GAP), LABEL_EDGE);
    }
  }

  /** The texts the labels along a ruler show, in order, for tests. */
  labelsAlong(ruler: 'across' | 'down'): string[] {
    const shown = ruler === 'across' ? this.across : this.down;
    return [...shown.entries()].sort(([a], [b]) => a - b).map(([, label]) => label.text);
  }
}

function setText(label: MarkText, text: string): void {
  if (label.text !== text) label.text = text;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/**
 * Where the selection lies, in canvas units: around every shape of its elements, its free shapes and
 * the lines of its relations, leaving out what the emphasis hides; nothing when none of it is drawn.
 */
export function selectionBounds(
  indexed: IndexedScene,
  selection: Selection,
  hidden: Hidden,
): Rect | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const add = (rect: Rect) => {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  };
  const addPoint = (point: Point) => add({ x: point.x, y: point.y, width: 0, height: 0 });
  for (const id of selection.elements) {
    for (const shape of indexed.byElement.get(id) ?? []) {
      if (!hidden.shapes.has(shape.key)) add(shape.rect);
    }
  }
  if (selection.freeShapes.size > 0) {
    const { notes, arrows } = indexed.scene;
    for (const note of notes) {
      if (selection.freeShapes.has(note.id) && !hidden.free.has(note.id)) add(note.rect);
    }
    for (const arrow of arrows) {
      if (!selection.freeShapes.has(arrow.id) || hidden.free.has(arrow.id)) continue;
      addPoint(arrow.from);
      addPoint(arrow.to);
    }
  }
  if (selection.relations.size > 0) {
    const lines = relationLinesOf(indexed.scene);
    for (const id of selection.relations) {
      const line = lines.get(id);
      if (!line || hidden.relations.has(line.relation)) continue;
      for (const point of line.route) addPoint(point);
    }
  }
  if (left > right || top > bottom) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
