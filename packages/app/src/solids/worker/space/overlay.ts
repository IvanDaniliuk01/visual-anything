/**
 * What a space's frames draw over the solids, facing the screen (ADR 0076), worked out as a list of
 * flat marks so that tests read it in Node, then painted on a 2D canvas over the GPU's picture:
 *
 * - **relation lines**, straight between their ends' points, with an arrowhead at the end they go to
 *   and the markers travelling along them, each with a casing that keeps 3:1 on any solid;
 * - **names**, never tilted: for what is hovered, selected or highlighted, then, while Names is on,
 *   for at most 64 of the others nearest the camera; one that would overlap a name already written is
 *   left out, unless it is hovered, selected or highlighted;
 * - **the scale** of the ground, one cell's length, in the bottom left;
 * - **the handles** that move and rotate posed elements, when an update asks for them.
 *
 * Sizes are in pixels of the page, times the frames' pixel ratio.
 */
import type { Color, Id, SpaceCamera, SpaceCut, SpacePoint } from '@visual-anything/schema';
import type { ThemeName } from '@visual-anything/core';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { casingFor } from '../../../canvas/solids/shader';
import { spaceProjection } from '../../../space/camera';
import { THEMES } from '../../../theme/themes';
import type { PixelSize, SpaceHandles, SpaceLine } from '../../protocol';
import { scaleOf } from './grid';
import { HANDLE_COLORS, handleShapes } from './handles';
import type { SpaceLayout } from './layout';
import { SPACE_MARK } from './layout';

/** The most names written for what is nearest while Names is on. */
export const MOST_NEAREST_NAMES = 64;

/** Sizes, in pixels of the page. */
export const OVERLAY_SIZES = {
  line: 1.5,
  hoveredLine: 2,
  selectedLine: 2.5,
  highlightedLine: 3,
  casing: 1,
  arrowLength: 9,
  arrowWidth: 7,
  marker: 4,
  name: 12,
  nameLift: 6,
  handle: 2,
  activeHandle: 4,
  margin: 12,
} as const;

/** A flat mark over the frame. */
export type OverlayMark =
  | {
      kind: 'path';
      points: { x: number; y: number }[];
      width: number;
      color: Color;
      casing: Color;
      /** How wide the casing shows on each side, in pixels of the frame. */
      casingWidth: number;
      alpha: number;
      /** A filled shape, such as an arrowhead, rather than a line. */
      filled?: boolean;
    }
  | {
      kind: 'disc';
      x: number;
      y: number;
      radius: number;
      color: Color;
      casing: Color;
      alpha: number;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      color: Color;
      halo: Color;
      align: 'center' | 'left';
      /** What it names: an element, or none for the scale. */
      names?: Id;
    };

/** Measures a text's width, in pixels, at a size. */
export type Measure = (text: string, size: number) => number;

/** What {@link overlayOf} draws from. */
export interface OverlayInput {
  layout: SpaceLayout;
  camera: SpaceCamera;
  size: PixelSize;
  pixelRatio: number;
  theme: ThemeName;
  names: boolean;
  lines: readonly SpaceLine[];
  cut: SpaceCut | undefined;
  handles: SpaceHandles | undefined;
  measure: Measure;
}

/** A point in a frame, in pixels from its top left, and its depth in front of the camera. */
interface Projected {
  x: number;
  y: number;
  depth: number;
}

/** The marks drawn over a frame, in the order they are painted. */
export function overlayOf(input: OverlayInput): OverlayMark[] {
  const { camera, size, pixelRatio } = input;
  const project = framed(camera, size);
  const near = camera.distance * 1e-3;
  const colors = themeColors(input.theme);
  const marks: OverlayMark[] = [];
  for (const line of input.lines) marks.push(...lineMarks(line, project, near, pixelRatio, colors));
  marks.push(...nameMarks(input, project, colors));
  marks.push(...scaleMarks(input, colors));
  if (input.handles) {
    marks.push(...handleMarks(input.handles, camera, size, pixelRatio, input.theme));
  }
  return marks;
}

