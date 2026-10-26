/**
 * `visual-anything live <folder>` (ADR 0057): JSON lines in, live values out to the program running
 * on the folder, as the command line's; hostile lines skipped and said, never kept whole.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION, type LiveValuesMessage } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { NoProgramRunningError, ProgramBridge, type LiveSetOptions } from './claude/bridge';
import { currentContext, writeProgramRecord } from './claude/discovery';
import type { LiveKept } from './live';
import { LIVE_USAGE, MAX_LINE, runLive, type LiveTarget } from './live-command';
import { startServer } from './server';
import { openSession } from './session';
import { openLiveClient, testProject, writeProjectFolder } from './test-support';

/** A program that takes everything, recording what it was sent. */
class FakeTarget implements LiveTarget {
  readonly sent: { values: unknown[]; options: LiveSetOptions | undefined }[] = [];
  closed = false;

  constructor(private readonly known = new Set(['api', 'db'])) {}

  project() {
    return Promise.resolve(testProject());
  }

  setLive(values: readonly unknown[], options?: LiveSetOptions): Promise<LiveKept> {
    this.sent.push({ values: [...values], options });
    const unknown = [
      ...new Set(
        values
          .map((each) => (each as { target: string }).target)
          .filter((target) => !this.known.has(target)),
      ),
    ];
    return Promise.resolve({
      kept:
        values.length -
        values.filter((each) => unknown.includes((each as { target: string }).target)).length,
      waiting: 0,
      dropped: 0,
      unknown,
      refused: [],
    });
  }

  close() {
    this.closed = true;
  }
}

/** Standard input as these chunks, each after a turn of the event loop, as a pipe gives them. */
async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<string | Uint8Array> {
  for (const part of parts) {
    await Promise.resolve();
    yield part;
  }
}

