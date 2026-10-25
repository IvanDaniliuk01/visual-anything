/**
 * How readers build a plan: elements by key in the order they first appear, relations, what sits
 * inside what with one container each and never a cycle, the kinds counted as they end up, names and
 * descriptions cut to their limits, and a report of what matched nothing that stays short. Past an
 * import's limits it stops reading at once (ADR-0042), so that no file makes a plan larger than one
 * an import could bring.
 */
import type { Attributes, Id } from '@visual-anything/schema';
import {
  IMPORT_LIMITS,
  type ImportPlan,
  type PlannedElement,
  type PlannedKind,
  type PlannedRelation,
  type PlannedView,
} from './plan';
import { MAX_UNMATCHED, safeKind } from './reading';
import {
  MAX_IMPORTED_DESCRIPTION,
  MAX_IMPORTED_NAME,
  importedDescription,
  importedName,
  quote,
} from './text';

/** The most things matched nothing a plan lists one by one. */
export { MAX_UNMATCHED };

/** The deepest that imported containment goes, counted from the outermost container. */
export const MAX_IMPORTED_DEPTH = 64;

/** Raised when a file holds more than an import brings; its message says so. */
export class PastLimits extends Error {
  override name = 'PastLimits';
}

/** How a kind shows in the mapping dialog, and what it suggests. */
export interface KindInfo {
  label: string;
  suggested?: Id;
}

const count = (amount: number) => amount.toLocaleString('en');

