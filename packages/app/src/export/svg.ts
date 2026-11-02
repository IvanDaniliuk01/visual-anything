/**
 * The SVG writer (M6b, ADR-0014's clarification of 2026-10-25): it turns the same scene the renderer
 * draws (`buildScene`) into one SVG file, an output and not a second renderer. Pure TypeScript with no
 * DOM and no PixiJS, so that the app, the command line and Claude's tools write the same file.
 *
 * It writes what the canvas draws when every detail shows, in the theme chosen, in the canvas's order:
 *
 * - the canvas's background, under everything;
 * - each element's shape, in the view's drawing order, a container before its contents: its body by
 *   its kind, a collapsed container on its sheet, a table with its header and rows, a container's
 *   toggle, its picture (cleaned, written once as a symbol), and its name and detail, badges included,
 *   wrapped and cut as the canvas writes them;
 * - beyond boxes (M8b): a shape's own outline in place of its body, written once as a symbol of
 *   `path`s filled by the even-odd rule, its holes cut as the canvas cuts them, with its name where
 *   `outlined.ts` says (ADR 0066); a drawing with parts as its picture, its anchored parts as their
 *   names, and a part on its own as its outline under its part's own picture (ADR 0067);
 * - what changes how anchored parts look, as the canvas's part layer draws it (`partMarks.ts`), over
 *   every shape: overlays' fills, veils, strokes and badges;
 * - every relation in front of the shapes: its casing in the canvas's color, its route with its bends
 *   or its curve, automatic curves and straight lines included (ADR 0069), its dashes, its arrowhead,
 *   and its name on a back of the canvas's color;
 * - notes and free arrows in front of everything.
 *
 * It leaves out what only the open app shows: the selection, filters, focus, guidance, playback, the
 * grid and the rulers. Each part carries `data-element`, `data-relation` (`data-relations` on an
 * aggregated relation) or `data-free-shape`, so that a page or a test can find it. The view's name and
 * description are its `<title>` and `<desc>`, and its `<desc>` names the outline in Markdown that is
 * the view's long description. The packages' attribution goes in its metadata (ADR-0047).
 */
import {
  definitionsIn,
  encodeBase64,
  flattenOutline,
  imagesIn,
  legendOf,
  legendShows,
  modelIndexOf,
  namedPart,
  outlinePathData,
  facePalette,
  partPicture,
  type CleanedImage,
  type FaceImage,
  type FittedOutline,
  type FlatContour,
  type OutlineContour,
  type ProjectSnapshot,
  type ResolvedDrawing,
  type ThemeName,
} from '@visual-anything/core';
import type { Color, Id, ViewFile } from '@visual-anything/schema';
import { t } from '../i18n';
import { outlineColorOf, readableTextColors } from '../canvas/colors';
import { imageSerial } from '../canvas/image-serials';
import {
  TAG_DETAIL_LINE,
  TAG_PADDING,
  drawnBoundsOf,
  nameTagOf,
  placedTag,
  tagRadius,
} from '../canvas/nameTags';
import {
  LEAST_HEADER_WIDTH,
  PART_NAME_LINE,
  PART_NAME_SIZE,
  headerStretch,
  labelAreaOn,
  partNameLines,
  showsContents,
  writesNameBelow,
} from '../canvas/outlined';
import { outlineAt, type PlacedOutline, type ShapeOutline } from '../canvas/outlines';
import {
  BADGE_HALO,
  BADGE_SIZE,
  OVERLAY_STROKE,
  holesByFill,
  partMarksOf,
  type DrawingMarks,
} from '../canvas/partMarks';
import type { ShapePart } from '../canvas/partShapes';
import {
  HEADER_DETAIL_INSET,
  HEADER_INSET,
  HEADER_TOGGLE,
  ROW_ICON,
  ROW_INSET,
  rowTextSizesOf,
  type RowColumns,
} from '../canvas/fit';
import {
  COUNT_BADGE_PADDING,
  CASING_EXTRA,
  DASH_PATTERNS,
  PLATE_RADIUS,
  RELATION_LABEL_BACK,
  SOFT_SHADOW,
  TOGGLE_LOOK,
  countBadgeSize,
  fontFamilyOf,
  headerPlacesOf,
  headerRoomsOf,
  noteTextPlaceIn,
  personCornerRadius,
  roundedCornerRadius,
  rowsCornerRadius,
  textSideInset,
} from '../canvas/drawing';
import { MONO_FAMILY, ROBOTO } from '../canvas/fontFamilies';
import {
  INNER_BORDER,
  SHEET,
  bodyOf,
  cylinderCap,
  grow,
  personBodyPoints,
  personFigure,
  showsInnerBorder,
  toggleRect,
  untilArrowhead,
  type Arrowhead,
  type Point,
  type Rect,
} from '../canvas/geometry';
import { countLineTopOf, countText, headerLines } from '../canvas/collapse';

import {
  REGION_BORDER,
  iconStrokeIn,
  regionColorsOf,
  regionFillOf,
  regionIconOf,
  regionRadius,
  regionTabOf,
} from '../canvas/regionDraw';

import { facePaints, facePictureRect, faceRect, shapeFaceDrawing } from '../canvas/faces';
import {
  entryDash,
  relationTypesLegend,
  withRelationTypes,
} from '../canvas/overlays/relationLegend';
import { avoidedScene } from '../canvas/routing/avoided';
import { drawnCurve } from '../canvas/routing/curves';
import { ROWS_HEADER } from '../canvas/rows';
import { ROW_INSIDE, ROW_SEPARATOR, drawsRows, isRow, rowColorsOf } from '../canvas/rowsDraw';
import {
  arrowWidthOf,
  buildScene,
  drawingOfScene,
  standsFor,
  type ArrowShape,
  type ElementShape,
  type NoteShape,
  type RelationLine,
  type Scene,
} from '../canvas/scene';
import {
  bandRooms,
  besideImage,
  bodyRectOf,
  headerShift,
  labelAreaOf,
  nameBandOf,
  pictureOn,
  showsPicture,
  type ShapeImage,
} from '../canvas/shape-images';
import { solidsIn } from '@visual-anything/core';
import { SOLID_MARK_LINE, isAnchoredSolidPart, solidMarkLines } from '../canvas/solidMark';
import type { SolidPartBuffer } from '../solids/views';
import { encodePng } from './png';
import {
  showsSolid,
  solidsAsPlaceholders,
  solidsNotDrawn,
  type PaintedSolid,
} from './solid-pictures';
import { partValues, tracedPathData, valueBoxes } from './solid-trace';
import { anchoredByIndex } from '../canvas/solids/pointing';
import { arrowStroke, lineStroke, noteColors, shapeColors } from '../canvas/theme/paint';
import { THEMES, type CanvasTheme } from '../theme/themes';
import {
  bitmapSymbol,
  svgSymbol,
  tintFilter,
  tintFilterId,
  type BitmapFormat,
} from './image-symbols';
import { layOutBand, type BandItem, type BandLayout } from './legendLayout';
import { element, empty, num, textElement, type AttributeValue } from './markup';
import { textWidth } from './measure';
import { LINE_HEIGHT, layOutText, type TextSpec } from './text-layout';
import { BASE_DRAWING } from '../canvas/drawing';
import { laidTextSvg } from './emphasis-svg';
import { exportedFaceShow, faceSvg } from './face-svg';
import { parseEmphasis } from '@visual-anything/core';
import { outlinedTextBlock } from '../canvas/outlinedText';
import { placeTextBlock, robotoMeasure } from '../canvas/textBlock';
import { drawsDifferently } from '../text/drawn';
import { detailPlainText } from '../text/detail';
import { layOutBlocks } from '../text/layout';

/** The room left around the scene's bounds, in canvas units, as the PNG of the whole view keeps. */
export const SVG_MARGIN = 32;

/**
 * The fonts the drawing's text is written in, first available first: the canvas's own, the bundled
 * Roboto first, where the drawing defaults say nothing else (`svgFontFamilyOf`).
 */
export const SVG_FONT_FAMILY = svgFamily(fontFamilyOf(BASE_DRAWING));

/** The fonts a drawing writes in (`text.font`, ADR 0086), as an SVG `font-family`. */
export function svgFontFamilyOf(drawing: ResolvedDrawing): string {
  return drawing === BASE_DRAWING ? SVG_FONT_FAMILY : svgFamily(fontFamilyOf(drawing));
}

/**
 * The family the PDF writer embeds Roboto Medium for (`pdf.ts`): written before the drawing's fonts
 * on text at weight 500, which no reader has installed, so that a reader draws that text in the
 * drawing's fonts at weight 500, and the PDF in Roboto Medium.
 */
export const MEDIUM_FAMILY = `${ROBOTO} Medium`;

function svgFamily(families: readonly string[]): string {
  return families.map((each) => (/^[a-z-]+$/i.test(each) ? each : `'${each}'`)).join(', ');
}

/** How the drawing is written. */
export interface SvgOptions {
  /** The theme it is drawn in; light by default. */
  theme?: ThemeName;
  /**
   * The name of the file that holds the view's outline in Markdown, its long description, which the
   * drawing's `<desc>` names; left out, the description says only that the outline can be exported.
   */
  outlineFile?: string;
  /** The bitmap formats the file's reader can draw; a picture in any other is left out. All by default. */
  bitmaps?: readonly BitmapFormat[];
  /** Whether its reader draws SVG filters, which silhouettes of bitmaps need; true by default. */
  filters?: boolean;
  /** What a comparison adds to the drawing (ADR 0070); `svgOfComparison` gives it. */
  comparison?: SvgComparisonParts;
  /**
   * Solids' pictures, by the key of the shape that shows each, as the solid worker drew them for
   * the export (`svgSolidsOf`, ADR 0075). Without them, as from the command line and Claude's
   * `export_view`, which have no GPU, every solid is drawn as its placeholder, and the drawing says
   * so; a shape missing from them is its placeholder too.
   */
  solids?: ReadonlyMap<string, SvgSolidPicture>;
  /**
   * Whether each anchored part of a solid is written as a transparent path traced from its part
   * buffer, with its ids, for a reader of the file to point at; true by default. The PDF, which no
   * one points into, leaves them out.
   */
  tracedParts?: boolean;
}

/** A solid's picture as a drawing holds it: a PNG, and the part buffer it came with, if any. */
export interface SvgSolidPicture {
  format: 'png';
  /** The PNG, in base64. */
  data: string;
  width: number;
  height: number;
  partBuffer?: SolidPartBuffer;
}

/** The pictures of solids an export drew, as a drawing holds them: each one written as a PNG. */
export async function svgSolidsOf(
  shots: ReadonlyMap<string, PaintedSolid>,
): Promise<Map<string, SvgSolidPicture>> {
  const written = new Map<string, SvgSolidPicture>();
  for (const [key, shot] of shots) {
    const png = await encodePng(shot.pixels, shot.width, shot.height);
    written.set(key, {
      format: 'png',
      data: encodeBase64(png),
      width: shot.width,
      height: shot.height,
      ...(shot.partBuffer ? { partBuffer: shot.partBuffer } : {}),
    });
  }
  return written;
}

/**
 * What a comparison adds to a view's drawing (ADR 0070): what it draws faintly, its marks over the
 * relations and free shapes, and its legend, below the drawing and the overlays' legend.
 */
export interface SvgComparisonParts {
  /** What is drawn faintly, by the keys the scene names it by: a shape's key, a line's, a free shape's id. */
  faint: ReadonlySet<string>;
  /** How faint, as an opacity. */
  opacity: number;
  /** The marks, as SVG, in the order they are drawn. */
  marks: readonly string[];
  /** The legend: its size, and its parts at a place, as wide as the drawing. */
  legend: { width: number; height: number; parts(at: Rect, width: number): string[] };
  /** Every text the marks and the legend write, for a reader that checks its font holds them. */
  texts: readonly string[];
}

