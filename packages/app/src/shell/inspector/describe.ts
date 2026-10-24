/** How the inspector names what it shows: ends, relations, what is selected and where definitions come from. */
import {
  relationTypeOrRelatesTo,
  type Defined,
  type Definitions,
  type ModelIndex,
} from '@visual-anything/core';
import type { Id, PackageFile, Relation } from '@visual-anything/schema';
import type { Selection } from '../../editor/selection';

/** How many hops a name makes, from a relation to a relation it ends on, before it stops. */
const NAME_HOPS = 3;

/**
 * What an end of a relation is called: an element's name, or a relation's name; a relation without a
 * name is called by its ends, in round brackets: "(Reminder service → HTTPS)".
 */
export function endName(index: ModelIndex, id: Id, hops = 0): string {
  const element = index.element(id);
  if (element) return element.name;
  const relation = index.relation(id);
  if (!relation) return id;
  if (relation.name !== undefined) return relation.name;
  return hops < NAME_HOPS ? `(${relationLabel(index, relation, hops + 1)})` : '(a relation)';
}

/** What a relation is called: its name, or else its ends, as in "Patient → WhatsApp channel". */
export function relationLabel(index: ModelIndex, relation: Relation, hops = 0): string {
  if (relation.name !== undefined) return relation.name;
  return `${endName(index, relation.from, hops)} → ${endName(index, relation.to, hops)}`;
}

/** A relation in words, with its relation type: "Appointments API is part of Scheduling". */
export function relationSentence(
  index: ModelIndex,
  definitions: Definitions,
  relation: Relation,
): string {
  const relationType = relationTypeOrRelatesTo(definitions, relation.relationType).name;
  return `${endName(index, relation.from)} ${relationType} ${endName(index, relation.to)}`;
}

/** Counts things in words: "1 element", "3 relations". */
export function count(amount: number, singular: string, plural = `${singular}s`): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

/** What is selected, in words: "2 elements, 1 relation and 1 free shape". */
export function countsOf(selection: Selection): string {
  const parts = [
    [selection.elements.size, 'element'],
    [selection.relations.size, 'relation'],
    [selection.freeShapes.size, 'free shape'],
  ] as const;
  const counted = parts
    .filter(([amount]) => amount > 0)
    .map(([amount, singular]) => count(amount, singular));
  if (counted.length === 0) return 'Nothing';
  const last = counted.pop() as string;
  return counted.length === 0 ? last : `${counted.join(', ')} and ${last}`;
}

/** The definitions one package gives, offered together under its name. */
export interface FromPackage {
  id: Id;
  name: string;
  /** The ids of the definitions, in the order the package lists them. */
  members: Id[];
}

/** The definitions by the package that defines them, in the order the project lists its packages. */
export function byPackage<T>(
  defined: ReadonlyMap<Id, Defined<T>>,
  packages: readonly PackageFile[],
): FromPackage[] {
  const offered = new Map<Id, FromPackage>(
    packages.map((file) => [file.id, { id: file.id, name: file.name, members: [] }]),
  );
  for (const [id, { package: packageId }] of defined) {
    let from = offered.get(packageId);
    if (!from) {
      from = { id: packageId, name: packageId, members: [] };
      offered.set(packageId, from);
    }
    from.members.push(id);
  }
  return [...offered.values()].filter((from) => from.members.length > 0);
}
