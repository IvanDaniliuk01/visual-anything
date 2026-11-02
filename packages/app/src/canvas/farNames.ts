/**
 * Names readable far out (ADR 0080, section 5): below the scale where rows stop writing, the names
 * of the shapes that draw rows, tables, and of containers, open or collapsed, schemas among them, are
 * written in screen space at 12 pixels, whatever the zoom, each on a plate of its shape's fill over
 * its header, so that the name drawn with the shape, too small to read there, does not show through.
 *
 * Small details give way first. The rows already write nothing there, and a plain shape's name and
 * every detail follow the canvas's own steps. Among the names written far out, containers come
 * before tables, the outer before what they hold, and the larger before the smaller; a name whose
 * plate would cover one already placed is left out, as is the name of a shape narrower on screen
 * than three of its letters, and at most 240 are written at once.
 *
 * Placing is pure; `FarNames` draws what it places, from a pool of bitmap labels and plates, so that
 * panning only moves them.
 */
import type { Color } from '@visual-anything/schema';
import { BitmapText, Container, Sprite, Texture } from 'pixi.js';
import type { Camera } from './camera';
import { readableTextColors } from './colors';
import { estimateWidth, fitText } from './fit';
import { bodyOf, type Rect, type Size } from './geometry';
import { installFonts } from './labels';
import { ROWS_FROM, ROWS_HEADER } from './rows';
import type { ElementShape } from './scene';
import { meets } from './spatial';

/**
 * How tall a name written far out is, in screen pixels, where the drawing defaults say nothing else:
 * their `reading.farNameSize` (ADR 0086).
 */
export const FAR_NAME_SIZE = 12;
/** The most names written far out at once. */
export const MOST_FAR_NAMES = 240;
/** How far in from its plate's sides a name is written, and the least height of a plate. */
const INSET = 4;
/** The least height of a plate for names of `size`: a line and its room. */
function plateOf(size: number): number {
  return Math.ceil(size * 1.3) + 4;
}
/** How far apart two plates keep. */
const GAP = 2;
/** A shape narrower than three of its names' ems on screen writes no name far out. */
const LEAST_EMS = 3;
/** How tall a container's header is, where it writes its name: its name's line and the room above. */
const CONTAINER_HEADER = 28;

/**
 * Whether names are written far out at this scale: below the one rows write their texts from, the
 * drawing defaults' `reading.rowsFrom`.
 */
export function farOut(scale: number, rowsFrom = ROWS_FROM): boolean {
  return scale < rowsFrom;
}

/** Whether a shape writes its name far out: a table, or a container open or collapsed, with a name. */
export function namedFarOut(shape: ElementShape): boolean {
  if (shape.row !== undefined || shape.part?.inDrawing === true) return false;
  if (shape.name.trim() === '') return false;
  return shape.rowCount !== undefined || shape.holdsContents || shape.collapsed !== undefined;
}

const orders = new WeakMap<readonly ElementShape[], readonly ElementShape[]>();

/**
 * The shapes of a scene that write their names far out, in the order they take room: containers
 * before tables, the outer before what they hold, then the larger first. Worked out once per scene.
 */
export function farNameOrder(shapes: readonly ElementShape[]): readonly ElementShape[] {
  let order = orders.get(shapes);
  if (!order) {
    const depthOf = (shape: ElementShape) => shape.key.split('/').length;
    const isTable = (shape: ElementShape) => (shape.rowCount !== undefined ? 1 : 0);
    order = shapes
      .filter(namedFarOut)
      .sort(
        (a, b) =>
          isTable(a) - isTable(b) ||
          depthOf(a) - depthOf(b) ||
          b.rect.width * b.rect.height - a.rect.width * a.rect.height,
      );
    orders.set(shapes, order);
  }
  return order;
}

/** A name written far out: its text, its plate and where the text starts, on screen. */
export interface FarName {
  key: string;
  text: string;
  plate: Rect;
  x: number;
  y: number;
  /** The plate's fill, its shape's, and the text's color, which reads on it. */
  fill: Color;
  color: Color;
}

/** What placing names far out reads beyond the shapes. */
export interface FarNameOptions {
  /** The shapes the emphasis hides, by key, which write no name. */
  hidden?: ReadonlySet<string>;
  /** Whether the canvas is dark, whose shapes take their dark fills. */
  dark?: boolean;
  most?: number;
  /** The size names are written at, in screen pixels: the drawing defaults' `reading.farNameSize`. */
  size?: number;
  /** The scale rows write their texts from, below which names are written far out. */
  rowsFrom?: number;
}

/**
 * The names written far out for a camera and a viewport: in `order`, each on screen, clear of those
 * placed before it, as wide as its shape on screen allows, cut with "…" when longer; none when the
 * camera is not far out.
 */
