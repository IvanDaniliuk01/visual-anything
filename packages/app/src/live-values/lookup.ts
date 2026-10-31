/**
 * The app's attribute lookup (ADR 0057, ADR 0063, ADR 0085): how every attribute of an element or a
 * relation reads in this tab, a simulated value over a live one, a live value over a computed one, a computed one over the stored one, the stored
 * one over its definition's default, each with where it comes from. The inspector, the detail on the
 * canvas, overlays, the element list and filters all read attributes through it, so that each shows
 * the same value with the same mark.
 *
 * One lookup stands for one moment: a new one is made when the live values or what package code
 * computed change, so that its identity says when to read again.
 */
import {
  readAttribute,
  type AttributeReading,
  type ComputedReading,
  type Definitions,
  type LiveValue,
} from '@visual-anything/core';
import type { Element, Id, JsonValue, Relation } from '@visual-anything/schema';
import type { ElementAnswers } from '../code/messages';
import { NO_LIVE_VALUES, type LiveView } from './book';

/** Something whose attributes are read: an element or a relation of the model. */
export type Attributed =
  { kind: 'element'; element: Element } | { kind: 'relation'; relation: Relation };

const NO_COMPUTED: ReadonlyMap<Id, ElementAnswers> = new Map();
const NO_SIMULATED: ReadonlyMap<Id, ReadonlyMap<string, ComputedReading>> = new Map();
const NOTHING_CHANGED: ReadonlySet<Id> = new Set();

export class AttributeLookup {
  private readonly computedByTarget = new Map<Id, ReadonlyMap<string, ComputedReading>>();

  constructor(
    /** The live values at this moment. */
    readonly live: LiveView = NO_LIVE_VALUES,
    /** What package code answered for each element at this moment. */
    readonly computed: ReadonlyMap<Id, ElementAnswers> = NO_COMPUTED,
    /**
     * What the simulation runs shown answered at their ticks shown, by element and value (ADR 0085):
     * each map the same object while its tick shown does not change.
     */
    readonly simulated: ReadonlyMap<Id, ReadonlyMap<string, ComputedReading>> = NO_SIMULATED,
  ) {}

  /** When this moment is, for the ages of live values. */
  get now(): number {
    return this.live.now;
  }

  /**
   * The targets that may read otherwise here than through `before`: those whose live values the
   * live values book says changed since, and those package code answered otherwise for. Undefined
   * when it cannot tell, and what reads them must read everything again.
   */
  changedSince(before: AttributeLookup): ReadonlySet<Id> | undefined {
    if (before === this) return NOTHING_CHANGED;
    const live =
      before.live === this.live ? NOTHING_CHANGED : this.live.changedSince?.(before.live);
    if (live === undefined) return undefined;
    if (before.computed === this.computed && before.simulated === this.simulated) return live;
    const changed = new Set(live);
    for (const [target, values] of this.simulated) {
      if (before.simulated.get(target) !== values) changed.add(target);
    }
    for (const target of before.simulated.keys()) {
      if (!this.simulated.has(target)) changed.add(target);
    }
    if (before.computed === this.computed) return changed;
    for (const [target, answers] of this.computed) {
      if (before.computed.get(target) !== answers) changed.add(target);
    }
    for (const target of before.computed.keys()) {
      if (!this.computed.has(target)) changed.add(target);
    }
    return changed;
  }

  /** Whether a target has a value from outside the model: simulated, live or computed. */
  overrides(target: Id): boolean {
    return (
      (this.simulated.get(target)?.size ?? 0) > 0 ||
      this.live.of(target) !== undefined ||
      (this.computed.get(target)?.attributes.length ?? 0) > 0
    );
  }

  /** What the simulation run shown for an element answered at its tick shown, by value. */
  simulatedOf(target: Id): ReadonlyMap<string, ComputedReading> | undefined {
    return this.simulated.get(target);
  }

  /** The live values of a target, by attribute: the same map while they do not change. */
  liveOf(target: Id): ReadonlyMap<string, LiveValue> | undefined {
    return this.live.of(target);
  }

  /** What package code answered for a target: the same object while it does not answer anew. */
  answersOf(target: Id): ElementAnswers | undefined {
    return this.computed.get(target);
  }

  /** What package code computed for a target, by attribute, the nearest package's first. */
  computedOf(target: Id): ReadonlyMap<string, ComputedReading> | undefined {
    const answers = this.computed.get(target);
    if (answers === undefined || answers.attributes.length === 0) return undefined;
    let byName = this.computedByTarget.get(target);
    if (byName === undefined) {
      const made = new Map<string, ComputedReading>();
      for (const each of answers.attributes) {
        if (!made.has(each.name)) made.set(each.name, { value: each.value, package: each.package });
      }
      byName = made;
      this.computedByTarget.set(target, byName);
    }
    return byName;
  }

  /** How one attribute of an element or a relation reads; undefined when it has no value at all. */
  read(item: Attributed, name: string, definitions: Definitions): AttributeReading | undefined {
    const id = item.kind === 'element' ? item.element.id : item.relation.id;
    return readAttribute(
      {
        own: item.kind === 'element' ? item.element.attributes : item.relation.attributes,
        defaultOf: (attribute) => defaultOf(item, attribute, definitions),
        computed: this.computedOf(id),
        live: this.liveOf(id),
        // A simulated value reads in place of an attribute the element has, and of no other name.
        ...(item.kind === 'element' && hasAttribute(item.element, name, definitions)
          ? { simulated: this.simulatedOf(id) }
          : {}),
      },
      name,
    );
  }

  /** The value one attribute reads as; undefined when it has none. */
  value(item: Attributed, name: string, definitions: Definitions): JsonValue | undefined {
    return this.read(item, name, definitions)?.value;
  }

  /** The names of a target's attributes that only live values or package code give, in order. */
  extraNames(target: Id): string[] {
    const names = new Set<string>();
    for (const name of this.computedOf(target)?.keys() ?? []) names.add(name);
    for (const name of this.liveOf(target)?.keys() ?? []) names.add(name);
    return [...names];
  }
}

/** The lookup with nothing over the model: every attribute reads as stored, or as its default. */
export const STORED_ONLY = new AttributeLookup();

/** Whether an element has an attribute: its own value, or one its component defines. */
function hasAttribute(element: Element, name: string, definitions: Definitions): boolean {
  if (element.attributes !== undefined && Object.hasOwn(element.attributes, name)) return true;
  return (
    definitions.component(element.component)?.attributes.some((each) => each.name === name) ?? false
  );
}

/** The default an element's component, or a relation's relation type, gives an attribute. */
export function defaultOf(
  item: Attributed,
  name: string,
  definitions: Definitions,
): JsonValue | undefined {
  const attributes =
    item.kind === 'element'
      ? definitions.component(item.element.component)?.attributes
      : definitions.relationType(item.relation.relationType)?.attributes;
  return attributes?.find((each) => each.name === name)?.default;
}
