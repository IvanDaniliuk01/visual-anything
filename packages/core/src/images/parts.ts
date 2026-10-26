/**
 * The named parts of an SVG image (ADR 0067): the elements of its cleaned view that have an id and
 * draw something, read with the cleaner's own reader and never from the stored text. Each part has
 * an outline in the image's own units, made of what it fills, by each shape's own fill rule, and what
 * it strokes, as bands of the stroke's width, with transforms, nested viewports and `use` applied; its
 * bounds; and its main color. A part's own picture and its outline as free geometry come from the same
 * reading. Everything is kept for each cleaned view, as cleaned images are, and bounded by caps.
 */
import type { Color, Id, ImageDefinition } from '@visual-anything/schema';
import { IDENTITY, multiply, transformContour, translation, type Matrix } from '../geometry/affine';
import { flatPointCount, flatten } from '../geometry/fit';
import {
  boundsOf,
  classContours,
  ellipseContour,
  type Box,
  type GeometryInput,
  type Outline,
  type OutlineContour,
} from '../geometry/outline';
import { readPathData, readPolygonPoints, type Segment } from '../geometry/path';
import { rankPolyline, simplifyToBudget, type RankedPolyline } from '../geometry/simplify';
import { problem, type Problem } from '../problems';
import type { ImageCatalog } from './catalog';
import type { CleanedImage } from './cleaned';
import { geometryFromOutline } from './part-geometry';
import { indexElements, pictureOfPart, type ElementIndex } from './part-picture';
import { SVG_KINDS, readCleanedSvg, type CleanedSvg, type SvgNode } from './svg';
import {
  readColor,
  readLength,
  readNumber,
  readTransform,
  readViewBox,
  viewBoxTransform,
  type ReadColor,
  type ViewBox,
} from './svg-values';

/** The caps on reading a picture's named parts (ADR 0067), besides the picture's own (ADR 0027). */
export const PART_CAPS = {
  /** Named parts a picture lists, in document order; opening warns `too-many-parts` past them. */
  parts: 1024,
  /**
   * Points of a part's outline, flattened to a quarter unit as the picture is drawn {@link side}
   * units a side; an outline past them is simplified to them.
   */
  points: 4096,
  /** The size a picture is taken as drawn at, on its longer side, to count its parts' points. */
  side: 1600,
  /**
   * Segments of shapes read in all, each `use` drawing its own copy: past them, the shapes that
   * follow in document order are left out of every outline. The picture's own 64 KiB of text holds
   * at most about 20,000, so only `use` drawn over and over reaches this.
   */
  segments: 100_000,
  /** Coordinates past this, once transformed, leave their shape out of every outline. */
  coordinate: 1e9,
} as const;

/** A named part of an SVG image, read from its cleaned view. */
export interface NamedPart {
  /** Its id, which is its name. */
  readonly id: string;
  /**
   * What it fills and strokes, in the image's own units measured from the top left of its view box,
   * in a box the size of the view box that keeps its proportions: fitted to the rectangle the picture
   * is drawn in, it lands where the picture draws the part. Each shape it fills is one fill, read by
   * the shape's own rule, and the outline holds what any of them holds; each stroke is a line with
   * its width. Past {@link PART_CAPS.points}, its contours are simplified into straight pieces.
   */
  readonly outline: Outline;
  /** Its bounds in the outline's coordinates, its strokes' bands included. */
  readonly bounds: Box;
  /**
   * Its main color: the fill of its largest filled shape, a gradient's middle stop; for a part that
   * only strokes, the stroke of its largest stroked shape. `#RRGGBB`.
   */
  readonly color: Color;
}

/** The named parts of a cleaned picture, in document order, at most {@link PART_CAPS.parts}. */
export function partsOf(cleaned: CleanedImage): readonly NamedPart[] {
  return readingOf(cleaned).parts;
}

/** A named part of a cleaned picture by its id, among those it lists. */
export function namedPart(cleaned: CleanedImage, id: string): NamedPart | undefined {
  return readingOf(cleaned).byId.get(id);
}

/** How many named parts a cleaned picture has, those past the cap included. */
export function namedPartCount(cleaned: CleanedImage): number {
  return readingOf(cleaned).total;
}

/**
 * A picture of one part alone, as ADR 0067 makes it: its element inside copies of its ancestors that
 * keep only their transforms and paint, the definitions it refers to, in an `svg` whose view box is
 * the part's bounds, all cleaned again. It is a cleaned image of its own, with the id
 * `<image id>#<part id>`, drawn as any picture is; the same object comes back each time.
 * `undefined` for an id that is not one of the parts listed, or when cleaning refuses the picture.
 */
