/**
 * A comparison's drawings as SVG and PDF (ADR 0070): before, after and the comparison of one view,
 * each written from the same scene the canvas draws (`comparisonScene`, ADR-0014's clarification),
 * with the same marks, glyphs and patterns, and the legend below it, as an overlay's legend is
 * (ADR 0055). What is unchanged is faint, and what was removed too, as on the canvas.
 *
 * The glyphs are drawn as paths, not written as text, so that every reader, PDF's fonts included,
 * draws them the same.
 */
import {
  compareView,
  type Comparison,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { DIMMED_ALPHA } from '../canvas/colors';
import { borderPoint, markColor, markItems, type MarkItem } from '../canvas/comparison/marks';
import {
  CHANGE_MARKS,
  MARKS_DRAWN,
  comparisonScene,
  type ChangeMark,
  type ComparisonDrawing,
  type ComparisonScene,
} from '../canvas/comparison/scene';
import { centerOf, type Point, type Rect } from '../canvas/geometry';
import { avoidedScene } from '../canvas/routing/avoided';
import { buildScene, type ElementShape } from '../canvas/scene';
import { t, type Translator } from '../i18n';
import { THEMES, type CanvasTheme } from '../theme/themes';
import { drawingName } from '../canvas/comparison/text';
import { statusName } from '../versions/changes/describe';
import { element, empty, num, textElement } from './markup';
import { textWidth } from './measure';
import { PDF_PICTURES, pdfOfSvg, type PdfFile, type PdfOptions } from './pdf';
import { svgOfScene, type SvgDrawing, type SvgOptions } from './svg';

/** How a comparison's drawing is written. */
export interface ComparisonSvgOptions extends Omit<SvgOptions, 'comparison'> {
  /** Which drawing: before, after or the comparison; the comparison by default. */
  drawing?: ComparisonDrawing;
  /** Whether what is unchanged is faint, as on the canvas; true by default. */
  faint?: boolean;
  /** What the legend calls the comparison, such as “Compared with main (a1b2c3d)”. */
  title?: string;
}

/** The marks' sizes in a drawing, in canvas units: as the canvas draws them at 100%. */
const OUTLINE = 2;
const GAP = 4;
const DOUBLE_GAP = 3;
const BADGE_RADIUS = 7;
const GLYPH = 1.6;
const DASHES = '6 4';
const ARROWHEAD = 7;

/**
 * Writes one drawing of a view of a comparison as SVG: the older version's view before, the newer
 * one's after, or the comparison. Throws when neither version has the view.
 */
export function svgOfComparison(
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  viewId: Id,
  comparison: Comparison,
  options: ComparisonSvgOptions = {},
): SvgDrawing {
  const drawing = options.drawing ?? 'comparison';
  const has = (project: ProjectSnapshot) => project.views.some((view) => view.id === viewId);
  if (!has(older) && !has(newer)) throw new RangeError(`Neither version has the view "${viewId}".`);
  // Lines go around the shapes in their way, as the canvas routes them once its worker is done.
  const sceneOf = (project: ProjectSnapshot) =>
    has(project) ? avoidedScene(buildScene(project, viewId)) : undefined;
  const olderScene = drawing === 'after' ? undefined : sceneOf(older);
  const newerScene = drawing === 'before' ? undefined : sceneOf(newer);
  const shown = comparisonScene(
    older,
    newer,
    viewId,
    compareView(comparison, older, newer, viewId),
    drawing,
    { ...(olderScene ? { older: olderScene } : {}), ...(newerScene ? { newer: newerScene } : {}) },
  );
  const themeName: ThemeName = options.theme ?? 'light';
  const theme = THEMES[themeName].canvas;
  const from = drawing === 'before' ? older : newer;
  const view =
    from.views.find((each) => each.id === viewId) ??
    (older.views.find((each) => each.id === viewId) ||
      newer.views.find((each) => each.id === viewId));
  if (!view) throw new RangeError(`Neither version has the view "${viewId}".`);
  // What was removed is dashed, as the canvas's emphasis dashes it.
  const scene = {
    ...shown.scene,
    relations: shown.scene.relations.map((line) =>
      shown.dashed.has(line.relation) ? { ...line, dash: 'dashed' as const } : line,
    ),
  };
  const faint =
    options.faint === false ? shown.removed : new Set([...shown.unchanged, ...shown.removed]);
  const legend = comparisonLegend(t, shown, options.title, theme);
  const svgOptions: SvgOptions = { ...options };
  for (const own of ['drawing', 'faint', 'title'] as const)
    delete (svgOptions as ComparisonSvgOptions)[own];
  return svgOfScene(from, view, scene, {
    ...svgOptions,
    comparison: {
      faint,
      opacity: DIMMED_ALPHA,
      marks: comparisonMarkParts(shown, theme),
      legend,
      texts: legend.texts,
    },
  });
}

/** The marks of a comparison's scene as SVG, as the canvas's layer draws them at 100%. */
export function comparisonMarkParts(shown: ComparisonScene, theme: CanvasTheme): string[] {
  const parts = markItems(shown).map((item) => markPart(item, theme));
  const byKey = new Map<string, ElementShape>(
    shown.scene.shapes.map((shape) => [shape.key, shape]),
  );
  for (const [key, count] of shown.hidden) {
    const shape = byKey.get(key);
    if (shape) parts.push(countPart(shape.rect, count, theme));
  }
  return parts;
}

function markPart(item: MarkItem, theme: CanvasTheme): string {
  if (item.kind === 'move') return movePart(item.move.was, item.move.is, item.move.line, theme);
  const color = markColor(theme, item.mark);
  const data = { 'data-mark': item.mark, 'data-key': item.key };
  switch (item.kind) {
    case 'shape':
    case 'note': {
      const rect = item.kind === 'shape' ? (item.shape.plate ?? item.shape.rect) : item.note.rect;
      return element(
        'g',
        data,
        outlinePart(rect, item.mark, color) +
          badgePart({ x: rect.x + rect.width, y: rect.y }, item.mark, color, theme),
      );
    }
    case 'line':
      return element(
        'g',
        data,
        alongPart(item.line.route, item.mark, item.line.width, color) +
          badgePart(item.line.middle, item.mark, color, theme),
      );
    case 'arrow': {
      const { from, to } = item.arrow;
      return element(
        'g',
        data,
        alongPart([from, to], item.mark, OUTLINE, color) +
          badgePart({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, item.mark, color, theme),
      );
    }
  }
}

function rectPath(rect: Rect, by: number): string {
  const x = rect.x - by;
  const y = rect.y - by;
  return `M${num(x)} ${num(y)}h${num(rect.width + 2 * by)}v${num(rect.height + 2 * by)}h${num(-(rect.width + 2 * by))}Z`;
}

/** A shape's outline: solid, dashed for what was removed, double for what changed. */
function outlinePart(rect: Rect, mark: ChangeMark, color: string): string {
  const d =
    mark === 'changed'
      ? rectPath(rect, GAP) + rectPath(rect, GAP + DOUBLE_GAP)
      : rectPath(rect, GAP);
  return empty('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': OUTLINE,
    'stroke-dasharray': mark === 'removed' ? DASHES : undefined,
  });
}

function pathThrough(points: readonly Point[]): string {
  return points
    .map((point, at) => `${at === 0 ? 'M' : 'L'}${num(point.x)} ${num(point.y)}`)
    .join('');
}

/** Marks along a route: over it, dashed for what was removed, a double line beside it for what changed. */
function alongPart(
  route: readonly Point[],
  mark: ChangeMark,
  width: number,
  color: string,
): string {
  if (route.length < 2) return '';
  if (mark === 'changed') {
    const away = width / 2 + DOUBLE_GAP;
    let d = '';
    for (const side of [1, -1]) {
      for (let at = 1; at < route.length; at++) {
        const from = route[at - 1] as Point;
        const to = route[at] as Point;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length === 0) continue;
        const nx = (-(to.y - from.y) / length) * away * side;
        const ny = ((to.x - from.x) / length) * away * side;
        d += `M${num(from.x + nx)} ${num(from.y + ny)}L${num(to.x + nx)} ${num(to.y + ny)}`;
      }
    }
    return empty('path', { d, fill: 'none', stroke: color, 'stroke-width': OUTLINE * 0.75 });
  }
  return empty('path', {
    d: pathThrough(route),
    fill: 'none',
    stroke: color,
    'stroke-width': width + OUTLINE,
    'stroke-opacity': mark === 'removed' ? undefined : 0.75,
    'stroke-linecap': mark === 'removed' ? 'butt' : 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': mark === 'removed' ? DASHES : undefined,
  });
}

