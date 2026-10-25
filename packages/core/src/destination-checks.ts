/**
 * The checks on destinations when a project opens (ADR 0056), beyond what the JSON Schema can tell.
 * Each only warns: a destination that opens nothing is kept and flagged, as a broken step is.
 */
import type { AttributeDefinition, Attributes, Id } from '@visual-anything/schema';
import type { Definitions } from './definitions';
import { destinationsOf, readDestination } from './destinations';
import { problem, type Problem } from './problems';
import { cappedWarnings } from './rules';
import type { ProjectSnapshot } from './snapshot';

/**
 * What only warns about destinations as read from the files: a value of a `destination` attribute
 * that is not one, which is never followed; and one that opens a view the project does not have, or
 * focuses on an element the model does not have. They are kept and flagged, as broken steps are, at
 * most 20 and a summary. Whether another project is there is the local program's to tell.
 */
export function destinationWarnings(state: ProjectSnapshot, definitions: Definitions): Problem[] {
  const warnings: Problem[] = [];
  const views = new Set(state.views.map((view) => view.id));
  const elementIds = new Set(state.model.elements.map((element) => element.id));
  elementIds.add(state.model.world.id);
  const check = (
    item: { id: Id; name?: string; attributes?: Attributes },
    attributes: readonly AttributeDefinition[],
  ) => {
    const of = `"${item.name ?? item.id}"`;
    const values = item.attributes;
    for (const definition of attributes) {
      if (definition.type !== 'destination') continue;
      if (values === undefined || !Object.hasOwn(values, definition.name)) continue;
      const read = readDestination(values[definition.name]);
      if (!read.ok) {
        warnings.push(
          problem(
            'broken-destination',
            `The destination "${definition.name}" of ${of} is not one, so it never opens: ${read.why}`,
            [item.id],
          ),
        );
      }
    }
    for (const { attribute, destination } of destinationsOf(item, attributes)) {
      if ('url' in destination || 'project' in destination) continue;
      if (!views.has(destination.view)) {
        warnings.push(
          problem(
            'broken-destination',
            `The destination "${attribute}" of ${of} opens the view "${destination.view}", which the project does not have; it is kept, and opens nothing until that view is back.`,
            [item.id],
          ),
        );
        continue;
      }
      const missing = (destination.focus ?? []).filter((id) => !elementIds.has(id));
      if (missing.length > 0) {
        warnings.push(
          problem(
            'broken-destination',
            `The destination "${attribute}" of ${of} focuses on "${missing.join('", "')}", which the model does not have; the view opens without ${missing.length === 1 ? 'it' : 'them'}.`,
            [item.id],
          ),
        );
      }
    }
  };
  for (const element of [state.model.world, ...state.model.elements]) {
    const component = definitions.component(element.component);
    if (component !== undefined) check(element, component.attributes);
  }
  for (const relation of state.model.relations) {
    const type = definitions.relationType(relation.relationType);
    if (type !== undefined) check(relation, type.attributes);
  }
  return cappedWarnings(
    warnings,
    'broken-destination',
    (rest) => `…and ${rest} more destinations open nothing.`,
  );
}

/** Every distinct path to another project the project's destinations name, in model order. */
export function projectDestinationPaths(
  state: ProjectSnapshot,
  definitions: Definitions,
): { path: string; subjects: Id[] }[] {
  const byPath = new Map<string, Id[]>();
  const add = (
    item: { id: Id; attributes?: Attributes },
    attributes: readonly AttributeDefinition[],
  ) => {
    for (const { destination } of destinationsOf(item, attributes)) {
      if (!('project' in destination)) continue;
      const subjects = byPath.get(destination.project) ?? [];
      if (subjects.at(-1) !== item.id) subjects.push(item.id);
      byPath.set(destination.project, subjects);
    }
  };
  for (const element of [state.model.world, ...state.model.elements]) {
    const component = definitions.component(element.component);
    if (component !== undefined) add(element, component.attributes);
  }
  for (const relation of state.model.relations) {
    const type = definitions.relationType(relation.relationType);
    if (type !== undefined) add(relation, type.attributes);
  }
  return [...byPath].map(([path, subjects]) => ({ path, subjects }));
}
