/**
 * Proposals (ADR 0073): Claude's changes waiting for the person's review, on top of the project as it
 * is now. Claude's commands run on the proposed project, never on the project now; the person's
 * actions change the project now, and the proposal is rebased on it with the item merge (ADR 0072),
 * Claude's value winning; the person accepts the changes the comparison of the two projects lists
 * (ADR 0070), all or some, as one action of Claude's, or refuses them.
 *
 * Nothing here reaches a file or the history: the local program keeps the proposal in memory, and
 * records only the action an acceptance makes.
 */
import type {
  FileContentByKind,
  FileKind,
  Id,
  JsonValue,
  PackageFile,
  ProjectFile,
  Relation,
  ViewFile,
} from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import {
  executeCommand,
  executeOperations,
  type Command,
  type CommandContext,
  type CommandOutcome,
} from '../commands';
import { HISTORY_LIMIT, HISTORY_WEIGHT_LIMIT, actionWeight } from '../history';
import { randomIds } from '../ids';
import { positionKey, type Operation } from '../operations';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { compareProjects, type Change, type Comparison } from './compare';
import { itemKey, isOwnPackage, projectItems, sameValue, type ItemRef } from './items';
import { mergeFile } from './merge';
import { operationsBetween } from './operations-between';

/** Claude's changes, waiting for the person's review. */
export interface Proposal {
  /** Names it while the local program runs. */
  id: Id;
  /** The project as it was when the proposal opened, which tells what the person changed since. */
  opened: ProjectSnapshot;
  /** The project as it is now, which the proposal sits on. */
  base: ProjectSnapshot;
  /** The project now with every change of Claude's. */
  proposed: ProjectSnapshot;
  /** The labels of Claude's commands that joined it, oldest first. */
  labels: string[];
  /** The ids its commands made, which accepting keeps. */
  created: Id[];
  /** What its commands' operations and inverses weigh, as the history weighs an action's. */
  weight: number;
}

/** How many commands one proposal holds, as many actions as the history keeps. */
export const PROPOSAL_LIMIT = HISTORY_LIMIT;

/** What a command proposed made: the proposal it joined, or why it was refused. */
export type ProposeOutcome =
  | {
      ok: true;
      /** The proposal now; absent when no proposal was open and the command changed nothing. */
      proposal: Proposal | undefined;
      label: string;
      warnings: Problem[];
      /** The ids the command made in the proposed project. */
      created: Id[];
      /** What the command changed in the proposed project. */
      operations: Operation[];
    }
  | { ok: false; problems: Problem[] };

/** The commands that never join a proposal: comments, which are Claude's own words, and resolving. */
const NEVER_PROPOSED: ReadonlySet<Command['type']> = new Set([
  'create-thread',
  'add-comment',
  'edit-comment',
  'resolve-thread',
  'delete-thread',
  'resolve-conflicts',
]);

/**
 * Runs a command of Claude's on the proposed project: the proposal's, or the project now for the
 * first one, which opens it. The project now is never changed. A proposal that does not sit on
 * `project` is rebased on it first.
 */
export function propose(
  proposal: Proposal | undefined,
  project: ProjectSnapshot,
  command: Command,
  context: CommandContext = {},
): ProposeOutcome {
  const never = neverProposed(command);
  if (never !== undefined) return { ok: false, problems: [never] };
  const open = proposal === undefined ? undefined : rebaseProposal(proposal, project);
  if (open !== undefined && open.labels.length >= PROPOSAL_LIMIT) {
    return { ok: false, problems: [full(`holds ${PROPOSAL_LIMIT} changes, as many as one holds`)] };
  }
  const outcome = executeCommand(open?.proposed ?? project, command, {
    ...context,
    author: 'claude',
  });
  if (!outcome.ok) return outcome;
  const { label, warnings, created, operations, inverse } = outcome;
  const done = { ok: true as const, label, warnings, created, operations };
  const before = open?.proposed ?? project;
  if (operations.length === 0 || sameValue(outcome.state, before))
    return { ...done, proposal: open };
  const weight =
    (open?.weight ?? 0) + actionWeight({ label, author: 'claude', operations, inverse });
  if (weight > HISTORY_WEIGHT_LIMIT) {
    return { ok: false, problems: [full('would hold more than one can')] };
  }
  const next: Proposal = {
    id: open?.id ?? (context.newId ?? randomIds())('proposal'),
    opened: open?.opened ?? project,
    base: project,
    proposed: outcome.state,
    labels: [...(open?.labels ?? []), label],
    created: [...(open?.created ?? []), ...created],
    weight,
  };
  return { ...done, proposal: next };
}

