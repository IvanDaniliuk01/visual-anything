/**
 * What a comparison marks, as the canvas's layer and the SVG writer both draw it (ADR 0070): pure,
 * so that the exports draw the same marks with neither PixiJS nor the DOM.
 */
import type { Hidden } from '../emphasize';
import type { Point, Rect } from '../geometry';
import type { ArrowShape, ElementShape, NoteShape, RelationLine } from '../scene';
import type { CanvasTheme } from '../../theme/themes';
import type { ChangeMark, ComparisonScene, MovedPlace } from './scene';

/** The color of each mark in a theme. */
export function markColor(theme: CanvasTheme, mark: ChangeMark): string {
  switch (mark) {
    case 'added':
      return theme.changeAdded;
    case 'removed':
      return theme.changeRemoved;
    case 'changed':
      return theme.changeChanged;
    case 'moved':
      return theme.changeMoved;
  }
}

/** One thing the layer marks. */
export type MarkItem =
  | { kind: 'shape'; key: string; mark: ChangeMark; shape: ElementShape }
  | { kind: 'line'; key: string; mark: ChangeMark; line: RelationLine }
  | { kind: 'note'; key: string; mark: ChangeMark; note: NoteShape }
  | { kind: 'arrow'; key: string; mark: ChangeMark; arrow: ArrowShape }
  | { kind: 'move'; key: string; move: MovedPlace };

/** What the layer marks of a comparison's scene, in the order it draws them. */
export function markItems(shown: ComparisonScene): MarkItem[] {
  const items: MarkItem[] = [];
  const { scene } = shown;
  for (const shape of scene.shapes) {
    const mark = shown.shapes.get(shape.key);
    if (mark !== undefined) items.push({ kind: 'shape', key: shape.key, mark, shape });
  }
  for (const line of scene.relations) {
    const mark = shown.lines.get(line.relation);
    if (mark !== undefined) items.push({ kind: 'line', key: line.relation, mark, line });
  }
  for (const note of scene.notes) {
    const mark = shown.free.get(note.id);
    if (mark !== undefined) items.push({ kind: 'note', key: note.id, mark, note });
  }
  for (const arrow of scene.arrows) {
    const mark = shown.free.get(arrow.id);
    if (mark !== undefined) items.push({ kind: 'arrow', key: arrow.id, mark, arrow });
  }
  for (const move of shown.moves) items.push({ kind: 'move', key: move.key, move });
  return items;
}

/** Whether what an item marks is hidden, as a filter hides it. */
export function isHidden(item: MarkItem, hidden: Hidden): boolean {
  switch (item.kind) {
    case 'shape':
      return hidden.shapes.has(item.key);
    case 'line':
      return hidden.relations.has(item.key);
    case 'note':
    case 'arrow':
      return hidden.free.has(item.key);
    case 'move':
      return hidden.shapes.has(item.key) || hidden.free.has(item.key);
  }
}

/**
 * Where the line from `inside`, within a rectangle, towards `toward` leaves it: the rectangle's
 * middle when the two points coincide.
 */
export function borderPoint(rect: Rect, inside: Point, toward: Point): Point {
  const dx = toward.x - inside.x;
  const dy = toward.y - inside.y;
  if (dx === 0 && dy === 0) return inside;
  const tx =
    dx === 0 ? Infinity : (dx > 0 ? rect.x + rect.width - inside.x : rect.x - inside.x) / dx;
  const ty =
    dy === 0 ? Infinity : (dy > 0 ? rect.y + rect.height - inside.y : rect.y - inside.y) / dy;
  const t = Math.max(0, Math.min(tx, ty, 1));
  return { x: inside.x + dx * t, y: inside.y + dy * t };
}
