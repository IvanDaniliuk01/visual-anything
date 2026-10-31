/**
 * Every phase of the solids benchmark runs, briefly, in both of its modes, on a canvas in jsdom with
 * the stand-in worker: this shows that they run and report as the benchmark's phases do, not how fast
 * they are, which the benchmark's page measures on the reference laptop.
 */
import { Container, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextFactory } from '../canvas/draw';
import type { ImagePlatform } from '../canvas/images';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { benchCanvas } from '../test/benchCanvas';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { BenchMode } from './frames';
import {
  SOLID_MARKS,
  measureSolids,
  solidsBenchKeys,
  type SolidsBench,
  type SolidsPlan,
} from './solids';
import { BENCH_SOLIDS } from './solidFiles';
import { SOLIDS_VIEW, benchSolidId, syntheticSolids } from './solidsProject';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** A platform whose textures are real and blank, as jsdom makes no picture. */
const platform: ImagePlatform<Texture, unknown> = {
  now: () => performance.now(),
  bytesOf: (base64) => new Uint8Array(base64.length),
  decodeBitmap: () => Promise.resolve({}),
  loadSvg: () => Promise.resolve({}),
  texture: () => new Texture({ source: Texture.WHITE.source }),
  atlasTexture: () => new Texture({ source: Texture.WHITE.source }),
  flush: () => {},
  destroyTexture: () => {},
  destroyPage: () => {},
  releasePicture: () => {},
};

/** Text as jsdom can make it: a container named after it. */
const text: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

/** A few steps of each phase, and no rest between them. */
const PLAN: SolidsPlan = {
  frames: 2,
  clicks: 2,
  points: 24,
  hover: 2,
  focus: 2,
  filters: 2,
  turnFrames: 4,
  switches: 1,
  rest: 0,
  wait: 5_000,
};

const PHASES = [
  'Pan, names shown, pictures arriving',
  'Pan, whole view',
  'Zoom, whole view',
  'Select by clicking, whole view',
  'Pan, names shown',
  'Zoom, names shown',
  'Select by clicking, names shown',
  'Point over parts',
  'Change focus on parts',
  'Turn a solid of 200,000 triangles',
  'Turn a drawing at every cap',
  'Pan, names shown, images cold',
  'Zoom, images cold',
  'Switch theme, whole view',
  'Switch theme, names shown',
];

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the solids benchmark', () => {
  it.each<BenchMode>(['work', 'frames'])(
    'runs every phase in %s mode, its files held back until the cold run, and reports them',
    async (mode) => {
      const made = syntheticSolids({ elements: 2_000, scale: 'small' });
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const asked: string[] = [];
      const client = createSolidClient({
        files: {
          get: async (hash: string): Promise<SolidFileResult> => {
            asked.push(hash);
            await gate;
            const bytes = made.files.get(hash);
            return bytes
              ? { ok: true, bytes: bytes.slice() }
              : { ok: false, code: 'solid-file-missing', message: 'No such file.' };
          },
        },
        start: () => new StandInSolidWorker(),
      });
      const { bench: canvas } = await benchCanvas(
        made.project,
        SOLIDS_VIEW,
        mode,
        client,
        platform,
        text,
      );
      const keys = solidsBenchKeys(canvas.indexed(), made.drawings);
      expect(canvas.indexed().byKey.get(keys.turned)?.solid?.id).toBe(
        benchSolidId(BENCH_SOLIDS.turned),
      );
      expect(canvas.indexed().byKey.get(keys.turnedAtCaps)?.solid?.id).toBe(
        benchSolidId(BENCH_SOLIDS.turnedAtCaps),
      );
      const bench: SolidsBench = {
        ...canvas,
        client,
        releaseFiles: () => release(),
        ...keys,
      };
      const results = await measureSolids(bench, PLAN);

      expect(results.phases.map((phase) => phase.name)).toEqual(PHASES);
      for (const phase of results.phases) {
        expect(phase.frames.length, phase.name).toBeGreaterThan(0);
      }
      expect(results.phases.filter((phase) => phase.restyling).map((phase) => phase.name)).toEqual([
        'Switch theme, whole view',
        'Switch theme, names shown',
      ]);
      expect(results.latency).toHaveLength(PLAN.clicks * 2);
      expect(asked.length).toBeGreaterThan(0);

      const byName = new Map(results.timed.map((each) => [each.name, each]));
      const pictures = byName.get('Every picture on screen shows, after the files reach the app');
      expect(pictures?.mark).toBe(SOLID_MARKS.pictures);
      expect(pictures?.times).toHaveLength(1);
      const pointing = byName.get('Find what is under the pointer, over parts');
      expect(pointing?.times).toHaveLength(PLAN.points);
      expect(pointing?.mark).toBe(SOLID_MARKS.pointing);
      // The stand-in's part buffer finds anchored parts under some of the points.
      expect(
        Number(/^([\d,]+) found an anchored part/.exec(pointing?.note ?? '')?.[1] ?? 0),
      ).toBeGreaterThan(0);
      const filter = byName.get('A filter hides ten parts: the solid drawn again without them');
      expect(filter?.mark).toBe(SOLID_MARKS.filter);
      expect(filter?.times).toHaveLength(PLAN.filters);
      for (const what of ['a solid of 200,000 triangles', 'a drawing at every cap']) {
        const turning = byName.get(`Turning ${what}: between its frames`);
        expect(turning, what).toBeDefined();
        expect(turning?.times.length, what).toBeGreaterThan(0);
      }
      expect(results.notes).toEqual([]);
      expect(bench.controller.turning).toBeUndefined();
      expect(bench.controller.renderer.theme).toBe('light');
    },
    120_000,
  );
});
