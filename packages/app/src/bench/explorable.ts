/**
 * The canvas benchmark's phases with an explorable live on the canvas (A10.5, ADR 0107): the same
 * pans and zooms of the 10,000-element view, first with no explorable, then with one explored in
 * place, as `LiveExplorable` lays it: a frame from the program's listener, under a fresh label (so in
 * another process), over a spot in the middle of the scene, scaled and moved with the camera through
 * its style at every camera move. Its page is the quadratic sample's, which draws once per change;
 * the frame keeps answering the host's pings throughout. Recorded, never held.
 *
 * `?explorable&listener=<port>&nonce=<nonce>&id=<explorable>&hash=<approval hash>` names the frame;
 * `packages/server/scripts/explorables-bench.ts` starts a listener, serves the built pages and gives
 * these. Without a listener there is no frame to explore, and the page says so.
 */
import type { VaData } from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import { LiveFollower } from '../canvas/explorables/live';
import type { Rect } from '../canvas/geometry';
import { newFrameAddress } from '../explorables/frame-address';
import { FrameHost, type FrameEnd } from '../explorables/host';
import '../explorables/explorables.css';
import '../canvas/explorables/live.css';

/** The frame the benchmark explores, from the page's address; none when it names none. */
export interface BenchFrame {
  port: number;
  nonce: string;
  id: string;
  hash: string;
}

export function benchFrameOf(search: URLSearchParams): BenchFrame | undefined {
  if (!search.has('explorable')) return undefined;
  const port = Number(search.get('listener'));
  const nonce = search.get('nonce') ?? '';
  const id = search.get('id') ?? '';
  const hash = search.get('hash') ?? '';
  return Number.isInteger(port) && port > 0 && nonce && id && hash
    ? { port, nonce, id, hash }
    : undefined;
}

export interface FramePhaseResult {
  name: string;
  frames: number[];
}

/** What the explorable phases need of the benchmark's page. */
export interface ExplorableBench {
  frame: BenchFrame;
  host: HTMLElement;
  camera: () => Camera;
  viewport: { width: number; height: number };
  /** Where the scene's middle is, in canvas units. */
  middle: { x: number; y: number };
  /** The scales the phases run at: the whole view's and where names and details show. */
  fitWhole: () => void;
  cameraAt: (scale: number) => Camera;
  namesFrom: number;
  detailsFrom: number;
  move: (camera: Camera) => void;
  measure: (
    name: string,
    count: number,
    step: (frame: number) => void,
  ) => Promise<FramePhaseResult>;
  settle: (milliseconds: number) => Promise<void>;
  panBy: (camera: Camera, dx: number, dy: number) => Camera;
  zoomAt: (camera: Camera, at: { x: number; y: number }, factor: number) => Camera;
}

const DATA: VaData = {
  api: 1,
  parameters: { a: 1, b: -2, c: -3 },
  theme: 'light',
  language: 'en',
  size: { width: 320, height: 240 },
};

/** The spot the explorable is live in, in canvas units: 320 by 240, centered on the scene. */
const SPOT = { width: 320, height: 240 };

export interface ExplorableBenchResult {
  phases: FramePhaseResult[];
  notes: string[];
  record: Record<string, unknown>;
}

