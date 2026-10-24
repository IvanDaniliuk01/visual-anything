import * as fsp from 'node:fs/promises';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  PROTOCOL_VERSION,
  type Command,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session, type SessionOptions } from './session';
import {
  FakeClient,
  filesIn,
  readText,
  recordingFs,
  testProject,
  writeProjectFolder,
  writeText,
} from './test-support';
import type { WatchMode } from './watcher';
import type { WriterFs } from './writer';

const SAMPLE = fileURLToPath(new URL('../../../examples/my-systems', import.meta.url));

/** How the tests that watch for outside changes watch: with a short delay, so that they run fast. */
const WATCH = { delay: 50 };

/** Every watch mode this platform can test: the recursive watcher is native only on Windows and macOS. */
const MODES: WatchMode[] =
  process.platform === 'win32' || process.platform === 'darwin'
    ? ['recursive', 'folders']
    : ['folders'];

const RENAME_API: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };
const MOVE_CUSTOMER: Command = {
  type: 'set-positions',
  view: 'overview',
  positions: [{ element: 'customer', x: -300, y: 80, pinned: true }],
};
const CREATE_WORKER: Command = {
  type: 'create-element',
  element: { component: 'systems.service', name: 'Worker' },
  containers: [{ container: 'system', relationType: 'systems.is-part-of' }],
  positions: [{ view: 'overview', container: 'system', x: 200, y: 40 }],
};

/** A view that no scenario plays over. */
const SECOND_VIEW: ViewFile = {
  id: 'second',
  name: 'Second',
  perspective: { name: 'Ownership' },
  nestingRelationTypes: [],
  positions: [],
  freeShapes: [],
};

