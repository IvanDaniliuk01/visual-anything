import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultWatchMode, watchProject, type ProjectWatcher, type WatchMode } from './watcher';

/** The delay the tests watch with: short, so that they run fast. */
const DELAY = 40;
/** Long enough for a change that would be reported to have been reported. */
const QUIET = 400;

const native = process.platform === 'win32' || process.platform === 'darwin';
/** Every mode this platform can test: the recursive watcher is native only on Windows and macOS. */
const MODES: WatchMode[] = native ? ['recursive', 'folders'] : ['folders'];

describe('defaultWatchMode', () => {
  it('watches recursively where the platform does it natively, and folder by folder elsewhere', () => {
    expect(defaultWatchMode('win32')).toBe('recursive');
    expect(defaultWatchMode('darwin')).toBe('recursive');
    expect(defaultWatchMode('linux')).toBe('folders');
  });
});

describe.each(MODES)('watchProject, watching in %s mode', (mode) => {
  let folder: string;
  let reports: number;
  let errors: unknown[];
  let watcher: ProjectWatcher;

  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  };

  /** Waits until no report has come for a while, so that what comes next has a new cause. */
  const settled = async () => {
    let seen: number;
    do {
      seen = reports;
      await delay(DELAY * 3);
    } while (reports !== seen);
  };

  /** Does something once things are quiet, and waits for it to be reported. */
  const reported = async (action: () => Promise<unknown>) => {
    await settled();
    const before = reports;
    await action();
    await expect.poll(() => reports, { timeout: 5000 }).toBeGreaterThan(before);
  };

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'va-watch-'));
    await put('project.vaproject', 'project');
    await put('model.vamodel', 'model');
    await put('views/a.vaview', 'view a');
    reports = 0;
    errors = [];
    watcher = watchProject(folder, () => (reports += 1), {
      delay: DELAY,
      mode,
      onError: (error) => errors.push(error),
    });
  });

  afterEach(async () => {
    watcher.close();
    await rm(folder, { recursive: true, force: true, maxRetries: 10 });
    expect(errors).toEqual([]);
  });

  it('reports a project file that changes', async () => {
    await reported(() => put('model.vamodel', 'changed'));
  });

  it('reports a file added to a folder of the project, and one removed from it', async () => {
    await reported(() => put('views/b.vaview', 'view b'));
    await reported(() => unlink(join(folder, 'views', 'a.vaview')));
  });

  it('reports a file replaced by a rename, and every later change to it', async () => {
    const temporary = join(folder, '.model.vamodel.0a1b2c3d4e5f.va-tmp');
    await reported(async () => {
      await writeFile(temporary, 'replaced');
      await rename(temporary, join(folder, 'model.vamodel'));
    });
    await reported(() => put('model.vamodel', 'edited in place'));
    await reported(() => put('model.vamodel', 'edited again'));
  });

  it('reports a folder of the project that appears, and the files put in it later', async () => {
    await reported(() => mkdir(join(folder, 'scenarios')));
    await reported(() => put('scenarios/request.vascenario', 'scenario'));
    await reported(() => put('scenarios/request.vascenario', 'scenario, edited'));
  });

  // Tours and threads of comments (ADR 0058, ADR 0059).
  it('reports the tours and comments folders as they appear, and the files put in them', async () => {
    await reported(() => mkdir(join(folder, 'tours')));
    await reported(() => put('tours/walk.vatour', 'tour'));
    await reported(() => put('tours/walk.vatour', 'tour, edited'));
    await reported(() => put('comments/why.vacomment', 'thread'));
    await reported(() => unlink(join(folder, 'comments', 'why.vacomment')));
  });

  it('ignores what the tours and comments folders hold that is no tour or thread', async () => {
    await put('tours/notes.txt', 'not a tour');
    await put('comments/why.vatour', 'a tour in the wrong folder');
    await settled();
    const before = reports;
    await put('tours/notes.txt', 'still not a tour');
    await put('comments/why.vatour', 'still in the wrong folder');

    await delay(QUIET);
    expect(reports).toBe(before);
  });

  it('keeps watching a folder of the project that is removed and made again', async () => {
    await reported(() => rm(join(folder, 'views'), { recursive: true }));
    await reported(() => put('views/c.vaview', 'view c'));
    await reported(() => put('views/c.vaview', 'view c, edited'));
  });

  it('keeps watching a folder of the project that is replaced at once', async () => {
    // A checkout can remove a folder and make it again before the watcher hears of either.
    await reported(async () => {
      await rm(join(folder, 'views'), { recursive: true });
      await put('views/c.vaview', 'view c');
    });
    await reported(() => put('views/c.vaview', 'view c, edited'));
    await reported(() => put('views/d.vaview', 'view d'));
  });

  it('waits until the changes stop, then reports them once', async () => {
    // A delay far longer than the gaps between the writes, which a busy disk can stretch.
    watcher.close();
    watcher = watchProject(folder, () => (reports += 1), { delay: 300, maxDelay: 10_000, mode });
    for (const name of ['b', 'c', 'd', 'e']) {
      await put(`views/${name}.vaview`, name);
      await delay(10);
    }
    await put('model.vamodel', 'changed');

    await expect.poll(() => reports, { timeout: 5000 }).toBe(1);
    await delay(QUIET);
    expect(reports).toBe(1);
  });

  it('reports changes that never stop at least once every ten delays', async () => {
    const until = Date.now() + DELAY * 25;
    let n = 0;
    while (Date.now() < until) {
      await put('model.vamodel', `change ${(n += 1)}`);
      await delay(DELAY / 4);
    }
    expect(reports).toBeGreaterThanOrEqual(1);
  });

  it('ignores files that opening the project never reads', async () => {
    await put('README.md', 'notes');
    await put('stray.vaview', 'not in views/');
    await put('views/notes.txt', 'not a view');
    await put('views/old/archived.vaview', 'too deep');
    await put('.git/HEAD', 'ref: refs/heads/main');
    await put('.model.vamodel.0a1b2c3d4e5f.va-tmp', 'a temporary file');
    await put('views/.a.vaview.0a1b2c3d4e5f.va-tmp', 'another one');
    await unlink(join(folder, 'views/.a.vaview.0a1b2c3d4e5f.va-tmp'));

    await delay(QUIET);
    expect(reports).toBe(0);
  });

  it('reports nothing once closed', async () => {
    watcher.close();

    await put('model.vamodel', 'changed');

    await delay(QUIET);
    expect(reports).toBe(0);
  });
});