function full(why: string): Problem {
  return problem(
    'proposal-full',
    `The proposal ${why}: ask the person to review the changes it holds first.`,
  );
}

/** Why a command never joins a proposal, or undefined when it may. */
function neverProposed(command: Command): Problem | undefined {
  if (typeof command !== 'object' || command === null) return undefined;
  if (command.type === 'batch' && Array.isArray(command.commands)) {
    for (const each of command.commands) {
      const found = neverProposed(each);
      if (found) return found;
    }
    return undefined;
  }
  if (!NEVER_PROPOSED.has(command.type)) return undefined;
  return command.type === 'resolve-conflicts'
    ? problem(
        'invalid-command',
        'Conflicts are never resolved in a proposal: they are resolved in the project now, with the review of Claude’s changes off.',
      )
    : problem(
        'invalid-command',
        'A comment never joins a proposal: it is added to the project now, signed as Claude.',
      );
}

// ——— Rebasing ———

/**
 * The proposal on the project as it is now, after the person, another tab or a reload changed it:
 * each file the change reached, or every file when `operations` are not given, merged by id with
 * Claude's value winning, removals included (ADR 0072). What a change of Claude's needs that the
 * person removed comes back. Files the change did not reach keep Claude's version.
 */
export function rebaseProposal(
  proposal: Proposal,
  project: ProjectSnapshot,
  operations?: readonly Operation[],
): Proposal {
  if (project === proposal.base) return proposal;
  const reached = operations === undefined ? 'all' : filesReached(operations);
  const { base, proposed } = proposal;
  // The relation types that nest in the rebased project, which the model's merge reads once the
  // packages are merged.
  let nesting: ReadonlySet<Id> = new Set<Id>();
  const reaches = (key: string) =>
    reached === 'all' || reached.has(key) || reached.has(kindOf(key));

  // One file: the person's and Claude's edits of it merged, or whichever side has it.
  const merged = <K extends FileKind>(
    kind: K,
    was: FileContentByKind[K] | undefined,
    person: FileContentByKind[K] | undefined,
    claude: FileContentByKind[K] | undefined,
  ): FileContentByKind[K] | undefined => {
    if (person === undefined && claude === undefined) return undefined;
    if (claude === undefined) {
      // Claude removed it: the removal stays, unless Claude never had it.
      return was === undefined ? person : undefined;
    }
    if (person === undefined) {
      // The person removed it: Claude's stays where Claude changed it, or added it.
      return was !== undefined && sameValue(was, claude) ? undefined : claude;
    }
    // A file only one side changed is that side's.
    if (was !== undefined && sameValue(was, person)) return claude;
    if (was !== undefined && sameValue(was, claude)) return person;
    if (was === undefined && person === claude) return claude;
    const result = mergeFile(kind, was, person, claude, {
      kept: 'theirs',
      keptWins: true,
      nesting,
    });
    return withoutConflicts(result.file, new Set(result.conflicts.map((each) => each.id)));
  };

  const projectFile = reaches('project')
    ? (merged('project', base.project, project.project, proposed.project) as ProjectFile)
    : proposed.project;
  const files = <T extends { id: Id }, K extends FileKind>(
    kind: K,
    prefix: string,
    older: readonly T[],
    person: readonly T[],
    claude: readonly T[],
    own: (id: Id) => boolean = () => true,
  ): T[] => {
    const was = new Map(older.map((each) => [each.id, each]));
    const theirs = new Map(claude.map((each) => [each.id, each]));
    const mine = new Map(person.map((each) => [each.id, each]));
    const ids = ordered(
      claude.map((each) => each.id),
      person.map((each) => each.id),
    );
    const result: T[] = [];
    for (const id of ids) {
      if (!own(id)) {
        const file = theirs.get(id) ?? mine.get(id);
        if (file) result.push(file);
        continue;
      }
      const file = reaches(`${prefix}:${id}`)
        ? merged(
            kind,
            was.get(id) as FileContentByKind[K] | undefined,
            mine.get(id) as FileContentByKind[K] | undefined,
            theirs.get(id) as FileContentByKind[K] | undefined,
          )
        : (theirs.get(id) as FileContentByKind[K] | undefined);
      if (file !== undefined) result.push(file as unknown as T);
    }
    return result;
  };
  const listed = new Set(projectFile.packages);
  const packages = files(
    'package',
    'package',
    base.packages,
    project.packages,
    proposed.packages,
    isOwnPackage,
  ).filter((each) => isOwnPackage(each.id) || listed.has(each.id));
  // A built-in package the project lists comes with it, from either side.
  for (const id of projectFile.packages) {
    const builtin = builtinPackage(id);
    if (builtin && !packages.some((each) => each.id === id)) packages.push(builtin);
  }
  nesting = definitionsIn({ ...proposed, project: projectFile, packages }).nestingRelationTypes;
  const model = reaches('model')
    ? (merged('model', base.model, project.model, proposed.model) ?? proposed.model)
    : proposed.model;
  return {
    ...proposal,
    base: project,
    proposed: {
      project: projectFile,
      model,
      packages,
      views: files('view', 'view', base.views, project.views, proposed.views),
      scenarios: files(
        'scenario',
        'scenario',
        base.scenarios,
        project.scenarios,
        proposed.scenarios,
      ),
      tours: files('tour', 'tour', base.tours, project.tours, proposed.tours),
      comments: files('comment', 'comment', base.comments, project.comments, proposed.comments),
    },
  };
}

