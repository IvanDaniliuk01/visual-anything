/**
 * The explorables' proof in real browsers (ADR 0107, A10.2 and A10.5): the developer's check of A10's
 * "Done when" that only a browser can show, run outside the test run:
 *
 *     pnpm exec tsx packages/server/scripts/explorables-proof.ts [chrome] [firefox] [--json]
 *
 * With no browser named it runs both. It starts the program's own frame listener and a page that
 * stands in for the app, each on a free port from 47800 to 47899, with the `va` runtime the listener
 * serves, and opens that page in each browser headless with frame isolation on: Chrome with
 * `--site-per-process` (which puppeteer turns off; no puppeteer here), Firefox with Fission. The page
 * frames, with the app's own host (`host.ts`):
 * - the quadratic sample's explorable, which loads, gets its data and posts a still, and its still
 *   taken in a hidden frame as the canvas takes it;
 * - a probe of what a frame may reach (network, storage, the parent, the token, `eval`);
 * - how styles apply under the frame's `style-src 'unsafe-inline'` while no `@import`, `url()` or
 *   font reaches an address, and KaTeX's two ways of rendering;
 * - a page that loops, which the watchdog removes within about 4 s of its last answer while the
 *   page keeps drawing its frames, and a fresh frame after it, which answers at once;
 * - pages that reload or navigate themselves, which are removed and get no second hello;
 * - the quadratic sample's tour played as its stage plays it: one frame that stays loaded and gets
 *   each step's data, worked out from `examples/quadratic-function` by the core's own functions,
 *   with each step's parameters and the step under way; and the sample's explorable drawing another
 *   still for each step's parameters.
 * A sink on another port counts every request that reaches it: it must count none.
 *
 * It prints one line per check, PASS or FAIL, for each browser, and exits with 1 when a check failed;
 * `--json` prints what each page reported too. A browser not found is said and skipped, which is not
 * a failure: Chrome and Firefox are found at their usual places, or given by CHROME and FIREFOX. Each
 * browser has 120 s, and the whole run 5 minutes, after which it stops everything and exits with 2.
 * It writes nothing in the repository.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  approvalHashOf,
  buildFrame,
  explorableData,
  explorableTextHash,
  stepExplorableValues,
  type VaData,
} from '@visual-anything/core';
import { VA_RUNTIME } from '@visual-anything/app/src/explorables/runtime/va-runtime.generated';
import { startFrameListener } from '../src/explorables/listener';
import { loadProject } from '../src/project';
import { freePort, runHeadless, type BrowserName } from './explorables-browsers';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The whole run's limit: whatever hangs, everything stops within 5 minutes.
const deadline = setTimeout(() => {
  console.error('The proof did not finish within 5 minutes: stopped.');
  process.exit(2);
}, 300_000);

const taken = new Set<number>();
const ports = {
  listener: await freePort(taken),
  app: await freePort(taken),
  sink: await freePort(taken),
};
const appOrigin = `http://127.0.0.1:${ports.app}`;
const SINK = `http://127.0.0.1:${ports.sink}`;

// ——— The sample's tour, as its stage gives it to the step's explorable ———

const SAMPLE = join(ROOT, 'examples/quadratic-function');
const loaded = await loadProject(SAMPLE);
if (!loaded.ok) throw new Error(`The quadratic sample does not open: ${loaded.errors[0]?.message}`);
const { project } = loaded;
const tour = project.tours.find((each) => each.steps.some((step) => step.explorable));
if (!tour) throw new Error('The quadratic sample has no tour whose steps show an explorable.');
const tourSteps = tour.steps.filter((step) => step.explorable !== undefined);
const SAMPLE_EXPLORABLE = tourSteps[0]?.explorable?.id ?? '';
/** What `TourExplorable` gives its `ExplorableView`, which `useExplorableData` makes into data. */
const stepData: VaData[] = tourSteps.map((step) => {
  const values = stepExplorableValues(project, step);
  return explorableData(project, {
    explorable: SAMPLE_EXPLORABLE,
    ...(values === undefined ? {} : { parameters: values }),
    theme: 'light',
    language: 'en',
    size: { width: 480, height: 360 },
    step: { kind: 'tour', id: tour.id, step: step.id, title: step.caption.title },
  });
});
const sampleText = readFileSync(join(SAMPLE, 'explorables/quadratic.html'), 'utf8');

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

interface Page {
  /** Its explorable's id; `proof.<name>` when left out. */
  id?: string;
  text: string;
  libraries?: { global: string; text: string }[];
}

