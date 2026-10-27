/**
 * Smoke-tests a single executable of the local program on the system it was made for (ADR 0037), as
 * CI does before it keeps one. The executable runs with no Node.js on its search path, on copies of
 * `examples/my-systems`, with a runtime folder and preferences of its own:
 *
 * 1. started with `--no-open --port <free>`, it serves the app's page on 127.0.0.1 with its policy,
 *    and a script the page loads;
 * 2. `visual-anything mcp` on that project answers MCP's `initialize` and `tools/list`, and reads the
 *    project through the program that runs;
 * 3. `visual-anything mcp` on a project where none runs starts the program itself, and reads it;
 * 4. `visual-anything import` makes a drawing of an HTML file with the satori and WebAssembly the
 *    executable holds, in its worker, and `visual-anything notices` names satori and its source
 *    (ADR 0068);
 * 5. with `--browser`, started without `--no-open`, it opens the browser at a launch address. On
 *    macOS and Linux a stand-in for `open` or `xdg-open`, first on the search path, records the
 *    address it was given; on Windows the system's own browser opens.
 *
 * Every program it starts is stopped before it ends.
 *
 *   tsx packages/server/scripts/smoke.ts [executable] [--browser]
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { request, type IncomingHttpHeaders } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { OUT_DIR, REPOSITORY, executableName, withoutNode } from './sea';

/** Ports the smoke test never takes, as other programs on the developer's computer use them. */
const RESERVED_PORTS = new Set([47700, 47707, 47710]);
const SAMPLE = join(REPOSITORY, 'examples', 'my-systems');
const SAMPLE_NAME = 'My systems';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { browser: { type: 'boolean' } },
});
const executable = resolve(positionals[0] ?? join(OUT_DIR, executableName(process.platform)));
const say = (line: string) => console.log(`[smoke] ${line}`);
const children = new Set<ChildProcess>();
const temporary = await mkdtemp(join(tmpdir(), 'va-smoke-'));
const began = performance.now();

try {
  const runtime = join(temporary, 'run');
  const env = environment(withoutNode(process.env.PATH ?? ''), runtime);
  say(`${executable}, ${((await stat(executable)).size / 1024 / 1024).toFixed(1)} MiB`);
  say(`Its search path holds no Node.js: ${env.PATH === '' ? '(empty)' : env.PATH}`);

  const project = await copySample('project');
  const port = await freePort();
  const started = performance.now();
  const program = start([project, '--no-open', '--port', String(port)], env);
  await program.printed('Visual Anything is running at', 60_000);
  const startup = performance.now() - started;
  say(`It started on ${project} and listened on 127.0.0.1:${port} in ${startup.toFixed(0)} ms.`);
  await checkPage(port);

  const mcp = mcpClient(['mcp', project], env);
  await mcp.initialize();
  const tools = await mcp.toolNames();
  if (!tools.includes('get_project'))
    throw new Error(`tools/list has no get_project: ${tools.join(', ')}`);
  say(`visual-anything mcp lists ${tools.length} tools.`);
  await mcp.expectProject();
  say('It read the project through the program that runs.');
  await mcp.close();
  await stop(program.child);

  // A runtime folder of its own, which holds no record of the program stopped above.
  const aloneRuntime = join(temporary, 'run-alone');
  const alone = await copySample('alone');
  const claude = mcpClient(['mcp', alone], environment(env.PATH ?? '', aloneRuntime));
  await claude.initialize();
  await claude.expectProject();
  await claude.close();
  const pids = await stopRecordedPrograms(aloneRuntime);
  say(`visual-anything mcp started the program itself (${pids.join(', ')}), and read the project.`);

  await checkDrawing(await copySample('drawing'), env);
  say('visual-anything import made a drawing of HTML in its worker, and notices names satori.');

  if (values.browser === true) await checkBrowser(await copySample('browser'), runtime);
  say(`Passed in ${((performance.now() - began) / 1000).toFixed(0)} s.`);
} finally {
  for (const child of children) child.kill();
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

/** Runs the executable to its end, and gives its exit code and what it printed. */
function runToEnd(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; out: string; err: string }>((done, fail) => {
    const child = spawn(executable, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.add(child);
    let out = '';
    let err = '';
    child.stdout?.setEncoding('utf8').on('data', (text: string) => (out += text));
    child.stderr?.setEncoding('utf8').on('data', (text: string) => (err += text));
    const timer = setTimeout(() => {
      child.kill();
      fail(
        new Error(`The executable did not end within a minute: ${args.join(' ')}\n${out}${err}`),
      );
    }, 60_000);
    child.once('error', fail);
    child.once('exit', (code) => {
      clearTimeout(timer);
      children.delete(child);
      done({ code, out, err });
    });
  });
}

/** Makes a drawing of an HTML file into a project, as the person does on the command line. */
async function checkDrawing(project: string, env: NodeJS.ProcessEnv): Promise<void> {
  const page = join(temporary, 'card.html');
  await writeFile(
    page,
    '<div style="padding: 12px; border: 2px solid #1D4F91"><h2>Basic</h2><p>$10 a month</p><script>x()</script></div>',
  );
  const imported = await runToEnd(['import', project, page], env);
  if (imported.code !== 0 || !imported.out.includes('Done: Import "card.html" as a drawing')) {
    throw new Error(
      `The drawing was not imported (${imported.code}):\n${imported.out}${imported.err}`,
    );
  }
  if (!imported.out.includes('1 script element')) {
    throw new Error(`The import did not say it dropped the script:\n${imported.out}`);
  }
  const notices = await runToEnd(['notices'], env);
  if (notices.code !== 0 || !/satori \d+\.\d+\.\d+\n {2}License: MPL-2\.0/.test(notices.out)) {
    throw new Error(
      `notices does not name satori's license and source:\n${notices.out}${notices.err}`,
    );
  }
}

/** The executable's environment: this one's, with another search path and folders of its own. */
function environment(path: string, runtime: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  // Windows spells it Path; a second PATH beside it would leave which one wins to chance.
  for (const [name, value] of Object.entries(process.env)) {
    if (name.toUpperCase() !== 'PATH') env[name] = value;
  }
  const found = path
    .split(delimiter)
    .find((folder) => existsSync(join(folder, process.platform === 'win32' ? 'node.exe' : 'node')));
  if (found !== undefined) throw new Error(`Node.js is still on the search path, in ${found}.`);
  return {
    ...env,
    PATH: path,
    VISUAL_ANYTHING_RUNTIME: runtime,
    VISUAL_ANYTHING_PREFERENCES: join(temporary, 'preferences'),
  };
}

async function copySample(name: string): Promise<string> {
  const folder = join(temporary, name);
  await cp(SAMPLE, folder, { recursive: true });
  return folder;
}

/** A port no program listens on, other than the reserved ones. */
async function freePort(): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((done, fail) => {
      const server = createServer();
      server.once('error', fail);
      server.listen({ port: 0, host: '127.0.0.1' }, () => {
        const address = server.address();
        const found = typeof address === 'object' && address !== null ? address.port : 0;
        server.close(() => done(found));
      });
    });
    if (port !== 0 && !RESERVED_PORTS.has(port)) return port;
  }
}

