/**
 * Where a shape draws the image its appearance shows (docs/designs/components.md §5.7, ADR-0027),
 * worked out in the scene from the cleaned view's width and height, never from decoding:
 *
 * - **An icon beside the name**, on a plain shape: a square of side `clamp(h − 20, 16, 32)`, `h` the
 *   height of its label area, 8 units into that area and centred in it; its text moves right by the
 *   side plus 8.
 * - **An icon in the header**, whatever the placement asks, on a shape that holds contents, a
 *   collapsed container and a shape that draws rows: an 18-unit square at (x + 10, y + 7), with its
 *   name and detail from x + 34.
 * - **An icon in a row**, whatever the placement asks: a 16-unit square 8 units in from the row's
 *   left, centred on it, with its name from x + 32.
 * - **A shape with its own outline** (ADR 0066), whatever the placement asks: an icon in its label
 *   area, or in its header along the stretch its outline holds when it shows its contents.
 * - **A drawing with parts** (ADR 0067), a container whose picture the scene places under its header:
 *   the picture there, with its anchored parts drawn over it; its name stays in its header.
 * - **A drawing** in place of the shape: the picture, its proportions kept, on a plate 4 units larger
 *   in the shape's fill, above a band across the shape where its name is written (20 units, or 34
 *   with a detail), the whole centred in the shape. The plate with its band is the shape's `plate`,
 *   which routes, the selection and pointing go by, so that relations reach the picture rather than
 *   empty space. Until its picture is ready, the shape's own outline is drawn inside the plate.
 *
 * Pure, with no PixiJS, as the scene is.
 */
import {
  imageShownBy,
  type CleanedImage,
  type Definitions,
  type ImageCatalog,
} from '@visual-anything/core';
import type { Appearance, Color, Id } from '@visual-anything/schema';
import {
  bodyOf,
  cylinderCap,
  grow,
  holdsPoint,
  personHead,
  type Point,
  type Rect,
  type ShapeKind,
} from './geometry';
import { imageSerial } from './image-serials';
import {
  LEAST_HEADER_WIDTH,
  LEAST_LABEL_HEIGHT,
  headerStretch,
  besideIcon,
  labelAreaOn,
  showsContents,
} from './outlined';
import type { ShapeOutline } from './outlines';

/**
 * The scales images show from: drawings with the shapes' full drawings, icons with their names. Below
 * the first, shapes are plain blocks, and a drawing's block is its plate.
 */
export const IMAGE_SCALES = { drawingsFrom: 0.25, iconsFrom: 0.45 } as const;

/** How far right a container's name and detail move for the icon in its header. */
export const HEADER_TEXT_SHIFT = 22;

/** The band under a drawing where its name is written: alone, and with a detail. */
const BAND = { name: 20, detail: 34 } as const;
/** How much larger than its picture a drawing's plate is, on each side. */
const PLATE_MARGIN = 4;
/** How far inside a drawing's plate its shape's own outline is drawn while the picture is not ready. */
const PLACEHOLDER_INSET = 2;
/** The smallest picture a drawing makes, in units a side; smaller ones are drawn as icons. */
const SMALLEST_DRAWING = 8;
const HEADER_ICON = { x: 10, y: 7, side: 18 } as const;
const ROW_ICON = { x: 8, side: 16 } as const;

/** The image an element's shapes show, as its appearances resolve it: what its shapes' drawing needs. */
export interface ImageLook {
  /** The image's id, as the appearance names it. */
  id: Id;
  /** Its cleaned view, the only one any reader draws from. */
  image: CleanedImage;
  /** The serial of its content, which equal content keeps across reloads. */
  serial: number;
  /** As the appearance asks; a header or a row shows it as an icon whatever it asks. */
  placement: 'icon' | 'drawing' | 'parts';
  /** Present for a silhouette of this colour: the picture's shape kept, its colours replaced. */
  tint?: Color;
}

/** An image placed on a shape. */
export interface ShapeImage {
  id: Id;
  image: CleanedImage;
  serial: number;
  /**
   * How the canvas draws it: beside the name, in a header, as the shape's whole drawing, or as the
   * picture of a drawing with parts, under its header.
   */
  placement: 'icon' | 'header' | 'drawing' | 'parts';
  /** Where the picture is drawn, its proportions kept. */
  rect: Rect;
  /** The square an icon is fitted in, or a drawing's plate. */
  box: Rect;
  /** A drawing's name band, across the shape under the plate. */
  band?: Rect;
  tint?: Color;
}