export function partPicture(cleaned: CleanedImage, id: string): CleanedImage | undefined {
  if (cleaned.kind !== 'svg') return undefined;
  let byPart = pictures.get(cleaned);
  if (!byPart) {
    byPart = new Map();
    pictures.set(cleaned, byPart);
  }
  const known = byPart.get(id);
  if (known !== undefined) return known ?? undefined;
  const content = readingOf(cleaned).picture(id);
  const drawn = content
    ? ({
        kind: 'svg',
        id: `${cleaned.id}#${id}`,
        name: id,
        ...(cleaned.source === undefined ? {} : { source: cleaned.source }),
        ...(cleaned.license === undefined ? {} : { license: cleaned.license }),
        width: content.width,
        height: content.height,
        svg: content.svg,
      } as CleanedImage)
    : null;
  byPart.set(id, drawn);
  return drawn ?? undefined;
}

/**
 * A part's outline, or the whole picture's when `id` is left out, as free geometry within ADR 0066's
 * caps: path contours in a box of its bounds, keeping proportions, simplified to fit. Free geometry
 * reads its contours by the even-odd rule, so what is written is the boundary of what the part
 * covers, its curves kept where its contours cross nothing. `undefined` for an id that is not one of
 * the parts listed, or for a picture that draws nothing.
 */
export function geometryOf(cleaned: CleanedImage, id?: string): GeometryInput | undefined {
  return readingOf(cleaned).geometry(id);
}

/**
 * The anchored parts that replacing a picture loses: those of `anchored`, each once and in order,
 * that the picture before lists and the one after does not. A part the picture before did not list
 * either is not lost by the replacement. With nothing after, every part listed before is lost.
 */
export function lostParts(
  before: CleanedImage | undefined,
  after: CleanedImage | undefined,
  anchored: Iterable<string>,
): string[] {
  const had = before === undefined ? undefined : readingOf(before).byId;
  const has = after === undefined ? undefined : readingOf(after).byId;
  const lost: string[] = [];
  const seen = new Set<string>();
  for (const id of anchored) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (had?.has(id) && !has?.has(id)) lost.push(id);
  }
  return lost;
}

/** The named part an appearance's `part` names, found in its image. */
export interface FoundPart {
  readonly imageId: Id;
  readonly image: CleanedImage;
  readonly part: NamedPart;
}

/**
 * Finds the named part an appearance names, written as `{ part, image? }`: in `image`, or, when that
 * is left out, in `containerImage`, the image the element's container shows with its parts.
 * `undefined` when neither names an image the catalog draws, or that image does not list the part.
 */
export function findPart(
  reference: { readonly part: string; readonly image?: Id },
  catalog: ImageCatalog,
  containerImage?: Id,
): FoundPart | undefined {
  const imageId = reference.image ?? containerImage;
  if (imageId === undefined) return undefined;
  const image = catalog.shown(imageId);
  if (!image) return undefined;
  const found = namedPart(image, reference.part);
  return found ? { imageId, image, part: found } : undefined;
}

/**
 * The `unknown-part` warning for an appearance whose part its image lacks, found as {@link findPart}
 * finds it. None when no image is named, or when the image is not drawn at all, which `unknown-image`
 * and the image's own warnings cover. `owner` is what holds the appearance, by id and in words, such
 * as `The element "Left ventricle"`.
 */
export function unknownPartProblem(
  reference: { readonly part: string; readonly image?: Id },
  catalog: ImageCatalog,
  owner: { readonly id: Id; readonly label: string },
  containerImage?: Id,
): Problem | undefined {
  const imageId = reference.image ?? containerImage;
  if (imageId === undefined) return undefined;
  const image = catalog.shown(imageId);
  if (!image || namedPart(image, reference.part)) return undefined;
  const name = catalog.image(imageId)?.definition.name ?? imageId;
  const why = readingOf(image).drawn.has(reference.part)
    ? `past the first ${PART_CAPS.parts.toLocaleString('en')} parts it lists`
    : 'which it does not have';
  return problem(
    'unknown-part',
    `${owner.label} is drawn as the part "${reference.part}" of the image "${name}" (${imageId}), ${why}; it is drawn as an ordinary shape until the picture has that part again.`,
    [owner.id, imageId],
  );
}

/** The image a `part` names, for `in-use`: removing it is refused while a `part` names it. */
export function partImageId(
  reference: { readonly part: string; readonly image?: Id } | 'none' | undefined,
): Id | undefined {
  return reference === undefined || reference === 'none' ? undefined : reference.image;
}

