/**
 * The explorables' proof in real browsers (ADR 0107, A10.2), which the developer runs, outside the
 * test run:
 *
 *     pnpm exec tsx packages/server/scripts/explorables-proof.ts [chrome] [firefox]
 *
 * It starts the program's own frame listener and a page that stands in for the app, each on a free
 * port from 47800 to 47899, with the `va` runtime the listener serves, and opens that page in each
 * browser headless, with frame isolation as the browser ships it (no puppeteer, which turns it off).
 * The page frames, with the app's own host: the quadratic sample's explorable (it loads, gets its
 * data, posts a still); a probe of what a frame may reach (network, storage, the parent, the token,
 * `eval`); how styles apply under hash-only `style-src` (a library's injected `<style>`, a `style`
 * attribute, the CSSOM) and KaTeX's two ways of rendering; a page that loops, which the watchdog
 * removes while the page stays responsive; and pages that reload or navigate themselves, which get
 * no second hello. A sink on another port counts every request that reaches it: it must count none.
 *
 * Browsers are found at their usual places, or given by CHROME and FIREFOX. A browser not found is
 * said and skipped. It writes nothing in the repository.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNet } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalHashOf, buildFrame, explorableTextHash } from '@visual-anything/core';
import { VA_RUNTIME } from '@visual-anything/app/src/explorables/runtime/va-runtime.generated';
import { startFrameListener } from '../src/explorables/listener';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function freePort(taken: Set<number>): Promise<number> {
  for (let port = 47800; port <= 47899; port += 1) {
    if (taken.has(port)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const probe = createNet();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) {
      taken.add(port);
      return port;
    }
  }
  throw new Error('No free port from 47800 to 47899.');
}

const taken = new Set<number>();
const ports = {
  listener: await freePort(taken),
  app: await freePort(taken),
  sink: await freePort(taken),
};
const appOrigin = `http://127.0.0.1:${ports.app}`;
const SINK = `http://127.0.0.1:${ports.sink}`;

// ——— The explorables ———

const katexDir = join(ROOT, 'node_modules/.pnpm/katex@0.19.1/node_modules/katex/dist');
const katexScript = readFileSync(join(katexDir, 'katex.min.js'), 'utf8');
// Its fonts would be fetched from addresses the frame refuses: the proof looks at styles only.
const katexStyle = readFileSync(join(katexDir, 'katex.min.css'), 'utf8').replace(
  /@font-face\{[^}]*\}/g,
  '',
);

// The probes below are the frame's own code, which its policy must stop: `eval`, `Function`,
// `innerHTML` and the network are what they try, inside the sandboxed frame, never in this program.
const REPORT = `const report = (name, r) => setTimeout(() => { console.error(name + ' ' + JSON.stringify(r)); va.ready(); }, 1500);`;

const pages: Record<string, { text: string; libraries?: { global: string; text: string }[] }> = {
  quadratic: {
    text: readFileSync(
      join(ROOT, 'examples/quadratic-function/explorables/quadratic.html'),
      'utf8',
    ),
  },
  probe: {
    text: `<!doctype html><html><body><p>probe</p><script>
${REPORT}
const r = {};
const tryIt = (name, f) => { try { const v = f(); r[name] = v === undefined ? 'ran' : String(v).slice(0, 60); } catch (e) { r[name] = 'blocked: ' + e.name; } };
tryIt('parentDocument', () => parent.document.title);
tryIt('parentToken', () => parent.sessionStorage.getItem('visual-anything.token'));
tryIt('parentSecret', () => top.secret);
tryIt('localStorage', () => localStorage.length);
tryIt('sessionStorage', () => sessionStorage.length);
tryIt('cookie', () => document.cookie = 'a=1');
tryIt('indexedDB', () => indexedDB.open('x') && 'opened');
tryIt('eval', () => eval('1 + 1'));
tryIt('Function', () => new Function('return 2')());
tryIt('worker', () => new Worker('data:text/javascript,1') && 'made');
tryIt('origin', () => self.origin);
const sink = '${SINK}';
const wait = (name, p) => p.then(() => { r[name] = 'REACHED'; }, (e) => { r[name] = 'blocked: ' + (e && e.name); });
wait('fetch', fetch(sink + '/fetch'));
tryIt('xhr', () => { const x = new XMLHttpRequest(); x.open('GET', sink + '/xhr'); x.send(); return 'sent'; });
tryIt('webSocket', () => new WebSocket('ws://127.0.0.1:${ports.sink}/ws') && 'made');
tryIt('eventSource', () => new EventSource(sink + '/sse') && 'made');
tryIt('image', () => { const i = new Image(); i.src = sink + '/img'; return 'made'; });
tryIt('beacon', () => navigator.sendBeacon(sink + '/beacon', 'x'));
tryIt('nestedFrame', () => { const f = document.createElement('iframe'); f.src = sink + '/frame'; document.body.append(f); return 'made'; });
tryIt('prefetch', () => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = sink + '/prefetch'; document.head.append(l); return 'made'; });
tryIt('popup', () => window.open(sink + '/popup'));
tryIt('injectedScript', () => { const s = document.createElement('script'); s.textContent = 'window.injected = 1'; document.body.append(s); return window.injected === 1 ? 'RAN' : 'did not run'; });
report('probe', r);
</script></body></html>`,
  },
  styles: {
    text: `<!doctype html><html><head><style>#hashed { color: rgb(1, 2, 3); }</style></head><body>
<div id="hashed">a</div><div id="attribute" style="color: rgb(4, 5, 6)">b</div><div id="injected">c</div>
<div id="rule">d</div><div id="cssom">e</div><div id="adopted">f</div><script>
${REPORT}
const r = {};
const s = document.createElement('style'); s.textContent = '#injected { color: rgb(7, 8, 9) }'; document.head.append(s);
const e = document.createElement('style'); document.head.append(e);
try { e.sheet.insertRule('#rule { color: rgb(10, 11, 12) }'); } catch (error) { r.insertRuleError = error.name; }
document.getElementById('cssom').style.color = 'rgb(13, 14, 15)';
try { const sheet = new CSSStyleSheet(); sheet.replaceSync('#adopted { color: rgb(16, 17, 18) }'); document.adoptedStyleSheets = [sheet]; } catch (error) { r.adoptedError = error.name; }
const want = { hashed: 'rgb(1, 2, 3)', attribute: 'rgb(4, 5, 6)', injected: 'rgb(7, 8, 9)', rule: 'rgb(10, 11, 12)', cssom: 'rgb(13, 14, 15)', adopted: 'rgb(16, 17, 18)' };
setTimeout(() => { for (const [id, color] of Object.entries(want)) r[id] = getComputedStyle(document.getElementById(id)).color === color ? 'applies' : 'DOES NOT APPLY'; report('styles', r); }, 100);
</script></body></html>`,
  },
  katex: {
    libraries: [{ global: 'katex', text: katexScript }],
    text: `<!doctype html><html><head><style>${katexStyle}</style></head><body>
<div id="dom"></div><div id="markup"></div><script>
${REPORT}
const r = {};
const tex = 'x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}';
try { katex.render(tex, document.getElementById('dom')); } catch (error) { r.renderError = String(error); }
try { document.getElementById('markup').innerHTML = katex.renderToString(tex); } catch (error) { r.stringError = String(error); }
const count = (id) => { const all = [...document.getElementById(id).querySelectorAll('[style]')]; return { styled: all.length, applied: all.filter((each) => each.style.length > 0).length }; };
r.render = count('dom');
r.renderToString = count('markup');
r.katexClassStyled = getComputedStyle(document.querySelector('#dom .katex')).fontSize;
report('katex', r);
</script></body></html>`,
  },
  loop: {
    text: `<!doctype html><p>loop</p><script>va.on('change', () => { va.ready(); setTimeout(() => { for (;;) {} }, 300); });</script>`,
  },
  reload: {
    text: `<!doctype html><p>reload</p><script>va.on('change', () => { va.ready(); setTimeout(() => location.reload(), 300); });</script>`,
  },
  navigate: {
    text: `<!doctype html><p>navigate</p><script>va.on('change', () => { va.ready(); setTimeout(() => { location.href = '${SINK}/navigated'; }, 300); });</script>`,
  },
};

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const frames = Object.fromEntries(
  Object.entries(pages).map(([name, page]) => [
    name,
    {
      id: `proof.${name}`,
      hash: approvalHashOf(
        explorableTextHash(page.text),
        (page.libraries ?? []).map((library) => sha256(library.text)),
      ),
    },
  ]),
);

// ——— The servers ———

const listener = await startFrameListener({
  port: ports.listener,
  serve: (explorable, hash) => {
    const name = explorable.replace(/^proof\./, '');
    const page = pages[name];
    if (!page || frames[name]?.hash !== hash) {
      return Promise.resolve({ ok: false, status: 404, message: 'Not this proof’s frame.' });
    }
    const built = buildFrame({
      text: page.text,
      scriptLibraries: page.libraries ?? [],
      runtime: VA_RUNTIME,
      appOrigin,
    });
    return Promise.resolve({ ok: true, html: built.html, policy: built.policy });
  },
});

const { build } = await import('esbuild');
const bundled = await build({
  entryPoints: [join(ROOT, 'packages/app/src/explorables/proof/harness.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  logLevel: 'warning',
});
const harness = bundled.outputFiles[0]?.text ?? '';

/** What the page reports, for the browser running now. */
let resolveResults: (value: unknown) => void = () => {};
const appPolicy = `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src data: blob:; frame-src http://*.localhost:${ports.listener}`;
const app: Server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': appPolicy });
    response.end(
      '<!doctype html><title>Explorables proof</title><script src="/harness.js"></script>',
    );
  } else if (request.url === '/harness.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(harness);
  } else if (request.url === '/config') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ listener: { port: listener.port, nonce: listener.nonce }, frames }),
    );
  } else if (request.url === '/results' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => {
      response.writeHead(204).end();
      resolveResults(JSON.parse(body));
    });
  } else response.writeHead(404).end();
});
await new Promise<void>((resolve) => app.listen(ports.app, '127.0.0.1', resolve));

