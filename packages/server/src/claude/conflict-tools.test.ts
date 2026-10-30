/**
 * Claude's tools for the conflicts a merge left in the project's files (ADR 0072): `list_conflicts`
 * reads them with what each file keeps and the other choice, and `resolve_conflicts` keeps or takes
 * the other choice, one at a time or for a whole file, as one action of Claude's that the person can
 * undo; while the person reviews Claude's changes it is refused. The whole way goes from an MCP client
 * through the bridge to a running program.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { FileConflict } from '@visual-anything/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { openPreferences } from '../preferences';
import { testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

const SIDES = { ours: 'HEAD', theirs: 'feature/rename' };

const MODEL_CONFLICTS: FileConflict[] = [
  {
    id: 'conflict-1',
    item: 'element:api',
    path: ['name'],
    why: 'both-changed',
    kept: 'ours',
    other: 'Gateway',
    base: 'Service',
    sides: SIDES,
  },
  {
    id: 'conflict-2',
    item: 'element:cart',
    path: [],
    why: 'removed-and-changed',
    kept: 'ours',
    base: { id: 'cart', component: 'shop.cart', name: 'Cart' },
    sides: SIDES,
  },
];

const VIEW_CONFLICTS: FileConflict[] = [
  {
    id: 'conflict-1',
    item: 'position:customer',
    path: ['x'],
    why: 'both-changed',
    kept: 'theirs',
    other: -100,
    base: -300,
  },
  {
    id: 'conflict-2',
    item: 'view',
    path: ['name'],
    why: 'both-changed',
    kept: 'ours',
    other: 'The overview',
    base: 'Overview',
  },
];

/** The test project, with conflicts a merge left in its model and its view. */
function conflicted(): ProjectSnapshot {
  const project = testProject();
  return {
    ...project,
    model: { ...project.model, conflicts: MODEL_CONFLICTS },
    views: project.views.map((view) => ({ ...view, conflicts: VIEW_CONFLICTS })),
  };
}

async function harness(options: { review?: boolean; project?: ProjectSnapshot } = {}) {
  const { store } = await openPreferences(null);
  if (options.review === true) await store.set({ reviewClaude: true });
  const started = await startToolHarness(options.project ?? conflicted(), { preferences: store });
  tools = started;
  return {
    session: started.session,
    value: (name: string, args?: Record<string, unknown>) => started.value(name, args),
    failure: (name: string, args?: Record<string, unknown>) => started.failure(name, args),
  };
}

