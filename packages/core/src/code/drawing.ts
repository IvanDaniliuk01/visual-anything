/**
 * What package code answers to draw inside a shape (ADR 0054): a declarative drawing in the terms the
 * appearance already uses, shapes, lines, text and images by id, in a box of its own that the app
 * fits inside the shape. The code never touches the canvas; the app draws this.
 */
import type { Color, Id, Point } from '@visual-anything/schema';

/** A drawing: its own box, which the app fits inside the shape keeping its proportions, and its items. */
export interface Drawing {
  /** The width of its box, in its own units. */
  width: number;
  /** The height of its box, in its own units. */
  height: number;
  /** What it draws, from back to front. */
  items: DrawingItem[];
}

/** One thing a drawing draws. */
export type DrawingItem = DrawnShape | DrawnLine | DrawnArc | DrawnText | DrawnImage;

/** A rectangle, a rounded rectangle or an ellipse, by the box it fills. */
export interface DrawnShape {
  kind: 'rectangle' | 'rounded-rectangle' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: Color;
  stroke?: Color;
  /** In the drawing's units; 1 when it has a stroke and sets none. */
  strokeWidth?: number;
}

/** A line through two points or more. */
export interface DrawnLine {
  kind: 'line';
  points: Point[];
  stroke?: Color;
  strokeWidth?: number;
}

/**
 * Part of a circle's outline, as a gauge draws its scale: from the angle `from` to the angle `to`,
 * in degrees, clockwise from three o'clock.
 */
export interface DrawnArc {
  kind: 'arc';
  /** Its center. */
  x: number;
  y: number;
  radius: number;
  from: number;
  to: number;
  stroke?: Color;
  strokeWidth?: number;
}

/** One line of text, whose baseline starts, centers or ends at its point. */
export interface DrawnText {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  /** Its size, in the drawing's units; 12 when it sets none. */
  size?: number;
  fill?: Color;
  align?: 'start' | 'middle' | 'end';
}

/** An image a package in use defines, by its id, in the box it fills. */
export interface DrawnImage {
  kind: 'image';
  image: Id;
  x: number;
  y: number;
  width: number;
  height: number;
}