/** Starts the executable, collecting what it prints. */
function start(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  let out = '';
  let err = '';
  child.stdout?.setEncoding('utf8').on('data', (text: string) => (out += text));
  child.stderr?.setEncoding('utf8').on('data', (text: string) => (err += text));
  let exited: number | null | undefined;
  child.once('exit', (code) => (exited = code));
  return {
    child,
    out: () => out,
    err: () => err,
    /** Waits until a line of its output holds `text`. */
    printed: async (text: string, timeout: number) => {
      const deadline = Date.now() + timeout;
      while (!out.includes(text)) {
        if (exited !== undefined) {
          throw new Error(
            `The executable stopped (${exited}) before it printed "${text}":\n${out}${err}`,
          );
        }
        if (Date.now() > deadline)
          throw new Error(`The executable did not print "${text}":\n${out}${err}`);
        await delay(50);
      }
    },
  };
}

/** Stops a program: with SIGTERM, which it handles, except on Windows, which has no signals. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once('exit', done));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(10_000).then(() => child.kill('SIGKILL'))]);
}

/** One HTTP GET to the local program, as the browser sends it. */
function get(port: number, path: string) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>(
    (done, fail) => {
      const outgoing = request(
        { host: '127.0.0.1', port, path, headers: { Host: `127.0.0.1:${port}` }, agent: false },
        (response) => {
          let body = '';
          response.setEncoding('utf8').on('data', (text: string) => (body += text));
          response.on('end', () =>
            done({ status: response.statusCode ?? 0, headers: response.headers, body }),
          );
        },
      );
      outgoing.on('error', fail);
      outgoing.end();
    },
  );
}

/** A header of a reply, as one string. */
function header(reply: { headers: IncomingHttpHeaders }, name: string): string {
  const value = reply.headers[name];
  return Array.isArray(value) ? value.join(', ') : (value ?? '');
}

/** Checks that the program serves the app's page and a script it loads, with their policies. */
async function checkPage(port: number): Promise<void> {
  const page = await get(port, '/');
  const policy = header(page, 'content-security-policy');
  if (page.status !== 200 || !header(page, 'content-type').startsWith('text/html')) {
    throw new Error(`GET / answered ${page.status} ${header(page, 'content-type')}.`);
  }
  if (!page.body.includes('<div id="root">') || !policy.includes("script-src 'self'")) {
    throw new Error(`GET / is not the app's page with its policy:\n${policy}\n${page.body}`);
  }
  const script = /<script[^>]*\bsrc="(\/assets\/[^"]+\.js)"/.exec(page.body)?.[1];
  if (script === undefined) throw new Error(`The page loads no script of its own:\n${page.body}`);
  const loaded = await get(port, script);
  if (
    loaded.status !== 200 ||
    !header(loaded, 'content-type').startsWith('text/javascript') ||
    !header(loaded, 'content-security-policy').includes("connect-src 'none'")
  ) {
    throw new Error(`GET ${script} answered ${loaded.status} ${header(loaded, 'content-type')}.`);
  }
  say(`GET / answered on 127.0.0.1 with the app's page, and GET ${script} with its script.`);
}

