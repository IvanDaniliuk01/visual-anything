/**
 * The draft a command is worked out on: it applies operations one at a time, so each check sees the
 * changes made before it, and it collects what the command produces.
 */
import type {
  Attributes,
  Element,
  Id,
  PackageFile,
  Relation,
  ScenarioFile,
  ViewFile,
} from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import { anchorTargetOf } from '../comments/anchors';
import type { Author } from '../history';
import type { Definitions, ResolvedComponent, ResolvedRelationType } from '../definitions';
import { definitionIdFor, freshId, isId, type IdGenerator } from '../ids';
import { imagesIn } from '../images/catalog';
import type { ModelIndex } from '../model-index';
import { applyOperation, type Operation } from '../operations';
import { problem, type Problem, type ProblemCode } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';

/** Ends a command that breaks a rule. Nothing it did is kept. */
export class Rejection extends Error {
  override name = 'Rejection';
  constructor(readonly problems: Problem[]) {
    super(problems.map((each) => each.message).join(' '));
  }
}

/** Rejects the command with one problem. */
export function reject(code: ProblemCode, message: string, subjects?: readonly Id[]): never {
  throw new Rejection([problem(code, message, subjects)]);
}

/** Who runs a command and when, for what records them: a comment's author and time (ADR 0059). */
export interface DraftContext {
  /**
   * Who sends the command. Nothing assumes one: a command that signs something, such as a comment,
   * is refused without it, so that no caller that forgets it signs Claude's words as the person's.
   */
  author?: Author;
  /** The time now, in milliseconds since 1970; the computer's clock by default. */
  now?: () => number;
}

export class Draft {
  state: ProjectSnapshot;
  readonly operations: Operation[] = [];
  readonly warnings: Problem[] = [];
  readonly created: Id[] = [];
  private readonly inverses: Operation[] = [];

  constructor(
    state: ProjectSnapshot,
    private readonly generate: IdGenerator,
    private readonly context: DraftContext = {},
  ) {
    this.state = state;
  }

  /** Who sends the command: the person, or Claude; undefined when the caller did not say. */
  get author(): Author | undefined {
    return this.context.author;
  }

  /** The time now, in milliseconds since 1970. */
  now(): number {
    return (this.context.now ?? Date.now)();
  }

  /** Applies an operation to the draft. */
  apply(operation: Operation): void {
    const result = applyOperation(this.state, operation);
    this.state = result.state;
    this.operations.push(operation);
    this.inverses.push(result.inverse);
  }

  /** The operations that undo everything applied so far, in the order to apply them. */
  inverse(): Operation[] {
    return [...this.inverses].reverse();
  }

  get definitions(): Definitions {
    return definitionsIn(this.state);
  }

  get index(): ModelIndex {
    return modelIndexOf(this.state);
  }

  /** A new id made from a readable base, unused by anything in the project. */
  newId(base: string, alsoTaken: (id: Id) => boolean = () => false): Id {
    return freshId(this.generate, base, (id) => this.isTaken(id) || alsoTaken(id));
  }

  /**
   * A new id for a definition or an image of a package, made from its name, unused by anything in the
   * project; `fallback` names it when its name gives no base.
   */
  newDefinitionId(packageId: Id, name: string, fallback?: string): Id {
    return definitionIdFor(packageId, name, this.generate, (id) => this.isTaken(id), fallback);
  }

  /**
   * Whether an element, relation, view, scenario, package or definition already has this id, or a step
   * or a view's route still names it: a broken step's relation id is never given to something new, so
   * that the step never comes to mean it, and neither is a route's, so that no new relation takes over
   * a route left for one that is gone. A thread's id is taken, and so is what it is about, so that a
   * detached thread never comes to be about something new (ADR 0059).
   */
  isTaken(id: Id): boolean {
    const { state } = this;
    return (
      this.index.has(id) ||
      state.comments.some((thread) => thread.id === id || anchorTargetOf(thread.anchor) === id) ||
      state.views.some(
        (view) => view.id === id || (view.routes !== undefined && Object.hasOwn(view.routes, id)),
      ) ||
      state.scenarios.some(
        (scenario) =>
          scenario.id === id || scenario.steps.some((step) => step.relations.includes(id)),
      ) ||
      state.packages.some((file) => file.id === id) ||
      this.definitions.components.has(id) ||
      this.definitions.relationTypes.has(id) ||
      imagesIn(state).images.has(id) ||
      id === ESSENCE_ID ||
      id === RELATES_TO_ID
    );
  }

  /** The id to give something new: the one asked for, checked, or a generated one. */
  idFor(asked: Id | undefined, base: string, alsoTaken: (id: Id) => boolean = () => false): Id {
    if (asked === undefined) return this.newId(base, alsoTaken);
    if (!isId(asked)) {
      reject('invalid-id', `"${String(asked)}" is not a valid id.`);
    }
    if (this.isTaken(asked) || alsoTaken(asked)) {
      reject('id-taken', `The id "${asked}" is already taken.`, [asked]);
    }
    return asked;
  }

