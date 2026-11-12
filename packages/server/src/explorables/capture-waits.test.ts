/**
 * A still of an explorable Claude asks for (ADR 0107, A10.3): the session asks every open app with
 * `explorable-capture/request`, after the work asked for before it, and waits a bounded time for the
 * tab the person used last to answer with `explorable-capture/answer`. Taking it changes nothing.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMessage, type AppMessage, type ExplorableCaptureAsk } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openSession, type Session, type SessionOptions } from '../session';
import { FakeClient, testProject, writeProjectFolder } from '../test-support';

let folder: string | undefined;
let session: Session | undefined;

async function open(options: SessionOptions = {}): Promise<Session> {
  folder = await mkdtemp(join(tmpdir(), 'va-explorable-capture-'));
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

async function askedFor(client: FakeClient, count: number) {
  for (let tries = 0; tries < 200; tries += 1) {
    const asked = client.ofType('explorable-capture/request');
    if (asked.length >= count) return asked;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`The app was asked for fewer than ${count} stills.`);
}

function answer(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

const ASK: ExplorableCaptureAsk = {
  explorable: 'quadratic.parabola',
  element: 'f',
  parameters: { a: 2 },
  width: 512,
  theme: 'dark',
};
const STILL = {
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  width: 512,
  height: 384,
};

describe('a still of an explorable Claude asks for', () => {
  it('reaches no app when none is open, and says so at once', async () => {
    const target = await open();
    expect(await target.captureExplorable(ASK)).toEqual({ apps: 0 });
  });

  it('is asked of every open app, and answered with the still the tab used last took', async () => {
    const target = await open();
    const [a, b] = [new FakeClient(), new FakeClient()];
    target.connect(a);
    target.connect(b);
    const report = target.captureExplorable(ASK);
    const [asked] = await askedFor(a, 1);
    expect(asked).toMatchObject(ASK);
    const requestId = asked?.requestId ?? '';
    expect(b.ofType('explorable-capture/request')[0]?.requestId).toBe(requestId);
    await answer(target, a, { type: 'explorable-capture/answer', requestId, passed: 'other-tab' });
    await answer(target, b, {
      type: 'explorable-capture/answer',
      requestId,
      still: STILL,
      errors: ['ReferenceError: y is not defined'],
      ready: false,
    });
    expect(await report).toEqual({
      apps: 2,
      still: STILL,
      errors: ['ReferenceError: y is not defined'],
      ready: false,
    });
  });

  it('says why the tab used last took none, and when every tab passed it over', async () => {
    const target = await open();
    const app = new FakeClient();
    target.connect(app);
    const failed = target.captureExplorable(ASK);
    const [asked] = await askedFor(app, 1);
    await answer(target, app, {
      type: 'explorable-capture/answer',
      requestId: asked?.requestId ?? '',
      failed: 'stopped',
      why: 'It stopped answering.',
    });
    expect(await failed).toEqual({
      apps: 1,
      failure: { reason: 'stopped', message: 'It stopped answering.' },
    });
    const passed = target.captureExplorable(ASK);
    const [, again] = await askedFor(app, 2);
    await answer(target, app, {
      type: 'explorable-capture/answer',
      requestId: again?.requestId ?? '',
      passed: 'other-tab',
    });
    expect(await passed).toEqual({ apps: 1, unanswered: 'passed' });
  });

  it('times out, and ends when the app goes', async () => {
    const target = await open({ captureWait: 30 });
    const app = new FakeClient();
    const leave = target.connect(app);
    expect(await target.captureExplorable(ASK)).toEqual({
      apps: 1,
      unanswered: 'timed-out',
      waited: 30,
    });
    const gone = target.captureExplorable(ASK);
    await askedFor(app, 2);
    leave();
    expect(await gone).toEqual({ apps: 1, unanswered: 'gone' });
  });
});
