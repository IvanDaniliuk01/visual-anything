/**
 * Containers drawn as quiet regions (ADR 0086, `docs/designs/drawing-defaults.md` section 3): where the
 * drawing defaults say `containers.drawn: region`, an open container is its stroke's color, faint, as
 * its fill, a border 1 wide at 40 % of that color, and at its top left a name tab: its kind's icon,
 * then its name at the drawing's container name size, at 500, in the theme's muted text. A database,
 * a cylinder kind, is so drawn as a region with the database icon, never stretched as a cylinder.
 * High contrast draws its border whole, at the shapes' border width, and its tab in the theme's own
 * text (A5.6).
 *
 * The icons are Lucide's (https://lucide.dev, ISC license, see LICENSE-lucide.txt), as the app's own
 * set draws them (`shell/icons.tsx`), as parts the canvas strokes and the SVG writes alike. Pure but
 * for the PixiJS drawing calls.
 */
import type { Graphics } from 'pixi.js';
import { mixColors, type ResolvedDrawing } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { THEMES, type CanvasTheme } from '../theme/themes';
import { BASE_DRAWING, roundedCornerRadius, textSideInset, TOGGLE_LOOK } from './drawing';
import { TOGGLE_SIZE, toggleRect, type Rect, type ShapeKind } from './geometry';
import { containerHeaderOf, type ElementShape } from './scene';
import { headerShift } from './shape-images';

/** What a theme and a drawing draw a region with, besides the container's own stroke. */
export interface RegionColors {
  /** The canvas, which the region's faint fill and border lie over. */
  canvas: Color;
  fillAlpha: number;
  borderAlpha: number;
  /** How wide its border is, in canvas units. */
  borderWidth: number;
  /** Its name tab's text and detail. */
  text: Color;
}

/** How wide a region's border is, in canvas units, but in High contrast. */
export const REGION_BORDER = 1;

/**
 * The colors of a theme's regions, as a drawing draws them. High contrast, "darker text, and no faint
 * colors" (ADR 0086, A5.6), draws a region's border whole, at the shapes' border width, and writes its
 * tab in the theme's own text rather than the muted one; it keeps the faint fill, on which that text
 * reads at 7:1 or more whatever the region's color (`theme/presets.contrast.test.ts`). The other
 * presets draw the quiet region of A5.2.
 */
export function regionColorsOf(
  theme: Pick<
    CanvasTheme,
    'background' | 'regionFillAlpha' | 'regionBorderAlpha' | 'regionText' | 'text'
  >,
  drawing: ResolvedDrawing = BASE_DRAWING,
): RegionColors {
  if (drawing.preset === 'high-contrast') {
    return {
      canvas: theme.background,
      fillAlpha: theme.regionFillAlpha,
      borderAlpha: 1,
      borderWidth: drawing.shapes.borderWidth,
      text: theme.text,
    };
  }
  if (
    theme.background === LIGHT_REGION.canvas &&
    theme.regionFillAlpha === LIGHT_REGION.fillAlpha &&
    theme.regionBorderAlpha === LIGHT_REGION.borderAlpha &&
    theme.regionText === LIGHT_REGION.text
  ) {
    return LIGHT_REGION;
  }
  return {
    canvas: theme.background,
    fillAlpha: theme.regionFillAlpha,
    borderAlpha: theme.regionBorderAlpha,
    borderWidth: REGION_BORDER,
    text: theme.regionText,
  };
}

/** The light theme's, which drawing takes when it is given no theme. */
export const LIGHT_REGION: RegionColors = {
  canvas: THEMES.light.canvas.background,
  fillAlpha: THEMES.light.canvas.regionFillAlpha,
  borderAlpha: THEMES.light.canvas.regionBorderAlpha,
  borderWidth: REGION_BORDER,
  text: THEMES.light.canvas.regionText,
};

/** The color a region's fill comes to over the canvas: what its contents and its tab read on. */
export function regionFillOf(stroke: Color, colors: RegionColors): Color {
  return mixColors(colors.canvas, stroke, colors.fillAlpha);
}