async function run(
  argv: string[],
  input: AsyncIterable<string | Uint8Array>,
  target = new FakeTarget(),
) {
  const out: string[] = [];
  const err: string[] = [];
  const waits: number[] = [];
  const code = await runLive(argv, {
    cwd: tmpdir(),
    input,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    runtimeFolder: join(tmpdir(), 'nowhere'),
    attach: () => target,
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  return { code, out, err, waits, target };
}

describe('visual-anything live', () => {
  it('sends each line as a live value of the command line, with its freshness', async () => {
    const { code, out, err, target } = await run(
      ['project', '--fresh-for', '15'],
      chunks(
        '{"target": "api", "attribute": "latency", "value": 120}\n',
        '{"target": "db", "attribute": "load", "value": {"cpu": 0.5}, "measuredAt": "2026-10-25T14:03:00Z"}\r\n',
      ),
    );
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(target.sent).toEqual([
      {
        values: [{ target: 'api', attribute: 'latency', value: 120 }],
        options: { freshFor: 15_000, from: 'command-line' },
      },
      {
        values: [
          {
            target: 'db',
            attribute: 'load',
            value: { cpu: 0.5 },
            measuredAt: Date.parse('2026-10-25T14:03:00Z'),
          },
        ],
        options: { freshFor: 15_000, from: 'command-line' },
      },
    ]);
    expect(out).toEqual(['Sent 2 live values.']);
    expect(target.closed).toBe(true);
  });

  it('reads lines split across chunks, and letters split across bytes', async () => {
    const line = new TextEncoder().encode(
      '{"target": "api", "attribute": "señal", "value": "ñ"}\n',
    );
    const { target } = await run(
      ['p'],
      chunks(
        '{"target": "api", "attri',
        'bute": "a", "value": 1}\n',
        line.slice(0, 40),
        line.slice(40),
      ),
    );
    expect(target.sent.flatMap((each) => each.values)).toEqual([
      { target: 'api', attribute: 'a', value: 1 },
      { target: 'api', attribute: 'señal', value: 'ñ' },
    ]);
  });

  it('skips and names the lines that are not live values, and those of unknown targets', async () => {
    const polluted = '{"target": "api", "attribute": "a", "value": {"__proto__": {"x": 1}}}';
    const { code, err, target } = await run(
      ['p'],
      chunks(
        [
          'not json',
          '[1, 2]',
          '{"target": "api", "attribute": "a"}',
          polluted,
          '{"target": "api", "attribute": "a", "value": 1, "measuredAt": "yesterday"}',
          '{"target": "nothing", "attribute": "a", "value": 1}',
          '',
          '{"target": "api", "attribute": "ok", "value": true}',
        ].join('\n'),
      ),
    );
    expect(code).toBe(0);
    expect(err).toEqual([
      'Line 1 is not JSON.',
      'Line 2 is not a JSON object.',
      'Line 3 has no value for "a".',
      'Line 4 has a value for "a" that it has the key "__proto__".',
      'Line 5 has a measuredAt that is neither an ISO 8601 date-time nor milliseconds since 1970.',
      'Line 6 is of "nothing", which is neither an element nor a relation of "Shop".',
    ]);
    expect(target.sent.flatMap((each) => each.values)).toHaveLength(2);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('skips a line past its cap without keeping it whole', async () => {
    const long = `{"target": "api", "attribute": "a", "value": "${'x'.repeat(MAX_LINE)}"}`;
    const { err, target } = await run(
      ['p'],
      chunks(
        long.slice(0, 40_000),
        long.slice(40_000),
        '\n{"target": "api", "attribute": "b", "value": 2}\n',
        `${'y'.repeat(MAX_LINE + 1)}`,
      ),
    );
    expect(err).toEqual(['Line 1 is longer than 64 KiB.', 'Line 3 is longer than 64 KiB.']);
    expect(target.sent.flatMap((each) => each.values)).toEqual([
      { target: 'api', attribute: 'b', value: 2 },
    ]);
  });

  it('sends a thousand values a message, at most twenty messages a second', async () => {
    const lines = Array.from(
      { length: 2500 },
      (_, at) => `{"target": "api", "attribute": "a${at}", "value": ${at}}\n`,
    ).join('');
    const { target, waits, out } = await run(['p'], chunks(lines));
    expect(target.sent.map((each) => each.values.length)).toEqual([1000, 1000, 500]);
    expect(waits.every((ms) => ms > 0 && ms <= 50)).toBe(true);
    expect(waits.length).toBeGreaterThan(0);
    expect(out).toEqual(['Sent 2500 live values.']);
  });

  it('says when no Visual Anything runs on the folder, and starts none', async () => {
    const target = new FakeTarget();
    target.project = () => Promise.reject(new NoProgramRunningError('not running'));
    const { code, err } = await run(['p'], chunks(''), target);
    expect(code).toBe(1);
    expect(err[0]).toMatch(
      /^Visual Anything is not running on .*p\. Start it with: visual-anything /,
    );
  });

  it('reads its arguments', async () => {
    expect((await run([], chunks(''))).code).toBe(2);
    expect((await run(['a', 'b'], chunks(''))).code).toBe(2);
    expect((await run(['a', '--fresh-for', '0'], chunks(''))).code).toBe(2);
    expect((await run(['a', '--fresh-for', 'soon'], chunks(''))).code).toBe(2);
    const help = await run(['--help'], chunks(''));
    expect(help.code).toBe(0);
    expect(help.out).toEqual([LIVE_USAGE]);
  });
});

describe('visual-anything live, with a program running', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('shows the values in the open app, as the command line’s', async () => {
    const profile = await realpath(await mkdtemp(join(tmpdir(), 'va-live-command-')));
    const folder = join(profile, 'project');
    await writeProjectFolder(folder, testProject());
    const appDir = join(profile, 'dist');
    await mkdir(appDir);
    await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The test project does not open.');
    const { session } = opened;
    const server = await startServer({ session, port: 0, app: { mode: 'static', dir: appDir } });
    const runtime = join(profile, 'run');
    const context = { ...currentContext(), home: profile };
    await writeProgramRecord(
      runtime,
      {
        format: 1,
        protocolVersion: PROTOCOL_VERSION,
        pid: process.pid,
        port: server.port,
        folder: session.folder.replaceAll('\\', '/'),
        credential: server.credential,
        startedAt: new Date(Date.now() - 1000).toISOString(),
      },
      context,
    );
    const app = await openLiveClient(server.port, server.token);
    cleanup = async () => {
      await app.close();
      await server.close();
      await session.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 10 });
    };
    const out: string[] = [];
    const code = await runLive([folder], {
      cwd: profile,
      input: chunks('{"target": "api", "attribute": "latency", "value": 95}\n'),
      out: (line) => out.push(line),
      err: () => {},
      runtimeFolder: runtime,
      attach: (at) => new ProgramBridge({ folder: at, runtime, context, attachOnly: true }),
    });
    expect(code).toBe(0);
    expect(out).toEqual(['Sent 1 live value.']);
    const live = () =>
      app.messages.filter((each): each is LiveValuesMessage => each.type === 'live/values');
    await expect.poll(() => live().length).toBe(1);
    expect(live()[0]?.values[0]).toMatchObject({
      target: 'api',
      attribute: 'latency',
      value: 95,
      sender: { kind: 'command-line' },
    });
    expect(session.history).toEqual({});
  });
});
