/**
 * The legend of a view's relation types (ADR 0086): where the drawing defaults draw lines in one
 * neutral color, or where more than one relation type shows, a part of the legend names each type the
 * view's lines are drawn as, with its color and its dash, so that a line's type can be told without
 * pointing at it. The canvas's panel, the PNG's band and the SVG and PDF draw it as they draw an
 * overlay's part, after the overlays' parts. Pure.
 */
import {
  relationTypeOrRelatesTo,
  type Definitions,
  type Legend,
  type LegendEntry,
  type LegendOverlay,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Dash } from '../geometry';
import { drawsNeutralLines } from '../lineAccents';
import type { Scene } from '../scene';

/** The id of the relation types' part of a legend, which no overlay's id is. */
export const RELATION_TYPES_LEGEND = ' relation types';

/** An entry of the relation types' part: an overlay's line entry, with the type's dash. */
export interface RelationTypeEntry extends LegendEntry {
  dash: Dash;
}

/** The dash a legend entry draws its line with: its type's, or solid for an overlay's entry. */
export function entryDash(entry: LegendEntry): Dash {
  return (entry as Partial<RelationTypeEntry>).dash ?? 'solid';
}

/**
 * The relation types' part of a view's legend, in the theme's colors, titled `title`; none when the
 * view draws no line, or draws lines of one type in their own color.
 */
export function relationTypesLegend(
  scene: Scene,
  project: ProjectSnapshot,
  definitions: Definitions,
  theme: ThemeName,
  title: string,
): LegendOverlay | undefined {
  if (scene.relations.length === 0) return undefined;
  const typeOf = relationTypeLookup(project);
  const types: Id[] = [];
  const seen = new Set<Id>();
  for (const line of scene.relations) {
    const type = line.aggregate?.relationType ?? typeOf(line.relation);
    if (type === undefined || seen.has(type)) continue;
    seen.add(type);
    types.push(type);
  }
  if (types.length === 0) return undefined;
  if (types.length < 2 && !drawsNeutralLines(scene)) return undefined;
  const entries: RelationTypeEntry[] = types.map((id) => {
    const type = relationTypeOrRelatesTo(definitions, id);
    return {
      kind: 'case',
      label: type.name,
      color: theme === 'dark' ? type.darkStroke : type.appearance.stroke,
      dash: type.appearance.dash,
    };
  });
  return {
    id: RELATION_TYPES_LEGEND,
    title,
    attribute: '',
    of: 'relations',
    channel: 'stroke',
    mapping: 'discrete',
    entries,
    warnings: [],
  };
}

/** A legend with the relation types' part after its overlays' parts, when there is one. */
export function withRelationTypes(legend: Legend, part: LegendOverlay | undefined): Legend {
  return part === undefined ? legend : { overlays: [...legend.overlays, part] };
}

const lookups = new WeakMap<ProjectSnapshot['model'], Map<Id, Id>>();

/** The relation type of each relation, by its id, once for each model. */
function relationTypeLookup(project: ProjectSnapshot): (relation: Id) => Id | undefined {
  let types = lookups.get(project.model);
  if (types === undefined) {
    types = new Map(
      project.model.relations.map((relation) => [relation.id, relation.relationType]),
    );
    lookups.set(project.model, types);
  }
  const found = types;
  return (relation) => found.get(relation);
}
