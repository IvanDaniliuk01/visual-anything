/**
 * Relations drawn in physical space (ADR 0076): the relations along which markers travel on the
 * canvas, which are the scenario step being played (ADR 0031) and a tour's pulse, drawn in the panel
 * as straight lines between their ends' points (`pointInSpace`), with their markers where the canvas
 * has them. An end inside a collapsed container is that container's point. A relation that ends on a
 * relation ends at the middle of that relation's line when it is drawn, and is not drawn otherwise;
 * nor is one whose end is not in the space, nor one whose two ends are the same point.
 *
 * Under reduced motion the canvas's markers stand still at the end they travel to, and so do these.
 */
import {
  modelIndexOf,
  pointInSpace,
  type ProjectSnapshot,
  type Space,
} from '@visual-anything/core';
import type { Id, SpacePoint } from '@visual-anything/schema';
import type { Marker } from '../editor/emphasis';
import { MAX_SPACE_LINE_MARKERS, MAX_SPACE_LINES, type SpaceLine } from '../solids/protocol';

/** Where a relation's end shows in space: its element's point, or its collapsed container's. */
function endPoint(space: Space, element: Id): SpacePoint | undefined {
  const entry = space.entries.get(element) ?? space.faint.get(element);
  if (!entry) return undefined;
  return pointInSpace(space, entry.drawnAs ?? element);
}

/** The lines the panel draws for the relations markers travel along, with those markers. */
export function spaceLinesOf(
  project: ProjectSnapshot,
  space: Space,
  markers: readonly Marker[],
): SpaceLine[] {
  if (markers.length === 0) return [];
  const index = modelIndexOf(project);
  const along = new Map<Id, number[]>();
  for (const marker of markers) {
    const list = along.get(marker.relation);
    const progress = Math.min(1, Math.max(0, marker.progress));
    if (!list) along.set(marker.relation, [progress]);
    else if (list.length < MAX_SPACE_LINE_MARKERS) list.push(progress);
  }
  // Each relation's ends, worked out once; a relation on a relation waits for that one's line.
  const ends = new Map<Id, { from: SpacePoint; to: SpacePoint } | undefined>();
  const endsOf = (
    relation: Id,
    seen: ReadonlySet<Id>,
  ): { from: SpacePoint; to: SpacePoint } | undefined => {
    if (ends.has(relation)) return ends.get(relation);
    const found = index.relation(relation);
    if (!found || seen.has(relation)) return undefined;
    const next = new Set([...seen, relation]);
    const point = (end: Id): SpacePoint | undefined => {
      if (index.relation(end) === undefined) return endPoint(space, end);
      // Only a relation drawn here has a line whose middle can be ended on.
      if (!along.has(end)) return undefined;
      const line = endsOf(end, next);
      return line && middle(line.from, line.to);
    };
    const from = point(found.from);
    const to = point(found.to);
    const made = from && to && !samePoint(from, to) ? { from, to } : undefined;
    ends.set(relation, made);
    return made;
  };
  const lines: SpaceLine[] = [];
  for (const [relation, progress] of along) {
    if (lines.length >= MAX_SPACE_LINES) break;
    const line = endsOf(relation, new Set());
    if (!line) continue;
    lines.push({ relation, from: line.from, to: line.to, highlighted: true, markers: progress });
  }
  return lines;
}

/**
 * The elements in the space that a scenario step plays between, for the panel to bring into view:
 * the ends of its relations, through relations that end on relations, each as the collapsed
 * container it is drawn as; or, for a step aggregated into a collapsed container, that container.
 */
export function stepElementsInSpace(
  project: ProjectSnapshot,
  space: Space,
  step: { relations: readonly Id[] } | { container: Id },
): Id[] {
  const index = modelIndexOf(project);
  const found = new Set<Id>();
  const add = (element: Id) => {
    const entry = space.entries.get(element);
    if (entry) found.add(entry.drawnAs ?? element);
  };
  if ('container' in step) {
    add(step.container);
    return [...found];
  }
  const seen = new Set<Id>();
  const visit = (relation: Id) => {
    if (seen.has(relation)) return;
    seen.add(relation);
    const found = index.relation(relation);
    if (!found) return;
    for (const end of [found.from, found.to]) {
      if (index.relation(end) !== undefined) visit(end);
      else add(end);
    }
  };
  for (const relation of step.relations) visit(relation);
  return [...found];
}

function middle(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function samePoint(a: SpacePoint, b: SpacePoint): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
