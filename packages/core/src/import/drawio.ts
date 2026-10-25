/**
 * The draw.io reader (ADR-0042, R37): a diagram in any of its files becomes a plan.
 *
 * - **Vertices** become elements, their style giving their kind: the shape it names, such as
 *   `shape=cylinder3`, its named style, such as `ellipse`, or `rectangle`.
 * - **A vertex holding others** becomes their container, through each one's single parent. A parent
 *   that is not on the page, or that leads back to the vertex, places it directly in World.
 * - **Edges** become relations, also between edges, and their waypoints bend points. An edge not
 *   connected at both ends, or to what the page does not hold, becomes none.
 * - **Pages** become views that show what each page holds, where it sits.
 * - **Labels** become plain text, and stencils and images are left out, as what matched nothing.
 *
 * Nothing in the file runs, loads or is followed: a link is kept as text when it is a web address.
 */
import type { Attributes, Id, JsonValue, Point } from '@visual-anything/schema';
import { MAX_BEND_POINTS } from '../routes';
import { drawioPages, type DrawioPage } from './drawio-files';
import { plainTextOfHtml } from './markup-text';
import type { ImportPlan, PlannedElement, PlannedRelation, PlannedView } from './plan';
import {
  KindCounter,
  MAX_IMPORTED_NAME,
  Unmatched,
  attributesFrom,
  cleanText,
  descriptionFrom,
  nameFrom,
  reading,
  refuse,
  suggestionFor,
  webAddress,
  type ImportRead,
  type ReadOptions,
} from './reading';
import { coordinate, placesInView, type Box } from './view-places';
import type { XmlElement } from './xml';

/** The most attributes an element keeps from a draw.io object. */
const MAX_ATTRIBUTES = 100;
/** The longest kind kept from a style. */
const MAX_KIND = 64;

/** Reads a draw.io diagram: the text of a `.drawio`, `.xml` or `.drawio.svg`, or a file's bytes. */
export function readDrawio(
  content: string | Uint8Array,
  source: string,
  options?: ReadOptions,
): ImportRead {
  return reading(() => {
    const { container, pages } = drawioPages(content);
    return planOf(pages, container, source, options);
  });
}

/** An edge whose ends are both on the page, by the ids of the cells it ends on. */
interface PlannedEdge {
  edge: Cell;
  from: string;
  to: string;
}

/** A style, as draw.io writes it: `name;key=value;…`. */
interface Style {
  /** The first named style, such as `ellipse` or `text`. */
  named: string | undefined;
  values: Map<string, string>;
}

function styleOf(text: string | undefined): Style {
  const values = new Map<string, string>();
  let named: string | undefined;
  for (const part of (text ?? '').split(';')) {
    const token = part.trim();
    if (token === '') continue;
    const equals = token.indexOf('=');
    if (equals === -1) named ??= token;
    else values.set(token.slice(0, equals).trim(), token.slice(equals + 1).trim());
  }
  return { named, values };
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  relative: boolean;
  points: Point[];
  offset: Point | undefined;
}

/** A cell of a page, as its `mxCell` and the `object` around it write it. */
interface Cell {
  id: string;
  parent: string | undefined;
  label: string;
  style: Style;
  vertex: boolean;
  edge: boolean;
  source: string | undefined;
  target: string | undefined;
  geometry: Geometry | undefined;
  tooltip: string | undefined;
  link: string | undefined;
  /** What an `object` or `UserObject` around the cell holds besides its label. */
  custom: [string, string][];
}

/** What an `object` holds that is not data of its own. */
const OBJECT_KEYS = new Set(['id', 'label', 'placeholders', 'tooltip', 'link', 'tags']);

