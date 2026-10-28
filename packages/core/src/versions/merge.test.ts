/**
 * Merging two edits of a file by id (ADR 0072): what one side changed alone takes that side's value,
 * changes to different items or keys join, what both changed differently is a conflict kept as data
 * in the file, every merged file is a valid file that keeps the rules one file can tell, and
 * resolving every conflict leaves the file without them.
 */
import type { FileConflict, FileContentByKind, FileKind, ModelFile } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import { randomIds } from '../ids';
import { applyOperations, type ConflictFile } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import { commandFor, intent, NESTING, propertyProject, type Intent } from '../test/random-commands';
import { isOwnPackage } from './items';
import { mergeFile, mergeItem, type MergePolicy } from './merge';
import { operationsBetween } from './operations-between';

const ours: MergePolicy = { kept: 'ours' };
const nesting = new Set(NESTING);

function done(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: (base) => `${base}-new` });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('mergeItem', () => {
  it('takes what one side changed alone, and what both changed alike', () => {
    const base = { name: 'API', latency: 20 };
    expect(mergeItem(base, base, { name: 'Gateway', latency: 20 }, ours)).toEqual({
      value: { name: 'Gateway', latency: 20 },
      conflicts: [],
    });
    expect(mergeItem(base, { name: 'Gateway', latency: 20 }, base, ours).value).toEqual({
      name: 'Gateway',
      latency: 20,
    });
    expect(mergeItem(base, { name: 'Gateway' }, { name: 'Gateway' }, ours)).toEqual({
      value: { name: 'Gateway' },
      conflicts: [],
    });
  });

  it('joins changes to different keys, whichever side each is on', () => {
    const base = { name: 'API', attributes: { latency: 20 } };
    const mine = { name: 'Gateway', attributes: { latency: 20 } };
    const yours = { name: 'API', attributes: { latency: 20, owner: 'Ops' }, description: 'Front' };
    const joined = {
      name: 'Gateway',
      attributes: { latency: 20, owner: 'Ops' },
      description: 'Front',
    };
    expect(mergeItem(base, mine, yours, ours)).toEqual({ value: joined, conflicts: [] });
    expect(mergeItem(base, yours, mine, ours)).toEqual({ value: joined, conflicts: [] });
  });

  it('keeps ours where both changed a value differently, with theirs and the ancestor’s', () => {
    const merged = mergeItem({ name: 'API' }, { name: 'Gateway' }, { name: 'Edge' }, ours);
    expect(merged).toEqual({
      value: { name: 'Gateway' },
      conflicts: [
        { path: ['name'], why: 'both-changed', kept: 'ours', other: 'Edge', base: 'API' },
      ],
    });
    // A proposal keeps its own side's value in place.
    expect(
      mergeItem({ name: 'API' }, { name: 'Gateway' }, { name: 'Edge' }, { kept: 'theirs' }),
    ).toEqual({
      value: { name: 'Edge' },
      conflicts: [
        { path: ['name'], why: 'both-changed', kept: 'theirs', other: 'Gateway', base: 'API' },
      ],
    });
  });

  it('keeps the change where one side removed what the other changed', () => {
    expect(mergeItem({ name: 'API' }, undefined, { name: 'Gateway' }, ours)).toEqual({
      value: { name: 'Gateway' },
      conflicts: [{ path: [], why: 'removed-and-changed', kept: 'theirs', base: { name: 'API' } }],
    });
    // Removed on one side and left as it was on the other: it goes.
    expect(mergeItem({ name: 'API' }, undefined, { name: 'API' }, ours)).toEqual({
      value: undefined,
      conflicts: [],
    });
  });

  it('keeps ours where both added an item differently', () => {
    expect(mergeItem(undefined, { name: 'A' }, { name: 'B' }, ours)).toEqual({
      value: { name: 'A' },
      conflicts: [{ path: [], why: 'both-added', kept: 'ours', other: { name: 'B' } }],
    });
  });

  it('merges sets as sets, and lists of things with ids by id', () => {
    const sets: MergePolicy = {
      kept: 'ours',
      lists: (path) => (path[0] === 'packages' ? { kind: 'set' } : undefined),
    };
    expect(
      mergeItem(
        { packages: ['a', 'b'] },
        { packages: ['a', 'b', 'c'] },
        { packages: ['b', 'd'] },
        sets,
      ),
    ).toEqual({ value: { packages: ['b', 'c', 'd'] }, conflicts: [] });
    const merged = mergeItem(
      {
        steps: [
          { id: 's1', text: 'one' },
          { id: 's2', text: 'two' },
        ],
      },
      {
        steps: [
          { id: 's1', text: 'One' },
          { id: 's2', text: 'two' },
          { id: 's3', text: 'three' },
        ],
      },
      {
        steps: [
          { id: 's1', text: 'one' },
          { id: 's4', text: 'four' },
          { id: 's2', text: 'Two' },
        ],
      },
      ours,
    );
    expect(merged).toEqual({
      value: {
        steps: [
          { id: 's1', text: 'One' },
          { id: 's4', text: 'four' },
          { id: 's2', text: 'Two' },
          { id: 's3', text: 'three' },
        ],
      },
      conflicts: [],
    });
  });

  it('keeps ours’ order where both moved what they share differently', () => {
    const merged = mergeItem(
      { steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { steps: [{ id: 'b' }, { id: 'a' }, { id: 'c' }] },
      { steps: [{ id: 'a' }, { id: 'c' }, { id: 'b' }] },
      ours,
    );
    expect(merged).toEqual({
      value: { steps: [{ id: 'b' }, { id: 'a' }, { id: 'c' }] },
      conflicts: [
        {
          path: ['steps'],
          why: 'order',
          kept: 'ours',
          other: ['a', 'c', 'b'],
          base: ['a', 'b', 'c'],
        },
      ],
    });
  });
});

describe('mergeFile', () => {
  it('keeps what a removal meets that the other side needs, as a conflict', () => {
    const base = testProject();
    const mine = done(base, { type: 'delete', elements: ['db'] });
    const yours = done(base, {
      type: 'create-relation',
      relation: { id: 'client-reads-db', relationType: 'test.reads', from: 'client', to: 'db' },
    });
    const merged = mergeFile('model', base.model, mine.model, yours.model, { nesting });
    expect(merged.file.elements.map((each) => each.id)).toEqual([
      'system',
      'api',
      'db',
      'client',
      'contract',
    ]);
    // The relations the removal took that no side changed stay removed with it.
    expect(merged.file.relations.map((each) => each.id).sort()).toEqual(
      ['api-in-system', 'client-calls-api', 'client-reads-db', 'contract-governs-call'].sort(),
    );
    expect(merged.conflicts).toEqual([
      expect.objectContaining({
        id: 'conflict-1',
        item: 'element:db',
        why: 'needs-removed',
        kept: 'ours',
      }),
    ]);
    expect(merged.file.conflicts).toEqual(merged.conflicts);
  });

  it('takes away a relation that a removal on the other side leaves without its end', () => {
    const base = testProject();
    const mine = done(base, { type: 'delete', elements: ['db'] });
    const merged = mergeFile('model', base.model, mine.model, base.model, { nesting });
    expect(merged.file).toEqual(mine.model);
    expect(merged.conflicts).toEqual([]);
  });

  it('leaves out an addition of theirs that closes a containment cycle with one of ours', () => {
    const base = testProject();
    const mine = done(base, {
      type: 'create-relation',
      relation: { id: 'client-in-db', relationType: 'test.inside', from: 'client', to: 'db' },
    });
    const yours = done(base, {
      type: 'create-relation',
      relation: { id: 'db-in-client', relationType: 'test.inside', from: 'db', to: 'client' },
    });
    const merged = mergeFile('model', base.model, mine.model, yours.model, { nesting });
    const ids = merged.file.relations.map((each) => each.id);
    expect(ids).toContain('client-in-db');
    expect(ids).not.toContain('db-in-client');
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ item: 'relation:db-in-client', why: 'cycle', kept: 'ours' }),
    ]);
  });

  it('names the sides and keeps the conflicts both held, numbering new ones after them', () => {
    const base = testProject();
    const held: FileConflict = {
      id: 'conflict-1',
      item: 'world',
      path: ['name'],
      why: 'both-changed',
      kept: 'ours',
    };
    const mine = done(base, { type: 'update-element', id: 'api', changes: { name: 'Gateway' } });
    const yours = done(base, { type: 'update-element', id: 'api', changes: { name: 'Edge' } });
    const merged = mergeFile(
      'model',
      base.model,
      { ...mine.model, conflicts: [held] },
      yours.model,
      { sides: { ours: 'HEAD', theirs: 'feature' } },
    );
    expect(merged.file.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    expect(merged.conflicts).toEqual([
      {
        id: 'conflict-2',
        item: 'element:api',
        path: ['name'],
        why: 'both-changed',
        kept: 'ours',
        other: 'Edge',
        base: 'API',
        sides: { ours: 'HEAD', theirs: 'feature' },
      },
    ]);
    expect(merged.file.conflicts?.map((each) => each.id)).toEqual(['conflict-1', 'conflict-2']);
  });

  it('merges a view’s positions by element and container, and its routes by relation', () => {
    const base = testProject();
    const mine = done(base, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -300, y: 40, pinned: true }],
    });
    const yours = done(base, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'api', container: 'system', x: 60, y: 40, pinned: true }],
    });
    const merged = mergeFile('view', base.views[0], mine.views[0]!, yours.views[0]!);
    expect(merged.conflicts).toEqual([]);
    const at = (element: string) => merged.file.positions.find((each) => each.element === element);
    expect(at('client')).toMatchObject({ x: -300 });
    expect(at('api')).toMatchObject({ x: 60 });
  });
});

