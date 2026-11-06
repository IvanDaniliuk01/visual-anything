import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PANE_SHARE,
  PANES_STORAGE_KEY,
  SplitPanes,
  minimumShare,
  panesKey,
  readPanes,
  type PaneStorage,
} from './panes';

/** Storage in memory, as the tab's session storage would keep it. */
function memory(initial?: unknown): PaneStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  if (initial !== undefined) kept.set(PANES_STORAGE_KEY, JSON.stringify(initial));
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
}

const views = (store: SplitPanes) => store.snapshot().panes.map((pane) => pane.view);
const widths = (store: SplitPanes) => store.snapshot().panes.map((pane) => pane.width);

afterEach(() => {
  vi.useRealTimers();
});

describe('the split view’s panes', () => {
  it('start as one pane, on the project’s first view, and keep nothing', () => {
    const storage = memory();
    const store = new SplitPanes(storage);
    expect(views(store)).toEqual([undefined]);
    store.open('storage');
    expect(views(store)).toEqual(['storage']);
    expect(storage.kept.size).toBe(0);
  });

  it('open a view right of the active pane, sharing the width alike, the active one staying', () => {
    const store = new SplitPanes(memory());
    store.openBeside('b', 'a');
    expect(views(store)).toEqual(['a', 'b']);
    store.openBeside('c', 'a');
    expect(views(store)).toEqual(['a', 'c', 'b']);
    expect(widths(store)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(store.active.view).toBe('a');
  });

  it('open a fourth view in the rightmost pane but the active one', () => {
    const store = new SplitPanes(memory());
    store.openBeside('b', 'a');
    store.openBeside('c', 'a');
    const [, , last] = store.snapshot().panes;
    store.activate(last!.id);
    store.openBeside('d');
    expect(views(store)).toEqual(['a', 'd', 'b']);
    expect(store.snapshot().panes).toHaveLength(3);
  });

  it('open a view in the active pane, or make active the pane that shows it', () => {
    const store = new SplitPanes(memory());
    store.openBeside('b', 'a');
    store.open('b');
    expect(views(store)).toEqual(['a', 'b']);
    expect(store.active.view).toBe('b');
    store.open('c');
    expect(views(store)).toEqual(['a', 'c']);
  });

  it('close a pane, the others sharing its width, and the last one never', () => {
    const store = new SplitPanes(memory());
    store.openBeside('b', 'a');
    store.openBeside('c', 'a');
    const [first, second] = store.snapshot().panes;
    store.resize(0, 0.1);
    store.close(second!.id);
    expect(views(store)).toEqual(['a', 'b']);
    expect(widths(store).reduce((sum, width) => sum + width, 0)).toBeCloseTo(1);
    expect(widths(store)[0]).toBeGreaterThan(0.5);
    // The active one closing makes its neighbor active.
    store.close(first!.id);
    expect(views(store)).toEqual(['b']);
    expect(store.active.view).toBe('b');
    expect(widths(store)).toEqual([1]);
    store.close(store.active.id);
    expect(views(store)).toEqual(['b']);
  });

  it('move a border, keeping each pane beside it at its least width', () => {
    const store = new SplitPanes(memory());
    store.openBeside('b', 'a');
    store.resize(0, 0.2);
    expect(widths(store)[0]).toBeCloseTo(0.7);
    store.resize(0, 1);
    expect(widths(store)[0]).toBeCloseTo(1 - MIN_PANE_SHARE);
    store.resize(0, -1, 0.3);
    expect(widths(store)).toEqual([0.3, 0.7]);
  });

  it('take a least width from the canvas area’s, and a share where it is not known', () => {
    expect(minimumShare(0)).toBe(MIN_PANE_SHARE);
    expect(minimumShare(1200)).toBeCloseTo(0.2);
    expect(minimumShare(10_000)).toBe(MIN_PANE_SHARE);
  });

  it('are kept in the tab’s storage while two or more show, cameras with them', () => {
    vi.useFakeTimers();
    const storage = memory();
    const store = new SplitPanes(storage);
    store.openBeside('b', 'a');
    const [, beside] = store.snapshot().panes;
    store.keepCamera(beside!.id, { x: 1, y: 2, scale: 3 });
    vi.advanceTimersByTime(1000);
    const kept = readPanes(storage);
    expect(kept?.layout.panes.map((pane) => pane.view)).toEqual(['a', 'b']);
    expect(kept?.cameras.get(beside!.id)).toEqual({ x: 1, y: 2, scale: 3 });
    store.close(beside!.id);
    expect(storage.kept.has(PANES_STORAGE_KEY)).toBe(false);
  });

  it('come back from the tab’s storage, the inactive panes’ cameras once', () => {
    const store = new SplitPanes(
      memory({
        active: 'pane-4',
        panes: [
          { id: 'pane-4', view: 'a', width: 1, camera: { x: 0, y: 0, scale: 1 } },
          { id: 'pane-7', view: 'b', width: 3, camera: { x: 5, y: 6, scale: 2 } },
        ],
      }),
    );
    expect(views(store)).toEqual(['a', 'b']);
    expect(widths(store)).toEqual([0.25, 0.75]);
    // The active pane's camera comes back with the view address instead.
    expect(store.takeCamera('pane-4')).toBeUndefined();
    expect(store.takeCamera('pane-7')).toEqual({ x: 5, y: 6, scale: 2 });
    expect(store.takeCamera('pane-7')).toBeUndefined();
    store.openBeside('c');
    expect(store.snapshot().panes.map((pane) => pane.id)).toEqual(['pane-4', 'pane-8', 'pane-7']);
  });

  it.each([
    ['not JSON', '{'],
    ['one pane', { active: 'pane-1', panes: [{ id: 'pane-1', width: 1 }] }],
    [
      'four panes',
      {
        active: 'pane-1',
        panes: [1, 2, 3, 4].map((number) => ({ id: `pane-${number}`, width: 1 })),
      },
    ],
    [
      'an active pane that is not there',
      {
        active: 'pane-9',
        panes: [
          { id: 'pane-1', width: 1 },
          { id: 'pane-2', width: 1 },
        ],
      },
    ],
    [
      'an id of another form',
      {
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 1 },
          { id: 'x', width: 1 },
        ],
      },
    ],
    [
      'the same id twice',
      {
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 1 },
          { id: 'pane-1', width: 1 },
        ],
      },
    ],
    [
      'a width of nothing',
      {
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 0 },
          { id: 'pane-2', width: 1 },
        ],
      },
    ],
    [
      'a view that is no id',
      {
        active: 'pane-1',
        panes: [
          { id: 'pane-1', view: 3, width: 1 },
          { id: 'pane-2', width: 1 },
        ],
      },
    ],
  ])('pass over %s in the tab’s storage', (_, stored) => {
    const storage = memory();
    storage.kept.set(
      PANES_STORAGE_KEY,
      typeof stored === 'string' ? stored : JSON.stringify(stored),
    );
    expect(readPanes(storage)).toBeUndefined();
    expect(views(new SplitPanes(storage))).toEqual([undefined]);
  });

  it('pass over a camera that is no camera, keeping the panes', () => {
    const kept = readPanes(
      memory({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 1, camera: { x: 0, y: 0, scale: 0 } },
          { id: 'pane-2', width: 1, camera: { x: 'far', y: 0, scale: 1 } },
        ],
      }),
    );
    expect(kept?.layout.panes).toHaveLength(2);
    expect(kept?.cameras.size).toBe(0);
  });

  it('give each pane at least its least share of the width as they come back', () => {
    const kept = readPanes(
      memory({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', width: 0.0001 },
          { id: 'pane-2', width: 1 },
          { id: 'pane-3', width: 0.001 },
        ],
      }),
    );
    const shares = kept?.layout.panes.map((pane) => pane.width) ?? [];
    expect(shares[0]).toBeCloseTo(MIN_PANE_SHARE);
    expect(shares[1]).toBeCloseTo(0.8);
    expect(shares[2]).toBeCloseTo(MIN_PANE_SHARE);
  });

  it('come back for their project only, and not when one names a view it lacks', () => {
    const stored = {
      active: 'pane-1',
      panes: [
        { id: 'pane-1', view: 'a', width: 1 },
        { id: 'pane-2', view: 'b', width: 1 },
      ],
    };
    const storage = memory();
    storage.kept.set(panesKey('One'), JSON.stringify(stored));
    expect(views(new SplitPanes(storage, { name: 'Two', views: ['a', 'b'] }))).toEqual([undefined]);
    expect(views(new SplitPanes(storage, { name: 'One', views: ['a', 'b'] }))).toEqual(['a', 'b']);
    expect(views(new SplitPanes(storage, { name: 'One', views: ['a'] }))).toEqual([undefined]);
    // What names a view the project lacks is another project's of the same name: it stays.
    expect(storage.kept.has(panesKey('One'))).toBe(true);
    // What is malformed goes.
    storage.kept.set(panesKey('One'), '{');
    expect(views(new SplitPanes(storage, { name: 'One', views: ['a', 'b'] }))).toEqual([undefined]);
    expect(storage.kept.has(panesKey('One'))).toBe(false);
  });

  it('show the project’s first view in place of one deleted, and keep a split opened then', () => {
    const storage = memory();
    const store = new SplitPanes(storage, { name: 'One', views: ['x', 'w', 'z'] });
    store.open('x');
    store.setProject({ name: 'One', views: ['w', 'z'] });
    expect(views(store)).toEqual([undefined]);
    // The shell draws the project's first, W, and opens Z beside it.
    store.openBeside('z', 'w');
    expect(views(store)).toEqual(['w', 'z']);
    store.setProject({ name: 'One', views: ['w', 'z'] });
    expect(views(store)).toEqual(['w', 'z']);
    expect(readPanes(storage, panesKey('One'), ['w', 'z'])?.layout.panes).toHaveLength(2);
  });

  it('name the view the active pane draws as another opens beside it, for one gone', () => {
    const store = new SplitPanes(memory(), { name: 'One', views: ['x', 'w', 'z'] });
    store.openBeside('z', 'x');
    expect(views(store)).toEqual(['x', 'z']);
    // The active pane names X, but draws W, as when X is gone: W is the view it shows from then on.
    store.close(store.snapshot().panes[1]!.id);
    store.openBeside('z', 'w');
    expect(views(store)).toEqual(['w', 'z']);
  });

  it('keep their panes as the project is renamed, with the same views', () => {
    const storage = memory();
    const store = new SplitPanes(storage, { name: 'One', views: ['a', 'b'] });
    store.openBeside('b', 'a');
    store.setProject({ name: 'Uno', views: ['b', 'a'] });
    expect(views(store)).toEqual(['a', 'b']);
    expect(readPanes(storage, panesKey('Uno'), ['a', 'b'])?.layout.panes).toHaveLength(2);
    // A project of another name and other views brings its own.
    store.setProject({ name: 'Two', views: ['c'] });
    expect(views(store)).toEqual([undefined]);
  });

  it('close the panes of a view gone from the project, down to one pane', () => {
    const storage = memory();
    const store = new SplitPanes(storage, { name: 'One', views: ['a', 'b', 'c'] });
    store.openBeside('b', 'a');
    store.openBeside('c');
    expect(views(store)).toEqual(['a', 'c', 'b']);
    const [, c] = store.snapshot().panes;
    store.activate(c!.id);
    store.setProject({ name: 'One', views: ['a', 'b'] });
    expect(views(store)).toEqual(['a', 'b']);
    // The active pane went: its left neighbor is active.
    expect(store.active.view).toBe('a');
    expect(widths(store)).toEqual([0.5, 0.5]);
    store.setProject({ name: 'One', views: ['a'] });
    expect(views(store)).toEqual(['a']);
    expect(storage.kept.has(panesKey('One'))).toBe(false);
  });

  it('follow another project to its own panes, keeping this one’s', () => {
    const storage = memory();
    const store = new SplitPanes(storage, { name: 'One', views: ['a', 'b'] });
    store.openBeside('b', 'a');
    store.setProject({ name: 'Two', views: ['x'] });
    expect(views(store)).toEqual([undefined]);
    store.setProject({ name: 'One', views: ['a', 'b'] });
    expect(views(store)).toEqual(['a', 'b']);
  });
});
