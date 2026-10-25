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
 * - every relation in front of the shapes: its casing in the canvas's color, its route with its bends
 *   or its curve, its dashes, its arrowhead, and its name on a back of the canvas's color;
 * - notes and free arrows in front of everything.
 *
 * It leaves out what only the open app shows: the selection, filters, focus, guidance, playback, the
 * grid and the rulers. Each part carries `data-element`, `data-relation` (`data-relations` on an
 * aggregated relation) or `data-free-shape`, so that a page or a test can find it. The view's name and
 * description are its `<title>` and `<desc>`, and its `<desc>` names the outline in Markdown that is
 * the view's long description. The packages' attribution goes in its metadata (ADR-0047).
 */
import {
  modelIndexOf,
  definitionsIn,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Color, Id, ViewFile } from '@visual-anything/schema';
import { t } from '../i18n';
import { readableTextColors } from '../canvas/colors';
import {
  HEADER_DETAIL_INSET,
  HEADER_DETAIL_SIZE,
  HEADER_INSET,
  HEADER_NAME_SIZE,
  HEADER_TOGGLE,
  ROW_DETAIL_SIZE,
  ROW_ICON,
  ROW_INSET,
  ROW_NAME_SIZE,
} from '../canvas/fit';
import {
  SHEET,
  bodyOf,
  cylinderCap,
  grow,
  personHead,
  toggleRect,
  untilArrowhead,
  type Arrowhead,
  type Point,
  type Rect,
} from '../canvas/geometry';
import { drawnCurve } from '../canvas/routing/curves';
import { ROWS_HEADER } from '../canvas/rows';
import { drawsRows, isRow, rowColorsOf } from '../canvas/rowsDraw';
import {
  ARROW_WIDTH,
  buildScene,
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
  headerShift,
  labelAreaOf,
  nameBandOf,
  type ShapeImage,
} from '../canvas/shape-images';
import { arrowStroke, lineStroke, noteColors, shapeColors } from '../canvas/theme/paint';
import { THEMES, type CanvasTheme } from '../theme/themes';
import {
  bitmapSymbol,
  svgSymbol,
  tintFilter,
  tintFilterId,
  type BitmapFormat,
} from './image-symbols';
import { element, empty, num, textElement } from './markup';
import { textWidth } from './measure';
import { layOutText, type TextSpec } from './text-layout';

/** The room left around the scene's bounds, in canvas units, as the PNG of the whole view keeps. */
export const SVG_MARGIN = 32;

/** The fonts the drawing's text is written in, first available first: the canvas's own. */
export const SVG_FONT_FAMILY = "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
}

/** A drawing written as SVG. */
export interface SvgDrawing {
  text: string;
  /** What the drawing shows, in canvas units: the scene's bounds with a margin. */
  viewBox: Rect;
  /** The scene's bounds; none for a view that draws nothing. */
  bounds: Rect | undefined;
  /** What the drawing could not show, in the language the app reads in. */
  lost: string[];
  /** Every text it writes, in order, for a reader that has to check its font holds them. */
  texts: string[];
  /**
   * The license and attribution of each package it draws from that records them (ADR-0047), one line
   * each, as its metadata holds them.
   */
  attribution: string[];
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
  return svgOfScene(project, view, buildScene(project, viewId), options);
}

const SHAPE_STROKE_WIDTH = 1.5;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;
const TEXT_INSET = 12;
const RELATION_LABEL_SIZE = 12;
/** How far a relation's name's back reaches past its text, across and down. */
const LABEL_BACK = { x: 3, y: 1 };
const NOTE_TEXT_SIZE = 13;
/** How much wider than its line a casing is, as the painter draws it. */
const CASING_EXTRA = 2;
const ROW_RULE = 1.5;
const ROW_INSIDE = 1;
const ROW_SEPARATOR = 1;
const PLATE_RADIUS = 6;
/** How far a cubic Bézier's handles reach along a quarter of an ellipse, of its radius. */
const KAPPA = 0.5522847498;