describe('the conflict tools', () => {
  it('are listed, one a read and one a write, with examples', () => {
    const list = TOOLS.find((each) => each.name === 'list_conflicts');
    const resolve = TOOLS.find((each) => each.name === 'resolve_conflicts');
    expect(list?.hints.readOnlyHint).toBe(true);
    expect(resolve?.hints.readOnlyHint).toBe(false);
    expect(list?.description).toMatch(/^Example: \{/m);
    expect(resolve?.description).toMatch(/^Example: \{/m);
  });
});

describe('list_conflicts', () => {
  it('says when no file holds any', async () => {
    const { value } = await harness({ project: testProject() });
    expect(await value('list_conflicts')).toEqual({
      total: 0,
      files: [],
      note: 'No file of the project holds conflicts.',
    });
  });

  it('lists each file’s conflicts, with what it keeps and the other choice', async () => {
    const { value } = await harness();
    const answer = await value('list_conflicts');
    expect(answer.total).toBe(4);
    expect(answer.files).toEqual([
      {
        file: { kind: 'model', name: 'the model' },
        total: 2,
        conflicts: [
          {
            conflict: 'conflict-1',
            item: 'element:api',
            path: ['name'],
            why: 'both-changed',
            kept: 'ours',
            sides: SIDES,
            keeps: 'API',
            other: 'Gateway',
            base: 'Service',
          },
          {
            conflict: 'conflict-2',
            item: 'element:cart',
            why: 'removed-and-changed',
            kept: 'ours',
            sides: SIDES,
            keeps: {
              id: 'cart',
              component: 'shop.cart',
              name: 'Cart',
              appearance: { fill: '#F8E1EC' },
            },
            other: 'removed: taking the other choice removes the item, with what ends on it',
            base: { id: 'cart', component: 'shop.cart', name: 'Cart' },
          },
        ],
      },
      {
        file: { kind: 'view', id: 'overview', name: 'Overview' },
        total: 2,
        conflicts: [
          expect.objectContaining({ conflict: 'conflict-1', keeps: -250, other: -100 }),
          expect.objectContaining({
            conflict: 'conflict-2',
            keeps: 'Overview',
            other: 'The overview',
          }),
        ],
      },
    ]);
  });

  it('gives an order, and a scenario’s step, by what names them', async () => {
    const project = testProject();
    const order = ['cart', 'customer', 'db', 'api', 'system'];
    const { value } = await harness({
      project: {
        ...project,
        model: {
          ...project.model,
          conflicts: [
            { id: 'conflict-1', item: 'order', path: [], why: 'order', kept: 'ours', other: order },
          ],
        },
        scenarios: project.scenarios.map((scenario) => ({
          ...scenario,
          conflicts: [
            {
              id: 'conflict-1',
              item: 'step:read',
              path: ['description'],
              why: 'both-changed',
              kept: 'ours',
              other: 'The API reads the database.',
            },
          ],
        })),
      },
    });
    const answer = await value('list_conflicts');
    expect(answer.files).toEqual([
      expect.objectContaining({
        file: { kind: 'model', name: 'the model' },
        conflicts: [
          expect.objectContaining({
            keeps: ['system', 'api', 'db', 'customer', 'cart'],
            other: order,
          }),
        ],
      }),
      expect.objectContaining({
        file: { kind: 'scenario', id: 'request', name: 'A request' },
        conflicts: [
          expect.objectContaining({
            item: 'step:read',
            keeps: 'The API reads the DB.',
            other: 'The API reads the database.',
          }),
        ],
      }),
    ]);
  });

  it('keeps to a kind of file, or one file, and pages', async () => {
    const { value } = await harness();
    const views = await value('list_conflicts', { kind: 'view', id: 'overview' });
    expect(views).toMatchObject({ total: 2, files: [{ file: { kind: 'view', id: 'overview' } }] });
    expect(await value('list_conflicts', { kind: 'scenario' })).toMatchObject({
      total: 0,
      note: 'No file of these holds conflicts.',
    });
    const later = await value('list_conflicts', { offset: 3 });
    expect(later).toMatchObject({
      total: 4,
      files: [{ file: { kind: 'view' }, conflicts: [{ conflict: 'conflict-2' }] }],
    });
    expect(later).not.toHaveProperty('next');
  });
});

describe('resolve_conflicts', () => {
  it('takes the other choice of one conflict, as one action of Claude’s', async () => {
    const { value, session } = await harness();
    const answer = await value('resolve_conflicts', {
      kind: 'model',
      resolutions: [{ conflict: 'conflict-1', take: 'other' }],
    });
    expect(answer).toMatchObject({
      done: 'Resolve a conflict in the model',
      undo: 'The person can undo it in the app.',
      resolved: 1,
      left: 1,
    });
    expect(answer).not.toHaveProperty('note');
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    expect(session.snapshot.model.conflicts?.map((each) => each.id)).toEqual(['conflict-2']);
    expect(session.history.undo).toEqual({
      label: 'Resolve a conflict in the model',
      author: 'claude',
    });
  });

  it('resolves a whole file, and says it can then be added with git', async () => {
    const { value, session } = await harness();
    const answer = await value('resolve_conflicts', { kind: 'view', id: 'overview', all: 'kept' });
    expect(answer).toMatchObject({
      done: 'Resolve 2 conflicts in the view "Overview"',
      resolved: 2,
      left: 0,
      note: expect.stringMatching(/git add/) as unknown,
    });
    const view = session.snapshot.views[0];
    expect(view?.conflicts).toBeUndefined();
    expect(view?.name).toBe('Overview');
  });

  it('removes an item when the other choice is its removal, with what ends on it', async () => {
    const { value, session } = await harness();
    await value('resolve_conflicts', {
      kind: 'model',
      resolutions: [{ conflict: 'conflict-2', take: 'other' }],
    });
    expect(session.snapshot.model.elements.some((each) => each.id === 'cart')).toBe(false);
  });

  it('can be undone by the person', async () => {
    const { value, session } = await harness();
    await value('resolve_conflicts', { kind: 'model', all: 'other' });
    expect(session.snapshot.model.conflicts).toBeUndefined();
    const undone = await session.undo();
    expect(undone.ok).toBe(true);
    expect(session.snapshot.model.conflicts).toEqual(MODEL_CONFLICTS);
    expect(session.snapshot.model.elements.find((each) => each.id === 'api')?.name).toBe('API');
  });

  it('refuses what names no conflict, a file without conflicts, or no choice', async () => {
    const { failure } = await harness();
    expect(
      await failure('resolve_conflicts', {
        kind: 'model',
        resolutions: [{ conflict: 'conflict-9', take: 'kept' }],
      }),
    ).toMatch(/^Refused, so nothing changed: There is no conflict "conflict-9" in the model/);
    expect(await failure('resolve_conflicts', { kind: 'project', all: 'kept' })).toMatch(
      /The project file holds no conflicts/,
    );
    expect(
      await failure('resolve_conflicts', { kind: 'scenario', id: 'request', all: 'kept' }),
    ).toMatch(/The scenario "request" holds no conflicts/);
    expect(await failure('resolve_conflicts', { kind: 'view', all: 'kept' })).toBe(
      'A view file is named by its id.',
    );
    expect(await failure('resolve_conflicts', { kind: 'model' })).toMatch(
      /Give either resolutions/,
    );
    expect(
      await failure('resolve_conflicts', {
        kind: 'model',
        all: 'kept',
        resolutions: [{ conflict: 'conflict-1', take: 'kept' }],
      }),
    ).toMatch(/Give either resolutions/);
  });

  it('is refused while the person reviews Claude’s changes, and changes nothing', async () => {
    const { failure, session } = await harness({ review: true });
    expect(await failure('resolve_conflicts', { kind: 'model', all: 'kept' })).toMatch(
      /^Refused, so nothing changed: /,
    );
    expect(session.snapshot.model.conflicts).toEqual(MODEL_CONFLICTS);
    expect(session.proposed).toBeUndefined();
  });
});