const reached: string[] = [];
const sink = createServer((request, response) => {
  reached.push(`${request.method ?? ''} ${request.url ?? ''}`);
  response.writeHead(200).end('sink');
});
sink.on('upgrade', (request, socket) => {
  reached.push(`UPGRADE ${request.url ?? ''}`);
  socket.destroy();
});
await new Promise<void>((resolve) => sink.listen(ports.sink, '127.0.0.1', resolve));

// ——— The browsers ———

const BROWSERS: Record<string, string[]> = {
  chrome: [
    process.env.CHROME ?? '',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  firefox: [
    process.env.FIREFOX ?? '',
    'C:/Program Files/Mozilla Firefox/firefox.exe',
    'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
    '/usr/bin/firefox',
    '/Applications/Firefox.app/Contents/MacOS/firefox',
  ],
};

async function runIn(name: string): Promise<unknown> {
  const path = BROWSERS[name]?.find((each) => each !== '' && existsSync(each));
  if (!path) return { skipped: `${name} was not found; give its path in ${name.toUpperCase()}.` };
  const profile = mkdtempSync(join(tmpdir(), `va-proof-${name}-`));
  const address = `${appOrigin}/`;
  const args =
    name === 'chrome'
      ? [
          '--headless=new',
          `--user-data-dir=${profile}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          address,
        ]
      : ['-headless', '-no-remote', '-profile', profile, address];
  reached.length = 0;
  const results = new Promise<unknown>((resolve) => {
    resolveResults = resolve;
  });
  const child = spawn(path, args, { stdio: 'ignore' });
  const outcome = await Promise.race([
    results,
    new Promise((resolve) =>
      setTimeout(() => resolve({ failed: 'No results within 120 s.' }), 120_000),
    ),
  ]);
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // The browser may still hold its profile for a moment; the system's temporary folder keeps it.
  }
  return { browser: path, outcome, sinkReached: [...reached] };
}

const wanted = process.argv.slice(2).filter((each) => each in BROWSERS);
const report: Record<string, unknown> = {};
for (const name of wanted.length > 0 ? wanted : Object.keys(BROWSERS)) {
  report[name] = await runIn(name);
}
console.log(JSON.stringify(report, null, 2));
await listener.close();
await new Promise((resolve) => app.close(resolve));
await new Promise((resolve) => sink.close(resolve));
