import {
  executeCommand,
  type Command,
  type Operation,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { FileConflict } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { affectedFiles, contentOf, liveFiles } from './file-plan';
import { testProject } from './test-support';

/** Runs a command on a project and returns the files it affects. */
function affected(command: Command, state: ProjectSnapshot = testProject()) {
  let n = 0;
  const outcome = executeCommand(state, command, { newId: (base) => `${base}-${(n += 1)}` });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return { files: affectedFiles(outcome.operations, state, outcome.state), outcome };
}

/** The test project with a second view, which no scenario plays over. */
function withSecondView(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    views: [
      ...state.views,
      {
        id: 'second',
        name: 'Second',
        perspective: { name: 'Ownership' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
      },
    ],
  };
}

describe('affectedFiles', () => {
  it('saves the model file for a change to an element or a relation', () => {
    expect(
      affected({ type: 'update-element', id: 'api', changes: { name: 'Gateway' } }).files,
    ).toEqual(['model']);
    expect(
      affected({
        type: 'create-relation',
        relation: { relationType: 'systems.communicates-with', from: 'customer', to: 'db' },
      }).files,
    ).toEqual(['model']);
  });

  it('saves the model file for a change to World', () => {
    expect(
      affected({ type: 'update-element', id: 'world', changes: { name: 'Everything' } }).files,
    ).toEqual(['model']);
  });

  it('saves the view file for a move, a free shape or a change to the view', () => {
    expect(
      affected({
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'customer', x: 10, y: 10, pinned: true }],
      }).files,
    ).toEqual(['view:overview']);
    expect(
      affected({
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
      }).files,
    ).toEqual(['view:overview']);
    expect(
      affected({ type: 'update-view', id: 'overview', changes: { name: 'Big picture' } }).files,
    ).toEqual(['view:overview']);
    expect(
      affected({
        type: 'restack',
        view: 'overview',
        moves: [{ shape: { element: 'customer' }, to: 'back' }],
      }).files,
    ).toEqual(['view:overview']);
  });

  it('saves every file a command touches', () => {
    expect(
      affected({
        type: 'create-element',
        element: { component: 'systems.service', name: 'Worker' },
        containers: [{ container: 'system', relationType: 'systems.is-part-of' }],
        positions: [{ view: 'overview', container: 'system', x: 200, y: 40 }],
      }).files,
    ).toEqual(['model', 'view:overview']);
  });

  it('saves the model and the view for a change of container, and only the view for a restack', () => {
    // Putting the Customer inside the Shop system relates them, and places it and orders it there.
    expect(
      affected({
        type: 'change-container',
        view: 'overview',
        to: 'system',
        shapes: [{ element: 'customer', at: { x: 24, y: 48 } }],
      }).files,
    ).toEqual(['model', 'view:overview']);
    // Taking the API out deletes the relation that placed it, and brings it to World's front.
    expect(
      affected({
        type: 'change-container',
        view: 'overview',
        shapes: [{ element: 'api', from: 'system' }],
      }).files,
    ).toEqual(['model', 'view:overview']);
  });

  it('saves the files that a delete cascades to', () => {
    expect(affected({ type: 'delete', elements: ['db'] }).files).toEqual([
      'model',
      'view:overview',
    ]);
  });

  it('saves a new view to its own file, and a deleted one by removing it', () => {
    const created = affected({
      type: 'create-view',
      view: { id: 'flows', name: 'Flows', perspective: { name: 'Data flow' } },
    });
    expect(created.files).toEqual(['view:flows']);

    expect(affected({ type: 'delete-view', id: 'second' }, withSecondView()).files).toEqual([
      'view:second',
    ]);
  });

  it('saves the file of each scenario created, changed or deleted', () => {
    expect(
      affected({
        type: 'create-scenario',
        scenario: { id: 'checkout', name: 'Checkout', view: 'overview', steps: [] },
      }).files,
    ).toEqual(['scenario:checkout']);
    expect(
      affected({ type: 'update-scenario', id: 'request', changes: { name: 'A call' } }).files,
    ).toEqual(['scenario:request']);
    expect(affected({ type: 'delete-scenario', id: 'request' }).files).toEqual([
      'scenario:request',
    ]);
  });

  it("saves a package's file for a change to its definitions", () => {
    expect(
      affected({
        type: 'define-component',
        package: 'shop',
        component: { id: 'shop.till', name: 'Till', derivesFrom: 'systems.box' },
      }).files,
    ).toEqual(['package:shop']);
    expect(affected({ type: 'remove-relation-type', id: 'shop.holds' }).files).toEqual([
      'package:shop',
    ]);
  });

  it('saves a new package to its own file, and the project file that lists it', () => {
    expect(
      affected({ type: 'create-package', package: { id: 'tools', name: 'Tools' } }).files,
    ).toEqual(['project', 'package:tools']);
  });

  it('saves only the project file when a built-in package starts being used', () => {
    const empty: ProjectSnapshot = {
      project: { schemaVersion: 1, name: 'Empty', packages: [] },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [],
        relations: [],
      },
      packages: [],
      views: [],
      scenarios: [],
      tours: [],
      comments: [],
    };
    const { files, outcome } = affected(
      { type: 'update-project', changes: { packages: ['systems'] } },
      empty,
    );
    expect(outcome.operations.map((operation) => operation.op)).toEqual(['insert', 'set-project']);
    expect(files).toEqual(['project']);
  });

  it('saves the file of every view in a list replaced whole', () => {
    const before = withSecondView();
    const [overview] = before.views;
    const after: ProjectSnapshot = { ...before, views: overview ? [overview] : [] };
    const operations: Operation[] = [
      { op: 'replace-all', collection: { name: 'views' }, items: after.views },
    ];
    expect(affectedFiles(operations, before, after)).toEqual(['view:overview', 'view:second']);
  });

  // Each tour and each thread of comments lives in a file of its own (ADR 0058, ADR 0059).
  it('saves the file of each tour and each thread its operations touch, and only those', () => {
    const before = withTourAndThread();
    const [tour] = before.tours;
    const [thread] = before.comments;
    if (tour === undefined || thread === undefined) throw new Error('The fixture has no tour.');
    const renamed = { ...tour, name: 'Renamed' };
    const after: ProjectSnapshot = { ...before, tours: [renamed], comments: [] };
    const operations: Operation[] = [
      { op: 'replace', collection: { name: 'tours' }, item: renamed },
      { op: 'remove', collection: { name: 'comments' }, key: thread.id },
    ];
    expect(affectedFiles(operations, before, after)).toEqual(['tour:walk', 'comment:why']);
  });

  it('saves a new tour or thread to its own file, after every other kind', () => {
    const before = testProject();
    const { tours, comments } = withTourAndThread();
    const [tour] = tours;
    const [thread] = comments;
    if (tour === undefined || thread === undefined) throw new Error('The fixture has no tour.');
    const after: ProjectSnapshot = { ...before, tours, comments };
    const operations: Operation[] = [
      { op: 'insert', collection: { name: 'comments' }, index: 0, item: thread },
      { op: 'insert', collection: { name: 'tours' }, index: 0, item: tour },
      { op: 'set-world', world: { ...before.model.world, name: 'All' } },
    ];
    expect(affectedFiles(operations, before, after)).toEqual(['model', 'tour:walk', 'comment:why']);
  });

  // A file's conflicts from a merge change through set-conflicts alone (ADR 0072).
  it('saves the file whose conflicts a resolution takes away', () => {
    const state = testProject();
    const conflicts: FileConflict[] = [
      {
        id: 'conflict-1',
        item: 'view',
        path: ['name'],
        why: 'both-changed',
        kept: 'ours',
        other: 'Map',
      },
    ];
    const [view] = state.views;
    if (view === undefined) throw new Error('The fixture has no view.');
    const conflicted: ProjectSnapshot = {
      ...state,
      model: { ...state.model, conflicts: conflicts.map((each) => ({ ...each, item: 'world' })) },
      views: [{ ...view, conflicts }],
    };
    const resolve = (file: { kind: 'model' } | { kind: 'view'; id: string }) =>
      affected(
        {
          type: 'resolve-conflicts',
          file,
          resolutions: [{ conflict: 'conflict-1', take: 'other' }],
        },
        conflicted,
      ).files;
    expect(resolve({ kind: 'model' })).toEqual(['model']);
    expect(resolve({ kind: 'view', id: view.id })).toEqual([`view:${view.id}`]);
  });
});