/** The `too-many-parts` warning for a picture with more named parts than it lists. */
export function tooManyPartsProblem(
  image: Pick<ImageDefinition, 'id' | 'name'>,
  cleaned: CleanedImage,
  packageId: Id,
): Problem | undefined {
  // No picture with fewer ids than the cap can be past it: counting them reads nothing.
  if (cleaned.kind !== 'svg' || idsIn(cleaned.svg) <= PART_CAPS.parts) return undefined;
  const count = namedPartCount(cleaned);
  if (count <= PART_CAPS.parts) return undefined;
  return problem(
    'too-many-parts',
    `The image "${image.name}" (${image.id}) has ${count.toLocaleString('en')} named parts; only its first ${PART_CAPS.parts.toLocaleString('en')}, in document order, can be drawn as parts.`,
    [image.id, packageId],
  );
}

function idsIn(svg: string): number {
  let count = 0;
  for (let at = svg.indexOf(' id="'); at !== -1; at = svg.indexOf(' id="', at + 1)) count += 1;
  return count;
}

/** Keeps the readings of only the cleaned texts given, as the cleaned images' cache is pruned. */
export function pruneImageParts(cleanedTexts: ReadonlySet<string>): void {
  for (const text of readingsByText.keys())
    if (!cleanedTexts.has(text)) readingsByText.delete(text);
}

// --- Readings ------------------------------------------------------------------------------------

/** A part's outline and bounds, before it is a named part. */
interface Shaped {
  readonly outline: Outline;
  readonly bounds: Box;
}

/** Everything read of one cleaned picture's parts. */
interface Reading {
  readonly parts: readonly NamedPart[];
  readonly byId: ReadonlyMap<string, NamedPart>;
  /** The named parts that draw something, listed or past the cap, by id, with their elements. */
  readonly drawn: ReadonlyMap<string, SvgNode>;
  readonly total: number;
  picture(id: string): CleanedSvg | undefined;
  geometry(id: string | undefined): GeometryInput | undefined;
}

const EMPTY: Reading = {
  parts: Object.freeze([]),
  byId: new Map(),
  drawn: new Map(),
  total: 0,
  picture: () => undefined,
  geometry: () => undefined,
};

/** Readings by cleaned text, so that equal content is read once; pruned with the cleaned images. */
const readingsByText = new Map<string, Reading>();
const readingsByImage = new WeakMap<CleanedImage, Reading>();
const pictures = new WeakMap<CleanedImage, Map<string, CleanedImage | null>>();

function readingOf(cleaned: CleanedImage): Reading {
  let reading = readingsByImage.get(cleaned);
  if (reading) return reading;
  if (cleaned.kind !== 'svg') reading = EMPTY;
  else {
    reading = readingsByText.get(cleaned.svg);
    if (!reading) {
      reading = read(cleaned.svg);
      readingsByText.set(cleaned.svg, reading);
    }
  }
  readingsByImage.set(cleaned, reading);
  return reading;
}

function read(svg: string): Reading {
  const root = readCleanedSvg(svg);
  const box = readViewBox(root?.attributes.get('viewBox'));
  if (!root || !box || !(box.width > 0 && box.height > 0)) return EMPTY;
  const walker = new Walker(root, box);
  walker.walkRoot();
  const parts: NamedPart[] = [];
  const byId = new Map<string, NamedPart>();
  const drawn = new Map<string, SvgNode>();
  for (const opened of walker.opened) {
    if (opened.drawings.length === 0) continue;
    drawn.set(opened.id, opened.node);
    if (parts.length >= PART_CAPS.parts) continue;
    const { outline, bounds } = walker.outlineOf(opened.drawings);
    const found: NamedPart = Object.freeze({
      id: opened.id,
      outline,
      bounds,
      color: mainColor(opened.drawings),
    });
    parts.push(found);
    byId.set(opened.id, found);
  }
  const whole = walker.drawings.length > 0 ? walker.outlineOf(walker.drawings) : undefined;
  let elements: ElementIndex | undefined;
  const picturesById = new Map<string, CleanedSvg | null>();
  const geometries = new Map<string, GeometryInput | null>();
  return {
    parts: Object.freeze(parts),
    byId,
    drawn,
    total: drawn.size,
    picture(id) {
      const found = byId.get(id);
      const node = drawn.get(id);
      if (!found || !node) return undefined;
      let content = picturesById.get(id);
      if (content === undefined) {
        elements ??= indexElements(root);
        content = pictureOfPart(root, elements, node, found.bounds, box) ?? null;
        picturesById.set(id, content);
      }
      return content ?? undefined;
    },
    geometry(id) {
      const key = id === undefined ? '' : `#${id}`;
      let geometry = geometries.get(key);
      if (geometry === undefined) {
        const target = id === undefined ? whole : byId.get(id);
        geometry = target ? (geometryFromOutline(target.outline, target.bounds) ?? null) : null;
        geometries.set(key, geometry);
      }
      return geometry ?? undefined;
    },
  };
}

// --- Walking the picture -------------------------------------------------------------------------

