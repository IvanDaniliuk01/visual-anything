/**
 * Claude sees a view as the app draws it (ADR 0081): the session asks the open apps for a picture with
 * `capture/request`, after the work asked for before it, and waits a bounded time for the tab the
 * person used last to answer with `capture/answer`. Taking it changes nothing.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPTURE_WAIT,
  encodeMessage,
  type AppMessage,
  type CaptureAsk,
  type CapturePicture,
} from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string | undefined;
let session: Session | undefined;

async function open(options: SessionOptions = {}): Promise<Session> {
  folder = await mkdtemp(join(tmpdir(), 'va-capture-'));
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

/** Waits until the client was asked for `count` pictures, and gives their requests. */
async function askedFor(client: FakeClient, count: number) {
  for (let tries = 0; tries < 200; tries += 1) {
    const asked = client.ofType('capture/request');
    if (asked.length >= count) return asked;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`The app was asked for fewer than ${count} pictures.`);
}

function answer(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

const ASK: CaptureAsk = { view: 'overview', region: 'whole', width: 1280 };

const PICTURE: CapturePicture = {
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  width: 1280,
  height: 720,
  view: 'overview',
  theme: 'light',
  scale: 0.75,
};

describe('a picture Claude asks for', () => {
  it('waits 20 s at most by default', () => {
    expect(CAPTURE_WAIT).toBe(20_000);
  });

  it('reaches no app when none is open, and says so at once', async () => {
    const target = await open();
    expect(await target.capture(ASK)).toEqual({ apps: 0 });
  });

  it('is asked of every open app, and answered with the picture the tab used last took', async () => {
    const target = await open();
    const [a, b] = [new FakeClient(), new FakeClient()];
    target.connect(a);
    target.connect(b);
    const report = target.capture({ ...ASK, region: ['api'], theme: 'dark' });
    const [asked] = await askedFor(a, 1);
    expect(asked).toMatchObject({ view: 'overview', region: ['api'], width: 1280, theme: 'dark' });
    expect(b.ofType('capture/request')[0]?.requestId).toBe(asked?.requestId);
    const requestId = asked?.requestId ?? '';
    await answer(target, a, { type: 'capture/answer', requestId, passed: 'other-tab' });
    await answer(target, b, { type: 'capture/answer', requestId, picture: PICTURE });
    expect(await report).toEqual({ apps: 2, picture: PICTURE });
  });

  it('says why the tab used last took none', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const report = target.capture(ASK);
    const [asked] = await askedFor(app, 1);
    await answer(target, app, {
      type: 'capture/answer',
      requestId: asked?.requestId ?? '',
      failed: 'other-view',
      shows: 'details',
    });
    expect(await report).toEqual({ apps: 1, failure: { failed: 'other-view', shows: 'details' } });
  });

  it('says when every tab passed it over', async () => {
    const target = await open();
    const [a, b] = [new FakeClient(), new FakeClient()];
    target.connect(a);
    target.connect(b);
    const report = target.capture(ASK);
    const [asked] = await askedFor(a, 1);
    const requestId = asked?.requestId ?? '';
    await answer(target, a, { type: 'capture/answer', requestId, passed: 'other-tab' });
    await answer(target, b, { type: 'capture/answer', requestId, passed: 'other-tab' });
    expect(await report).toEqual({ apps: 2, unanswered: 'passed' });
  });

  it('passes over answers from a tab not asked, or to a request no longer waited for', async () => {
    const target = await open();
    const app = new FakeClient();
    const stranger = new FakeClient();
    target.connect(app);
    const report = target.capture(ASK);
    const [asked] = await askedFor(app, 1);
    const requestId = asked?.requestId ?? '';
    await answer(target, stranger, { type: 'capture/answer', requestId, failed: 'empty' });
    await answer(target, app, {
      type: 'capture/answer',
      requestId: 'capture-elsewhere',
      failed: 'empty',
    });
    await answer(target, app, { type: 'capture/answer', requestId, picture: PICTURE });
    expect(await report).toEqual({ apps: 1, picture: PICTURE });
  });

  it('waits a bounded time, then says so', async () => {
    const target = await open({ captureWait: 40 });
    const app = new FakeClient();
    target.connect(app);
    const started = Date.now();
    expect(await target.capture(ASK)).toEqual({ apps: 1, unanswered: 'timed-out', waited: 40 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it('ends the wait when the apps asked go, or the program closes', async () => {
    const target = await open();
    const app = new FakeClient();
    const gone = target.connect(app);
    const first = target.capture(ASK);
    await askedFor(app, 1);
    gone();
    expect(await first).toEqual({ apps: 1, unanswered: 'gone' });
    const other = new FakeClient();
    target.connect(other);
    const second = target.capture(ASK);
    await askedFor(other, 1);
    await target.close();
    expect(await second).toEqual({ apps: 1, unanswered: 'gone' });
  });

  it('runs beside other pictures, each answered by its own id', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const one = target.capture(ASK);
    const two = target.capture({ ...ASK, region: 'viewport' });
    const [first, second] = await askedFor(app, 2);
    expect(first?.requestId).not.toBe(second?.requestId);
    await answer(target, app, {
      type: 'capture/answer',
      requestId: second?.requestId ?? '',
      failed: 'no-canvas',
    });
    await answer(target, app, {
      type: 'capture/answer',
      requestId: first?.requestId ?? '',
      picture: PICTURE,
    });
    expect(await one).toEqual({ apps: 1, picture: PICTURE });
    expect(await two).toEqual({ apps: 1, failure: { failed: 'no-canvas' } });
  });

  it('changes nothing: no file, no history', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const before = await readdir(folder ?? '', { recursive: true });
    const history = target.history;
    const report = target.capture(ASK);
    const [asked] = await askedFor(app, 1);
    await answer(target, app, {
      type: 'capture/answer',
      requestId: asked?.requestId ?? '',
      picture: PICTURE,
    });
    await report;
    await target.idle();
    expect(target.history).toEqual(history);
    expect(target.actions).toEqual([]);
    expect(app.ofType('project/changed')).toEqual([]);
    expect(await readdir(folder ?? '', { recursive: true })).toEqual(before);
  });
});