/** The files operations reach, by key, or the kind of file whose every file a list's whole change reaches. */
function filesReached(operations: readonly Operation[]): Set<string> {
  const keys = new Set<string>();
  for (const operation of operations) {
    switch (operation.op) {
      case 'set-world':
        keys.add('model');
        break;
      case 'set-project':
        keys.add('project');
        break;
      case 'set-view':
        keys.add(`view:${operation.view}`);
        break;
      case 'set-package':
        keys.add(`package:${operation.package}`);
        break;
      case 'set-conflicts': {
        const { file } = operation;
        keys.add(
          file.kind === 'project' || file.kind === 'model' ? file.kind : `${file.kind}:${file.id}`,
        );
        break;
      }
      default: {
        const { collection } = operation;
        const one = (prefix: string) => {
          if (operation.op === 'replace-all') keys.add(prefix);
          else
            keys.add(
              `${prefix}:${operation.op === 'remove' ? operation.key : keyOfItem(operation.item)}`,
            );
        };
        switch (collection.name) {
          case 'elements':
          case 'relations':
            keys.add('model');
            break;
          case 'packages':
            one('package');
            // The packages a project uses come with its list.
            keys.add('project');
            break;
          case 'components':
          case 'relationTypes':
          case 'images':
            keys.add(`package:${collection.package}`);
            break;
          case 'views':
            one('view');
            break;
          case 'positions':
          case 'freeShapes':
          case 'stackingOrder':
          case 'routes':
            keys.add(`view:${collection.view}`);
            break;
          case 'scenarios':
            one('scenario');
            break;
          case 'tours':
            one('tour');
            break;
          case 'comments':
            one('comment');
            break;
        }
      }
    }
  }
  return keys;
}

function keyOfItem(item: unknown): string {
  return (item as { id: Id }).id;
}

/** The kind of a file's key, which a whole list's change reaches with every file of it. */
function kindOf(key: string): string {
  const at = key.indexOf(':');
  return at < 0 ? key : key.slice(0, at);
}

/** A merged file without the conflicts this merge made, which a proposal never keeps. */
function withoutConflicts<T>(file: T, made: ReadonlySet<Id>): T {
  const held = (file as { conflicts?: { id: Id }[] }).conflicts;
  if (held === undefined || made.size === 0) return file;
  const left = held.filter((each) => !made.has(each.id));
  const copy = { ...file } as T & { conflicts?: unknown[] };
  if (left.length === 0) delete copy.conflicts;
  else copy.conflicts = left;
  return copy;
}

