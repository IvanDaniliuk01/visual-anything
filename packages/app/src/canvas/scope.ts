/**
 * What a view's scope does on the canvas (ADR-0040). The scene draws only what the scope shows: its
 * containment tree holds each shape in its nearest container that shows, or directly in World, as the
 * core's `shapesInView` says, so that layout, positions and the stacking order agree with it. Each
 * element that shows keeps the relations that leave the view from it, which its shapes count; and the
 * canvas, the outline, the inspector and search add elements to the view or leave them out of it
 * through one command each, so that each is one undoable action.
 */
import {
  containmentTree,
  endsOf,
  modelIndexOf,
  nestingTypesInView,
  relationTypesLeftOutBy,
  shapesInView,
  shownByScope,
  type AddToViewCommand,
  type LeaveOutOfViewCommand,
  type Placement,
  type ProjectSnapshot,
  type ShownByScope,
} from '@visual-anything/core';
import type { Element, Id, ModelFile, Relation, Scope, ViewFile } from '@visual-anything/schema';
import { t } from '../i18n';
import { nameOfEnd } from './announce';

/**
 * The containment tree of what a view with a scope shows: the elements it shows, each inside the
 * containers `shapesInView` says its shapes sit in, which the tree is built from as the canvas builds
 * the tree of a whole model.
 */
export function scopedTree(project: ProjectSnapshot, view: ViewFile): Placement[] {
  const shown = shownByScope(project, view);
  const placed = shapesInView(project, view);
  const index = modelIndexOf(project);
  const worldId = project.model.world.id;
  const elements: Element[] = [];
  const relations: Relation[] = [];
  for (const id of shown.elements) {
    if (id === worldId) continue;
    const element = index.element(id);
    if (!element) continue;
    elements.push(element);
    for (const container of placed.containersOf(id) ?? []) {
      relations.push({ id: `${id} ${container}`, relationType: SITS_IN, from: id, to: container });
    }
  }
  const model: ModelFile = { world: project.model.world, elements, relations };
  return containmentTree(model, (relationType) => relationType === SITS_IN);
}

/** The relation type of the stand-in relations `scopedTree` builds its tree from; no id has a space. */
const SITS_IN = 'sits in';

const NOTHING_LEAVES: ReadonlyMap<Id, readonly Id[]> = new Map();
const leavingMaps = new WeakMap<
  ShownByScope,
  { relations: readonly Relation[]; nesting: string; leaving: ReadonlyMap<Id, readonly Id[]> }
>();

/**
 * For each element a view shows, the relations that leave the view from it, in model order: those
 * of a relation type that does not arrange the view, with the element at one end, that the view does
 * not show because their other end is out of its scope. Nothing leaves a view without a scope, and a
 * relation of a type the view leaves out never leaves it (ADR 0064).
 */
export function leavingByElement(
  project: ProjectSnapshot,
  view: ViewFile,
): ReadonlyMap<Id, readonly Id[]> {
  if (view.scope === undefined) return NOTHING_LEAVES;
  const shown = shownByScope(project, view);
  const nesting = nestingTypesInView(project, view);
  const key = nesting.join(' ');
  const { relations } = project.model;
  const kept = leavingMaps.get(shown);
  if (kept && kept.relations === relations && kept.nesting === key) return kept.leaving;
  const arranging = new Set(nesting);
  const leftOut = relationTypesLeftOutBy(project, view);
  const index = modelIndexOf(project);
  const leaving = new Map<Id, Id[]>();
  const add = (element: Id, relation: Id) => {
    const list = leaving.get(element);
    if (list) {
      if (list.at(-1) !== relation) list.push(relation);
    } else leaving.set(element, [relation]);
  };
  for (const relation of relations) {
    if (arranging.has(relation.relationType) || leftOut.has(relation.relationType)) continue;
    if (shown.relationByScope(relation.id)) continue;
    for (const end of [relation.from, relation.to]) {
      if (index.element(end) && end !== project.model.world.id && shown.element(end)) {
        add(end, relation.id);
      }
    }
  }
  const result: ReadonlyMap<Id, readonly Id[]> = leaving.size === 0 ? NOTHING_LEAVES : leaving;
  leavingMaps.set(shown, { relations, nesting: key, leaving: result });
  return result;
}

