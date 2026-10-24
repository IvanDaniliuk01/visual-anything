/**
 * Which relations put a view's shapes inside containers. A view lists the nesting relation types that
 * arrange it; the ones a package in use defines and that nest are the ones that do, in its order. The
 * canvas, the commands and the checks all ask here, so that they agree on where every shape sits.
 */
import type { Id, Relation, ViewFile } from '@visual-anything/schema';
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
 * World, where an element sits when nothing else holds it.
 */
export function leavingRelations(
  state: ProjectSnapshot,
  view: ViewFile,
  element: Id,
  from: Id | undefined,
): Relation[] {
  if (from === undefined || from === state.model.world.id) return [];
  const types = new Set(nestingTypesInView(state, view));
  return modelIndexOf(state)
    .relationsOn(element)
    .filter(
      (relation) =>
        relation.from === element && relation.to === from && types.has(relation.relationType),
    );
}

/**
 * The nesting relation type that puts an element inside a new container: the type of the relations it
 * leaves when they are all of one type, otherwise the view's first nesting relation type; undefined
 * when the view is arranged by none.
 */
export function nestingTypeFor(
  state: ProjectSnapshot,
  view: ViewFile,
  leaving: readonly Relation[],
): Id | undefined {
  const types = new Set(leaving.map((relation) => relation.relationType));
  const [only] = types;
  if (types.size === 1 && only !== undefined) return only;
  return nestingTypesInView(state, view)[0];
}