describe('resolve-conflicts', () => {
  function conflicted(): ProjectSnapshot {
    const base = testProject();
    const mine = done(base, { type: 'update-element', id: 'api', changes: { name: 'Gateway' } });
    const yours = done(base, { type: 'update-element', id: 'api', changes: { name: 'Edge' } });
    const merged = mergeFile('model', base.model, mine.model, yours.model, { nesting });
    return { ...mine, model: merged.file };
  }
  const resolve = (
    state: ProjectSnapshot,
    take: 'kept' | 'other',
    file: ConflictFile = { kind: 'model' },
  ) =>
    executeCommand(state, {
      type: 'resolve-conflicts',
      file,
      resolutions: [{ conflict: 'conflict-1', take }],
    });

  it('warns of each file holding conflicts, until they are resolved', () => {
    const state = conflicted();
    expect(checkProject(state).warnings).toContainEqual(
      expect.objectContaining({
        code: 'merge-conflict',
        message:
          'A merge left a conflict in the model: resolve it in the Changes tab, then add the file with git add.',
      }),
    );
    const outcome = resolve(state, 'kept');
    if (!outcome.ok) throw new Error('refused');
    expect(checkProject(outcome.state).warnings.map((each) => each.code)).not.toContain(
      'merge-conflict',
    );
  });

  it('keeps what the file holds, or takes the other choice, and the conflicts list goes with the last', () => {
    const state = conflicted();
    const kept = resolve(state, 'kept');
    if (!kept.ok) throw new Error('refused');
    expect(kept.label).toBe('Resolve a conflict in the model');
    expect(kept.state.model.conflicts).toBeUndefined();
    expect(kept.state.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    const other = resolve(state, 'other');
    if (!other.ok) throw new Error('refused');
    expect(other.state.model.conflicts).toBeUndefined();
    expect(other.state.model.elements.find((each) => each.id === 'api')?.name).toBe('Edge');
    // Undone exactly.
    expect(applyOperations(other.state, other.inverse).state).toEqual(state);
  });

  it('refuses a file without conflicts, a conflict it lacks, and one resolved twice', () => {
    const state = conflicted();
    const refusal = (command: Command) => {
      const outcome = executeCommand(state, command);
      return outcome.ok ? undefined : outcome.problems.map((each) => each.message);
    };
    expect(
      refusal({
        type: 'resolve-conflicts',
        file: { kind: 'project' },
        resolutions: [{ conflict: 'conflict-1', take: 'kept' }],
      }),
    ).toEqual(['There is no conflict in the project file.']);
    expect(
      refusal({
        type: 'resolve-conflicts',
        file: { kind: 'model' },
        resolutions: [{ conflict: 'conflict-9', take: 'kept' }],
      }),
    ).toEqual(['There is no conflict "conflict-9" in the model.']);
    expect(
      refusal({
        type: 'resolve-conflicts',
        file: { kind: 'model' },
        resolutions: [
          { conflict: 'conflict-1', take: 'kept' },
          { conflict: 'conflict-1', take: 'other' },
        ],
      }),
    ).toEqual(['The conflict "conflict-1" is resolved twice.']);
  });

  it('refuses another choice that would break a rule, naming it', () => {
    const base = testProject();
    const mine = done(base, {
      type: 'create-relation',
      relation: { id: 'client-in-db', relationType: 'test.inside', from: 'client', to: 'db' },
    });
    const yours = done(base, {
      type: 'create-relation',
      relation: { id: 'db-in-client', relationType: 'test.inside', from: 'db', to: 'client' },
    });
    const merged = mergeFile('model', base.model, mine.model, yours.model, { nesting });
    const state = { ...mine, model: merged.file };
    const outcome = resolve(state, 'other');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems[0]?.message).toMatch(/cycle/i);
  });

  it('gives the conflicts of a version from another’s by the operations between them', () => {
    const state = conflicted();
    const resolved = resolve(state, 'kept');
    if (!resolved.ok) throw new Error('refused');
    const operations = operationsBetween(resolved.state, state);
    expect(operations).toEqual([
      { op: 'set-conflicts', file: { kind: 'model' }, conflicts: state.model.conflicts },
    ]);
    expect(applyOperations(resolved.state, operations).state).toEqual(state);
  });
});