/** A badge with a state's glyph, on a halo of the canvas's color. */
function badgePart(at: Point, mark: ChangeMark, color: string, theme: CanvasTheme): string {
  return (
    empty('circle', {
      cx: at.x,
      cy: at.y,
      r: BADGE_RADIUS,
      fill: color,
      stroke: theme.background,
      'stroke-width': 1.5,
    }) +
    empty('path', {
      d: glyphPath(at, mark, BADGE_RADIUS),
      fill: 'none',
      stroke: theme.background,
      'stroke-width': GLYPH,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    })
  );
}

/** A state's glyph as path data, as the canvas traces it: `+`, `−`, `~` or `→`. */
export function glyphPath(at: Point, mark: ChangeMark, radius: number): string {
  const half = radius * 0.5;
  const { x, y } = at;
  const p = (dx: number, dy: number) => `${num(x + dx)} ${num(y + dy)}`;
  switch (mark) {
    case 'added':
      return `M${p(-half, 0)}L${p(half, 0)}M${p(0, -half)}L${p(0, half)}`;
    case 'removed':
      return `M${p(-half, 0)}L${p(half, 0)}`;
    case 'changed':
      return `M${p(-half * 1.1, half * 0.2)}Q${p(-half * 0.55, -half * 0.7)} ${p(0, 0)}Q${p(half * 0.55, half * 0.7)} ${p(half * 1.1, -half * 0.2)}`;
    case 'moved':
      return `M${p(-half, 0)}L${p(half, 0)}M${p(half * 0.2, -half * 0.6)}L${p(half, 0)}L${p(half * 0.2, half * 0.6)}`;
  }
}

