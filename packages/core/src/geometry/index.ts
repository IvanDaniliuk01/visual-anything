/** Free geometry: its outline, read once, and everything asked of it fitted to a shape (ADR 0066). */
export type { PathRead, Segment, Subpath } from './path';
export { arcSegments, readPathData, readPolygonPoints } from './path';
export type {
  Box,
  GeometryContour,
  GeometryInput,
  GeometryRead,
  Outline,
  OutlineContour,
} from './outline';
export {
  GEOMETRY_CAPS,
  GEOMETRY_FILE_CAPS,
  boundsOf,
  classContours,
  cubicAt,
  ellipseContour,
  evenOddHolds,
  geometryText,
  readGeometry,
  windingNumber,
} from './outline';
export type { GeometryFindings } from './files';
export { geometryFindings } from './files';
export type { BoxSide, FittedOutline, FlatContour } from './fit';
export {
  FLATTENING_TOLERANCE,
  distanceToEdges,
  douglasPeucker,
  fillsHold,
  fitOutline,
  flatten,
  flattenOutline,
  nearestOnEdges,
  outlineExit,
  outlineHolds,
  outlineInnerPoint,
  outlineLabelArea,
  outlinePathData,
  outlinePlace,
  simplifyOutline,
} from './fit';
