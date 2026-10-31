/**
 * What the scene does for solids (ADR 0075): where a shape's solid is drawn, which parts of it are
 * anchored in a drawing with parts, and where their points lie. A solid is drawn as its picture,
 * which the solid worker makes off the page's thread; the scene only places it, and says what the
 * picture is drawn from, so that it can be asked for by its key (`solidPictureKey`).
 *
 * - **Placement.** A solid is placed on its shape as an image of that placement is
 *   (`shape-images.ts`): an icon beside the name, in a header or in a row; a drawing on a plate
 *   above its name band; or the picture of a drawing with parts, under its header. Its picture is
 *   square unless the shape gives it another shape: a drawing with parts whose size the view stores
 *   fits its picture to its body. When an appearance shows both an image and a solid, the solid is
 *   drawn.
 * - **A drawing with parts** that shows a solid draws its picture at 320 canvas units a side, or
 *   fitted to the body of the size the view stores. Its contents anchored to the solid's named parts
 *   are drawn in the picture, as those parts, with no positions of their own: each one's shape is
 *   the dot around its part's point, placed with the core's `placeSolidPoint`, where relations end.
 * - **A part drawn on its own**, outside such a drawing, is its solid's picture with only that part
 *   shown (`only`), fitted by the worker to the part's bounds, as the drawing of its shape.
 * - **Until a picture exists**, the shape draws its placeholder: its outline, its name and a mark
 *   where the picture goes. A solid past its package's or the project's total of files never gets
 *   one (`placeholder`).
 *
 * Pure, with no PixiJS and no three.js, as the scene is.
 */
import {
  fitSolidCamera,
  placeSolidPoint,
  solidShownBy,
  type Definitions,
  type Placement,
  type ResolvedAppearance,
  type SolidCatalog,
} from '@visual-anything/core';
import type {
  Appearance,
  Color,
  Id,
  PartReference,
  ShapePosition,
  SolidCamera,
  SolidDefinition,
  SpacePoint,
} from '@visual-anything/schema';
import type { Point, Rect } from './geometry';
import type { ContainerRoom, DrawingPicture, SolidShapePart } from './partShapes';
import { placePicture, sameRect, type ImageHolder } from './shape-images';

/** The side of a drawing with parts' picture of a solid, unless the view stores the drawing's size. */
export const SOLID_DRAWING_SIDE = 320;

/** The radius of the dot that marks an anchored part's point, where relations end: 3 canvas units. */
export const SOLID_POINT_RADIUS = 3;

/** The solid an element's shapes show, as its appearances resolve it: what its shapes' drawing needs. */
export interface SolidLook {
  /** The solid's id. */
  id: Id;
  definition: SolidDefinition;
  /** As the appearance asks, `drawing` unless it says otherwise. */
  placement: 'icon' | 'drawing' | 'parts';
  /** The appearance's camera, or else the solid's own. */
  camera: SolidCamera;
  lighting: 'studio' | 'flat';
  /** Present for a part drawn on its own: the index of the only part its picture shows. */
  only?: number;
  /** Whether its file lies past its package's or the project's total: it draws its placeholder. */
  placeholder: boolean;
}

/** A solid placed on a shape (ADR 0075). */
export interface ShapeSolid {
  /** The solid's id, as the appearance names it. */
  id: Id;
  /** The hash of its file, which its pictures are drawn from. */
  hash: string;
  /**
   * How the canvas draws it: beside the name, in a header, as the shape's whole drawing, or as the
   * picture of a drawing with parts, under its header.
   */
  placement: 'icon' | 'header' | 'drawing' | 'parts';
  camera: SolidCamera;
  lighting: 'studio' | 'flat';
  /** Where its picture is drawn. */
  rect: Rect;
  /** The square an icon is fitted in, or a drawing's plate. */
  box: Rect;
  /** A drawing's name band, across the shape under the plate. */
  band?: Rect;
  /**
   * The indexes of the parts its picture is drawn without, ascending; absent when it draws them all.
   * The scene hides none on its own: the canvas gives a picture without the parts a filter or
   * isolation hides (`withHiddenParts`).
   */
  hidden?: readonly number[];
  /** For a part drawn on its own: the index of the only part shown, fitted to its bounds. */
  only?: number;
  /** Present when its file lies past its package's or the project's total: it draws its placeholder. */
  placeholder?: true;
}

const catalogs = new WeakMap<Definitions, SolidCatalog>();

/**
 * Says which solids the elements drawn with these definitions show: the scene gives the catalog of
 * the packages the definitions come from, once per build.
 */