// ——— Its changes ———

/** One change of a proposal, as the person reviews it. */
export interface ProposalChange {
  /** Names it in the proposal: its item's key and what happened, as `element:<id> added`. */
  key: string;
  change: Change;
  /** The keys of the changes it needs, which ticking it ticks too. */
  needs: string[];
  /** Whether the person changed what it is about too, since the proposal opened: it starts unticked. */
  changedByYou: boolean;
}

/** A proposal's changes: the comparison of the project now with the proposed one, change by change. */
export interface ProposalChanges {
  comparison: Comparison;
  changes: ProposalChange[];
}

/** The key that names a change of a comparison. */
export function changeKey(change: Change): string {
  return `${itemKey(change.ref)} ${change.status}`;
}

/** The keys of a value that are free text, which never name anything. */
const TEXT_KEYS = new Set([
  'name',
  'description',
  'text',
  'title',
  'caption',
  'notes',
  'label',
  'attributes',
  'code',
  'svg',
  'data',
]);

/** The longest text that can be an id. */
const MAX_ID_LENGTH = 128;

/**
 * The changes of a proposal, each with what it needs and whether the person changed it too. What a
 * change needs:
 * - the change that adds or redefines what it names, such as a relation's ends or type, an element's
 *   component, or the view a scenario plays over;
 * - for a removal, the changes of what named what it removes, such as the removals of the relations
 *   that end on a removed element;
 * - for a definition changed, the changes of what named it, such as the removal of a relation whose
 *   type now nests;
 * - for a nesting relation added, the removals of those that would close a cycle with it;
 * - another change of the same item, such as a shape's move and its resize;
 * - for a package added or removed, the project's change of its list of packages, and the other way
 *   round.
 */
export function proposalChanges(proposal: Proposal): ProposalChanges {
  const comparison = compareProjects(proposal.base, proposal.proposed);
  const yours = new Set(
    compareProjects(proposal.opened, proposal.base).changes.flatMap((change) =>
      change.items.map(itemKey),
    ),
  );
  const keys = comparison.changes.map(changeKey);
  const needs = keys.map(() => new Set<number>());
  const owners = new Map<string, number[]>();
  const added = new Map<Id, number>();
  const removed = new Map<Id, number>();
  // A definition changed may hold only with what the proposal changes of what it defines.
  const redefined = new Map<Id, number>();
  comparison.changes.forEach((change, at) => {
    for (const ref of change.items) {
      const key = itemKey(ref);
      const others = owners.get(key) ?? [];
      for (const other of others) {
        needs[at]?.add(other);
        needs[other]?.add(at);
      }
      owners.set(key, [...others, at]);
      const id = definedId(ref);
      if (id === undefined) continue;
      if (change.status === 'added' && !added.has(id)) added.set(id, at);
      if (change.status === 'removed' && !removed.has(id)) removed.set(id, at);
      if (
        change.status === 'changed' &&
        (ref.kind === 'component' || ref.kind === 'relation-type')
      ) {
        redefined.set(id, at);
      }
    }
  });
  // What derives from a definition redefined is redefined with it.
  for (const [id, at] of derivedFrom(proposal, [...redefined.keys()])) {
    if (!redefined.has(id)) redefined.set(id, redefined.get(at) as number);
  }
  const valueIn = (state: ProjectSnapshot, ref: ItemRef) =>
    projectItems(state).get(itemKey(ref))?.value;
  comparison.changes.forEach((change, at) => {
    for (const ref of change.items) {
      const own = definedId(ref);
      // What it names in the proposed project, that the proposal adds or redefines.
      for (const id of namedIn(ref, valueIn(proposal.proposed, ref))) {
        if (id === own) continue;
        const owner = added.get(id) ?? redefined.get(id);
        if (owner !== undefined && owner !== at) needs[at]?.add(owner);
      }
      // What it named in the project now, that the proposal removes: that removal needs it.
      for (const id of namedIn(ref, valueIn(proposal.base, ref))) {
        if (id === own) continue;
        const owner = removed.get(id);
        if (owner !== undefined && owner !== at) needs[owner]?.add(at);
        // What it named that the proposal redefines needs this change too, unless it was added.
        const definition = redefined.get(id);
        if (definition !== undefined && definition !== at && change.status !== 'added') {
          needs[definition]?.add(at);
        }
      }
    }
  });
  // A nesting relation added needs every removal of one that breaks a path that would close a
  // cycle with it: without those, the containment the project keeps would come round.
  // A relation that nests or stops nesting with no change of its own does so by its type's.
  const ownerOf = (relation: { id: Id; relationType: Id }) =>
    owners.get(`relation:${relation.id}`)?.[0] ?? redefined.get(relation.relationType);
  for (const [added, removal] of cycleNeeds(proposal)) {
    const adder = ownerOf(added);
    const remover = ownerOf(removal);
    if (adder !== undefined && remover !== undefined && adder !== remover)
      needs[adder]?.add(remover);
  }
  // A package comes with the project's list of packages, and goes with it.
  const project = comparison.changes.findIndex((change) => change.ref.kind === 'project');
  if (project >= 0) {
    comparison.changes.forEach((change, at) => {
      if (change.ref.kind !== 'package' || change.status === 'changed') return;
      needs[at]?.add(project);
      needs[project]?.add(at);
    });
  }
  return {
    comparison,
    changes: comparison.changes.map((change, at) => ({
      key: keys[at] as string,
      change,
      needs: [...(needs[at] ?? [])]
        .filter((other) => other !== at)
        .map((other) => keys[other] as string),
      changedByYou: change.items.some((ref) => yours.has(itemKey(ref))),
    })),
  };
}

