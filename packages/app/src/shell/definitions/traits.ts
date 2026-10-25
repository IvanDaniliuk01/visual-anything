/**
 * Where each trait of a component or relation type comes from, as the component editor shows it:
 * "its own", "from Database" or "from Essence". Every trait is inherited from the nearest definition
 * in the chain that sets it.
 */
import {
  componentOrEssence,
  relationTypeOrRelatesTo,
  traitSources,
  type Definitions,
  type ResolvedRelationType,
} from '@visual-anything/core';
import {
  RELATES_TO_ID,
  type AttributeDefinition,
  type Id,
  type RelationType,
} from '@visual-anything/schema';
import { t } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import type { DefinitionKind } from './commands';

/** The name of a component or relation type, by its id. */
export function nameOf(definitions: Definitions, kind: DefinitionKind, id: Id): string {
  return t.definition(
    id,
    kind === 'component'
      ? componentOrEssence(definitions, id).name
      : relationTypeOrRelatesTo(definitions, id).name,
  );
}

/** Where a trait comes from, in words: "its own" when `source` is the definition itself. */
export function sourceText(
  definitions: Definitions,
  kind: DefinitionKind,
  self: Id,
  source: Id,
): string {
  return source === self
    ? t('its own')
    : t('from {name}', { name: nameOf(definitions, kind, source) });
}

/** The traits of a relation type that are inherited one by one. */
export type RelationTrait =
  'direction' | 'nests' | 'stroke' | 'width' | 'dash' | 'limits.from' | 'limits.to';

const RELATION_TRAITS: Record<RelationTrait, (relationType: RelationType) => unknown> = {
  direction: (relationType) => relationType.direction,
  nests: (relationType) => relationType.nests,
  stroke: (relationType) => relationType.appearance?.stroke,
  width: (relationType) => relationType.appearance?.width,
  dash: (relationType) => relationType.appearance?.dash,
  'limits.from': (relationType) => relationType.limits?.from,
  'limits.to': (relationType) => relationType.limits?.to,
};

/** The relation types of a relation type's chain that a package in use defines, nearest first. */
function relationTypeChain(definitions: Definitions, id: Id): RelationType[] {
  const lineage = definitions.relationType(id)?.lineage ?? [];
  return lineage.flatMap((each) => {
    const definition = definitions.relationTypes.get(each)?.definition;
    return definition === undefined ? [] : [definition];
  });
}

/** Where each trait of a relation type comes from: the nearest one in its chain that sets it, or "relates to". */
export function relationTypeSources(definitions: Definitions, id: Id): Record<RelationTrait, Id> {
  const chain = relationTypeChain(definitions, id);
  const sources = {} as Record<RelationTrait, Id>;
  for (const [trait, read] of Object.entries(RELATION_TRAITS) as [
    RelationTrait,
    (relationType: RelationType) => unknown,
  ][]) {
    sources[trait] = chain.find((each) => read(each) !== undefined)?.id ?? RELATES_TO_ID;
  }
  return sources;
}

/** For each attribute a component or relation type has, the nearest definition in its chain that defines it. */
export function attributeSources(
  definitions: Definitions,
  kind: DefinitionKind,
  id: Id,
): ReadonlyMap<string, Id> {
  if (kind === 'component') return traitSources(definitions, id).attributes;
  const chain = relationTypeChain(definitions, id);
  const sources = new Map<string, Id>();
  for (const attribute of definitions.relationType(id)?.attributes ?? []) {
    const definer = chain.find((each) =>
      (each.attributes ?? []).some((own) => own.name === attribute.name),
    );
    if (definer !== undefined) sources.set(attribute.name, definer.id);
  }
  return sources;
}

/** What a relation type inherits: the relation type it derives from, with everything worked out. */
export function inheritedRelationType(definitions: Definitions, id: Id): ResolvedRelationType {
  const parent = definitions.relationTypes.get(id)?.definition.derivesFrom ?? RELATES_TO_ID;
  return relationTypeOrRelatesTo(definitions, parent);
}

/** The attributes a definition inherits, as the one it derives from has them. */
export function inheritedAttributes(
  definitions: Definitions,
  kind: DefinitionKind,
  id: Id,
): readonly AttributeDefinition[] {
  if (kind === 'relation-type') return inheritedRelationType(definitions, id).attributes;
  const parent = definitions.components.get(id)?.definition.derivesFrom;
  return parent === undefined ? [] : (definitions.component(parent)?.attributes ?? []);
}

/** The largest width or height an appearance can give its shapes. */
const LARGEST_SIZE = 100_000;

/** Why a typed width or height cannot be used; `undefined` when it can. */
export function sizeProblem(text: string): string | undefined {
  const reading = readNumber(text);
  return reading.ok && reading.value > 0 && reading.value <= LARGEST_SIZE
    ? undefined
    : t('Enter a size above 0, at most 100,000.');
}

/** Why a typed line width cannot be used; `undefined` when it can. */
export function lineWidthProblem(text: string): string | undefined {
  const reading = readNumber(text);
  return reading.ok && reading.value > 0 ? undefined : t('Enter a width above 0.');
}

/** The names of components or relation types, "A, B or C", for what a limit allows. */
export function namesOr(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return t('{first} or {last}', { first: names.slice(0, -1).join(', '), last: names.at(-1) ?? '' });
}