describe('a view’s lists', () => {
  const view = () => testProject().views[0]!;

  it('merges the containers it collapses as a set, sorted as the file keeps them', () => {
    const base = view();
    const merged = mergeFile(
      'view',
      base,
      { ...base, collapsed: ['system'] },
      { ...base, collapsed: ['db'] },
    );
    expect(merged.conflicts).toEqual([]);
    expect(merged.file.collapsed).toEqual(['db', 'system']);
  });

  it('merges the relation types it leaves out by relation type, and resolves one inside the list', () => {
    const base = { ...view(), relationTypesLeftOut: [{ relationType: 'test.calls' }] };
    const mine = { ...base, relationTypesLeftOut: [{ relationType: 'test.calls', exactly: true }] };
    const yours = { ...base, relationTypesLeftOut: [{ relationType: 'test.reads' }] };
    const merged = mergeFile('view', base, mine, yours);
    expect(merged.file.relationTypesLeftOut).toEqual([
      { relationType: 'test.calls', exactly: true },
      { relationType: 'test.reads' },
    ]);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({
        item: 'view',
        path: ['relationTypesLeftOut', 'test.calls'],
        why: 'removed-and-changed',
        kept: 'ours',
      }),
    ]);
    const state = { ...testProject(), views: [merged.file] };
    const outcome = executeCommand(state, {
      type: 'resolve-conflicts',
      file: { kind: 'view', id: 'overview' },
      resolutions: [{ conflict: 'conflict-1', take: 'other' }],
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(outcome.label).toBe('Resolve a conflict in the view "Overview"');
    expect(outcome.state.views[0]?.relationTypesLeftOut).toEqual([{ relationType: 'test.reads' }]);
    expect(outcome.state.views[0]?.conflicts).toBeUndefined();
  });
});