export function setSolidCatalog(definitions: Definitions, catalog: SolidCatalog): void {
  catalogs.set(definitions, catalog);
}

const partIndexes = new WeakMap<SolidDefinition, Map<string, number>>();

/** The index of a solid's part by its name, in its parts' depth-first order. */
export function solidPartIndex(definition: SolidDefinition, name: string): number | undefined {
  let byName = partIndexes.get(definition);
  if (!byName) {
    byName = new Map();
    definition.parts.forEach((part, at) => {
      if (!byName?.has(part.name)) byName?.set(part.name, at);
    });
    partIndexes.set(definition, byName);
  }
  return byName.get(name);
}

/**
 * The solid an element's shapes show: for a part drawn on its own, the part's solid with only that
 * part; otherwise its own appearance's or its component's, through the catalog. None when no
 * appearance shows one, or the solid is one no package defines (`unknown-solid`), whose image, if
 * any, is drawn instead.
 */
export function solidLookOf(
  element: { component: Id; appearance?: Appearance },
  appearance: ResolvedAppearance,
  definitions: Definitions,
): SolidLook | undefined {
  const catalog = catalogs.get(definitions);
  if (!catalog) return undefined;
  const shown = solidShownBy(element, definitions);
  const reference = appearance.part;
  if (reference?.solid !== undefined) {
    const defined = catalog.solid(reference.solid);
    const only = defined && solidPartIndex(defined.definition, reference.part);
    if (defined && only !== undefined) {
      // From the camera and in the light its element shows that solid with, when it shows it.
      const same = shown?.solid === reference.solid ? shown : undefined;
      return {
        id: reference.solid,
        definition: defined.definition,
        placement: 'drawing',
        camera: same?.camera ?? defined.definition.camera,
        lighting: same?.lighting ?? 'studio',
        only,
        placeholder: catalog.pastTotal.has(reference.solid),
      };
    }
  }
  if (!shown) return undefined;
  const defined = catalog.solid(shown.solid);
  if (!defined) return undefined;
  return {
    id: shown.solid,
    definition: defined.definition,
    placement: shown.placement ?? 'drawing',
    camera: shown.camera ?? defined.definition.camera,
    lighting: shown.lighting ?? 'studio',
    placeholder: catalog.pastTotal.has(shown.solid),
  };
}

/** The solid a drawing with parts shows, as its look has it; none for any other shape. */
export function drawingSolid(
  look: { appearance: ResolvedAppearance; solid: SolidLook | undefined },
  collapsedWithContents: boolean,
): SolidLook | undefined {
  const { solid } = look;
  return solid?.placement === 'parts' &&
    solid.only === undefined &&
    !look.appearance.contentsAsRows &&
    !collapsedWithContents
    ? solid
    : undefined;
}

/**
 * Where a drawing with parts draws its solid's picture, from its top left: under its header and inset
 * as a container's contents are, 320 units a side, or fitted to the body of the size the view stores:
 * its width and height when it stores both, else a square of the one it stores. At least a unit a
 * side, the drawing growing to hold it.
 */
export function solidPictureIn(
  appearance: ResolvedAppearance,
  position: ShapePosition | undefined,
  room: ContainerRoom,
): DrawingPicture {
  let width = SOLID_DRAWING_SIDE;
  let height = SOLID_DRAWING_SIDE;
  const stored = { width: position?.width, height: position?.height };
  if (stored.width !== undefined || stored.height !== undefined) {
    const bodyWidth = (stored.width ?? appearance.width) - 2 * room.padding;
    const bodyHeight = (stored.height ?? appearance.height) - room.header - room.padding;
    if (stored.width !== undefined && stored.height !== undefined) {
      width = bodyWidth;
      height = bodyHeight;
    } else {
      width = height = stored.width !== undefined ? bodyWidth : bodyHeight;
    }
  }
  const side = (value: number) => (Number.isFinite(value) ? Math.max(1, value) : 1);
  return {
    rect: { x: room.padding, y: room.header, width: side(width), height: side(height) },
    scale: 1,
  };
}

/** Where a content of a drawing with parts is drawn as one of its solid's parts. */
export interface SolidAnchor {
  solid: Id;
  /** The part's name. */
  part: string;
  /** Its index in the solid's parts. */
  index: number;
  /** The top left of the dot around its point, from its drawing's top left, and the dot's size. */
  offset: Point;
  width: number;
  height: number;
}

/**
 * Where a part's point lies in its solid: its own point, or for a part that draws nothing of its own,
 * the point of the first part it holds that has one, in depth-first order; none when none has one.
 */