/** What one shape draws, once, wherever it is drawn: its outline's pieces and what they weigh. */
interface Drawing {
  /** Its fill's closed contours, classed by its rule; none when it fills nothing. */
  readonly fills: readonly OutlineContour[];
  /** Its stroke, as lines with its width; none when it strokes nothing. */
  readonly lines: readonly OutlineContour[];
  /** Its bounds, its stroke's bands included. */
  readonly bounds: Box;
  /** Its points, flattened as the cap on points counts them. */
  readonly points: number;
  readonly fillArea: number;
  readonly fillColor: ReadColor | undefined;
  readonly strokeArea: number;
  readonly strokeColor: ReadColor | undefined;
}

/** A named part as the walk meets it: its id, its element and what it draws. */
interface Opened {
  readonly id: string;
  readonly node: SvgNode;
  readonly drawings: Drawing[];
}

/** Paint as an element passes it on to what it holds. */
interface Paint {
  readonly fill: ReadColor | null;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly stroke: ReadColor | null;
  readonly strokeWidth: number;
  readonly visible: boolean;
  readonly color: ReadColor;
}

const INITIAL: Paint = {
  fill: '#000000',
  fillRule: 'nonzero',
  stroke: null,
  strokeWidth: 1,
  visible: true,
  color: '#000000',
};

const PAINT_ATTRIBUTES = ['fill', 'fill-rule', 'stroke', 'stroke-width', 'visibility', 'color'];

/** The elements that can be named parts. */
const PART_ELEMENTS: ReadonlySet<string> = new Set(['g', 'use', 'svg', ...SVG_KINDS.shapes]);

/** Of a viewport: its size, which lengths in percent are measured on. */
interface Size {
  readonly width: number;
  readonly height: number;
}

class Walker {
  readonly opened: Opened[] = [];
  readonly drawings: Drawing[] = [];
  readonly byId = new Map<string, SvgNode>();
  /** A quarter unit of the picture drawn 1,600 a side, in its own units. */
  readonly tolerance: number;
  #open: Opened[] = [];
  #segments = 0;
  #exhausted = false;
  readonly #gradients = new Map<string, ReadColor | null>();
  readonly #ranks = new WeakMap<readonly Segment[], RankedPolyline>();
  /** Each shape's own geometry, by the size of the viewport its lengths are measured on. */
  readonly #shapes = new Map<SvgNode, Map<string, ShapeGeometry | null>>();