let folder: string;
let logs: { out: string[]; err: string[] };
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-session-'));
  logs = { out: [], err: [] };
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** Opens a session on the test folder. It does not watch the folder unless asked to. */
async function open(options: SessionOptions = {}): Promise<Session> {
  let n = 0;
  const result = await openSession(folder, {
    watch: false,
    newId: (base) => `${base}-${(n += 1)}`,
    out: (line) => logs.out.push(line),
    err: (line) => logs.err.push(line),
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

/** The real file system for the writer, with some calls replaced. */
function fsWith(overrides: Partial<WriterFs>): WriterFs {
  return {
    open: (path, flags) => fsp.open(path, flags),
    rename: (from, to) => fsp.rename(from, to),
    unlink: (path) => fsp.unlink(path),
    mkdir: (path, options) => fsp.mkdir(path, options),
    ...overrides,
  };
}

function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

/** The test project with one more relation, which breaks the limits of its relation type. */
function projectWithWarning(): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    model: {
      ...state.model,
      relations: [
        ...state.model.relations,
        {
          id: 'api-reads-customer',
          relationType: 'systems.reads-from',
          from: 'api',
          to: 'customer',
        },
      ],
    },
  };
}

const LIMIT_WARNING =
  'model.vamodel /elements/3: "reads from" expects its to end to be "Database" or "Object storage", but "Customer" is not.';

describe('openSession', () => {
  it('opens the project in a folder and knows where each of its files lives', async () => {
    await writeProjectFolder(folder, testProject());

    const session = await open();

    expect(session.snapshot).toEqual(testProject());
    expect(session.history).toEqual({});
    expect(session.files).toEqual({
      project: 'project.vaproject',
      model: 'model.vamodel',
      packages: new Map([['shop', 'packages/shop.vapackage']]),
      views: new Map([['overview', 'views/overview.vaview']]),
      scenarios: new Map([['request', 'scenarios/request.vascenario']]),
      unlistedPackages: new Map(),
    });
    expect(session.warnings()).toEqual([]);
  });

  it('refuses a project that breaks the rules of the core, with each error against its file', async () => {
    const state = testProject();
    await writeProjectFolder(folder, {
      ...state,
      model: {
        ...state.model,
        elements: [
          ...state.model.elements,
          { id: 'ghost', component: 'shop.missing', name: 'Ghost' },
        ],
      },
    });

    expect(await openSession(folder, { watch: false })).toEqual({
      ok: false,
      errors: [
        {
          file: 'model.vamodel',
          pointer: '/elements/5',
          message:
            'The element "Ghost" is created from "shop.missing", which no package in use defines.',
        },
      ],
    });
  });

  it('reports what the project breaks of the rules that only warn', async () => {
    await writeProjectFolder(folder, projectWithWarning());

    const session = await open();

    expect(
      session.warnings().map((warning) => `${warning.file} ${warning.pointer}: ${warning.message}`),
    ).toEqual([LIMIT_WARNING]);
  });
});

describe('execute', () => {
  beforeEach(() => writeProjectFolder(folder, testProject()));

  it('runs a command, saves only the file it affects, and leaves no temporary file', async () => {
    const before = await filesIn(folder);
    const { fs, written, deleted } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    const outcome = await session.execute(RENAME_API, 'user');

    expect(outcome).toMatchObject({
      ok: true,
      recorded: true,
      label: 'Rename "API" to "Gateway"',
      author: 'user',
      created: [],
      warnings: [],
    });
    expect(written).toEqual(['model.vamodel']);
    expect(deleted).toEqual([]);
    const after = await filesIn(folder);
    expect([...after.keys()]).toEqual([...before.keys()]);
    expect(after.get('model.vamodel')?.toString('utf8')).toBe(
      formatFile('model', session.snapshot.model),
    );
    for (const [path, bytes] of before) {
      if (path !== 'model.vamodel') expect(after.get(path)).toEqual(bytes);
    }
  });

  it('saves every file a command affects', async () => {
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    const outcome = await session.execute(CREATE_WORKER, 'user');

    expect(outcome).toMatchObject({ ok: true, created: ['worker-1', 'is-part-of-2'] });
    expect(written).toEqual(['model.vamodel', 'views/overview.vaview']);
    expect(await readText(folder, 'views/overview.vaview')).toBe(
      formatFile('view', session.snapshot.views[0] as ViewFile),
    );
    expect(await readText(folder, 'model.vamodel')).toBe(
      formatFile('model', session.snapshot.model),
    );
  });

  it('records each action with who did it', async () => {
    const session = await open();

    await session.execute(RENAME_API, 'claude');

    expect(session.history).toEqual({
      undo: { label: 'Rename "API" to "Gateway"', author: 'claude' },
    });
  });

  it('changes nothing and touches no file for a rejected command', async () => {
    const before = await filesIn(folder);
    const { fs, written, deleted } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    const outcome = await session.execute({ type: 'delete', elements: ['nothing'] }, 'user');

    expect(outcome).toEqual({
      ok: false,
      problems: [
        {
          code: 'unknown-element',
          message: 'There is no element "nothing".',
          subjects: ['nothing'],
        },
      ],
    });
    expect(written).toEqual([]);
    expect(deleted).toEqual([]);
    expect(session.snapshot).toEqual(testProject());
    expect(session.history).toEqual({});
    expect(await filesIn(folder)).toEqual(before);
  });

  it('does not record a command that changes nothing, and writes nothing', async () => {
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    const outcome = await session.execute(
      { type: 'update-element', id: 'api', changes: { name: 'API' } },
      'user',
    );

    expect(outcome).toMatchObject({ ok: true, recorded: false, operations: [] });
    expect(session.history).toEqual({});
    expect(written).toEqual([]);
  });

  it('refuses a command that would make a file invalid, and writes nothing', async () => {
    const before = await filesIn(folder);
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    const outcome = await session.execute(
      {
        type: 'create-element',
        element: {
          component: 'systems.service',
          name: 'Odd',
          appearance: { shape: 'triangle' as 'rectangle' },
        },
      },
      'user',
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems).toHaveLength(1);
    expect(outcome.problems[0]?.code).toBe('invalid-file');
    expect(outcome.problems[0]?.message).toMatch(
      /^The change would make model\.vamodel invalid: \/elements\/5\/appearance\/shape must be one of /,
    );
    expect(written).toEqual([]);
    expect(session.snapshot).toEqual(testProject());
    expect(session.history).toEqual({});
    expect(await filesIn(folder)).toEqual(before);
  });

  it('refuses a command that is not well formed, and keeps going', async () => {
    const session = await open();

    await expect(
      session.execute({ type: 'create-element' } as unknown as Command, 'user'),
    ).resolves.toMatchObject({ ok: false, problems: [{ code: 'invalid-command' }] });
    await expect(session.execute(RENAME_API, 'user')).resolves.toMatchObject({ ok: true });
  });

  it('runs commands one at a time, in the order they arrive', async () => {
    const session = await open();

    const first = session.execute(
      {
        type: 'create-element',
        element: { id: 'worker', component: 'systems.service', name: 'Worker' },
      },
      'user',
    );
    const second = session.execute(
      { type: 'update-element', id: 'worker', changes: { name: 'Busy worker' } },
      'user',
    );

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(session.history).toEqual({
      undo: { label: 'Rename "Worker" to "Busy worker"', author: 'user' },
    });
    expect(await readText(folder, 'model.vamodel')).toBe(
      formatFile('model', session.snapshot.model),
    );
    expect(session.snapshot.model.elements.at(-1)?.name).toBe('Busy worker');
  });
});

describe('undo and redo', () => {
  it('restore every file to its exact earlier bytes', async () => {
    await writeProjectFolder(folder, testProject());
    const original = await filesIn(folder);
    const session = await open();
    await session.execute(CREATE_WORKER, 'user');
    const changed = await filesIn(folder);
    expect(changed).not.toEqual(original);

    await expect(session.undo()).resolves.toMatchObject({
      ok: true,
      label: 'Create "Worker"',
      author: 'user',
    });
    expect(await filesIn(folder)).toEqual(original);
    expect(session.snapshot).toEqual(testProject());
    expect(session.history).toEqual({ redo: { label: 'Create "Worker"', author: 'user' } });

    await expect(session.redo()).resolves.toMatchObject({ ok: true, label: 'Create "Worker"' });
    expect(await filesIn(folder)).toEqual(changed);
    expect(session.history).toEqual({ undo: { label: 'Create "Worker"', author: 'user' } });
  });

  it('restore a file to its bytes as opened, even when it was not in formatFile form', async () => {
    await writeProjectFolder(folder, testProject(), (kind, value) =>
      kind === 'model' ? `${JSON.stringify(value)}\n` : formatFile(kind, value),
    );
    const original = await filesIn(folder);
    const session = await open();

    await session.execute(RENAME_API, 'user');
    expect(await readText(folder, 'model.vamodel')).toBe(
      formatFile('model', session.snapshot.model),
    );

    await session.undo();
    expect(await filesIn(folder)).toEqual(original);
  });

  it('refuse when there is nothing to undo or redo', async () => {
    await writeProjectFolder(folder, testProject());
    const session = await open();

    await expect(session.undo()).resolves.toEqual({
      ok: false,
      problems: [{ code: 'nothing-to-undo', message: 'There is nothing to undo.' }],
    });
    await expect(session.redo()).resolves.toEqual({
      ok: false,
      problems: [{ code: 'nothing-to-redo', message: 'There is nothing to redo.' }],
    });
  });
});

describe('the files of views, scenarios and packages', () => {
  beforeEach(() => writeProjectFolder(folder, testProject()));

  it('gives a new view its own file, which undo deletes and redo writes back', async () => {
    const session = await open();

    const outcome = await session.execute(
      {
        type: 'create-view',
        view: { id: 'flows', name: 'Flows', perspective: { name: 'Data flow' } },
      },
      'user',
    );

    expect(outcome).toMatchObject({ ok: true, created: ['flows'] });
    const view = session.snapshot.views.find((each) => each.id === 'flows') as ViewFile;
    expect(await readText(folder, 'views/flows.vaview')).toBe(formatFile('view', view));
    expect(session.files.views.get('flows')).toBe('views/flows.vaview');
    const created = await filesIn(folder);

    await session.undo();
    expect((await filesIn(folder)).has('views/flows.vaview')).toBe(false);
    expect(session.files.views.has('flows')).toBe(false);

    await session.redo();
    expect(await filesIn(folder)).toEqual(created);
  });

  it('deletes the file of a deleted view, and undo writes it back where it was', async () => {
    await writeText(folder, 'views/b.vaview', formatFile('view', SECOND_VIEW));
    const original = await filesIn(folder);
    const session = await open();

    await session.execute({ type: 'delete-view', id: 'second' }, 'user');
    expect((await filesIn(folder)).has('views/b.vaview')).toBe(false);

    await session.undo();
    expect(await filesIn(folder)).toEqual(original);
    expect(session.files.views.get('second')).toBe('views/b.vaview');
  });

  it('gives a new scenario its own file, deletes it with the scenario, and undo brings it back', async () => {
    const original = await filesIn(folder);
    const session = await open();
    await session.execute(
      {
        type: 'create-scenario',
        scenario: {
          id: 'checkout',
          name: 'Checkout',
          view: 'overview',
          steps: [{ description: 'The customer pays.', relations: ['customer-calls-api'] }],
        },
      },
      'user',
    );
    const created = await filesIn(folder);
    expect(created.get('scenarios/checkout.vascenario')?.toString('utf8')).toBe(
      formatFile('scenario', session.snapshot.scenarios[1] as never),
    );

    await session.execute({ type: 'delete-scenario', id: 'checkout' }, 'user');
    expect(await filesIn(folder)).toEqual(original);

    await session.undo();
    expect(await filesIn(folder)).toEqual(created);
    await session.undo();
    expect(await filesIn(folder)).toEqual(original);
  });

  it('gives a new package its own file and lists it in the project file; undo takes both back', async () => {
    const original = await filesIn(folder);
    const session = await open();

    await session.execute(
      { type: 'create-package', package: { id: 'tools', name: 'Tools' } },
      'user',
    );

    const files = await filesIn(folder);
    expect(files.get('packages/tools.vapackage')?.toString('utf8')).toBe(
      formatFile('package', { id: 'tools', name: 'Tools', components: [], relationTypes: [] }),
    );
    expect(files.get('project.vaproject')?.toString('utf8')).toBe(
      formatFile('project', { ...testProject().project, packages: ['systems', 'shop', 'tools'] }),
    );

    await session.undo();
    expect(await filesIn(folder)).toEqual(original);
  });

  it('adds a numeric suffix to the name of a new file when the name is taken', async () => {
    await writeText(
      folder,
      'views/flows.vaview',
      formatFile('view', { ...SECOND_VIEW, id: 'other' }),
    );
    await mkdir(join(folder, 'views', 'FLOWS-2.vaview'));
    const session = await open();

    await session.execute(
      {
        type: 'create-view',
        view: { id: 'flows', name: 'Flows', perspective: { name: 'Data flow' } },
      },
      'user',
    );

    expect(session.files.views.get('flows')).toBe('views/flows-3.vaview');
    expect((await filesIn(folder)).has('views/flows-3.vaview')).toBe(true);
  });

  it('refuses a new package whose id a package file the project does not use already has', async () => {
    await writeText(
      folder,
      'packages/old.vapackage',
      formatFile('package', { id: 'tools', name: 'Old tools', components: [], relationTypes: [] }),
    );
    const before = await filesIn(folder);
    const session = await open();

    const outcome = await session.execute(
      { type: 'create-package', package: { id: 'tools', name: 'Tools' } },
      'user',
    );

    expect(outcome).toEqual({
      ok: false,
      problems: [
        {
          code: 'id-taken',
          message:
            'The id "tools" is taken: packages/old.vapackage holds a package with that id, which the project does not use.',
          subjects: ['tools'],
        },
      ],
    });
    expect(await filesIn(folder)).toEqual(before);
  });

  it('never writes a built-in package', async () => {
    await rm(folder, { recursive: true, force: true });
    await writeProjectFolder(folder, {
      project: { schemaVersion: 1, name: 'Empty', packages: [] },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [],
        relations: [],
      },
      packages: [],
      views: [],
      scenarios: [],
    });
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    await session.execute({ type: 'update-project', changes: { packages: ['systems'] } }, 'user');

    expect(written).toEqual(['project.vaproject']);
    expect(session.snapshot.packages.map((file) => file.id)).toEqual(['systems']);
  });
});