/** The color a region's border comes to over the canvas, as plain blocks draw it far out. */
export function regionBorderOf(stroke: Color, colors: RegionColors): Color {
  return mixColors(colors.canvas, stroke, colors.borderAlpha);
}

/** How far apart a region's icon and its name are. */
const ICON_GAP = 6;
/** How wide the strokes of a region's icon are, in the icon's box of 24. */
const ICON_STROKE = 2;

/** The corner radius of a region: the drawing's, at most a quarter of either side. */
export function regionRadius(rect: Rect, drawing: ResolvedDrawing): number {
  return roundedCornerRadius(drawing, rect.width, rect.height);
}

/** Where a region's name tab writes, from its top left: its icon, then its name. */
export interface RegionTab {
  /** The icon's box, a square as tall as the name's letters; absent when the shape shows a picture there. */
  icon?: Rect;
  /** Where its name starts, its top, and how wide and tall it may be. */
  name: Rect;
  /**
   * Where its detail goes, under its name, when it says more than its component's name, such as the
   * values of the attributes its appearance shows, and the region has room for it.
   */
  detail?: { rect: Rect; text: string };
}

/** What a region writes under its name: its detail, when it says more than its component's name. */
function regionDetailOf(shape: ElementShape): string | undefined {
  const { detail } = shape;
  return detail === undefined || detail === '' || detail === shape.componentName
    ? undefined
    : detail;
}

/** Where a region's tab goes. */
export function regionTabOf(
  shape: ElementShape,
  drawing: ResolvedDrawing = BASE_DRAWING,
): RegionTab {
  const { x, y, width } = shape.rect;
  const { containerNameSize, lineHeight, padding } = drawing.text;
  const inset = textSideInset(drawing);
  const line = containerNameSize * lineHeight;
  const toggle = toggleRect(shape);
  const beside = toggle ? TOGGLE_SIZE + 4 : 0;
  // A picture its appearance shows in the header takes the icon's place (ADR 0082).
  const shift = headerShift(shape);
  const side = containerNameSize;
  const icon =
    shift > 0
      ? undefined
      : { x: x + inset, y: y + padding + (line - side) / 2, width: side, height: side };
  const left = shift > 0 ? x + inset + shift : x + inset + side + ICON_GAP;
  const name = {
    x: left,
    y: y + padding,
    width: Math.max(1, x + width - inset - beside - left),
    height: line,
  };
  const text = regionDetailOf(shape);
  const below = { ...name, y: name.y + line, height: drawing.text.detailSize * lineHeight };
  const fits =
    below.y + below.height <= y + Math.min(shape.rect.height, containerHeaderOf(drawing));
  return {
    ...(icon ? { icon } : {}),
    name,
    ...(text !== undefined && fits ? { detail: { rect: below, text } } : {}),
  };
}

/** Draws a region: its faint fill and its thin border, then its icon and its toggle. */
export function drawRegion(
  graphics: Graphics,
  shape: ElementShape,
  colors: RegionColors,
  drawing: ResolvedDrawing,
): void {
  const { x, y, width, height } = shape.rect;
  const radius = regionRadius(shape.rect, drawing);
  graphics
    .roundRect(x, y, width, height, radius)
    .fill({ color: shape.stroke, alpha: colors.fillAlpha })
    .stroke({ color: shape.stroke, alpha: colors.borderAlpha, width: colors.borderWidth });
  const tab = regionTabOf(shape, drawing);
  // In its own color, which draws alike in both themes; its name is tinted to the theme.
  if (tab.icon) drawRegionIcon(graphics, shape.kind, tab.icon, shape.stroke);
  const toggle = toggleRect(shape);
  if (toggle) {
    const { x: left, y: top, width: side, height: tall } = toggle;
    graphics
      .roundRect(left, top, side, tall, TOGGLE_LOOK.radius)
      .stroke({ color: shape.stroke, alpha: colors.borderAlpha, width: REGION_BORDER });
    const middleX = left + side / 2;
    const middleY = top + tall / 2;
    const arm = side * TOGGLE_LOOK.arm;
    graphics
      .moveTo(middleX - arm, middleY)
      .lineTo(middleX + arm, middleY)
      .stroke({ color: shape.stroke, width: TOGGLE_LOOK.sign });
  }
}

