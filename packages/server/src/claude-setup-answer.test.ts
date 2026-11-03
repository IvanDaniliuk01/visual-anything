/**
 * "Connect Claude…" over the live connection (ADR 0093): the program answers `claude/setup` itself,
 * by running what `setup-claude` runs, in a folder of the test's own, never Claude's real one.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerMessage } from '@visual-anything/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLAUDE_CONFIG_FILE, setUpClaude } from './claude-setup';
import { NO_CLAUDE_SETUP, claudeSetupAsked } from './claude-setup-answer';
import { startServer, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { openLiveClient } from './test-support';

const SAMPLE = fileURLToPath(new URL('../../../examples/my-systems', import.meta.url));
const EXE = '/opt/visual-anything/visual-anything-linux-x64';

let folder: string;
let session: Session;
const servers: RunningServer[] = [];

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-claude-answer-'));
  await mkdir(join(folder, 'dist'));
  await writeFile(
    join(folder, 'dist', 'index.html'),
    '<!doctype html><title>Visual Anything</title>',
  );
  await cp(SAMPLE, join(folder, 'project'), { recursive: true });
  const opened = await openSession(join(folder, 'project'), {
    watch: false,
    out: () => {},
    err: () => {},
  });
  if (!opened.ok) throw new Error('The sample project does not open.');
  session = opened.session;
});

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close();
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function serve(options: { setupClaude?: Parameters<typeof startServer>[0]['setupClaude'] }) {
  const server = await startServer({
    session,
    port: 0,
    app: { mode: 'static', dir: join(folder, 'dist') },
    ...options,
  });
  servers.push(server);
  return server;
}

async function answerOf(server: RunningServer): Promise<ServerMessage> {
  const app = await openLiveClient(server.port, server.token);
  try {
    app.send({ type: 'claude/setup', requestId: 'connect-1' });
    return await vi.waitFor(() => {
      const answer = app.messages.find((each) => each.type === 'claude/setup-answer');
      if (answer === undefined) throw new Error('No answer yet.');
      return answer;
    });
  } finally {
    await app.close();
  }
}

describe('claude/setup on the live connection', () => {
  it('is answered by the program, with what it wrote to Claude Desktop’s configuration', async () => {
    const claude = join(folder, 'Claude');
    const server = await serve({
      setupClaude: () => setUpClaude({ folder: claude, program: { executable: true, path: EXE } }),
    });
    expect(await answerOf(server)).toEqual({
      type: 'claude/setup-answer',
      requestId: 'connect-1',
      outcome: 'written',
      config: join(claude, CLAUDE_CONFIG_FILE),
      entry: { command: EXE, args: ['mcp'] },
      claudeCode: `claude mcp add visual-anything -- ${EXE} mcp`,
    });
    expect(JSON.parse(await readFile(join(claude, CLAUDE_CONFIG_FILE), 'utf8'))).toEqual({
      mcpServers: { 'visual-anything': { command: EXE, args: ['mcp'] } },
    });
    // Asked again, it changes nothing.
    expect(await answerOf(server)).toMatchObject({ outcome: 'already' });
  });

  it('is refused by a program that was given no way to set Claude up', async () => {
    const server = await serve({});
    expect(await answerOf(server)).toMatchObject({ outcome: 'refused', why: NO_CLAUDE_SETUP });
  });
});

describe('which messages are claude/setup', () => {
  it('reads only an app’s claude/setup, and leaves every other message to the session', () => {
    expect(claudeSetupAsked('{"type":"claude/setup","requestId":"r1"}')).toBe('r1');
    expect(claudeSetupAsked('{"type":"undo","requestId":"r1"}')).toBeUndefined();
    // A command whose text names it is still a command.
    expect(
      claudeSetupAsked(
        JSON.stringify({
          type: 'command',
          requestId: 'r1',
          command: { type: 'update-element', id: 'a', changes: { name: '"claude/setup"' } },
        }),
      ),
    ).toBeUndefined();
    expect(claudeSetupAsked('{"type":"claude/setup"}')).toBeUndefined();
    expect(claudeSetupAsked('not JSON "claude/setup"')).toBeUndefined();
  });
});