/**
 * For each nesting relation the proposal adds, changes into another, or makes nest by its type, the
 * nesting relations of the project now that it removes, changes or stops nesting and that lie on a
 * path from the added one's container back to what it places, through either project's containment:
 * each is a removal it needs.
 */
function cycleNeeds(proposal: Proposal): [Relation, Relation][] {
  const { base, proposed } = proposal;
  // Each project's containment, by the relation types that nest in it.
  const edges = (state: ProjectSnapshot) => {
    const nesting = definitionsIn(state).nestingRelationTypes;
    return new Map(
      state.model.relations
        .filter((each) => nesting.has(each.relationType))
        .map((each) => [each.id, each]),
    );
  };
  const before = edges(base);
  const after = edges(proposed);
  const same = (a: { from: Id; to: Id; relationType: Id } | undefined, b: typeof a) =>
    a !== undefined &&
    b !== undefined &&
    a.from === b.from &&
    a.to === b.to &&
    a.relationType === b.relationType;
  const added = [...after.values()].filter((each) => !same(before.get(each.id), each));
  if (added.length === 0) return [];
  const removed = [...before.values()].filter((each) => !same(after.get(each.id), each));
  if (removed.length === 0) return [];
  const forward = new Map<Id, Id[]>();
  const backward = new Map<Id, Id[]>();
  for (const each of [...before.values(), ...after.values()]) {
    forward.set(each.from, [...(forward.get(each.from) ?? []), each.to]);
    backward.set(each.to, [...(backward.get(each.to) ?? []), each.from]);
  }
  const reach = (start: Id, links: ReadonlyMap<Id, Id[]>) => {
    const seen = new Set([start]);
    const pending = [start];
    while (pending.length > 0) {
      for (const next of links.get(pending.pop() as Id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
      }
    }
    return seen;
  };
  const needs: [Relation, Relation][] = [];
  for (const relation of added) {
    // A cycle through it runs from its container back to what it places.
    const fromContainer = reach(relation.to, forward);
    const toPlaced = reach(relation.from, backward);
    for (const removal of removed) {
      if (fromContainer.has(removal.from) && toPlaced.has(removal.to)) {
        needs.push([relation, removal]);
      }
    }
  }
  return needs;
}

/**
 * The definitions that derive, at any depth and in either project, from one of those given, each
 * with the one it derives from.
 */
function derivedFrom(proposal: Proposal, roots: readonly Id[]): [Id, Id][] {
  if (roots.length === 0) return [];
  const children = new Map<Id, Set<Id>>();
  for (const state of [proposal.base, proposal.proposed]) {
    for (const file of state.packages) {
      for (const each of [...file.components, ...file.relationTypes]) {
        const list = children.get(each.derivesFrom) ?? new Set<Id>();
        list.add(each.id);
        children.set(each.derivesFrom, list);
      }
    }
  }
  const found: [Id, Id][] = [];
  for (const root of roots) {
    const seen = new Set([root]);
    const pending = [root];
    while (pending.length > 0) {
      for (const child of children.get(pending.pop() as Id) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        pending.push(child);
        found.push([child, root]);
      }
    }
  }
  return found;
}

/** The id an item gives what it defines, which other items name it by. */
function definedId(ref: ItemRef): Id | undefined {
  switch (ref.kind) {
    case 'element':
    case 'relation':
    case 'component':
    case 'relation-type':
    case 'image':
    case 'free-shape':
    case 'scenario':
    case 'tour':
    case 'thread':
      return ref.id;
    case 'package':
      return ref.package;
    case 'view':
      return ref.view;
    default:
      return undefined;
  }
}

/** Every text an item holds that may name something: in what names the item, and in its value. */
function namedIn(ref: ItemRef, value: JsonValue | undefined): Set<string> {
  const found = new Set<string>();
  for (const [key, each] of Object.entries(ref)) {
    if (key !== 'kind' && typeof each === 'string') found.add(each);
  }
  if (value === undefined) return found;
  const pending: JsonValue[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === 'string') {
      if (next.length <= MAX_ID_LENGTH) found.add(next);
    } else if (Array.isArray(next)) {
      for (const each of next) pending.push(each);
    } else if (typeof next === 'object' && next !== null) {
      for (const [key, each] of Object.entries(next)) {
        if (!TEXT_KEYS.has(key)) pending.push(each);
      }
    }
  }
  return found;
}

