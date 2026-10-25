/**
 * Which relations put a view's shapes inside containers. A view lists the nesting relation types that
 * arrange it; the ones a package in use defines and that nest are the ones that do, in its order. The
 * canvas, the commands and the checks all ask here, so that they agree on where every shape sits.
 */
import type { Id, Relation, ViewFile } from '@visual-anything/schema';
import { componentOrEssence } from './definitions';
import { shapesInView } from './scope-placement';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';

/**
 * The nesting relation types a view is arranged by: those it lists that a package in use defines and
 * that nest, in its order. The others, which checkProject reports as warnings, arrange nothing.
 */
export function nestingTypesInView(state: ProjectSnapshot, view: ViewFile): Id[] {
  const nesting = definitionsIn(state).nestingRelationTypes;
  return [...new Set(view.nestingRelationTypes)].filter((id) => nesting.has(id));
}

/**
 * The relations of the view's nesting relation types that place an element inside `from`; none for
 * World, where an element sits when nothing else holds it. In a view with a scope, they include its
 * relations to containers left out through which it sits in `from` (ADR-0040).
 */
export function leavingRelations(
  state: ProjectSnapshot,
  view: ViewFile,
  element: Id,
  from: Id | undefined,
): Relation[] {
  if (from === undefined || from === state.model.world.id) return [];
  if (view.scope !== undefined) {
    const placing = shapesInView(state, view).placing(element, from);
    if (placing.length > 0) return [...placing];
  }
  const types = new Set(nestingTypesInView(state, view));
  return modelIndexOf(state)
    .relationsOn(element)
    .filter(
      (relation) =>
        relation.from === element && relation.to === from && types.has(relation.relationType),
    );
}

/** The nesting relation type that puts a new element inside a container, and whether the view must start nesting by it. */
export interface NestingChoice {
  relationType: Id;
  /** Whether the view does not nest by it yet, so the same action adds it to the view's types. */
  addToView: boolean;
}

/**
 * The nesting relation type that puts an element of `component` inside `container` in a view: among
 * the nesting relation types in use whose limits accept the two ends, the one whose limits name the
 * ends most closely. They rank by how many of the two ends their limits name, most first; then by how
 * far, along each named end's lineage, the nearest id its limit lists is, summed, nearest first; then
 * those the view already nests by; then in the view's order, then in package order. So "is column of"
 * holds a column in a table whatever else the view nests by. When no type accepts the two ends, the
 * view's first nesting relation type is used, and breaking its limits only warns. `undefined` for a
 * container that is World or no element, or a view that is arranged by nothing and accepts nothing.
 */
export function nestingTypeFor(
  state: ProjectSnapshot,
  view: ViewFile | Id,
  component: Id,
  container: Id,
): NestingChoice | undefined;
/**
 * The nesting relation type that puts an element inside a new container when it changes container:
 * the type of the relations it leaves when they are all of one type, otherwise the view's first
 * nesting relation type; undefined when the view is arranged by none.
 */
export function nestingTypeFor(
  state: ProjectSnapshot,
  view: ViewFile,
  leaving: readonly Relation[],
): Id | undefined;
export function nestingTypeFor(
  state: ProjectSnapshot,
  view: ViewFile | Id,
  componentOrLeaving: Id | readonly Relation[],
  container?: Id,
): NestingChoice | Id | undefined {
  const found = typeof view === 'string' ? state.views.find((each) => each.id === view) : view;
  if (typeof componentOrLeaving !== 'string') {
    const types = new Set(componentOrLeaving.map((relation) => relation.relationType));
    const [only] = types;
    if (types.size === 1 && only !== undefined) return only;
    return found === undefined ? undefined : nestingTypesInView(state, found)[0];
  }
  if (found === undefined || container === undefined) return undefined;
  return rankedNestingType(state, found, componentOrLeaving, container);
}

function rankedNestingType(
  state: ProjectSnapshot,
  view: ViewFile,
  component: Id,
  container: Id,
): NestingChoice | undefined {
  const index = modelIndexOf(state);
  const holder = index.element(container);
  if (holder === undefined || container === state.model.world.id) return undefined;
  const definitions = definitionsIn(state);
  const inView = nestingTypesInView(state, view);
  const lineages = {
    from: componentOrEssence(definitions, component).lineage,
    to: componentOrEssence(definitions, holder.component).lineage,
  };
  /** How far along a lineage the nearest id a limit lists is; `undefined` when it lists none. */
  const distance = (lineage: readonly Id[], limit: readonly Id[]) => {
    const places = limit.map((id) => lineage.indexOf(id)).filter((at) => at !== -1);
    return places.length === 0 ? undefined : Math.min(...places);
  };
  const candidates: { id: Id; named: number; far: number; place: number }[] = [];
  [...definitions.nestingRelationTypes].forEach((id, packagePlace) => {
    const limits = definitions.relationType(id)?.limits ?? {};
    let named = 0;
    let far = 0;
    for (const end of ['from', 'to'] as const) {
      const limit = limits[end];
      if (limit === undefined) continue;
      const along = distance(lineages[end], limit);
      if (along === undefined) return;
      named += 1;
      far += along;
    }
    const viewPlace = inView.indexOf(id);
    candidates.push({
      id,
      named,
      far,
      place: viewPlace === -1 ? inView.length + packagePlace : viewPlace,
    });
  });
  candidates.sort((a, b) => b.named - a.named || a.far - b.far || a.place - b.place);
  const [best] = candidates;
  if (best !== undefined) return { relationType: best.id, addToView: !inView.includes(best.id) };
  const [first] = inView;
  return first === undefined ? undefined : { relationType: first, addToView: false };
}
