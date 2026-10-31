/**
 * The sample project that simulates (M12, ADR 0085): it opens with no warning, its files are written
 * as the program writes them, and its package's `simulate` does what the spec says: a work queue
 * that keeps up at its defaults and goes past its limit when arrivals outgrow its workers, and an
 * audit that moves through its states until it closes, or goes back for changes past its limit.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  definitionsIn,
  modelReaderOf,
  packageCodeOf,
  simulationOf,
  tourStepProblems,
  type ComponentSimulation,
  type ProjectSnapshot,
  type SimulationStop,
} from '@visual-anything/core';
import { formatFile } from '@visual-anything/schema/format';
import { StandInSimulation } from '@visual-anything/app/src/simulation/stand-in';
import { SimulationStore } from '@visual-anything/app/src/simulation/store';
import type { ParameterValue } from '@visual-anything/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';

const FOLDER = resolve(import.meta.dirname, '../../../examples/simulate');

let session: Session;
let project: ProjectSnapshot;

beforeAll(async () => {
  const opened = await openSession(FOLDER, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample that simulates does not open.');
  session = opened.session;
  project = session.snapshot;
});

afterAll(async () => {
  await session.close();
});

type Simulate = (element: unknown, context: unknown) => unknown;

/** The package's `simulate`, run as plain JavaScript; the worker runs the same text in QuickJS. */
function simulateOf(state: ProjectSnapshot): Simulate {
  const file = state.packages.find((each) => each.id === 'flow');
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) throw new Error('The flow package holds no code.');
  const body = `${code.text.replace(/^export function /gm, 'function ')}\nreturn simulate;`;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the sample's own code, checked as the worker would run it
  return new Function(body)() as Simulate;
}

/** Plays an element's simulation to its stop, with some parameters, and answers the run. */
function played(element: string, parameters: Record<string, ParameterValue> = {}, seed = 1) {
  const simulate = simulateOf(project);
  const model = modelReaderOf(project);
  const worker = new StandInSimulation(project, (input, random) =>
    simulate(input.element, { ...input.context, random, model }),
  );
  const store = new SimulationStore(worker);
  const found = project.model.elements.find((each) => each.id === element);
  const simulation = simulationOf(definitionsIn(project), found?.component ?? '');
  expect(simulation).toBeDefined();
  expect(store.open(element, simulation as ComponentSimulation, { parameters, seed })).toEqual({
    ok: true,
  });
  store.play(element, 'max');
  worker.work();
  store.frame(0);
  const shown = store.get(element);
  if (!shown) throw new Error('No run.');
  return { shown, worker };
}

describe('the sample that simulates', () => {
  it('opens with no warning, and its files are written as the program writes them', () => {
    expect(session.warnings()).toEqual([]);
    for (const [kind, path] of [
      ['project', 'project.vaproject'],
      ['model', 'model.vamodel'],
      ['package', 'packages/flow.vapackage'],
      ['view', 'views/load.vaview'],
      ['view', 'views/audit.vaview'],
      ['tour', 'tours/how-load-builds-up.vatour'],
    ] as const) {
      const text = readFileSync(join(FOLDER, path), 'utf8');
      expect(formatFile(kind, JSON.parse(text) as never)).toBe(text);
    }
  });

  it('keeps its queue short at its defaults, for every second it plays', () => {
    const { shown } = played('audit-queue');
    expect(shown.stop).toEqual<SimulationStop>({ kind: 'ticks', tick: 599 });
    const longest = Math.max(...shown.ticks.map((each) => each.values.queue as number));
    expect(longest).toBeLessThan(200);
  });

  it('goes past what the queue holds when arrivals outgrow its workers, keeping what came before', () => {
    const { shown, worker } = played('audit-queue', { arrivals: 50 });
    expect(shown.stop).toMatchObject({
      kind: 'limit',
      value: 'queue',
      limit: 'max',
      limitValue: 5000,
    });
    expect(shown.stop?.tick).toBeGreaterThan(300);
    expect(shown.stop?.tick).toBeLessThan(599);
    expect(shown.ticks.length).toBe(shown.stop?.tick);
    expect(worker.failures).toEqual([]);
    // Each second marks the way requests come in and go out.
    expect(shown.ticks[10]?.marks).toEqual(['requests-to-queue', 'queue-to-auditors']);
  });

  it('repeats: the same seed gives the same run', () => {
    const one = played('audit-queue', { arrivals: 45, bursts: true }, 7).shown;
    const two = played('audit-queue', { arrivals: 45, bursts: true }, 7).shown;
    expect(two.ticks).toEqual(one.ticks);
    expect(two.stop).toEqual(one.stop);
  });

  it('moves an audit through its states until it closes, marking the way it went', () => {
    const { shown } = played('an-audit', { strictness: 0 });
    expect(shown.stop).toMatchObject({ kind: 'done', message: 'The case reached Closed.' });
    expect(shown.ticks[0]?.values.state).toBe('Draft');
    const moves = shown.ticks.flatMap((each) => each.marks.filter((mark) => mark.includes('-to-')));
    expect(moves[0]).toBe('draft-to-in-review');
    expect(moves.at(-1)).toBe('approved-to-closed');
  });

  it('stops an audit sent back for changes past four times', () => {
    const { shown } = played('an-audit', { strictness: 1, reviewers: 8 });
    expect(shown.stop).toMatchObject({
      kind: 'limit',
      value: 'reviews',
      limit: 'max',
      limitValue: 4,
      got: 5,
    });
  });

  it('holds a tour whose steps name nothing the project does not hold', () => {
    const tour = project.tours.find((each) => each.id === 'how-load-builds-up');
    expect(tour?.steps.length).toBe(4);
    for (const step of tour?.steps ?? []) expect(tourStepProblems(project, step)).toEqual([]);
  });
});