/** A moved shape's older place, dashed, and a thin arrow from it to where the shape is now. */
function movePart(
  was: Rect,
  is: Rect,
  line: readonly [Point, Point] | undefined,
  theme: CanvasTheme,
): string {
  const color = theme.changeMoved;
  const place = empty('path', {
    d: line ? pathThrough(line) : rectPath(was, 0),
    fill: 'none',
    stroke: color,
    'stroke-width': OUTLINE * 0.75,
    'stroke-dasharray': DASHES,
  });
  const from = centerOf(was);
  const to = centerOf(is);
  const start = line ? from : borderPoint(was, from, to);
  const end = borderPoint(is, to, from);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < ARROWHEAD) return element('g', { 'data-mark': 'moved-from' }, place);
  const dx = (end.x - start.x) / length;
  const dy = (end.y - start.y) / length;
  const head = ARROWHEAD;
  const arrow =
    empty('path', {
      d: pathThrough([start, { x: end.x - dx * head * 0.5, y: end.y - dy * head * 0.5 }]),
      fill: 'none',
      stroke: color,
      'stroke-width': 1.25,
    }) +
    empty('path', {
      d: `M${num(end.x)} ${num(end.y)}L${num(end.x - dx * head - dy * head * 0.5)} ${num(end.y - dy * head + dx * head * 0.5)}L${num(end.x - dx * head + dy * head * 0.5)} ${num(end.y - dy * head - dx * head * 0.5)}Z`,
      fill: color,
    });
  return element('g', { 'data-mark': 'moved-from' }, place + arrow);
}

const COUNT_SIZE = 11;

/** How many changes a collapsed container hides, on a pill at its top left corner. */
function countPart(rect: Rect, count: number, theme: CanvasTheme): string {
  const text = String(count);
  const height = COUNT_SIZE + 4;
  const width = Math.max(height, textWidth(text, COUNT_SIZE, true) + 10);
  return element(
    'g',
    { 'data-mark': 'hidden-changes' },
    empty('rect', {
      x: rect.x,
      y: rect.y - height / 2,
      width,
      height,
      rx: height / 2,
      fill: theme.changeChanged,
      stroke: theme.background,
      'stroke-width': 1.5,
    }) +
      textElement(
        'text',
        {
          x: rect.x + width / 2,
          y: rect.y + COUNT_SIZE * 0.36,
          'font-size': COUNT_SIZE,
          'font-weight': 600,
          fill: theme.background,
          'text-anchor': 'middle',
        },
        text,
      ),
  );
}

// --- The legend ----------------------------------------------------------------------------------

const LEGEND_PADDING = 16;
const HEADING_SIZE = 13;
const ENTRY_SIZE = 12;
const ENTRY_HEIGHT = 22;
const ENTRY_GAP = 20;
const SWATCH = { width: 22, height: 12 };