// ——— Properties ———

/** A project after some random actions. */
function evolve(start: ProjectSnapshot, wishes: readonly Intent[], seed: number): ProjectSnapshot {
  let random = seed;
  const newId = randomIds(() => {
    random = (random * 1103515245 + 12345) % 2147483648;
    return Math.abs(random) / 2147483648;
  });
  let state = start;
  for (const wish of wishes) {
    if (wish.kind === 'undo' || wish.kind === 'redo') continue;
    const command = commandFor(state, wish);
    if (!command) continue;
    const outcome = executeCommand(state, command, { newId });
    if (outcome.ok) state = outcome.state;
  }
  return state;
}

interface ProjectFileOf<K extends FileKind = FileKind> {
  kind: K;
  ref: ConflictFile;
  content: FileContentByKind[K];
}

/** The files of a project that a merge reads one by one. */
function filesOf(state: ProjectSnapshot): Map<string, ProjectFileOf> {
  const files = new Map<string, ProjectFileOf>();
  const put = (key: string, file: ProjectFileOf) => files.set(key, file);
  put('project', { kind: 'project', ref: { kind: 'project' }, content: state.project });
  put('model', { kind: 'model', ref: { kind: 'model' }, content: state.model });
  for (const each of state.packages) {
    if (isOwnPackage(each.id)) {
      put(`package:${each.id}`, {
        kind: 'package',
        ref: { kind: 'package', id: each.id },
        content: each,
      });
    }
  }
  for (const each of state.views) {
    put(`view:${each.id}`, { kind: 'view', ref: { kind: 'view', id: each.id }, content: each });
  }
  for (const each of state.scenarios) {
    put(`scenario:${each.id}`, {
      kind: 'scenario',
      ref: { kind: 'scenario', id: each.id },
      content: each,
    });
  }
  for (const each of state.tours) {
    put(`tour:${each.id}`, { kind: 'tour', ref: { kind: 'tour', id: each.id }, content: each });
  }
  for (const each of state.comments) {
    put(`comment:${each.id}`, {
      kind: 'comment',
      ref: { kind: 'comment', id: each.id },
      content: each,
    });
  }
  return files;
}