/** What a shape's image is placed from: its kind, rectangle, and whether it holds or draws contents. */
export interface ImageHolder {
  kind: ShapeKind;
  rect: Rect;
  holdsContents: boolean;
  collapsed?: unknown;
  /** Whether its appearance draws its contents as rows. */
  rows: boolean;
  /** Whether it is a row of its container (ADR 0023), which shows its image at its left. */
  row?: boolean;
  /** On a drawing with parts: where the scene placed its picture (ADR 0067). */
  picture?: Rect;
  /** Its own outline, placed from the top left of `rect`, which shows its image as an icon (ADR 0066). */
  outline?: ShapeOutline;
}

/** A placed image, with the plate a drawing puts in place of its shape's rectangle. */
export interface PlacedImage {
  image: ShapeImage;
  plate?: Rect;
}

const catalogs = new WeakMap<Definitions, ImageCatalog>();

/**
 * Says which images the elements drawn with these definitions show: the scene gives the catalog of the
 * packages the definitions come from, once per build.
 */
export function setImageCatalog(definitions: Definitions, catalog: ImageCatalog): void {
  catalogs.set(definitions, catalog);
}

/** How the scene reads the cleaned view of an image by its id, with these definitions' catalog. */
export function shownImagesOf(definitions: Definitions): (id: Id) => CleanedImage | undefined {
  const catalog = catalogs.get(definitions);
  return (id) => catalog?.shown(id);
}

/**
 * The image an element's shapes show, from its own appearance or its component's, through the cleaned
 * view; none when no appearance shows one, or when the catalog cannot draw it (unknown, refused by
 * cleaning, or past its package's total).
 */
export function imageLookOf(
  element: { component: Id; appearance?: Appearance },
  definitions: Definitions,
): ImageLook | undefined {
  const shown = imageShownBy(element, definitions);
  if (!shown) return undefined;
  const image = catalogs.get(definitions)?.shown(shown.image);
  if (!image) return undefined;
  return {
    id: shown.image,
    image,
    serial: imageSerial(image),
    placement: shown.placement ?? 'icon',
    ...(shown.tint === undefined ? {} : { tint: shown.tint }),
  };
}

/**
 * Places an element's image on one of its shapes; `hasDetail` says whether the shape writes a detail
 * under its name, which a drawing's band makes room for.
 */
export function placeImage(
  look: ImageLook | undefined,
  holder: ImageHolder,
  hasDetail = false,
): PlacedImage | undefined {
  if (!look) return undefined;
  const { width, height } = look.image;
  const base = {
    id: look.id,
    image: look.image,
    serial: look.serial,
    ...(look.tint === undefined ? {} : { tint: look.tint }),
  };
  if (holder.row) {
    // A row shows its picture as an icon at its left, whatever the placement asks.
    const box = rowImageRect(holder.rect);
    return { image: { ...base, placement: 'icon', rect: fitted(width, height, box), box } };
  }
  if (holder.picture && holder.collapsed === undefined && !holder.rows) {
    // A drawing with parts draws its picture where the scene placed it.
    const box = holder.picture;
    return { image: { ...base, placement: 'parts', rect: box, box } };
  }
  if (holder.outline && !holder.rows) {
    const image = outlinedIcon({ ...holder, outline: holder.outline }, width, height);
    return (
      image && { image: { ...base, placement: image.placement, rect: image.rect, box: image.box } }
    );
  }
  if (holder.holdsContents || holder.collapsed !== undefined || holder.rows) {
    const body = bodyOf(holder);
    const box = {
      x: body.x + HEADER_ICON.x,
      y: body.y + HEADER_ICON.y,
      width: HEADER_ICON.side,
      height: HEADER_ICON.side,
    };
    return { image: { ...base, placement: 'header', rect: fitted(width, height, box), box } };
  }
  if (look.placement === 'drawing') {
    const drawing = drawingOf(width, height, holder.rect, hasDetail ? BAND.detail : BAND.name);
    if (drawing)
      return { image: { ...base, placement: 'drawing', ...drawing.image }, plate: drawing.plate };
  }
  const area = labelAreaOf(holder.kind, holder.rect);
  const side = Math.min(32, Math.max(16, area.height - 20));
  const box = { x: area.x + 8, y: area.y + (area.height - side) / 2, width: side, height: side };
  return { image: { ...base, placement: 'icon', rect: fitted(width, height, box), box } };
}

/** The least side of an icon in a label area, below which a shape with its own outline shows none. */
const LEAST_OUTLINED_ICON = 8;

