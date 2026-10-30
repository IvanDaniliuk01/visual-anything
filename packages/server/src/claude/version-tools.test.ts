/**
 * Claude's tools for versions (ADR 0070, ADR 0071): `list_versions`, `compare_versions` with its pages
 * of 200 changes and one view, and `show_comparison`, which sends the guidance. The whole way goes from
 * an MCP client through the bridge to a running program on a project committed to a temporary git
 * repository.
 */
import type { Command } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openPreferences } from '../preferences';
import { NO_GIT, git } from '../versions/test-repositories';
import { INSTRUCTIONS } from './mcp';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS } from './tools';
import { MAX_CHANGES_PER_CALL } from './version-tools';

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

/** A program on the test project, its folder committed to a new repository unless said otherwise. */
async function harness(options: { commit?: boolean; review?: boolean } = {}) {
  const { store } = await openPreferences(null);
  if (options.review === true) await store.set({ reviewClaude: true });
  const started = await startToolHarness(undefined, { preferences: store });
  tools = started;
  const folder = started.session.folder;
  let head: string | undefined;
  if (options.commit !== false) {
    git(folder, 'init', '-q');
    git(folder, 'add', '-A');
    git(folder, 'commit', '-q', '-m', 'The shop as it was');
    head = git(folder, 'rev-parse', 'HEAD').trim();
  }
  return {
    session: started.session,
    folder,
    head: head ?? '',
    value: (name: string, args?: Record<string, unknown>) => started.value(name, args),
    failure: (name: string, args?: Record<string, unknown>) => started.failure(name, args),
    openApp: () => started.openApp(),
    guidanceOf: (app: Parameters<ToolHarness['guidanceOf']>[0]) => started.guidanceOf(app),
    asPerson: (command: Command) => started.asPerson(command),
  };
}

const RENAME: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };

describe('the version tools', () => {
  it('are listed, with descriptions that give examples', () => {
    const names = TOOLS.map((each) => each.name);
    for (const name of ['list_versions', 'compare_versions', 'show_comparison']) {
      expect(names).toContain(name);
      const found = TOOLS.find((each) => each.name === name);
      expect(found?.description).toMatch(/^Example: \{/m);
    }
    expect(TOOLS.find((each) => each.name === 'show_comparison')?.hints.readOnlyHint).toBe(false);
    expect(INSTRUCTIONS).toMatch(/list_versions.*compare_versions.*show_comparison/);
  });
});

describe('list_versions', () => {
  it('says why a folder outside any repository lists none, and names the project as opened', async () => {
    const { value } = await harness({ commit: false });
    const answer = await value('list_versions');
    expect(answer).toMatchObject({
      total: 0,
      versions: [],
      why: expect.stringMatching(/not in a git repository/) as unknown,
    });
    expect(answer.opened).toMatch(/^"opened" names the project as Visual Anything opened it/);
  });

  it.skipIf(NO_GIT)('lists HEAD, the branches and the commits, with ISO times', async () => {
    const { value, head } = await harness();
    const answer = await value('list_versions');
    const versions = answer.versions as Record<string, unknown>[];
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'head', commit: head }),
        expect.objectContaining({ kind: 'branch', name: 'main', commit: head }),
        expect.objectContaining({
          kind: 'commit',
          commit: head,
          subject: 'The shop as it was',
          author: 'Ada Tester',
        }),
      ]),
    );
    for (const version of versions) {
      expect(version.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(version).not.toHaveProperty('email');
    }
    expect(answer).not.toHaveProperty('why');
    expect(answer).not.toHaveProperty('next');
  });

  it.skipIf(NO_GIT)('filters by kind and pages', async () => {
    const { value } = await harness();
    const branches = await value('list_versions', { kind: 'branch' });
    expect(branches).toMatchObject({ total: 1, versions: [{ kind: 'branch', name: 'main' }] });
    const first = await value('list_versions', { limit: 1 });
    expect(first).toMatchObject({ total: 3, next: 1 });
    expect(first.versions).toHaveLength(1);
    const last = await value('list_versions', { offset: 2, limit: 1 });
    expect(last).not.toHaveProperty('next');
    expect(last.versions).toHaveLength(1);
  });
});