// ——— Accepting ———

/**
 * Accepts some of a proposal's changes, by their keys, or all of them: one action of Claude's on the
 * project now, checked as a command is, which returns what `executeCommand` returns. The changes
 * chosen must hold what they need; a choice that would break a rule is refused whole.
 */
export function acceptProposal(
  proposal: Proposal,
  project: ProjectSnapshot,
  changes: readonly string[] | 'all',
  context: CommandContext = {},
): CommandOutcome {
  const open = rebaseProposal(proposal, project);
  const listed = proposalChanges(open);
  const byKey = new Map(listed.changes.map((each) => [each.key, each]));
  const chosen = new Set(changes === 'all' ? byKey.keys() : changes);
  for (const key of chosen) {
    if (!byKey.has(key)) {
      return refused(`The proposal holds no change "${key}".`);
    }
  }
  for (const key of chosen) {
    const missing = byKey.get(key)?.needs.find((need) => !chosen.has(need));
    if (missing !== undefined) {
      return refused(`The change "${key}" needs the change "${missing}", which is not accepted.`);
    }
  }
  const label = acceptedLabel(open.labels, chosen.size, listed.changes.length);
  if (chosen.size === 0) {
    return {
      ok: true,
      state: project,
      operations: [],
      inverse: [],
      label,
      warnings: [],
      created: [],
    };
  }
  const result =
    chosen.size === listed.changes.length
      ? open.proposed
      : assemble(
          project,
          open.proposed,
          new Set(
            listed.changes
              .filter((each) => chosen.has(each.key))
              .flatMap((each) => each.change.items.map(itemKey)),
          ),
        );
  const outcome = executeOperations(project, operationsBetween(project, result), label, {
    ...context,
    author: 'claude',
  });
  if (!outcome.ok) return outcome;
  const present = idsIn(outcome.state);
  return { ...outcome, created: open.created.filter((id) => present.has(id)) };
}

function refused(message: string): CommandOutcome {
  return { ok: false, problems: [problem('invalid-command', message)] };
}

/**
 * How the history names an accepted proposal: Claude's own label for its one command, or the first's
 * and how many more; and, when some changes were left, how many of how many were accepted.
 */
