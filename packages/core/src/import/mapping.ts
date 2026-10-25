/**
 * Between reading a file and applying its plan (ADR-0042): the mapping the dialog, the command line
 * and Claude's tools start from, chosen from the built-in mappings; the components and relation types
 * a mapping may choose, those of built-in packages the project does not use yet included; and the
 * prepared import, which wraps `planToCommand`'s one batch so that it also starts using those packages,
 * gives text from the file the types its attributes have, and matches the relations that importing
 * again would repeat to the project's own. The batch keeps `planToCommand`'s label, and one undo still takes it all back.
 */
import {
  ESSENCE_ID,
  RELATES_TO_ID,
  type Attributes,
  type Element,
  type Id,
  type JsonValue,
  type Relation,
} from '@visual-anything/schema';
import { BUILTIN_PACKAGES } from '../builtin';
import { executeCommand } from '../commands';
import type { BatchCommand, Command } from '../commands/types';
import type { Definitions } from '../definitions';
import { definitionsOf } from '../definitions';
import { randomIds, type IdGenerator } from '../ids';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { planToCommand, type ImportMapping, type ImportPlan, type PlannedRelation } from './plan';
import { own, recordOf } from './reader';
import { quote } from './text';

/** A component or relation type a mapping may choose. */
export interface MappingChoice {
  id: Id;
  /** Its name, in English for a built-in one, which the app shows in the language it reads in. */
  name: string;
  /** The package that defines it; absent for Essence and "relates to". */
  package?: Id;
  /** Whether the project uses its package; choosing one it does not use starts using it. */
  inUse: boolean;
  /** For a relation type: whether its relations nest. */
  nests?: boolean;
}

/** The project's definitions, and every built-in package's, as one set to map to. */
function widened(state: ProjectSnapshot): { definitions: Definitions; unused: readonly Id[] } {
  const unused = BUILTIN_PACKAGES.filter(
    (builtin) => !state.packages.some((file) => file.id === builtin.id),
  );
  return {
    definitions: definitionsOf([...state.packages, ...unused], state.project.appearances),
    unused: unused.map((file) => file.id),
  };
}

/**
 * What a mapping may choose: Essence and "relates to", the project's components and relation types,
 * then those of the built-in packages it does not use, each package's in its own order.
 */
export function mappingChoices(state: ProjectSnapshot): {
  components: MappingChoice[];
  relationTypes: MappingChoice[];
} {
  const { definitions, unused } = widened(state);
  const inUse = (pack: Id) => !unused.includes(pack);
  const byUse = <T extends MappingChoice>(choices: T[]) => [
    ...choices.filter((each) => each.inUse),
    ...choices.filter((each) => !each.inUse),
  ];
  return {
    components: [
      { id: ESSENCE_ID, name: 'Essence', inUse: true },
      ...byUse(
        [...definitions.components].map(([id, { definition, package: pack }]) => ({
          id,
          name: definition.name,
          package: pack,
          inUse: inUse(pack),
        })),
      ),
    ],
    relationTypes: [
      { id: RELATES_TO_ID, name: 'relates to', inUse: true, nests: false },
      ...byUse(
        [...definitions.relationTypes].map(([id, { definition, package: pack }]) => ({
          id,
          name: definition.name,
          package: pack,
          inUse: inUse(pack),
          nests: definitions.relationType(id)?.nests ?? false,
        })),
      ),
    ],
  };
}

/**
 * The mapping to start from: for each kind, its suggestion when the project has it; else the
 * project's own definition of the same name; else the suggested built-in one, whose package the import
 * then starts using; else Essence or "relates to". The nesting relation type is the one whose limits
 * fit what sits inside what, else the open view's, else "is part of". Every kind of the plan is an
 * entry of its own, whatever its name.
 */