const pages: Record<string, Page> = {
  quadratic: { text: sampleText },
  // The sample's own explorable, under its own id, for its tour.
  sample: { id: SAMPLE_EXPLORABLE, text: sampleText },
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
    text: `<!doctype html><html><head><style>@import url("${SINK}/style-import-own.css");</style>
<style>#hashed { color: rgb(1, 2, 3); } #own-url { background-image: url("${SINK}/style-url-own.png"); }
@font-face { font-family: far; src: url("${SINK}/style-font.woff2"); } #font { font-family: far; }</style></head><body>
<div id="hashed">a</div><div id="attribute" style="color: rgb(4, 5, 6)">b</div><div id="injected">c</div>
<div id="rule">d</div><div id="cssom">e</div><div id="adopted">f</div>
<div id="attribute-url" style="background: url(${SINK}/style-url-attribute.png)">g</div><div id="own-url">h</div>
<div id="font">i</div><div id="injected-url">j</div><script>
${REPORT}
const r = {};
const s = document.createElement('style'); s.textContent = '#injected { color: rgb(7, 8, 9) }'; document.head.append(s);
const i = document.createElement('style'); i.textContent = '@import url("${SINK}/style-import-injected.css"); #injected-url { background-image: url("${SINK}/style-url-injected.png"); }'; document.head.append(i);
document.getElementById('cssom').style.backgroundImage = 'url("${SINK}/style-url-cssom.png")';
const e = document.createElement('style'); document.head.append(e);
try { e.sheet.insertRule('#rule { color: rgb(10, 11, 12) }'); } catch (error) { r.insertRuleError = error.name; }
document.getElementById('cssom').style.color = 'rgb(13, 14, 15)';
try { const sheet = new CSSStyleSheet(); sheet.replaceSync('#adopted { color: rgb(16, 17, 18) }'); document.adoptedStyleSheets = [sheet]; } catch (error) { r.adoptedError = error.name; }
const want = { hashed: 'rgb(1, 2, 3)', attribute: 'rgb(4, 5, 6)', injected: 'rgb(7, 8, 9)', rule: 'rgb(10, 11, 12)', cssom: 'rgb(13, 14, 15)', adopted: 'rgb(16, 17, 18)' };
setTimeout(() => { for (const [id, color] of Object.entries(want)) r[id] = getComputedStyle(document.getElementById(id)).color === color ? 'applies' : 'DOES NOT APPLY'; document.fonts.load('16px far').then(() => {}, () => {}); report('styles', r); }, 100);
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
  // Says what each data it gets holds, and which document it is, so that a reload would show.
  tourEcho: {
    text: `<!doctype html><p>tour</p><script>
const me = String(Math.random()).slice(2, 10);
const say = (d) => console.error('tour ' + JSON.stringify({ document: me, parameters: d.parameters, step: d.step }));
va.on('change', say);
if (va.data) say(va.data);
va.ready();
</script>`,
  },
};

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const frames = Object.fromEntries(
  Object.entries(pages).map(([name, page]) => [
    name,
    {
      id: page.id ?? `proof.${name}`,
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
    const name = Object.keys(frames).find(
      (each) => frames[each]?.id === explorable && frames[each].hash === hash,
    );
    const page = name === undefined ? undefined : pages[name];
    if (!page) {
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
let resolveResults: (value: Results) => void = () => {};
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
      JSON.stringify({
        listener: { port: listener.port, nonce: listener.nonce },
        frames,
        tour: { echo: 'tourEcho', explorable: 'sample', steps: stepData },
      }),
    );
  } else if (request.url === '/results' && request.method === 'POST') {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    request.on('end', () => {
      response.writeHead(204).end();
      resolveResults(JSON.parse(body) as Results);
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

// ——— What each check holds ———

interface Outcome {
  ready?: number;
  errors: string[];
  stopped?: { end: string; at: number };
  still?: { width: number; bytes: number; png: boolean; pixelWidth: number };
  longestGap?: number;
  longestFrame?: number;
  pageFrames?: number;
}

interface Results {
  failed?: string;
  userAgent?: string;
  quadratic?: Outcome;
  probe?: Outcome;
  styles?: Outcome;
  katex?: Outcome;
  loop?: Outcome;
  afterLoop?: Outcome;
  reload?: Outcome;
  navigate?: Outcome;
  hiddenStill?: { ok?: boolean; width?: number; height?: number; errors?: string[]; ms?: number };
  tour?: {
    heard?: { document: string; parameters: unknown; step: unknown }[];
    stopped?: string;
    failed?: string;
  };
  tourStills?: {
    stills?: { step: unknown; bytes: number; digest: string }[];
    stopped?: string;
    errors?: string[];
    failed?: string;
  };
  tokenStillHere?: boolean;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** What a page's report said: the JSON after its name, among the frame's errors. */
function said(outcome: Outcome | undefined, name: string): Record<string, unknown> | undefined {
  const line = outcome?.errors.find((each) => each.startsWith(`${name} `));
  return line === undefined
    ? undefined
    : (JSON.parse(line.slice(name.length + 1)) as Record<string, unknown>);
}

/** The probes that must be refused. */
const REFUSED = [
  'parentDocument',
  'parentToken',
  'parentSecret',
  'localStorage',
  'sessionStorage',
  'cookie',
  'indexedDB',
  'eval',
  'Function',
];

/** How long the watchdog may take after the frame's last answer: 3 s silent, pinged every second. */
const LOOP_REMOVED_MS = 4_500;
/** The longest the page may go without drawing while a frame loops: two frames at 60 fps. */
const PAGE_FRAME_MS = 34;

function checksOf(results: Results, sinkReached: string[]): Check[] {
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  if (results.failed !== undefined) {
    check('The page ran', false, results.failed);
    return checks;
  }
  const q = results.quadratic;
  check(
    'A frame loads and gets its data',
    q?.ready !== undefined && q.errors.length === 0,
    `ready in ${q?.ready ?? '—'} ms, ${q?.errors.length ?? '—'} console errors`,
  );
  check(
    'A still arrives',
    q?.still?.png === true && q.still.pixelWidth === 512,
    `${q?.still?.bytes ?? 0} bytes of PNG, ${q?.still?.pixelWidth ?? 0} pixels wide`,
  );
  const hidden = results.hiddenStill;
  check(
    'A still taken in a hidden frame, as the canvas takes it',
    hidden?.ok === true && (hidden.errors ?? []).length === 0,
    `${hidden?.width ?? 0} × ${hidden?.height ?? 0} in ${hidden?.ms ?? '—'} ms`,
  );
  const probe = said(results.probe, 'probe') ?? {};
  const notRefused = REFUSED.filter((key) => !String(probe[key]).startsWith('blocked'));
  check(
    'The frame reaches no parent, token or storage, and runs no eval',
    Object.keys(probe).length > 0 && notRefused.length === 0 && probe.origin === 'null',
    notRefused.length > 0
      ? `not refused: ${notRefused.map((key) => `${key} = ${String(probe[key])}`).join(', ')}`
      : `all ${REFUSED.length} refused; its origin is ${String(probe.origin)}`,
  );
  const ran = Object.entries(probe).filter(([, value]) => value === 'REACHED' || value === 'RAN');
  check(
    'The frame reaches no network: nothing reached the sink',
    Object.keys(probe).length > 0 && ran.length === 0 && sinkReached.length === 0,
    sinkReached.length > 0 || ran.length > 0
      ? `reached: ${[...ran.map(([key]) => key), ...sinkReached].join(', ')}`
      : 'fetch, XHR, WebSocket, EventSource, an image, a beacon, a nested frame, a prefetch, a popup, a worker and an injected script: 0 requests, none ran',
  );
  const styles = said(results.styles, 'styles') ?? {};
  const unstyled = ['hashed', 'attribute', 'injected', 'rule', 'cssom', 'adopted'].filter(
    (key) => styles[key] !== 'applies',
  );
  const styleAddresses = sinkReached.filter((each) => each.includes('/style-')).length;
  check(
    'Styles apply and reach nothing',
    Object.keys(styles).length > 0 && unstyled.length === 0 && styleAddresses === 0,
    `${unstyled.length === 0 ? 'all six ways of styling apply' : `not applied: ${unstyled.join(', ')}`}; ${styleAddresses} style addresses reached`,
  );
  const katex = said(results.katex, 'katex') ?? {};
  const counted = (key: string) => katex[key] as { styled: number; applied: number } | undefined;
  const render = counted('render');
  const markup = counted('renderToString');
  check(
    'KaTeX is styled both ways',
    render !== undefined &&
      markup !== undefined &&
      render.styled > 0 &&
      render.applied === render.styled &&
      markup.applied === markup.styled,
    `render ${render?.applied ?? 0} of ${render?.styled ?? 0}, renderToString ${markup?.applied ?? 0} of ${markup?.styled ?? 0}`,
  );
  const loop = results.loop;
  const removedAfter =
    loop?.stopped && loop.ready !== undefined ? loop.stopped.at - loop.ready : undefined;
  check(
    'A frame that loops is removed within about 4 s',
    loop?.stopped?.end === 'silent' &&
      removedAfter !== undefined &&
      removedAfter <= LOOP_REMOVED_MS,
    `${loop?.stopped?.end ?? 'not stopped'}, ${removedAfter === undefined ? '—' : (removedAfter / 1000).toFixed(1)} s after it was ready (it loops from 0.3 s after)`,
  );
  check(
    'The app keeps its frames while it loops',
    loop?.longestFrame !== undefined && loop.longestFrame <= PAGE_FRAME_MS,
    `longest gap between the page's frames ${loop?.longestFrame ?? '—'} ms over ${loop?.pageFrames ?? 0} frames; its thread's longest busy stretch ${loop?.longestGap ?? '—'} ms`,
  );
  check(
    'A fresh frame after the loop answers at once',
    results.afterLoop?.ready !== undefined && results.afterLoop.ready < 2_000,
    `ready in ${results.afterLoop?.ready ?? '—'} ms`,
  );
  check(
    'A frame that reloads itself is stopped, with no second hello',
    results.reload?.stopped?.end === 'left',
    `${results.reload?.stopped?.end ?? 'not stopped'} at ${results.reload?.stopped?.at ?? '—'} ms`,
  );
  check(
    'A frame that navigates itself is stopped, with no second hello',
    results.navigate?.stopped?.end === 'left' &&
      !sinkReached.some((each) => each.includes('/navigated')),
    `${results.navigate?.stopped?.end ?? 'not stopped'} at ${results.navigate?.stopped?.at ?? '—'} ms`,
  );
  check('The app keeps its token', results.tokenStillHere === true, String(results.tokenStillHere));
  const heard = results.tour?.heard ?? [];
  const documents = new Set(heard.map((each) => each.document));
  const wrong = stepData.filter((data) => {
    const got = heard.find((each) => JSON.stringify(each.step) === JSON.stringify(data.step));
    return !got || JSON.stringify(got.parameters) !== JSON.stringify(data.parameters);
  });
  check(
    "A tour step's explorable gets its step's parameters, in one frame",
    stepData.length > 0 &&
      wrong.length === 0 &&
      documents.size === 1 &&
      results.tour?.stopped === undefined,
    `${stepData.length - wrong.length} of ${stepData.length} steps of “${tour?.name ?? ''}” heard with their parameters and step, in ${documents.size} document${documents.size === 1 ? '' : 's'}${results.tour?.stopped ? `; stopped: ${results.tour.stopped}` : ''}`,
  );
  const stills = results.tourStills?.stills ?? [];
  const distinctParameters = new Set(stepData.map((data) => JSON.stringify(data.parameters))).size;
  const distinctStills = new Set(stills.filter((each) => each.bytes > 0).map((each) => each.digest))
    .size;
  check(
    "The sample's explorable draws each step's parameters",
    stills.length === stepData.length &&
      distinctStills === distinctParameters &&
      (results.tourStills?.errors ?? []).length === 0,
    `${distinctStills} distinct stills for ${distinctParameters} distinct sets of parameters over ${stills.length} steps`,
  );
  return checks;
}

// ——— The browsers ———

const args = process.argv.slice(2);
const asked = args.filter((each): each is BrowserName => each === 'chrome' || each === 'firefox');
const report: Record<string, unknown> = {};
let failed = false;
for (const name of asked.length > 0 ? asked : (['chrome', 'firefox'] as const)) {
  reached.length = 0;
  const results = new Promise<Results>((resolve) => {
    resolveResults = resolve;
  });
  const run = await runHeadless(name, `${appOrigin}/`, results, { timeoutMs: 120_000 });
  if ('skipped' in run) {
    console.log(`${name}: skipped. ${run.skipped}`);
    report[name] = run;
    continue;
  }
  const outcome: Results = run.outcome;
  const checks = checksOf(outcome, [...reached]);
  console.log(`${name}: ${outcome.userAgent ?? run.browser}`);
  for (const each of checks) {
    console.log(`  ${each.ok ? 'PASS' : 'FAIL'}  ${each.name}: ${each.detail}`);
  }
  const passed = checks.filter((each) => each.ok).length;
  console.log(`  ${passed} of ${checks.length} checks pass.`);
  if (passed < checks.length) failed = true;
  report[name] = { browser: run.browser, outcome, sinkReached: [...reached], checks };
}
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
await listener.close();
await new Promise((resolve) => app.close(resolve));
await new Promise((resolve) => sink.close(resolve));
clearTimeout(deadline);
process.exitCode = failed ? 1 : 0;