describe('saveAll', () => {
  it('leaves every byte of a project in formatFile form unchanged', async () => {
    await writeProjectFolder(folder, testProject());
    const before = await filesIn(folder);
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    await session.saveAll();

    expect([...written].sort()).toEqual([...before.keys()].sort());
    expect(await filesIn(folder)).toEqual(before);
  });

  it('leaves every byte of the sample project unchanged', async () => {
    await cp(SAMPLE, folder, { recursive: true });
    const before = await filesIn(folder);
    const { fs, written } = recordingFs(folder);
    const session = await open({ writer: { fs } });

    await session.saveAll();

    expect([...written].sort()).toEqual([...before.keys()].sort());
    expect(await filesIn(folder)).toEqual(before);
  });

  it('writes every file in formatFile form', async () => {
    await writeProjectFolder(folder, testProject(), (_kind, value) => JSON.stringify(value));
    const session = await open();

    await session.saveAll();

    const formatted = await filesIn(folder);
    await rm(folder, { recursive: true, force: true });
    await writeProjectFolder(folder, testProject());
    expect(await filesIn(folder)).toEqual(formatted);
  });
});

describe('when saving fails', () => {
  beforeEach(() => writeProjectFolder(folder, testProject()));

  it('refuses the command and leaves the files, the project and the history as they were', async () => {
    const before = await filesIn(folder);
    const fs = fsWith({ rename: () => Promise.reject(systemError('EACCES')) });
    const session = await open({ writer: { fs, retryDelays: [] } });

    const outcome = await session.execute(RENAME_API, 'user');

    expect(outcome).toEqual({
      ok: false,
      problems: [
        {
          code: 'not-saved',
          message: 'Could not save model.vamodel (EACCES); nothing was changed.',
        },
      ],
    });
    expect(await filesIn(folder)).toEqual(before);
    expect(session.snapshot).toEqual(testProject());
    expect(session.history).toEqual({});
  });

  it('puts back the files already saved when a later one fails', async () => {
    const before = await filesIn(folder);
    const fs = fsWith({
      rename: (from, to) =>
        to.endsWith('overview.vaview')
          ? Promise.reject(systemError('EPERM'))
          : fsp.rename(from, to),
    });
    const session = await open({ writer: { fs, retryDelays: [] } });

    const outcome = await session.execute(CREATE_WORKER, 'user');

    expect(outcome).toMatchObject({
      ok: false,
      problems: [{ message: 'Could not save views/overview.vaview (EPERM); nothing was changed.' }],
    });
    expect(await filesIn(folder)).toEqual(before);
    expect(session.snapshot).toEqual(testProject());
  });
});

