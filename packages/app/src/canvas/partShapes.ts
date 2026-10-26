/**
 * What the scene does for drawings with parts and for elements drawn as named parts (ADR 0067):
 *
 * - **A drawing with parts**, a shape that shows its image with its parts, writes its name in its
 *   header, as a container does, and draws its picture below it: at one canvas unit per unit of the
 *   image, scaled down to fit 1,600 a side, or, when the view stores the shape's size, fitted to the
 *   body of that size. Its other contents are placed below the picture.
 * - **An anchored part** is a content of a drawing with parts whose appearance names one of the
 *   picture's parts, with that image or with none: the first in the model's order for each part. It
 *   is drawn in its part's place and at its part's size, with no position of its own and none of what
 *   it holds drawn, as a row is (ADR 0023).
 * - **A part drawn on its own**, anywhere else, takes its part's outline when its appearance names
 *   the part's image and that image has the part.
 *
 * `scene.ts` calls these at its few seams. Pure, with no PixiJS, as the scene is.
 */
import {
  namedPart,
  partsOf,
  type CleanedImage,
  type Definitions,
  type NamedPart,
  type Placement,
  type ResolvedAppearance,
} from '@visual-anything/core';
import type { Color, Id, PartReference, ShapePosition } from '@visual-anything/schema';
import type { Point, Rect } from './geometry';
import { partSource, type OutlineSource } from './outlines';
import type { ImageLook } from './shape-images';

/** How a shape is drawn as a named part. */
export interface ShapePart {
  /** The image whose part it is drawn as. */
  image: Id;
  /** The part's id in that image. */
  part: string;
  /** The part's main color, which it is filled in far out and until its picture is ready. */
  color: Color;
  /** Whether it is anchored in a drawing with parts, rather than drawn on its own. */
  inDrawing: boolean;
}

/** Where a drawing with parts draws its picture, and how many canvas units a unit of the image takes. */
export interface DrawingPicture {
  rect: Rect;
  scale: number;
}

/** What a container leaves around its contents, as the scene lays them out. */
export interface ContainerRoom {
  padding: number;
  header: number;
}

/** The largest side a picture is drawn at, unless the view stores its drawing's size. */
export const LARGEST_PICTURE = 1600;

/** Where a content of a drawing with parts is drawn as one of its picture's parts. */
export interface Anchor {
  image: Id;
  part: NamedPart;
  /** Where it sits from its drawing's top left, and how large it is. */
  offset: Point;
  width: number;
  height: number;
}

/** What an anchored part's box holds besides its look: its anchor, and what it does not draw. */
export interface Anchored {
  anchor: Anchor;
  /** The elements it holds, which it does not draw, each once; the outline lists them. */
  undrawn: readonly Id[];
}

/** How a shape that is not anchored is drawn as a part: its outline's source and the part. */
export interface OwnPart {
  source: OutlineSource;
  part: ShapePart;
}

/** The image a drawing with parts shows, as its look has it; none for any other shape. */
export function drawingImage(
  look: { appearance: ResolvedAppearance; image: ImageLook | undefined },
  collapsedWithContents: boolean,
): ImageLook | undefined {
  const { image } = look;
  return image?.placement === 'parts' && !look.appearance.contentsAsRows && !collapsedWithContents
    ? image
    : undefined;
}

/**
 * Where a drawing with parts draws its picture, from its top left: under its header and inset as a
 * container's contents are, at one unit per unit of the image scaled down to fit 1,600 a side, or
 * fitted to the body of the size the view stores.
 */