export function solidPartPoint(definition: SolidDefinition, index: number): SpacePoint | undefined {
  const { parts } = definition;
  const own = parts[index]?.point;
  if (own) return own;
  const inside = new Set([index]);
  for (let at = index + 1; at < parts.length; at++) {
    const part = parts[at];
    if (part?.parent === undefined || !inside.has(part.parent)) break;
    inside.add(at);
    if (part.point) return part.point;
  }
  return undefined;
}

/**
 * Which contents of a drawing with parts are anchored to its solid's parts, in their order: a content
 * whose appearance names one of the solid's parts, with this solid or with neither a solid nor an
 * image, the first for each part. Each is placed at its part's point, projected by the drawing's
 * camera onto its picture; a part with no point of its own, nor any in what it holds, at the
 * picture's middle.
 */
export function solidAnchorsIn(
  solid: SolidLook,
  picture: DrawingPicture,
  contents: readonly Placement[],
  partOf: (content: Placement) => PartReference | undefined,
): (SolidAnchor | undefined)[] {
  const taken = new Set<string>();
  const { rect } = picture;
  let fitted: ReturnType<typeof fitSolidCamera> | undefined;
  return contents.map((content) => {
    const reference = partOf(content);
    if (!reference || reference.image !== undefined) return undefined;
    if (reference.solid !== undefined && reference.solid !== solid.id) return undefined;
    if (taken.has(reference.part)) return undefined;
    const index = solidPartIndex(solid.definition, reference.part);
    if (index === undefined) return undefined;
    taken.add(reference.part);
    const point = solidPartPoint(solid.definition, index);
    fitted ??= fitSolidCamera(solid.definition.bounds, solid.camera, rect.width / rect.height);
    const placed = point
      ? placeSolidPoint(fitted, point, rect)
      : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return {
      solid: solid.id,
      part: reference.part,
      index,
      offset: { x: placed.x - SOLID_POINT_RADIUS, y: placed.y - SOLID_POINT_RADIUS },
      width: 2 * SOLID_POINT_RADIUS,
      height: 2 * SOLID_POINT_RADIUS,
    };
  });
}

/** Whether a content's anchor is to a solid's part, rather than to an image's. */
export function isSolidAnchor(anchor: object): anchor is SolidAnchor {
  return 'solid' in anchor && 'index' in anchor;
}

/** The shape fields of a part anchored in a drawing of its solid, its point not yet placed. */
export function solidAnchoredPart(anchor: SolidAnchor, color: Color): SolidShapePart {
  return { solid: anchor.solid, part: anchor.part, index: anchor.index, color, inDrawing: true };
}

/** The shape fields of a solid's part drawn on its own, outside a drawing of its solid. */
export function ownSolidPart(
  solid: SolidLook | undefined,
  color: Color,
): SolidShapePart | undefined {
  if (solid?.only === undefined) return undefined;
  const part = solid.definition.parts[solid.only];
  if (!part) return undefined;
  return { solid: solid.id, part: part.name, index: solid.only, color, inDrawing: false };
}

/** An anchored part's point: the middle of its dot, worked out alike however its shape was placed. */
export function solidPointOf(rect: Rect): Point {
  return { x: rect.x + SOLID_POINT_RADIUS, y: rect.y + SOLID_POINT_RADIUS };
}

/** What a solid is placed from: what its look says of it. */
type SolidPlacing = Pick<SolidLook, 'id' | 'camera' | 'lighting' | 'only'> & {
  hash: string;
  placement: 'icon' | 'drawing' | 'parts';
  placeholder: boolean;
};

/** A solid placed on a shape, with the plate a drawing puts in place of its shape's rectangle. */
export interface PlacedSolid {
  solid: ShapeSolid;
  plate?: Rect;
}

/**
 * Places an element's solid on one of its shapes, as an image of its placement is placed, its picture
 * square; `hasDetail` says whether the shape writes a detail under its name, which a drawing's band
 * makes room for.
 */
export function placeSolid(
  look: SolidLook | undefined,
  holder: ImageHolder,
  hasDetail = false,
): PlacedSolid | undefined {
  if (!look) return undefined;
  return placing(
    {
      id: look.id,
      hash: look.definition.hash,
      placement: look.placement,
      camera: look.camera,
      lighting: look.lighting,
      placeholder: look.placeholder,
      ...(look.only === undefined ? {} : { only: look.only }),
    },
    holder,
    hasDetail,
  );
}

