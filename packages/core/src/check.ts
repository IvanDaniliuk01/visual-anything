/**
 * Checking a project as read from its files, beyond what the JSON Schema can tell: whether ids are
 * unique and resolve, and whether the model keeps its rules. Errors keep the project from opening;
 * warnings are shown and the project opens.
 */
import type { Id } from '@visual-anything/schema';
import { positionKey } from './operations';
import { problem, type Problem } from './problems';
import { containmentCycles, limitWarnings } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';

/** What is wrong with a project. */
export interface ProjectCheck {
  errors: Problem[];
  warnings: Problem[];
}

/** Checks a project as read from its files. */
export function checkProject(state: ProjectSnapshot): ProjectCheck {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  const { world, elements, relations } = state.model;

  for (const each of definitions.problems) {
    (each.code === 'id-outside-package' ? warnings : errors).push(each);
  }
  errors.push(
    ...repeated(
      state.packages.map((file) => file.id),
      'package',
    ),
  );
  errors.push(
    ...repeated(
      [
        world.id,
        ...elements.map((element) => element.id),
        ...relations.map((relation) => relation.id),
      ],
      'element or relation',
    ),
  );

  for (const element of [world, ...elements]) {
    if (!definitions.component(element.component)) {
      errors.push(
        problem(
          'unknown-component',
          `The element "${element.name}" is created from "${element.component}", which no package in use defines.`,
          [element.id],
        ),
      );
    }
  }

  for (const relation of relations) {
    const type = definitions.relationType(relation.relationType);
    if (!type) {
      errors.push(
        problem(
          'unknown-relation-type',
          `The relation "${relation.id}" is of "${relation.relationType}", which no package in use defines.`,
          [relation.id],
        ),
      );
    }
    for (const end of [relation.from, relation.to]) {
      if (end === relation.id) {
        errors.push(
          problem('unknown-end', `The relation "${relation.id}" ends on itself.`, [relation.id]),
        );
      } else if (!index.has(end)) {
        errors.push(
          problem(
            'unknown-end',
            `The relation "${relation.id}" ends on "${end}", which is no element or relation of the model.`,
            [relation.id],
          ),
        );
      }
    }
    if (type?.nests) {
      if (
        (index.has(relation.from) && !index.element(relation.from)) ||
        (index.has(relation.to) && !index.element(relation.to))
      ) {
        errors.push(
          problem(
            'nesting-end-not-element',
            `The relation "${relation.id}" nests, so both its ends must be elements.`,
            [relation.id],
          ),
        );
      }
      if (relation.from === world.id) {
        errors.push(
          problem('world-not-allowed', 'World cannot sit inside anything.', [relation.id]),
        );
      }
    }
    if (type) warnings.push(...limitWarnings(relation, index, definitions));
  }

  for (const cycle of containmentCycles(index, [
    world.id,
    ...elements.map((element) => element.id),
  ])) {
    const names = cycle.map((id) => `"${index.element(id)?.name ?? id}"`);
    errors.push(
      problem('containment-cycle', `Containment forms a cycle: ${names.join(' inside ')}.`, cycle),
    );
  }

  errors.push(
    ...repeated(
      state.views.map((view) => view.id),
      'view',
    ),
  );
  for (const view of state.views) {
    for (const id of view.nestingRelationTypes) {
      const type = definitions.relationType(id);
      if (!type) {
        warnings.push(
          problem(
            'unknown-relation-type',
            `The view "${view.name}" is arranged by "${id}", which no package in use defines.`,
            [view.id],
          ),
        );
      } else if (!type.nests) {
        warnings.push(
          problem(
            'not-nesting',
            `The view "${view.name}" is arranged by "${type.name}", which does not nest.`,
            [view.id],
          ),
        );
      }
    }
    errors.push(
      ...repeated(view.positions.map(positionKey), `position in the view "${view.name}"`, [
        view.id,
      ]),
    );
    for (const position of view.positions) {
      const missing = [position.element, position.container].filter(
        (id): id is Id => id !== undefined && !index.element(id),
      );
      if (missing.length > 0) {
        warnings.push(
          problem(
            'unknown-position',
            `The view "${view.name}" keeps a position for "${positionKey(position)}", but the model has no element "${missing.join('", "')}"; it is ignored.`,
            [view.id],
          ),
        );
      }
    }
    errors.push(
      ...repeated(
        view.freeShapes.map((shape) => shape.id),
        `free shape in the view "${view.name}"`,
        [view.id],
      ),
    );
    // Stacking lists name the shapes of a container, or of World, by element id. The problems are
    // the view's: its file is where the list is written.
    for (const [container, list] of Object.entries(view.stackingOrder ?? {})) {
      const holder =
        container === index.world.id ? 'World' : (index.element(container)?.name ?? undefined);
      if (holder === undefined) {
        warnings.push(
          problem(
            'unknown-element',
            `The view "${view.name}" keeps a stacking order for "${container}", which is no element of the model; it is ignored.`,
            [view.id],
          ),
        );
        continue;
      }
      const named = new Set<Id>();
      for (const id of list) {
        if (named.has(id)) {
          errors.push(
            problem(
              'id-taken',
              `The stacking order of "${holder}" in the view "${view.name}" names "${id}" more than once.`,
              [view.id],
            ),
          );
          continue;
        }
        named.add(id);
        if (id === index.world.id || !index.element(id)) {
          warnings.push(
            problem(
              'unknown-element',
              `The stacking order of "${holder}" in the view "${view.name}" names "${id}", which is no element of the model; it is ignored.`,
              [view.id],
            ),
          );
        }
      }
    }
  }

  errors.push(
    ...repeated(
      state.scenarios.map((scenario) => scenario.id),
      'scenario',
    ),
  );
  const viewIds = new Set(state.views.map((view) => view.id));
  for (const scenario of state.scenarios) {
    if (!viewIds.has(scenario.view)) {
      errors.push(
        problem(
          'unknown-view',
          `The scenario "${scenario.name}" plays over "${scenario.view}", which is no view of the project.`,
          [scenario.id],
        ),
      );
    }
    errors.push(
      ...repeated(
        scenario.steps.map((step) => step.id),
        `step in the scenario "${scenario.name}"`,
        [scenario.id],
      ),
    );
  }
  return { errors, warnings };
}

/** A problem for every id or key that appears more than once. */
function repeated(keys: readonly string[], noun: string, subjects?: readonly Id[]): Problem[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const problems: Problem[] = [];
  for (const key of keys) {
    if (seen.has(key) && !reported.has(key)) {
      reported.add(key);
      problems.push(
        problem('id-taken', `More than one ${noun} has the id "${key}".`, subjects ?? [key]),
      );
    }
    seen.add(key);
  }
  return problems;
}