/** A drawing written as SVG. */
export interface SvgDrawing {
  text: string;
  /**
   * What the drawing shows, in canvas units: the scene's bounds with a margin, and below them the
   * legend of the view's overlays when it shows one, as wide as the legend needs.
   */
  viewBox: Rect;
  /** The scene's bounds; none for a view that draws nothing. */
  bounds: Rect | undefined;
  /** Where the legend of the view's overlays lies, below the drawing; none while no overlay is on. */
  legend?: Rect;
  /** Where a comparison's legend lies, below that; none but for a comparison's drawing. */
  comparisonLegend?: Rect;
  /** What the drawing could not show, in the language the app reads in. */
  lost: string[];
  /** Every text it writes, in order, for a reader that has to check its font holds them. */
  texts: string[];
  /**
   * The license and attribution of each package it draws from that records them (ADR-0047), one line
   * each, as its metadata holds them.
   */
  attribution: string[];
  /** The drawing as its layers hold it, for a reader that draws it piece by piece (`svgPieces`). */
  layers: SvgLayers;
}

/** A layer of a drawing: a group, and what it holds, part by part, in the order they are drawn. */
export interface SvgLayer {
  values: Readonly<Record<string, AttributeValue>>;
  parts: readonly string[];
}

/** What a drawing draws, in layers, with what its parts refer to. */
export interface SvgLayers {
  /** The attributes of its root element. */
  root: Readonly<Record<string, AttributeValue>>;
  /** Its pictures' symbols and filters, by their ids. */
  defs: ReadonlyMap<string, string>;
  /** The canvas's color under everything. */
  background: string;
  layers: readonly SvgLayer[];
}

/** The view with this id, or undefined. */
function viewOf(project: ProjectSnapshot, viewId: Id): ViewFile | undefined {
  return project.views.find((view) => view.id === viewId);
}

/**
 * Writes the view with this id as SVG, from the scene the canvas draws. Throws when the project has no
 * such view.
 */
export function writeSvg(
  project: ProjectSnapshot,
  viewId: Id,
  options: SvgOptions = {},
): SvgDrawing {
  const view = viewOf(project, viewId);
  if (!view) throw new RangeError(`The project has no view "${viewId}".`);
  // Its lines go around the shapes in their way, as the canvas routes them once its worker is done.
  return svgOfScene(project, view, avoidedScene(buildScene(project, viewId)), options);
}

/** How far a cubic Bézier's handles reach along a quarter of an ellipse, of its radius. */
const KAPPA = 0.5522847498;
/** The least side an outline's symbol takes, so that a straight line's bounds still draw. */
const LEAST_SIDE = 0.01;
/** No shape: what an export hides and draws faintly, since it draws no filter, focus or drag. */
const NONE: ReadonlySet<string> = new Set();

/** A text the writer writes: in a weight of the loaded ones when bold, the name's, 700 otherwise. */
type WrittenText = TextSpec & {
  fill: Color;
  halo?: Halo;
  weight?: 400 | 500 | 700;
  /** Written in Roboto Mono, as a table's rows write a column's type (A5.1). */
  mono?: true;
};

/** The fonts a column's type is written in, as an SVG `font-family`. */
const MONO_SVG_FAMILY = svgFamily(MONO_FAMILY);

/** A picture to draw: its cleaned view, the serial of its content, and the tint of a silhouette. */
type PictureSource = Pick<ShapeImage, 'image' | 'serial' | 'tint'>;

/**
 * How an outline's lines are stroked: each at its own width, at least `least`, as a shape's body and
 * a fill draw them, or all at one `width`, as an overlay's stroke draws them.
 */
type LineWidths = { least: number } | { width: number };

/**
 * How an outline is painted where a shape draws it (ADR 0066, ADR 0067), as the canvas paints it:
 * its body (`drawOutline`), a fill over a part (`fillOutline`) or an overlay's stroke along it.
 */
interface OutlinePaint {
  /** What fills its fills, their holes cut; none: they are not filled. */
  fill?: Color;
  /** What strokes its closed contours; none: they are not stroked. */
  stroke?: Color;
  /** How wide that stroke is, a shape's stroke width by default, and whether its corners are round. */
  strokeWidth?: number;
  round?: boolean;
  /** What strokes its lines, and how wide; none: they are not drawn. */
  lines?: { color: Color; widths: LineWidths };
  /** How much of it shows, below 1 for a veil; all of it by default. */
  opacity?: number;
}

/** An outline's symbols: one for its fills, written once, and one for its lines in each width. */
interface OutlineSymbols {
  fills?: string;
  /** The symbol of its lines, by the key of their widths; none when it has no line. */
  lines: Map<string, string> | undefined;
  /** The id its symbols are named from, and their size. */
  id: string;
  width: number;
  height: number;
  box: { viewBox: string; overflow: string };
}

/** What the writer reads of the project beyond the scene. */
interface WriterReading {
  /** The cleaned view of a picture the project draws, by its id. */
  shown(image: Id): CleanedImage | undefined;
}

/** A halo drawn around a text, in this color and this wide, under it. */
interface Halo {
  color: Color;
  width: number;
}

/** Everything one drawing is written with. */
class Writer {
  readonly theme: CanvasTheme;
  readonly lost = new Set<string>();
  readonly texts: string[] = [];
  readonly #symbols = new Map<string, string | null>();
  /** Each outline's symbols, by the fitted outline they draw: the same object for each source and size. */
  readonly #outlines = new Map<FittedOutline, OutlineSymbols>();
  /** The pictures' and outlines' symbols and filters, by their ids, in the order they were first needed. */
  readonly defsById = new Map<string, string>();
  readonly #filters = new Set<Color>();
  readonly #byKey: ReadonlyMap<string, ElementShape>;
  readonly #bitmaps: ReadonlySet<BitmapFormat>;
  readonly #filtersDrawn: boolean;
  readonly reading: WriterReading;
  /** The drawing defaults the scene is drawn with (ADR 0086), which the canvas draws it with too. */
  readonly drawing: ResolvedDrawing;

  readonly #solids: ReadonlyMap<string, SvgSolidPicture> | undefined;
  /** Each solid's picture's symbol, by its PNG's data: the same picture is written once. */
  readonly #solidSymbols = new Map<string, string>();

  constructor(scene: Scene, options: SvgOptions, reading: WriterReading) {
    this.theme = THEMES[options.theme ?? 'light'].canvas;
    this.#byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
    this.#bitmaps = new Set(options.bitmaps ?? ['png', 'jpeg', 'webp']);
    this.#filtersDrawn = options.filters ?? true;
    this.#solids = options.solids;
    this.reading = reading;
    this.drawing = drawingOfScene(scene);
  }

  /** How a shape's name is written: at the drawing's name size, in its weight. */
  get name(): { size: number; bold: boolean; weight: 400 | 500 | 700 } {
    const { nameSize, nameWeight } = this.drawing.text;
    return { size: nameSize, bold: nameWeight !== 400, weight: nameWeight };
  }

  /** How a container's name is written: as a name, at the drawing's container name size. */
  get containerName(): { size: number; bold: boolean; weight: 400 | 500 | 700 } {
    return { ...this.name, size: this.drawing.text.containerNameSize };
  }

  /** How wide a shape's border is. */
  get border(): number {
    return this.drawing.shapes.borderWidth;
  }

  /** How far in from its sides a shape writes its text. */
  get inset(): number {
    return textSideInset(this.drawing);
  }

