/**
 * Images drawn in the canvas's tiles (docs/designs/components.md §5.7), with textures from the image
 * store, which decodes each cleaned picture as a picture and never as markup in the page.
 *
 * - Each tile of shapes that shows pictures gets an image drawing of its own, between its full drawing
 *   and its labels: a render group holding the drawings' plates and pictures, and the icons. A texture
 *   that arrives rebuilds only that drawing, so the tile's full drawing is never made again for it.
 * - It shows only with the full drawing: drawings from scale 0.25, icons from 0.45, and never when the
 *   canvas is zoomed far out, where a drawing's block is its plate.
 * - Until a picture's texture is ready, or when it can never be decoded, its placeholder shows: a
 *   drawing's own outline, drawn inside its plate by the full drawing, and nothing for an icon.
 * - Work per frame: at most four image drawings are rebuilt, nearest the middle of the screen first,
 *   those whose textures just arrived before those whose buckets changed with the zoom, and none once
 *   the frame has spent 8 ms. The store keeps its own limits on decoding and rasterizing.
 * - A tile out of the settled reach for 3 seconds drops its image drawing and gives up its textures;
 *   it asks again when it comes back.
 */
import type { Color } from '@visual-anything/schema';
import { Container, Graphics, type Texture } from 'pixi.js';
import { grow, type Rect } from './geometry';
import {
  IMAGE_LIMITS,
  ImageStore,
  bucketFor,
  sharpBucketFor,
  type ImagePlatform,
  type ImageRequest,
} from './images';
import type { ElementShape } from './scene';
import { IMAGE_SCALES, type ShapeImage } from './shape-images';
import { meets } from './spatial';

/** What the image drawings need of one of the renderer's tiles. */
export interface ImageTile {
  kind: 'shapes' | 'relations' | 'free';
  container: Container;
  shapes: readonly ElementShape[];
  bounds: Rect;
  /** The full drawing; image drawings go just above it, and show with it. */
  full?: Graphics;
}

/** How the canvas is seen this frame. */
export interface ImageView {
  scale: number;
  /** What the screen shows, in scene units. */
  shown: Rect;
  /** Device pixels to a screen pixel. */
  resolution: number;
  /** Whether the camera has rested, so pictures are drawn sharp. */
  settled: boolean;
  /** How long the frame has taken so far, in milliseconds. */
  spent: number;
}

/** The image drawing of one tile. */
interface Drawing {
  /** The name the store knows the tile's uses by. */
  id: string;
  /** The tile's shapes it was worked out for, and those of them that show a picture. */
  shapes: readonly ElementShape[];
  pictured: readonly ElementShape[];
  group?: Container;
  /** Drawings' plates and pictures, then icons, which hide below their scale at once. */
  drawings?: Graphics;
  icons?: Graphics;
  /** The buckets it was drawn for; none until it is drawn, or once it was dropped. */
  drawnFor?: string;
}

/** The corner radius of a drawing's plate, at most. */
const PLATE_RADIUS = 6;
/** The name the store knows the drag's pictures by. */
const DRAGGED = 'dragged';

let drawingCount = 0;

/** The pictures of the canvas's tiles, and the store whose textures they are drawn with. */
export class TileImages<T extends Texture = Texture, P = CanvasImageSource> {
  readonly store: ImageStore<T, P>;
  readonly #drawings = new WeakMap<ImageTile, Drawing>();
  /** The tiles drawn this frame by their drawing's name, for the store's answers. */
  #byId = new Map<string, { tile: ImageTile; drawing: Drawing }>();
  /** Whether the scene shown has any picture at all; when not, a frame costs nothing here. */
  #any = false;
  #shapes: readonly ElementShape[] | undefined;
  /** Whether a drawing asked the store for a texture it does not have yet, since the last frame. */
  #asked = false;
  /** The drawings of the drag under way, and the textures they use. */
  #dragged: { graphics: Graphics[]; keys: Set<string> } = { graphics: [], keys: new Set() };

  constructor(platform: ImagePlatform<T, P>, onArrive?: () => void) {
    this.store = new ImageStore(platform, onArrive);
  }