/** The relations that leave a view from an element, in model order; none for one it does not show. */
export function relationsLeaving(
  project: ProjectSnapshot,
  view: ViewFile,
  element: Id,
): readonly Id[] {
  return leavingByElement(project, view).get(element) ?? [];
}

/**
 * The elements that adding to a view brings in so that these relations show: each one's ends that the
 * view does not show, through the relations they end on, each once, in the order they come.
 */
export function endsToAdd(
  project: ProjectSnapshot,
  view: ViewFile,
  relations: readonly Id[],
): Id[] {
  const shown = shownByScope(project, view);
  const worldId = project.model.world.id;
  const found = new Set<Id>();
  for (const relation of relations) {
    for (const end of endsOf(project, relation)) {
      if (end !== worldId && !shown.element(end)) found.add(end);
    }
  }
  return [...found];
}

/**
 * The elements of these that a view does not show and that adding brings in: for an element, itself;
 * for a relation, its ends that do not show. Empty when the view shows them all.
 */
export function toAdd(
  project: ProjectSnapshot,
  view: ViewFile,
  items: { elements?: readonly Id[]; relations?: readonly Id[] },
): Id[] {
  const shown = shownByScope(project, view);
  const index = modelIndexOf(project);
  const worldId = project.model.world.id;
  const found = new Set<Id>();
  for (const element of items.elements ?? []) {
    if (element !== worldId && index.element(element) && !shown.element(element))
      found.add(element);
  }
  for (const each of endsToAdd(project, view, items.relations ?? [])) found.add(each);
  return [...found];
}

/**
 * What a `create-element` sent from a view says of it: in a view with a scope, the view it is made
 * in, so that the new element shows there whatever the rules say (ADR-0040); nothing otherwise.
 */
export function madeIn(view: Pick<ViewFile, 'id' | 'scope'>): { inView?: Id } {
  return view.scope === undefined ? {} : { inView: view.id };
}

/** The command that adds these elements to a view, whatever its scope's rules say (ADR-0040). */
export function addToViewCommand(viewId: Id, elements: readonly Id[]): AddToViewCommand {
  return { type: 'add-to-view', view: viewId, elements: [...new Set(elements)] };
}

/** The command that leaves these elements out of a view, never out of the model (ADR-0040). */
export function leaveOutCommand(viewId: Id, elements: readonly Id[]): LeaveOutOfViewCommand {
  return { type: 'leave-out-of-view', view: viewId, elements: [...new Set(elements)] };
}

/** What a shape's mark of the relations that leave the view says, as its tooltip. */
export function leavingTitle(project: ProjectSnapshot, relations: readonly Id[]): string {
  const named = relations.slice(0, TITLE_NAMED).map((id) => nameOfEnd(project, id));
  const more = relations.length - named.length;
  const list =
    more > 0 ? `${named.join(', ')}, ${t('and {count} more', { count: more })}` : named.join(', ');
  return t(
    {
      one: '{count} relation leaves this view: {list}. The inspector lists it, with Add to this view.',
      other:
        '{count} relations leave this view: {list}. The inspector lists them, with Add to this view.',
    },
    { count: relations.length, list },
  );
}

/** How many relations a shape's tooltip names before it says how many more there are. */
const TITLE_NAMED = 5;

/**
 * The views with the same scope as the open one, itself among them, and the others, each in the
 * project's order: the perspective switcher lists the first first (ADR-0040).
 */
export function viewsByScope(
  views: readonly ViewFile[],
  openId: Id,
): { same: ViewFile[]; others: ViewFile[] } {
  const open = views.find((view) => view.id === openId);
  const wanted = scopeSignature(open?.scope);
  const same: ViewFile[] = [];
  const others: ViewFile[] = [];
  for (const view of views) {
    if (scopeSignature(view.scope) === wanted) same.push(view);
    else others.push(view);
  }
  return { same, others };
}

/** A scope's identity, as the perspective switcher compares views: the same rules, added and left out. */
export function scopeSignature(scope: Scope | undefined): string {
  if (scope === undefined) return '';
  const rules = (list: Scope['include']) =>
    (list ?? []).map((rule) => JSON.stringify(rule, Object.keys(rule).sort())).sort();
  return JSON.stringify([
    rules(scope.include),
    rules(scope.exclude),
    [...(scope.added ?? [])].sort(),
    [...(scope.leftOut ?? [])].sort(),
  ]);
}
