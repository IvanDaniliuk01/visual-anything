/**
 * Checking a project as read from its files, beyond what the JSON Schema can tell: whether ids are
 * unique and resolve, and whether the model keeps its rules. Errors keep the project from opening;
 * warnings are shown and the project opens.
 */
import type { Appearance, AttributeDefinition, Attributes, Id } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID, SCHEMA_VERSION } from '@visual-anything/schema';
import { RESERVED_PACKAGE_IDS, builtinPackage } from './builtin';
import { appearanceOf, type Definitions } from './definitions';
import { checkImages } from './images/check';
import { positionKey } from './operations';
import { problem, type Problem } from './problems';
import { cappedWarnings, choiceWarnings, containmentCycles, limitWarnings } from './rules';
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

  const version = state.project.schemaVersion as number;
  if (version > SCHEMA_VERSION) {
    errors.push(
      problem(
        'newer-format',
        `This project was saved by a newer Visual Anything, format ${version}. Update the program to open it.`,
      ),
    );
  }
  warnings.push(...appearanceWarnings(state, definitions));
  for (const file of state.packages) {
    if (RESERVED_PACKAGE_IDS.has(file.id) && builtinPackage(file.id) !== file) {
      warnings.push(
        problem(
          'built-in-package',
          `The package "${file.id}" takes an id Visual Anything keeps for a package it plans to build in; rename it before that package ships.`,
          [file.id],
        ),
      );
    }
  }

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
    for (const id of view.collapsed ?? []) {
      if (id === index.world.id || !index.element(id)) {
        warnings.push(
          problem(
            'unknown-element',
            `The view "${view.name}" keeps "${id}" collapsed, which is no element of the model; it is ignored.`,
            [view.id],
          ),
        );
      }
    }
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
  const images = checkImages(state);
  errors.push(...images.errors);
  warnings.push(...images.warnings);
  return { errors, warnings };
}

/** The shapes that cannot draw rows. */
const NOT_FOR_ROWS: ReadonlySet<string> = new Set(['ellipse', 'cylinder', 'person']);

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What only warns about appearances, limits and attribute values as read from the files: details and
 * badges that name what is not there, connection points named twice (the first is used), rows on a
 * shape that cannot draw them (drawn as a rectangle), limits naming no definition, and values outside
 * their choices, at most 20 of those and a summary.
 */
function appearanceWarnings(state: ProjectSnapshot, definitions: Definitions): Problem[] {
  const warnings: Problem[] = [];
  const check = (
    appearance: Appearance | undefined,
    resolved: { attributes: readonly AttributeDefinition[]; shape: string; rows: boolean },
    values: Attributes | undefined,
    of: string,
    subject: Id,
  ) => {
    if (appearance === undefined) return;
    const byName = new Map(resolved.attributes.map((attribute) => [attribute.name, attribute]));
    const has = (name: string) =>
      byName.has(name) || (values !== undefined && Object.hasOwn(values, name));
    for (const name of appearance.detail?.attributes ?? []) {
      if (!has(name)) {
        warnings.push(
          problem(
            'unknown-attribute',
            `The detail of ${of} writes "${name}", which it does not have.`,
            [subject],
          ),
        );
      }
    }
    for (const badge of appearance.detail?.badges ?? []) {
      if (badge.when === 'from-end') {
        if (badge.relationType !== RELATES_TO_ID && !definitions.relationType(badge.relationType)) {
          warnings.push(
            problem(
              'unknown-relation-type',
              `The badge "${badge.text}" of ${of} names "${badge.relationType}", which no package in use defines.`,
              [subject],
            ),
          );
        }
      } else if (!has(badge.attribute)) {
        warnings.push(
          problem(
            'unknown-attribute',
            `The badge "${badge.text}" of ${of} is written while "${badge.attribute}" is true, which it does not have.`,
            [subject],
          ),
        );
      } else if (byName.has(badge.attribute) && byName.get(badge.attribute)?.type !== 'boolean') {
        warnings.push(
          problem(
            'invalid-appearance',
            `The badge "${badge.text}" of ${of} is written while "${badge.attribute}" is true, but it is not a boolean attribute.`,
            [subject],
          ),
        );
      }
    }
    const names = new Set<string>();
    for (const point of appearance.connectionPoints ?? []) {
      if (names.has(point.name)) {
        warnings.push(
          problem(
            'invalid-appearance',
            `${capitalized(of)} has two connection points named "${point.name}"; the first is used.`,
            [subject],
          ),
        );
      }
      names.add(point.name);
    }
    const setsEither = appearance.shape !== undefined || appearance.contentsAsRows !== undefined;
    if (setsEither && resolved.rows && NOT_FOR_ROWS.has(resolved.shape)) {
      warnings.push(
        problem(
          'invalid-appearance',
          `${capitalized(of)} draws its contents as rows on a ${resolved.shape}; it is drawn as a rectangle.`,
          [subject],
        ),
      );
    }
  };

  for (const [id, { definition }] of definitions.components) {
    const resolved = definitions.component(id);
    if (!resolved) continue;
    check(
      definition.appearance,
      {
        attributes: resolved.attributes,
        shape: resolved.appearance.shape,
        rows: resolved.appearance.contentsAsRows,
      },
      undefined,
      `the component "${definition.name}"`,
      id,
    );
  }
  for (const [id, { definition }] of definitions.relationTypes) {
    for (const end of ['from', 'to'] as const) {
      const limit = definition.limits?.[end];
      if (!Array.isArray(limit)) continue;
      for (const named of limit) {
        const known =
          named === ESSENCE_ID ||
          named === RELATES_TO_ID ||
          definitions.components.has(named) ||
          definitions.relationTypes.has(named);
        if (!known) {
          warnings.push(
            problem(
              'unknown-component',
              `The ${end} limit of the relation type "${definition.name}" names "${named}", which no package in use defines; it is ignored.`,
              [id],
            ),
          );
        }
      }
    }
  }
  const choices: Problem[] = [];
  for (const element of [state.model.world, ...state.model.elements]) {
    const component = definitions.component(element.component);
    if (!component) continue;
    const resolved = appearanceOf(element, definitions);
    check(
      element.appearance,
      { attributes: component.attributes, shape: resolved.shape, rows: resolved.contentsAsRows },
      element.attributes,
      `"${element.name}"`,
      element.id,
    );
    choices.push(...choiceWarnings(element, component.attributes));
  }
  for (const relation of state.model.relations) {
    const type = definitions.relationType(relation.relationType);
    if (type) choices.push(...choiceWarnings(relation, type.attributes));
  }
  warnings.push(
    ...cappedWarnings(
      choices,
      'choice-broken',
      (rest) =>
        `…and ${rest} more ${rest === 1 ? 'value is' : 'values are'} outside their choices.`,
    ),
  );
  return warnings;
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