/** The colors the overlay draws with in a theme. */
export function themeColors(theme: ThemeName) {
  const { shell, canvas } = THEMES[theme];
  return {
    line: shell.colors.textMuted,
    selected: canvas.selected,
    highlight: canvas.highlight,
    text: shell.colors.text,
    halo: canvas.background,
  };
}

type Colors = ReturnType<typeof themeColors>;

function framed(camera: SpaceCamera, size: PixelSize): (point: SpacePoint) => Projected {
  const project = spaceProjection(camera, size.width / size.height);
  return (point) => {
    const { x, y, depth } = project(point);
    return { x: x * size.width, y: y * size.height, depth };
  };
}

/** Whether a point is on the side of the cut that is kept, or there is no cut. */
export function keptByCut(point: SpacePoint, cut: SpaceCut | undefined): boolean {
  if (!cut) return true;
  const value = point[cut.axis];
  return cut.keep === 'below' ? value <= cut.at : value >= cut.at;
}

// Lines -------------------------------------------------------------------------------------------

/**
 * A line's ends in the frame, cut where it passes behind the camera's nearest; none when it lies
 * wholly behind: in the frame, and in space as `start` and `end`. `toKept` says whether the end it
 * goes to is its own.
 */
export function lineInFrame(
  line: Pick<SpaceLine, 'from' | 'to'>,
  project: (point: SpacePoint) => Projected,
  near: number,
):
  | { from: Projected; to: Projected; start: SpacePoint; end: SpacePoint; toKept: boolean }
  | undefined {
  let from = line.from;
  let to = line.to;
  const a = project(from);
  const b = project(to);
  if (a.depth < near && b.depth < near) return undefined;
  let toKept = true;
  if (a.depth < near || b.depth < near) {
    const t = (near - a.depth) / (b.depth - a.depth);
    const cut = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
    if (a.depth < near) from = cut;
    else {
      to = cut;
      toKept = false;
    }
  }
  return { from: project(from), to: project(to), start: from, end: to, toKept };
}

function lineMarks(
  line: SpaceLine,
  project: (point: SpacePoint) => Projected,
  near: number,
  ratio: number,
  colors: Colors,
): OverlayMark[] {
  const ends = lineInFrame(line, project, near);
  if (!ends) return [];
  const color = line.highlighted
    ? colors.highlight
    : line.selected || line.hovered
      ? colors.selected
      : colors.line;
  const width =
    ratio *
    (line.highlighted
      ? OVERLAY_SIZES.highlightedLine
      : line.selected
        ? OVERLAY_SIZES.selectedLine
        : line.hovered
          ? OVERLAY_SIZES.hoveredLine
          : OVERLAY_SIZES.line);
  const alpha = line.faint && !line.highlighted && !line.selected ? DIMMED_ALPHA : 1;
  const casing = casingFor(color);
  const marks: OverlayMark[] = [
    {
      kind: 'path',
      points: [ends.from, ends.to].map(({ x, y }) => ({ x, y })),
      width,
      color,
      casing,
      casingWidth: OVERLAY_SIZES.casing * ratio,
      alpha,
    },
  ];
  if (ends.toKept) {
    const head = arrowhead(ends.from, ends.to, ratio);
    if (head)
      marks.push({
        kind: 'path',
        points: head,
        width: 0,
        color,
        casing,
        casingWidth: ratio,
        alpha,
        filled: true,
      });
  }
  for (const share of line.markers ?? []) {
    const point = project({
      x: line.from.x + (line.to.x - line.from.x) * share,
      y: line.from.y + (line.to.y - line.from.y) * share,
      z: line.from.z + (line.to.z - line.from.z) * share,
    });
    if (point.depth < near) continue;
    marks.push({
      kind: 'disc',
      x: point.x,
      y: point.y,
      radius: OVERLAY_SIZES.marker * ratio,
      color: colors.highlight,
      casing: colors.halo,
      alpha: 1,
    });
  }
  return marks;
}