/** Everything one drawing is written with. */
class Writer {
  readonly theme: CanvasTheme;
  readonly lost = new Set<string>();
  readonly texts: string[] = [];
  readonly #symbols = new Map<string, string | null>();
  readonly #defs: string[] = [];
  readonly #filters = new Set<Color>();
  readonly #byKey: ReadonlyMap<string, ElementShape>;
  readonly #bitmaps: ReadonlySet<BitmapFormat>;
  readonly #filtersDrawn: boolean;

  constructor(scene: Scene, options: SvgOptions) {
    this.theme = THEMES[options.theme ?? 'light'].canvas;
    this.#byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
    this.#bitmaps = new Set(options.bitmaps ?? ['png', 'jpeg', 'webp']);
    this.#filtersDrawn = options.filters ?? true;
  }

  get defs(): string {
    return this.#defs.join('');
  }

  /** The fill a shape sits on in this theme: its container's, or the canvas's. */
  backdropOf(shape: ElementShape): Color {
    const holder =
      shape.containerShape === undefined ? undefined : this.#byKey.get(shape.containerShape);
    return holder ? shapeColors(holder, this.theme.name).fill : this.theme.background;
  }

  /** A text laid out and written, each line by its baseline; nothing when it does not fit. */
  text(spec: TextSpec & { fill: Color }): string {
    const { lines } = layOutText(spec);
    if (lines.length === 0) return '';
    for (const line of lines) this.texts.push(line.text);
    const values = {
      'font-size': spec.size,
      'font-weight': spec.bold ? 600 : undefined,
      fill: spec.fill,
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
  }

  /**
   * Where a picture is used: its symbol, written the first time it is needed, and drawn at `rect`.
   * Nothing, and said so, for a picture this drawing cannot hold.
   */
  picture(image: ShapeImage, rect: Rect): string {
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
      if (symbol !== undefined) this.#defs.push(symbol);
      this.#symbols.set(key, id);
    }
    if (id === null) return '';
    let filter: string | undefined;
    if (tint !== undefined && cleaned.kind === 'bitmap') {
      if (this.#filtersDrawn) {
        if (!this.#filters.has(tint)) {
          this.#filters.add(tint);
          this.#defs.push(tintFilter(tint));
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
}

/** Writes a view's scene as SVG. */
export function svgOfScene(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
  options: SvgOptions = {},
): SvgDrawing {
  const writer = new Writer(scene, options);
  const { theme } = writer;
  const index = modelIndexOf(project);
  const bounds = scene.bounds;
  const viewBox = bounds
    ? grow(bounds, SVG_MARGIN)
    : { x: 0, y: 0, width: 2 * SVG_MARGIN, height: 2 * SVG_MARGIN };
  if (!bounds) writer.lost.add(t('The view draws nothing.'));

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
        },
        shapeParts(writer, shape),
      ),
    )
    .join('');

  const lines = scene.relations.map((line) => ({ line, stroke: lineStroke(line, theme.name) }));
  const casings = lines.map(({ line }) => casingOf(line, theme.background)).join('');
  const routes = lines
    .map(({ line, stroke }) => element('g', partOf(line), routeOf(line, stroke)))
    .join('');
  const labels = lines
    .map(({ line }) => {
      const label = relationLabel(writer, line);
      return label === '' ? '' : element('g', partOf(line), label);
    })
    .join('');

  const free =
    scene.notes.map((note) => noteParts(writer, note)).join('') +
    scene.arrows.map((arrow) => arrowParts(arrow, arrowStroke(arrow, theme), theme)).join('');

  const description = descriptionOf(view, options.outlineFile);
  const attribution = attributionLines(attributionOf(project, scene, index));
  const content =
    textElement('title', { id: 'va-title' }, view.name) +
    textElement('desc', { id: 'va-desc' }, description) +
    metadataOf(project, view, attribution) +
    (writer.defs === '' ? '' : element('defs', {}, writer.defs)) +
    empty('rect', {
      'data-part': 'background',
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
      fill: theme.background,
    }) +
    element('g', { 'data-part': 'shapes' }, shapes) +
    element('g', { 'data-part': 'casings', fill: 'none', 'stroke-linecap': 'butt' }, casings) +
    element('g', { 'data-part': 'relations', 'stroke-linecap': 'butt' }, routes) +
    element('g', { 'data-part': 'relation-names' }, labels) +
    element('g', { 'data-part': 'free-shapes' }, free);

  const text =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    element(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        version: '1.1',
        viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(num).join(' '),
        width: viewBox.width,
        height: viewBox.height,
        role: 'img',
        'aria-labelledby': 'va-title',
        'aria-describedby': 'va-desc',
        'font-family': SVG_FONT_FAMILY,
        'data-view': view.id,
        'data-theme': theme.name,
      },
      content,
    ) +
    '\n';
  return { text, viewBox, bounds, lost: [...writer.lost], texts: writer.texts, attribution };
}

