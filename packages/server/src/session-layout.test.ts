/**
 * Claude's layouts wait for the app, one after another (M3d, "Fixes from use"): the session sends a
 * layout to the open apps with an id to answer by, waits for the tab that runs it, and only then sends
 * the next one, so that no layout runs over another. The wait is bounded.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMessage, type AppMessage, type LayoutReport } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string | undefined;
let session: Session | undefined;

async function open(options: SessionOptions = {}): Promise<Session> {
  folder = await mkdtemp(join(tmpdir(), 'va-layout-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
  return session;
}

afterEach(async () => {
  await session?.close();
  if (folder !== undefined) await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  session = undefined;
  folder = undefined;
});

/** The ids the client was asked to answer layouts by, in order. */
const asked = (client: FakeClient) =>
  client
    .ofType('guidance')
    .flatMap((message) => (message.answer === undefined ? [] : [message.answer]));

/** Waits until the client was asked for `count` layouts. */
async function askedFor(client: FakeClient, count: number): Promise<string[]> {
  for (let tries = 0; tries < 200; tries += 1) {
    if (asked(client).length >= count) return asked(client);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`The app was asked for ${asked(client).length} layouts, not ${count}.`);
}

function answer(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

describe('the layouts Claude asks for', () => {
  it('reach no app when none is open, and say so at once', async () => {
    const target = await open();
    expect(await target.layOut({ kind: 'layout', view: 'overview' })).toEqual({ apps: 0 });
  });

  it('answer with what the tab that ran it moved', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const report = target.layOut({ kind: 'layout', view: 'overview' });
    const [id] = await askedFor(app, 1);
    expect(app.ofType('guidance').at(-1)?.guidance).toEqual({ kind: 'layout', view: 'overview' });
    await answer(target, app, {
      type: 'layout/done',
      requestId: id ?? '',
      layouts: [{ ended: 'done', moved: 3 }],
    });
    expect(await report).toEqual({ apps: 1, layouts: [{ ended: 'done', moved: 3 }] });
  });

  it('run one after another: the next is sent only once the one before was answered', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const first = target.layOut({ kind: 'layout', view: 'overview' });
    const second = target.layOut({ kind: 'layout', view: 'overview', containers: ['system'] });
    const [one] = await askedFor(app, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(asked(app)).toHaveLength(1);
    await answer(target, app, {
      type: 'layout/done',
      requestId: one ?? '',
      layouts: [{ ended: 'stopped', moved: 0 }],
    });
    expect(await first).toEqual({ apps: 1, layouts: [{ ended: 'stopped', moved: 0 }] });
    const [, two] = await askedFor(app, 2);
    expect(two).not.toBe(one);
    await answer(target, app, {
      type: 'layout/done',
      requestId: two ?? '',
      layouts: [{ container: 'system', ended: 'done', moved: 2 }],
    });
    expect(await second).toEqual({
      apps: 1,
      layouts: [{ container: 'system', ended: 'done', moved: 2 }],
    });
  });

  it('take the answer of the tab that ran it, and say when every tab passed it over', async () => {
    const target = await open();
    const [a, b] = [new FakeClient(), new FakeClient()];
    target.connect(a);
    target.connect(b);
    const ran = target.layOut({ kind: 'layout', view: 'overview' });
    const [id] = await askedFor(a, 1);
    await answer(target, a, { type: 'layout/done', requestId: id ?? '', passed: 'other-tab' });
    await answer(target, b, {
      type: 'layout/done',
      requestId: id ?? '',
      layouts: [{ ended: 'done', moved: 1 }],
    });
    expect(await ran).toEqual({ apps: 2, layouts: [{ ended: 'done', moved: 1 }] });

    const passed = target.layOut({ kind: 'layout', view: 'overview' });
    const [, next] = await askedFor(a, 2);
    await answer(target, a, { type: 'layout/done', requestId: next ?? '', passed: 'other-tab' });
    await answer(target, b, {
      type: 'layout/done',
      requestId: next ?? '',
      passed: 'cannot-lay-out',
    });
    expect(await passed).toEqual({
      apps: 2,
      unanswered: 'passed',
      passed: ['other-tab', 'cannot-lay-out'],
    });
  });

  it('pass over answers from a tab not asked, or to a layout no longer waited for', async () => {
    const target = await open();
    const app = new FakeClient();
    const stranger = new FakeClient();
    target.connect(app);
    const report = target.layOut({ kind: 'layout' });
    const [id] = await askedFor(app, 1);
    await answer(target, stranger, {
      type: 'layout/done',
      requestId: id ?? '',
      layouts: [{ ended: 'done', moved: 99 }],
    });
    await answer(target, app, {
      type: 'layout/done',
      requestId: 'layout-elsewhere',
      layouts: [{ ended: 'done', moved: 98 }],
    });
    await answer(target, app, {
      type: 'layout/done',
      requestId: id ?? '',
      layouts: [{ ended: 'done', moved: 4 }],
    });
    expect(await report).toEqual({ apps: 1, layouts: [{ ended: 'done', moved: 4 }] });
  });

  it('wait a bounded time per layout, then let the next one run', async () => {
    const target = await open({ layoutWait: { perLayout: 40, margin: 10 } });
    const app = new FakeClient();
    target.connect(app);
    const first = target.layOut({ kind: 'layout', containers: ['system', 'api'] });
    const second = target.layOut({ kind: 'layout' });
    const started = Date.now();
    const report: LayoutReport = await first;
    expect(report).toEqual({ apps: 1, unanswered: 'timed-out', waited: 90 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(80);
    const [, two] = await askedFor(app, 2);
    await answer(target, app, {
      type: 'layout/done',
      requestId: two ?? '',
      layouts: [{ ended: 'done', moved: 0 }],
    });
    expect(await second).toEqual({ apps: 1, layouts: [{ ended: 'done', moved: 0 }] });
  });

  it('end the wait when the apps asked go before answering', async () => {
    const target = await open();
    const app = new FakeClient();
    const gone = target.connect(app);
    const report = target.layOut({ kind: 'layout' });
    await askedFor(app, 1);
    gone();
    expect(await report).toEqual({ apps: 1, unanswered: 'gone' });
  });

  it('end the wait when the program closes', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const report = target.layOut({ kind: 'layout' });
    await askedFor(app, 1);
    await target.close();
    expect(await report).toEqual({ apps: 1, unanswered: 'gone' });
  });
});