/**
 * Where a shape with its own outline shows its image (ADR 0066): only ever as an icon, whatever the
 * placement asks. An expanded container shows it in its header, at the start of the stretch of the
 * header line its outline holds, and none when that stretch is too short for it and a name. Any other
 * shape shows it in its label area: 8 units in, as beside any name, when the area is tall enough for
 * its name, its side then at most a quarter of the area's width; else centred in the area. None when
 * it would be less than 8 units a side.
 */
function outlinedIcon(
  holder: ImageHolder & { outline: ShapeOutline },
  width: number,
  height: number,
): Pick<ShapeImage, 'placement' | 'rect' | 'box'> | undefined {
  if (showsContents(holder)) {
    const stretch = headerStretch(holder);
    if (!stretch || stretch.width < LEAST_HEADER_WIDTH + HEADER_TEXT_SHIFT) return undefined;
    const box = {
      x: stretch.x,
      y: holder.rect.y + HEADER_ICON.y,
      width: HEADER_ICON.side,
      height: HEADER_ICON.side,
    };
    return { placement: 'header', rect: fitted(width, height, box), box };
  }
  const area = labelAreaOn(holder);
  const named = area.height >= LEAST_LABEL_HEIGHT;
  const side = named
    ? Math.min(32, Math.max(16, area.height - 20), area.height, area.width / 4)
    : Math.min(32, area.height, area.width);
  if (!(side >= LEAST_OUTLINED_ICON)) return undefined;
  const inset = named ? Math.min(8, side / 2) : (area.width - side) / 2;
  const box = {
    x: area.x + inset,
    y: area.y + (area.height - side) / 2,
    width: side,
    height: side,
  };
  return { placement: 'icon', rect: fitted(width, height, box), box };
}

/** A drawing's picture, plate and band in a shape's rectangle; none when it leaves no room. */
function drawingOf(
  width: number,
  height: number,
  rect: Rect,
  band: number,
): { image: Pick<ShapeImage, 'rect' | 'box' | 'band'>; plate: Rect } | undefined {
  const room = {
    width: rect.width - 2 * PLATE_MARGIN,
    height: rect.height - band - 2 * PLATE_MARGIN,
  };
  if (room.width < SMALLEST_DRAWING || room.height < SMALLEST_DRAWING) return undefined;
  const scale = Math.min(room.width / width, room.height / height);
  const picture = { width: width * scale, height: height * scale };
  const plate = {
    width: picture.width + 2 * PLATE_MARGIN,
    height: picture.height + 2 * PLATE_MARGIN,
  };
  const top = rect.y + (rect.height - plate.height - band) / 2;
  const box = { x: rect.x + (rect.width - plate.width) / 2, y: top, ...plate };
  return {
    image: {
      rect: grow(box, -PLATE_MARGIN),
      box,
      band: { x: rect.x, y: top + plate.height, width: rect.width, height: band },
    },
    plate: { ...box, height: plate.height + band },
  };
}

/** A picture of this width and height fitted in a box, its proportions kept, centred. */
function fitted(width: number, height: number, box: Rect): Rect {
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale;
  const h = height * scale;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

/**
 * The part of a shape its text is centred in, as `draw.ts` writes it: below a person's head, below a
 * cylinder's top cap, inside an ellipse.
 */
export function labelAreaOf(kind: ShapeKind, rect: Rect): Rect {
  const { x, y, width, height } = rect;
  if (kind === 'person') {
    const top = personHead(rect) * 1.6;
    return { x, y: y + top, width, height: height - top };
  }
  if (kind === 'cylinder') {
    const cap = cylinderCap(rect);
    return { x, y: y + 2 * cap, width, height: height - 3 * cap };
  }
  if (kind === 'ellipse') {
    return { x: x + width * 0.15, y: y + height * 0.15, width: width * 0.7, height: height * 0.7 };
  }
  return rect;
}

/** Whether two placed images draw alike. */
export function sameShapeImage(a: ShapeImage | undefined, b: ShapeImage | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.image === b.image &&
    a.serial === b.serial &&
    a.placement === b.placement &&
    a.tint === b.tint &&
    sameRect(a.rect, b.rect) &&
    sameRect(a.box, b.box) &&
    sameRect(a.band, b.band)
  );
}

/** Whether two optional rectangles are equal. */
export function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** A shape's image and plate moved with it by a distance, for a shape moved as it was. */
export function movedImage(
  shape: { image?: ShapeImage; plate?: Rect },
  dx: number,
  dy: number,
): { image?: ShapeImage; plate?: Rect } {
  const { image, plate } = shape;
  if (!image) return {};
  const move = (rect: Rect): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });
  return {
    image: {
      ...image,
      rect: move(image.rect),
      box: move(image.box),
      ...(image.band ? { band: move(image.band) } : {}),
    },
    ...(plate ? { plate: move(plate) } : {}),
  };
}

