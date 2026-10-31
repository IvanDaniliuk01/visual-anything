/**
 * Every phase of the space benchmark runs, briefly, in both of its modes, on a canvas in jsdom with
 * the stand-in worker, which draws spaces as boxes: this shows that they run and report as the
 * benchmark's phases do, not how fast they are, which the benchmark's page measures in a browser. Its
 * project keeps the spec's shares: 200 posed solids from 20 distinct ones, 2 at the caps, and 2,000
 * anchored parts at 10,000 elements.
 */
import { spaceOf } from '@visual-anything/core';
import { Container, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextFactory } from '../canvas/draw';
import type { ImagePlatform } from '../canvas/images';
import { createSolidClient, type SolidFileResult } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { benchCanvas } from '../test/benchCanvas';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { BenchMode } from './frames';
import { SPACE_SOLIDS, spaceSolidFiles } from './solidFiles';
import { SPACE_MARKS, measureSpace, type SpaceBench, type SpacePlan } from './space';
import { SPACE_VIEW, spaceSolidId, syntheticSpace } from './spaceProject';

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
const PLAN: SpacePlan = { frames: 2, clicks: 2, changes: 2, picks: 4, rest: 0, wait: 5_000 };

const PANEL_PHASES = [
  'Panel: turn the camera, whole space',
  'Panel: turn the camera, close in',
  'Panel: zoom in and out, close in',
];
const CANVAS_PHASES = [
  'Canvas, panel at rest: pan, whole view',
  'Canvas, panel at rest: zoom, whole view',
  'Canvas, panel at rest: select by clicking, whole view',
  'Canvas, panel at rest: pan, names shown',
  'Canvas, panel at rest: zoom, names shown',
  'Canvas, panel at rest: select by clicking, names shown',
];
const STEP_PHASES = [
  'Panel: play a step, its relations drawn in space',
  'Canvas: play a step, its relations drawn in space',
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

describe('the space benchmark’s project', () => {
  it('poses 200 solids from 20 distinct ones, 2 at the caps, with 2,000 anchored parts', () => {
    const made = syntheticSpace({ elements: 10_000, scale: 'small' });
    const { elements } = made.project.model;
    expect(elements).toHaveLength(10_000);
    const space = spaceOf(made.project, made.project.views[0]);
    const entries = [...space.entries.values()];
    const posed = entries.filter((entry) => entry.how === 'posed' && entry.solid);
    expect(posed).toHaveLength(200);
    expect(new Set(posed.map((entry) => entry.solid?.id)).size).toBe(SPACE_SOLIDS.count);
    expect(entries.filter((entry) => entry.how === 'anchored')).toHaveLength(2_000);
    expect(made.holders).toHaveLength(20);
    expect(made.step).toHaveLength(20);
    // The middle holder shows the solid at every cap.
    const middle = elements.find((element) => element.id === made.holders[0]);
    expect(middle?.appearance?.solid).toMatchObject({ solid: spaceSolidId(0), placement: 'parts' });
    expect(spaceSolidFiles('small').filter((file) => file.atCaps)).toHaveLength(2);
  });
});

describe('the space benchmark', () => {
  it.each<BenchMode>(['work', 'frames'])(
    'runs every phase in %s mode with the panel open, and reports them',
    async (mode) => {
      const made = syntheticSpace({ elements: 1_000, scale: 'small' });
      const client = createSolidClient({
        files: {
          get: (hash: string): Promise<SolidFileResult> => {
            const bytes = made.files.get(hash);
            return Promise.resolve(
              bytes
                ? { ok: true, bytes: bytes.slice() }
                : { ok: false, code: 'solid-file-missing', message: 'No such file.' },
            );
          },
        },
        start: () => new StandInSolidWorker(),
      });
      const { bench: canvas } = await benchCanvas(
        made.project,
        SPACE_VIEW,
        mode,
        client,
        platform,
        text,
      );
      const bench: SpaceBench = {
        ...canvas,
        client,
        view: made.project.views[0] as NonNullable<(typeof made.project.views)[number]>,
        mode,
        size: { width: 64, height: 48 },
        holders: made.holders,
        step: made.step,
      };
      const results = await measureSpace(bench, PLAN);

      expect(results.phases.map((phase) => phase.name)).toEqual([
        ...PANEL_PHASES,
        ...CANVAS_PHASES,
        ...STEP_PHASES,
      ]);
      for (const phase of results.phases) {
        expect(phase.frames.length, phase.name).toBeGreaterThan(0);
      }
      const byName = new Map(results.timed.map((each) => [each.name, each]));
      expect(byName.get('Panel: the whole space drawn again at rest')?.mark).toBe(
        SPACE_MARKS.atRest,
      );
      for (const name of [
        'A selection on the canvas, until the panel shows it',
        'A change of focus on the canvas, until the panel shows it',
      ]) {
        expect(byName.get(name)?.times, name).toHaveLength(PLAN.changes);
        expect(byName.get(name)?.mark, name).toBe(SPACE_MARKS.shown);
      }
      const pick = byName.get('A pick in the panel, answered');
      expect(pick?.times).toHaveLength(PLAN.picks);
      expect(pick?.mark).toBe(SPACE_MARKS.pick);
      expect(results.latency).toHaveLength(PLAN.clicks * 2);
      expect(results.notes.some((note) => note.startsWith('The space: '))).toBe(true);
      expect(results.notes.some((note) => note.startsWith('The step: 20 relations'))).toBe(true);
    },
    120_000,
  );
});
