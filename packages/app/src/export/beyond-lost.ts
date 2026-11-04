/**
 * What the text exports lose of what the canvas draws beyond boxes (M8b): shapes' free geometry
 * (ADR 0066), shapes drawn as named parts with their pictures (ADR 0067), the curved and straight
 * styles of routes (ADR 0069), faces (ADR 0083) and solids (ADR 0075). Mermaid and Structurizr draw each shape by its
 * kind and each relation in their own style, so each says, in its report, how many it drew so.
 */
import type { ElementShape, RelationLine } from '../canvas/scene';
import { t, type PluralText } from '../i18n';

const FREE_GEOMETRY: PluralText = {
  one: 'One shape drawn by its free geometry is drawn as its kind.',
  other: '{count} shapes drawn by their free geometry are drawn as their kinds.',
};
const NAMED_PARTS: PluralText = {
  one: 'One shape drawn as a named part is drawn as its kind, without its picture.',
  other: '{count} shapes drawn as named parts are drawn as their kinds, without their pictures.',
};
const FACES: PluralText = {
  one: 'One shape’s face is left out: faces are drawn only in the canvas, the SVG, the PDF and the read-only page.',
  other:
    '{count} shapes’ faces are left out: faces are drawn only in the canvas, the SVG, the PDF and the read-only page.',
};
const SOLIDS: PluralText = {
  one: 'One shape’s solid is left out: solids are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
  other:
    '{count} shapes’ solids are left out: solids are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
};
const FREE_PICTURES: PluralText = {
  one: 'One picture is left out: pictures are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
  other:
    '{count} pictures are left out: pictures are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
};

/** What a text export says of the pictures it leaves out (ADR 0098). */
export function lostPictures(count: number): string[] {
  return count > 0 ? [t(FREE_PICTURES, { count })] : [];
}

const ROUTE_STYLES: PluralText = {
  one: 'One relation drawn curved or straight is drawn in {tool}’s own style.',
  other: '{count} relations drawn curved or straight are drawn in {tool}’s own style.',
};

/**
 * What an export written by `tool` loses of these shapes and lines, those it writes: the shapes it
 * draws by their kind though they have free geometry or are drawn as named parts, those whose faces
 * it leaves out, and the relations it draws in its own style though they are drawn curved or
 * straight, automatically or by hand.
 */
export function lostBeyondBoxes(
  shapes: Iterable<ElementShape>,
  lines: Iterable<RelationLine>,
  tool: string,
): string[] {
  let parts = 0;
  let outlines = 0;
  let faces = 0;
  let solids = 0;
  for (const shape of shapes) {
    // A solid shown by a shape, or one of whose parts it is drawn as (ADR 0075).
    if (shape.solid !== undefined || shape.part?.solid !== undefined) solids += 1;
    if (shape.part) parts += 1;
    else if (shape.outline) outlines += 1;
    if (shape.face) faces += 1;
  }
  let styled = 0;
  for (const line of lines) if (line.style === 'curved' || line.style === 'straight') styled += 1;
  return [
    ...(outlines > 0 ? [t(FREE_GEOMETRY, { count: outlines })] : []),
    ...(parts > 0 ? [t(NAMED_PARTS, { count: parts })] : []),
    ...(faces > 0 ? [t(FACES, { count: faces })] : []),
    ...(solids > 0 ? [t(SOLIDS, { count: solids })] : []),
    ...(styled > 0 ? [t(ROUTE_STYLES, { count: styled, tool })] : []),
  ];
}
