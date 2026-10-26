/**
 * Placing what an action added joins that action (ADR 0065): the app's placement, sent with `joins`,
 * extends the newest action when it is still the newest and not undone and the placement only sets
 * unpinned positions of what that action added, or of what it moved aside to make room for it. One
 * change of Claude's then takes one undo. Anything later or wider is the person's own action.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, ListedAction } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-joins-'));
  await writeProjectFolder(folder, testProject());
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function open(): Promise<Session> {
  let clock = Date.UTC(2026, 9, 26, 9, 0);
  const result = await openSession(folder, {
    watch: false,
    now: () => (clock += 60_000),
    out: () => {},
    err: () => {},
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

const SAVING = { timeout: 20_000 };

/** Claude adds a queue inside the shop system, with no position. */
const ADD_QUEUE: Command = {
  type: 'create-element',
  element: { id: 'queue', component: 'systems.service', name: 'Queue' },
  containers: [{ container: 'system', relationType: 'systems.is-part-of' }],
};

/** The app's automatic layout of the new shape, as `useLayout` sends it. */
const PLACE_QUEUE: Command = {
  type: 'batch',
  label: 'Lay out "Queue" in "Overview"',
  commands: [
    {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'queue', container: 'system', x: 200, y: 40 }],
    },
  ],
};

/** What an app sends: a command, joining the action with this id or not. */
function sent(command: Command, joins?: number, requestId = 'place'): string {
  return JSON.stringify({
    type: 'command',
    requestId,
    command,
    ...(joins === undefined ? {} : { joins }),
  });
}

function listed(app: FakeClient): ListedAction[] {
  return app.ofType('history/listed').at(-1)?.actions ?? [];
}

const queuePosition = (session: Session) =>
  session.snapshot.views[0]?.positions.find((each) => each.element === 'queue');

describe('a placement that joins the action it places', SAVING, () => {
  it('is one action of Claude’s, which one undo takes back and one redo brings back', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    const before = session.snapshot;
    const added = await session.execute(ADD_QUEUE, 'claude');
    expect(added.ok).toBe(true);
    const id = listed(app).at(-1)?.id as number;

    await session.receive(app, sent(PLACE_QUEUE, id));

    expect(queuePosition(session)).toEqual({
      element: 'queue',
      container: 'system',
      x: 200,
      y: 40,
    });
    expect(listed(app)).toEqual([
      expect.objectContaining({ id, label: 'Create "Queue"', author: 'claude', undone: false }),
    ]);
    const change = app.ofType('project/changed').at(-1);
    expect(change).toMatchObject({
      requestId: 'place',
      label: 'Create "Queue"',
      author: 'claude',
      joins: id,
    });
    expect(session.history).toEqual({ undo: { label: 'Create "Queue"', author: 'claude' } });

    const undone = await session.undo();
    expect(undone.ok).toBe(true);
    expect(session.snapshot).toStrictEqual(before);
    expect(session.history.undo).toBeUndefined();
    await session.redo();
    expect(queuePosition(session)).toEqual({
      element: 'queue',
      container: 'system',
      x: 200,
      y: 40,
    });
    expect(listed(app).map((each) => each.id)).toEqual([id]);
  });

  it('stays the person’s own action when it comes after another action', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(ADD_QUEUE, 'claude');
    const id = listed(app).at(-1)?.id as number;
    await session.execute(
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      'user',
    );

    await session.receive(app, sent(PLACE_QUEUE, id));

    expect(listed(app).map(({ label, author }) => `${author}: ${label}`)).toEqual([
      'claude: Create "Queue"',
      'user: Rename "API" to "Gateway"',
      'user: Lay out "Queue" in "Overview"',
    ]);
  });

  it('stays the person’s own action once the action it names is undone', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(ADD_QUEUE, 'claude');
    const id = listed(app).at(-1)?.id as number;
    await session.execute(
      {
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'api', container: 'system', x: 40, y: 40 }],
      },
      'user',
    );
    await session.undo();
    await session.receive(
      app,
      sent(
        {
          type: 'set-positions',
          view: 'overview',
          positions: [{ element: 'queue', container: 'system', x: 200, y: 40 }],
        },
        id,
      ),
    );
    expect(listed(app).at(-1)).toMatchObject({
      author: 'user',
      label: 'Move "Queue" in "Overview"',
    });
    expect(listed(app)).toHaveLength(2);
  });

  it('stays the person’s own action when it does more than place what the action added', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(ADD_QUEUE, 'claude');
    const id = listed(app).at(-1)?.id as number;
    // The API was in the system before: moving it up is a wider layout.
    const wider: Command = {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'queue', container: 'system', x: 200, y: 40 },
        { element: 'api', container: 'system', x: 20, y: 8 },
      ],
    };
    await session.receive(app, sent(wider, id));
    expect(listed(app).map(({ author }) => author)).toEqual(['claude', 'user']);
    // A pinned position is a choice by hand, never a placement.
    await session.execute(ADD_QUEUE_TWO, 'claude');
    const second = listed(app).at(-1)?.id as number;
    await session.receive(
      app,
      sent(
        {
          type: 'set-positions',
          view: 'overview',
          positions: [{ element: 'queue-two', container: 'system', x: 200, y: 160, pinned: true }],
        },
        second,
      ),
    );
    expect(listed(app).map(({ author }) => author)).toEqual(['claude', 'user', 'claude', 'user']);
  });

  it('joins with the neighbours it moved aside, right or down, beside the container that grew', async () => {
    const session = await open();
    const app = new FakeClient({ history: true });
    session.connect(app);
    await session.execute(
      { type: 'set-positions', view: 'overview', positions: [{ element: 'cart', x: 440, y: 0 }] },
      'user',
    );
    await session.execute(ADD_QUEUE, 'claude');
    const id = listed(app).at(-1)?.id as number;
    const room: Command = {
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'queue', container: 'system', x: 440, y: 40 },
        { element: 'cart', x: 680, y: 0 },
      ],
    };
    await session.receive(app, sent(room, id));
    expect(listed(app).map(({ author, label }) => `${author}: ${label}`)).toEqual([
      'user: Move "Cart" in "Overview"',
      'claude: Create "Queue"',
    ]);
  });

  it('is refused as a message when the action it names is not an id', async () => {
    const session = await open();
    const app = new FakeClient();
    session.connect(app);
    await session.receive(app, sent(PLACE_QUEUE, 0));
    expect(app.ofType('command/rejected').at(-1)?.problems[0]?.code).toBe('invalid-command');
  });
});

const ADD_QUEUE_TWO: Command = {
  type: 'create-element',
  element: { id: 'queue-two', component: 'systems.service', name: 'Second queue' },
  containers: [{ container: 'system', relationType: 'systems.is-part-of' }],
};
