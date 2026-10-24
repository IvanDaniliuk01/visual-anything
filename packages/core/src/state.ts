import { definitionsOf, type Definitions } from './definitions';
import { indexModel, type ModelIndex } from './model-index';
import type { ProjectSnapshot } from './snapshot';

/**
 * The definitions of the packages a project uses, with the project appearances it gives to the
 * definitions it cannot change. Everything that draws a project, or checks or changes it, works its
 * definitions out here.
 */
export function definitionsIn(state: ProjectSnapshot): Definitions {
  return definitionsOf(state.packages, state.project.appearances);
}

/** The index of a project's model, with containment from every relation type that nests. */
export function modelIndexOf(state: ProjectSnapshot): ModelIndex {
  return indexModel(state.model, definitionsIn(state).nestingRelationTypes);
}