/** One stroke of an icon, in its box of 24: an ellipse, a run of points, or a rounded rectangle. */
export type IconPart =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'line'; points: readonly number[] }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: number };

/** Points along half an ellipse below its center, from its left end to its right, flat. */
function lowerHalf(cx: number, cy: number, rx: number, ry: number, steps = 10): number[] {
  const points: number[] = [];
  for (let at = 0; at <= steps; at++) {
    const angle = Math.PI - (Math.PI * at) / steps;
    points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return points;
}

/** Points along a quarter of a circle, flat, from one angle to another. */
function quarter(cx: number, cy: number, r: number, from: number, to: number): number[] {
  const points: number[] = [];
  for (let at = 0; at <= 6; at++) {
    const angle = from + ((to - from) * at) / 6;
    points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return points;
}

/** Lucide's database. */
const DATABASE: readonly IconPart[] = [
  { kind: 'ellipse', cx: 12, cy: 5, rx: 9, ry: 3 },
  { kind: 'line', points: [3, 5, 3, 19, ...lowerHalf(12, 19, 9, 3).slice(2, -2), 21, 19, 21, 5] },
  { kind: 'line', points: lowerHalf(12, 12, 9, 3) },
];

/** Lucide's user. */
const PERSON: readonly IconPart[] = [
  { kind: 'ellipse', cx: 12, cy: 7, rx: 4, ry: 4 },
  {
    kind: 'line',
    points: [
      19,
      21,
      19,
      19,
      ...quarter(15, 19, 4, 0, -Math.PI / 2),
      ...quarter(9, 19, 4, -Math.PI / 2, -Math.PI),
      5,
      21,
    ],
  },
];

/** Lucide's circle. */
const ROUND: readonly IconPart[] = [{ kind: 'ellipse', cx: 12, cy: 12, rx: 9, ry: 9 }];

/** Lucide's panel top: a frame with a band at its top, what holds other shapes. */
const FRAME: readonly IconPart[] = [
  { kind: 'rect', x: 3, y: 3, width: 18, height: 18, radius: 2 },
  { kind: 'line', points: [3, 9, 21, 9] },
];

/** The icon a region of this kind shows: a database for a cylinder, a frame for a box. */
export function regionIconOf(kind: ShapeKind): readonly IconPart[] {
  switch (kind) {
    case 'cylinder':
      return DATABASE;
    case 'person':
      return PERSON;
    case 'ellipse':
      return ROUND;
    default:
      return FRAME;
  }
}

/** How wide an icon's strokes are in a box this large. */
export function iconStrokeIn(box: Rect): number {
  return (ICON_STROKE * box.width) / 24;
}

/** Strokes a kind's icon in its box. */
export function drawRegionIcon(graphics: Graphics, kind: ShapeKind, box: Rect, color: Color): void {
  const scale = box.width / 24;
  const at = (value: number, origin: number) => origin + value * scale;
  for (const part of regionIconOf(kind)) {
    switch (part.kind) {
      case 'ellipse':
        graphics.ellipse(at(part.cx, box.x), at(part.cy, box.y), part.rx * scale, part.ry * scale);
        break;
      case 'rect':
        graphics.roundRect(
          at(part.x, box.x),
          at(part.y, box.y),
          part.width * scale,
          part.height * scale,
          part.radius * scale,
        );
        break;
      case 'line':
        graphics.poly(
          part.points.map((value, index) => at(value, index % 2 === 0 ? box.x : box.y)),
          false,
        );
        break;
    }
  }
  graphics.stroke({ color, width: iconStrokeIn(box), cap: 'round', join: 'round' });
}
