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
 * - Plates follow the theme (ADR-0033): drawn in white, a drawing for each pair of a fill and its dark
 *   shade, and tinted each frame to the fill of the theme the canvas shows, so that a switch changes
 *   them in the frame it shows, with the rest of the canvas. Pictures are drawn as stored in both
 *   themes, a silhouette in its stored colour.
 * - Work per frame: at most four image drawings are rebuilt, nearest the middle of the screen first,
 *   those whose textures just arrived before those whose buckets changed with the zoom, and none once
 *   the frame has spent 8 ms. The store keeps its own limits on decoding and rasterizing.
 * - A tile out of the settled reach for 3 seconds drops its image drawing and gives up its textures;
 *   it asks again when it comes back.
 * - Faces' pictures (ADR 0083, F5) are drawn by the faces themselves, among the labels, over their
 *   boxes (`faceDraw.ts`): their textures come from here (`textureFor`), one for each picture and
 *   size of box, at the resolution a box needs at twice its size on a 2x screen, shared by every face
 *   and kept while the scene shows the picture. A face whose texture is not made yet is drawn again
 *   once it is, as many as the frame's budget allows. A shape whose face draws its `<icon/>` draws its
 *   icon nowhere else (`iconInFace`).
 */
import { namedPart, partPicture, type ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { Container, Graphics, type Texture } from 'pixi.js';
import type { FaceLabel, FacePictureSource, FacePictures } from './faceDraw';
import { iconInFace } from './faces';
import { grow, type Rect } from './geometry';
import {
  IMAGE_LIMITS,
  ImageStore,
  bucketFor,
  sharpBucketFor,
  type ImagePlatform,
  type ImageRequest,
} from './images';
import { imageSerial } from './image-serials';
import { partImageOf, type ShapePart } from './partShapes';
import type { ElementShape } from './scene';
import { IMAGE_SCALES, type ShapeImage } from './shape-images';
import { meets } from './spatial';
import { shapeColors } from './theme/paint';

/** What the image drawings need of one of the renderer's tiles. */
export interface ImageTile {
  kind: 'shapes' | 'relations' | 'free';
  container: Container;
  shapes: readonly ElementShape[];
  bounds: Rect;
  /** The full drawing; image drawings go just above it, and show with it. */
  full?: Graphics;
  /** Whether the level of detail its shapes show leaves their pictures out (ADR 0055). */
  imagesHidden?: boolean;
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
  /** The theme the canvas shows, whose fills the plates are tinted to. */
  theme: ThemeName;
  /** How long the frame has taken so far, in milliseconds. */
  spent: number;
  /**
   * Whether a theme switch or a recolor is being drawn, whose frames keep their budget: no large
   * picture is rasterized past it meanwhile.
   */
  busy?: boolean;
}

/** The image drawing of one tile. */
interface Drawing {
  /** The name the store knows the tile's uses by. */
  id: string;
  /** The tile's shapes it was worked out for, and those of them that show a picture. */
  shapes: readonly ElementShape[];
  pictured: readonly ElementShape[];
  group?: Container;
  /** Drawings' plates, in white, by the fill and dark shade they are tinted to. */
  plates?: Map<string, Plates>;
  /** Drawings' pictures, then icons, which hide below their scale at once. */
  drawings?: Graphics;
  icons?: Graphics;
  /** The buckets it was drawn for; none until it is drawn, or once it was dropped. */
  drawnFor?: string;
}

/** Plates drawn in white, and the fill they are tinted to in each theme. */
interface Plates {
  graphics: Graphics;
  light: Color;
  dark: Color | undefined;
}

/** The corner radius of a drawing's plate, at most. */
const PLATE_RADIUS = 6;
/** The name the store knows the drag's pictures by. */
const DRAGGED = 'dragged';
/** The name the store knows faces' pictures by, which are always within reach. */
const FACES = 'faces';
/**
 * How many device pixels a face's picture is made at for each unit of its box: twice its size on a
 * 2x screen, so that it stays sharp up to a zoom of 200%.
 */
const FACE_PICTURE_PIXELS = 4;
/** The fewest faces kept in mind before those already gone are swept away. */
const FACE_SWEEP = 256;

let drawingCount = 0;

/** The pictures of the canvas's tiles, and the store whose textures they are drawn with. */
export class TileImages<
  T extends Texture = Texture,
  P = CanvasImageSource,
> implements FacePictures {
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
  /** The names of other users of the store, such as the part layer, which are always within reach. */
  readonly #kept = new Set<string>([FACES]);
  /** The textures faces draw their pictures with, which the store keeps for them. */
  readonly #faceKeys = new Set<string>();
  /** The faces that draw pictures, and those still waiting for a texture. */
  readonly #faces = new Set<FaceLabel>();
  #waiting = new Set<FaceLabel>();
  #sweepAt = FACE_SWEEP;

  constructor(platform: ImagePlatform<T, P>, onArrive?: () => void) {
    this.store = new ImageStore(platform, onArrive);
  }

  /**
   * The texture a face draws a picture with (`FacePictures`): one for each picture and size of box,
   * shared by every face; a stand-in of another size meanwhile, or none, and `waiting` is painted
   * again once it is made.
   */
  textureFor(picture: FacePictureSource, side: number, waiting: FaceLabel): T | undefined {
    if (!this.#faces.has(waiting)) {
      this.#faces.add(waiting);
      if (this.#faces.size >= this.#sweepAt) {
        for (const face of this.#faces) if (face.destroyed) this.#faces.delete(face);
        this.#sweepAt = Math.max(FACE_SWEEP, 2 * this.#faces.size);
      }
    }
    const made = this.store.texture({
      image: picture.image,
      devicePixels: side * FACE_PICTURE_PIXELS,
      sharp: true,
      silhouette: picture.tint !== undefined,
      distance: 0,
      tile: FACES,
    });
    if (!made?.exact) {
      this.#waiting.add(waiting);
      this.#asked = true;
    }
    if (!made) return undefined;
    if (!this.#faceKeys.has(made.key)) {
      this.#faceKeys.add(made.key);
      this.store.use(FACES, this.#faceKeys);
    }
    return made.texture;
  }

  /**
   * Paints again the faces that waited for a texture, within the frame's budget, and says whether
   * some are left for the next frame.
   */
  #repaintFaces(spent: () => number): boolean {
    const waiting = this.#waiting;
    this.#waiting = new Set();
    let left = false;
    for (const face of waiting) {
      if (face.destroyed) continue;
      if (left || spent() >= IMAGE_LIMITS.workAfter) {
        this.#waiting.add(face);
        left = true;
        continue;
      }
      face.repaint();
    }
    return left;
  }

  /**
   * Keeps the textures another user of the store draws with, by the name it asks for them under, as
   * though always within reach: the part layer's parts' own pictures (ADR 0067).
   */
  keep(user: string): void {
    this.#kept.add(user);
  }

  /** Notes the shapes of the scene shown, and forgets the pictures it no longer shows. */
  show(shapes: readonly ElementShape[]): void {
    if (shapes === this.#shapes) return;
    this.#shapes = shapes;
    const images = new Map<number, ShapeImage['image']>();
    for (const shape of shapes) {
      // Its own picture, drawn here or by its face's `<icon/>`, and its face's other pictures.
      const picture = ownPictureOf(shape);
      if (picture) images.set(picture.serial, picture.image);
      const faced = shape.face?.pictures;
      if (faced) for (const each of Object.values(faced)) images.set(each.serial, each.image);
    }
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
    const inReach = new Set<string>(this.#kept);
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
      const visible =
        tile.full?.visible === true &&
        scale >= IMAGE_SCALES.drawingsFrom &&
        tile.imagesHidden !== true;
      if (drawing.group && drawing.group.visible !== visible) drawing.group.visible = visible;
      if (drawing.icons && drawing.icons.visible !== iconsShown) drawing.icons.visible = iconsShown;
      if (drawing.plates) tintPlates(drawing.plates, view.theme);
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
    let facesLeft = false;
    // Pictures that just became ready first: their tiles show stand-ins or placeholders meanwhile.
    for (const id of shows
      ? this.store.frame({
          spent: spent(),
          moving: !view.settled,
          ...(view.busy === true ? { busy: true } : {}),
        })
      : []) {
      if (id === FACES) {
        facesLeft = this.#repaintFaces(spent);
        continue;
      }
      const known = byId.get(id);
      if (!known || known.drawing.drawnFor === undefined) continue;
      this.#draw(known.tile, known.drawing, view, iconsShown, middle);
      rebuilt += 1;
    }
    waiting.sort((a, b) => a.distance - b.distance);
    // Faces an earlier frame's budget left waiting for a texture made since.
    if (!facesLeft && this.#waiting.size > 0 && shows) facesLeft = this.#repaintFaces(spent);
    let more = (shows && this.store.more) || facesLeft;
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
    if (!this.#any || tile.kind !== 'shapes' || !tile.full || tile.imagesHidden === true) return;
    const drawing = this.#drawingOf(tile);
    if (drawing.pictured.length === 0 || view.scale < IMAGE_SCALES.drawingsFrom) return;
    const shown = view.shown;
    const middle = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
    this.#draw(tile, drawing, view, view.scale >= IMAGE_SCALES.iconsFrom, middle);
  }

  /** The pictures of dragged shapes, drawn with the textures already made, for the drag's drawing. */
  dragged(shapes: readonly ElementShape[], view: ImageView): Graphics[] {
    if (!this.#any || view.scale < IMAGE_SCALES.drawingsFrom) return [];
    const pictured = shapes.filter((shape) => pictureOf(shape) !== undefined);
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
      // Drawn again for the new theme when a switch shows, as the rest of the drag is.
      (shape, box) => plate(graphics, box, shapeColors(shape, view.theme).fill),
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
    // Faces drop the textures that went, and ask again.
    this.#faceKeys.clear();
    this.#waiting = new Set();
    for (const face of this.#faces) {
      if (face.destroyed) this.#faces.delete(face);
      else face.repaint();
    }
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
      drawing.pictured = tile.shapes.filter((shape) => pictureOf(shape) !== undefined);
      // What it drew may be another shape's now.
      if (drawing.drawnFor !== undefined) drawing.drawnFor = '';
    }
    return drawing;
  }

  /** What a tile's pictures are drawn for now: their buckets, and whether icons show. */
  #keyOf(drawing: Drawing, view: ImageView, iconsShown: boolean): string {
    let key = `${iconsShown ? 'i' : ''}${view.settled ? 's' : ''}`;
    for (const shape of drawing.pictured) {
      const image = pictureOf(shape) as ShapeImage;
      if (!drawnWhole(image) && !iconsShown) continue;
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
      Object.assign(drawing, { group, drawings, icons, plates: new Map() });
    }
    const { group, drawings, icons, plates } = drawing as Required<Drawing>;
    drawings.clear();
    icons.clear();
    for (const each of plates.values()) each.graphics.destroy();
    plates.clear();
    icons.visible = iconsShown;
    const keys = this.#paint(
      drawing.pictured,
      drawings,
      icons,
      view,
      iconsShown,
      middle,
      drawing.id,
      (shape, box) => {
        const dark = shape.dark?.fill;
        const pair = `${shape.fill} ${dark ?? ''}`;
        let under = plates.get(pair);
        if (!under) {
          under = { graphics: new Graphics(), light: shape.fill, dark };
          // Under the pictures.
          group.addChildAt(under.graphics, 0);
          plates.set(pair, under);
        }
        plate(under.graphics, box, WHITE);
      },
    );
    tintPlates(plates, view.theme);
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
    plateOf: (shape: ElementShape, box: Rect) => void,
  ): string[] {
    const keys: string[] = [];
    for (const shape of shapes) {
      const image = pictureOf(shape) as ShapeImage;
      const isDrawing = drawnWhole(image);
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
        // The picture of a drawing with parts, and a part's own, may be made large (ADR 0067).
        ...(image.placement === 'parts' ? { large: true } : {}),
      };
      const made = this.store.texture(request);
      if (!made?.exact) this.#asked = true;
      if (!made) continue;
      keys.push(made.key);
      const into = isDrawing ? drawings : icons;
      if (image.placement === 'drawing') plateOf(shape, image.box);
      into.texture(made.texture, image.tint, rect.x, rect.y, rect.width, rect.height);
    }
    return keys;
  }

  #drop(drawing: Drawing): void {
    drawing.drawings?.clear();
    drawing.icons?.clear();
    for (const each of drawing.plates?.values() ?? []) each.graphics.destroy();
    drawing.plates?.clear();
    delete drawing.drawnFor;
  }
}

/** The bucket a picture is drawn from at this view, as the store chooses it. */
function bucketOf(image: ShapeImage, view: ImageView): number {
  const pixels = Math.max(image.rect.width, image.rect.height) * view.scale * view.resolution;
  const large = image.placement === 'parts';
  return view.settled ? sharpBucketFor(pixels, large) : bucketFor(pixels, large);
}

const WHITE: Color = '#FFFFFF';

/** Tints plates to their fill in a theme: its dark shade in the dark theme, when it has one. */
function tintPlates(plates: ReadonlyMap<string, Plates>, theme: ThemeName): void {
  for (const { graphics, light, dark } of plates.values()) {
    const tint = theme === 'dark' && dark !== undefined ? dark : light;
    if (graphics.tint !== Number.parseInt(tint.slice(1), 16)) graphics.tint = tint;
  }
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

/** Whether a picture is drawn as a whole drawing, which shows at the drawings' scales rather than the icons'. */
function drawnWhole(image: ShapeImage): boolean {
  return image.placement === 'drawing' || image.placement === 'parts';
}

const ownPictures = new WeakMap<ElementShape, { of: unknown; picture: ShapeImage | undefined }>();

/**
 * The picture a shape draws in its tile's image drawing: its own (`ownPictureOf`), but for an icon
 * its face draws by `<icon/>` (ADR 0083), which is drawn nowhere else.
 */
export function pictureOf(shape: ElementShape): ShapeImage | undefined {
  const picture = ownPictureOf(shape);
  return picture !== undefined && picture === shape.image && iconInFace(shape)
    ? undefined
    : picture;
}

/**
 * The picture a shape shows: its image, as placed on it, or, for a shape drawn as a named part on its
 * own (ADR 0067), its part's own picture inside its outline, where the part's bounds fill the shape,
 * its proportions kept; worked out once for each shape and picture.
 */
export function ownPictureOf(shape: ElementShape): ShapeImage | undefined {
  const { part } = shape;
  if (!part || part.inDrawing) return shape.image;
  const image = partImageOf(part.image);
  const known = ownPictures.get(shape);
  if (known && known.of === image) return known.picture ?? shape.image;
  const picture = image && ownPartPicture(shape, part, image);
  ownPictures.set(shape, { of: image, picture });
  return picture ?? shape.image;
}

function ownPartPicture(
  shape: ElementShape,
  part: ShapePart,
  image: ShapeImage['image'],
): ShapeImage | undefined {
  const named = namedPart(image, part.part);
  const own = named && partPicture(image, part.part);
  if (!named || !own) return undefined;
  const { width, height } = named.bounds;
  const { rect } = shape;
  const scale = Math.min(rect.width / width, rect.height / height);
  if (!(scale > 0) || !Number.isFinite(scale)) return undefined;
  const placed = {
    x: rect.x + (rect.width - width * scale) / 2,
    y: rect.y + (rect.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
  return {
    id: own.id,
    image: own,
    serial: imageSerial(own),
    placement: 'parts',
    rect: placed,
    box: placed,
  };
}