  /** Notes the shapes of the scene shown, and forgets the pictures it no longer shows. */
  show(shapes: readonly ElementShape[]): void {
    if (shapes === this.#shapes) return;
    this.#shapes = shapes;
    const images = new Map<number, ShapeImage['image']>();
    for (const shape of shapes) if (shape.image) images.set(shape.image.serial, shape.image.image);
    this.#any = images.size > 0;
    // An edit seldom changes which pictures the scene shows: the store is pruned only when it does.
    const serials = [...images.keys()].sort((a, b) => a - b).join(' ');
    if (serials === this.#serials) return;
    this.#serials = serials;
    this.store.prune(images.values());
  }

  /** The serials of the pictures the scene shown last showed, as `show` compares them. */
  #serials: string | undefined;

  /**
   * Gives the tiles their image drawings for this frame, within its budget, and says whether there is
   * more to do in the next one.
   */
  frame(tiles: Iterable<ImageTile>, view: ImageView): boolean {
    if (!this.#any) return false;
    const { scale, shown } = view;
    const side = Math.max(shown.width, shown.height);
    const reach = grow(shown, side / 2);
    // While the camera moves, only what is on screen, as full drawings are made.
    const near = view.settled ? reach : grow(shown, Math.max(64 / scale, 512));
    const middle = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
    const iconsShown = scale >= IMAGE_SCALES.iconsFrom;
    const inReach = new Set<string>();
    // A drag's pictures keep their textures while it is drawn, and give them up once it ends.
    if (this.#dragged.graphics.some((each) => !each.destroyed)) inReach.add(DRAGGED);
    else if (this.#dragged.graphics.length > 0) {
      this.store.release(DRAGGED);
      this.#dragged = { graphics: [], keys: new Set() };
    }
    const waiting: { tile: ImageTile; drawing: Drawing; key: string; distance: number }[] = [];
    const byId = new Map<string, { tile: ImageTile; drawing: Drawing }>();
    for (const tile of tiles) {
      if (tile.kind !== 'shapes') continue;
      const drawing = this.#drawingOf(tile);
      if (drawing.pictured.length === 0) continue;
      byId.set(drawing.id, { tile, drawing });
      const visible = tile.full?.visible === true && scale >= IMAGE_SCALES.drawingsFrom;
      if (drawing.group && drawing.group.visible !== visible) drawing.group.visible = visible;
      if (drawing.icons && drawing.icons.visible !== iconsShown) drawing.icons.visible = iconsShown;
      if (meets(tile.bounds, reach)) inReach.add(drawing.id);
      if (!visible || !meets(tile.bounds, near)) continue;
      const key = this.#keyOf(drawing, view, iconsShown);
      if (key === drawing.drawnFor) continue;
      const center = {
        x: tile.bounds.x + tile.bounds.width / 2,
        y: tile.bounds.y + tile.bounds.height / 2,
      };
      waiting.push({
        tile,
        drawing,
        key,
        distance: Math.hypot(center.x - middle.x, center.y - middle.y),
      });
    }
    this.#byId = byId;

    let rebuilt = 0;
    const began = view.spent;
    const clock = performance.now();
    const spent = () => began + performance.now() - clock;
    // Zoomed out too far for any picture to show, nothing is decoded or uploaded meanwhile.
    const shows = scale >= IMAGE_SCALES.drawingsFrom;
    // Pictures that just became ready first: their tiles show stand-ins or placeholders meanwhile.
    for (const id of shows ? this.store.frame({ spent: spent(), moving: !view.settled }) : []) {
      const known = byId.get(id);
      if (!known || known.drawing.drawnFor === undefined) continue;
      this.#draw(known.tile, known.drawing, view, iconsShown, middle);
      rebuilt += 1;
    }
    waiting.sort((a, b) => a.distance - b.distance);
    let more = shows && this.store.more;
    for (const each of waiting) {
      if (rebuilt >= IMAGE_LIMITS.tileRebuilds || spent() >= IMAGE_LIMITS.workAfter) {
        more = true;
        break;
      }
      this.#draw(each.tile, each.drawing, view, iconsShown, middle, each.key);
      rebuilt += 1;
    }
    for (const id of this.store.settle(inReach)) {
      const known = byId.get(id);
      if (known) this.#drop(known.drawing);
    }
    // What a drawing asked for this frame is started in the next, which nothing else may bring.
    const asked = this.#asked;
    this.#asked = false;
    return more || asked;
  }

  /**
   * Draws a tile's pictures at once, with the textures already made, as when an edit makes a tile in
   * place of one drawn in full; what is missing is asked for and comes in the frames after.
   */
  drawAtOnce(tile: ImageTile, view: ImageView): void {
    if (!this.#any || tile.kind !== 'shapes' || !tile.full) return;
    const drawing = this.#drawingOf(tile);
    if (drawing.pictured.length === 0 || view.scale < IMAGE_SCALES.drawingsFrom) return;
    const shown = view.shown;
    const middle = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
    this.#draw(tile, drawing, view, view.scale >= IMAGE_SCALES.iconsFrom, middle);
  }

  /** The pictures of dragged shapes, drawn with the textures already made, for the drag's drawing. */
  dragged(shapes: readonly ElementShape[], view: ImageView): Graphics[] {
    if (!this.#any || view.scale < IMAGE_SCALES.drawingsFrom) return [];
    const pictured = shapes.filter((shape) => shape.image !== undefined);
    if (pictured.length === 0) return [];
    const graphics = new Graphics();
    const shown = view.shown;
    const middle = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
    // The renderer destroys the drag's drawings when it ends: the next one starts afresh.
    if (this.#dragged.graphics.every((each) => each.destroyed)) {
      this.#dragged = { graphics: [], keys: new Set() };
    }
    const keys = this.#paint(
      pictured,
      graphics,
      graphics,
      view,
      view.scale >= IMAGE_SCALES.iconsFrom,
      middle,
      DRAGGED,
    );
    for (const key of keys) this.#dragged.keys.add(key);
    this.#dragged.graphics.push(graphics);
    this.store.use(DRAGGED, this.#dragged.keys);
    return [graphics];
  }

  /** Lets the store's textures and pictures go, and every tile ask again: as when nothing was drawn yet. */
  reset(): void {
    this.store.clear();
    for (const { drawing } of this.#byId.values()) this.#drop(drawing);
  }

  destroy(): void {
    this.store.destroy();
    this.#byId.clear();
  }

  /** A tile's drawing, worked out again when the tile holds other shapes. */
  #drawingOf(tile: ImageTile): Drawing {
    let drawing = this.#drawings.get(tile);
    if (!drawing) {
      drawingCount += 1;
      drawing = { id: `tile-${drawingCount}`, shapes: [], pictured: [] };
      this.#drawings.set(tile, drawing);
    }
    if (drawing.shapes !== tile.shapes) {
      drawing.shapes = tile.shapes;
      drawing.pictured = tile.shapes.filter((shape) => shape.image !== undefined);
      // What it drew may be another shape's now.
      if (drawing.drawnFor !== undefined) drawing.drawnFor = '';
    }
    return drawing;
  }

  /** What a tile's pictures are drawn for now: their buckets, and whether icons show. */
  #keyOf(drawing: Drawing, view: ImageView, iconsShown: boolean): string {
    let key = `${iconsShown ? 'i' : ''}${view.settled ? 's' : ''}`;
    for (const shape of drawing.pictured) {
      const image = shape.image as ShapeImage;
      if (image.placement !== 'drawing' && !iconsShown) continue;
      key += `,${bucketOf(image, view)}`;
    }
    return key;
  }

  #draw(
    tile: ImageTile,
    drawing: Drawing,
    view: ImageView,
    iconsShown: boolean,
    middle: { x: number; y: number },
    key = this.#keyOf(drawing, view, iconsShown),
  ): void {
    if (!tile.full) return;
    if (!drawing.group || drawing.group.destroyed) {
      const group = new Container({ isRenderGroup: true });
      const drawings = new Graphics();
      const icons = new Graphics();
      group.addChild(drawings, icons);
      tile.container.addChildAt(group, tile.container.getChildIndex(tile.full) + 1);
      Object.assign(drawing, { group, drawings, icons });
    }
    const { drawings, icons } = drawing as Required<Drawing>;
    drawings.clear();
    icons.clear();
    icons.visible = iconsShown;
    const keys = this.#paint(
      drawing.pictured,
      drawings,
      icons,
      view,
      iconsShown,
      middle,
      drawing.id,
    );
    this.store.use(drawing.id, keys);
    drawing.drawnFor = key;
  }

  /** Draws pictures with the textures the store has for them, and says which textures it used. */
  #paint(
    shapes: readonly ElementShape[],
    drawings: Graphics,
    icons: Graphics,
    view: ImageView,
    iconsShown: boolean,
    middle: { x: number; y: number },
    tile: string,
  ): string[] {
    const keys: string[] = [];
    for (const shape of shapes) {
      const image = shape.image as ShapeImage;
      const isDrawing = image.placement === 'drawing';
      if (!isDrawing && !iconsShown) continue;
      const { rect } = image;
      const request: ImageRequest = {
        image: image.image,
        devicePixels: Math.max(rect.width, rect.height) * view.scale * view.resolution,
        sharp: view.settled,
        silhouette: image.tint !== undefined,
        distance: Math.hypot(
          rect.x + rect.width / 2 - middle.x,
          rect.y + rect.height / 2 - middle.y,
        ),
        tile,
      };
      const made = this.store.texture(request);
      if (!made?.exact) this.#asked = true;
      if (!made) continue;
      keys.push(made.key);
      const into = isDrawing ? drawings : icons;
      if (isDrawing) plate(drawings, image.box, shape.fill);
      into.texture(made.texture, image.tint, rect.x, rect.y, rect.width, rect.height);
    }
    return keys;
  }

  #drop(drawing: Drawing): void {
    drawing.drawings?.clear();
    drawing.icons?.clear();
    delete drawing.drawnFor;
  }
}

/** The bucket a picture is drawn from at this view, as the store chooses it. */
function bucketOf(image: ShapeImage, view: ImageView): number {
  const pixels = Math.max(image.rect.width, image.rect.height) * view.scale * view.resolution;
  return view.settled ? sharpBucketFor(pixels) : bucketFor(pixels);
}

/** A drawing's plate: a rounded rectangle in its shape's fill, with no stroke. */
function plate(graphics: Graphics, box: Rect, fill: Color): void {
  graphics
    .roundRect(
      box.x,
      box.y,
      box.width,
      box.height,
      Math.min(PLATE_RADIUS, box.width / 4, box.height / 4),
    )
    .fill(fill);
}
