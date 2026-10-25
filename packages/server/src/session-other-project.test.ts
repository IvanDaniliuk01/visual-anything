/**
 * The session's side of destinations to other projects (ADR 0056): an app's request to open one goes
 * to the program's opener and is answered to that app alone, and the warnings on opening flag a
 * destination whose folder holds no project. Neither is a command: nothing enters the history.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenOtherProject, OtherProjectRequest } from './other-project';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let root: string;
let folder: string;
const opened: Session[] = [];

/** The shop, whose cart leads to a project beside it that is not there. */
function linkedShop(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    packages: state.packages.map((file) =>
      file.id === 'shop'
        ? {
            ...file,
            components: file.components.map((each) => ({
              ...each,
              attributes: [
                ...(each.attributes ?? []),
                { name: 'see', type: 'destination' as const },
              ],
            })),
          }
        : file,
    ),
    model: {
      ...state.model,
      elements: state.model.elements.map((element) =>
        element.id === 'cart'
          ? { ...element, attributes: { see: { project: '../billing' } } }
          : element,
      ),
    },
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-session-other-'));
  folder = join(root, 'shop');
  await writeProjectFolder(folder, linkedShop());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

async function open(options: SessionOptions = {}): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

describe('opening another project from an app', () => {
  it('asks the opener from this project’s folder, and answers the app that asked', async () => {
    const asked: [string, OtherProjectRequest][] = [];
    const opener: OpenOtherProject = (from, request) => {
      asked.push([from, request]);
      return Promise.resolve({ ok: true, name: 'Billing' });
    };
    const session = await open({ openOtherProject: opener });
    const app = new FakeClient();
    const other = new FakeClient();
    session.connect(app);
    session.connect(other);
    await session.receive(
      app,
      JSON.stringify({
        type: 'project/open-other',
        requestId: 'r1',
        project: '../billing',
        view: 'v',
      }),
    );
    expect(asked).toEqual([[session.folder, { project: '../billing', view: 'v' }]]);
    expect(app.ofType('other-project/opened')).toEqual([
      { type: 'other-project/opened', requestId: 'r1', name: 'Billing' },
    ]);
    expect(other.ofType('other-project/opened')).toEqual([]);
    expect(session.history.undo).toBeUndefined();
  });

  it('answers why the opener refused', async () => {
    const session = await open({
      openOtherProject: () =>
        Promise.resolve({
          ok: false,
          problems: [{ code: 'broken-destination', message: 'Nothing is there.' }],
        }),
    });
    const app = new FakeClient();
    session.connect(app);
    await session.receive(
      app,
      JSON.stringify({ type: 'project/open-other', requestId: 'r2', project: '../billing' }),
    );
    expect(app.ofType('command/rejected')).toEqual([
      {
        type: 'command/rejected',
        requestId: 'r2',
        problems: [{ code: 'broken-destination', message: 'Nothing is there.' }],
      },
    ]);
  });

  it('refuses when the program opens no other project', async () => {
    const session = await open();
    const app = new FakeClient();
    session.connect(app);
    await session.receive(
      app,
      JSON.stringify({ type: 'project/open-other', requestId: 'r3', project: '../billing' }),
    );
    expect(app.ofType('command/rejected')[0]?.problems[0]?.code).toBe('program-failed');
  });

  it('refuses a request that is not one before the opener sees it', async () => {
    let asked = 0;
    const session = await open({
      openOtherProject: () => {
        asked += 1;
        return Promise.resolve({ ok: true, name: 'X' });
      },
    });
    const app = new FakeClient();
    session.connect(app);
    await session.receive(
      app,
      JSON.stringify({ type: 'project/open-other', requestId: 'r4', project: 3 }),
    );
    expect(asked).toBe(0);
    expect(app.ofType('command/rejected')[0]?.problems[0]?.code).toBe('invalid-command');
  });
});

describe('the warnings on opening', () => {
  it('flag a destination whose folder holds no project', async () => {
    const session = await open();
    const flagged = session.warnings().filter((each) => each.message.includes('holds no project'));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.file).toBe('model.vamodel');
  });
});