/** A plan in the making. */
export class PlanBuilder {
  readonly #format: string;
  readonly #source: string;
  readonly #elements = new Map<string, PlannedElement>();
  readonly #relations: PlannedRelation[] = [];
  readonly #containers = new Map<string, string>();
  readonly #kinds = {
    elements: new Map<string, KindInfo>(),
    relations: new Map<string, KindInfo>(),
  };
  readonly #unmatched: { text: string; why: string }[] = [];
  #unlisted = 0;

  constructor(format: string, source: string) {
    this.#format = format;
    this.#source = source;
  }

  /** The element with this key, when the plan holds one. */
  element(key: string): PlannedElement | undefined {
    return this.#elements.get(key);
  }

  get elementCount(): number {
    return this.#elements.size;
  }

  /** Every element so far, in the order they first appeared. */
  elements(): PlannedElement[] {
    return [...this.#elements.values()];
  }

  /**
   * Adds an element of a kind, or gives back the one with its key already. Stops reading when the
   * plan would hold more elements than an import brings.
   */
  add(element: PlannedElement, kind: KindInfo): PlannedElement {
    const known = this.#elements.get(element.key);
    if (known !== undefined) return known;
    if (this.#elements.size >= IMPORT_LIMITS.elements) {
      throw new PastLimits(
        `The file holds more than ${count(IMPORT_LIMITS.elements)} elements; an import brings at most ${count(IMPORT_LIMITS.elements)}.`,
      );
    }
    // A kind named like what every object inherits is quoted, as every reader quotes it.
    element.kind = safeKind(element.kind);
    this.#elements.set(element.key, element);
    this.kind('elements', element.kind, kind);
    return element;
  }

  /** Gives an element another kind, as a class given later does. */
  setKind(element: PlannedElement, kind: string, info: KindInfo): void {
    element.kind = safeKind(kind);
    this.kind('elements', element.kind, info);
  }

  /** Registers how a kind shows; the first registration of a kind stays. */
  kind(of: 'elements' | 'relations', kind: string, info: KindInfo): void {
    const key = safeKind(kind);
    if (!this.#kinds[of].has(key)) this.#kinds[of].set(key, info);
  }

  /** Adds a relation between two keys, which gets a key of its own. */
  relate(relation: Omit<PlannedRelation, 'key'>, kind: KindInfo): PlannedRelation {
    this.#checkRelations();
    const planned: PlannedRelation = {
      key: `relation ${this.#relations.length + 1}`,
      ...relation,
      kind: safeKind(relation.kind),
    };
    this.#relations.push(planned);
    this.kind('relations', planned.kind, kind);
    return planned;
  }

  /**
   * Puts an element inside a container, unless it already sits inside one, it is the container, it
   * would come to sit inside itself, or it would sit too deep; the last two are reported.
   */
  contain(element: string, container: string): void {
    if (element === container || this.#containers.has(element)) return;
    let depth = 1;
    for (let at: string | undefined = container; at !== undefined; at = this.#containers.get(at)) {
      if (at === element) {
        this.report(
          element,
          `It would sit inside "${quote(container)}", which sits inside it, so it stays where it was.`,
        );
        return;
      }
      depth += 1;
      if (depth > MAX_IMPORTED_DEPTH) {
        this.report(
          element,
          `It would sit more than ${MAX_IMPORTED_DEPTH} containers deep, so it stays where it was.`,
        );
        return;
      }
    }
    this.#checkRelations();
    this.#containers.set(element, container);
  }

  /** The container an element sits inside, when it sits in one. */
  containerOf(element: string): string | undefined {
    return this.#containers.get(element);
  }

  /** Records something that matched nothing, quoted as the file writes it, with why. */
  report(text: string, why: string): void {
    if (this.#unmatched.length >= MAX_UNMATCHED) {
      this.#unlisted += 1;
      return;
    }
    this.#unmatched.push({ text: quote(text), why });
  }

  /** A name for something imported, cut to its limit, which is reported; `fallback` when it is empty. */
  name(text: string, fallback: string): string {
    const { text: name, cut } = importedName(text);
    if (cut) {
      this.report(
        name,
        `The name is over ${count(MAX_IMPORTED_NAME)} characters; it is cut there.`,
      );
    }
    return name === '' ? importedName(fallback).text || '?' : name;
  }

  /** A description, cut to its limit, which is reported; absent when it is empty. */
  description(text: string | undefined): string | undefined {
    if (text === undefined) return undefined;
    const { text: description, cut } = importedDescription(text);
    if (cut) {
      this.report(
        description,
        `The description is longer than ${count(MAX_IMPORTED_DESCRIPTION)} characters, so it is cut.`,
      );
    }
    return description === '' ? undefined : description;
  }

  /** The plan: kinds counted as the elements and relations ended up, in the order they appeared. */
  build(views: PlannedView[] = []): ImportPlan {
    const elements = [...this.#elements.values()];
    const unmatched = [...this.#unmatched];
    // Said as the other readers say it (reading.ts).
    if (this.#unlisted > 0) {
      unmatched.push({
        text: `${count(this.#unlisted)} more`,
        why:
          this.#unlisted === 1
            ? 'One more thing matched nothing; the list stops here.'
            : `${count(this.#unlisted)} more things matched nothing; the list stops here.`,
      });
    }
    return {
      format: this.#format,
      source: this.#source,
      elements,
      relations: [...this.#relations],
      containment: [...this.#containers].map(([element, container]) => ({ element, container })),
      views,
      kinds: {
        // What matched an element of the project is not created, so no kind counts it.
        elements: counted(
          this.#kinds.elements,
          elements.filter((element) => element.existing === undefined),
        ),
        relations: counted(this.#kinds.relations, this.#relations),
      },
      unmatched,
    };
  }

  #checkRelations(): void {
    if (this.#relations.length + this.#containers.size >= IMPORT_LIMITS.relations) {
      throw new PastLimits(
        `The file holds more than ${count(IMPORT_LIMITS.relations)} relations, those that put one thing inside another included; an import brings at most ${count(IMPORT_LIMITS.relations)}.`,
      );
    }
  }
}

/** The kinds things use, in the order each kind was first registered, with how many use each. */
function counted(known: ReadonlyMap<string, KindInfo>, things: readonly { kind: string }[]) {
  const counts = new Map<string, number>();
  for (const thing of things) counts.set(thing.kind, (counts.get(thing.kind) ?? 0) + 1);
  const kinds: PlannedKind[] = [];
  for (const [kind, info] of known) {
    const amount = counts.get(kind);
    if (amount === undefined) continue;
    kinds.push({
      kind,
      label: info.label,
      count: amount,
      ...(info.suggested === undefined ? {} : { suggested: info.suggested }),
    });
  }
  return kinds;
}

/** Attributes without the keys whose value is undefined, or undefined when none is left. */
export function attributesOf(
  values: Record<string, Attributes[string] | undefined>,
): Attributes | undefined {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined) as [
    string,
    Attributes[string],
  ][];
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
