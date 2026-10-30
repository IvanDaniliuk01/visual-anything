/**
 * The selection's relations, with the rest faint (ADR 0080, section 5): in a view that draws more
 * than 40 lines, selecting a shape, a row or a relation draws the lines that do not touch it faintly,
 * as focus at one degree does, until the selection is cleared. The view's details can turn it off
 * (`selectionFadesLines: false`), and focus, when on, says what is faint instead.
 *
 * A line touches the selection when it is a selected relation or stands for one, when it ends on a
 * selected relation, or when one of its ends is a selected element's shape or a shape inside one: a
 * selected table keeps the lines of its rows, and a selected schema those of its tables. Pure, as the
 * emphasis is.
 */
import type { Id } from '@visual-anything/schema';
import type { Emphasis } from '../editor/emphasis';
import type { Selection } from '../editor/selection';
import { standsFor, type DrawnEnd, type Scene } from './scene';

/** Above this many lines drawn, selecting fades the lines that do not touch the selection. */
export const MANY_LINES = 40;

/**
 * What selecting fades: the lines the view draws that do not touch the selection, but those already
 * hidden. Undefined when nothing is selected, the view draws 40 lines or fewer, or every line touches.
 */
export function selectionLinesEmphasis(
  scene: Scene,
  selection: Selection,
  hidden?: ReadonlySet<string>,
): Emphasis | undefined {
  if (selection.elements.size === 0 && selection.relations.size === 0) return undefined;
  const shown = hidden
    ? scene.relations.filter((line) => !hidden.has(line.relation))
    : scene.relations;
  if (shown.length <= MANY_LINES) return undefined;
  const selectedKeys = new Set<string>();
  for (const shape of scene.shapes) {
    if (selection.elements.has(shape.element)) selectedKeys.add(shape.key);
  }
  // A shape's key names the shapes it sits in, from World down, joined by `/`.
  const insideSelected = (key: string): boolean => {
    if (selectedKeys.size === 0) return false;
    if (selectedKeys.has(key)) return true;
    for (let at = key.indexOf('/'); at >= 0; at = key.indexOf('/', at + 1)) {
      if (selectedKeys.has(key.slice(0, at))) return true;
    }
    return false;
  };
  const touchesEnd = (end: DrawnEnd | undefined): boolean =>
    end !== undefined &&
    (end.kind === 'shape' ? insideSelected(end.key) : selection.relations.has(end.relation));
  const selectedRelation = (ids: readonly Id[]): boolean =>
    ids.some((id) => selection.relations.has(id));
  const faint = new Set<string>();
  for (const line of shown) {
    if (selectedRelation(standsFor(line))) continue;
    if (touchesEnd(line.ends?.from) || touchesEnd(line.ends?.to)) continue;
    faint.add(line.relation);
  }
  return faint.size === 0 ? undefined : { dimmed: faint };
}
