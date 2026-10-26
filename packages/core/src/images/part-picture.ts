/**
 * A picture of one named part alone (ADR 0067), for a part drawn at full strength in a faint drawing
 * and for a part drawn on its own: its element, inside copies of its ancestors that keep only their
 * transforms and paint, with the definitions it refers to, in an `svg` whose view box is the part's
 * bounds. It is new SVG, written from the cleaned tree and cleaned again, so that a browser only ever
 * decodes what cleaning gives.
 */
import type { Box } from '../geometry/outline';
import { SVG_KINDS, cleanSvg, writeSvg, type CleanedSvg, type SvgNode } from './svg';
import { readTransform, type ViewBox } from './svg-values';

/** Where each element of a cleaned picture sits: its parent, its place in document order, and ids. */
export interface ElementIndex {
  readonly parents: ReadonlyMap<SvgNode, SvgNode>;
  readonly order: ReadonlyMap<SvgNode, number>;
  readonly byId: ReadonlyMap<string, SvgNode>;
}

/** Indexes a cleaned picture's elements. */
export function indexElements(root: SvgNode): ElementIndex {
  const parents = new Map<SvgNode, SvgNode>();
  const order = new Map<SvgNode, number>();
  const byId = new Map<string, SvgNode>();
  const stack: SvgNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as SvgNode;
    order.set(node, order.size);
    const id = node.attributes.get('id');
    if (id !== undefined && !byId.has(id)) byId.set(id, node);
    for (let at = node.children.length - 1; at >= 0; at -= 1) {
      const child = node.children[at] as SvgNode;
      parents.set(child, node);
      stack.push(child);
    }
  }
  return { parents, order, byId };
}

/** What an ancestor's copy keeps of a nested `svg`: where its viewport is, which is its transform. */
const VIEWPORT = new Set(['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio']);