export function acceptedLabel(labels: readonly string[], accepted: number, total: number): string {
  const [first = 'Change the project'] = labels;
  const named = labels.length <= 1 ? first : `${first} and ${labels.length - 1} more`;
  return accepted === total ? named : `${named} (${accepted} of ${total} changes)`;
}

/** The ids a project holds, of whatever has one. */
function idsIn(state: ProjectSnapshot): Set<Id> {
  const ids = new Set<Id>();
  const add = (list: readonly { id: Id }[] | undefined) => {
    for (const each of list ?? []) ids.add(each.id);
  };
  add(state.model.elements);
  add(state.model.relations);
  for (const file of state.packages) {
    ids.add(file.id);
    add(file.components);
    add(file.relationTypes);
    add(file.images);
  }
  for (const view of state.views) {
    ids.add(view.id);
    add(view.freeShapes);
    add(view.overlays);
  }
  for (const scenario of state.scenarios) {
    ids.add(scenario.id);
    add(scenario.steps);
  }
  for (const tour of state.tours) {
    ids.add(tour.id);
    add(tour.steps);
  }
  for (const thread of state.comments) {
    ids.add(thread.id);
    add(thread.comments);
  }
  return ids;
}

/**
 * The project now with the items of the chosen changes as the proposed project holds them, and every
 * other item as it is. Lists keep the project's order, with what comes from the proposed project after
 * what precedes it there; the model's order is the proposed one when its change is chosen. A stacking
 * list holds the elements the result has, in the order of the list it is taken from.
 */
function assemble(
  base: ProjectSnapshot,
  proposed: ProjectSnapshot,
  taken: ReadonlySet<string>,
): ProjectSnapshot {
  const take = (key: string) => taken.has(key);
  // A file's conflicts are the project's own: a proposal never changes them.
  const project = take('project') ? { ...proposed.project } : base.project;
  if (project !== base.project) {
    if (base.project.conflicts === undefined) delete project.conflicts;
    else project.conflicts = base.project.conflicts;
  }
  const elements = assembled(
    base.model.elements,
    proposed.model.elements,
    (each) => `element:${each.id}`,
    take,
    take('order') ? 'newer' : 'older',
  );
  const model = {
    ...base.model,
    world: take('world') ? proposed.model.world : base.model.world,
    elements,
    relations: assembled(
      base.model.relations,
      proposed.model.relations,
      (each) => `relation:${each.id}`,
      take,
    ),
  };
  const has = new Set(elements.map((each) => each.id));

  // Packages: the project's own by their items, the built-in ones as the project lists them.
  const listed = new Set(project.packages);
  const packageIds = ordered(
    base.packages.map((each) => each.id),
    proposed.packages.map((each) => each.id),
  );
  const packages = packageIds.flatMap((id) => {
    const older = base.packages.find((each) => each.id === id);
    const newer = proposed.packages.find((each) => each.id === id);
    if (!isOwnPackage(id)) {
      const file = older ?? newer;
      return file && listed.has(id) ? [file] : [];
    }
    const from = take(`package:${id}`) ? newer : older;
    if (!from) return [];
    const list = <T extends { id: Id }>(
      name: 'component' | 'relation-type' | 'image',
      of: (file: PackageFile) => readonly T[] | undefined,
    ) =>
      assembled(
        older ? (of(older) ?? []) : [],
        newer ? (of(newer) ?? []) : [],
        (each) => `${name}:${id}:${each.id}`,
        take,
      );
    const images = list('image', (file) => file.images);
    const file: PackageFile = {
      ...from,
      components: list('component', (each) => each.components),
      relationTypes: list('relation-type', (each) => each.relationTypes),
    };
    if (images.length > 0 || from.images !== undefined) file.images = images;
    else delete file.images;
    if (older?.conflicts === undefined) delete file.conflicts;
    else file.conflicts = older.conflicts;
    return [file];
  });

  const views = assembled(base.views, proposed.views, (each) => `view:${each.id}`, take).map(
    (chosen) => {
      const id = chosen.id;
      const older = base.views.find((each) => each.id === id);
      const newer = proposed.views.find((each) => each.id === id);
      const props = take(`view:${id}`) ? (newer ?? chosen) : (older ?? chosen);
      const positions = assembled(
        older?.positions ?? [],
        newer?.positions ?? [],
        (each) => `position:${id}:${positionKey(each)}`,
        take,
      );
      const freeShapes = assembled(
        older?.freeShapes ?? [],
        newer?.freeShapes ?? [],
        (each) => `free-shape:${id}:${each.id}`,
        take,
      );
      const routes: Record<Id, unknown> = {};
      for (const relation of ordered(
        Object.keys(older?.routes ?? {}),
        Object.keys(newer?.routes ?? {}),
      )) {
        const from = take(`route:${id}:${relation}`) ? newer?.routes : older?.routes;
        const route = from?.[relation];
        if (route !== undefined) routes[relation] = route;
      }
      const stacking: Record<Id, Id[]> = {};
      for (const container of ordered(
        Object.keys(older?.stackingOrder ?? {}),
        Object.keys(newer?.stackingOrder ?? {}),
      )) {
        const fromNewer = take(`stacking:${id}:${container}`);
        const lead = (fromNewer ? newer : older)?.stackingOrder?.[container] ?? [];
        const follow = (fromNewer ? older : newer)?.stackingOrder?.[container] ?? [];
        const list = ordered(lead, follow).filter((element) => has.has(element));
        if (list.length > 0) stacking[container] = list;
      }
      const view: ViewFile = { ...props, positions, freeShapes };
      delete view.routes;
      delete view.stackingOrder;
      if (older?.conflicts === undefined) delete view.conflicts;
      else view.conflicts = older.conflicts;
      if (Object.keys(stacking).length > 0) view.stackingOrder = stacking;
      if (Object.keys(routes).length > 0) view.routes = routes as ViewFile['routes'];
      return view;
    },
  );
  return {
    project,
    model,
    packages,
    views,
    scenarios: assembled(base.scenarios, proposed.scenarios, (each) => `scenario:${each.id}`, take),
    tours: assembled(base.tours, proposed.tours, (each) => `tour:${each.id}`, take),
    comments: assembled(base.comments, proposed.comments, (each) => `thread:${each.id}`, take),
  };
}

