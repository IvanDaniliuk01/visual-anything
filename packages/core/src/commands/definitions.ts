/** Commands on packages and their definitions: components and relation types. */
import type {
  AttributeDefinition,
  Component,
  PackageFile,
  RelationType,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import { isId } from '../ids';
import { indexModel } from '../model-index';
import { containmentCycles } from '../rules';
import { definitionsOf } from '../definitions';
import { compact, reject, requireList, requireName, type Draft } from './draft';
import type {
  CreatePackageCommand,
  DefineComponentCommand,
  DefineRelationTypeCommand,
  RemoveComponentCommand,
  RemoveRelationTypeCommand,
} from './types';

export function createPackage(draft: Draft, command: CreatePackageCommand): string {
  const { id, description } = command.package;
  const name = requireName(command.package.name, 'A package');
  if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
  if (builtinPackage(id) || draft.state.packages.some((file) => file.id === id)) {
    reject('id-taken', `A package with the id "${id}" already exists.`, [id]);
  }
  const created: PackageFile = compact({
    id,
    name,
    description,
    components: [],
    relationTypes: [],
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'packages' },
    index: draft.state.packages.length,
    item: created,
  });
  draft.apply({
    op: 'set-project',
    project: { ...draft.state.project, packages: [...draft.state.project.packages, id] },
  });
  draft.created.push(id);
  return `Create the package "${name}"`;
}

export function defineComponent(draft: Draft, command: DefineComponentCommand): string {
  const file = draft.ownPackage(command.package);
  const component = checkedDefinition(draft, file, command.component, 'component');
  const exists = file.components.some((each) => each.id === component.id);
  draft.apply(
    exists
      ? { op: 'replace', collection: { name: 'components', package: file.id }, item: component }
      : {
          op: 'insert',
          collection: { name: 'components', package: file.id },
          index: file.components.length,
          item: component,
        },
  );
  const definitions = draft.definitions;
  const cycle = definitions.problems.find(
    (each) => each.code === 'derivation-cycle' && each.subjects?.includes(component.id),
  );
  if (cycle) reject('derivation-cycle', cycle.message, cycle.subjects);
  if (!exists) draft.created.push(component.id);
  return `${exists ? 'Redefine' : 'Define'} the component "${component.name}"`;
}

export function removeComponent(draft: Draft, command: RemoveComponentCommand): string {
  const defined = draft.definitions.components.get(command.id);
  if (!defined) {
    reject(
      'unknown-component',
      `No package in use defines the component "${String(command.id)}".`,
      [command.id],
    );
  }
  draft.ownPackage(defined.package);
  const users = [draft.state.model.world, ...draft.state.model.elements]
    .filter((element) => element.component === command.id)
    .map((element) => element.id);
  const derived = draft.definitions.componentsDerivedFrom(command.id);
  if (users.length > 0 || derived.length > 0) {
    reject(
      'in-use',
      `The component "${defined.definition.name}" cannot be removed: ${usedBy(users.length, 'element', derived.length, 'component')} use it.`,
      [...users, ...derived],
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'components', package: defined.package },
    key: command.id,
  });
  return `Remove the component "${defined.definition.name}"`;
}

export function defineRelationType(draft: Draft, command: DefineRelationTypeCommand): string {
  const file = draft.ownPackage(command.package);
  const relationType = checkedDefinition(draft, file, command.relationType, 'relation type');
  const exists = file.relationTypes.some((each) => each.id === relationType.id);
  draft.apply(
    exists
      ? {
          op: 'replace',
          collection: { name: 'relationTypes', package: file.id },
          item: relationType,
        }
      : {
          op: 'insert',
          collection: { name: 'relationTypes', package: file.id },
          index: file.relationTypes.length,
          item: relationType,
        },
  );
  const definitions = definitionsOf(draft.state.packages);
  const cycle = definitions.problems.find(
    (each) => each.code === 'derivation-cycle' && each.subjects?.includes(relationType.id),
  );
  if (cycle) reject('derivation-cycle', cycle.message, cycle.subjects);
  if (exists) checkNestingStillHolds(draft);
  else draft.created.push(relationType.id);
  return `${exists ? 'Redefine' : 'Define'} the relation type "${relationType.name}"`;
}

