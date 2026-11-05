import type { ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';
import {
  folderPaths,
  folderTree,
  listedViews,
  moved,
  renamedFolder,
  withoutFolder,
  type OrganizedEntry,
} from './view-folders';

function view(id: string): ViewFile {
  return {
    id,
    name: id.toUpperCase(),
    perspective: { name: 'Data flow' },
    nestingRelationTypes: [],
    positions: [],
    freeShapes: [],
  };
}

/** The test project with views a, b, c and d besides its own. */
function withViews(): ProjectSnapshot {
  const project = testProject();
  return { ...project, views: [...project.views, ...['a', 'b', 'c', 'd'].map(view)] };
}

function ok(command: Command, state: ProjectSnapshot): Extract<CommandOutcome, { ok: true }> {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  return outcome;
}

function rejected(command: Command, state: ProjectSnapshot): ProblemCode[] {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const names = (state: ProjectSnapshot) =>
  listedViews(state.project, state.views).map((entry) =>
    entry.kind === 'view' ? entry.view.id : `${entry.name}/`,
  );

describe('organize-views', () => {
  it('files views in nested folders, names new folders, and is one undoable action', () => {
    const state = withViews();
    const outcome = ok(
      {
        type: 'organize-views',
        viewFolders: [
          {
            name: 'Stories',
            entries: [{ view: 'b' }, { name: 'Ticket 12', entries: [{ view: 'a' }] }],
          },
          { view: 'd' },
        ],
      },
      state,
    );
    expect(outcome.label).toBe('Organize the views');
    expect(outcome.state.project.viewFolders).toEqual([
      {
        folder: 'stories-1',
        name: 'Stories',
        entries: [
          { view: 'b' },
          { folder: 'ticket-12-2', name: 'Ticket 12', entries: [{ view: 'a' }] },
        ],
      },
      { view: 'd' },
    ]);
    // The views it does not name come after it, in the project's order.
    expect(names(outcome.state)).toEqual(['Stories/', 'd', 'overview', 'c']);
  });

  it('keeps the ids of the folders it is given, and leaves the folders out of the file once empty', () => {
    const state = withViews();
    const filed = ok(
      { type: 'organize-views', viewFolders: [{ folder: 'mine', name: 'Mine', entries: [] }] },
      state,
    ).state;
    expect(filed.project.viewFolders).toEqual([{ folder: 'mine', name: 'Mine', entries: [] }]);
    const emptied = ok({ type: 'organize-views', viewFolders: [] }, filed).state;
    expect('viewFolders' in emptied.project).toBe(false);
  });

  it('refuses a view that does not exist, a view or folder named twice, and a folder without a name', () => {
    const state = withViews();
    expect(rejected({ type: 'organize-views', viewFolders: [{ view: 'nope' }] }, state)).toEqual([
      'unknown-view',
    ]);
    expect(
      rejected(
        {
          type: 'organize-views',
          viewFolders: [{ view: 'a' }, { name: 'F', entries: [{ view: 'a' }] }],
        },
        state,
      ),
    ).toEqual(['invalid-command']);
    expect(
      rejected(
        {
          type: 'organize-views',
          viewFolders: [
            { folder: 'f', name: 'F', entries: [] },
            { folder: 'f', name: 'G', entries: [] },
          ],
        },
        state,
      ),
    ).toEqual(['invalid-command']);
    expect(
      rejected({ type: 'organize-views', viewFolders: [{ name: ' ', entries: [] }] }, state),
    ).toHaveLength(1);
  });
});

describe('create-view and delete-view', () => {
  const filed = () =>
    ok(
      {
        type: 'organize-views',
        viewFolders: [{ folder: 'f', name: 'F', entries: [{ view: 'a' }] }, { view: 'b' }],
      },
      withViews(),
    ).state;

  it('files a new view last in the folder it names', () => {
    const outcome = ok(
      { type: 'create-view', view: { name: 'New', perspective: { name: 'Cost' } }, folder: 'f' },
      filed(),
    );
    const [id] = outcome.created;
    expect(outcome.state.project.viewFolders?.[0]).toEqual({
      folder: 'f',
      name: 'F',
      entries: [{ view: 'a' }, { view: id }],
    });
  });

  it('refuses a folder that does not exist', () => {
    expect(
      rejected(
        {
          type: 'create-view',
          view: { name: 'New', perspective: { name: 'Cost' } },
          folder: 'nope',
        },
        filed(),
      ),
    ).toEqual(['unknown-folder']);
  });

  it('takes a deleted view out of the folders in the same action', () => {
    const outcome = ok({ type: 'delete-view', id: 'a' }, filed());
    expect(outcome.state.project.viewFolders).toEqual([
      { folder: 'f', name: 'F', entries: [] },
      { view: 'b' },
    ]);
  });
});

describe('listedViews', () => {
  it('ignores entries for views that do not exist and a view named a second time', () => {
    const state = withViews();
    const project = {
      ...state.project,
      viewFolders: [
        { view: 'gone' },
        { folder: 'f', name: 'F', entries: [{ view: 'a' }, { view: 'gone' }] },
        { view: 'a' },
      ],
    };
    const listed = listedViews(project, state.views);
    expect(listed[0]).toMatchObject({ kind: 'folder', id: 'f', parent: undefined });
    expect(listed[0]?.kind === 'folder' && listed[0].entries).toEqual([
      expect.objectContaining({ kind: 'view', folder: 'f' }),
    ]);
    expect(folderTree(project, state.views)).toEqual([
      { folder: 'f', name: 'F', entries: [{ view: 'a' }] },
      { view: 'overview' },
      { view: 'b' },
      { view: 'c' },
      { view: 'd' },
    ]);
  });
});

describe('tree changes', () => {
  const tree: OrganizedEntry[] = [
    { folder: 'f', name: 'F', entries: [{ view: 'a' }, { folder: 'g', name: 'G', entries: [] }] },
    { view: 'b' },
    { view: 'c' },
  ];

  it('moves a view into a folder, and within the same list by its index before the move', () => {
    expect(moved(tree, { view: 'b' }, { folder: 'g' })).toEqual([
      {
        folder: 'f',
        name: 'F',
        entries: [{ view: 'a' }, { folder: 'g', name: 'G', entries: [{ view: 'b' }] }],
      },
      { view: 'c' },
    ]);
    expect(moved(tree, { view: 'b' }, { index: 3 })).toEqual([
      tree[0],
      { view: 'c' },
      { view: 'b' },
    ]);
  });

  it('never moves a folder into itself or a folder it holds', () => {
    expect(moved(tree, { folder: 'f' }, { folder: 'f' })).toBeUndefined();
    expect(moved(tree, { folder: 'f' }, { folder: 'g' })).toBeUndefined();
  });

  it('deletes a folder by putting what it held in its place, and renames one', () => {
    expect(withoutFolder(tree, 'f')).toEqual([
      { view: 'a' },
      { folder: 'g', name: 'G', entries: [] },
      { view: 'b' },
      { view: 'c' },
    ]);
    expect(folderPaths(renamedFolder(tree, 'g', 'Detail') as never)).toEqual([
      { folder: 'f', name: 'F', path: [] },
      { folder: 'g', name: 'Detail', path: ['F'] },
    ]);
  });

  it('keeps every view exactly once whatever is moved where', () => {
    const views = ['a', 'b', 'c'];
    const refs = [
      { view: 'a' },
      { view: 'b' },
      { view: 'c' },
      { folder: 'f' },
      { folder: 'g' },
    ] as const;
    const places = [undefined, 'f', 'g'] as const;
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom(...refs),
            fc.constantFrom(...places),
            fc.option(fc.nat(4), { nil: undefined }),
          ),
          { maxLength: 12 },
        ),
        (moves) => {
          let current: OrganizedEntry[] = tree;
          for (const [ref, folder, index] of moves) {
            current =
              moved(current, ref, {
                ...(folder === undefined ? {} : { folder }),
                ...(index === undefined ? {} : { index }),
              }) ?? current;
          }
          const found: string[] = [];
          const folders: string[] = [];
          const walk = (entries: readonly OrganizedEntry[]) => {
            for (const entry of entries) {
              if ('view' in entry) found.push(entry.view);
              else {
                folders.push(entry.folder ?? '');
                walk(entry.entries);
              }
            }
          };
          walk(current);
          expect(found.sort()).toEqual(views);
          expect(folders.sort()).toEqual(['f', 'g']);
        },
      ),
    );
  });
});