  constructor(
    readonly root: SvgNode,
    readonly box: ViewBox,
  ) {
    this.tolerance = (0.25 * Math.max(box.width, box.height)) / PART_CAPS.side;
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop() as SvgNode;
      const id = node.attributes.get('id');
      if (id !== undefined && !this.byId.has(id)) this.byId.set(id, node);
      stack.push(...node.children);
    }
  }

  walkRoot(): void {
    const { root, box } = this;
    const start = multiply(
      translation(-box.x, -box.y),
      readTransform(root.attributes.get('transform')) ?? IDENTITY,
    );
    const size = { width: box.width, height: box.height };
    const paint = this.paintOf(root, INITIAL, size);
    for (const child of root.children) this.walk(child, start, paint, size, false);
  }

  walk(node: SvgNode, m: Matrix, inherited: Paint, size: Size, inUse: boolean): void {
    if (this.#exhausted) return;
    const { name, attributes } = node;
    if (SVG_KINDS.notDrawnInside.has(name) || !PART_ELEMENTS.has(name)) return;
    if (attributes.get('display')?.trim() === 'none') return;
    const paint = this.paintOf(node, inherited, size);
    const id = attributes.get('id');
    const opens = !inUse && id !== undefined;
    if (opens) {
      const opened: Opened = { id, node, drawings: [] };
      this.opened.push(opened);
      this.#open.push(opened);
    }
    const local = multiply(m, readTransform(attributes.get('transform')) ?? IDENTITY);
    if (name === 'g') {
      for (const child of node.children) this.walk(child, local, paint, size, inUse);
    } else if (name === 'svg') {
      this.viewport(
        node,
        local,
        paint,
        size,
        inUse,
        attributes.get('width'),
        attributes.get('height'),
      );
    } else if (name === 'use') {
      this.use(node, local, paint, size);
    } else {
      this.shape(node, local, paint, size);
    }
    if (opens) this.#open.pop();
  }

  /** A nested `svg`, or a `symbol` drawn by a `use`: a viewport, with its view box fitted into it. */
  viewport(
    node: SvgNode,
    m: Matrix,
    paint: Paint,
    size: Size,
    inUse: boolean,
    widthText: string | undefined,
    heightText: string | undefined,
  ): void {
    const { attributes } = node;
    const x = readLength(attributes.get('x'), size.width) ?? 0;
    const y = readLength(attributes.get('y'), size.height) ?? 0;
    const width = readLength(widthText, size.width) ?? size.width;
    const height = readLength(heightText, size.height) ?? size.height;
    if (!(width > 0 && height > 0)) return;
    const viewBox = readViewBox(attributes.get('viewBox'));
    if (viewBox && !(viewBox.width > 0 && viewBox.height > 0)) return;
    const placed = viewBox
      ? viewBoxTransform(viewBox, attributes.get('preserveAspectRatio'), { x, y, width, height })
      : translation(x, y);
    const inner = viewBox ? { width: viewBox.width, height: viewBox.height } : { width, height };
    const within = multiply(m, placed);
    for (const child of node.children) this.walk(child, within, paint, inner, inUse);
  }

  /** A `use`: what it refers to drawn where it stands, inheriting its paint, opening no part. */
  use(node: SvgNode, m: Matrix, paint: Paint, size: Size): void {
    const { attributes } = node;
    const href = attributes.get('href');
    const target = href?.startsWith('#') ? this.byId.get(href.slice(1)) : undefined;
    if (!target || target.attributes.get('display')?.trim() === 'none') return;
    const x = readLength(attributes.get('x'), size.width) ?? 0;
    const y = readLength(attributes.get('y'), size.height) ?? 0;
    const placed = multiply(m, translation(x, y));
    const width = attributes.get('width');
    const height = attributes.get('height');
    if (target.name === 'symbol' || target.name === 'svg') {
      const own =
        target.name === 'svg'
          ? (readTransform(target.attributes.get('transform')) ?? IDENTITY)
          : IDENTITY;
      this.viewport(
        target,
        multiply(placed, own),
        this.paintOf(target, paint, size),
        size,
        true,
        width ?? target.attributes.get('width'),
        height ?? target.attributes.get('height'),
      );
    } else if (target.name === 'g' || SVG_KINDS.shapes.has(target.name)) {
      this.walk(target, placed, paint, size, true);
    }
  }

  /** What a shape draws: its fill by its rule, its stroke as lines, transformed into the picture. */
  shape(node: SvgNode, m: Matrix, paint: Paint, size: Size): void {
    if (!paint.visible) return;
    const filled = paint.fill !== null;
    const stroked = paint.stroke !== null && paint.strokeWidth > 0;
    if (!filled && !stroked) return;
    const geometry = this.geometryOf(node, size);
    if (!geometry) return;
    const local = geometry.subpaths.reduce((sum, subpath) => sum + subpath.segments.length + 1, 0);
    if (this.#segments + local * ((filled ? 1 : 0) + (stroked ? 1 : 0)) > PART_CAPS.segments) {
      this.#exhausted = true;
      return;
    }
    this.#segments += local * ((filled ? 1 : 0) + (stroked ? 1 : 0));
    // Every point finite and near enough, control points included: NaN never reaches an outline.
    const far = PART_CAPS.coordinate;
    const near = (point: { x: number; y: number }) =>
      Math.abs(point.x) <= far && Math.abs(point.y) <= far;
    const usable = (contour: OutlineContour) =>
      near(contour.start) &&
      contour.segments.every((segment) =>
        segment.kind === 'line'
          ? near(segment.to)
          : near(segment.c1) && near(segment.c2) && near(segment.to),
      );
    const fills: OutlineContour[] = [];
    if (filled && geometry.fillable) {
      for (const subpath of geometry.subpaths) {
        if (subpath.segments.length === 0) continue;
        const contour = transformContour(
          {
            start: subpath.start,
            segments: closed(subpath.start, subpath.segments),
            role: 'fill',
            ...(paint.fillRule === 'nonzero' ? { nonzero: true as const } : {}),
          },
          m,
        );
        if (!usable(contour)) continue;
        const { width, height } = boundsOf([contour]);
        if (width > 0 && height > 0) fills.push(contour);
      }
    }
    const lines: OutlineContour[] = [];
    if (stroked) {
      for (const subpath of geometry.subpaths) {
        if (subpath.segments.length === 0) continue;
        const contour = transformContour(
          {
            start: subpath.start,
            segments: subpath.closed ? closed(subpath.start, subpath.segments) : subpath.segments,
            role: 'line',
            width: paint.strokeWidth,
          },
          m,
        );
        const width = contour.width ?? 0;
        if (!usable(contour) || !(width > 0) || !Number.isFinite(width)) continue;
        const box = boundsOf([contour]);
        if (box.width > 0 || box.height > 0) lines.push(contour);
      }
    }
    if (fills.length === 0 && lines.length === 0) return;
    const classed = classContours(fills);
    const boxes = [
      ...(classed.length > 0 ? [boundsOf(classed)] : []),
      ...lines.map((line) => grown(boundsOf([line]), (line.width ?? 0) / 2)),
    ];
    let points = 0;
    for (const contour of [...classed, ...lines]) points += flatPointCount(contour, this.tolerance);
    const drawing: Drawing = {
      fills: classed,
      lines,
      bounds: union(boxes),
      points,
      fillArea: Math.abs(
        classed.reduce(
          (sum, contour) =>
            sum + (contour.role === 'hole' ? -1 : 1) * Math.abs(areaOf(contour, this.tolerance)),
          0,
        ),
      ),
      fillColor: classed.length > 0 ? (paint.fill ?? undefined) : undefined,
      strokeArea: lines.reduce(
        (sum, line) => sum + lengthOf(line, this.tolerance) * (line.width ?? 0),
        0,
      ),
      strokeColor: lines.length > 0 ? (paint.stroke ?? undefined) : undefined,
    };
    this.drawings.push(drawing);
    for (const opened of this.#open) opened.drawings.push(drawing);
  }

  /** A shape's own geometry, read once however many times a `use` draws it. */
  geometryOf(node: SvgNode, size: Size): ShapeGeometry | undefined {
    let bySize = this.#shapes.get(node);
    if (!bySize) {
      bySize = new Map();
      this.#shapes.set(node, bySize);
    }
    const key = `${size.width} ${size.height}`;
    let geometry = bySize.get(key);
    if (geometry === undefined) {
      geometry = shapeGeometry(node, size) ?? null;
      bySize.set(key, geometry);
    }
    return geometry ?? undefined;
  }

  /** The paint an element passes on: its own attributes over what it inherits. */
  paintOf(node: SvgNode, inherited: Paint, size: Size): Paint {
    const { attributes } = node;
    if (!PAINT_ATTRIBUTES.some((name) => attributes.has(name))) return inherited;
    const color = colorProperty(attributes.get('color'), inherited.color);
    const rule = attributes.get('fill-rule')?.trim();
    const visibility = attributes.get('visibility')?.trim();
    const width = attributes.get('stroke-width')?.trim();
    const strokeWidth =
      width === undefined || width === 'inherit'
        ? inherited.strokeWidth
        : readLength(width, Math.hypot(size.width, size.height) / Math.SQRT2);
    return {
      fill: this.paintValue(attributes.get('fill'), inherited.fill, color),
      fillRule: rule === 'evenodd' || rule === 'nonzero' ? rule : inherited.fillRule,
      stroke: this.paintValue(attributes.get('stroke'), inherited.stroke, color),
      strokeWidth:
        strokeWidth === undefined || strokeWidth < 0 ? inherited.strokeWidth : strokeWidth,
      visible:
        visibility === 'hidden' || visibility === 'collapse'
          ? false
          : visibility === 'visible'
            ? true
            : inherited.visible,
      color,
    };
  }

  /** A fill or stroke: none, a color, the current color, or a gradient's middle stop. */
  paintValue(
    value: string | undefined,
    inherited: ReadColor | null,
    current: ReadColor,
  ): ReadColor | null {
    if (value === undefined) return inherited;
    const text = value.trim();
    if (text === 'none') return null;
    if (text === 'inherit') return inherited;
    if (text.toLowerCase() === 'currentcolor') return current;
    const reference = /^url\(#([^)]+)\)$/.exec(text)?.[1];
    if (reference !== undefined) return this.gradientColor(reference);
    return readColor(text) ?? inherited;
  }

  /**
   * A gradient's middle stop, its own stops or those of the gradient it refers to; none for a
   * gradient without stops, or for paint that refers to what is no gradient, as SVG paints them.
   */
  gradientColor(id: string): ReadColor | null {
    const known = this.#gradients.get(id);
    if (known !== undefined) return known;
    let color: ReadColor | null = null;
    const seen = new Set<SvgNode>();
    for (
      let node = this.byId.get(id);
      node !== undefined && (node.name === 'linearGradient' || node.name === 'radialGradient');
    ) {
      if (seen.has(node)) break;
      seen.add(node);
      const stops = node.children.filter((child) => child.name === 'stop');
      if (stops.length > 0) {
        color = stopColor(stops[Math.floor((stops.length - 1) / 2)] as SvgNode);
        break;
      }
      const href = node.attributes.get('href');
      node = href?.startsWith('#') ? this.byId.get(href.slice(1)) : undefined;
    }
    this.#gradients.set(id, color);
    return color;
  }

  /** The outline and bounds of what drawings draw together, simplified past the cap on points. */
  outlineOf(drawings: readonly Drawing[]): Shaped {
    const filledShapes = drawings.filter((drawing) => drawing.fills.length > 0).length;
    let contours: OutlineContour[] = [];
    let group = 0;
    let points = 0;
    for (const drawing of drawings) {
      points += drawing.points;
      if (drawing.fills.length > 0) {
        for (const fill of drawing.fills)
          contours.push(filledShapes > 1 ? { ...fill, group } : fill);
        group += 1;
      }
      contours.push(...drawing.lines);
    }
    if (points > PART_CAPS.points) contours = this.simplified(contours);
    const bounds = union(drawings.map((drawing) => drawing.bounds));
    return {
      outline: {
        width: this.box.width,
        height: this.box.height,
        contours,
        bounds,
        keepProportions: true,
      },
      bounds,
    };
  }

  /** Contours flattened and simplified together to the cap on points, each ranked only once. */
  simplified(contours: readonly OutlineContour[]): OutlineContour[] {
    const ranked = contours.map((contour) => {
      let known = this.#ranks.get(contour.segments);
      if (!known) {
        known = rankPolyline(flatten(contour, this.tolerance).points, contour.role !== 'line');
        this.#ranks.set(contour.segments, known);
      }
      return known;
    });
    const kept = simplifyToBudget(ranked, PART_CAPS.points);
    return contours.flatMap((contour, at) => {
      const points = kept[at];
      if (points === undefined || points.length < 4) return [];
      const segments: Segment[] = [];
      for (let i = 2; i < points.length; i += 2) {
        segments.push({ kind: 'line', to: { x: points[i] as number, y: points[i + 1] as number } });
      }
      return [{ ...contour, start: { x: points[0] as number, y: points[1] as number }, segments }];
    });
  }
}

/** What a shape element draws, in its own coordinates: its subpaths, and whether it can fill. */
interface ShapeGeometry {
  readonly subpaths: readonly {
    readonly start: { x: number; y: number };
    readonly segments: readonly Segment[];
    readonly closed: boolean;
  }[];
  readonly fillable: boolean;
}

function shapeGeometry(node: SvgNode, size: Size): ShapeGeometry | undefined {
  const { attributes } = node;
  const along = (name: string, whole: number) => readLength(attributes.get(name), whole);
  const x = (name: string) => along(name, size.width);
  const y = (name: string) => along(name, size.height);
  const diagonal = Math.hypot(size.width, size.height) / Math.SQRT2;
  switch (node.name) {
    case 'path': {
      const read = readPathData(attributes.get('d') ?? '', Number.POSITIVE_INFINITY, {
        upToError: true,
      });
      return read.ok ? { subpaths: read.subpaths, fillable: true } : undefined;
    }
    case 'rect': {
      const width = x('width');
      const height = y('height');
      if (width === undefined || height === undefined || !(width > 0 && height > 0))
        return undefined;
      let rx = x('rx');
      let ry = y('ry');
      if (rx !== undefined && rx < 0) rx = undefined;
      if (ry !== undefined && ry < 0) ry = undefined;
      rx ??= ry;
      ry ??= rx;
      const left = x('x') ?? 0;
      const top = y('y') ?? 0;
      return {
        subpaths: [
          roundedRectangle(
            left,
            top,
            width,
            height,
            Math.min(rx ?? 0, width / 2),
            Math.min(ry ?? 0, height / 2),
          ),
        ],
        fillable: true,
      };
    }
    case 'circle': {
      const r = along('r', diagonal);
      if (r === undefined || !(r > 0)) return undefined;
      const { start, segments } = ellipseContour(x('cx') ?? 0, y('cy') ?? 0, r, r);
      return { subpaths: [{ start, segments, closed: true }], fillable: true };
    }
    case 'ellipse': {
      let rx = x('rx');
      let ry = y('ry');
      rx ??= ry;
      ry ??= rx;
      if (rx === undefined || ry === undefined || !(rx > 0 && ry > 0)) return undefined;
      const { start, segments } = ellipseContour(x('cx') ?? 0, y('cy') ?? 0, rx, ry);
      return { subpaths: [{ start, segments, closed: true }], fillable: true };
    }
    case 'line': {
      const start = { x: x('x1') ?? 0, y: y('y1') ?? 0 };
      const to = { x: x('x2') ?? 0, y: y('y2') ?? 0 };
      return {
        subpaths: [{ start, segments: [{ kind: 'line', to }], closed: false }],
        fillable: false,
      };
    }
    case 'polyline':
    case 'polygon': {
      const read = readPolygonPoints(
        attributes.get('points') ?? '',
        Number.POSITIVE_INFINITY,
        true,
      );
      if (!read.ok || read.points.length < 2) return undefined;
      const [start, ...rest] = read.points as [
        { x: number; y: number },
        ...{ x: number; y: number }[],
      ];
      return {
        subpaths: [
          {
            start,
            segments: rest.map((to) => ({ kind: 'line', to })),
            closed: node.name === 'polygon',
          },
        ],
        fillable: true,
      };
    }
    default:
      return undefined;
  }
}

const KAPPA = 0.5522847498307936;

/** A rectangle as one closed subpath, its corners rounded by quarter ellipses when asked. */
function roundedRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  ry: number,
): { start: { x: number; y: number }; segments: Segment[]; closed: boolean } {
  const right = x + width;
  const bottom = y + height;
  if (!(rx > 0 && ry > 0)) {
    return {
      start: { x, y },
      segments: [
        { kind: 'line', to: { x: right, y } },
        { kind: 'line', to: { x: right, y: bottom } },
        { kind: 'line', to: { x, y: bottom } },
        { kind: 'line', to: { x, y } },
      ],
      closed: true,
    };
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const segments: Segment[] = [];
  const line = (to: { x: number; y: number }) => {
    const from = segments.at(-1)?.to ?? { x: x + rx, y };
    if (from.x !== to.x || from.y !== to.y) segments.push({ kind: 'line', to });
  };
  line({ x: right - rx, y });
  segments.push({
    kind: 'cubic',
    c1: { x: right - rx + kx, y },
    c2: { x: right, y: y + ry - ky },
    to: { x: right, y: y + ry },
  });
  line({ x: right, y: bottom - ry });
  segments.push({
    kind: 'cubic',
    c1: { x: right, y: bottom - ry + ky },
    c2: { x: right - rx + kx, y: bottom },
    to: { x: right - rx, y: bottom },
  });
  line({ x: x + rx, y: bottom });
  segments.push({
    kind: 'cubic',
    c1: { x: x + rx - kx, y: bottom },
    c2: { x, y: bottom - ry + ky },
    to: { x, y: bottom - ry },
  });
  line({ x, y: y + ry });
  segments.push({
    kind: 'cubic',
    c1: { x, y: y + ry - ky },
    c2: { x: x + rx - kx, y },
    to: { x: x + rx, y },
  });
  return { start: { x: x + rx, y }, segments, closed: true };
}

/** A contour's pieces, closed by a line back to its start when they do not end there. */
function closed(start: { x: number; y: number }, segments: readonly Segment[]): Segment[] {
  const last = segments.at(-1)?.to ?? start;
  return last.x === start.x && last.y === start.y
    ? [...segments]
    : [...segments, { kind: 'line', to: start }];
}

/** `color`, which `currentColor` paints with: inherited unless it is a color of its own. */
function colorProperty(value: string | undefined, inherited: ReadColor): ReadColor {
  if (value === undefined) return inherited;
  const text = value.trim();
  if (text === 'inherit' || text.toLowerCase() === 'currentcolor') return inherited;
  return readColor(text) ?? inherited;
}

/** A gradient stop's color, `transparent` when its opacity is 0; black unless it says otherwise. */
function stopColor(stop: SvgNode): ReadColor {
  const opacity = stop.attributes.get('stop-opacity')?.trim();
  if (opacity !== undefined) {
    const value = opacity.endsWith('%')
      ? (readNumber(opacity.slice(0, -1)) ?? 100) / 100
      : (readNumber(opacity) ?? 1);
    if (value <= 0) return 'transparent';
  }
  const color = stop.attributes.get('stop-color');
  if (color === undefined) return '#000000';
  if (color.trim().toLowerCase() === 'currentcolor') {
    return colorProperty(stop.attributes.get('color'), '#000000');
  }
  return readColor(color) ?? '#000000';
}

/** The main color of what drawings draw: the fill of the largest filled, else the largest stroked. */
function mainColor(drawings: readonly Drawing[]): Color {
  let best: Color | undefined;
  let largest = -1;
  for (const drawing of drawings) {
    const color = drawing.fillColor;
    if (color === undefined || color === 'transparent' || !(drawing.fillArea > largest)) continue;
    best = color;
    largest = drawing.fillArea;
  }
  if (best !== undefined) return best;
  largest = -1;
  for (const drawing of drawings) {
    const color = drawing.strokeColor;
    if (color === undefined || color === 'transparent' || !(drawing.strokeArea > largest)) continue;
    best = color;
    largest = drawing.strokeArea;
  }
  return best ?? '#000000';
}

function areaOf(contour: OutlineContour, tolerance: number): number {
  const points = flatten(contour, tolerance * 4, 8).points;
  let sum = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    sum +=
      (points[2 * i] as number) * (points[2 * j + 1] as number) -
      (points[2 * j] as number) * (points[2 * i + 1] as number);
  }
  return sum / 2;
}

function lengthOf(contour: OutlineContour, tolerance: number): number {
  const points = flatten(contour, tolerance * 4, 8).points;
  let length = 0;
  for (let at = 2; at < points.length; at += 2) {
    length += Math.hypot(
      (points[at] as number) - (points[at - 2] as number),
      (points[at + 1] as number) - (points[at - 1] as number),
    );
  }
  return length;
}

function grown(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

function union(boxes: readonly Box[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return minX > maxX
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
