/**
 * For the tests of Claude's tools: the whole way a tool call goes, from an MCP client through the MCP
 * server, the tool and the bridge to the Claude endpoint of a running local program, which owns a
 * project in a folder of its own. An app can connect too, to see the guidance.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  PROTOCOL_VERSION,
  type CodeApproval,
  type Command,
  type Guidance,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PreferencesStore } from '../preferences';
import { startServer, type RunningServer } from '../server';
import { openSession, type Session } from '../session';
import { openLiveClient, testProject, writeProjectFolder, type LiveClient } from '../test-support';
import { ProgramBridge } from './bridge';
import { currentContext, writeProgramRecord } from './discovery';
import { createMcpServer } from './mcp';

/** What a tool call gave: its JSON value, or the message of its refusal. */
export type ToolCall =
  { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

export interface ToolHarness {
  /** The program's session, which owns the project. */
  readonly session: Session;
  /** The address the program serves the app at: `http://127.0.0.1:<port>/`. */
  readonly address: string;
  /** The addresses the program opened the browser at, in order. */
  readonly opened: readonly string[];
  /** Calls a tool through MCP, as Claude does. */
  call(name: string, args?: Record<string, unknown>): Promise<ToolCall>;
  /** The value of a call that worked; throws when it was refused. */
  value(name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** The message of a call that was refused; throws when it worked. */
  failure(name: string, args?: Record<string, unknown>): Promise<string>;
  /** What a call answered as MCP gives it, its content as it is, an image's included. */
  content(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  /** Opens an app on the project, as a tab does; it closes with the harness. */
  openApp(): Promise<LiveClient>;
  /** The guidance an app received, in order. */
  guidanceOf(app: LiveClient): Guidance[];
  /**
   * Runs a command as the person's, and waits until the bridge's copy of the project, which Claude's
   * tools read, has the change too.
   */
  asPerson(command: Command): Promise<void>;
  close(): Promise<void>;
}

/** Runs a program on a project and attaches an MCP client to it through the bridge. */
export async function startToolHarness(
  project: ProjectSnapshot = testProject(),
  options: {
    /** The person's approvals of package code, as their preferences hold them (ADR 0054). */
    codeApprovals?: () => readonly CodeApproval[];
    /** The packages whose code the person turned off on this computer (ADR 0089). */
    codeTurnedOff?: () => readonly string[];
    /** The person's preferences (ADR-0032), such as whether they review Claude's changes. */
    preferences?: PreferencesStore;
  } = {},
): Promise<ToolHarness> {
  const profile = await realpath(await mkdtemp(join(tmpdir(), 'va-tools-')));
  const folder = join(profile, 'project');
  await writeProjectFolder(folder, project);
  const appDir = join(profile, 'dist');
  await mkdir(appDir);
  await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...(options.preferences === undefined ? {} : { preferences: options.preferences }),
  });
  if (!result.ok) throw new Error('The test project does not open.');
  const { session } = result;
  const opened: string[] = [];
  const server: RunningServer = await startServer({
    session,
    port: 0,
    app: { mode: 'static', dir: appDir },
    openBrowser: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    ...(options.codeApprovals === undefined ? {} : { codeApprovals: options.codeApprovals }),
    ...(options.codeTurnedOff === undefined ? {} : { codeTurnedOff: options.codeTurnedOff }),
  });
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
  const bridge = new ProgramBridge({
    folder,
    runtime,
    context,
    start: () => {
      throw new Error('The program runs already.');
    },
  });
  const mcp = createMcpServer(bridge);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await mcp.connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const apps: LiveClient[] = [];

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolCall> => {
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as { type: string; text: string }[];
    const text = first?.text ?? '';
    if (result.isError) return { ok: false, message: text };
    return { ok: true, value: JSON.parse(text) as Record<string, unknown> };
  };

  return {
    session,
    address: server.address,
    opened,
    call,
    value: async (name, args) => {
      const outcome = await call(name, args);
      if (!outcome.ok) throw new Error(`${name} was refused: ${outcome.message}`);
      return outcome.value;
    },
    failure: async (name, args) => {
      const outcome = await call(name, args);
      if (outcome.ok) throw new Error(`${name} worked: ${JSON.stringify(outcome.value)}`);
      return outcome.message;
    },
    content: async (name, args = {}) =>
      (await client.callTool({ name, arguments: args })) as CallToolResult,
    openApp: async () => {
      const app = await openLiveClient(server.port, server.token);
      apps.push(app);
      return app;
    },
    guidanceOf: (app) =>
      app.messages.flatMap((message) => (message.type === 'guidance' ? [message.guidance] : [])),
    asPerson: async (command) => {
      const outcome = await session.execute(command, 'user');
      if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
      // While Claude's proposal waits, Claude reads the proposed project, rebased on the change.
      const wanted = canonical(session.proposed ?? session.snapshot);
      for (let tries = 0; canonical(await bridge.project()) !== wanted; tries++) {
        if (tries > 200) throw new Error('The bridge never saw the person’s change.');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    close: async () => {
      for (const app of apps) await app.close();
      await client.close();
      bridge.close();
      await server.close();
      await session.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 10 });
    },
  };
}

/** A project as JSON with its keys sorted, so that two equal projects give the same text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) =>
    each !== null && typeof each === 'object' && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b ? -1 : 1)))
      : each,
  );
}