/** The test project with a tour of its view and a thread about its API. */
function withTourAndThread(): ProjectSnapshot {
  return {
    ...testProject(),
    tours: [
      {
        id: 'walk',
        name: 'A walk',
        steps: [{ id: 'start', viewState: { view: 'overview' }, caption: { title: 'Start' } }],
      },
    ],
    comments: [
      {
        id: 'why',
        anchor: { kind: 'element', element: 'api' },
        comments: [
          {
            id: 'first',
            author: { kind: 'claude' },
            time: '2026-10-25T09:30:00.000Z',
            text: 'Why here?',
          },
        ],
      },
    ],
  };
}

describe('contentOf', () => {
  it('gives the kind of each file and the value it holds', () => {
    const state = testProject();
    expect(contentOf('project', state)).toEqual({ kind: 'project', value: state.project });
    expect(contentOf('model', state)).toEqual({ kind: 'model', value: state.model });
    expect(contentOf('package:shop', state)).toEqual({ kind: 'package', value: state.packages[1] });
    expect(contentOf('view:overview', state)).toEqual({ kind: 'view', value: state.views[0] });
    expect(contentOf('scenario:request', state)).toEqual({
      kind: 'scenario',
      value: state.scenarios[0],
    });
    const more = withTourAndThread();
    expect(contentOf('tour:walk', more)).toEqual({ kind: 'tour', value: more.tours[0] });
    expect(contentOf('comment:why', more)).toEqual({ kind: 'comment', value: more.comments[0] });
  });

  it('gives nothing for what the project does not hold, or holds without a file', () => {
    const state = testProject();
    expect(contentOf('view:gone', state)).toBeUndefined();
    expect(contentOf('scenario:gone', state)).toBeUndefined();
    expect(contentOf('tour:gone', state)).toBeUndefined();
    expect(contentOf('comment:gone', state)).toBeUndefined();
    expect(contentOf('package:gone', state)).toBeUndefined();
    expect(contentOf('package:systems', state)).toBeUndefined();
  });
});

describe('liveFiles', () => {
  it('lists every file the project has, leaving out built-in packages', () => {
    expect(liveFiles(testProject())).toEqual([
      'project',
      'model',
      'package:shop',
      'view:overview',
      'scenario:request',
    ]);
    expect(liveFiles(withTourAndThread()).slice(-2)).toEqual(['tour:walk', 'comment:why']);
  });
});