/** An arrowhead at `to`, facing the screen, pointing the way the line goes; none for a line of no length. */
export function arrowhead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ratio: number,
): { x: number; y: number }[] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return undefined;
  const ux = dx / length;
  const uy = dy / length;
  const back = Math.min(OVERLAY_SIZES.arrowLength * ratio, length);
  const half = (OVERLAY_SIZES.arrowWidth * ratio) / 2;
  const base = { x: to.x - ux * back, y: to.y - uy * back };
  return [
    { x: to.x, y: to.y },
    { x: base.x - uy * half, y: base.y + ux * half },
    { x: base.x + uy * half, y: base.y - ux * half },
  ];
}

// Names -------------------------------------------------------------------------------------------

function nameMarks(
  input: OverlayInput,
  project: (point: SpacePoint) => Projected,
  colors: Colors,
): OverlayMark[] {
  const { layout, size, pixelRatio, cut, measure } = input;
  const near = input.camera.distance * 1e-3;
  const fontSize = OVERLAY_SIZES.name * pixelRatio;
  const lift = OVERLAY_SIZES.nameLift * pixelRatio;
  interface Candidate {
    element: Id;
    name: string;
    at: Projected;
    priority: boolean;
  }
  const priority: Candidate[] = [];
  const others: Candidate[] = [];
  for (const [element, drawn] of layout.drawn) {
    // A collapsed container is written once, by its own entry.
    if (drawn.look.answers !== element || drawn.entry.name === '') continue;
    if (!keptByCut(drawn.point, cut)) continue;
    const at = project(drawn.point);
    if (at.depth < near || at.x < 0 || at.y < 0 || at.x > size.width || at.y > size.height) {
      continue;
    }
    const marked =
      (drawn.marks & (SPACE_MARK.hovered | SPACE_MARK.selected | SPACE_MARK.highlighted)) !== 0;
    const candidate = { element, name: drawn.entry.name, at, priority: marked };
    if (marked) priority.push(candidate);
    else if (input.names && !drawn.look.faint) others.push(candidate);
  }
  others.sort((a, b) => a.at.depth - b.at.depth);
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const marks: OverlayMark[] = [];
  const write = (candidate: Candidate, always: boolean) => {
    const width = measure(candidate.name, fontSize);
    const box = {
      left: candidate.at.x - width / 2,
      right: candidate.at.x + width / 2,
      top: candidate.at.y - lift - fontSize,
      bottom: candidate.at.y - lift,
    };
    const overlaps = placed.some(
      (other) =>
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top,
    );
    if (overlaps && !always) return false;
    placed.push(box);
    marks.push({
      kind: 'text',
      x: candidate.at.x,
      y: candidate.at.y - lift,
      text: candidate.name,
      size: fontSize,
      color: colors.text,
      halo: colors.halo,
      align: 'center',
      names: candidate.element,
    });
    return true;
  };
  for (const candidate of priority) write(candidate, true);
  let written = 0;
  for (const candidate of others) {
    if (written >= MOST_NEAREST_NAMES) break;
    if (write(candidate, false)) written += 1;
  }
  return marks;
}

// The scale and the handles -----------------------------------------------------------------------

function scaleMarks(input: OverlayInput, colors: Colors): OverlayMark[] {
  const { camera, size, pixelRatio } = input;
  const scale = scaleOf(camera, size.height);
  const margin = OVERLAY_SIZES.margin * pixelRatio;
  const length = Math.max(4 * pixelRatio, Math.min(scale.pixels, size.width / 3));
  const y = size.height - margin;
  const tick = 4 * pixelRatio;
  const fontSize = OVERLAY_SIZES.name * pixelRatio;
  const casing = colors.halo;
  return [
    {
      kind: 'path',
      points: [
        { x: margin, y: y - tick },
        { x: margin, y },
        { x: margin + length, y },
        { x: margin + length, y: y - tick },
      ],
      width: pixelRatio * OVERLAY_SIZES.line,
      color: colors.text,
      casing,
      casingWidth: OVERLAY_SIZES.casing * pixelRatio,
      alpha: 1,
    },
    {
      kind: 'text',
      x: margin + length + 6 * pixelRatio,
      y,
      text: scale.label,
      size: fontSize,
      color: colors.text,
      halo: colors.halo,
      align: 'left',
    },
  ];
}