describe('compare_versions', () => {
  it('compares the project as opened with the project now, without git', async () => {
    const { value, asPerson } = await harness({ commit: false });
    await asPerson(RENAME);
    const answer = await value('compare_versions', { version: 'opened' });
    expect(answer).toMatchObject({
      version: 'opened',
      counts: { added: 0, removed: 0, changed: 1, moved: 0 },
      total: 1,
      offset: 0,
      changes: [
        {
          key: 'element:api',
          status: 'changed',
          name: 'Gateway',
          wasNamed: 'API',
          differences: [{ path: 'name', before: 'API', after: 'Gateway' }],
        },
      ],
    });
    expect(answer).not.toHaveProperty('next');
    expect(answer).not.toHaveProperty('proposed');
  });

  it('says when nothing differs', async () => {
    const { value } = await harness({ commit: false });
    expect(await value('compare_versions', { version: 'opened' })).toMatchObject({
      total: 0,
      changes: [],
      note: 'Nothing differs between the version and the project now.',
    });
  });

  it.skipIf(NO_GIT)('compares a commit listed, by its full id in either case', async () => {
    const { value, asPerson, head } = await harness();
    await asPerson({ type: 'delete', elements: ['customer'] });
    await value('list_versions');
    const answer = await value('compare_versions', { version: head.toUpperCase() });
    // The customer, and its relation to the API, which went with it.
    expect(answer.counts).toMatchObject({ removed: 2 });
    const removed = (answer.changes as Record<string, unknown>[]).find(
      (each) => each.key === 'element:customer',
    );
    expect(removed).toMatchObject({ status: 'removed', name: 'Customer' });
    expect(removed?.takes).toEqual(expect.arrayContaining(['position:overview:customer']));
  });

  it.skipIf(NO_GIT)(
    'refuses a commit not listed in the recent listings, before git hears of it',
    async () => {
      const { failure, head } = await harness();
      expect(await failure('compare_versions', { version: head })).toBe(
        'The version could not be compared: That commit is not one the program listed in its recent listings of versions: list them again, then choose one.',
      );
    },
  );

  it.skipIf(NO_GIT)('takes a commit the app listed', async () => {
    const { value, openApp, head } = await harness();
    const app = await openApp();
    app.send({ type: 'versions/list', requestId: 'app-1' });
    await expect
      .poll(() => app.messages.some((each) => each.type === 'versions/listed'), { timeout: 10_000 })
      .toBe(true);
    expect(await value('compare_versions', { version: head })).toMatchObject({ total: 0 });
  });

  it('refuses what names no version', async () => {
    const { failure } = await harness({ commit: false });
    for (const version of ['HEAD', 'main', 'a1b2c3d', '--output=x']) {
      expect(await failure('compare_versions', { version })).toMatch(
        /names no version: give "opened"/,
      );
    }
  });

  it('keeps to one view, and refuses a view neither version has', async () => {
    const { value, failure, asPerson } = await harness({ commit: false });
    await asPerson(RENAME);
    await asPerson({
      type: 'create-view',
      view: { id: 'other', name: 'Other', perspective: { name: 'Other' } },
    });
    const whole = await value('compare_versions', { version: 'opened' });
    expect(whole.total).toBe(2);
    const one = await value('compare_versions', { version: 'opened', view: 'overview' });
    expect(one).toMatchObject({ view: 'overview', total: 1, changes: [{ key: 'element:api' }] });
    expect(await failure('compare_versions', { version: 'opened', view: 'nowhere' })).toMatch(
      /Neither the version nor the project now has the view "nowhere"/,
    );
  });

  it(`answers ${MAX_CHANGES_PER_CALL} changes at most, then the rest from an offset`, async () => {
    const { value, asPerson } = await harness({ commit: false });
    await asPerson({
      type: 'batch',
      label: 'Create 205 services',
      commands: Array.from({ length: 205 }, (_, at) => ({
        type: 'create-element' as const,
        element: { component: 'systems.service', name: `Service ${at}` },
      })),
    });
    const first = await value('compare_versions', { version: 'opened' });
    expect(first.total).toBeGreaterThanOrEqual(205);
    expect(first.changes).toHaveLength(MAX_CHANGES_PER_CALL);
    expect(first.next).toBe(MAX_CHANGES_PER_CALL);
    const rest = await value('compare_versions', { version: 'opened', offset: first.next });
    expect(rest.changes).toHaveLength((first.total as number) - MAX_CHANGES_PER_CALL);
    expect(rest).not.toHaveProperty('next');
  });

  it('says the comparison leaves a waiting proposal out', async () => {
    const { value } = await harness({ commit: false, review: true });
    await value('update_element', { id: 'api', name: 'Gateway' });
    const answer = await value('compare_versions', { version: 'opened' });
    expect(answer.total).toBe(0);
    expect(answer.proposed).toMatch(/^Compared with the project now, without your proposal "/);
  });
});

describe('show_comparison', () => {
  it('compares first, then sends the guidance to the open app', async () => {
    const { value, openApp, guidanceOf, asPerson } = await harness({ commit: false });
    await asPerson(RENAME);
    const app = await openApp();
    const answer = await value('show_comparison', {
      version: 'opened',
      view: 'overview',
      show: 'before',
    });
    expect(answer).toMatchObject({ shown: 1, counts: { changed: 1 } });
    await expect
      .poll(() => guidanceOf(app), { timeout: 5000 })
      .toEqual([
        { kind: 'comparison', version: { kind: 'opened' }, view: 'overview', show: 'before' },
      ]);
  });

  it.skipIf(NO_GIT)('names a commit as listed, and says when no app sees it', async () => {
    const { value, head } = await harness();
    await value('list_versions');
    const answer = await value('show_comparison', { version: head });
    expect(answer).toMatchObject({
      shown: 0,
      counts: { added: 0, removed: 0, changed: 0, moved: 0 },
    });
    expect(answer.note).toMatch(/No app has the project open/);
  });

  it.skipIf(NO_GIT)('sends nothing when the version cannot be compared', async () => {
    const { failure, openApp, guidanceOf, head } = await harness();
    const app = await openApp();
    expect(await failure('show_comparison', { version: head })).toMatch(
      /not one the program listed in its recent listings/,
    );
    expect(await failure('show_comparison', { version: 'HEAD' })).toMatch(/names no version/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(guidanceOf(app)).toEqual([]);
  });
});