/**
 * Two versions merged file by file, as git and the merge driver would: a file on both sides is
 * merged; one added on one side is kept; one removed on one side and left on the other goes.
 */
function mergeProjects(
  base: ProjectSnapshot,
  mine: ProjectSnapshot,
  yours: ProjectSnapshot,
): { state: ProjectSnapshot; merged: { key: string; kind: FileKind; file: unknown }[] } {
  const older = filesOf(base);
  const left = filesOf(mine);
  const right = filesOf(yours);
  const merged: { key: string; kind: FileKind; file: unknown }[] = [];
  const result = new Map<string, unknown>();
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key);
    const b = right.get(key);
    const was = older.get(key);
    if (a && b) {
      const file = mergeFile(a.kind, was?.content, a.content, b.content, { nesting }).file;
      merged.push({ key, kind: a.kind, file });
      result.set(key, file);
    } else if (!was) result.set(key, (a ?? b)?.content);
  }
  const of = <T>(prefix: string) =>
    [...result.entries()].filter(([key]) => key.startsWith(prefix)).map(([, file]) => file as T);
  const builtins = mine.packages.filter((each) => !isOwnPackage(each.id));
  return {
    state: {
      project: result.get('project') as ProjectSnapshot['project'],
      model: result.get('model') as ProjectSnapshot['model'],
      packages: [...of<ProjectSnapshot['packages'][number]>('package:'), ...builtins],
      views: of('view:'),
      scenarios: of('scenario:'),
      tours: of('tour:'),
      comments: of('comment:'),
    },
    merged,
  };
}