export function suggestMapping(
  state: ProjectSnapshot,
  plan: ImportPlan,
  options: { view?: Id } = {},
): ImportMapping {
  const mine = definitionsIn(state);
  const { definitions: wide } = widened(state);
  const pick = (
    suggested: Id | undefined,
    mine: ReadonlyMap<Id, { definition: { name: string } }>,
    theirs: ReadonlyMap<Id, { definition: { name: string } }>,
    fallback: Id,
  ): Id => {
    if (suggested === undefined) return fallback;
    if (mine.has(suggested) || suggested === fallback) return suggested;
    const builtin = theirs.get(suggested);
    if (builtin === undefined) return fallback;
    const name = builtin.definition.name.toLowerCase();
    for (const [id, { definition }] of mine) if (definition.name.toLowerCase() === name) return id;
    return suggested;
  };
  const elements = recordOf(
    plan.kinds.elements.map((kind) => [
      kind.kind,
      pick(kind.suggested, mine.components, wide.components, ESSENCE_ID),
    ]),
  );
  // A kind the plan lists no suggestion for, such as one only matched elements use, maps to Essence.
  for (const element of plan.elements) {
    if (element.existing === undefined && !Object.hasOwn(elements, element.kind)) {
      Object.defineProperty(elements, element.kind, {
        value: ESSENCE_ID,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const relations = recordOf(
    plan.kinds.relations.map((kind) => [
      kind.kind,
      pick(kind.suggested, mine.relationTypes, wide.relationTypes, RELATES_TO_ID),
    ]),
  );
  for (const relation of plan.relations) {
    if (!Object.hasOwn(relations, relation.kind)) {
      Object.defineProperty(relations, relation.kind, {
        value: RELATES_TO_ID,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const nesting = nestingFor(state, plan, elements, options.view);
  return { elements, relations, ...(nesting === undefined ? {} : { nesting }) };
}

/** The nesting relation type for what sits inside what in a plan, when anything does. */
function nestingFor(
  state: ProjectSnapshot,
  plan: ImportPlan,
  elements: Readonly<Record<string, Id>>,
  view: Id | undefined,
): Id | undefined {
  if (plan.containment.length === 0) return undefined;
  const { definitions } = widened(state);
  const project = definitionsIn(state);
  const byKey = new Map(plan.elements.map((element) => [element.key, element]));
  const existing = new Map(state.model.elements.map((element) => [element.id, element.component]));
  const componentOf = (key: string): Id | undefined => {
    const element = byKey.get(key);
    if (element === undefined) return undefined;
    return element.existing !== undefined
      ? existing.get(element.existing)
      : own(elements, element.kind);
  };
  const fits = (limit: readonly Id[] | undefined, component: Id | undefined) =>
    limit !== undefined &&
    component !== undefined &&
    limit.some((each) => definitions.componentDerives(component, each));
  const candidates = [
    ...[...definitions.nestingRelationTypes].filter((id) => project.relationTypes.has(id)),
    ...[...definitions.nestingRelationTypes].filter((id) => !project.relationTypes.has(id)),
  ];
  const fitting = candidates.find((id) => {
    const type = definitions.relationType(id);
    if (type?.limits.from === undefined || type.limits.to === undefined) return false;
    return plan.containment.every(
      ({ element, container }) =>
        fits(type.limits.from, componentOf(element)) &&
        fits(type.limits.to, componentOf(container)),
    );
  });
  if (fitting !== undefined) return fitting;
  const shown = state.views.find((each) => each.id === view)?.nestingRelationTypes?.[0];
  if (shown !== undefined && project.relationTypes.has(shown)) return shown;
  if (definitions.relationTypes.has('systems.is-part-of')) return 'systems.is-part-of';
  return candidates[0];
}

/** An import ready to send: its one batch, and what it does. */
export interface PreparedImport {
  ok: true;
  /** The one batch, labelled as `planToCommand` labels it. */
  command: BatchCommand;
  /** The id each planned element, relation and view gets, by its key. */
  ids: ReadonlyMap<string, Id>;
  /**
   * The plan as prepared: values typed, and relations the project already has matched to them, or
   * left out and reported when they change nothing.
   */
  plan: ImportPlan;
  /** The built-in packages the import starts using. */
  packages: Id[];
  /** What it creates: relations count those that put one element inside another. */
  creates: { elements: number; relations: number; views: number };
  /** How many elements and relations of the project it changes, matched as importing again does. */
  updates: { elements: number; relations: number };
  /** What the batch leaves out of the plan, and why, as `planToCommand` says it, for the report. */
  notes: string[];
}

/**
 * The one batch an import becomes, with everything it does, or the problems that keep it from being
 * one. Nothing is applied: the caller sends the command, which the core checks as any other.
 */
export function prepareImport(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping,
  generate: IdGenerator = randomIds(),
): PreparedImport | { ok: false; problems: string[] } {
  const normalized = normalizedMapping(plan, mapping);
  // The built-in packages the mapping chooses from that the project does not use yet.
  const project = definitionsIn(state);
  const { definitions: wide, unused } = widened(state);
  const chosen = new Set<Id>([
    ...plan.elements
      .filter((element) => element.existing === undefined)
      .map((element) => own(normalized.elements, element.kind))
      .filter((id): id is Id => id !== undefined && !project.components.has(id))
      .map((id) => wide.components.get(id)?.package)
      .filter((pack): pack is Id => pack !== undefined),
    ...plan.relations
      .map((relation) => own(normalized.relations, relation.kind))
      .filter((id): id is Id => id !== undefined && !project.relationTypes.has(id))
      .map((id) => wide.relationTypes.get(id)?.package)
      .filter((pack): pack is Id => pack !== undefined),
    ...(normalized.nesting !== undefined && !project.relationTypes.has(normalized.nesting)
      ? [wide.relationTypes.get(normalized.nesting)?.package].filter(
          (pack): pack is Id => pack !== undefined,
        )
      : []),
  ]);
  const packages = unused.filter((id) => chosen.has(id));
  let start = state;
  const before: Command[] = [];
  if (packages.length > 0) {
    const use: Command = {
      type: 'update-project',
      changes: { packages: [...state.project.packages, ...packages] },
    };
    const used = executeCommand(state, use, { newId: generate });
    if (!used.ok) return { ok: false, problems: used.problems.map((each) => each.message) };
    start = used.state;
    before.push(use);
  }
  const prepared = repeatedRelationsMatched(start, typedPlan(start, plan, normalized), normalized);
  const planned = planToCommand(start, prepared, normalized, generate);
  if (!planned.ok) return { ok: false, problems: planned.problems };
  const elements = new Map(state.model.elements.map((element) => [element.id, element]));
  const updatedElements = prepared.elements.filter((element) => {
    if (element.existing === undefined) return false;
    const current = elements.get(element.existing);
    if (current === undefined) return false;
    if (current.name !== element.name) return true;
    return changesAttributes(current, element.attributes);
  }).length;
  // A relation is matched only when it changes something.
  const updatedRelations = prepared.relations.filter(
    (relation) => relation.existing !== undefined,
  ).length;
  const nestings = new Set(
    prepared.containment.map(({ element, container }) => JSON.stringify([element, container])),
  );
  return {
    ok: true,
    command: {
      type: 'batch',
      label: planned.command.label,
      commands: [...before, ...planned.command.commands],
    },
    ids: planned.ids,
    plan: prepared,
    packages,
    creates: {
      elements: prepared.elements.filter((element) => element.existing === undefined).length,
      relations:
        prepared.relations.length -
        updatedRelations +
        (normalized.nesting === undefined ? 0 : nestings.size),
      views: prepared.views.length,
    },
    updates: { elements: updatedElements, relations: updatedRelations },
    notes: planned.notes,
  };
}

/**
 * The mapping as records with no prototype that hold exactly the plan's kinds, so that a kind named
 * `constructor` or `__proto__` reads its own entry, or none.
 */
export function normalizedMapping(plan: ImportPlan, mapping: ImportMapping): ImportMapping {
  const kinds = (things: readonly { kind: string }[], record: Readonly<Record<string, Id>>) =>
    recordOf(
      [...new Set(things.map((thing) => thing.kind))].flatMap((kind) => {
        const id = own(record, kind);
        return id === undefined ? [] : [[kind, id] as const];
      }),
    );
  return {
    elements: kinds(
      plan.elements.filter((element) => element.existing === undefined),
      mapping.elements,
    ),
    relations: kinds(plan.relations, mapping.relations),
    ...(mapping.nesting === undefined ? {} : { nesting: mapping.nesting }),
  };
}

/** Text from a file as a number or a boolean where the attribute it fills has that type. */
function typed(value: JsonValue, type: string | undefined): JsonValue {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (type === 'number' && /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(text)) {
    const number = Number(text);
    return Number.isFinite(number) ? number : value;
  }
  if (type === 'boolean' && /^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  return value;
}

/** A plan whose attribute values are typed by the definitions they are mapped to. */
function typedPlan(state: ProjectSnapshot, plan: ImportPlan, mapping: ImportMapping): ImportPlan {
  const definitions = definitionsIn(state);
  const components = new Map(
    state.model.elements.map((element) => [element.id, element.component]),
  );
  const typesOf = (attributes: readonly { name: string; type: string }[] | undefined) =>
    new Map((attributes ?? []).map((each) => [each.name, each.type]));
  const retyped = (attributes: Attributes | undefined, types: Map<string, string>) => {
    if (attributes === undefined || types.size === 0) return attributes;
    return Object.fromEntries<JsonValue>(
      Object.entries(attributes).map(([name, value]) => [name, typed(value, types.get(name))]),
    );
  };
  return {
    ...plan,
    elements: plan.elements.map((element) => {
      const component =
        element.existing === undefined
          ? own(mapping.elements, element.kind)
          : components.get(element.existing);
      const types = typesOf(
        component === undefined ? undefined : definitions.component(component)?.attributes,
      );
      const attributes = retyped(element.attributes, types);
      return attributes === element.attributes
        ? element
        : { ...element, ...(attributes ? { attributes } : {}) };
    }),
    relations: plan.relations.map((relation) => {
      const type = own(mapping.relations, relation.kind);
      const types = typesOf(
        type === undefined ? undefined : definitions.relationType(type)?.attributes,
      );
      const attributes = retyped(relation.attributes, types);
      return attributes === relation.attributes
        ? relation
        : { ...relation, ...(attributes ? { attributes } : {}) };
    }),
  };
}

/** Whether attribute values from a file differ from what something of the project holds. */
function changesAttributes(
  current: Element | Relation,
  attributes: Attributes | undefined,
): boolean {
  return Object.entries(attributes ?? {}).some(
    ([name, value]) =>
      JSON.stringify(own(current.attributes ?? {}, name) ?? null) !== JSON.stringify(value),
  );
}

/**
 * A plan in which the relations the project already has between the elements an import matched, of
 * the relation type they are mapped to, are matched to them: importing again never repeats them. A
 * relation whose name, description or attribute values change updates the project's relation; one
 * that changes nothing is left out and reported.
 */
function repeatedRelationsMatched(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping,
): ImportPlan {
  const matched = new Map(
    plan.elements
      .filter((element) => element.existing !== undefined)
      .map((element) => [element.key, element.existing as Id]),
  );
  if (matched.size === 0) return plan;
  const present = new Map<string, Relation>();
  for (const relation of state.model.relations) {
    const key = JSON.stringify([relation.relationType, relation.from, relation.to]);
    if (!present.has(key)) present.set(key, relation);
  }
  const names = new Map(state.model.elements.map((element) => [element.id, element.name]));
  const unmatched = [...plan.unmatched];
  let changed = false;
  const relations: PlannedRelation[] = plan.relations.flatMap((relation) => {
    const from = matched.get(relation.from);
    const to = matched.get(relation.to);
    const type = own(mapping.relations, relation.kind);
    if (from === undefined || to === undefined || type === undefined) return [relation];
    const current = present.get(JSON.stringify([type, from, to]));
    if (current === undefined) return [relation];
    changed = true;
    const changes =
      (relation.name !== undefined && relation.name !== current.name) ||
      (relation.description !== undefined && relation.description !== current.description) ||
      changesAttributes(current, relation.attributes);
    if (changes) return [{ ...relation, existing: current.id }];
    unmatched.push({
      text: quote(relation.name ?? `${names.get(from) ?? from} → ${names.get(to) ?? to}`),
      why: 'The project already has this relation, so it is not created again.',
    });
    return [];
  });
  return changed ? { ...plan, relations, unmatched } : plan;
}
