/**
 * The read-only page's benchmark (M6b, ADR 0041): how large the page of a 10,000-element project is,
 * how long writing its data and reading it back with the checks of opening take, how long the viewer
 * takes to show the view's first frame, and the frames of panning and zooming it. `pnpm bench` builds
 * it with the others and serves it at `/page-bench.html`; `?elements=N` changes the size.
 *
 * It runs the viewer as the page runs it, from the same modules, without the page's policy. The
 * frames are measured as the browser shows them, so the window must be in front, on a 60 Hz display,
 * and are judged as the canvas benchmark's frames mode judges them. The viewer's own size is counted
 * when the viewer is served beside this page (`viewer/viewer.js`); otherwise the report says so.
 */
import * as validators from 'virtual:visual-anything/validators';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../theme/tokens.css';
import { pageDataOf, readPageData } from '../viewer/data';
import { dataText } from '../viewer/page';
import { PagePreferences } from '../viewer/preferences';
import { standaloneValidate } from '../viewer/validate';
import { ViewerApp } from '../viewer/Viewer';
import { SHOWN, WORK, addRow, percentile, showVerdict } from './report';
import { syntheticProject } from './synthetic';

const params = new URLSearchParams(window.location.search);
const size = Number(params.get('elements') ?? 10_000);
const status = document.getElementById('status') as HTMLElement;

interface Step {
  name: string;
  milliseconds: number;
  bytes?: number;
}

interface Phase {
  name: string;
  frames: number[];
}

void run();

async function run(): Promise<void> {
  const steps: Step[] = [];
  const project = syntheticProject({ elements: size });

  status.textContent = 'Writing the page’s data…';
  await nextFrame();
  let began = performance.now();
  const text = dataText(pageDataOf(project, { made: new Date() }));
  steps.push({
    name: 'Write the page’s data',
    milliseconds: performance.now() - began,
    bytes: new TextEncoder().encode(text).length,
  });
  const viewer = await viewerBytes();

  status.textContent = 'Reading it back, with the checks of opening…';
  await nextFrame();
  began = performance.now();
  const read = readPageData(text, standaloneValidate(validators));
  steps.push({
    name: 'Read it, with the checks of opening',
    milliseconds: performance.now() - began,
  });
  if (!read.ok) {
    status.textContent = `The page’s data did not read: ${read.problems.slice(0, 3).join(' ')}`;
    return;
  }

  status.textContent = 'Opening the view…';
  await nextFrame();
  const root = document.getElementById('root') as HTMLElement;
  began = performance.now();
  createRoot(root).render(
    <StrictMode>
      <ViewerApp read={read} preferences={new PagePreferences(window)} />
    </StrictMode>,
  );
  const host = await canvasHost();
  await nextFrame();
  await nextFrame();
  steps.push({
    name: 'Open the view, to its first frame',
    milliseconds: performance.now() - began,
  });

  status.textContent = `Measuring frames with ${size.toLocaleString()} elements…`;
  await settle(2500);
  const middle = middleOf(host);
  const phases = [
    await measure('Pan, whole view', 180, (frame) =>
      wheel(host, middle, { deltaX: frame < 90 ? 6 : -6, deltaY: 0 }),
    ),
    await measure('Zoom, whole view', 180, (frame) =>
      wheel(host, middle, { deltaX: 0, deltaY: frame < 90 ? -20 : 20, ctrlKey: true }),
    ),
  ];
  report(steps, phases, viewer, text.length);
}

/** The size of the viewer served beside this page, when it is. */
async function viewerBytes(): Promise<number | undefined> {
  try {
    const sizes = await Promise.all(
      ['viewer/viewer.js', 'viewer/viewer.css'].map(async (path) => {
        const response = await fetch(new URL(path, document.baseURI));
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || type.includes('html')) throw new Error(`${path} is not served`);
        return (await response.arrayBuffer()).byteLength;
      }),
    );
    return sizes.reduce((sum, each) => sum + each, 0);
  } catch {
    return undefined;
  }
}

/** The viewer's canvas, once its renderer has started. */
async function canvasHost(): Promise<HTMLElement> {
  for (;;) {
    const host = document.querySelector<HTMLElement>('.viewer-canvas-host');
    if (host?.querySelector('canvas')) return host;
    await nextFrame();
  }
}

function middleOf(host: HTMLElement): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Turns the wheel over the canvas, as a mouse or a trackpad does. */
function wheel(
  host: HTMLElement,
  at: { x: number; y: number },
  turn: { deltaX: number; deltaY: number; ctrlKey?: boolean },
): void {
  host.dispatchEvent(
    new WheelEvent('wheel', {
      ...turn,
      clientX: at.x,
      clientY: at.y,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Takes `count` steps, one a frame, and records the time between the frames shown. */
function measure(name: string, count: number, step: (frame: number) => void): Promise<Phase> {
  performance.mark(`phase ${name}`);
  return new Promise((resolve) => {
    const frames: number[] = [];
    let previous: number | undefined;
    let steps = 0;
    const tick = (now: number) => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      if (steps >= count) {
        resolve({ name, frames });
        return;
      }
      step(steps);
      steps += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function report(
  steps: Step[],
  phases: Phase[],
  viewer: number | undefined,
  dataCharacters: number,
): void {
  const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
  const stepBody = document.querySelector('#steps tbody') as HTMLElement;
  for (const step of steps) {
    addRow(stepBody, '', [
      step.name,
      step.milliseconds.toFixed(0),
      step.bytes === undefined ? '' : megabytes(step.bytes),
    ]);
  }
  (document.getElementById('steps') as HTMLElement).hidden = false;

  const body = document.querySelector('#table tbody') as HTMLElement;
  let passed = true;
  for (const { name, frames } of phases) {
    const average = frames.reduce((sum, each) => sum + each, 0) / Math.max(1, frames.length);
    const p95 = percentile(frames, 0.95);
    const worst = Math.max(0, ...frames);
    const passes = average <= SHOWN.average && p95 <= SHOWN.p95 && worst <= WORK.worst;
    passed &&= passes;
    addRow(body, passes ? 'pass' : 'fail', [
      name,
      average.toFixed(1),
      p95.toFixed(1),
      worst.toFixed(1),
    ]);
  }
  (document.getElementById('table') as HTMLElement).hidden = false;
  showVerdict(document.getElementById('verdict') as HTMLElement, passed, {
    pass: 'The page pans and zooms within the frame budget.',
    fail: 'The page misses the frame budget in some phase.',
  });
  const data = steps[0]?.bytes ?? dataCharacters;
  (document.getElementById('notes') as HTMLElement).textContent = [
    viewer === undefined
      ? `The page holds ${megabytes(data)} of data and the viewer, which this page does not serve; dist/viewer gives its size.`
      : `The page is about ${megabytes(data + viewer)}: ${megabytes(data)} of data and ${megabytes(viewer)} of viewer.`,
    'Frames are measured as the browser shows them: keep the window in front, on a 60 Hz display.',
  ].join('\n');
  status.textContent = `Measured with ${size.toLocaleString()} elements.`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function settle(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