const edits = fc
  .tuple(
    fc.array(intent, { minLength: 0, maxLength: 20 }),
    fc.array(intent, { minLength: 1, maxLength: 20 }),
    fc.array(intent, { minLength: 1, maxLength: 20 }),
    fc.integer(),
  )
  .map(([first, left, right, seed]) => {
    const base = evolve(propertyProject(), first, seed);
    return { base, mine: evolve(base, left, seed + 1), yours: evolve(base, right, seed + 2) };
  });

/** The model rules one file can tell: ids name one thing, relations end on what is there, no cycle. */
function modelRules(model: ModelFile): string[] {
  const broken: string[] = [];
  const ids = new Set<string>([model.world.id]);
  for (const each of [...model.elements, ...model.relations]) {
    if (ids.has(each.id)) broken.push(`"${each.id}" names two things`);
    ids.add(each.id);
  }
  for (const relation of model.relations) {
    for (const end of [relation.from, relation.to]) {
      if (!ids.has(end)) broken.push(`"${relation.id}" ends on "${end}", which is not there`);
    }
  }
  const containers = new Map<string, string[]>();
  for (const relation of model.relations) {
    if (!nesting.has(relation.relationType)) continue;
    containers.set(relation.from, [...(containers.get(relation.from) ?? []), relation.to]);
  }
  const open = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (open.has(id)) return true;
    if (done.has(id)) return false;
    open.add(id);
    const cycle = (containers.get(id) ?? []).some(visit);
    open.delete(id);
    done.add(id);
    return cycle;
  };
  if ([...containers.keys()].some(visit)) broken.push('containment forms a cycle');
  return broken;
}

const contentOf = (file: unknown) => {
  const { conflicts: _conflicts, ...rest } = file as Record<string, unknown>;
  void _conflicts;
  return rest;
};

