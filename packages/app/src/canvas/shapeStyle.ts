/**
 * A shape's own style (ADR 0088): its border's width and dash, its corner radius, its opacity, its
 * shadow and its gradient, as its resolved appearance sets them, and what the canvas and the exports
 * draw from them. A trait no appearance sets is absent, so that whatever draws reads the drawing
 * defaults for it (ADR 0086), and a shape whose appearances set none draws as it did before ADR 0088.
 */
import {
  adaptedForDark,
  type ResolvedAppearance,
  type ResolvedDrawing,
  type StoredColorsInDark,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { roundedCornerRadius } from './drawing';
import type { ShapeKind } from './geometry';

/** A fill that runs from a shape's fill to `to`, down or to the right. */
export interface ShapeGradient {
  to: Color;
  direction: 'down' | 'right';
  /**
   * The color it runs to on the dark canvas, when it differs from `to`: adapted, where the drawing
   * defaults ask for stored colors adapted there (ADR 0087).
   */
  darkTo?: Color;
}

/** What a shape's appearances set of its style, each trait absent where the drawing defaults draw it. */
export interface ShapeStyle {
  /** Its border's width; 0 draws no border. */
  borderWidth?: number;
  /** Its border, dashed or dotted; absent, solid. */
  dash?: 'dashed' | 'dotted';
  /** Its corner radius, on rectangles of either kind. */
  cornerRadius?: number;
  /** How opaque its body and picture are, below 1; its text stays whole. */
  opacity?: number;
  /** Its own shadow, over the drawing defaults'. */
  shadow?: 'none' | 'soft';
  gradient?: ShapeGradient;
}

/** What a resolved appearance sets of a shape's style, or nothing when it sets none. */
export function shapeStyleOf(
  appearance: ResolvedAppearance,
  storedInDark: StoredColorsInDark,
): ShapeStyle | undefined {
  const style: ShapeStyle = {};
  if (appearance.borderWidth !== undefined) style.borderWidth = appearance.borderWidth;
  if (appearance.dash !== 'solid') style.dash = appearance.dash;
  if (appearance.cornerRadius !== undefined) style.cornerRadius = appearance.cornerRadius;
  if (appearance.opacity < 1) style.opacity = appearance.opacity;
  if (appearance.shadow !== undefined) style.shadow = appearance.shadow;
  const { gradient } = appearance;
  if (gradient !== undefined) {
    style.gradient = { to: gradient.to, direction: gradient.direction };
    if (storedInDark === 'adapted') {
      const darkTo = adaptedForDark(gradient.to);
      if (darkTo !== gradient.to) style.gradient.darkTo = darkTo;
    }
  }
  return Object.keys(style).length === 0 ? undefined : style;
}

/** Whether two styles draw alike, trait by trait. */
export function sameShapeStyle(a: ShapeStyle | undefined, b: ShapeStyle | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.borderWidth === b.borderWidth &&
    a.dash === b.dash &&
    a.cornerRadius === b.cornerRadius &&
    a.opacity === b.opacity &&
    a.shadow === b.shadow &&
    a.gradient?.to === b.gradient?.to &&
    a.gradient?.direction === b.gradient?.direction &&
    a.gradient?.darkTo === b.gradient?.darkTo
  );
}

/** What draws a shape: its kind and its own style, if any. */
export interface Styled {
  kind: ShapeKind;
  style?: ShapeStyle;
}

/** How wide a shape's border is drawn: its own, or the drawing defaults'. */
export function borderWidthOf(shape: Pick<Styled, 'style'>, drawing: ResolvedDrawing): number {
  return shape.style?.borderWidth ?? drawing.shapes.borderWidth;
}

/** How opaque a shape's body and picture are drawn. */
export function opacityOf(shape: Pick<Styled, 'style'>): number {
  return shape.style?.opacity ?? 1;
}

/**
 * Whether a shape lays a soft shadow: its own choice, or the drawing defaults' for a shape that holds
 * nothing. Its own is drawn in a view of any size, as it draws once in its tile; the drawing
 * defaults' are left out of a large view (`withinShadows`).
 */
export function castsShadow(
  shape: Pick<Styled, 'style'>,
  drawing: ResolvedDrawing,
  container: boolean,
): boolean {
  const own = shape.style?.shadow;
  if (own !== undefined) return own === 'soft';
  return drawing.shapes.shadow === 'soft' && !container;
}

/**
 * The kind a shape's body is drawn as: a rectangle with its own corner radius above 0 is drawn as a
 * rounded rectangle, one with 0 as a square one.
 */
export function drawnKindOf(shape: Styled): ShapeKind {
  const radius = shape.style?.cornerRadius;
  if (radius === undefined) return shape.kind;
  if (shape.kind === 'rectangle' && radius > 0) return 'rounded-rectangle';
  if (shape.kind === 'rounded-rectangle' && radius === 0) return 'rectangle';
  return shape.kind;
}

/**
 * The corner radius of a rounded rectangle of this size: its own, up to half its shorter side, or
 * the drawing defaults' (`roundedCornerRadius`).
 */
export function cornerRadiusOf(
  shape: Pick<Styled, 'style'>,
  drawing: ResolvedDrawing,
  width: number,
  height: number,
): number {
  const own = shape.style?.cornerRadius;
  if (own === undefined) return roundedCornerRadius(drawing, width, height);
  return Math.max(0, Math.min(own, width / 2, height / 2));
}

/** The second color of a shape's gradient, in a theme; none when it has no gradient. */
export function gradientTo(
  shape: Pick<Styled, 'style'>,
  theme: 'light' | 'dark',
): Color | undefined {
  const gradient = shape.style?.gradient;
  if (gradient === undefined) return undefined;
  return theme === 'dark' ? (gradient.darkTo ?? gradient.to) : gradient.to;
}
