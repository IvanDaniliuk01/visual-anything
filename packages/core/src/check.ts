/**
 * Checking a project as read from its files, beyond what the JSON Schema can tell: whether ids are
 * unique and resolve, and whether the model keeps its rules. Errors keep the project from opening;
 * warnings are shown and the project opens.
 */
import type { Appearance, AttributeDefinition, Attributes, Id } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID, SCHEMA_VERSION } from '@visual-anything/schema';
import { RESERVED_PACKAGE_IDS, builtinPackage } from './builtin';
import { appearanceOf, isBuiltInDefinition, type Definitions } from './definitions';
import { codeWarnings } from './code/check';
import { simulationWarnings } from './simulation/check';
import { destinationWarnings } from './destination-checks';
import { duplicateExternalIdWarnings } from './external-ids';
import { faceWarnings } from './faces/project-check';
import { threadErrors } from './comments/check';
import { checkImages } from './images/check';
import { checkSolids } from './solids/check';
import { checkExplorables } from './explorables/check';
import { kinematicsWarnings } from './space/kinematics';
import { poseWarnings } from './space/pose';
import { overlayProblems } from './overlays/check';
import { positionKey } from './operations';
import { problem, type Problem } from './problems';
import { routeWarnings } from './routes';
import { cappedWarnings, choiceWarnings, containmentCycles, limitWarnings } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import { geometryFindings } from './geometry';
import { readBlocks } from './scenarios/blocks';
import { mathFindings } from './math/check';