// --- Shapes --------------------------------------------------------------------------------------

/** Whether a shape is drawn as a container: one that holds shapes, or one the view collapses. */
function isContainer(shape: ElementShape): boolean {
  return shape.holdsContents || shape.collapsed !== undefined;
}

/** Everything one shape draws: its body, toggle and picture, then its texts. */
function shapeParts(writer: Writer, shape: ElementShape): string {
  const colors = shapeColors(shape, writer.theme.name);
  if (isRow(shape)) return rowParts(writer, shape, colors.fill);
  if (drawsRows(shape)) {
    return (
      tableParts(writer, shape, colors) +
      toggleOf(shape, colors) +
      (shape.image ? writer.picture(shape.image, shape.image.rect) : '') +
      tableText(writer, shape, colors.fill)
    );
  }
  let body = '';
  if (shape.collapsed !== undefined) {
    const inner = bodyOf(shape);
    if (inner !== shape.rect) {
      body += bodyMarkup(shape.kind, { ...inner, x: inner.x + SHEET, y: inner.y + SHEET }, colors);
    }
    body += bodyMarkup(shape.kind, inner, colors);
  } else if (shape.image?.placement !== 'drawing') {
    // A shape drawn by its picture is covered by the picture's plate, which is always ready here.
    body += bodyMarkup(shape.kind, shape.rect, colors);
  }
  body += toggleOf(shape, colors);
  if (shape.image) {
    if (shape.image.placement === 'drawing') body += plateOf(shape.image.box, colors.fill);
    body += writer.picture(shape.image, shape.image.rect);
  }
  return body + shapeText(writer, shape, colors.fill);
}