  element(id: Id): Element {
    const element = this.index.element(id);
    if (!element) reject('unknown-element', `There is no element "${String(id)}".`, [id]);
    return element;
  }

  relation(id: Id): Relation {
    const relation = this.index.relation(id);
    if (!relation) reject('unknown-relation', `There is no relation "${String(id)}".`, [id]);
    return relation;
  }

  /** An element or relation a relation can end on. */
  end(id: Id): Element | Relation {
    const end = this.index.element(id) ?? this.index.relation(id);
    if (!end) {
      reject('unknown-end', `There is no element or relation "${String(id)}" to end on.`, [id]);
    }
    return end;
  }

  component(id: Id): ResolvedComponent {
    const component = this.definitions.component(id);
    if (!component) {
      reject('unknown-component', `No package in use defines the component "${String(id)}".`, [id]);
    }
    return component;
  }

  relationType(id: Id): ResolvedRelationType {
    const relationType = this.definitions.relationType(id);
    if (!relationType) {
      reject(
        'unknown-relation-type',
        `No package in use defines the relation type "${String(id)}".`,
        [id],
      );
    }
    return relationType;
  }

  view(id: Id): ViewFile {
    const view = this.state.views.find((each) => each.id === id);
    if (!view) reject('unknown-view', `There is no view "${String(id)}".`, [id]);
    return view;
  }

  scenario(id: Id): ScenarioFile {
    const scenario = this.state.scenarios.find((each) => each.id === id);
    if (!scenario) reject('unknown-scenario', `There is no scenario "${String(id)}".`, [id]);
    return scenario;
  }

  /** One of the project's own packages, which commands may change; built-in packages may not. */
  ownPackage(id: Id): PackageFile {
    if (builtinPackage(id)) {
      reject('built-in-package', `The package "${id}" is built in and cannot be changed.`, [id]);
    }
    const file = this.state.packages.find((each) => each.id === id);
    if (!file) reject('unknown-package', `The project uses no package "${String(id)}".`, [id]);
    return file;
  }
}

/** Checks that a name has something in it. */
export function requireName(name: unknown, what: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    reject('empty-name', `${what} needs a name.`);
  }
  return name;
}

/** Checks that a value is a list. */
export function requireList<T>(value: readonly T[] | undefined, what: string): readonly T[] {
  if (value === undefined) return [];
  if (!isList(value)) reject('invalid-command', `${what} must be a list.`);
  return value;
}

/** Whether a value is a list, without narrowing its type, so that a checked list keeps its own. */
function isList(value: unknown): boolean {
  return Array.isArray(value);
}

/**
 * How far from its origin a coordinate may be, either way, and how large a size may be, in canvas
 * units, as the file format says: past it, a number in single precision no longer holds whole units.
 */
export const MAX_COORDINATE = 10_000_000;

/** Checks that a coordinate or size is a finite number within the canvas, and a size positive. */
export function requireNumber(value: unknown, what: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) {
    reject('invalid-command', `${what} must be a ${positive ? 'positive ' : ''}number.`);
  }
  if (Math.abs(value) > MAX_COORDINATE) {
    reject(
      'invalid-command',
      positive
        ? `${what} must be at most 10,000,000.`
        : `${what} must be from -10,000,000 to 10,000,000.`,
    );
  }
  return value;
}

/** An object without the properties whose value is `undefined`. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, each]) => each !== undefined)) as T;
}

/**
 * Attribute values after a change: `set` values added or replaced, `remove` names taken out.
 * `undefined` when none is left. Built with `Object.fromEntries`, so no name reaches a prototype.
 */
export function changedAttributes(
  current: Attributes | undefined,
  set: Attributes | undefined,
  remove: readonly string[] | undefined,
): Attributes | undefined {
  const removed = new Set(remove ?? []);
  for (const name of Object.keys(set ?? {})) {
    if (name === '') reject('invalid-command', 'An attribute needs a name.');
  }
  const entries = [...Object.entries(current ?? {}), ...Object.entries(set ?? {})].filter(
    ([name]) => !removed.has(name),
  );
  const merged: Attributes = Object.fromEntries(entries);
  return Object.keys(merged).length === 0 ? undefined : merged;
}

/** Whether two JSON values are the same, whatever the order of their keys. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((each, at) => sameJson(each, b[at]))
    );
  }
  const left = Object.entries(a).filter(([, value]) => value !== undefined);
  const right = b as Record<string, unknown>;
  return (
    left.length === Object.values(right).filter((value) => value !== undefined).length &&
    left.every(([key, value]) => Object.hasOwn(right, key) && sameJson(value, right[key]))
  );
}

/** A name to show in labels: an element's name, or a relation's name or id. */
export function nameOf(index: ModelIndex, id: Id): string {
  return index.element(id)?.name ?? index.relation(id)?.name ?? id;
}

/** Counts things in words: "1 element", "3 relations". */
export function count(amount: number, singular: string, plural = `${singular}s`): string {
  return `${amount} ${amount === 1 ? singular : plural}`;
}
