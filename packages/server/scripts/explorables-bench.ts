/**
 * The frame budget with an explorable live on the canvas (A10.5, ADR 0107), recorded, never held:
 *
 *     pnpm exec tsx packages/server/scripts/explorables-bench.ts [--skip-build] [--elements=10000]
 *                                                               [--modes=frames,work]
 *
 * It builds the benchmark pages for production with the bench Vite config (unless `--skip-build`),
 * serves `packages/app/dist-bench` itself on a free port from 47800 to 47899, starts the program's
 * frame listener on another, serving the quadratic sample's explorable, and opens
 * `/bench.html?elements=10000&explorable&…` in headless Chrome with `--site-per-process`, once per
 * mode: frames mode (frames as shown, where a frame laid over the canvas costs what it costs) and work
 * mode (each frame's own work, GPU included). The page pans and zooms at four scales with no
 * explorable, then with the explorable explored in place (`packages/app/src/bench/explorable.ts`),
 * and posts what it measured. It prints a table of each phase and the page's notes, and `--json`
 * prints everything. Unlike `pnpm bench`, the pages are served without cross-origin isolation, since
 * the frame's document does not carry the headers a cross-origin isolated page needs of its frames:
 * the clock reads to 0.1 ms, which frames of 16.7 ms do not miss.
 *
 * Each mode has 240 s, the build 240 s, and the whole run 10 minutes; whatever hangs is stopped and
 * said, and the run exits with 2. It writes only `packages/app/dist-bench`, which git ignores.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { cpus, totalmem, freemem, release } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalHashOf, buildFrame, explorableTextHash } from '@visual-anything/core';
import { VA_RUNTIME } from '@visual-anything/app/src/explorables/runtime/va-runtime.generated';
import { startFrameListener } from '../src/explorables/listener';
import { freePort, runHeadless } from './explorables-browsers';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const APP = join(ROOT, 'packages/app');
const DIST = join(APP, 'dist-bench');

const args = process.argv.slice(2);
const option = (name: string) =>
  args.find((each) => each.startsWith(`--${name}=`))?.slice(name.length + 3);
const elements = Number(option('elements') ?? 10_000);
const modes = (option('modes') ?? 'frames,work').split(',').filter((each) => each !== '');

const deadline = setTimeout(() => {
  console.error('The benchmark did not finish within 10 minutes: stopped.');
  process.exit(2);
}, 600_000);

// ——— The build ———

if (!args.includes('--skip-build')) {
  console.log('Building the benchmark pages for production…');
  const built = await new Promise<string>((resolve) => {
    const child = spawn(
      process.execPath,
      [join(APP, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.bench.config.ts'],
      { cwd: APP, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString('utf8')));
    const timer = setTimeout(() => {
      child.kill();
      resolve('The build took more than 240 s and was stopped.');
    }, 240_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? '' : `The build failed (${code}): ${errors.slice(-2000)}`);
    });
  });
  if (built !== '') {
    console.error(built);
    process.exit(2);
  }
}
if (!existsSync(join(DIST, 'bench.html'))) {
  console.error('There is no built benchmark page: run without --skip-build.');
  process.exit(2);
}

// ——— The servers ———

const taken = new Set<number>();
const ports = { listener: await freePort(taken), pages: await freePort(taken) };
const pagesOrigin = `http://127.0.0.1:${ports.pages}`;

const text = readFileSync(
  join(ROOT, 'examples/quadratic-function/explorables/quadratic.html'),
  'utf8',
);
const ID = 'bench.quadratic';
const HASH = approvalHashOf(explorableTextHash(text), []);
const listener = await startFrameListener({
  port: ports.listener,
  serve: (explorable, hash) => {
    if (explorable !== ID || hash !== HASH) {
      return Promise.resolve({ ok: false, status: 404, message: 'Not the benchmark’s frame.' });
    }
    const built = buildFrame({
      text,
      scriptLibraries: [],
      runtime: VA_RUNTIME,
      appOrigin: pagesOrigin,
    });
    return Promise.resolve({ ok: true, html: built.html, policy: built.policy });
  },
});

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

let resolveResults: (value: BenchResults) => void = () => {};
const pages = createServer((request, response) => {
  const url = new URL(request.url ?? '/', pagesOrigin);
  if (url.pathname === '/bench-results' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => {
      response.writeHead(204).end();
      resolveResults(JSON.parse(body) as BenchResults);
    });
    return;
  }
  const path = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!path.startsWith(DIST + sep) || !existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(readFileSync(path));
});
await new Promise<void>((resolve) => pages.listen(ports.pages, '127.0.0.1', resolve));

// ——— The runs ———

interface BenchResults {
  failed?: string;
  mode?: string;
  userAgent?: string;
  glRenderer?: string;
  devicePixelRatio?: number;
  viewport?: { width: number; height: number };
  rows?: {
    name: string;
    frames: number;
    average: number;
    p50: number;
    p95: number;
    worst: number;
  }[];
  notes?: string[];
  live?: boolean;
  readyIn?: number;
  stopped?: unknown;
}

const machine = {
  os: `${process.platform} ${release()}`,
  cpus: `${cpus().length} × ${cpus()[0]?.model ?? 'unknown'}`,
  memory: `${(totalmem() / 2 ** 30).toFixed(1)} GiB, ${(freemem() / 2 ** 30).toFixed(1)} GiB free at the start`,
  node: process.version,
};
console.log(`Machine: ${machine.os}; ${machine.cpus}; ${machine.memory}; Node ${machine.node}`);
const all: Record<string, unknown> = { machine };
let incomplete = false;
for (const mode of modes) {
  const query = new URLSearchParams({
    elements: String(elements),
    mode,
    listener: String(listener.port),
    nonce: listener.nonce,
    id: ID,
    hash: HASH,
  });
  const address = `${pagesOrigin}/bench.html?explorable&${query.toString()}`;
  const results = new Promise<BenchResults>((resolve) => {
    resolveResults = resolve;
  });
  const started = Date.now();
  const run = await runHeadless('chrome', address, results, { timeoutMs: 240_000 });
  const took = ((Date.now() - started) / 1000).toFixed(0);
  if ('skipped' in run) {
    console.log(run.skipped);
    incomplete = true;
    break;
  }
  const outcome: BenchResults = run.outcome;
  all[mode] = outcome;
  console.log(`\n${mode} mode (${took} s): ${outcome.userAgent ?? run.browser}`);
  if (outcome.failed !== undefined) {
    console.log(`  Not taken: ${outcome.failed}`);
    incomplete = true;
    continue;
  }
  console.log(
    `  WebGL: ${outcome.glRenderer ?? 'unknown'}; viewport ${outcome.viewport?.width} × ${outcome.viewport?.height}, device pixel ratio ${outcome.devicePixelRatio}`,
  );
  console.log('  | Phase | Frames | Avg ms | p50 ms | p95 ms | Worst ms |');
  console.log('  | --- | --- | --- | --- | --- | --- |');
  for (const row of outcome.rows ?? []) {
    console.log(
      `  | ${row.name} | ${row.frames} | ${row.average.toFixed(1)} | ${row.p50.toFixed(1)} | ${row.p95.toFixed(1)} | ${row.worst.toFixed(1)} |`,
    );
  }
  for (const note of outcome.notes ?? []) console.log(`  ${note}.`);
}
if (args.includes('--json')) console.log(JSON.stringify(all, null, 2));
await listener.close();
await new Promise((resolve) => pages.close(resolve));
clearTimeout(deadline);
process.exitCode = incomplete ? 2 : 0;