/** A shape's body by its kind, filled and stroked. */
function bodyMarkup(
  kind: ElementShape['kind'],
  rect: Rect,
  colors: { fill: Color; stroke: Color },
): string {
  const { x, y, width, height } = rect;
  const paint = { fill: colors.fill, stroke: colors.stroke, 'stroke-width': SHAPE_STROKE_WIDTH };
  switch (kind) {
    case 'rectangle':
      return empty('rect', { x, y, width, height, ...paint });
    case 'rounded-rectangle': {
      const radius = Math.min(10, width / 4, height / 4);
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
          'stroke-width': SHAPE_STROKE_WIDTH,
        })
      );
    }
    case 'person': {
      const head = personHead(rect);
      const top = y + head * 1.6;
      return (
        empty('rect', {
          x,
          y: top,
          width,
          height: height - head * 1.6,
          rx: Math.min(12, width / 4),
          ...paint,
        }) + empty('circle', { cx: x + width / 2, cy: y + head, r: head, ...paint })
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
  const arm = width * 0.28;
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
      rx: 3,
      fill: colors.fill,
      stroke: colors.stroke,
      'stroke-width': 1,
    }) +
    empty('path', {
      d: sign,
      fill: 'none',
      stroke: readableTextColors(colors.fill).name,
      'stroke-width': 1.5,
    })
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
  const detail = shape.detail ?? shape.componentName;
  if (shape.collapsed === undefined) return detail;
  const inside = t('{count} inside', { count: shape.collapsed.contents });
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
    const wrap = Math.max(1, band.width - TEXT_INSET);
    return (
      writer.text({
        text: shape.name,
        size: NAME_SIZE,
        bold: true,
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
            size: DETAIL_SIZE,
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
    const { x, y, width, height } = bodyOf(shape);
    const toggle = toggleRect(shape);
    const beside = toggle ? toggle.width + 4 : 0;
    const shift = headerShift(shape);
    const wrap = Math.max(1, width - 2 * TEXT_INSET - beside - shift);
    const rooms = { name: Math.min(20, height - 12), detail: Math.min(16, height - 32) };
    return (
      (rooms.name > 0
        ? writer.text({
            text: shape.name,
            size: NAME_SIZE,
            bold: true,
            fill: colors.name,
            x: x + TEXT_INSET + shift,
            align: 'start',
            y: y + 8,
            anchor: 'top',
            wrap,
            room: rooms.name,
          })
        : '') +
      (rooms.detail > 0 && detail !== ''
        ? writer.text({
            text: detail,
            size: DETAIL_SIZE,
            fill: colors.detail,
            x: x + TEXT_INSET + shift,
            align: 'start',
            y: y + 8 + NAME_SIZE + 6,
            anchor: 'top',
            wrap,
            room: rooms.detail,
          })
        : '')
    );
  }
  const area = besideImage(shape, labelAreaOf(shape.kind, shape.rect));
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const wrap = Math.max(1, area.width - TEXT_INSET);
  const rooms = { name: area.height / 2, detail: area.height / 2 - 6 };
  return (
    (rooms.name > 0
      ? writer.text({
          text: shape.name,
          size: NAME_SIZE,
          bold: true,
          fill: colors.name,
          x: centerX,
          align: 'middle',
          y: centerY + 2,
          anchor: 'bottom',
          wrap,
          room: rooms.name,
        })
      : '') +
    (rooms.detail > 0 && detail !== ''
      ? writer.text({
          text: detail,
          size: DETAIL_SIZE,
          fill: colors.detail,
          x: centerX,
          align: 'middle',
          y: centerY + 4,
          anchor: 'top',
          wrap,
          room: rooms.detail,
        })
      : '')
  );
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
    );
  }
  return parts + tableBody(shape, body, true, colors, rows.body);
}

function tableBody(
  shape: ElementShape,
  rect: Rect,
  header: boolean,
  colors: { fill: Color; stroke: Color },
  bodyFill: Color,
): string {
  const { x, y, width, height } = rect;
  const rounded = shape.kind === 'rounded-rectangle';
  const radius = rounded ? Math.min(8, width / 4, height / 2) : undefined;
  const band = Math.min(ROWS_HEADER, height);
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
        y: y + band - ROW_RULE,
        width,
        height: ROW_RULE,
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
      'stroke-width': SHAPE_STROKE_WIDTH,
    })
  );
}

