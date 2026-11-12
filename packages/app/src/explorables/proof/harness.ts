/**
 * The page of the explorables' browser proof (`packages/server/scripts/explorables-proof.ts`), which
 * stands in for the app: it holds a session token in its tab's storage, frames explorables from the
 * program's listener under fresh labels with the app's own host (`host.ts`), and reports what came of
 * each to the proof's server. It is never part of the app's build.
 */
import type { VaData } from '@visual-anything/core';
import { newFrameAddress, type FrameListener } from '../frame-address';
import { FrameHost, type FrameEnd } from '../host';
import { takeStill } from '../still-taker';

interface Config {
  listener: FrameListener;
  frames: Record<string, { id: string; hash: string }>;
  /** A tour's steps as its stage gives them to the step's explorable: the data of each, in order. */
  tour: { echo: string; explorable: string; steps: VaData[] };
}

interface Outcome {
  ready?: number;
  errors: string[];
  stopped?: { end: FrameEnd; at: number };
  still?: { width: number; bytes: number; png: boolean; pixelWidth: number };
  selected: string[];
  /** The longest the page's thread was busy while the frame ran, in milliseconds. */
  longestGap?: number;
  /** The longest time between two frames the page drew while the frame ran, in milliseconds. */
  longestFrame?: number;
  /** How many frames the page drew while the frame ran. */
  pageFrames?: number;
}

const DATA: VaData = {
  api: 1,
  parameters: { a: 1, b: -2, c: -3 },
  theme: 'dark',
  language: 'en',
  size: { width: 640, height: 420 },
  element: {
    id: 'quadratic-function',
    name: 'Quadratic function',
    component: 'quadratic.function',
    attributes: [{ name: 'formula', value: 'x^2 - 2x - 3' }],
  },
  contents: [
    { id: 'vertex', name: 'Vertex', component: 'quadratic.feature', attributes: [] },
    { id: 'roots', name: 'Roots', component: 'quadratic.feature', attributes: [] },
  ],
};

const SECRET = 'TOKEN-SECRET-0f3a';
sessionStorage.setItem('visual-anything.token', SECRET);
(window as unknown as { secret: string }).secret = SECRET;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Frames one explorable, and resolves with what came of it once `until` holds or time runs out. */
function run(
  config: Config,
  name: string,
  until: (outcome: Outcome) => boolean,
  options: { still?: number; wait?: number } = {},
): Promise<Outcome> {
  const frame = config.frames[name];
  if (!frame) return Promise.resolve({ errors: [`No frame "${name}".`], selected: [] });
  const started = performance.now();
  const outcome: Outcome = { errors: [], selected: [] };
  const element = document.createElement('iframe');
  element.setAttribute('sandbox', 'allow-scripts');
  element.width = '640';
  element.height = '420';
  element.src = newFrameAddress(config.listener, frame.id, frame.hash);
  // The page's thread: the largest gap between ticks of a 10 ms interval.
  let last = performance.now();
  let longest = 0;
  const probe = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 10);
  // The page's own frames: the largest gap between two it drew, as the app's canvas would draw them.
  let lastFrame: number | undefined;
  let longestFrame = 0;
  let pageFrames = 0;
  let drawing = requestAnimationFrame(function tick(now) {
    if (lastFrame !== undefined) longestFrame = Math.max(longestFrame, now - lastFrame);
    lastFrame = now;
    pageFrames += 1;
    drawing = requestAnimationFrame(tick);
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(probe);
      cancelAnimationFrame(drawing);
      outcome.longestGap = Math.round(longest);
      outcome.longestFrame = Math.round(longestFrame);
      outcome.pageFrames = pageFrames;
      host.dispose();
      element.remove();
      resolve(outcome);
    };
    const check = () => {
      if (until(outcome)) finish();
    };
    const host = new FrameHost(element, DATA, {
      ready: () => {
        outcome.ready ??= Math.round(performance.now() - started);
        if (options.still !== undefined) host.askStill(options.still);
        check();
      },
      error: (message) => {
        outcome.errors.push(message);
        check();
      },
      select: (id) => outcome.selected.push(id),
      still: (width, png) => {
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        outcome.still = {
          width,
          bytes: png.byteLength,
          png: png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47,
          pixelWidth: png.byteLength > 24 ? view.getUint32(16) : 0,
        };
        check();
      },
      stopped: (end) => {
        outcome.stopped = { end, at: Math.round(performance.now() - started) };
        element.remove();
        check();
        finish();
      },
    });
    document.body.append(element);
    setTimeout(finish, options.wait ?? 15_000);
  });
}

/**
 * A tour played through its steps, as the stage plays it (`TourExplorable`): one frame for the
 * step's explorable, which stays loaded from one step to the next and only gets each step's data.
 * The echo page says what each data it got held; the step moves on once it said it.
 */