/** The legend of a comparison's marks below its drawing, laid out for its texts. */
export function comparisonLegend(
  translate: Translator,
  shown: ComparisonScene,
  title: string | undefined,
  theme: CanvasTheme,
): { width: number; height: number; parts(at: Rect, width: number): string[]; texts: string[] } {
  const heading = title
    ? translate('{title}: {drawing}', { title, drawing: drawingName(translate, shown.drawing) })
    : drawingName(translate, shown.drawing);
  const entries = CHANGE_MARKS.map((mark) => ({
    mark,
    text: `${statusName(translate, mark)} ${shown.counts[mark]}`,
    drawn: MARKS_DRAWN[shown.drawing].includes(mark),
  }));
  const hiding = [...shown.hidden.values()].reduce((sum, count) => sum + count, 0);
  const note =
    hiding > 0
      ? translate(
          {
            one: 'A count on a collapsed container says how many changes it hides: {count} in all.',
            other:
              'A count on a collapsed container says how many changes it hides: {count} in all.',
          },
          { count: hiding },
        )
      : undefined;
  const entryWidth = (text: string) =>
    2 * BADGE_RADIUS + 6 + SWATCH.width + 6 + textWidth(text, ENTRY_SIZE);
  const rowWidth =
    entries.reduce((sum, entry) => sum + entryWidth(entry.text), 0) +
    ENTRY_GAP * (entries.length - 1);
  const width =
    2 * LEGEND_PADDING +
    Math.max(
      textWidth(heading, HEADING_SIZE, true),
      rowWidth,
      note === undefined ? 0 : textWidth(note, ENTRY_SIZE),
    );
  const height =
    2 * LEGEND_PADDING + HEADING_SIZE + 8 + ENTRY_HEIGHT + (note === undefined ? 0 : ENTRY_HEIGHT);
  const { colors } = THEMES[theme.name].shell;
  const texts = [heading, ...entries.map((entry) => entry.text), ...(note ? [note] : [])];
  const parts = (at: Rect, wide: number): string[] => {
    const rule = empty('rect', {
      'data-part': 'comparison-legend-rule',
      x: at.x,
      y: at.y,
      width: wide,
      height: 1,
      fill: colors.border,
    });
    const top = at.y + LEGEND_PADDING;
    const written = [
      rule,
      textElement(
        'text',
        {
          x: at.x + LEGEND_PADDING,
          y: top + HEADING_SIZE * 0.8,
          'font-size': HEADING_SIZE,
          'font-weight': 600,
          fill: colors.text,
        },
        heading,
      ),
    ];
    let x = at.x + LEGEND_PADDING;
    const middle = top + HEADING_SIZE + 8 + ENTRY_HEIGHT / 2;
    for (const entry of entries) {
      const color = markColor(theme, entry.mark);
      const swatchX = x + 2 * BADGE_RADIUS + 6;
      written.push(
        element(
          'g',
          { 'data-legend-mark': entry.mark },
          badgePart({ x: x + BADGE_RADIUS, y: middle }, entry.mark, color, theme) +
            swatchPart(
              { x: swatchX, y: middle - SWATCH.height / 2, ...SWATCH },
              entry.mark,
              color,
            ) +
            textElement(
              'text',
              {
                x: swatchX + SWATCH.width + 6,
                y: middle + ENTRY_SIZE * 0.36,
                'font-size': ENTRY_SIZE,
                fill: entry.drawn ? colors.text : colors.textMuted,
              },
              entry.text,
            ),
        ),
      );
      x += entryWidth(entry.text) + ENTRY_GAP;
    }
    if (note !== undefined) {
      written.push(
        textElement(
          'text',
          {
            x: at.x + LEGEND_PADDING,
            y: middle + ENTRY_HEIGHT + ENTRY_SIZE * 0.36,
            'font-size': ENTRY_SIZE,
            fill: colors.textMuted,
          },
          note,
        ),
      );
    }
    return written;
  };
  return { width, height, parts, texts };
}

/** A mark's line pattern, as the legend shows it: solid, dashed, or double. */
function swatchPart(rect: Rect, mark: ChangeMark, color: string): string {
  if (mark === 'changed') {
    return empty('path', {
      d: rectPath(rect, 0) + rectPath(rect, -3),
      fill: 'none',
      stroke: color,
      'stroke-width': 1.5,
    });
  }
  return empty('path', {
    d: rectPath(rect, 0),
    fill: 'none',
    stroke: color,
    'stroke-width': 2,
    'stroke-dasharray': mark === 'removed' ? '4 3' : undefined,
  });
}

/** How a comparison's PDF is made: as its SVG, and as any PDF. */
export type ComparisonPdfOptions = ComparisonSvgOptions & PdfOptions;

/**
 * Makes a PDF of one drawing of a view of a comparison, from its SVG as it is (ADR 0070). Rejects
 * with the signal's reason once `options.signal` stops it.
 */
export async function writeComparisonPdf(
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  viewId: Id,
  comparison: Comparison,
  options: ComparisonPdfOptions = {},
): Promise<PdfFile> {
  options.signal?.throwIfAborted();
  const drawing = svgOfComparison(older, newer, viewId, comparison, {
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.drawing === undefined ? {} : { drawing: options.drawing }),
    ...(options.faint === undefined ? {} : { faint: options.faint }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...PDF_PICTURES,
  });
  const view =
    newer.views.find((each) => each.id === viewId) ??
    older.views.find((each) => each.id === viewId);
  const name = view?.name ?? viewId;
  const drawn = drawingName(t, options.drawing ?? 'comparison');
  const title = options.title ? `${options.title}: ${name}, ${drawn}` : `${name}, ${drawn}`;
  return pdfOfSvg(drawing, { title }, options);
}