function placing(
  look: SolidPlacing,
  holder: ImageHolder,
  hasDetail: boolean,
): PlacedSolid | undefined {
  const placed = placePicture({ width: 1, height: 1 }, look.placement, holder, hasDetail);
  if (!placed) return undefined;
  const { plate, ...where } = placed;
  const solid: ShapeSolid = {
    id: look.id,
    hash: look.hash,
    ...where,
    camera: look.camera,
    lighting: look.lighting,
  };
  if (look.only !== undefined) solid.only = look.only;
  if (look.placeholder) solid.placeholder = true;
  return { solid, ...(plate ? { plate } : {}) };
}

/**
 * A shape's solid and plate placed again on its rectangle moved to `rect`, as `placeSolid` places them
 * on a shape built from nothing there: the same sums in the same order (`placedAgain`).
 */
export function solidPlacedAgain(
  shape: {
    kind: ImageHolder['kind'];
    solid?: ShapeSolid;
    holdsContents: boolean;
    collapsed?: unknown;
    rowCount?: number;
    row?: number;
    outline?: ImageHolder['outline'];
    detail?: string;
  },
  rect: Rect,
  picture: Rect | undefined,
): { solid?: ShapeSolid; plate?: Rect } {
  const { solid } = shape;
  if (!solid) return {};
  const placed = placing(
    {
      id: solid.id,
      hash: solid.hash,
      placement:
        solid.placement === 'drawing' || solid.placement === 'parts' ? solid.placement : 'icon',
      camera: solid.camera,
      lighting: solid.lighting,
      placeholder: solid.placeholder === true,
      ...(solid.only === undefined ? {} : { only: solid.only }),
    },
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
  if (!placed) return {};
  // Its hidden parts are the canvas's, and move with it.
  if (solid.hidden) placed.solid.hidden = solid.hidden;
  return placed;
}

/** Whether two cameras look alike. */
export function sameCamera(a: SolidCamera, b: SolidCamera): boolean {
  return (
    a === b ||
    (a.azimuth === b.azimuth &&
      a.elevation === b.elevation &&
      a.zoom === b.zoom &&
      a.projection === b.projection &&
      a.target?.x === b.target?.x &&
      a.target?.y === b.target?.y &&
      a.target?.z === b.target?.z)
  );
}

function sameIndexes(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (a === b) return true;
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((each, at) => each === y[at]);
}

/** Whether two placed solids draw alike. */
export function sameShapeSolid(a: ShapeSolid | undefined, b: ShapeSolid | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.hash === b.hash &&
    a.placement === b.placement &&
    a.lighting === b.lighting &&
    a.only === b.only &&
    a.placeholder === b.placeholder &&
    sameCamera(a.camera, b.camera) &&
    sameIndexes(a.hidden, b.hidden) &&
    sameRect(a.rect, b.rect) &&
    sameRect(a.box, b.box) &&
    sameRect(a.band, b.band)
  );
}

function cameraKey(camera: SolidCamera): string {
  const { target } = camera;
  return [
    camera.azimuth,
    camera.elevation,
    camera.zoom ?? 1,
    camera.projection ?? 'perspective',
    target ? `${target.x},${target.y},${target.z}` : 'middle',
  ].join(' ');
}

/**
 * The key a shape's solid's picture is kept and asked for by (ADR 0075), the same for every shape that
 * draws the same picture: the solid's file, its lighting, its camera, the aspect of its picture, its
 * hidden parts, the part it shows alone, and whether it comes with its part buffer, which a drawing
 * with parts needs. The solid client adds the bucket. None for a shape without a solid, or one that
 * draws its placeholder whatever comes.
 */
export function solidPictureKey(shape: { solid?: ShapeSolid }): string | undefined {
  const { solid } = shape;
  if (!solid || solid.placeholder) return undefined;
  const aspect = Math.round((solid.rect.width / solid.rect.height) * 10_000) / 10_000;
  return [
    solid.hash,
    solid.lighting,
    cameraKey(solid.camera),
    `aspect ${Number.isFinite(aspect) && aspect > 0 ? aspect : 1}`,
    `hiding ${(solid.hidden ?? []).join(',')}`,
    `only ${solid.only ?? ''}`,
    solid.placement === 'parts' ? 'with parts' : 'alone',
  ].join('|');
}

/** A shape with its solid drawn without these parts, as a filter or isolation hides them. */
export function withHiddenParts<T extends { solid?: ShapeSolid }>(
  shape: T,
  hidden: readonly number[],
): T {
  const { solid } = shape;
  if (!solid) return shape;
  const sorted = [...new Set(hidden)].sort((a, b) => a - b);
  if (sameIndexes(sorted, solid.hidden)) return shape;
  const next: ShapeSolid = { ...solid };
  if (sorted.length > 0) next.hidden = sorted;
  else delete next.hidden;
  return { ...shape, solid: next };
}