function handleMarks(
  handles: SpaceHandles,
  camera: SpaceCamera,
  size: PixelSize,
  ratio: number,
  theme: ThemeName,
): OverlayMark[] {
  const marks: OverlayMark[] = [];
  for (const shape of handleShapes(handles, camera, size, ratio)) {
    const color = HANDLE_COLORS[theme][shape.axis];
    const casing = casingFor(color);
    const width =
      ratio * (handles.active === shape.axis ? OVERLAY_SIZES.activeHandle : OVERLAY_SIZES.handle);
    marks.push({
      kind: 'path',
      points: shape.points,
      width,
      color,
      casing,
      casingWidth: ratio,
      alpha: 1,
    });
    if (shape.kind === 'arrow') {
      const [from, to] = shape.points as [{ x: number; y: number }, { x: number; y: number }];
      const head = arrowhead(from, to, ratio * 1.5);
      if (head) {
        marks.push({
          kind: 'path',
          points: head,
          width: 0,
          color,
          casing,
          casingWidth: ratio,
          alpha: 1,
          filled: true,
        });
      }
    }
  }
  return marks;
}

// Painting ----------------------------------------------------------------------------------------

/** What {@link paintOverlay} uses of a 2D context. */
export type OverlayContext = Pick<
  OffscreenCanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'stroke'
  | 'fill'
  | 'arc'
  | 'fillText'
  | 'strokeText'
  | 'save'
  | 'restore'
> & {
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

/** The font names are written in. */
export function overlayFont(size: number): string {
  return `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/** Paints the marks on a 2D context, each casing first. */
export function paintOverlay(context: OverlayContext, marks: readonly OverlayMark[]): void {
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const mark of marks) {
    if (mark.kind === 'path') {
      context.globalAlpha = mark.alpha;
      trace(context, mark.points, mark.filled === true);
      context.strokeStyle = mark.casing;
      context.lineWidth = mark.width + 2 * mark.casingWidth;
      if (mark.filled) {
        context.stroke();
        context.fillStyle = mark.color;
        context.fill();
        continue;
      }
      context.stroke();
      context.strokeStyle = mark.color;
      context.lineWidth = mark.width;
      context.stroke();
    } else if (mark.kind === 'disc') {
      context.globalAlpha = mark.alpha;
      context.beginPath();
      context.arc(mark.x, mark.y, mark.radius, 0, 2 * Math.PI);
      context.fillStyle = mark.color;
      context.fill();
      context.strokeStyle = mark.casing;
      // A ring as wide as the casing, at the frames' pixel ratio, which the radius carries.
      context.lineWidth = (2 * OVERLAY_SIZES.casing * mark.radius) / OVERLAY_SIZES.marker;
      context.stroke();
    } else {
      context.globalAlpha = 1;
      context.font = overlayFont(mark.size);
      context.textAlign = mark.align;
      context.textBaseline = 'bottom';
      context.strokeStyle = mark.halo;
      context.lineWidth = Math.max(2, mark.size / 4);
      context.strokeText(mark.text, mark.x, mark.y);
      context.fillStyle = mark.color;
      context.fillText(mark.text, mark.x, mark.y);
    }
  }
  context.restore();
}

function trace(
  context: OverlayContext,
  points: readonly { x: number; y: number }[],
  closed: boolean,
) {
  context.beginPath();
  points.forEach((point, at) => {
    if (at === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  if (closed) context.closePath();
}
