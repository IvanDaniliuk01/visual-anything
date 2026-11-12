/**
 * A view as a Mermaid flowchart (M6b, R33), which GitHub and most Markdown readers draw: each element
 * the view shows as a node of its shape, each container a subgraph, through each element's first
 * container, and each relation drawn as an edge labelled with its name or its relation type, in the
 * colors of the theme chosen. Mermaid lays the chart out itself, so positions and routes are lost; the
 * file says what else it lost, in comments at its top, and the export lists it: among it, free
 * geometry and named parts, drawn as their shapes' kinds, and routes' curved and straight styles.
 *
 * Every label is written in quotes with Mermaid's entity codes for quotes, markup and `#`, so that a
 * name can never close a label, start a directive or reach the page as HTML.
 */
import {
  definitionsIn,
  legendOf,
  legendShows,
  modelIndexOf,
  relationTypeOrRelatesTo,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { readableTextColors } from '../canvas/colors';
import { buildScene, picturesOf, type ElementShape, type RelationLine } from '../canvas/scene';
import { lineStroke, shapeColors } from '../canvas/theme/paint';
import { t, type PluralText } from '../i18n';
import { lostBeyondBoxes, lostPictures } from './beyond-lost';
import { plainTexts } from './plain-texts';
import type { TextExport } from './outline';

const COPIES: PluralText = {
  one: 'One element sits in more than one container: it is drawn once, in its first one.',
  other: '{count} elements sit in more than one container: each is drawn once, in its first one.',
};
const ON_RELATIONS: PluralText = {
  one: 'One relation that ends on a relation is left out: Mermaid draws relations between shapes only.',
  other:
    '{count} relations that end on relations are left out: Mermaid draws relations between shapes only.',
};
const PEOPLE: PluralText = {
  one: 'One shape drawn as a person is drawn as a rounded rectangle.',
  other: '{count} shapes drawn as people are drawn as rounded rectangles.',
};
const FREE: PluralText = {
  one: 'One note or free arrow is left out.',
  other: '{count} notes and free arrows are left out.',
};
const PICTURES: PluralText = {
  one: 'One picture is left out.',
  other: '{count} pictures are left out.',
};

/** How a Mermaid flowchart is written. */
export interface MermaidOptions {
  /** The theme whose colors the nodes and edges take; light by default. */
  theme?: ThemeName;
}

/** The node shapes of Mermaid's flowcharts for each kind of shape: its opening and closing. */
const SHAPES: Record<ElementShape['kind'], [string, string]> = {
  rectangle: ['[', ']'],
  'rounded-rectangle': ['(', ')'],
  ellipse: ['((', '))'],
  cylinder: ['[(', ')]'],
  // Mermaid's flowcharts have no person: the closest is a rounded rectangle.
  person: ['(', ')'],
};

/**
 * A text as a Mermaid label in quotes: on one line, with entity codes for what would end it, start
 * markup or read as an entity, and for a backtick, which starts Mermaid's own Markdown.
 */
export function mermaidLabel(text: string): string {
  const escaped = text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/&/g, '#amp;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/`/g, '#96;')
    .trim();
  return `"${escaped}"`;
}

/** A text as the rest of a Mermaid line, a comment or an accessible title: on one line. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** Writes the view with this id as a Mermaid flowchart. Throws when the project has no such view. */
export function writeMermaid(
  project: ProjectSnapshot,
  viewId: Id,
  options: MermaidOptions = {},
): TextExport {
  const view = project.views.find((each) => each.id === viewId);
  if (!view) throw new RangeError(`The project has no view "${viewId}".`);
  const theme = options.theme ?? 'light';
  const scene = buildScene(project, viewId);
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);

  // Each element once, at its first shape, in containment order: a container before its contents.
  const first = new Map<Id, ElementShape>();
  const byKey = new Map<string, ElementShape>();
  let copies = 0;
  const copied = new Set<Id>();
  for (const shape of scene.shapes) {
    byKey.set(shape.key, shape);
    if (!first.has(shape.element)) first.set(shape.element, shape);
    else if (!copied.has(shape.element)) {
      copied.add(shape.element);
      copies += 1;
    }
  }
  const ids = new Map<Id, string>();
  const taken = new Set<string>();
  const idOf = (element: Id): string => {
    let id = ids.get(element);
    if (id === undefined) {
      const base = `e_${element.replace(/[^A-Za-z0-9_]/g, '_')}`;
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
      taken.add(id);
      ids.set(element, id);
    }
    return id;
  };

  // The shapes inside each first shape, as the subgraphs nest.
  const inside = new Map<string | undefined, ElementShape[]>();
  for (const shape of first.values()) {
    const parent = shape.containerShape;
    const holder = parent === undefined ? undefined : byKey.get(parent);
    const key = holder && first.get(holder.element) === holder ? holder.key : undefined;
    const list = inside.get(key);
    if (list) list.push(shape);
    else inside.set(key, [shape]);
  }

  const lines: string[] = [];
  // One class for each set of colors, in the order first used.
  const classes = new Map<string, { name: string; definition: string; members: string[] }>();
  let people = 0;
  let pictures = 0;
  const classOf = (shape: ElementShape) => {
    const colors = shapeColors(shape, theme);
    const text = readableTextColors(colors.fill).name;
    const key = `${colors.fill} ${colors.stroke} ${text}`;
    let found = classes.get(key);
    if (!found) {
      const name = `c${classes.size}`;
      found = {
        name,
        definition: `  classDef ${name} fill:${colors.fill},stroke:${colors.stroke},color:${text};`,
        members: [],
      };
      classes.set(key, found);
    }
    found.members.push(idOf(shape.element));
  };

  const writeShape = (shape: ElementShape, depth: number) => {
    const indent = '  '.repeat(depth + 1);
    const id = idOf(shape.element);
    if (shape.image) pictures += 1;
    const contents = inside.get(shape.key) ?? [];
    if (contents.length > 0) {
      lines.push(`${indent}subgraph ${id}[${mermaidLabel(shape.name)}]`);
      for (const each of contents) writeShape(each, depth + 1);
      lines.push(`${indent}end`);
    } else {
      if (shape.kind === 'person') people += 1;
      const [open, close] = SHAPES[shape.kind];
      lines.push(`${indent}${id}${open}${mermaidLabel(shape.name)}${close}`);
    }
    classOf(shape);
  };
  for (const shape of inside.get(undefined) ?? []) writeShape(shape, 0);

  // Edges, in the model's order, with their styles by their index.
  const edges: string[] = [];
  const drawnLines: RelationLine[] = [];
  const styles = new Map<string, number[]>();
  let onRelations = 0;
  const endOf = (line: RelationLine, end: 'from' | 'to'): ElementShape | undefined => {
    const drawn = line.ends?.[end];
    if (drawn) return drawn.kind === 'shape' ? byKey.get(drawn.key) : undefined;
    const relation = index.relation(line.relation);
    const id = relation?.[end];
    return id === undefined ? undefined : first.get(id);
  };
  for (const line of scene.relations) {
    const from = endOf(line, 'from');
    const to = endOf(line, 'to');
    if (!from || !to) {
      onRelations += 1;
      continue;
    }
    const type = line.aggregate
      ? line.aggregate.relationType
      : (index.relation(line.relation)?.relationType ?? '');
    const resolved = relationTypeOrRelatesTo(definitions, type);
    const typeName = t.definition(resolved.id, resolved.name);
    const label = line.aggregate
      ? `×${line.aggregate.relations.length} ${typeName}`
      : (index.relation(line.relation)?.name ?? typeName);
    const directed = line.arrowhead !== undefined;
    const arrow = line.aggregate
      ? directed
        ? '==>'
        : '==='
      : line.dash === 'solid'
        ? directed
          ? '-->'
          : '---'
        : directed
          ? '-.->'
          : '-.-';
    const stroke = lineStroke(line, theme);
    const style = `stroke:${stroke},stroke-width:${line.width}px`;
    const list = styles.get(style);
    if (list) list.push(edges.length);
    else styles.set(style, [edges.length]);
    edges.push(`  ${idOf(from.element)} ${arrow}|${mermaidLabel(label)}| ${idOf(to.element)}`);
    drawnLines.push(line);
  }

  const free = scene.notes.length + scene.arrows.length;
  // The view's description takes text emphasis (ADR 0082); Mermaid gets its plain text.
  const texts = plainTexts();
  const description = oneLine(texts.plain(view.description));
  const lost = [
    t('Mermaid lays the chart out itself: positions, sizes, routes and bend points are left out.'),
    t('Details under names, badges among them, are left out.'),
    ...(copies > 0 ? [t(COPIES, { count: copies })] : []),
    ...(onRelations > 0 ? [t(ON_RELATIONS, { count: onRelations })] : []),
    ...(people > 0 ? [t(PEOPLE, { count: people })] : []),
    ...(pictures > 0 ? [t(PICTURES, { count: pictures })] : []),
    // Free geometry, named parts and the styles of routes (M8b).
    ...lostBeyondBoxes(first.values(), drawnLines, 'Mermaid'),
    ...(free > 0 ? [t(FREE, { count: free })] : []),
    ...lostPictures(picturesOf(scene)),
    ...texts.lost(),
    // Mermaid draws no legend, though its colors are the overlays' (ADR 0055).
    ...(legendShows(legendOf(view, definitions, theme))
      ? [
          t(
            'The legend of the view’s overlays, whose colors it draws: the outline in Markdown, the SVG and the PDF carry it.',
          ),
        ]
      : []),
  ];

  const bounds = scene.bounds;
  const direction = bounds && bounds.width > bounds.height ? 'LR' : 'TB';
  const text = [
    `%% ${oneLine(t('The view “{view}” of the project “{project}”, from Visual Anything.', { view: view.name, project: project.project.name }))}`,
    ...lost.map((each) => `%% ${oneLine(t('Lost: {what}', { what: each }))}`),
    `flowchart ${direction}`,
    `  accTitle: ${oneLine(view.name)}`,
    ...(description === '' ? [] : [`  accDescr: ${description}`]),
    ...lines,
    ...edges,
    ...[...classes.values()].map((each) => each.definition),
    ...[...classes.values()].map((each) => `  class ${each.members.join(',')} ${each.name};`),
    ...[...styles].map(([style, at]) => `  linkStyle ${at.join(',')} ${style};`),
  ].join('\n');
  return { text: `${text}\n`, lost };
}