describe('merges, for any two edits of one version', () => {
  it('meet every kind of conflict the actions lead to', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(edits, ({ base, mine, yours }) => {
        for (const { file } of mergeProjects(base, mine, yours).merged) {
          for (const each of (file as { conflicts?: FileConflict[] }).conflicts ?? []) {
            seen.add(each.why);
          }
        }
      }),
      { numRuns: 300, seed: 20261028 },
    );
    expect([...seen].sort()).toEqual(
      ['both-added', 'both-changed', 'needs-removed', 'order', 'removed-and-changed'].sort(),
    );
  });

  it('give the other side where one side is unchanged', () => {
    fc.assert(
      fc.property(edits, ({ base, mine }) => {
        const older = filesOf(base);
        for (const [key, file] of filesOf(mine)) {
          const was = older.get(key);
          if (!was) continue;
          const left = mergeFile(file.kind, was.content, was.content, file.content, { nesting });
          expect(left.conflicts).toEqual([]);
          expect(left.file).toEqual(file.content);
          const right = mergeFile(file.kind, was.content, file.content, was.content, { nesting });
          expect(right.conflicts).toEqual([]);
          expect(right.file).toEqual(file.content);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('give valid files that keep the rules one file can tell', () => {
    fc.assert(
      fc.property(edits, ({ base, mine, yours }) => {
        for (const { key, kind, file } of mergeProjects(base, mine, yours).merged) {
          const valid = validateFile(kind, file);
          expect(valid.ok ? [] : valid.errors, key).toEqual([]);
          const conflicts = (file as { conflicts?: FileConflict[] }).conflicts ?? [];
          expect(new Set(conflicts.map((each) => each.id)).size).toBe(conflicts.length);
          if (kind === 'model') expect(modelRules(file as ModelFile)).toEqual([]);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('leave a file without conflicts once every conflict is resolved, whatever is taken', () => {
    fc.assert(
      fc.property(
        edits,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        ({ base, mine, yours }, takes) => {
          let { state } = mergeProjects(base, mine, yours);
          let turn = 0;
          for (const { ref } of filesOf(state).values()) {
            for (;;) {
              const held = (
                filesOf(state).get(keyOf(ref))?.content as { conflicts?: FileConflict[] }
              ).conflicts;
              if (held === undefined) break;
              const [first] = held;
              if (!first) throw new Error('An empty conflicts list is kept.');
              const take = takes[turn++ % takes.length] ? 'other' : 'kept';
              const command: Command = {
                type: 'resolve-conflicts',
                file: ref,
                resolutions: [{ conflict: first.id, take }],
              };
              let outcome = executeCommand(state, command);
              if (!outcome.ok && take === 'other') {
                outcome = executeCommand(state, {
                  ...command,
                  resolutions: [{ conflict: first.id, take: 'kept' }],
                });
              }
              if (!outcome.ok)
                throw new Error(outcome.problems.map((each) => each.message).join(' '));
              expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
              state = outcome.state;
              // The file stays one that reading it would accept.
              const resolved = filesOf(state).get(keyOf(ref));
              if (resolved) {
                const valid = validateFile(resolved.kind, resolved.content);
                expect(valid.ok ? [] : valid.errors).toEqual([]);
              }
            }
          }
          for (const file of filesOf(state).values()) {
            expect((file.content as { conflicts?: unknown }).conflicts).toBeUndefined();
          }
          expect(checkProject(state).warnings.map((each) => each.code)).not.toContain(
            'merge-conflict',
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it('join changes to different elements, or to different keys of one, whichever side each is on', () => {
    const fields = [
      'name',
      'description',
      'attributes.a',
      'attributes.b',
      'appearance.fill',
    ] as const;
    const change = fc.record({
      target: fc.nat({ max: 30 }),
      field: fc.constantFrom(...fields),
      side: fc.boolean(),
      value: fc.constantFrom('#112233', '#445566'),
    });
    fc.assert(
      fc.property(
        edits,
        fc.uniqueArray(change, {
          maxLength: 12,
          selector: (each) => `${each.target}:${each.field}`,
        }),
        fc.nat({ max: 3 }),
        fc.nat({ max: 3 }),
        ({ base }, changes, oursAdd, theirsAdd) => {
          const model = base.model;
          const left = structuredClone(model);
          const right = structuredClone(model);
          const expected = structuredClone(model);
          // One change for each key of each element, on one side or the other.
          const taken = new Set<string>();
          for (const { target, field, side, value } of changes) {
            const at = target % Math.max(1, model.elements.length);
            if (taken.has(`${at}:${field}`)) continue;
            taken.add(`${at}:${field}`);
            for (const copy of [side ? left : right, expected]) {
              const element = copy.elements[at] as Record<string, unknown> | undefined;
              if (!element) continue;
              const [head, tail] = field.split('.') as [string, string | undefined];
              if (tail === undefined) element[head] = `${value} ${head}`;
              else element[head] = { ...(element[head] as object | undefined), [tail]: value };
            }
          }
          for (let n = 0; n < oursAdd; n++) {
            for (const copy of [left, expected]) {
              copy.elements.push({ id: `ours-${n}`, component: 'test.box', name: `Ours ${n}` });
            }
          }
          for (let n = 0; n < theirsAdd; n++) {
            for (const copy of [right, expected]) {
              copy.elements.push({ id: `theirs-${n}`, component: 'test.box', name: `Theirs ${n}` });
            }
          }
          const byId = (file: ModelFile) =>
            new Map([...file.elements, ...file.relations].map((each) => [each.id, each]));
          for (const [mine, yours] of [
            [left, right],
            [right, left],
          ] as const) {
            const merged = mergeFile('model', model, mine, yours, { nesting });
            expect(merged.conflicts).toEqual([]);
            expect(byId(merged.file)).toEqual(byId(expected));
            expect(contentOf(merged.file).world).toEqual(model.world);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

function keyOf(ref: ConflictFile): string {
  return ref.kind === 'project' || ref.kind === 'model' ? ref.kind : `${ref.kind}:${ref.id}`;
}