/** A client of `visual-anything mcp` over stdio, as Claude Code starts it. */
function mcpClient(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  const answers = new Map<number, (message: Record<string, unknown>) => void>();
  let buffered = '';
  let err = '';
  child.stderr?.setEncoding('utf8').on('data', (text: string) => (err += text));
  child.stdout?.setEncoding('utf8').on('data', (text: string) => {
    buffered += text;
    for (let end = buffered.indexOf('\n'); end !== -1; end = buffered.indexOf('\n')) {
      const line = buffered.slice(0, end).trim();
      buffered = buffered.slice(end + 1);
      if (line === '') continue;
      const message = JSON.parse(line) as Record<string, unknown>;
      if (typeof message.id === 'number') answers.get(message.id)?.(message);
    }
  });
  let next = 0;
  const send = (message: Record<string, unknown>) =>
    child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const call = async (method: string, params: unknown, timeout = 60_000) => {
    next += 1;
    const id = next;
    const answer = new Promise<Record<string, unknown>>((done) => answers.set(id, done));
    send({ id, method, params });
    const result = await Promise.race([answer, delay(timeout).then(() => undefined)]);
    if (result === undefined)
      throw new Error(`visual-anything mcp did not answer ${method}:\n${err}`);
    if (result.error !== undefined) {
      throw new Error(
        `visual-anything mcp answered ${method} with ${JSON.stringify(result.error)}`,
      );
    }
    return result.result as Record<string, unknown>;
  };
  return {
    initialize: async () => {
      await call('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'visual-anything-smoke-test', version: '0' },
      });
      send({ method: 'notifications/initialized' });
    },
    toolNames: async () => {
      const result = await call('tools/list', {});
      return (result.tools as { name: string }[]).map((tool) => tool.name);
    },
    expectProject: async () => {
      const result = await call('tools/call', { name: 'get_project', arguments: {} });
      const text = JSON.stringify(result.content);
      if (result.isError === true || !text.includes(SAMPLE_NAME)) {
        throw new Error(`get_project did not read "${SAMPLE_NAME}": ${text}\n${err}`);
      }
    },
    /** Closes stdin, as Claude does, and checks that the entry point then exits. */
    close: async () => {
      const exited = new Promise<boolean>((done) => child.once('exit', () => done(true)));
      child.stdin?.end();
      if (!(await Promise.race([exited, delay(10_000).then(() => false)]))) {
        child.kill();
        throw new Error(`visual-anything mcp did not exit once its stdin closed:\n${err}`);
      }
    },
  };
}

/** Stops the programs that left a record in the runtime folder, and says which they were. */
async function stopRecordedPrograms(runtime: string): Promise<number[]> {
  const pids: number[] = [];
  for (const name of await readdir(runtime)) {
    if (!name.endsWith('.json')) continue;
    const record = JSON.parse(await readFile(join(runtime, name), 'utf8')) as { pid: number };
    pids.push(record.pid);
    try {
      process.kill(record.pid, 'SIGTERM');
    } catch {
      // It stopped already.
    }
  }
  if (pids.length === 0) throw new Error('No program left its record in the runtime folder.');
  for (const pid of pids) {
    for (let tries = 0; tries < 100 && isRunning(pid); tries++) await delay(100);
  }
  return pids;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks that the executable opens the browser at a launch address: through a stand-in for the
 * system's opener on macOS and Linux, through the system's own browser on Windows.
 */
async function checkBrowser(project: string, runtime: string): Promise<void> {
  const opened = join(temporary, 'opened.txt');
  let path = withoutNode(process.env.PATH ?? '');
  if (process.platform !== 'win32') {
    const bin = join(temporary, 'bin');
    await mkdir(bin);
    const opener = join(bin, process.platform === 'darwin' ? 'open' : 'xdg-open');
    await writeFile(opener, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${opened}'\n`);
    await chmod(opener, 0o755);
    path = [bin, path].filter((each) => each !== '').join(delimiter);
  }
  const program = start([project, '--port', String(await freePort())], environment(path, runtime));
  await program.printed('Visual Anything is running at', 60_000);
  if (process.platform === 'win32') {
    // The browser opens in the background; a failure is printed within a few seconds.
    await delay(5_000);
  } else {
    const deadline = Date.now() + 15_000;
    while (!existsSync(opened) && Date.now() < deadline) await delay(100);
  }
  if (program.err().includes('Could not open the browser')) {
    throw new Error(`The executable could not open the browser:\n${program.err()}`);
  }
  if (process.platform !== 'win32') {
    const address = existsSync(opened) ? await readFile(opened, 'utf8') : '';
    if (!/^http:\/\/127\.0\.0\.1:\d+\/#launch=/m.test(address)) {
      throw new Error(`The executable did not open the browser at a launch address: "${address}"`);
    }
  }
  await stop(program.child);
  say(
    process.platform === 'win32'
      ? 'It opened the browser through Windows, which reported no failure.'
      : `It opened the browser through ${process.platform === 'darwin' ? 'open' : 'xdg-open'} on its search path, at a launch address.`,
  );
}