export function pictureIn(
  image: CleanedImage,
  appearance: ResolvedAppearance,
  position: ShapePosition | undefined,
  room: ContainerRoom,
): DrawingPicture {
  const { width, height } = image;
  const natural = Math.min(1, LARGEST_PICTURE / Math.max(width, height));
  let scale = natural;
  if (position?.width !== undefined || position?.height !== undefined) {
    const bodyWidth = (position.width ?? appearance.width) - 2 * room.padding;
    const bodyHeight = (position.height ?? appearance.height) - room.header - room.padding;
    // A size too small for any picture leaves it one unit across, and the drawing grows to hold it.
    scale = Math.max(Math.min(bodyWidth / width, bodyHeight / height), 1 / Math.max(width, height));
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = natural;
  return {
    rect: { x: room.padding, y: room.header, width: width * scale, height: height * scale },
    scale,
  };
}

/**
 * Which contents of a drawing with parts are anchored parts, in their order: a content whose
 * appearance names one of the picture's parts, with this image or with none, the first for each part.
 */
export function anchorsIn(
  image: ImageLook,
  picture: DrawingPicture,
  contents: readonly Placement[],
  partOf: (content: Placement) => PartReference | undefined,
): (Anchor | undefined)[] {
  const taken = new Set<string>();
  const { rect, scale } = picture;
  return contents.map((content) => {
    const reference = partOf(content);
    if (!reference || (reference.image !== undefined && reference.image !== image.id)) {
      return undefined;
    }
    if (taken.has(reference.part)) return undefined;
    const part = namedPart(image.image, reference.part);
    if (!part) return undefined;
    taken.add(reference.part);
    const { bounds } = part;
    return {
      image: image.id,
      part,
      offset: { x: rect.x + bounds.x * scale, y: rect.y + bounds.y * scale },
      width: bounds.width * scale,
      height: bounds.height * scale,
    };
  });
}

/** What an anchored part holds and does not draw, each once, in order. */
export function anchoredOf(anchor: Anchor, placement: Placement): Anchored {
  const undrawn: Id[] = [];
  const seen = new Set<Id>();
  for (const content of placement.contents) {
    if (seen.has(content.element)) continue;
    seen.add(content.element);
    undrawn.push(content.element);
  }
  return { anchor, undrawn };
}

/**
 * The part an element is drawn as on its own, outside a drawing with parts: the part its appearance
 * names in the image it names, when that image is drawn and has the part. A part named without its
 * image is found only in a drawing.
 */
export function ownPartOf(
  appearance: ResolvedAppearance,
  shown: (image: Id) => CleanedImage | undefined,
): OwnPart | undefined {
  const reference = appearance.part;
  if (reference?.image === undefined) return undefined;
  const image = shown(reference.image);
  const part = image && namedPart(image, reference.part);
  if (!part) return undefined;
  return {
    source: partSource(part),
    part: { image: reference.image, part: reference.part, color: part.color, inDrawing: false },
  };
}

/** The shape fields of an anchored part. */
export function anchoredPart(anchor: Anchor): ShapePart {
  return { image: anchor.image, part: anchor.part.id, color: anchor.part.color, inDrawing: true };
}

/** Whether two shapes are drawn as the same part, or both as none. */
export function samePart(a: ShapePart | undefined, b: ShapePart | undefined): boolean {
  if (a === b) return true;
  return (
    a !== undefined &&
    b !== undefined &&
    a.image === b.image &&
    a.part === b.part &&
    a.color === b.color &&
    a.inDrawing === b.inDrawing
  );
}

/** Whether two drawings draw their pictures in the same place, at the same scale, or both none. */
export function samePicture(a: DrawingPicture | undefined, b: DrawingPicture | undefined): boolean {
  if (a === b) return true;
  return (
    a !== undefined &&
    b !== undefined &&
    a.scale === b.scale &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}

const partOrders = new WeakMap<CleanedImage, Map<string, number>>();

/** Where each named part of a picture comes in its document order, which anchored parts draw in. */
export function partOrderOf(image: CleanedImage): ReadonlyMap<string, number> {
  let order = partOrders.get(image);
  if (!order) {
    order = new Map(partsOf(image).map((part, at) => [part.id, at]));
    partOrders.set(image, order);
  }
  return order;
}

/** The catalog-free reading of which image an id names, for the definitions a scene is built with. */
export type ShownImage = (image: Id) => CleanedImage | undefined;

/** A way to read the images drawn with a set of definitions, as the scene sets their catalog. */
export type ImagesOf = (definitions: Definitions) => ShownImage;