export function removeRelationType(draft: Draft, command: RemoveRelationTypeCommand): string {
  const defined = draft.definitions.relationTypes.get(command.id);
  if (!defined) {
    reject(
      'unknown-relation-type',
      `No package in use defines the relation type "${String(command.id)}".`,
      [command.id],
    );
  }
  draft.ownPackage(defined.package);
  const users = draft.state.model.relations
    .filter((relation) => relation.relationType === command.id)
    .map((relation) => relation.id);
  const derived = draft.definitions.relationTypesDerivedFrom(command.id);
  const views = draft.state.views
    .filter((view) => view.nestingRelationTypes.includes(command.id))
    .map((view) => view.id);
  if (users.length > 0 || derived.length > 0 || views.length > 0) {
    reject(
      'in-use',
      `The relation type "${defined.definition.name}" cannot be removed: relations, relation types or views use it.`,
      [...users, ...derived, ...views],
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'relationTypes', package: defined.package },
    key: command.id,
  });
  return `Remove the relation type "${defined.definition.name}"`;
}

/** Checks a component or relation type that is about to be defined in one of the project's packages. */
function checkedDefinition<T extends Component | RelationType>(
  draft: Draft,
  file: PackageFile,
  definition: T,
  noun: 'component' | 'relation type',
): T {
  const id = definition.id;
  if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
  if (!id.startsWith(`${file.id}.`)) {
    reject(
      'id-outside-package',
      `The ${noun} "${id}" must start with "${file.id}.", the id of its package.`,
      [id],
    );
  }
  requireName(definition.name, `A ${noun}`);
  const definitions = draft.definitions;
  const elsewhere =
    noun === 'component' ? definitions.components.get(id) : definitions.relationTypes.get(id);
  if (elsewhere && elsewhere.package !== file.id) {
    reject('defined-twice', `The package "${elsewhere.package}" already defines "${id}".`, [id]);
  }
  const builtIn = noun === 'component' ? ESSENCE_ID : RELATES_TO_ID;
  const parentKnown =
    definition.derivesFrom === builtIn ||
    (noun === 'component'
      ? definitions.components.has(definition.derivesFrom)
      : definitions.relationTypes.has(definition.derivesFrom));
  if (definition.derivesFrom === id || !parentKnown) {
    reject(
      definition.derivesFrom === id ? 'derivation-cycle' : 'unknown-parent',
      definition.derivesFrom === id
        ? `The ${noun} "${id}" cannot derive from itself.`
        : `The ${noun} "${id}" derives from "${definition.derivesFrom}", which no package in use defines.`,
      [id],
    );
  }
  const names = new Set<string>();
  for (const attribute of requireList<AttributeDefinition>(definition.attributes, 'attributes')) {
    requireName(attribute.name, 'An attribute');
    if (names.has(attribute.name)) {
      reject(
        'invalid-command',
        `The ${noun} "${id}" defines the attribute "${attribute.name}" twice.`,
        [id],
      );
    }
    names.add(attribute.name);
  }
  return definition;
}

/**
 * After a relation type changes, its relations and those of the types deriving from it must still
 * keep the nesting rules: they place elements inside elements, and containment forms no cycle.
 */
function checkNestingStillHolds(draft: Draft): void {
  const definitions = draft.definitions;
  const index = indexModel(draft.state.model, definitions.nestingRelationTypes);
  for (const relation of draft.state.model.relations) {
    if (!definitions.nestingRelationTypes.has(relation.relationType)) continue;
    if (!index.element(relation.from) || !index.element(relation.to)) {
      reject(
        'nesting-end-not-element',
        `The relation "${relation.id}" would nest, but one of its ends is a relation.`,
        [relation.id],
      );
    }
    if (relation.from === index.world.id) {
      reject('world-not-allowed', 'World cannot sit inside anything.', [relation.id]);
    }
  }
  const elements = [index.world.id, ...draft.state.model.elements.map((element) => element.id)];
  const [cycle] = containmentCycles(index, elements);
  if (cycle) {
    reject('containment-cycle', 'The change would make containment form a cycle.', cycle);
  }
}

function usedBy(first: number, firstNoun: string, second: number, secondNoun: string): string {
  const parts: string[] = [];
  if (first > 0) parts.push(`${first} ${firstNoun}${first === 1 ? '' : 's'}`);
  if (second > 0) parts.push(`${second} ${secondNoun}${second === 1 ? '' : 's'}`);
  return parts.join(' and ');
}