function number(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pointOf(element: XmlElement): Point {
  return { x: number(element.attributes.get('x')), y: number(element.attributes.get('y')) };
}

function geometryOf(cell: XmlElement): Geometry | undefined {
  const geometry = cell.children.find(
    (child) =>
      child.name === 'mxGeometry' && (child.attributes.get('as') ?? 'geometry') === 'geometry',
  );
  if (!geometry) return undefined;
  const { attributes } = geometry;
  const points =
    geometry.children
      .find((child) => child.name === 'Array' && child.attributes.get('as') === 'points')
      ?.children.filter((child) => child.name === 'mxPoint')
      .map(pointOf) ?? [];
  const offset = geometry.children.find(
    (child) => child.name === 'mxPoint' && child.attributes.get('as') === 'offset',
  );
  return {
    x: number(attributes.get('x')),
    y: number(attributes.get('y')),
    width: number(attributes.get('width')),
    height: number(attributes.get('height')),
    relative: attributes.get('relative') === '1',
    points,
    offset: offset ? pointOf(offset) : undefined,
  };
}

/** The cells of a page, in the order it writes them. */
function cellsOf(
  page: DrawioPage,
  pageName: string,
  filling: Filling,
  unmatched: Unmatched,
): Cell[] {
  const root = page.model.children.find((child) => child.name === 'root');
  const cells: Cell[] = [];
  const ids = new Set<string>();
  for (const child of root?.children ?? []) {
    let wrapper: XmlElement | undefined;
    let cell: XmlElement | undefined;
    if (child.name === 'mxCell') cell = child;
    else if (child.name === 'object' || child.name === 'UserObject') {
      wrapper = child;
      cell = child.children.find((each) => each.name === 'mxCell');
    } else continue;
    const id = (wrapper ?? cell)?.attributes.get('id');
    if (id === undefined || id === '') refuse(`A cell on the page "${pageName}" has no id.`);
    if (ids.has(id)) refuse(`The page "${pageName}" holds the id "${id}" twice.`);
    ids.add(id);
    const attributes = cell?.attributes ?? new Map<string, string>();
    const style = styleOf(attributes.get('style'));
    const custom = wrapper
      ? [...wrapper.attributes].filter(([name]) => !OBJECT_KEYS.has(name))
      : [];
    const tags = wrapper?.attributes.get('tags');
    if (tags !== undefined && tags.trim() !== '') custom.push(['tags', tags]);
    let label = (wrapper ? wrapper.attributes.get('label') : attributes.get('value')) ?? '';
    if (wrapper?.attributes.get('placeholders') === '1') {
      label = filledIn(label, wrapper.attributes, filling, unmatched);
    }
    const html = style.values.get('html') === '1';
    cells.push({
      id,
      parent: attributes.get('parent'),
      label: html ? plainTextOfHtml(label) : cleanText(label),
      style,
      vertex: attributes.get('vertex') === '1',
      edge: attributes.get('edge') === '1',
      source: attributes.get('source'),
      target: attributes.get('target'),
      geometry: cell ? geometryOf(cell) : undefined,
      tooltip: wrapper?.attributes.get('tooltip'),
      link: wrapper?.attributes.get('link') ?? attributes.get('link'),
      custom,
    });
  }
  return cells;
}

/** The most placeholders one label fills in. */
export const MAX_PLACEHOLDERS = 64;
/** The longest a label grows to by filling in its placeholders. */
export const MAX_FILLED_LABEL = 4 * MAX_IMPORTED_NAME;
/** The most characters filling in placeholders adds across a file. */
export const MAX_FILLED_FILE = 1_000_000;

/** What filling in placeholders may still add across a file. */
class Filling {
  remaining = MAX_FILLED_FILE;
  reported = false;
}

const PLACEHOLDER = /%([A-Za-z_][\w.-]{0,63})%/g;

/**
 * A label with its placeholders filled in, as draw.io fills `%team%` from the object's own values:
 * once, never again in what a value brings, and within caps on how many a label fills, how long it
 * grows and what a whole file adds, past which the rest stay as written and are reported.
 */
function filledIn(
  label: string,
  values: ReadonlyMap<string, string>,
  filling: Filling,
  unmatched: Unmatched,
): string {
  let count = 0;
  let length = label.length;
  const limit = Math.max(label.length, MAX_FILLED_LABEL);
  let stopped: 'label' | 'file' | undefined;
  const filled = label.replace(PLACEHOLDER, (whole, name: string) => {
    if (stopped !== undefined || name === 'label' || name === 'id') return whole;
    const value = values.get(name);
    if (value === undefined) return whole;
    const growth = value.length - whole.length;
    if (growth > 0 && growth > filling.remaining) {
      stopped = 'file';
      return whole;
    }
    if (count >= MAX_PLACEHOLDERS || length + growth > limit) {
      stopped = 'label';
      return whole;
    }
    count += 1;
    length += growth;
    if (growth > 0) filling.remaining -= growth;
    return value;
  });
  if (stopped === 'label') {
    unmatched.add(
      label,
      `Its placeholders are filled in up to ${MAX_PLACEHOLDERS} of them and ${MAX_FILLED_LABEL.toLocaleString('en')} characters; the rest stay as written.`,
    );
  } else if (stopped === 'file' && !filling.reported) {
    filling.reported = true;
    unmatched.add(
      label,
      `Placeholders are filled in up to ${MAX_FILLED_FILE.toLocaleString('en')} characters across the file; the rest stay as written.`,
    );
  }
  return filled;
}

/** A vertex's kind, from its style, and whether it draws a stencil or an image left out. */
function vertexKind(style: Style): { kind: string; stencil: boolean; image: boolean } {
  const shape = style.values.get('shape');
  const image = style.values.has('image') || shape === 'image' || style.named === 'image';
  if (shape !== undefined && shape !== '') {
    if (shape.startsWith('stencil(')) return { kind: 'shape=stencil', stencil: true, image };
    return { kind: short(`shape=${shape}`), stencil: shape.startsWith('mxgraph.'), image };
  }
  if (style.named !== undefined) return { kind: short(style.named), stencil: false, image };
  if (style.values.get('rounded') === '1') return { kind: 'rounded=1', stencil: false, image };
  return { kind: 'rectangle', stencil: false, image };
}

/** An edge's kind, from how its style dashes it and ends it. */
function edgeKind(style: Style): string {
  const parts: string[] = [];
  if (style.values.get('dashed') === '1') parts.push('dashed=1');
  const end = style.values.get('endArrow');
  if (end === 'none') parts.push('endArrow=none');
  const start = style.values.get('startArrow');
  if (start !== undefined && start !== '' && start !== 'none') parts.push(`startArrow=${start}`);
  return parts.length === 0 ? 'edge' : short(parts.join(';'));
}

function short(kind: string): string {
  return kind.length <= MAX_KIND ? kind : `${kind.slice(0, MAX_KIND - 1)}…`;
}

/** The components the built-in packages offer for a vertex's kind, best first. */
function vertexSuggestions(kind: string): Id[] {
  if (/cylinder|datastore|database|storage/i.test(kind)) return ['systems.database'];
  if (/actor|person|user/i.test(kind)) return ['systems.person'];
  if (/swimlane|cloud/i.test(kind)) return ['systems.system'];
  return ['systems.box'];
}

/** The relation types the built-in packages offer for an edge's kind, best first. */
function edgeSuggestions(kind: string): Id[] {
  return kind.includes('endArrow=none') && !kind.includes('startArrow=')
    ? ['relates-to']
    : ['systems.communicates-with', 'relates-to'];
}

function planOf(
  pages: readonly DrawioPage[],
  container: string,
  source: string,
  options: ReadOptions | undefined,
): ImportPlan {
  const unmatched = new Unmatched();
  const filling = new Filling();
  const elementKinds = new KindCounter((kind) => suggestionFor(vertexSuggestions(kind), options));
  const relationKinds = new KindCounter((kind) => suggestionFor(edgeSuggestions(kind), options));
  const elements: PlannedElement[] = [];
  const relations: PlannedRelation[] = [];
  const containment: { element: string; container: string }[] = [];
  const views: PlannedView[] = [];
  const stencils = new Map<string, number>();
  let images = 0;

  pages.forEach((page, index) => {
    const pageName = nameFrom(
      page.name,
      pages.length === 1 ? pageNameOf(source) : `Page-${index + 1}`,
      unmatched,
    );
    const cells = cellsOf(page, pageName, filling, unmatched);
    const byId = new Map(cells.map((cell) => [cell.id, cell]));
    const keyOf = (id: string) => `${index + 1}:${id}`;
    const isElement = (cell: Cell) => cell.vertex && !byId.get(cell.parent ?? '')?.edge;

    // Elements, and the vertex each sits in.
    const parentOf = new Map<string, string>();
    for (const cell of cells) {
      if (!isElement(cell)) continue;
      const { kind, stencil, image } = vertexKind(cell.style);
      const kindKey = elementKinds.add(kind);
      if (stencil) stencils.set(kind, (stencils.get(kind) ?? 0) + 1);
      if (image) images += 1;
      const attributes = attributesOf(cell, unmatched);
      const description = descriptionFrom(cell.tooltip);
      elements.push({
        key: keyOf(cell.id),
        sourceId: cell.id,
        name: nameFrom(cell.label, kind.replace(/^shape=/, ''), unmatched),
        kind: kindKey,
        ...(description === undefined ? {} : { description }),
        ...(attributes === undefined ? {} : { attributes }),
      });
      const parent = cell.parent === undefined ? undefined : byId.get(cell.parent);
      if (parent && isElement(parent)) parentOf.set(cell.id, parent.id);
      else if (cell.parent !== undefined && !parent) {
        unmatched.add(
          cell.label || cell.id,
          `Its container "${cell.parent}" is not on the page, so it sits directly in World.`,
        );
      }
    }
    for (const id of cycleMembers(parentOf)) {
      parentOf.delete(id);
      unmatched.add(
        byId.get(id)?.label || id,
        'It sits inside itself through its containers, so it sits directly in World.',
      );
    }
    const containerOf = new Map<string, string>();
    for (const [id, parent] of parentOf) {
      containment.push({ element: keyOf(id), container: keyOf(parent) });
      containerOf.set(keyOf(id), keyOf(parent));
    }

    // Where each vertex sits on the page, and where each edge's waypoints are.
    const origins = new Map<string, Box>();
    const boxOf = (id: string): Box => {
      const chain: string[] = [];
      for (
        let at: string | undefined = id;
        at !== undefined && !origins.has(at);
        at = parentOf.get(at)
      ) {
        chain.push(at);
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        const cellId = chain[i] as string;
        const geometry = byId.get(cellId)?.geometry;
        const parentId = parentOf.get(cellId);
        const outer = parentId === undefined ? undefined : origins.get(parentId);
        origins.set(cellId, absoluteBox(geometry, outer));
      }
      return origins.get(id) as Box;
    };
    const boxes = new Map<string, Box>();
    for (const cell of cells) {
      if (isElement(cell) && cell.geometry) boxes.set(keyOf(cell.id), boxOf(cell.id));
    }

    // Edges, those that end on edges after the edges they end on.
    const edges = cells.filter((cell) => cell.edge);
    const labels = new Map<string, string[]>();
    for (const cell of cells) {
      const parent = byId.get(cell.parent ?? '');
      if (cell.vertex && parent?.edge && cell.label !== '') {
        const list = labels.get(parent.id);
        if (list) list.push(cell.label);
        else labels.set(parent.id, [cell.label]);
      }
    }
    const endOf = (edge: Cell, end: string | undefined): string | { why: string } => {
      if (end === undefined || end === '') {
        return { why: 'An edge that is not connected at both ends becomes no relation.' };
      }
      const cell = byId.get(end);
      if (!cell) return { why: `It ends on "${end}", which the page does not hold.` };
      if (cell.edge) return cell.id;
      if (cell.vertex) {
        const parent = byId.get(cell.parent ?? '');
        return parent?.edge ? parent.id : cell.id;
      }
      return { why: 'It ends on a layer, which is no element.' };
    };
    const planned = new Map<string, PlannedEdge>();
    for (const edge of edges) {
      const from = endOf(edge, edge.source);
      const to = endOf(edge, edge.target);
      const problem = typeof from === 'object' ? from : typeof to === 'object' ? to : undefined;
      if (problem) {
        unmatched.add(edgeText(edge, labels), problem.why);
        continue;
      }
      planned.set(edge.id, { edge, from: from as string, to: to as string });
    }
    const pageRelations: PlannedEdge[] = [];
    const edgeIds = new Set(edges.map((edge) => edge.id));
    for (const { edge, from, to, why } of orderedEdges(planned, edgeIds)) {
      if (why) {
        unmatched.add(edgeText(edge, labels), why);
        continue;
      }
      pageRelations.push({ edge, from, to });
    }
    const bendPoints: { relation: string; points: Point[] }[] = [];
    for (const { edge, from, to } of pageRelations) {
      const kind = relationKinds.add(edgeKind(edge.style));
      const name = [edge.label, ...(labels.get(edge.id) ?? [])]
        .filter((part) => part !== '')
        .join(' ');
      const attributes = attributesOf(edge, unmatched);
      relations.push({
        key: keyOf(edge.id),
        sourceId: edge.id,
        from: keyOf(from),
        to: keyOf(to),
        kind,
        ...(name === '' ? {} : { name: nameFrom(name, kind, unmatched) }),
        ...(attributes === undefined ? {} : { attributes }),
      });
      const points = edge.geometry?.points ?? [];
      if (points.length === 0) continue;
      if (points.length > MAX_BEND_POINTS) {
        unmatched.add(
          edgeText(edge, labels),
          `Its ${points.length} waypoints are left out: a route bends at most ${MAX_BEND_POINTS} times.`,
        );
        continue;
      }
      const parent = byId.get(edge.parent ?? '');
      const origin = parent && isElement(parent) ? boxOf(parent.id) : { x: 0, y: 0 };
      bendPoints.push({
        relation: keyOf(edge.id),
        points: points.map((point) => ({
          x: coordinate(origin.x + point.x),
          y: coordinate(origin.y + point.y),
        })),
      });
    }

    const shown = cells.filter(isElement).map((cell) => keyOf(cell.id));
    const positions = placesInView(shown, containerOf, boxes, false);
    views.push({
      key: `page:${index + 1}`,
      name: pageName,
      shows: shown,
      ...(positions.length === 0 ? {} : { positions }),
      ...(bendPoints.length === 0 ? {} : { bendPoints }),
    });
  });

  for (const [kind, count] of stencils) {
    unmatched.add(
      kind,
      count === 1
        ? 'A shape draws this draw.io stencil, which is left out; the component chosen for it draws it.'
        : `${count.toLocaleString('en')} shapes draw this draw.io stencil, which is left out; the component chosen for them draws them.`,
    );
  }
  if (images > 0) {
    unmatched.add(
      'image',
      images === 1
        ? 'A shape shows an image, which is left out: images in imports are left out, and the component chosen for it draws it.'
        : `${images.toLocaleString('en')} shapes show an image, which is left out: images in imports are left out, and the component chosen for them draws them.`,
    );
  }

  return {
    format: container,
    source,
    elements,
    relations,
    containment,
    views,
    kinds: { elements: elementKinds.list(), relations: relationKinds.list() },
    unmatched: unmatched.list(),
  };
}

/** A page's name for a file of one page: the file's name without its extensions. */
function pageNameOf(source: string): string {
  const base = source.replace(/^.*[\\/]/, '');
  const stem = base.replace(/(\.drawio)?\.(drawio|xml|svg|png)$/i, '');
  return stem === '' ? 'Page-1' : stem;
}

/** How an edge is quoted in what matched nothing: its label, or its id. */
function edgeText(edge: Cell, labels: ReadonlyMap<string, readonly string[]>): string {
  const label = [edge.label, ...(labels.get(edge.id) ?? [])]
    .filter((part) => part !== '')
    .join(' ');
  return label === '' ? edge.id : label;
}

/** A vertex's box on the page: relative to its parent's, as draw.io keeps it, or a fraction of it. */
function absoluteBox(geometry: Geometry | undefined, outer: Box | undefined): Box {
  const origin = outer ?? { x: 0, y: 0 };
  if (!geometry) return { x: origin.x, y: origin.y };
  let { x, y } = geometry;
  if (geometry.relative && outer) {
    x = (outer.width ?? 0) * x;
    y = (outer.height ?? 0) * y;
  }
  x += origin.x + (geometry.offset?.x ?? 0);
  y += origin.y + (geometry.offset?.y ?? 0);
  return { x, y, width: geometry.width, height: geometry.height };
}

/** The ids whose chain of parents leads back to themselves. */
function cycleMembers(parentOf: ReadonlyMap<string, string>): string[] {
  const state = new Map<string, 'visiting' | 'done'>();
  const members: string[] = [];
  for (const start of parentOf.keys()) {
    if (state.has(start)) continue;
    const path: string[] = [];
    let at: string | undefined = start;
    while (at !== undefined && !state.has(at)) {
      state.set(at, 'visiting');
      path.push(at);
      at = parentOf.get(at);
    }
    if (at !== undefined && state.get(at) === 'visiting') {
      // The path from where it came back to the end is the cycle.
      members.push(...path.slice(path.indexOf(at)));
    }
    for (const id of path) state.set(id, 'done');
  }
  return members;
}

/**
 * The edges in an order in which each comes after the edges it ends on. Edges that end on each other
 * in a loop become no relation, nor does an edge that ends on an edge that becomes none. The loops
 * are the strongly connected components of the edges that end on edges, found by Tarjan's algorithm
 * without recursion, which gives them in an order where what each ends on comes first, in time
 * linear in the edges.
 */
function orderedEdges(
  planned: ReadonlyMap<string, PlannedEdge>,
  edgeIds: ReadonlySet<string>,
): (PlannedEdge & { why?: string })[] {
  const loop = 'Its relations end on each other in a loop, so none of them becomes a relation.';
  const none = 'It ends on an edge that becomes no relation, so it becomes none either.';
  const edgeEnds = (id: string) => {
    const edge = planned.get(id) as PlannedEdge;
    return [edge.from, edge.to].filter((end) => edgeIds.has(end));
  };
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const open: string[] = [];
  const onOpen = new Set<string>();
  const components: string[][] = [];
  let counter = 0;
  const visit = (id: string) => {
    index.set(id, counter);
    low.set(id, counter);
    counter += 1;
    open.push(id);
    onOpen.add(id);
  };
  for (const start of planned.keys()) {
    if (index.has(start)) continue;
    visit(start);
    const work = [{ id: start, ends: edgeEnds(start), next: 0 }];
    while (work.length > 0) {
      const frame = work.at(-1) as { id: string; ends: string[]; next: number };
      if (frame.next < frame.ends.length) {
        const end = frame.ends[frame.next++] as string;
        if (!planned.has(end)) continue;
        if (!index.has(end)) {
          visit(end);
          work.push({ id: end, ends: edgeEnds(end), next: 0 });
        } else if (onOpen.has(end)) {
          low.set(frame.id, Math.min(low.get(frame.id) as number, index.get(end) as number));
        }
        continue;
      }
      work.pop();
      const parent = work.at(-1);
      if (parent) {
        low.set(parent.id, Math.min(low.get(parent.id) as number, low.get(frame.id) as number));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const component: string[] = [];
        let member: string;
        do {
          member = open.pop() as string;
          onOpen.delete(member);
          component.push(member);
        } while (member !== frame.id);
        components.push(component);
      }
    }
  }

  const dropped = new Set<string>();
  const ordered: (PlannedEdge & { why?: string })[] = [];
  for (const component of components) {
    const [only] = component;
    const looped = component.length > 1 || edgeEnds(only as string).includes(only as string);
    for (const id of component) {
      const edge = planned.get(id) as PlannedEdge;
      const blocked = edgeEnds(id).some((end) => !planned.has(end) || dropped.has(end));
      const why = looped ? loop : blocked ? none : undefined;
      if (why !== undefined) dropped.add(id);
      ordered.push(why === undefined ? edge : { ...edge, why });
    }
  }
  return ordered;
}

/** What an element or relation keeps of an `object`'s values and its link, as attributes. */
function attributesOf(cell: Cell, unmatched: Unmatched): Attributes | undefined {
  const attributes = new Map<string, JsonValue>();
  for (const [name, value] of cell.custom) {
    if (attributes.size >= MAX_ATTRIBUTES) break;
    if (name === 'tags') {
      const tags = cleanText(value)
        .split(' ')
        .filter((tag) => tag !== '');
      if (tags.length > 0) attributes.set('tags', tags);
      continue;
    }
    const text = descriptionFrom(value);
    if (text !== undefined) attributes.set(name, text);
  }
  if (cell.link !== undefined && cell.link.trim() !== '') {
    const address = webAddress(cell.link);
    if (address !== undefined) attributes.set('link', address);
    else unmatched.add(cell.link, 'A link that is not a web address is left out.');
  }
  return attributesFrom(attributes);
}