function playTour(config: Config): Promise<unknown> {
  const { steps } = config.tour;
  const frame = config.frames[config.tour.echo];
  const first = steps[0];
  if (!frame || !first) return Promise.resolve({ failed: 'No tour to play.' });
  const heard: { document: string; parameters: unknown; step: unknown }[] = [];
  const element = document.createElement('iframe');
  element.setAttribute('sandbox', 'allow-scripts');
  element.src = newFrameAddress(config.listener, frame.id, frame.hash);
  return new Promise((resolve) => {
    let at = 0;
    let stopped: FrameEnd | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      host.dispose();
      element.remove();
      resolve({ heard, stopped, sent: steps.length });
    };
    const host = new FrameHost(element, first, {
      error: (message) => {
        if (!message.startsWith('tour ')) return;
        const said = JSON.parse(message.slice(5)) as (typeof heard)[number];
        const last = heard[heard.length - 1];
        if (last && JSON.stringify(last) === JSON.stringify(said)) return;
        heard.push(said);
        const wanted = steps[at];
        if (JSON.stringify(said.step) !== JSON.stringify(wanted?.step)) return;
        at += 1;
        const next = steps[at];
        if (next) host.setData(next);
        else setTimeout(finish, 300);
      },
      stopped: (end) => {
        stopped = end;
        finish();
      },
    });
    document.body.append(element);
    setTimeout(finish, 15_000);
  });
}

/**
 * The quadratic sample's explorable through the tour's steps, in one frame as the stage keeps it: its
 * still after each step's data, whose digest differs where the step's parameters draw another curve.
 */
function tourStills(config: Config): Promise<unknown> {
  const frame = config.frames[config.tour.explorable];
  const { steps } = config.tour;
  const first = steps[0];
  if (!frame || !first) return Promise.resolve({ failed: 'No explorable to play the tour with.' });
  const element = document.createElement('iframe');
  element.setAttribute('sandbox', 'allow-scripts');
  element.width = '640';
  element.height = '420';
  element.src = newFrameAddress(config.listener, frame.id, frame.hash);
  const stills: { step: unknown; bytes: number; digest: string }[] = [];
  let ready: () => void = () => undefined;
  const readied = new Promise<void>((resolve) => (ready = resolve));
  let gotStill: (png: Uint8Array) => void = () => undefined;
  let stopped: FrameEnd | undefined;
  const errors: string[] = [];
  const host = new FrameHost(element, first, {
    ready: () => ready(),
    error: (message) => errors.push(message),
    still: (_width, png) => gotStill(png),
    stopped: (end) => {
      stopped = end;
      ready();
      gotStill(new Uint8Array());
    },
  });
  document.body.append(element);
  const within = <T>(promise: Promise<T>, ms: number, otherwise: T) =>
    Promise.race([promise, sleep(ms).then(() => otherwise)]);
  return (async () => {
    await within(readied, 10_000, undefined);
    for (const data of steps) {
      if (stopped) break;
      host.setData(data);
      await sleep(600);
      const png = await within(
        new Promise<Uint8Array>((resolve) => {
          gotStill = resolve;
          host.askStill(512);
        }),
        10_000,
        new Uint8Array(),
      );
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', png.slice())),
        (byte) => byte.toString(16).padStart(2, '0'),
      )
        .join('')
        .slice(0, 16);
      stills.push({ step: data.step, bytes: png.byteLength, digest });
    }
    host.dispose();
    element.remove();
    return { stills, stopped, errors };
  })();
}

async function main() {
  const config = (await (await fetch('/config')).json()) as Config;
  const results: Record<string, unknown> = { userAgent: navigator.userAgent };
  const report = (name: string, outcome: unknown) => {
    results[name] = outcome;
  };
  report(
    'quadratic',
    await run(config, 'quadratic', (each) => each.still !== undefined, { still: 512 }),
  );
  report(
    'probe',
    await run(config, 'probe', (each) => each.errors.some((error) => error.startsWith('probe '))),
  );
  // The probe's network attempts have time to reach the sink, if anything could.
  await sleep(1500);
  report(
    'styles',
    await run(config, 'styles', (each) => each.errors.some((error) => error.startsWith('styles '))),
  );
  report(
    'katex',
    await run(config, 'katex', (each) => each.errors.some((error) => error.startsWith('katex '))),
  );
  report('loop', await run(config, 'loop', (each) => each.stopped !== undefined));
  // A fresh label right after a loop: a site of its own, which answers at once.
  report('afterLoop', await run(config, 'quadratic', (each) => each.ready !== undefined));
  report('reload', await run(config, 'reload', (each) => each.stopped !== undefined));
  report(
    'navigate',
    await run(config, 'navigate', (each) => each.stopped !== undefined, { wait: 8000 }),
  );
  // The canvas's still, taken as the app takes it: one hidden frame, transparent, under everything.
  const quadratic = config.frames.quadratic;
  if (quadratic) {
    const started = performance.now();
    const taken = await takeStill({
      address: newFrameAddress(config.listener, quadratic.id, quadratic.hash),
      data: { ...DATA, size: { width: 320, height: 240 } },
      width: 512,
    });
    report('hiddenStill', {
      ms: Math.round(performance.now() - started),
      ...(taken.ok
        ? {
            ok: true,
            width: taken.width,
            height: taken.height,
            bytes: taken.png.byteLength,
            ready: taken.ready,
            errors: taken.errors,
          }
        : taken),
      framesLeft: document.querySelectorAll('iframe').length,
    });
  }
  report('tour', await playTour(config));
  report('tourStills', await tourStills(config));
  report('tokenStillHere', sessionStorage.getItem('visual-anything.token') === SECRET);
  await fetch('/results', { method: 'POST', body: JSON.stringify(results) });
}

main().catch((error: unknown) =>
  fetch('/results', { method: 'POST', body: JSON.stringify({ failed: String(error) }) }),
);