/** What is wrong with a project. */
export interface ProjectCheck {
  errors: Problem[];
  warnings: Problem[];
  /**
   * What is only told, neither wrong nor warned about, such as a text read as Math (ADR 0106), so
   * that a person can tell whether it was meant. Present only when there is something to tell.
   */
  notices?: Problem[];
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
  // Faces the subset refuses, past their caps, or that read poorly only warn (ADR 0083).
  warnings.push(...faceWarnings(state, definitions));
  // Free geometry that is not geometry, or past a file's cap, is drawn as its kind (ADR 0066).
  warnings.push(...geometryFindings(state).warnings);
  // Package code that cannot run (ADR 0054).
  warnings.push(...codeWarnings(state));
  // Simulations that cannot be one never run (ADR 0085).
  warnings.push(...simulationWarnings(state));
  // Conflicts a merge left in files, which the person resolves (ADR 0072).
  warnings.push(...conflictWarnings(state));
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
    // A scope's lists and rules may name what is gone, as a hand-edited file may (ADR 0040).
    for (const list of ['added', 'leftOut'] as const) {
      for (const id of view.scope?.[list] ?? []) {
        if (id === index.world.id || !index.element(id)) {
          warnings.push(
            problem(
              'unknown-element',
              `The scope of the view "${view.name}" names "${id}", which is no element of the model; it is ignored.`,
              [view.id],
            ),
          );
        }
      }
    }
    for (const rule of [...(view.scope?.include ?? []), ...(view.scope?.exclude ?? [])]) {
      if (rule.kind === 'component' && !definitions.component(rule.component)) {
        warnings.push(
          problem(
            'unknown-component',
            `A rule of the scope of the view "${view.name}" names the component "${rule.component}", which no package in use defines; it takes nothing.`,
            [view.id],
          ),
        );
      } else if (rule.kind === 'relation-type' && !definitions.relationType(rule.relationType)) {
        warnings.push(
          problem(
            'unknown-relation-type',
            `A rule of the scope of the view "${view.name}" names the relation type "${rule.relationType}", which no package in use defines; it takes nothing.`,
            [view.id],
          ),
        );
      } else if (rule.kind === 'contents' && !index.element(rule.container)) {
        warnings.push(
          problem(
            'unknown-element',
            `A rule of the scope of the view "${view.name}" names the container "${rule.container}", which is no element of the model; it takes nothing.`,
            [view.id],
          ),
        );
      }
    }
    // The relation types a view leaves out may be gone, as a hand-edited file may say (ADR 0064).
    for (const entry of view.relationTypesLeftOut ?? []) {
      if (!definitions.relationType(entry.relationType)) {
        warnings.push(
          problem(
            'unknown-relation-type',
            `The view "${view.name}" leaves out the relation type "${entry.relationType}", which no package in use defines.`,
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
    // Decisions that do not hold together only warn: the scenario plays every step in order.
    const decisions = readBlocks(scenario);
    if (!decisions.ok) {
      warnings.push(
        problem(
          'invalid-decision',
          `The decisions of the scenario "${scenario.name}" do not hold together: ${decisions.message} It plays every step in order.`,
          [scenario.id],
        ),
      );
    }
  }
  // Tours (ADR 0058): what their steps name may be gone, which only flags them; ids may not repeat.
  errors.push(
    ...repeated(
      state.tours.map((tour) => tour.id),
      'tour',
    ),
  );
  for (const tour of state.tours) {
    errors.push(
      ...repeated(
        tour.steps.map((step) => step.id),
        `step in the tour "${tour.name}"`,
        [tour.id],
      ),
    );
  }
  const images = checkImages(state);
  errors.push(...images.errors);
  warnings.push(...images.warnings);
  // Solids keep a project from opening only when one is defined twice (ADR 0075).
  const solids = checkSolids(state);
  errors.push(...solids.errors);
  warnings.push(...solids.warnings);

  const explorables = checkExplorables(state);
  errors.push(...explorables.errors);
  warnings.push(...explorables.warnings);
  // Poses only warn, and one whose `in` is not a container is kept and not used (ADR 0076).
  warnings.push(...poseWarnings(state));
  warnings.push(...kinematicsWarnings(state));
  // Routes chosen by hand never keep a project from opening (ADR 0039).
  warnings.push(...routeWarnings(state));
  // Overlays keep a project from opening only with an id twice in one view (ADR 0055).
  const overlays = overlayProblems(state);
  errors.push(...overlays.errors);
  warnings.push(...overlays.warnings);
  // Nor do external identifiers shared by several elements, or destinations that open nothing (ADR 0056).
  warnings.push(...duplicateExternalIdWarnings(state), ...destinationWarnings(state, definitions));
  // Threads of comments (ADR 0059): detached ones are kept, ids are not repeated.
  errors.push(...threadErrors(state));
  // Math that cannot be typeset only warns, drawn as its TeX; a text read as Math is told (ADR 0106).
  const math = mathFindings(state, definitions);
  warnings.push(...math.warnings);
  return math.notices.length > 0
    ? { errors, warnings, notices: math.notices }
    : { errors, warnings };
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
/** One warning for each file that holds conflicts from a merge. */
function conflictWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  const warn = (what: string, file: unknown, subject?: Id) => {
    const count = (file as { conflicts?: unknown[] }).conflicts?.length ?? 0;
    if (count === 0) return;
    warnings.push(
      problem(
        'merge-conflict',
        count === 1
          ? `A merge left a conflict in ${what}: resolve it in the Changes tab, then add the file with git add.`
          : `A merge left ${count} conflicts in ${what}: resolve them in the Changes tab, then add the file with git add.`,
        subject === undefined ? [] : [subject],
      ),
    );
  };
  warn('the project file', state.project);
  warn('the model', state.model);
  for (const file of state.packages) warn(`the package "${file.name}"`, file, file.id);
  for (const view of state.views) warn(`the view "${view.name}"`, view, view.id);
  for (const scenario of state.scenarios)
    warn(`the scenario "${scenario.name}"`, scenario, scenario.id);
  for (const tour of state.tours) warn(`the tour "${tour.name}"`, tour, tour.id);
  for (const thread of state.comments) warn(`the thread "${thread.id}"`, thread, thread.id);
  return warnings;
}

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
    // Levels of detail (ADR 0055): the canvas reads them as best it can.
    const starts = new Set<number>();
    for (const level of appearance.levels ?? []) {
      if (starts.has(level.from)) {
        warnings.push(
          problem(
            'invalid-appearance',
            `Two levels of ${of} start at ${level.from}; the last is used.`,
            [subject],
          ),
        );
      }
      starts.add(level.from);
      if (level.shows.includes('silhouette') && level.shows.length > 1) {
        warnings.push(
          problem(
            'invalid-appearance',
            `The level at ${level.from} of ${of} shows a silhouette only, and nothing else it lists.`,
            [subject],
          ),
        );
      }
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

  // Project appearances: those of definitions the project cannot change are checked as appearances;
  // any other has no effect.
  const unused = (kind: 'component' | 'relation-type', id: Id) => {
    const defined =
      kind === 'component' ? definitions.components.get(id) : definitions.relationTypes.get(id);
    warnings.push(
      problem(
        'appearance-not-used',
        defined === undefined
          ? `The project gives "${id}" an appearance, but no package in use defines it; it is ignored.`
          : `The project gives "${defined.definition.name}" an appearance, but it belongs to the project’s package "${defined.package}"; set it there. This entry is ignored.`,
        [id],
      ),
    );
  };
  for (const [id, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    const resolved = definitions.component(id);
    if (resolved === undefined || !isBuiltInDefinition(definitions, 'component', id)) {
      unused('component', id);
      continue;
    }
    check(
      appearance,
      {
        attributes: resolved.attributes,
        shape: resolved.appearance.shape,
        rows: resolved.appearance.contentsAsRows,
      },
      undefined,
      `the project appearance of "${resolved.name}"`,
      id,
    );
  }
  for (const id of Object.keys(state.project.appearances?.relationTypes ?? {})) {
    const resolved = definitions.relationType(id);
    if (resolved === undefined || !isBuiltInDefinition(definitions, 'relation-type', id)) {
      unused('relation-type', id);
    }
  }

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