describe('the live connection', () => {
  let session: Session;
  let a: FakeClient;
  let b: FakeClient;

  beforeEach(async () => {
    await writeProjectFolder(folder, testProject());
    session = await open();
    a = new FakeClient();
    b = new FakeClient();
    session.connect(a);
    session.connect(b);
  });

  const command = (requestId: string, body: Command) =>
    JSON.stringify({ type: 'command', requestId, command: body });

  it('greets each app with the project and its history', () => {
    expect(a.messages).toEqual([
      {
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: testProject(),
        history: {},
      },
    ]);
  });

  it('tells an app that connects about the warnings of the project', async () => {
    await rm(folder, { recursive: true, force: true });
    await writeProjectFolder(folder, projectWithWarning());
    const warned = await open();
    const client = new FakeClient();

    warned.connect(client);

    expect(client.messages).toEqual([
      {
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: projectWithWarning(),
        history: {},
      },
      { type: 'notice', level: 'warning', message: `The project has 1 warning:\n${LIMIT_WARNING}` },
    ]);
  });

  it('runs a command from an app and tells every app, the sender with its request id', async () => {
    await session.receive(a, command('r1', RENAME_API));

    const change = {
      type: 'project/changed',
      kind: 'do',
      label: 'Rename "API" to "Gateway"',
      author: 'user',
      history: { undo: { label: 'Rename "API" to "Gateway"', author: 'user' } },
      warnings: [],
      created: [],
      operations: [
        {
          op: 'replace',
          collection: { name: 'elements' },
          item: {
            id: 'api',
            component: 'systems.service',
            name: 'Gateway',
            attributes: { owner: 'Team A' },
          },
        },
      ],
    };
    expect(a.messages.slice(1)).toStrictEqual([{ ...change, requestId: 'r1' }]);
    expect(b.messages.slice(1)).toStrictEqual([change]);
  });

  it('answers a rejected command to its sender only', async () => {
    await session.receive(a, command('r2', { type: 'delete', elements: ['nothing'] }));

    expect(a.messages.slice(1)).toEqual([
      {
        type: 'command/rejected',
        requestId: 'r2',
        problems: [
          {
            code: 'unknown-element',
            message: 'There is no element "nothing".',
            subjects: ['nothing'],
          },
        ],
      },
    ]);
    expect(b.messages.slice(1)).toEqual([]);
  });

  it('tells every app about an undo and a redo', async () => {
    await session.receive(a, command('r1', RENAME_API));
    await session.receive(b, JSON.stringify({ type: 'undo', requestId: 'u1' }));
    await session.receive(a, JSON.stringify({ type: 'redo', requestId: 'u2' }));

    const kinds = (client: FakeClient) =>
      client
        .ofType('project/changed')
        .map(({ kind, label, requestId }) => ({ kind, label, requestId }));
    const label = 'Rename "API" to "Gateway"';
    expect(kinds(a)).toEqual([
      { kind: 'do', label, requestId: 'r1' },
      { kind: 'undo', label, requestId: undefined },
      { kind: 'redo', label, requestId: 'u2' },
    ]);
    expect(kinds(b)).toEqual([
      { kind: 'do', label, requestId: undefined },
      { kind: 'undo', label, requestId: 'u1' },
      { kind: 'redo', label, requestId: undefined },
    ]);
    const [, undone] = b.ofType('project/changed');
    expect(undone).toMatchObject({
      author: 'user',
      history: { redo: { label, author: 'user' } },
      operations: [{ op: 'replace', item: { id: 'api', name: 'API' } }],
    });
  });

  it('answers a malformed message that has a request id, and ignores one without', async () => {
    await session.receive(a, JSON.stringify({ type: 'command', requestId: 'm1' }));
    await session.receive(a, JSON.stringify({ type: 'explode', requestId: 'm2' }));
    await session.receive(a, JSON.stringify({ type: 'undo' }));
    await session.receive(a, 'not JSON');
    await session.receive(a, JSON.stringify({ type: 'undo', requestId: 'r'.repeat(101) }));

    expect(a.messages.slice(1)).toEqual([
      {
        type: 'command/rejected',
        requestId: 'm1',
        problems: [{ code: 'invalid-command', message: 'The message has no command.' }],
      },
      {
        type: 'command/rejected',
        requestId: 'm2',
        problems: [{ code: 'invalid-command', message: 'Unknown message type: "explode".' }],
      },
    ]);
    expect(b.messages.slice(1)).toEqual([]);
  });

  it('answers a command that changes nothing to its sender only', async () => {
    await session.receive(
      a,
      command('n1', { type: 'update-element', id: 'api', changes: { name: 'API' } }),
    );

    expect(a.messages.slice(1)).toStrictEqual([
      {
        type: 'project/changed',
        kind: 'do',
        label: 'Rename "API" to "API"',
        author: 'user',
        history: {},
        warnings: [],
        created: [],
        operations: [],
        requestId: 'n1',
      },
    ]);
    expect(b.messages.slice(1)).toEqual([]);
  });

  it('tells every app about an action of Claude, without a request id', async () => {
    await session.execute(RENAME_API, 'claude');

    for (const client of [a, b]) {
      const [change] = client.ofType('project/changed');
      expect(change).toMatchObject({ author: 'claude', label: 'Rename "API" to "Gateway"' });
      expect(change && 'requestId' in change).toBe(false);
    }
  });

  it('sends nothing more to an app that disconnected', async () => {
    const client = new FakeClient();
    const disconnect = session.connect(client);
    disconnect();

    await session.execute(RENAME_API, 'user');

    expect(client.messages.map((message) => message.type)).toEqual(['project/opened']);
    expect(a.ofType('project/changed')).toHaveLength(1);
  });

  it('greets an app that connects later with the history as it is', async () => {
    await session.execute(RENAME_API, 'user');
    const late = new FakeClient();

    session.connect(late);

    expect(late.messages).toEqual([
      {
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: session.snapshot,
        history: { undo: { label: 'Rename "API" to "Gateway"', author: 'user' } },
      },
    ]);
  });
});

