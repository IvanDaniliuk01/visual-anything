import type { Appearance } from '@visual-anything/schema';

/** The kind of an appearance's shapes. */
export type Shape = NonNullable<Appearance['shape']>;

/** The shapes an element can be drawn as, in the order the inspector offers them. */
export const SHAPES: readonly { shape: Shape; name: string }[] = [
  { shape: 'rectangle', name: 'Rectangle' },
  { shape: 'rounded-rectangle', name: 'Rounded rectangle' },
  { shape: 'ellipse', name: 'Ellipse' },
  { shape: 'cylinder', name: 'Cylinder' },
  { shape: 'person', name: 'Person' },
];

/** Whether a shape can draw its contents as rows: any other kind is drawn as a rectangle then. */
export function holdsRows(shape: Shape): boolean {
  return shape === 'rectangle' || shape === 'rounded-rectangle';
}

export function isShape(value: string): value is Shape {
  return SHAPES.some((each) => each.shape === value);
}

/** A shape's name, as the inspector offers it. */
export function shapeName(shape: Shape): string {
  return SHAPES.find((each) => each.shape === shape)?.name ?? shape;
}
