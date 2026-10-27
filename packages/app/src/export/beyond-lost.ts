/**
 * What the text exports lose of what the canvas draws beyond boxes (M8b): shapes' free geometry
 * (ADR 0066), shapes drawn as named parts with their pictures (ADR 0067), and the curved and straight
 * styles of routes (ADR 0069). Mermaid and Structurizr draw each shape by its kind and each relation
 * in their own style, so each says, in its report, how many it drew so.
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
const ROUTE_STYLES: PluralText = {
  one: 'One relation drawn curved or straight is drawn in {tool}’s own style.',
  other: '{count} relations drawn curved or straight are drawn in {tool}’s own style.',
};

/**
 * What an export written by `tool` loses of these shapes and lines, those it writes: the shapes it
 * draws by their kind though they have free geometry or are drawn as named parts, and the relations
 * it draws in its own style though they are drawn curved or straight, automatically or by hand.
 */
export function lostBeyondBoxes(
  shapes: Iterable<ElementShape>,
  lines: Iterable<RelationLine>,
  tool: string,
): string[] {
  let parts = 0;
  let outlines = 0;
  for (const shape of shapes) {
    if (shape.part) parts += 1;
    else if (shape.outline) outlines += 1;
  }
  let styled = 0;
  for (const line of lines) if (line.style === 'curved' || line.style === 'straight') styled += 1;
  return [
    ...(outlines > 0 ? [t(FREE_GEOMETRY, { count: outlines })] : []),
    ...(parts > 0 ? [t(NAMED_PARTS, { count: parts })] : []),
    ...(styled > 0 ? [t(ROUTE_STYLES, { count: styled, tool })] : []),
  ];
}