const REFERENCE = /^url\(#([^)]+)\)$/;

/**
 * The picture of the part drawn by `part`, whose bounds are given in the coordinates of the outline
 * (the root's view box's top left at 0, 0). `undefined` when cleaning refuses it, as for a part whose
 * bounds no view box can hold.
 */
export function pictureOfPart(
  root: SvgNode,
  index: ElementIndex,
  part: SvgNode,
  bounds: Box,
  box: ViewBox,
): CleanedSvg | undefined {
  let content: SvgNode = part;
  for (
    let ancestor = index.parents.get(part);
    ancestor !== undefined && ancestor !== root;
    ancestor = index.parents.get(ancestor)
  ) {
    content = copyOfAncestor(ancestor, content);
  }
  content = withRootTransform(content, root.attributes.get('transform'));

  const rootPaint = new Map<string, string>();
  for (const [name, value] of root.attributes) {
    if (SVG_KINDS.paint.has(name)) rootPaint.set(name, value);
  }
  const definitions = definitionsFor(content, rootPaint, part, index);

  const x = bounds.x + box.x;
  const y = bounds.y + box.y;
  const slack = Math.max(box.width, box.height) * 1e-9;
  const inside =
    x >= box.x - slack &&
    y >= box.y - slack &&
    x + bounds.width <= box.x + box.width + slack &&
    y + bounds.height <= box.y + box.height + slack;
  // A part reaching past the picture's edge, or lengths measured on the picture's viewport, keep
  // that viewport: a nested `svg` as the original's, which also cuts the part where the picture does.
  const keepViewport =
    !inside ||
    measuresViewport(content) ||
    definitions.some(measuresViewport) ||
    [...rootPaint.values()].some((value) => value.includes('%'));
  const children: SvgNode[] = [
    ...(definitions.length > 0
      ? [{ name: 'defs', attributes: new Map<string, string>(), children: definitions }]
      : []),
    content,
  ];
  const viewport: SvgNode = {
    name: 'svg',
    attributes: new Map([
      ['x', number(box.x)],
      ['y', number(box.y)],
      ['width', number(box.width)],
      ['height', number(box.height)],
      ['viewBox', `${number(box.x)} ${number(box.y)} ${number(box.width)} ${number(box.height)}`],
    ]),
    children,
  };
  const outer = (wrapped: boolean): SvgNode => ({
    name: 'svg',
    attributes: new Map([
      ...rootPaint,
      ['viewBox', `${number(x)} ${number(y)} ${number(bounds.width)} ${number(bounds.height)}`],
      ['xmlns', 'http://www.w3.org/2000/svg'],
    ]),
    children: wrapped ? [viewport] : children,
  });
  // Without the viewport, if keeping it would nest the part past what cleaning allows.
  for (const wrapped of keepViewport ? [true, false] : [false]) {
    const cleaned = cleanSvg(writeSvg(outer(wrapped)));
    if (cleaned.ok) return cleaned.value;
  }
  return undefined;
}

/** A copy of an ancestor that keeps only its transform and paint, around what it holds of the part. */
function copyOfAncestor(ancestor: SvgNode, child: SvgNode): SvgNode {
  const attributes = new Map<string, string>();
  const nested = ancestor.name === 'svg';
  for (const [name, value] of ancestor.attributes) {
    if (name === 'transform' || SVG_KINDS.paint.has(name) || (nested && VIEWPORT.has(name))) {
      attributes.set(name, value);
    }
  }
  return { name: nested ? 'svg' : 'g', attributes, children: [child] };
}

/**
 * The content with the root's transform before its own, as the part's outline takes it: the root's
 * transform applied in its user space. A transform that is not valid is left out, as SVG leaves it.
 */
function withRootTransform(content: SvgNode, transform: string | undefined): SvgNode {
  if (transform === undefined || readTransform(transform) === undefined) return content;
  if (content.name === 'svg') {
    return { name: 'g', attributes: new Map([['transform', transform]]), children: [content] };
  }
  const own = content.attributes.get('transform');
  const combined =
    own !== undefined && readTransform(own) !== undefined ? `${transform} ${own}` : transform;
  return {
    name: content.name,
    attributes: new Map([...content.attributes, ['transform', combined]]),
    children: content.children,
  };
}

/**
 * The definitions the part refers to and what they refer to in turn, outside the part itself, each
 * once and in document order, none inside another that comes too.
 */
function definitionsFor(
  content: SvgNode,
  rootPaint: ReadonlyMap<string, string>,
  part: SvgNode,
  index: ElementIndex,
): SvgNode[] {
  const withinPart = (node: SvgNode) => {
    for (let at: SvgNode | undefined = node; at !== undefined; at = index.parents.get(at)) {
      if (at === part) return true;
    }
    return false;
  };
  const wanted = new Set<SvgNode>();
  const scanAttributes = (attributes: ReadonlyMap<string, string>) => {
    for (const id of referencesIn(attributes)) {
      const target = index.byId.get(id);
      if (target === undefined || wanted.has(target) || withinPart(target)) continue;
      wanted.add(target);
      scan(target);
    }
  };
  const scan = (node: SvgNode) => {
    const stack = [node];
    while (stack.length > 0) {
      const each = stack.pop() as SvgNode;
      scanAttributes(each.attributes);
      stack.push(...each.children);
    }
  };
  scan(content);
  scanAttributes(rootPaint);
  const holder = (node: SvgNode) => {
    for (let at = index.parents.get(node); at !== undefined; at = index.parents.get(at)) {
      if (wanted.has(at)) return true;
    }
    return false;
  };
  return [...wanted]
    .filter((node) => !holder(node))
    .sort((a, b) => (index.order.get(a) ?? 0) - (index.order.get(b) ?? 0));
}

/** The ids an element's attributes refer to: `href="#id"`, and `url(#id)` in its paint. */
function referencesIn(attributes: ReadonlyMap<string, string>): string[] {
  const ids: string[] = [];
  for (const [name, value] of attributes) {
    if (name === 'href') {
      if (value.startsWith('#')) ids.push(value.slice(1));
      continue;
    }
    if (name === 'fill' || name === 'stroke' || name === 'clip-path' || name === 'mask') {
      const id = REFERENCE.exec(value)?.[1];
      if (id !== undefined) ids.push(id);
    }
  }
  return ids;
}

/** Whether an element or what it holds measures lengths on its viewport, or makes one. */
function measuresViewport(node: SvgNode): boolean {
  const stack = [node];
  while (stack.length > 0) {
    const each = stack.pop() as SvgNode;
    if (each.name === 'svg' || each.name === 'symbol' || each.name === 'use') return true;
    for (const value of each.attributes.values()) if (value.includes('%')) return true;
    stack.push(...each.children);
  }
  return false;
}

/** A number as JavaScript writes it shortest. */
function number(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}