/**
 * A shape's image and plate placed again on its rectangle moved to `rect`, as `placeImage` places
 * them on a shape built from nothing there: the same sums in the same order, so that a shape moved
 * as it was and one built afresh hold equal numbers, which adding the distance to each would not
 * (`0.1 + 0.2` is not `0.3` in floating point).
 */
export function placedAgain(
  shape: {
    kind: ShapeKind;
    image?: ShapeImage;
    holdsContents: boolean;
    collapsed?: unknown;
    rowCount?: number;
    row?: number;
    outline?: ShapeOutline;
    detail?: string;
  },
  rect: Rect,
  picture: Rect | undefined,
): { image?: ShapeImage; plate?: Rect } {
  const { image } = shape;
  if (!image) return {};
  const look: ImageLook = {
    id: image.id,
    image: image.image,
    serial: image.serial,
    placement:
      image.placement === 'drawing' || image.placement === 'parts' ? image.placement : 'icon',
    ...(image.tint === undefined ? {} : { tint: image.tint }),
  };
  const placed = placeImage(
    look,
    {
      kind: shape.kind,
      rect,
      holdsContents: shape.holdsContents,
      ...(shape.collapsed === undefined ? {} : { collapsed: true }),
      rows: shape.rowCount !== undefined,
      ...(shape.row === undefined ? {} : { row: true }),
      ...(picture ? { picture } : {}),
      ...(shape.outline ? { outline: shape.outline } : {}),
    },
    (shape.detail ?? '') !== '',
  );
  return placed ? { image: placed.image, ...(placed.plate ? { plate: placed.plate } : {}) } : {};
}

/** Everything about a shape's image that its drawing shows, for its tile's signature. */
export function imageSignature(shape: { image?: ShapeImage }): string {
  const { image } = shape;
  if (!image) return '';
  const { rect, band } = image;
  return [
    image.serial,
    image.placement,
    image.tint ?? '',
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    band ? band.height : '',
  ].join(';');
}

// What the drawing step asks -----------------------------------------------------------------------

/** The block a shape is drawn as far out: a drawing's plate, or its rectangle. */
export function blockRectOf(shape: { rect: Rect; image?: ShapeImage }): Rect {
  return shape.image?.placement === 'drawing' ? shape.image.box : shape.rect;
}

/**
 * Where a shape's own outline is drawn: its rectangle, or, for a drawing, just inside its plate, where
 * it shows until the picture, on its plate, covers it.
 */
export function bodyRectOf(shape: { rect: Rect; image?: ShapeImage }): Rect {
  return shape.image?.placement === 'drawing'
    ? grow(shape.image.box, -PLACEHOLDER_INSET)
    : shape.rect;
}

/** The part of a label area left for text beside an icon: right of it (`besideIcon`). */
export function besideImage(shape: { rect: Rect; image?: ShapeImage }, area: Rect): Rect {
  return besideIcon(shape, area);
}

/** How far right a container's header text moves for the icon in its header. */
export function headerShift(shape: { image?: ShapeImage }): number {
  return shape.image?.placement === 'header' ? HEADER_TEXT_SHIFT : 0;
}

/** Where a drawing writes its name and detail; none for a shape that is not drawn by its picture. */
export function nameBandOf(shape: { image?: ShapeImage }): Rect | undefined {
  return shape.image?.placement === 'drawing' ? shape.image.band : undefined;
}

/** How tall a drawing's name and detail may be in its band. */
export function bandRooms(band: Rect): { name: number; detail: number } {
  return { name: Math.min(20, band.height), detail: Math.max(0, band.height - 18) };
}

/**
 * Whether a shape holds a point as drawn: a drawing by its plate and its name band, every other shape
 * by its outline.
 */
export function holdsDrawn(
  shape: { kind: ShapeKind; rect: Rect; image?: ShapeImage },
  point: Point,
): boolean {
  const image = shape.image;
  if (image?.placement !== 'drawing') return holdsPoint(shape.kind, shape.rect, point);
  return (
    holdsPoint('rectangle', image.box, point) ||
    (image.band !== undefined && holdsPoint('rectangle', image.band, point))
  );
}

/** Where a row draws its image, whatever the placement: a 16-unit square 8 units in, centred. */
export function rowImageRect(row: Rect): Rect {
  return {
    x: row.x + ROW_ICON.x,
    y: row.y + (row.height - ROW_ICON.side) / 2,
    width: ROW_ICON.side,
    height: ROW_ICON.side,
  };
}