/** A table's header text: its name centred on its band's height, its detail at the right. */
function tableText(writer: Writer, shape: ElementShape, fill: Color): string {
  const fitted = shape.fitted;
  if (!fitted) return '';
  const body = bodyOf(shape);
  const colors = readableTextColors(fill);
  const band = Math.min(ROWS_HEADER, body.height);
  const middle = body.y + band / 2;
  let parts = '';
  if (fitted.name !== '') {
    parts += writer.text({
      text: fitted.name,
      size: HEADER_NAME_SIZE,
      bold: true,
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
      size: HEADER_DETAIL_SIZE,
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
function rowParts(writer: Writer, shape: ElementShape, fill: Color): string {
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
  if (shape.image) parts += writer.picture(shape.image, shape.image.rect);
  const fitted = shape.fitted;
  if (!fitted) return parts;
  const colors = readableTextColors(fill);
  const middle = y + height / 2;
  if (fitted.name !== '') {
    parts += writer.text({
      text: fitted.name,
      size: ROW_NAME_SIZE,
      fill: colors.detail,
      x: x + ROW_INSET + (shape.image ? ROW_ICON : 0),
      align: 'start',
      y: middle,
      anchor: 'middle',
      room: height,
    });
  }
  if (fitted.detail !== '') {
    parts += writer.text({
      text: fitted.detail,
      size: ROW_DETAIL_SIZE,
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

function arrowheadPath(arrowhead: Arrowhead): string {
  const { tip, left, right } = arrowhead;
  return `M${num(tip.x)} ${num(tip.y)}L${num(left.x)} ${num(left.y)}L${num(right.x)} ${num(right.y)}Z`;
}

/** How a line is dashed: its dashes and gaps in canvas units, from its width. */
function dashArray(line: { dash: RelationLine['dash']; width: number }): string | undefined {
  switch (line.dash) {
    case 'solid':
      return undefined;
    case 'dashed':
      return `${num(4 * line.width)} ${num(3 * line.width)}`;
    case 'dotted':
      return `${num(2 * line.width)} ${num(line.width)}`;
  }
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
    (line.arrowhead
      ? empty('path', {
          d: arrowheadPath(line.arrowhead),
          fill: background,
          stroke: background,
          'stroke-width': CASING_EXTRA,
          'stroke-linejoin': 'round',
        })
      : '')
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
        })) +
    (line.arrowhead ? empty('path', { d: arrowheadPath(line.arrowhead), fill: stroke }) : '')
  );
}

/** A relation's name at the middle of its route, over a back of the canvas's color. */
function relationLabel(writer: Writer, line: RelationLine): string {
  if (!line.label) return '';
  const { relationLabelText: text, relationLabelBack: back } = writer.theme;
  const spec = {
    text: line.label,
    size: RELATION_LABEL_SIZE,
    x: line.middle.x,
    align: 'middle' as const,
    y: line.middle.y,
    anchor: 'middle' as const,
  };
  const laidOut = layOutText(spec);
  const [first] = laidOut.lines;
  if (!first) return '';
  // As wide as its text, by the estimate the scene fits rows with, which leans wide.
  const width = textWidth(first.text, RELATION_LABEL_SIZE) + 2 * LABEL_BACK.x;
  const height = laidOut.lineHeight + 2 * LABEL_BACK.y;
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
      writer.text({
        text: note.text,
        size: NOTE_TEXT_SIZE,
        fill: colors.text,
        x: x + TEXT_INSET,
        align: 'start',
        y: y + 10,
        anchor: 'top',
        wrap: Math.max(1, width - 2 * TEXT_INSET),
        // The canvas lets a long text run past the note; here it stops at the note's bottom.
        room: height - 16,
      }),
  );
}

function arrowParts(arrow: ArrowShape, stroke: Color, theme: CanvasTheme): string {
  const { from, to, arrowhead } = arrow;
  return element(
    'g',
    { 'data-free-shape': arrow.id },
    empty('path', {
      d: pathThrough([from, to]),
      fill: 'none',
      stroke: theme.background,
      'stroke-width': ARROW_WIDTH + CASING_EXTRA,
    }) +
      empty('path', {
        d: arrowheadPath(arrowhead),
        fill: theme.background,
        stroke: theme.background,
        'stroke-width': CASING_EXTRA,
        'stroke-linejoin': 'round',
      }) +
      empty('path', {
        d: pathThrough(untilArrowhead([from, to], arrowhead)),
        fill: 'none',
        stroke,
        'stroke-width': ARROW_WIDTH,
      }) +
      empty('path', { d: arrowheadPath(arrowhead), fill: stroke }),
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