describe.each(MODES)('changes made outside the app, watching in %s mode', (mode) => {
  const watch = { ...WATCH, mode };
  const renamedModel = () => {
    const { model } = testProject();
    return {
      ...model,
      elements: model.elements.map((element) =>
        element.id === 'db' ? { ...element, name: 'Orders DB' } : element,
      ),
    };
  };

  /** The messages of a type that an app got, once there are as many as expected. */
  const received = async <T extends ServerMessage['type']>(
    client: FakeClient,
    type: T,
    count = 1,
  ) => {
    await expect.poll(() => client.ofType(type), { timeout: 5000 }).toHaveLength(count);
    return client.ofType(type);
  };

  beforeEach(() => writeProjectFolder(folder, testProject()));

  it('reload the project, clear the history and tell every app', async () => {
    const session = await open({ watch });
    const client = new FakeClient();
    session.connect(client);
    await session.execute(MOVE_CUSTOMER, 'user');

    await writeText(folder, 'model.vamodel', formatFile('model', renamedModel()));

    const [reloaded] = await received(client, 'project/reloaded');
    expect(reloaded).toEqual({
      type: 'project/reloaded',
      project: session.snapshot,
      history: {},
      reason: 'model.vamodel changed on disk.',
    });
    expect(session.snapshot.model).toEqual(renamedModel());
    expect(session.snapshot.views[0]?.positions).toContainEqual({
      element: 'customer',
      x: -300,
      y: 80,
      pinned: true,
    });
    expect(session.history).toEqual({});
    await expect(session.undo()).resolves.toMatchObject({ ok: false });
    expect(logs.out).toEqual(['Reloaded the project: model.vamodel changed on disk.']);
  });

  it('reload the project when a file is added or removed outside', async () => {
    const session = await open({ watch });
    const client = new FakeClient();
    session.connect(client);

    await writeText(folder, 'views/second.vaview', formatFile('view', SECOND_VIEW));
    const [added] = await received(client, 'project/reloaded');
    expect(added?.reason).toBe('views/second.vaview changed on disk.');
    expect(session.files.views.get('second')).toBe('views/second.vaview');

    await rm(join(folder, 'views', 'second.vaview'));
    const [, removed] = await received(client, 'project/reloaded', 2);
    expect(removed?.reason).toBe('views/second.vaview changed on disk.');
    expect(session.snapshot.views.map((view) => view.id)).toEqual(['overview']);
  });

  it('keep the project while the files on disk are not valid, tell every app, and reload once they are', async () => {
    const session = await open({ watch });
    const client = new FakeClient();
    session.connect(client);

    await writeText(folder, 'model.vamodel', '{ "world": ');

    const [notice] = await received(client, 'notice');
    expect(notice?.level).toBe('error');
    expect(notice?.message).toMatch(
      /^model\.vamodel changed on disk, but the project is not valid now, so the open project is kept:\nmodel\.vamodel: Not valid JSON: /,
    );
    expect(session.snapshot).toEqual(testProject());
    expect(client.ofType('project/reloaded')).toEqual([]);

    await writeText(folder, 'model.vamodel', formatFile('model', renamedModel()));
    const [reloaded] = await received(client, 'project/reloaded');
    expect(reloaded?.reason).toBe('model.vamodel changed on disk.');
    expect(session.snapshot.model).toEqual(renamedModel());
  });

  it('are told apart from the writes of the local program, which cause no reload', async () => {
    const session = await open({ watch });
    const client = new FakeClient();
    session.connect(client);

    await session.execute(RENAME_API, 'user');
    await session.execute(MOVE_CUSTOMER, 'user');
    await session.execute(
      { type: 'create-view', view: { name: 'Flows', perspective: { name: 'Data flow' } } },
      'user',
    );
    await session.undo();
    await delay(WATCH.delay * 8);
    await session.idle();
    expect(client.ofType('project/reloaded')).toEqual([]);
    expect(client.ofType('notice')).toEqual([]);
    expect(session.history).toEqual({
      undo: { label: 'Move "Customer" in "Overview"', author: 'user' },
      redo: { label: 'Create the view "Flows"', author: 'user' },
    });

    const scenario = { ...testProject().scenarios[0], name: 'Renamed outside' };
    await writeText(
      folder,
      'scenarios/request.vascenario',
      formatFile('scenario', scenario as never),
    );

    const [reloaded] = await received(client, 'project/reloaded');
    expect(reloaded?.reason).toBe('scenarios/request.vascenario changed on disk.');
    expect(session.snapshot.model.elements.find((element) => element.id === 'api')?.name).toBe(
      'Gateway',
    );
  });

  it('refuse a command that would overwrite a file changed on disk, and reload it', async () => {
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    await writeText(folder, 'model.vamodel', formatFile('model', renamedModel()));

    const outcome = await session.execute(RENAME_API, 'user');

    expect(outcome).toEqual({
      ok: false,
      problems: [
        {
          code: 'changed-on-disk',
          message:
            'model.vamodel changed on disk, so this change was not made; the project is reloaded from the files.',
        },
      ],
    });
    await received(client, 'project/reloaded');
    expect(session.snapshot.model).toEqual(renamedModel());
    expect(await readText(folder, 'model.vamodel')).toBe(formatFile('model', renamedModel()));
  });
});

describe('close', () => {
  it('finishes the commands already sent, then refuses new ones', async () => {
    await writeProjectFolder(folder, testProject());
    const session = await open({ watch: WATCH });

    const pending = session.execute(RENAME_API, 'user');
    await session.close();

    await expect(pending).resolves.toMatchObject({ ok: true });
    await expect(session.execute(MOVE_CUSTOMER, 'user')).resolves.toEqual({
      ok: false,
      problems: [{ code: 'project-closed', message: 'The project is closed.' }],
    });
    await expect(session.close()).resolves.toBeUndefined();
  });
});