export async function measureExplorable(bench: ExplorableBench): Promise<ExplorableBenchResult> {
  const { width, height } = bench.viewport;
  const center = { x: width / 2, y: height / 2 };
  const pan = (frame: number) =>
    bench.move(bench.panBy(bench.camera(), frame < 90 ? -8 : 8, frame < 90 ? -4 : 4));
  const zoom = (frame: number) =>
    bench.move(bench.zoomAt(bench.camera(), center, frame < 90 ? 1.02 : 1 / 1.02));
  const phases: FramePhaseResult[] = [];
  /** The scales the phases run at, as the live frame is wanted where its shape reads. */
  const places: [string, () => void][] = [
    ['whole view', () => bench.fitWhole()],
    ['names shown', () => bench.move(bench.cameraAt(bench.namesFrom * 1.3))],
    ['details shown', () => bench.move(bench.cameraAt(bench.detailsFrom * 1.15))],
    ['at 1:1', () => bench.move(bench.cameraAt(1))],
  ];
  const phasesOf = async (shown: string, place: () => void = () => undefined) => {
    for (const [at, go] of places) {
      go();
      place();
      await bench.settle(400);
      phases.push(await bench.measure(`Pan, ${at}, ${shown}`, 180, pan));
      go();
      place();
      await bench.settle(300);
      phases.push(await bench.measure(`Zoom, ${at}, ${shown}`, 180, zoom));
    }
  };

  await phasesOf('no explorable');

  // The explorable explored in place, as `LiveExplorable` lays it over its spot.
  const rect: Rect = {
    x: bench.middle.x - SPOT.width / 2,
    y: bench.middle.y - SPOT.height / 2,
    ...SPOT,
  };
  const box = document.createElement('div');
  box.className = 'canvas-live-explorable';
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  const inner = document.createElement('div');
  inner.className = 'explorable-frame-box';
  const element = document.createElement('iframe');
  element.className = 'explorable-frame';
  element.setAttribute('sandbox', 'allow-scripts');
  element.referrerPolicy = 'no-referrer';
  element.src = newFrameAddress(
    { port: bench.frame.port, nonce: bench.frame.nonce },
    bench.frame.id,
    bench.frame.hash,
  );
  inner.append(element);
  box.append(inner);
  // Its corner follows every move, its scale only once the camera rests, as on the canvas.
  const follower = new LiveFollower(box, rect);
  const place = () => follower.place(bench.camera());
  const started = performance.now();
  let readyIn: number | undefined;
  let stopped: { end: FrameEnd; at: number; during: string } | undefined;
  let during = 'loading';
  const errors: string[] = [];
  const frameHost = new FrameHost(element, DATA, {
    ready: () => {
      readyIn ??= performance.now() - started;
    },
    error: (message) => errors.push(message),
    stopped: (end) => {
      stopped ??= { end, at: performance.now() - started, during };
    },
  });
  bench.host.append(box);
  place();
  // Its page loads and draws, at most 15 s.
  for (let waited = 0; readyIn === undefined && !stopped && waited < 15_000; waited += 100) {
    await bench.settle(100);
  }
  // The camera moves, and the frame with it, as `LiveExplorable` follows it.
  const move = bench.move;
  bench.move = (camera) => {
    move(camera);
    place();
  };
  const live = readyIn !== undefined && !stopped;
  if (live) {
    const measure = bench.measure;
    bench.measure = (name, count, step) => {
      during = name;
      return measure(name, count, step);
    };
    await phasesOf('explorable live', place);
    bench.measure = measure;
  }
  bench.move = move;
  frameHost.dispose();
  follower.dispose();
  box.remove();
  const notes = [
    live
      ? `The explorable (the quadratic sample's page, from the listener on port ${bench.frame.port}) was live over a ${SPOT.width} × ${SPOT.height} spot in the middle of the scene, ready ${readyIn?.toFixed(0)} ms after it was made, moved with the camera at every move and rescaled once the camera rested${stopped ? `; the watchdog stopped it (${stopped.end}) during “${stopped.during}”, ${(stopped.at / 1000).toFixed(1)} s after it was made` : '; it answered the watchdog throughout'}`
      : `The explorable did not run: ${stopped ? `the watchdog stopped it (${stopped.end})` : 'it was not ready within 15 s'}; only the phases without it were measured`,
    ...(errors.length > 0 ? [`Its console errors: ${errors.slice(0, 5).join(' | ')}`] : []),
  ];
  return {
    phases,
    notes,
    record: { readyIn, stopped, errors, live, spot: SPOT },
  };
}