  /**
   * How tall the exports' lines are, in ems: theirs (`text-layout.ts`), in the ratio of the drawing's
   * line height to the canvas's own.
   */
  get #lineHeight(): number {
    return (LINE_HEIGHT * this.drawing.text.lineHeight) / BASE_DRAWING.text.lineHeight;
  }

  /** The picture drawn of a shape's solid for this drawing; none: it is drawn as its placeholder. */
  solidPicture(shape: ElementShape): SvgSolidPicture | undefined {
    return shape.solid ? this.#solids?.get(shape.key) : undefined;
  }

  /** Where a solid's picture is used: its symbol, written the first time it is needed, at `rect`. */
  solidUse(picture: SvgSolidPicture, rect: Rect): string {
    let id = this.#solidSymbols.get(picture.data);
    if (id === undefined) {
      id = `va-solid-${this.#solidSymbols.size + 1}`;
      this.#solidSymbols.set(picture.data, id);
      this.defsById.set(id, bitmapSymbol(id, picture));
    }
    return empty('use', {
      href: `#${id}`,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }

  get defs(): string {
    return [...this.defsById.values()].join('');
  }

  /** The fill a shape sits on in this theme: its container's, or the canvas's. */
  backdropOf(shape: ElementShape): Color {
    const holder =
      shape.containerShape === undefined ? undefined : this.#byKey.get(shape.containerShape);
    if (!holder) return this.theme.background;
    // A region's contents sit on its faint fill as it comes out over the canvas (ADR 0086).
    if (holder.region) {
      return regionFillOf(
        shapeColors(holder, this.theme.name).stroke,
        regionColorsOf(this.theme, this.drawing),
      );
    }
    return shapeColors(holder, this.theme.name).fill;
  }

  /**
   * A text laid out and written, each line by its baseline; nothing when it does not fit. With a
   * halo, the same text is written first in the halo's color, stroked as wide, which every reader of
   * SVG draws, the PDF writer among them.
   */
  text(spec: WrittenText): string {
    const { lines } = layOutText({ ...spec, lineHeight: this.#lineHeight });
    if (lines.length === 0) return '';
    for (const line of lines) this.texts.push(line.text);
    // The real weight, one the canvas loads; Roboto Medium is named for the PDF to embed.
    const weight = spec.bold ? (spec.weight ?? 700) : undefined;
    const write = (paint: Readonly<Record<string, AttributeValue>>) => {
      const values = {
        'font-size': spec.size,
        'font-weight': weight,
        'font-family': spec.mono
          ? MONO_SVG_FAMILY
          : weight === 500
            ? `'${MEDIUM_FAMILY}', ${svgFontFamilyOf(this.drawing)}`
            : undefined,
        ...paint,
        'text-anchor': spec.align === 'start' ? undefined : spec.align,
      };
      if (lines.length === 1) {
        const [line] = lines as [(typeof lines)[number]];
        return textElement('text', { x: spec.x, y: line.baseline, ...values }, line.text);
      }
      return element(
        'text',
        values,
        lines
          .map((line) => textElement('tspan', { x: spec.x, y: line.baseline }, line.text))
          .join(''),
      );
    };
    const { halo } = spec;
    return (
      (halo
        ? write({
            fill: halo.color,
            stroke: halo.color,
            'stroke-width': halo.width,
            'stroke-linejoin': 'round',
          })
        : '') + write({ fill: spec.fill })
    );
  }

  /**
   * Where a picture is used: its symbol, written the first time it is needed, and drawn at `rect`.
   * Nothing, and said so, for a picture this drawing cannot hold.
   */
  picture(image: PictureSource, rect: Rect): string {
    const cleaned = image.image;
    const tint = image.tint;
    const silhouette = tint !== undefined && cleaned.kind === 'svg';
    const key = `${image.serial}${silhouette ? ` ${tint}` : ''}`;
    let id = this.#symbols.get(key);
    if (id === undefined) {
      const made = `va-img-${this.#symbols.size + 1}`;
      let symbol: string | undefined;
      if (cleaned.kind === 'svg') {
        symbol = svgSymbol(made, cleaned.svg, `${made}-`, silhouette ? tint : undefined);
        if (!symbol) this.lost.add(t('A picture whose SVG could not be read back is left out.'));
      } else if (this.#bitmaps.has(cleaned.format)) {
        symbol = bitmapSymbol(made, cleaned);
      } else {
        this.lost.add(
          t('Pictures in {format} are left out: this format cannot hold them.', {
            format: cleaned.format.toUpperCase(),
          }),
        );
      }
      id = symbol === undefined ? null : made;
      if (symbol !== undefined) this.defsById.set(made, symbol);
      this.#symbols.set(key, id);
    }
    if (id === null) return '';
    let filter: string | undefined;
    if (tint !== undefined && cleaned.kind === 'bitmap') {
      if (this.#filtersDrawn) {
        if (!this.#filters.has(tint)) {
          this.#filters.add(tint);
          this.defsById.set(tintFilterId(tint), tintFilter(tint));
        }
        filter = `url(#${tintFilterId(tint)})`;
      } else {
        this.lost.add(t('Bitmaps shown as silhouettes are drawn in their own colors.'));
      }
    }
    return empty('use', {
      href: `#${id}`,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      filter,
    });
  }

  /**
   * Where an outline is drawn, painted as the canvas paints it (ADR 0066, ADR 0067): each fill a
   * `path` with the holes the canvas cuts from it, filled by the even-odd rule; every closed contour
   * stroked; and each line stroked with round ends. The fills, and the lines at each width, are
   * written once, as symbols whose view box is the outline's bounds, and used here at its place.
   */
  outline(placed: PlacedOutline, paint: OutlinePaint): string {
    const symbols = this.#outlineSymbols(placed.fitted);
    const { bounds } = placed.fitted;
    const at = {
      x: placed.x + bounds.x,
      y: placed.y + bounds.y,
      width: symbols.width,
      height: symbols.height,
    };
    const opacity = paint.opacity === undefined || paint.opacity >= 1 ? undefined : paint.opacity;
    const stroked = paint.stroke !== undefined;
    let markup = '';
    if (symbols.fills !== undefined && (paint.fill !== undefined || stroked)) {
      markup += empty('use', {
        href: `#${symbols.fills}`,
        ...at,
        fill: paint.fill ?? 'none',
        'fill-opacity': paint.fill === undefined ? undefined : opacity,
        stroke: paint.stroke,
        'stroke-width': stroked ? (paint.strokeWidth ?? this.border) : undefined,
        'stroke-linejoin': stroked && paint.round ? 'round' : undefined,
        'stroke-linecap': stroked && paint.round ? 'round' : undefined,
        'stroke-opacity': stroked ? opacity : undefined,
      });
    }
    const lines = paint.lines && this.#linesSymbol(placed.fitted, symbols, paint.lines.widths);
    if (paint.lines && lines !== undefined) {
      markup += empty('use', {
        href: `#${lines}`,
        ...at,
        stroke: paint.lines.color,
        'stroke-opacity': opacity,
      });
    }
    return markup;
  }

  /**
   * An outline's symbols, the first time it is drawn: its fills, each with the holes cut from the
   * smallest fill around them (`holesByFill`, as the canvas cuts them), and the closed contours that
   * fill nothing, stroked only.
   */
  #outlineSymbols(fitted: FittedOutline): OutlineSymbols {
    const known = this.#outlines.get(fitted);
    if (known) return known;
    const { bounds, contours } = fitted;
    const width = Math.max(bounds.width, LEAST_SIDE);
    const height = Math.max(bounds.height, LEAST_SIDE);
    const box = {
      viewBox: [bounds.x, bounds.y, width, height].map(num).join(' '),
      overflow: 'visible',
    };
    const id = `va-outline-${this.#outlines.size + 1}`;
    const flat = flattenOutline(fitted);
    const index = new Map(flat.map((contour, at) => [contour, at]));
    const contourAt = (contour: FlatContour) => contours[index.get(contour) ?? -1];
    const fills = flat.filter((contour) => contour.role === 'fill' && contour.points.length >= 6);
    const holesIn = holesByFill(flat, fills);
    const drawn = new Set<FlatContour>(fills);
    for (const holes of holesIn.values()) for (const hole of holes) drawn.add(hole);
    const paths: string[] = [];
    for (const fill of fills) {
      const cut = [fill, ...(holesIn.get(fill) ?? [])].flatMap((each) => contourAt(each) ?? []);
      paths.push(empty('path', { d: pathDataOf(cut), 'fill-rule': 'evenodd' }));
    }
    // A closed contour that fills nothing and cuts nothing is still stroked, as the canvas strokes it.
    const left = flat.flatMap((contour) =>
      contour.role !== 'line' && contour.points.length >= 4 && !drawn.has(contour)
        ? (contourAt(contour) ?? [])
        : [],
    );
    if (left.length > 0) paths.push(empty('path', { d: pathDataOf(left), fill: 'none' }));
    const symbols: OutlineSymbols = {
      id,
      width,
      height,
      box,
      lines: flat.some((contour) => contour.role === 'line' && contour.points.length >= 4)
        ? new Map()
        : undefined,
    };
    if (paths.length > 0) {
      symbols.fills = id;
      this.defsById.set(id, element('symbol', { id, ...box }, paths.join('')));
    }
    this.#outlines.set(fitted, symbols);
    return symbols;
  }

  /** The symbol of an outline's lines at these widths, written the first time it is drawn so. */
  #linesSymbol(
    fitted: FittedOutline,
    symbols: OutlineSymbols,
    widths: LineWidths,
  ): string | undefined {
    const { lines } = symbols;
    if (!lines) return undefined;
    const key = 'least' in widths ? `least ${widths.least}` : `width ${widths.width}`;
    const known = lines.get(key);
    if (known !== undefined) return known;
    const id = `${symbols.id}-lines-${lines.size + 1}`;
    const { contours } = fitted;
    const paths = flattenOutline(fitted).flatMap((contour, at) => {
      const line = contours[at];
      if (contour.role !== 'line' || contour.points.length < 4 || !line) return [];
      return [
        empty('path', {
          d: pathDataOf([line]),
          fill: 'none',
          'stroke-width':
            'least' in widths ? Math.max(widths.least, line.width ?? 0) : widths.width,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      ];
    });
    lines.set(key, id);
    this.defsById.set(id, element('symbol', { id, ...symbols.box }, paths.join('')));
    return id;
  }
}

/**
 * What a scene covers with what it draws: its bounds and, for each shape that writes its name in a
 * name tag, that tag (`drawnBoundsOf`, ADR 0066's clarifications), which a scene's bounds hold too.
 */
function coveredBy(bounds: Rect, shapes: readonly ElementShape[]): Rect {
  let x1 = bounds.x;
  let y1 = bounds.y;
  let x2 = bounds.x + bounds.width;
  let y2 = bounds.y + bounds.height;
  for (const shape of shapes) {
    if (!nameTagOf(shape)) continue;
    const rect = drawnBoundsOf(shape);
    if (rect === shape.rect) continue;
    x1 = Math.min(x1, rect.x);
    y1 = Math.min(y1, rect.y);
    x2 = Math.max(x2, rect.x + rect.width);
    y2 = Math.max(y2, rect.y + rect.height);
  }
  return x1 === bounds.x &&
    y1 === bounds.y &&
    x2 === bounds.x + bounds.width &&
    y2 === bounds.y + bounds.height
    ? bounds
    : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Contours as path data, as the core writes an outline, with numbers as the files write them. */
function pathDataOf(contours: readonly OutlineContour[]): string {
  return outlinePathData(contours).replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, (number) =>
    num(Number(number)),
  );
}

/** Writes a view's scene as SVG. */
export function svgOfScene(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
  options: SvgOptions = {},
): SvgDrawing {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const catalog = imagesIn(project);
  const writer = new Writer(scene, options, { shown: (image) => catalog.shown(image) });
  const { theme } = writer;
  const bounds = scene.bounds;
  // Name tags lie in the drawing too, as the canvas's tiles cover them.
  const covered = bounds && coveredBy(bounds, scene.shapes);
  const drawn = covered
    ? grow(covered, SVG_MARGIN)
    : { x: 0, y: 0, width: 2 * SVG_MARGIN, height: 2 * SVG_MARGIN };
  if (!bounds) writer.lost.add(t('The view draws nothing.'));

  // A comparison draws what is unchanged, and what was removed, faintly (ADR 0070).
  const compared = options.comparison;
  const faintly = (key: string): number | undefined =>
    compared?.faint.has(key) ? compared.opacity : undefined;
  const order = scene.drawing ?? scene.shapes.map((_shape, at) => at);
  const shapes = order
    .map((at) => scene.shapes[at])
    .filter((shape): shape is ElementShape => shape !== undefined)
    .map((shape) =>
      element(
        'g',
        {
          'data-element': shape.element,
          'data-shape': shape.key,
          'data-component': index.element(shape.element)?.component,
          opacity: faintly(shape.key),
        },
        shapeParts(writer, shape),
      ),
    );

  const lines = scene.relations.map((line) => ({ line, stroke: lineStroke(line, theme.name) }));
  const casings = lines.map(({ line }) => {
    const casing = casingOf(line, theme.background);
    const opacity = faintly(line.relation);
    return opacity === undefined || casing === '' ? casing : element('g', { opacity }, casing);
  });
  const routes = lines.map(({ line, stroke }) =>
    element('g', { ...partOf(line), opacity: faintly(line.relation) }, routeOf(line, stroke)),
  );
  const labels = lines.map(({ line }) => {
    const label = relationLabel(writer, line);
    return label === ''
      ? ''
      : element('g', { ...partOf(line), opacity: faintly(line.relation) }, label);
  });

  const faintFree = (id: string, parts: string) => {
    const opacity = faintly(id);
    return opacity === undefined ? parts : element('g', { opacity }, parts);
  };
  const free = [
    ...scene.notes.map((note) => faintFree(note.id, noteParts(writer, note))),
    ...scene.arrows.map((arrow) =>
      faintFree(
        arrow.id,
        arrowParts(arrow, arrowStroke(arrow, theme), theme, arrowWidthOf(writer.drawing)),
      ),
    ),
  ];

  // The legend of the view's overlays goes below the drawing, so that it never covers it (ADR 0055).
  // After them, the view's relation types, where lines are neutral or of several types (ADR 0086).
  const legend = withRelationTypes(
    legendOf(view, definitions, theme.name),
    relationTypesLegend(scene, project, definitions, theme.name, t('Relation types')),
  );
  const band = legendShows(legend)
    ? layOutBand(legend, t, textWidth, drawn.width, 1, theme.name, writer.drawing)
    : undefined;
  const legendRect =
    band === undefined
      ? undefined
      : { x: drawn.x, y: drawn.y + drawn.height, width: band.width, height: band.height };
  const overlaid = legendRect
    ? {
        ...drawn,
        width: Math.max(drawn.width, legendRect.width),
        height: drawn.height + legendRect.height,
      }
    : drawn;
  // A comparison's legend goes below the drawing and the overlays' legend (ADR 0070).
  const comparisonLegend = compared && {
    x: overlaid.x,
    y: overlaid.y + overlaid.height,
    width: compared.legend.width,
    height: compared.legend.height,
  };
  const viewBox = comparisonLegend
    ? {
        ...overlaid,
        width: Math.max(overlaid.width, comparisonLegend.width),
        height: overlaid.height + comparisonLegend.height,
      }
    : overlaid;
  if (compared) writer.texts.push(...compared.texts);

  // What changes how anchored parts look lies over every shape and under the relations, as the
  // canvas's part layer draws it (ADR 0067); a view without drawings with parts writes no such layer.
  const marked = partMarksOf(scene, NONE, NONE).flatMap((marks) => partMarksParts(writer, marks));
  // Solids are drawn by the pictures the export drew of them, or as their placeholders (ADR 0075).
  const solidShapes = scene.shapes.filter(showsSolid);
  if (solidShapes.length > 0) {
    if (!options.solids) writer.lost.add(solidsAsPlaceholders());
    else {
      const missing = solidShapes.filter((shape) => !writer.solidPicture(shape)).length;
      if (missing > 0) writer.lost.add(solidsNotDrawn(missing));
    }
  }
  // Over the pictures, each anchored part of a solid as a path a reader can point at.
  const traced =
    options.tracedParts === false ? [] : tracedSolidParts(writer, scene, project, index);
  const layers: SvgLayer[] = [
    { values: { 'data-part': 'shapes' }, parts: shapes },
    ...(marked.length > 0 ? [{ values: { 'data-part': 'parts' }, parts: marked }] : []),
    ...(traced.length > 0 ? [{ values: { 'data-part': 'solid-parts' }, parts: traced }] : []),
    { values: { 'data-part': 'casings', fill: 'none', 'stroke-linecap': 'butt' }, parts: casings },
    { values: { 'data-part': 'relations', 'stroke-linecap': 'butt' }, parts: routes },
    { values: { 'data-part': 'relation-names' }, parts: labels },
    { values: { 'data-part': 'free-shapes' }, parts: free },
  ];
  if (compared) layers.push({ values: { 'data-part': 'comparison' }, parts: compared.marks });
  if (band && legendRect) {
    layers.push({
      values: { 'data-part': 'legend' },
      parts: legendParts(writer, band, legendRect, viewBox.width),
    });
  }
  if (compared && comparisonLegend) {
    layers.push({
      values: { 'data-part': 'comparison-legend' },
      parts: compared.legend.parts(comparisonLegend, viewBox.width),
    });
  }

  const description = descriptionOf(view, options.outlineFile);
  const attribution = attributionLines(attributionOf(project, scene, index));
  const background = empty('rect', {
    'data-part': 'background',
    x: viewBox.x,
    y: viewBox.y,
    width: viewBox.width,
    height: viewBox.height,
    fill: theme.background,
  });
  const root = {
    xmlns: 'http://www.w3.org/2000/svg',
    version: '1.1',
    viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(num).join(' '),
    width: viewBox.width,
    height: viewBox.height,
    role: 'img',
    'aria-labelledby': 'va-title',
    'aria-describedby': 'va-desc',
    'font-family': svgFontFamilyOf(writer.drawing),
    'data-view': view.id,
    'data-theme': theme.name,
  };
  const content =
    textElement('title', { id: 'va-title' }, view.name) +
    textElement('desc', { id: 'va-desc' }, description) +
    metadataOf(project, view, attribution) +
    (writer.defs === '' ? '' : element('defs', {}, writer.defs)) +
    background +
    layers.map((layer) => element('g', layer.values, layer.parts.join(''))).join('');

  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${element('svg', root, content)}\n`;
  return {
    text,
    viewBox,
    bounds,
    ...(legendRect ? { legend: legendRect } : {}),
    ...(comparisonLegend ? { comparisonLegend } : {}),
    lost: [...writer.lost],
    texts: writer.texts,
    attribution,
    layers: { root, defs: new Map(writer.defsById), background, layers },
  };
}

/**
 * The drawing as several SVG documents, each drawing some of its parts over the same view box, which
 * drawn one over the other in order draw the drawing: the canvas's color first, then each layer's
 * parts, as many in each document as fit in `most` characters, at least one. Each holds only the
 * symbols and filters its parts use. A writer that draws them one by one can stop between them.
 */
export function svgPieces(layers: SvgLayers, most: number): string[] {
  const open = (body: string) => element('svg', layers.root, body);
  const pieces = [open(layers.background)];
  const used = (markup: string): string => {
    let defs = '';
    for (const [, id] of markup.matchAll(/(?:href="#|url\(#)([^")]+)/g)) {
      const def = id === undefined ? undefined : layers.defs.get(id);
      if (def !== undefined && !defs.includes(def)) defs += def;
    }
    return defs === '' ? '' : element('defs', {}, defs);
  };
  for (const layer of layers.layers) {
    let chunk = '';
    const flush = () => {
      if (chunk === '') return;
      pieces.push(open(used(chunk) + element('g', layer.values, chunk)));
      chunk = '';
    };
    for (const part of layer.parts) {
      if (part === '') continue;
      if (chunk !== '' && chunk.length + part.length > most) flush();
      chunk += part;
    }
    flush();
  }
  return pieces;
}

// --- The legend ----------------------------------------------------------------------------------

/**
 * The legend laid out below the drawing, as SVG: a rule between them, then each overlay's texts and
 * swatches in a group of its own, as a PNG's band draws them.
 */
function legendParts(writer: Writer, band: BandLayout, at: Rect, width: number): string[] {
  const { colors } = THEMES[writer.theme.name].shell;
  const rule = empty('rect', {
    'data-part': 'legend-rule',
    x: at.x,
    y: at.y,
    width,
    height: 1,
    fill: colors.border,
  });
  return [
    rule,
    ...band.parts.map((part) =>
      element(
        'g',
        { 'data-overlay': part.id },
        band.items
          .slice(part.from, part.to)
          .map((item) =>
            item.kind === 'text'
              ? writer.text({
                  text: item.text,
                  size: item.size,
                  bold: item.bold,
                  fill: item.color,
                  x: at.x + item.x,
                  align: 'start',
                  y: at.y + item.y,
                  anchor: 'top',
                })
              : swatchOf(writer, item, at),
          )
          .join(''),
      ),
    ),
  ];
}

/** An entry's swatch in its room: a color, a size, a fade or a badge, as the PNG's band draws it. */
function swatchOf(writer: Writer, item: Extract<BandItem, { kind: 'swatch' }>, at: Rect): string {
  const { colors } = THEMES[writer.theme.name].shell;
  const { entry, part, room } = item;
  const x = at.x + item.x;
  const y = at.y + item.y;
  const middle = { x: x + room / 2, y: y + room / 2 };
  const side = 14;
  const box = { x: middle.x - side / 2, y: middle.y - side / 2, width: side, height: side };
  if (entry.badge !== undefined) {
    return (
      empty('rect', {
        x,
        y: y + 3,
        width: room,
        height: room - 6,
        fill: 'none',
        stroke: colors.controlBorder,
        'stroke-width': 1,
      }) +
      writer.text({
        text: entry.badge,
        size: writer.drawing.text.labelSize,
        fill: colors.text,
        x: x + 5,
        align: 'start',
        y: middle.y,
        anchor: 'middle',
      })
    );
  }
  if (part.of === 'relations') {
    const width = (entry.size ?? 1) * writer.drawing.lines.width;
    return empty('path', {
      d: `M${num(x + 2)} ${num(middle.y)}H${num(x + room - 2)}`,
      fill: 'none',
      stroke: entry.color ?? colors.text,
      'stroke-width': width,
      // A relation type's line keeps its dash (ADR 0086).
      'stroke-dasharray': dashArray({ dash: entryDash(entry), width }),
      opacity: entry.opacity,
    });
  }
  if (entry.color !== undefined) {
    return part.channel === 'stroke'
      ? empty('rect', { ...box, fill: 'none', stroke: entry.color, 'stroke-width': 3 })
      : empty('rect', {
          ...box,
          fill: entry.color,
          stroke: colors.controlBorder,
          'stroke-width': 1,
        });
  }
  if (entry.size !== undefined) {
    const sized = 12 * entry.size;
    return empty('rect', {
      x: middle.x - sized / 2,
      y: middle.y - sized / 2,
      width: sized,
      height: sized,
      fill: 'none',
      stroke: colors.controlBorder,
      'stroke-width': 1,
    });
  }
  if (entry.opacity !== undefined) {
    return empty('rect', { ...box, fill: colors.text, opacity: entry.opacity });
  }
  return '';
}

// --- Shapes --------------------------------------------------------------------------------------

/** Whether a shape is drawn as a container: one that holds shapes, or one the view collapses. */
function isContainer(shape: ElementShape): boolean {
  return shape.holdsContents || shape.collapsed !== undefined;
}

/**
 * Everything one shape draws: its body, toggle and picture, then its texts. A shape with its own
 * outline draws it (`outlineParts`), and an anchored part only its name, since its drawing's picture
 * shows it (ADR 0067).
 */
function shapeParts(writer: Writer, shape: ElementShape): string {
  const { outline } = shape;
  // An anchored part of a solid is drawn by its drawing's picture, and traced over it (ADR 0075).
  if (isAnchoredSolidPart(shape)) return '';
  if (outline && shape.part?.inDrawing === true) {
    return outlinedText(writer, shape, outline, shape.part.color);
  }
  const painted = shapeColors(shape, writer.theme.name);
  // A shape in a container of nearly its own fill keeps an outline that tells it apart, as on the canvas.
  const colors = {
    fill: painted.fill,
    stroke: outlineColorOf(
      shape.containerShape === undefined
        ? painted
        : { ...painted, containerShape: shape.containerShape },
    ),
  };
  // A face is drawn in place of the shape's name and detail, as on the canvas (ADR 0083).
  const face = faceOf(writer, shape, {
    fill: shape.part ? shape.part.color : painted.fill,
    stroke: painted.stroke,
  });
  // Its `<icon/>` draws the shape's own image, or its solid's picture, which is then drawn nowhere
  // else as an icon.
  const ownPicture = () => {
    const placed = pictureOn(shape);
    if (!placed) return '';
    if (face?.icon && (placed.placement === 'icon' || placed.placement === 'header')) return '';
    return shape.image
      ? writer.picture(shape.image, shape.image.rect)
      : solidParts(writer, shape, colors.stroke);
  };
  // A region is its faint fill, its thin border and its name tab (ADR 0086).
  if (shape.region) return regionParts(writer, shape, painted.stroke) + ownPicture();
  if (isRow(shape)) return rowParts(writer, shape, colors.fill, face?.svg, ownPicture);
  if (outline) return outlineParts(writer, shape, outline, colors, face?.svg, ownPicture);
  if (drawsRows(shape)) {
    return (
      tableParts(writer, shape, colors) +
      toggleOf(shape, colors) +
      ownPicture() +
      (face ? face.svg : tableText(writer, shape, colors.fill))
    );
  }
  let body = '';
  const drawing = pictureOn(shape)?.placement === 'drawing';
  // A solid without its picture is its placeholder: its outline just inside its plate, as the canvas
  // draws it until its picture comes (ADR 0075).
  const placeholder = shape.solid !== undefined && !writer.solidPicture(shape);
  // With soft shadows, a shape that holds nothing lays its shadow first (ADR 0086).
  if (writer.drawing.shapes.shadow === 'soft' && !isContainer(shape)) {
    body += shadowMarkup(shape.kind, bodyRectOf(shape), writer.drawing);
  }
  if (shape.collapsed !== undefined) {
    const inner = bodyOf(shape);
    if (inner !== shape.rect) {
      body += bodyMarkup(
        shape.kind,
        { ...inner, x: inner.x + SHEET, y: inner.y + SHEET },
        colors,
        writer.drawing,
      );
    }
    body += bodyMarkup(shape.kind, inner, colors, writer.drawing);
    // A second border inside, where the drawing defaults count what it holds.
    if (showsInnerBorder(shape.collapsed)) {
      const within = grow(inner, -INNER_BORDER);
      if (within.width > 0 && within.height > 0) {
        body += bodyMarkup(
          shape.kind,
          within,
          { fill: 'none', stroke: colors.stroke },
          {
            ...writer.drawing,
            shapes: { ...writer.drawing.shapes, borderWidth: 1 },
          },
        );
      }
    }
  } else if (!drawing) {
    body += bodyMarkup(shape.kind, shape.rect, colors, writer.drawing);
  } else if (placeholder) {
    body += bodyMarkup(shape.kind, bodyRectOf(shape), colors, writer.drawing);
  }
  // Otherwise a shape drawn by its picture is covered by the picture's plate, always ready here.
  body += toggleOf(shape, colors);
  const placed = pictureOn(shape);
  if (placed) {
    if (drawing && !placeholder) body += plateOf(placed.box, colors.fill);
    body += ownPicture();
  }
  // A drawing with parts that is no container writes its name in its name tag, under its box.
  if (writesNameBelow(shape)) {
    return body + nameTagParts(writer, shape, colors) + (face?.svg ?? '');
  }
  return body + (face ? face.svg : shapeText(writer, shape, colors.fill));
}

/** A shape's face as SVG, and whether it draws the shape's own image as its `<icon/>`. */
interface WrittenFace {
  svg: string;
  icon: boolean;
}

/**
 * A shape's face, as the canvas draws it in place of its name and detail (ADR 0083): laid out where
 * the canvas lays it out (`faceRect`), in the variant the export shows (`exportedFaceShow`), in its
 * tokens' colors on the shape's fill and stroke; none when the shape has no face, the export shows
 * none, or it draws nothing, as the canvas then writes the name.
 */
function faceOf(
  writer: Writer,
  shape: ElementShape,
  colors: { fill: Color; stroke: Color },
): WrittenFace | undefined {
  if (!shape.face) return undefined;
  const show = exportedFaceShow(shape);
  const drawing = show && shapeFaceDrawing(shape, show);
  if (!drawing || !facePaints(drawing)) return undefined;
  const at = faceRect(shape);
  const palette = facePalette(writer.theme.name, colors.fill, colors.stroke);
  const icon =
    pictureOn(shape) !== undefined && drawing.images.some((each) => each.kind === 'icon');
  return {
    svg: faceSvg(drawing, at, palette, writer.texts, (image, rect) =>
      facePicture(writer, shape, image, rect),
    ),
    icon,
  };
}

/**
 * A face's picture in its box, its proportions kept, centred (ADR 0083): `<icon/>` the shape's own
 * image, `<image ref="…"/>` an image of its component's package; nothing when it has none.
 */
function facePicture(writer: Writer, shape: ElementShape, image: FaceImage, rect: Rect): string {
  // A solid shown by `<icon/>` is drawn there, its picture's proportions kept (ADR 0075).
  if (image.kind === 'icon' && shape.solid) {
    const { width, height } = shape.solid.rect;
    const placed = facePictureRect(rect, width, height);
    return placed
      ? solidParts(writer, shape, shapeColors(shape, writer.theme.name).stroke, placed)
      : '';
  }
  // The images of its package the scene found for the face, as the canvas draws them.
  const source: PictureSource | undefined =
    image.kind === 'icon' ? shape.image : shape.face?.pictures?.[image.ref];
  if (!source) return '';
  const placed = facePictureRect(rect, source.image.width, source.image.height);
  return placed ? writer.picture(source, placed) : '';
}

/** A shape's body by its kind, filled and stroked. */
function bodyMarkup(
  kind: ElementShape['kind'],
  rect: Rect,
  colors: { fill: Color; stroke: Color },
  drawing: ResolvedDrawing,
): string {
  const { x, y, width, height } = rect;
  const border = drawing.shapes.borderWidth;
  const paint = { fill: colors.fill, stroke: colors.stroke, 'stroke-width': border };
  switch (kind) {
    case 'rectangle':
      return empty('rect', { x, y, width, height, ...paint });
    case 'rounded-rectangle': {
      const radius = roundedCornerRadius(drawing, width, height);
      return empty('rect', { x, y, width, height, rx: radius, ...paint });
    }
    case 'ellipse':
      return empty('ellipse', {
        cx: x + width / 2,
        cy: y + height / 2,
        rx: width / 2,
        ry: height / 2,
        ...paint,
      });
    case 'cylinder': {
      const cap = cylinderCap(rect);
      const radius = width / 2;
      const middle = x + radius;
      const top = y + cap;
      const bottom = y + height - cap;
      // The body, closed along the back of its top cap; then the front of its top cap.
      const outline =
        `M${num(x)} ${num(bottom)}` +
        halfEllipse(middle, bottom, radius, cap, 'below') +
        `L${num(x + width)} ${num(top)}` +
        halfEllipse(middle, top, radius, cap, 'above', true) +
        'Z';
      const front = `M${num(x)} ${num(top)}${halfEllipse(middle, top, radius, cap, 'below')}`;
      return (
        empty('path', { d: outline, ...paint }) +
        empty('path', {
          d: front,
          fill: 'none',
          stroke: colors.stroke,
          'stroke-width': border,
        })
      );
    }
    case 'person': {
      // A head over shoulders drawn as one rounded arc (ADR 0086).
      const figure = personFigure(rect);
      const { head } = figure;
      return (
        empty('path', {
          d: polygonPath(personBodyPoints(figure, personCornerRadius(drawing, width))),
          ...paint,
        }) + empty('circle', { cx: head.x, cy: head.y, r: head.radius, ...paint })
      );
    }
  }
}

/**
 * Half an ellipse as two cubic Béziers, from one end of its horizontal axis to the other, through the
 * point above or below its centre: from the left end, or from the right end when `fromRight`.
 */
function halfEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  through: 'above' | 'below',
  fromRight = false,
): string {
  const side = fromRight ? 1 : -1;
  const dy = through === 'below' ? ry : -ry;
  const start = { x: cx + side * rx, y: cy };
  const mid = { x: cx, y: cy + dy };
  const end = { x: cx - side * rx, y: cy };
  const first = cubic(
    { x: start.x, y: start.y + dy * KAPPA },
    { x: mid.x + side * rx * KAPPA, y: mid.y },
    mid,
  );
  const second = cubic(
    { x: mid.x - side * rx * KAPPA, y: mid.y },
    { x: end.x, y: end.y + dy * KAPPA },
    end,
  );
  return first + second;
}

function cubic(c1: Point, c2: Point, to: Point): string {
  return `C${num(c1.x)} ${num(c1.y)} ${num(c2.x)} ${num(c2.y)} ${num(to.x)} ${num(to.y)}`;
}

/** A container's toggle: a small square, − on an expanded one and + on a collapsed one. */
function toggleOf(shape: ElementShape, colors: { fill: Color; stroke: Color }): string {
  const toggle = toggleRect(shape);
  if (!toggle) return '';
  const { x, y, width, height } = toggle;
  const middleX = x + width / 2;
  const middleY = y + height / 2;
  const arm = width * TOGGLE_LOOK.arm;
  let sign = `M${num(middleX - arm)} ${num(middleY)}H${num(middleX + arm)}`;
  if (shape.collapsed !== undefined) {
    sign += `M${num(middleX)} ${num(middleY - arm)}V${num(middleY + arm)}`;
  }
  return (
    empty('rect', {
      'data-part': 'toggle',
      x,
      y,
      width,
      height,
      rx: TOGGLE_LOOK.radius,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': TOGGLE_LOOK.border,
    }) +
    empty('path', {
      d: sign,
      fill: 'none',
      stroke: readableTextColors(colors.fill).name,
      'stroke-width': TOGGLE_LOOK.sign,
    })
  );
}

/** A closed polygon of flat points as path data. */
function polygonPath(points: readonly number[]): string {
  let d = '';
  for (let at = 0; at + 1 < points.length; at += 2) {
    d += `${at === 0 ? 'M' : 'L'}${num(points[at] as number)} ${num(points[at + 1] as number)}`;
  }
  return d === '' ? '' : `${d}Z`;
}

/**
 * A shape's soft shadow, as the canvas lays it (ADR 0086): one copy offset down, in layers each a
 * unit wider than the next, black at a part of its alpha each.
 */
function shadowMarkup(kind: ElementShape['kind'], rect: Rect, drawing: ResolvedDrawing): string {
  const { offset, alpha, layers } = SOFT_SHADOW;
  let markup = '';
  for (let layer = layers - 1; layer >= 0; layer--) {
    const at = grow({ ...rect, y: rect.y + offset }, layer);
    const paint = { fill: '#000000', 'fill-opacity': num(alpha / layers) };
    const { x, y, width, height } = at;
    switch (kind) {
      case 'rectangle':
        markup += empty('rect', { x, y, width, height, ...paint });
        break;
      case 'ellipse':
        markup += empty('ellipse', {
          cx: x + width / 2,
          cy: y + height / 2,
          rx: width / 2,
          ry: height / 2,
          ...paint,
        });
        break;
      case 'person':
        markup += empty('path', {
          d: polygonPath(personBodyPoints(personFigure(at), personCornerRadius(drawing, width))),
          ...paint,
        });
        break;
      case 'cylinder':
        markup += empty('rect', {
          x,
          y,
          width,
          height,
          rx: Math.min(width / 2, cylinderCap(at) * 2),
          ...paint,
        });
        break;
      default:
        markup += empty('rect', {
          x,
          y,
          width,
          height,
          rx: roundedCornerRadius(drawing, width, height),
          ...paint,
        });
    }
  }
  return markup;
}

/**
 * A container drawn as a region, as the canvas draws it (ADR 0086): its stroke's color, faint, as its
 * fill, a thin border at a part of that color, then its kind's icon, its name and its toggle.
 */
function regionParts(writer: Writer, shape: ElementShape, stroke: Color): string {
  const colors = regionColorsOf(writer.theme, writer.drawing);
  const { x, y, width, height } = shape.rect;
  let markup = empty('rect', {
    x,
    y,
    width,
    height,
    rx: regionRadius(shape.rect, writer.drawing),
    fill: stroke,
    'fill-opacity': num(colors.fillAlpha),
    stroke,
    'stroke-opacity': num(colors.borderAlpha),
    'stroke-width': colors.borderWidth,
  });
  const tab = regionTabOf(shape, writer.drawing);
  if (tab.icon) markup += regionIconMarkup(shape.kind, tab.icon, stroke);
  const toggle = toggleRect(shape);
  if (toggle) {
    const middleX = toggle.x + toggle.width / 2;
    const middleY = toggle.y + toggle.height / 2;
    const arm = toggle.width * TOGGLE_LOOK.arm;
    markup +=
      empty('rect', {
        'data-part': 'toggle',
        x: toggle.x,
        y: toggle.y,
        width: toggle.width,
        height: toggle.height,
        rx: TOGGLE_LOOK.radius,
        fill: 'none',
        stroke,
        'stroke-opacity': num(colors.borderAlpha),
        'stroke-width': REGION_BORDER,
      }) +
      empty('path', {
        d: `M${num(middleX - arm)} ${num(middleY)}H${num(middleX + arm)}`,
        fill: 'none',
        stroke,
        'stroke-width': TOGGLE_LOOK.sign,
      });
  }
  const { name, detail } = tab;
  if (detail && name.y + name.height <= y + height) {
    markup += writer.text({
      // Without the markers of its text emphasis, as every detail the SVG writes (ADR 0082).
      text: detailPlainText(shape),
      size: writer.drawing.text.detailSize,
      fill: colors.text,
      x: detail.rect.x,
      align: 'start',
      y: detail.rect.y,
      anchor: 'top',
      wrap: detail.rect.width,
      room: detail.rect.height + 1,
    });
  }
  if (name.y + name.height <= y + height) {
    markup += writer.text({
      text: shape.name,
      size: writer.drawing.text.containerNameSize,
      bold: true,
      weight: 500,
      fill: colors.text,
      x: name.x,
      align: 'start',
      y: name.y,
      anchor: 'top',
      wrap: name.width,
      room: name.height + 1,
    });
  }
  return markup;
}

/** A region's icon, stroked as the canvas strokes it, Lucide's in its box of 24. */
function regionIconMarkup(kind: ElementShape['kind'], box: Rect, color: Color): string {
  const scale = box.width / 24;
  const at = (value: number, origin: number) => origin + value * scale;
  const parts = regionIconOf(kind).map((part) => {
    switch (part.kind) {
      case 'ellipse':
        return empty('ellipse', {
          cx: at(part.cx, box.x),
          cy: at(part.cy, box.y),
          rx: part.rx * scale,
          ry: part.ry * scale,
        });
      case 'rect':
        return empty('rect', {
          x: at(part.x, box.x),
          y: at(part.y, box.y),
          width: part.width * scale,
          height: part.height * scale,
          rx: part.radius * scale,
        });
      case 'line':
        return empty('polyline', {
          points: part.points
            .map((value, index) => num(at(value, index % 2 === 0 ? box.x : box.y)))
            .join(' '),
        });
    }
  });
  return element(
    'g',
    {
      'data-part': 'region-icon',
      fill: 'none',
      stroke: color,
      'stroke-width': num(iconStrokeIn(box)),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    parts.join(''),
  );
}

/** A drawing's plate: a rounded rectangle in its shape's fill, with no stroke. */
function plateOf(box: Rect, fill: Color): string {
  return empty('rect', {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rx: Math.min(PLATE_RADIUS, box.width / 4, box.height / 4),
    fill,
  });
}

/**
 * What a shape writes under its name: its detail, or its component's name on a shape made without
 * one; and on a collapsed container, how many shapes it holds.
 */
function detailOf(shape: ElementShape): string {
  // Without the markers of its text emphasis where it is not drawn with them (ADR 0082).
  const detail = detailPlainText(shape);
  if (shape.collapsed === undefined) return detail;
  const inside = countText(shape.collapsed);
  return detail === '' ? inside : `${detail} · ${inside}`;
}

/** A shape's name and detail, where and as the canvas writes them. */
function shapeText(writer: Writer, shape: ElementShape, fill: Color): string {
  const colors = readableTextColors(fill);
  const detail = detailOf(shape);
  const band = nameBandOf(shape);
  if (band) {
    // A shape drawn by its picture writes under it, on what it sits on.
    const under = readableTextColors(writer.backdropOf(shape));
    const rooms = bandRooms(band);
    const centerX = band.x + band.width / 2;
    const wrap = Math.max(1, band.width - writer.inset);
    return (
      writer.text({
        text: shape.name,
        ...writer.name,
        fill: under.name,
        x: centerX,
        align: 'middle',
        y: band.y + 1,
        anchor: 'top',
        wrap,
        room: rooms.name,
      }) +
      (rooms.detail > 0 && detail !== ''
        ? writer.text({
            text: detail,
            size: writer.drawing.text.detailSize,
            fill: under.detail,
            x: centerX,
            align: 'middle',
            y: band.y + 19,
            anchor: 'top',
            wrap,
            room: rooms.detail,
          })
        : '')
    );
  }
  if (isContainer(shape)) {
    const toggle = toggleRect(shape);
    return headerText(writer, shape, bodyOf(shape), colors, {
      shift: headerShift(shape),
      beside: toggle ? toggle.width + 4 : 0,
    });
  }
  const area = besideImage(shape, labelAreaOf(shape.kind, shape.rect));
  return centredText(writer, shape, area, colors, detail);
}

/**
 * A container's header in an area, from its top left: its name, its detail and, when collapsed, how
 * many shapes it holds, on a line of its own or first on the detail's, as on the canvas. `shift`
 * makes room for an icon at the left, and `beside` for the toggle at the right.
 */
function headerText(
  writer: Writer,
  shape: ElementShape,
  area: Rect,
  colors: { name: Color; detail: Color },
  room: { shift: number; beside: number },
): string {
  const { x, y, width, height } = area;
  const { shift, beside } = room;
  const inset = writer.inset;
  const { detailSize } = writer.drawing.text;
  const wrap = Math.max(1, width - 2 * inset - beside - shift);
  const rooms = headerRoomsOf(writer.drawing, height);
  const { nameTop, detailTop } = headerPlacesOf(writer.drawing);
  const header = headerLines(shape, height, wrap, robotoMeasure, writer.drawing);
  return (
    (rooms.name > 0
      ? writer.text({
          text: shape.name,
          ...writer.containerName,
          fill: colors.name,
          x: x + inset + shift,
          align: 'start',
          y: y + nameTop,
          anchor: 'top',
          wrap,
          room: rooms.name,
        })
      : '') +
    (rooms.detail > 0 && header.detail !== ''
      ? writer.text({
          text: header.detail,
          size: detailSize,
          fill: colors.detail,
          x: x + inset + shift,
          align: 'start',
          y: y + detailTop,
          anchor: 'top',
          wrap,
          room: shape.collapsed === undefined ? rooms.detail : header.detailRoom,
        })
      : '') +
    (header.count !== undefined && header.countRoom !== undefined
      ? writer.text({
          text: header.count,
          size: detailSize,
          fill: colors.detail,
          x: x + inset + shift,
          align: 'start',
          y: y + (header.countTop ?? countLineTopOf(writer.drawing)),
          anchor: 'top',
          wrap: Math.max(1, width - 2 * inset),
          room: header.countRoom,
        })
      : '')
  );
}

/**
 * A shape's name and detail as one block in its label area, placed as the canvas places it
 * (`textBlock.ts`, ADR 0082): the name's lines first, then the detail's, wrapped to its lines and
 * written with its text emphasis.
 */
function centredText(
  writer: Writer,
  shape: ElementShape,
  area: Rect,
  colors: { name: Color; detail: Color },
  detail: string,
): string {
  const centerX = area.x + area.width / 2;
  const wrap = Math.max(1, area.width - writer.inset);
  const block = placeTextBlock({
    drawing: writer.drawing,
    area,
    wrap,
    name: shape.name,
    detail,
    ...(shape.detailRuns && shape.collapsed === undefined ? { detailRuns: shape.detailRuns } : {}),
    ...(shape.detailLines === undefined ? {} : { lines: shape.detailLines }),
    ...(shape.textPlacement === undefined ? {} : { placement: shape.textPlacement }),
  });
  const name = writer.text({
    text: shape.name,
    ...writer.name,
    fill: colors.name,
    x: centerX,
    align: 'middle',
    y: block.nameTop,
    anchor: 'top',
    wrap,
    room: block.nameRoom,
  });
  if (block.detailLines === 0) return name;
  if (shape.detailRuns && block.detail) {
    return (
      name +
      laidTextSvg(
        block.detail,
        { x: centerX - wrap / 2, y: block.detailTop },
        colors.detail,
        robotoMeasure,
        writer.texts,
      )
    );
  }
  return (
    name +
    writer.text({
      text: detail,
      size: writer.drawing.text.detailSize,
      fill: colors.detail,
      x: centerX,
      align: 'middle',
      y: block.detailTop,
      anchor: 'top',
      wrap,
      room: block.detailRoom,
    })
  );
}

// --- Free geometry and named parts (ADR 0066, ADR 0067) --------------------------------------------

/**
 * A shape drawn by its own outline, as the canvas draws its body (`drawOutlinedBody`): free geometry,
 * or a part drawn on its own. Its outline is filled in its fill, or its part's main color, its holes
 * cut and every contour stroked, on a collapsed container over a sheet of its outline offset as a
 * box's sheet is; then its toggle, its picture (a part on its own its part's own picture, as
 * `pictureOf` places it), and its name and detail as `writeOutlinedText` writes them.
 */
function outlineParts(
  writer: Writer,
  shape: ElementShape,
  outline: ShapeOutline,
  colors: { fill: Color; stroke: Color },
  face?: string,
  ownPicture: () => string = () =>
    shape.image ? writer.picture(shape.image, shape.image.rect) : '',
): string {
  const fill = shape.part ? shape.part.color : colors.fill;
  const paint: OutlinePaint = {
    fill,
    stroke: colors.stroke,
    lines: { color: colors.stroke, widths: { least: writer.border } },
  };
  const placed = outlineAt({ rect: shape.rect, outline }) as PlacedOutline;
  let body = '';
  if (shape.collapsed !== undefined && bodyOf(shape) !== shape.rect) {
    body += writer.outline({ ...placed, x: placed.x + SHEET, y: placed.y + SHEET }, paint);
  }
  body += writer.outline(placed, paint) + toggleOf(shape, colors);
  const picture = shape.part ? ownPartPicture(writer, shape, shape.part) : undefined;
  if (picture) body += writer.picture(picture.image, picture.rect);
  else body += ownPicture();
  // A name that does not fit inside the outline whole is written in its name tag, under it.
  if (writesNameBelow(shape)) {
    return body + nameTagParts(writer, shape, { fill, stroke: colors.stroke }) + (face ?? '');
  }
  return body + (face ?? outlinedText(writer, shape, outline, fill));
}

/**
 * A part drawn on its own's own picture (`partPicture`), placed as the canvas places it
 * (`images-draw.ts`): the part's bounds fitted to its shape, their proportions kept, centred.
 */
function ownPartPicture(
  writer: Writer,
  shape: ElementShape,
  part: ShapePart,
): { image: PictureSource; rect: Rect } | undefined {
  // A solid's part is no image's (ADR 0075): the exports' task draws solids' pictures.
  if (part.image === undefined) return undefined;
  const whole = writer.reading.shown(part.image);
  const named = whole && namedPart(whole, part.part);
  const own = whole && partPicture(whole, part.part);
  if (!named || !own) return undefined;
  const { width, height } = named.bounds;
  const { rect } = shape;
  const scale = Math.min(rect.width / width, rect.height / height);
  if (!(scale > 0) || !Number.isFinite(scale)) return undefined;
  return {
    image: { image: own, serial: imageSerial(own) },
    rect: {
      x: rect.x + (rect.width - width * scale) / 2,
      y: rect.y + (rect.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
    },
  };
}

/**
 * A shape's solid where its picture goes (ADR 0075), at its place or at `rect`: the picture the
 * export drew of it, or else its placeholder's mark, a cube seen from a corner in lines of the
 * shape's stroke, as the canvas draws it until its picture comes.
 */
function solidParts(writer: Writer, shape: ElementShape, stroke: Color, rect?: Rect): string {
  const { solid } = shape;
  if (!solid) return '';
  const at = rect ?? solid.rect;
  const picture = writer.solidPicture(shape);
  if (picture) return writer.solidUse(picture, at);
  const lines = solidMarkLines(at);
  if (lines.length === 0) return '';
  return empty('path', {
    'data-part': 'solid-placeholder',
    d: lines
      .map(([from, to]) => `M${num(from.x)} ${num(from.y)}L${num(to.x)} ${num(to.y)}`)
      .join(''),
    fill: 'none',
    stroke,
    'stroke-width': SOLID_MARK_LINE,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

/**
 * Each anchored part of a solid's drawing with parts, as a transparent path over its picture, traced
 * from the picture's part buffer (ADR 0075): the pixels its part and the parts it holds are drawn on,
 * filled by the even-odd rule with no paint that shows, carrying its element's, shape's and
 * component's ids and its part's name, so that a reader of the file can point at it. In the solid's
 * order, so that a part held by another lies over it. None for a drawing drawn as its placeholder.
 */
function tracedSolidParts(
  writer: Writer,
  scene: Scene,
  project: ProjectSnapshot,
  index: ReturnType<typeof modelIndexOf>,
): string[] {
  const catalog = solidsIn(project);
  const traced: string[] = [];
  for (const drawing of scene.shapes) {
    const { solid } = drawing;
    if (solid?.placement !== 'parts') continue;
    const buffer = writer.solidPicture(drawing)?.partBuffer;
    const parts = catalog.solid(solid.id)?.definition.parts;
    if (!buffer || !parts) continue;
    const anchored = [
      ...anchoredByIndex(
        scene.shapes.filter(
          (shape) => isAnchoredSolidPart(shape) && shape.containerShape === drawing.key,
        ),
      ),
    ].sort(([a], [b]) => a - b);
    if (anchored.length === 0) continue;
    const boxes = valueBoxes(buffer);
    const { rect } = solid;
    // Exact to a millionth: a pixel of the picture is a fraction of a unit, which rounding would move.
    const exact = (value: number) => String(Math.round(value * 1e6) / 1e6);
    const transform = `matrix(${[
      rect.width / buffer.width,
      0,
      0,
      rect.height / buffer.height,
      rect.x,
      rect.y,
    ]
      .map(exact)
      .join(' ')})`;
    for (const [at, shape] of anchored) {
      const { from, to } = partValues(parts, at);
      let box: { x1: number; y1: number; x2: number; y2: number } | undefined;
      for (let value = from; value < to; value++) {
        const each = boxes.get(value);
        if (!each) continue;
        box = box
          ? {
              x1: Math.min(box.x1, each.x1),
              y1: Math.min(box.y1, each.y1),
              x2: Math.max(box.x2, each.x2),
              y2: Math.max(box.y2, each.y2),
            }
          : { ...each };
      }
      if (!box) continue;
      const d = tracedPathData(buffer, from, to, {
        x: box.x1,
        y: box.y1,
        width: box.x2 - box.x1,
        height: box.y2 - box.y1,
      });
      if (d === '') continue;
      traced.push(
        empty('path', {
          'data-element': shape.element,
          'data-shape': shape.key,
          'data-component': index.element(shape.element)?.component,
          'data-solid': solid.id,
          'data-solid-part': parts[at]?.name,
          d,
          transform,
          fill: '#000000',
          'fill-opacity': 0,
          'fill-rule': 'evenodd',
        }),
      );
    }
  }
  return traced;
}

/**
 * The name and detail of a shape with its own outline, as the canvas writes them
 * (`writeOutlinedText`), its name always whole, its words never cut:
 *
 * - an anchored part its name alone, centred in its label area, when it fits there
 *   (`partNameLines`), and never its component's name or its detail; one that does not fit is named
 *   only by the canvas's hover and selection marks, which no export draws;
 * - an expanded container in its header, along the stretch of the header line its outline holds;
 *   one whose header has no room writes nothing, as the canvas;
 * - any other shape inside its label area, right of its icon there, when its words fit there whole
 *   (`nameLinesInside`), in colors that read on its fill or its part's main color, with its detail
 *   wrapped under it to its lines, the block placed by its text placement (`outlinedTextBlock`); otherwise in its name tag under its outline, which `outlineParts`
 *   draws (`writesNameBelow`, `nameTagParts`). A collapsed container's detail starts with its count.
 */
function outlinedText(
  writer: Writer,
  shape: ElementShape,
  outline: ShapeOutline,
  fill: Color,
): string {
  const colors = readableTextColors(fill);
  const outlined = { ...shape, outline };
  if (shape.part?.inDrawing === true) {
    const area = labelAreaOn(outlined);
    const lines = partNameLines(shape.name, area);
    if (!lines) return '';
    const top = area.y + area.height / 2 - (lines.length * PART_NAME_LINE) / 2;
    return wholeLines(writer, lines, area.x + area.width / 2, top, colors.name);
  }
  if (showsContents(shape)) {
    const stretch = headerStretch(outlined);
    if (!stretch || stretch.width < LEAST_HEADER_WIDTH) return '';
    const { y, height } = shape.rect;
    const rooms = headerRoomsOf(writer.drawing, height);
    const { nameTop, detailTop } = headerPlacesOf(writer.drawing);
    const left = stretch.x + 2 + headerShift(shape);
    const wrap = Math.max(1, stretch.x + stretch.width - left);
    const detail = detailOf(shape);
    return (
      (rooms.name > 0
        ? writer.text({
            text: shape.name,
            ...writer.containerName,
            fill: colors.name,
            x: left,
            align: 'start',
            y: y + nameTop,
            anchor: 'top',
            wrap,
            room: rooms.name,
          })
        : '') +
      (rooms.detail > 0 && detail !== ''
        ? writer.text({
            text: detail,
            size: writer.drawing.text.detailSize,
            fill: colors.detail,
            x: left,
            align: 'start',
            y: y + detailTop,
            anchor: 'top',
            wrap,
            room: rooms.detail,
          })
        : '')
    );
  }
  const placed = outlinedTextBlock(shape, outline, robotoMeasure);
  if (!placed) return '';
  const { lines, area, wrap, detail, runs, block } = placed;
  const centerX = area.x + area.width / 2;
  const name = wholeLines(writer, lines, centerX, block.nameTop, colors.name);
  if (block.detailLines === 0) return name;
  if (runs && block.detail) {
    return (
      name +
      laidTextSvg(
        block.detail,
        { x: centerX - wrap / 2, y: block.detailTop },
        colors.detail,
        robotoMeasure,
        writer.texts,
      )
    );
  }
  return (
    name +
    writer.text({
      text: detail,
      size: writer.drawing.text.detailSize,
      fill: colors.detail,
      x: centerX,
      align: 'middle',
      y: block.detailTop,
      anchor: 'top',
      wrap,
      room: block.detailRoom,
    })
  );
}

/**
 * The name tag of a shape that writes its name in one (`writesNameBelow`, ADR 0066's clarification of
 * 2026-10-27), as the canvas draws it (`drawNameTag`, `writeNameTag`): a rounded rectangle in the
 * shape's fill and stroke under its outline or its box, its name whole and centred in it, in the
 * colors that read on that fill, and its detail under the name, cut as the tag was made.
 */
function nameTagParts(
  writer: Writer,
  shape: ElementShape,
  colors: { fill: Color; stroke: Color },
): string {
  const tag = nameTagOf(shape);
  if (!tag) return '';
  const placed = placedTag(tag, shape.rect);
  const text = readableTextColors(colors.fill);
  const x = placed.x + placed.width / 2;
  const top = placed.y + TAG_PADDING;
  const height = tag.lines.length * PART_NAME_LINE;
  const box = empty('rect', {
    ...placed,
    rx: tagRadius(tag, writer.drawing),
    fill: colors.fill,
    stroke: colors.stroke,
    'stroke-width': writer.border,
  });
  // A shape whose face writes its name hangs no tag (`faceWritesName`); one whose face does not
  // writes its name in its tag, as on the canvas (ADR 0083).
  return (
    box +
    wholeLines(writer, tag.lines, x, top, text.name) +
    (tag.detail === ''
      ? ''
      : writer.text({
          text: tag.detail,
          size: writer.drawing.text.detailSize,
          fill: text.detail,
          x,
          align: 'middle',
          y: top + height + 1,
          anchor: 'top',
          wrap: placed.width,
          room: TAG_DETAIL_LINE,
        }))
  );
}

/**
 * A name on lines already broken, each whole, bold at a name's size, centred at `x`, the first at
 * `top`, 17.5 units apart, as the canvas writes a name it never cuts.
 */
function wholeLines(
  writer: Writer,
  lines: readonly string[],
  x: number,
  top: number,
  fill: Color,
): string {
  return lines
    .map((line, at) =>
      writer.text({
        text: line,
        size: PART_NAME_SIZE,
        bold: writer.name.bold,
        weight: writer.name.weight,
        fill,
        x,
        align: 'middle',
        y: top + (at + 0.5) * PART_NAME_LINE,
        anchor: 'middle',
      }),
    )
    .join('');
}

/**
 * What changes how a drawing's anchored parts look, over their places, as the canvas's part layer
 * draws it where the picture shows (`drawPartMarks`, `writePartBadges`), with nothing hidden or faint:
 * an overlay's fill fills the part's outline, its holes cut and its lines as bands; its opacity then
 * lays a veil of the drawing's fill, of one less that opacity; its stroke strokes every contour two
 * units wide; and its badge is written at the part's label point, under the lines of its name when it
 * writes one, in the text that reads on its fill or its main color, over a halo of that color. One
 * group for each part something changes, named by its element and its shape.
 */
function partMarksParts(writer: Writer, marks: DrawingMarks): string[] {
  const fill = shapeColors(marks.drawing, writer.theme.name).fill;
  return marks.parts.flatMap((mark) => {
    const { outline, shape } = mark;
    let parts = '';
    if (mark.fill !== undefined) {
      parts += writer.outline(outline, {
        fill: mark.fill,
        lines: { color: mark.fill, widths: { least: 1 } },
      });
    }
    if (mark.opacity !== undefined) {
      parts += writer.outline(outline, {
        fill,
        lines: { color: fill, widths: { least: 1 } },
        opacity: 1 - mark.opacity,
      });
    }
    if (mark.stroke !== undefined) {
      parts += writer.outline(outline, {
        stroke: mark.stroke,
        strokeWidth: OVERLAY_STROKE,
        round: true,
        lines: { color: mark.stroke, widths: { width: OVERLAY_STROKE } },
      });
    }
    // The name its fill would hide, written again over it, as the canvas's part layer does.
    if (mark.fill !== undefined && shape.outline) {
      const area = labelAreaOn({ rect: shape.rect, outline: shape.outline });
      const lines = partNameLines(shape.name, area);
      if (lines) {
        const top = area.y + area.height / 2 - (lines.length * PART_NAME_LINE) / 2;
        parts += wholeLines(
          writer,
          lines,
          area.x + area.width / 2,
          top,
          readableTextColors(mark.fill).name,
        );
      }
    }
    if (mark.badge !== undefined && shape.outline) {
      const area = labelAreaOn({ rect: shape.rect, outline: shape.outline });
      const lines = partNameLines(shape.name, area);
      const under = mark.fill ?? mark.color;
      parts += writer.text({
        text: mark.badge,
        size: BADGE_SIZE,
        fill: readableTextColors(under).detail,
        halo: { color: under, width: BADGE_HALO },
        x: area.x + area.width / 2,
        align: 'middle',
        y: area.y + area.height / 2 + (lines ? (lines.length * PART_NAME_LINE) / 2 + 2 : 0),
        anchor: lines ? 'top' : 'middle',
      });
    }
    return parts === ''
      ? []
      : [element('g', { 'data-element': shape.element, 'data-shape': shape.key }, parts)];
  });
}

/** A table's body: its sheet when collapsed, then its body, header band, the rule and its border. */
function tableParts(
  writer: Writer,
  shape: ElementShape,
  colors: { fill: Color; stroke: Color },
): string {
  const rows = rowColorsOf(writer.theme);
  const body = bodyOf(shape);
  let parts = '';
  if (body !== shape.rect) {
    parts += tableBody(
      shape,
      { ...body, x: body.x + SHEET, y: body.y + SHEET },
      false,
      colors,
      rows.body,
      writer.drawing,
    );
  }
  return parts + tableBody(shape, body, true, colors, rows.body, writer.drawing);
}

function tableBody(
  shape: ElementShape,
  rect: Rect,
  header: boolean,
  colors: { fill: Color; stroke: Color },
  bodyFill: Color,
  drawing: ResolvedDrawing,
): string {
  const { x, y, width, height } = rect;
  const rounded = shape.kind === 'rounded-rectangle';
  const radius = rounded ? rowsCornerRadius(drawing, width, height) : undefined;
  const border = drawing.shapes.borderWidth;
  // A face gives the header its height (ADR 0083), as on the canvas.
  const band = Math.min(shape.header ?? ROWS_HEADER, height);
  let parts = empty('rect', { x, y, width, height, rx: radius, fill: bodyFill });
  if (header) {
    if (radius !== undefined) {
      // The header follows the rounded top corners, as one path with a straight bottom.
      const r = Math.min(radius, band);
      const d =
        `M${num(x)} ${num(y + band)}L${num(x)} ${num(y + r)}` +
        cubic({ x, y: y + r - r * KAPPA }, { x: x + r - r * KAPPA, y }, { x: x + r, y }) +
        `L${num(x + width - r)} ${num(y)}` +
        cubic(
          { x: x + width - r + r * KAPPA, y },
          { x: x + width, y: y + r - r * KAPPA },
          { x: x + width, y: y + r },
        ) +
        `L${num(x + width)} ${num(y + band)}Z`;
      parts += empty('path', { d, fill: colors.fill });
    } else {
      parts += empty('rect', { x, y, width, height: band, fill: colors.fill });
    }
    if (band < height) {
      parts += empty('rect', {
        x,
        y: y + band - border,
        width,
        height: border,
        fill: colors.stroke,
      });
    }
  }
  return (
    parts +
    empty('rect', {
      x,
      y,
      width,
      height,
      rx: radius,
      fill: 'none',
      stroke: colors.stroke,
      'stroke-width': border,
    })
  );
}

/** A table's header text: its name centred on its band's height, its detail at the right. */
function tableText(writer: Writer, shape: ElementShape, fill: Color): string {
  const fitted = shape.fitted;
  if (!fitted) return '';
  const body = bodyOf(shape);
  const colors = readableTextColors(fill);
  const band = Math.min(shape.header ?? ROWS_HEADER, body.height);
  const middle = body.y + band / 2;
  const sizes = rowTextSizesOf(writer.drawing);
  let parts = '';
  if (fitted.name !== '') {
    parts += writer.text({
      text: fitted.name,
      ...writer.name,
      size: sizes.headerName,
      fill: colors.name,
      x: body.x + HEADER_INSET + headerShift(shape),
      align: 'start',
      y: middle,
      anchor: 'middle',
      room: band,
    });
  }
  if (fitted.detail !== '') {
    const toggle = toggleRect(shape) ? HEADER_TOGGLE : 0;
    parts += writer.text({
      text: fitted.detail,
      size: sizes.headerDetail,
      fill: colors.detail,
      x: body.x + body.width - HEADER_DETAIL_INSET - toggle,
      align: 'end',
      y: middle,
      anchor: 'middle',
      room: band,
    });
  }
  return parts;
}

/** A row: its band inside its table's border, a separator above it after the first, its texts. */
function rowParts(
  writer: Writer,
  shape: ElementShape,
  fill: Color,
  face?: string,
  ownPicture: () => string = () =>
    shape.image ? writer.picture(shape.image, shape.image.rect) : '',
): string {
  const { x, y, width, height } = shape.rect;
  const left = x + ROW_INSIDE;
  const inner = Math.max(0, width - 2 * ROW_INSIDE);
  let parts = empty('rect', { x: left, y, width: inner, height, fill });
  if ((shape.row ?? 0) > 0) {
    parts += empty('rect', {
      x: left,
      y,
      width: inner,
      height: ROW_SEPARATOR,
      fill: rowColorsOf(writer.theme).separator,
    });
  }
  parts += ownPicture();
  // A row with a face draws it over its band, in place of its texts (ADR 0083).
  if (face !== undefined) return parts + face;
  const fitted = shape.fitted;
  if (!fitted) return parts;
  const colors = readableTextColors(fill);
  const middle = y + height / 2;
  if (shape.columns) return parts + rowColumnsParts(writer, shape, shape.columns, colors.detail);
  if (fitted.name !== '') {
    parts += writer.text({
      text: fitted.name,
      size: rowTextSizesOf(writer.drawing).rowName,
      fill: colors.detail,
      x: x + ROW_INSET + (showsPicture(shape) ? ROW_ICON : 0),
      align: 'start',
      y: middle,
      anchor: 'middle',
      room: height,
    });
  }
  if (fitted.detail !== '') {
    parts += writer.text({
      text: fitted.detail,
      size: rowTextSizesOf(writer.drawing).rowDetail,
      fill: colors.detail,
      x: x + width - ROW_INSET,
      align: 'end',
      y: middle,
      anchor: 'middle',
      room: height,
    });
  }
  return parts;
}

/**
 * A row's texts in its table's columns, as the canvas writes them (`writeRowColumns`): its name at
 * the left, its column's type in Roboto Mono from the type column's left edge, its badges after.
 */
function rowColumnsParts(
  writer: Writer,
  shape: ElementShape,
  columns: RowColumns,
  color: Color,
): string {
  const { x, y, height } = shape.rect;
  const sizes = rowTextSizesOf(writer.drawing);
  const at = (text: string, left: number, size: number, mono?: true) =>
    text === ''
      ? ''
      : writer.text({
          text,
          size,
          fill: color,
          x: left,
          // A type ends at its column's right edge, one x for every row (ADR 0086).
          align: mono ? 'end' : 'start',
          y: y + height / 2,
          anchor: 'middle',
          room: height,
          ...(mono ? { mono } : {}),
        });
  return (
    at(columns.name, x + ROW_INSET + (showsPicture(shape) ? ROW_ICON : 0), sizes.rowName) +
    at(columns.type, x + columns.typeEnd, sizes.rowDetail, true) +
    at(columns.badges, x + columns.badgesX, sizes.rowDetail)
  );
}

// --- Relations -----------------------------------------------------------------------------------

/** The attributes that name what a line draws: its relation, or those an aggregated one stands for. */
function partOf(line: RelationLine): Record<string, string | undefined> {
  return line.aggregate
    ? {
        'data-relations': standsFor(line).join(' '),
        'data-relation-type': line.aggregate.relationType,
      }
    : { 'data-relation': line.relation };
}

/** The path a route takes through its points. */
function pathThrough(points: readonly Point[]): string {
  return points
    .map((point, at) => `${at === 0 ? 'M' : 'L'}${num(point.x)} ${num(point.y)}`)
    .join('');
}

/** The path of a curved line's spans, up to the base of its arrowhead. */
function curvePath(line: RelationLine): string {
  const spans = drawnCurve(line);
  const [first] = spans;
  if (!first) return '';
  return (
    `M${num(first.from.x)} ${num(first.from.y)}` +
    spans.map((span) => cubic(span.c1, span.c2, span.to)).join('')
  );
}

/** An arrowhead's path: a closed triangle, or for an open one its two sides from the tip. */
function arrowheadPath(arrowhead: Arrowhead): string {
  const { tip, left, right } = arrowhead;
  if (arrowhead.open) {
    return `M${num(left.x)} ${num(left.y)}L${num(tip.x)} ${num(tip.y)}L${num(right.x)} ${num(right.y)}`;
  }
  return `M${num(tip.x)} ${num(tip.y)}L${num(left.x)} ${num(left.y)}L${num(right.x)} ${num(right.y)}Z`;
}

/**
 * An arrowhead drawn in `color`: filled, or for an open one, stroked at its line's `width`, with
 * `extra` more for a casing.
 */
function arrowheadMarkup(arrowhead: Arrowhead, color: Color, width: number, extra = 0): string {
  if (arrowhead.open) {
    return empty('path', {
      d: arrowheadPath(arrowhead),
      fill: 'none',
      stroke: color,
      'stroke-width': width + extra,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
  }
  return empty('path', {
    d: arrowheadPath(arrowhead),
    fill: color,
    ...(extra > 0 ? { stroke: color, 'stroke-width': extra, 'stroke-linejoin': 'round' } : {}),
  });
}

/** How a line is dashed: its dashes and gaps in canvas units, from its width, as the canvas's. */
function dashArray(line: { dash: RelationLine['dash']; width: number }): string | undefined {
  if (line.dash === 'solid') return undefined;
  const { on, period } = DASH_PATTERNS[line.dash];
  return `${num(on * line.width)} ${num((period - on) * line.width)}`;
}

/** The casing under a line: its route stroked wider in the canvas's color, on to its tip. */
function casingOf(line: RelationLine, background: Color): string {
  const d = line.curve ? curvePath(line) : pathThrough(line.route);
  if (d === '') return '';
  return (
    empty('path', {
      ...partOf(line),
      d,
      stroke: background,
      'stroke-width': line.width + CASING_EXTRA,
    }) +
    (line.arrowhead ? arrowheadMarkup(line.arrowhead, background, line.width, CASING_EXTRA) : '')
  );
}

/** A line along its route, dashed as its relation type says, with its arrowhead. */
function routeOf(line: RelationLine, stroke: Color): string {
  const d = line.curve ? curvePath(line) : pathThrough(untilArrowhead(line.route, line.arrowhead));
  return (
    (d === ''
      ? ''
      : empty('path', {
          d,
          fill: 'none',
          stroke,
          'stroke-width': line.width,
          'stroke-dasharray': dashArray(line),
          'stroke-linejoin': 'miter',
        })) + (line.arrowhead ? arrowheadMarkup(line.arrowhead, stroke, line.width) : '')
  );
}

/** A relation's name at the middle of its route, over a back of the canvas's color. */
function relationLabel(writer: Writer, line: RelationLine): string {
  if (!line.label) return '';
  const { relationLabelText: text, relationLabelBack: back } = writer.theme;
  const size = writer.drawing.text.labelSize;
  const spec = {
    text: line.label,
    size,
    x: line.middle.x,
    align: 'middle' as const,
    y: line.middle.y,
    anchor: 'middle' as const,
  };
  const laidOut = layOutText(spec);
  const [first] = laidOut.lines;
  if (!first) return '';
  // An aggregated relation's count badge: a pill bordered in its line's color (ADR 0086).
  if (line.countBadge) {
    const pill = countBadgeSize(textWidth(first.text, size), laidOut.lineHeight);
    return (
      empty('rect', {
        'data-part': 'count-badge',
        x: line.middle.x - pill.width / 2,
        y: line.middle.y - pill.height / 2,
        width: pill.width,
        height: pill.height,
        rx: pill.height / 2,
        fill: back,
        stroke: lineStroke(line, writer.theme.name),
        'stroke-width': COUNT_BADGE_PADDING.border,
      }) + writer.text({ ...spec, fill: text })
    );
  }
  // As wide as its text, by the estimate the scene fits rows with, which leans wide.
  const width = textWidth(first.text, size) + 2 * RELATION_LABEL_BACK.x;
  const height = laidOut.lineHeight + 2 * RELATION_LABEL_BACK.y;
  return (
    empty('rect', {
      x: line.middle.x - width / 2,
      y: line.middle.y - height / 2,
      width,
      height,
      fill: back,
    }) + writer.text({ ...spec, fill: text })
  );
}

// --- Free shapes ---------------------------------------------------------------------------------

function noteParts(writer: Writer, note: NoteShape): string {
  const colors = noteColors(note, writer.theme);
  const { x, y, width, height } = note.rect;
  // Where the canvas writes it (`noteTextPlaceIn`).
  const place = noteTextPlaceIn(note.rect, writer.drawing);
  const { size } = place;
  return element(
    'g',
    { 'data-free-shape': note.id },
    empty('rect', {
      x,
      y,
      width,
      height,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1,
    }) +
      (drawsDifferently(note.text)
        ? laidTextSvg(
            layOutBlocks(parseEmphasis(note.text, { blocks: true }), {
              measure: robotoMeasure,
              size,
              width: place.width,
              align: 'left',
              maxHeight: place.height,
            }),
            { x: place.x, y: place.y },
            colors.text,
            robotoMeasure,
            writer.texts,
          )
        : writer.text({
            text: note.text,
            size,
            fill: colors.text,
            x: place.x,
            align: 'start',
            y: place.y,
            anchor: 'top',
            wrap: place.width,
            // The canvas stops a long text at the note's bottom, and so does this.
            room: place.height,
          })),
  );
}

function arrowParts(arrow: ArrowShape, stroke: Color, theme: CanvasTheme, width: number): string {
  const { from, to, arrowhead } = arrow;
  return element(
    'g',
    { 'data-free-shape': arrow.id },
    empty('path', {
      d: pathThrough([from, to]),
      fill: 'none',
      stroke: theme.background,
      'stroke-width': width + CASING_EXTRA,
    }) +
      arrowheadMarkup(arrowhead, theme.background, width, CASING_EXTRA) +
      empty('path', {
        d: pathThrough(untilArrowhead([from, to], arrowhead)),
        fill: 'none',
        stroke,
        'stroke-width': width,
      }) +
      arrowheadMarkup(arrowhead, stroke, width),
  );
}

// --- Title, description and metadata -------------------------------------------------------------

/**
 * The drawing's description: the view's own, then where its long description is, the view's outline
 * in Markdown.
 */
function descriptionOf(view: ViewFile, outlineFile: string | undefined): string {
  const own = view.description?.trim() ?? '';
  const outline =
    outlineFile === undefined
      ? t(
          'Its long description, an outline of every shape and relation, is the view exported as Markdown.',
        )
      : t('Its long description, an outline of every shape and relation, is in “{file}”.', {
          file: outlineFile,
        });
  return own === '' ? outline : `${own}\n\n${outline}`;
}

/** What a package that ships says about its license and attribution (ADR-0047), when it says it. */
interface Attribution {
  package: string;
  license?: string;
  attribution?: string;
}

/**
 * The attribution of the packages the drawing uses: those whose components, relation types and
 * pictures it draws, in the project's order, each with what it records.
 */
function attributionOf(
  project: ProjectSnapshot,
  scene: Scene,
  index: ReturnType<typeof modelIndexOf>,
): Attribution[] {
  const definitions = definitionsIn(project);
  const used = new Set<Id>();
  for (const shape of scene.shapes) {
    const component = index.element(shape.element)?.component;
    const defined = component === undefined ? undefined : definitions.components.get(component);
    if (defined) used.add(defined.package);
    if (shape.image) used.add(shape.image.id.split('.')[0] ?? '');
    // A solid's source and license are its package's to record (ADR 0075).
    if (shape.solid) used.add(shape.solid.id.split('.')[0] ?? '');
    // A part on its own draws its picture's part (ADR 0067).
    if (shape.part?.image !== undefined) used.add(shape.part.image.split('.')[0] ?? '');
  }
  for (const line of scene.relations) {
    const type = line.aggregate
      ? line.aggregate.relationType
      : index.relation(line.relation)?.relationType;
    const defined = type === undefined ? undefined : definitions.relationTypes.get(type);
    if (defined) used.add(defined.package);
  }
  return project.packages
    .filter((file) => used.has(file.id))
    .map((file) => {
      // ADR-0047's fields, read when a package records them.
      const recorded = file as { license?: unknown; attribution?: unknown };
      return {
        package: file.name,
        ...(typeof recorded.license === 'string' ? { license: recorded.license } : {}),
        ...(typeof recorded.attribution === 'string' ? { attribution: recorded.attribution } : {}),
      };
    });
}

/** The attribution as one line per package that records any, for a reader's metadata. */
function attributionLines(attribution: readonly Attribution[]): string[] {
  return attribution
    .filter((each) => each.license !== undefined || each.attribution !== undefined)
    .map((each) =>
      [each.package, each.license, each.attribution]
        .filter((part) => part !== undefined)
        .join(' · '),
    );
}

/** The drawing's metadata in Dublin Core: its title, what made it, and the packages' attribution. */
function metadataOf(project: ProjectSnapshot, view: ViewFile, rights: readonly string[]): string {
  const description =
    textElement('dc:title', {}, view.name) +
    textElement('dc:source', {}, project.project.name) +
    textElement('dc:creator', {}, 'Visual Anything') +
    (rights.length === 0 ? '' : textElement('dc:rights', {}, rights.join('\n')));
  return element(
    'metadata',
    {},
    element(
      'rdf:RDF',
      {
        'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      },
      element('rdf:Description', {}, description),
    ),
  );
}