/**
 * A list of things by key, each from the newer list when it is taken and from the older one when not,
 * left out where that list lacks it; in the leading list's order, with what the other one brings after
 * what precedes it there.
 */
function assembled<T>(
  older: readonly T[],
  newer: readonly T[],
  keyOf: (item: T) => string,
  take: (key: string) => boolean,
  lead: 'older' | 'newer' = 'older',
): T[] {
  const olderItems = new Map(older.map((each) => [keyOf(each), each]));
  const newerItems = new Map(newer.map((each) => [keyOf(each), each]));
  const valueOf = (key: string) => (take(key) ? newerItems.get(key) : olderItems.get(key));
  const keys = ordered(
    (lead === 'older' ? older : newer).map(keyOf),
    (lead === 'older' ? newer : older).map(keyOf),
  );
  return keys.flatMap((key) => {
    const value = valueOf(key);
    return value === undefined ? [] : [value];
  });
}

/**
 * Two lists of keys as one: the leading list's order, and each key only the other has right after
 * the nearest key before it there that is placed, in one pass.
 */
function ordered(leading: readonly string[], other: readonly string[]): string[] {
  const placed = new Set(leading);
  const after = new Map<string, string[]>();
  let last = '';
  for (const key of other) {
    if (placed.has(key)) {
      last = key;
      continue;
    }
    placed.add(key);
    after.set(last, [...(after.get(last) ?? []), key]);
    last = key;
  }
  // Each key, then what follows it, depth first, without recursion: a long run of additions chains.
  const result: string[] = [];
  const pending = [...leading].reverse();
  for (const key of [...(after.get('') ?? [])].reverse()) pending.push(key);
  while (pending.length > 0) {
    const key = pending.pop() as string;
    result.push(key);
    const next = after.get(key);
    if (next) for (let at = next.length - 1; at >= 0; at--) pending.push(next[at] as string);
  }
  return result;
}