export function placeFarNames(
  order: readonly ElementShape[],
  camera: Camera,
  viewport: Size,
  options: FarNameOptions = {},
): FarName[] {
  const { scale } = camera;
  if (!farOut(scale, options.rowsFrom) || scale <= 0) return [];
  const size = options.size ?? FAR_NAME_SIZE;
  const most = options.most ?? MOST_FAR_NAMES;
  const shown: Rect = {
    x: -camera.x / scale,
    y: -camera.y / scale,
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
  const placed: FarName[] = [];
  for (const shape of order) {
    if (placed.length >= most) break;
    if (options.hidden?.has(shape.key)) continue;
    const body = bodyOf(shape);
    const header = shape.header ?? (shape.rowCount !== undefined ? ROWS_HEADER : CONTAINER_HEADER);
    if (!meets({ ...body, height: Math.min(body.height, header) }, shown)) continue;
    const width = body.width * scale;
    if (width < LEAST_EMS * size) continue;
    const text = fitText(shape.name, width - 2 * INSET, size, true);
    if (text === '' || (text !== shape.name && text.length < 4)) continue;
    // A table's and a collapsed container's header across their width; an open container's name
    // at its top left, so that it covers no more of what it holds than it must.
    const across = shape.rowCount !== undefined || shape.collapsed !== undefined;
    const plate: Rect = {
      x: body.x * scale + camera.x,
      y: body.y * scale + camera.y,
      width: across ? width : Math.min(width, estimateWidth(text, size, true) + 2 * INSET),
      height: Math.max(plateOf(size), Math.min(body.height, header) * scale),
    };
    if (placed.some((other) => overlap(other.plate, plate))) continue;
    const fill = options.dark && shape.dark ? shape.dark.fill : shape.fill;
    placed.push({
      key: shape.key,
      text,
      plate,
      x: plate.x + INSET,
      y: plate.y + (plate.height - size * 1.2) / 2,
      fill,
      color: readableTextColors(fill).name,
    });
  }
  return placed;
}

function overlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width + GAP &&
    b.x < a.x + a.width + GAP &&
    a.y < b.y + b.height + GAP &&
    b.y < a.y + a.height + GAP
  );
}

/** A label the far names write with: a bitmap label, or a stand-in in tests. */
export type FarText = Container & { text: string };

/** Makes a label in the names' white bold font, tinted where it is used; none without fonts. */
function bitmapFarText(): FarText | undefined {
  try {
    installFonts();
    return new BitmapText({
      text: '',
      style: { fontFamily: 'visual-anything-name', fontSize: FAR_NAME_SIZE },
    });
  } catch {
    return undefined;
  }
}

/** Draws the names placed far out, in screen space, above the scene. */
export class FarNames {
  readonly container = new Container({ label: 'farNames' });
  private readonly plates: Sprite[] = [];
  private readonly texts: (FarText | undefined)[] = [];
  /** How many names show, for tests and the benchmark. */
  shown = 0;
  /** The size the names are written at, in screen pixels. */
  private size = FAR_NAME_SIZE;

  constructor(private readonly makeText: () => FarText | undefined = bitmapFarText) {}

  /** Shows these names, written at `size`, and hides the rest of the pool. */
  show(names: readonly FarName[], size = FAR_NAME_SIZE): void {
    if (size !== this.size) {
      this.size = size;
      for (const text of this.texts) if (text) sizeText(text, size);
    }
    for (let at = 0; at < names.length; at++) {
      const name = names[at] as FarName;
      let plate = this.plates[at];
      if (!plate) {
        plate = new Sprite(Texture.WHITE);
        this.plates.push(plate);
        const text = this.makeText();
        if (text && size !== FAR_NAME_SIZE) sizeText(text, size);
        this.texts.push(text);
        this.container.addChild(plate);
        if (text) this.container.addChild(text);
      }
      plate.visible = true;
      plate.position.set(name.plate.x, name.plate.y);
      plate.width = name.plate.width;
      plate.height = name.plate.height;
      plate.tint = name.fill;
      const text = this.texts[at];
      if (text) {
        if (text.text !== name.text) text.text = name.text;
        text.visible = true;
        text.position.set(name.x, name.y);
        text.tint = name.color;
      }
    }
    for (let at = names.length; at < this.plates.length; at++) {
      (this.plates[at] as Sprite).visible = false;
      const text = this.texts[at];
      if (text) text.visible = false;
    }
    this.shown = names.length;
    this.container.visible = names.length > 0;
  }
}

/** Writes a far name's label at another size: a bitmap label's font size; a stand-in keeps its own. */
function sizeText(text: FarText, size: number): void {
  if (text instanceof BitmapText) text.style.fontSize = size;
}
