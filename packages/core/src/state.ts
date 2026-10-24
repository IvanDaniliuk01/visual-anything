import { definitionsOf, type Definitions } from './definitions';
import { indexModel, type ModelIndex } from './model-index';
import type { ProjectSnapshot } from './snapshot';

/** The definitions of the packages a project uses. */
export function definitionsIn(state: ProjectSnapshot): Definitions {
  return definitionsOf(state.packages);
}

/** The index of a project's model, with containment from every relation type that nests. */
export function modelIndexOf(state: ProjectSnapshot): ModelIndex {
  return indexModel(state.model, definitionsIn(state).nestingRelationTypes);
}
