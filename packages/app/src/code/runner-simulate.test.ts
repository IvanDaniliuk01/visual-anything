/**
 * Simulation runs in the code runner (ADR 0085), through the real QuickJS engine: the tab's requests,
 * ticks worked out in slices beside the hooks', runs that repeat, Run from here after the states are
 * thinned, hostile code that stops its run cleanly and counts towards turning its package off, and
 * stops of the behavior's own that never count.
 */
import {
  codeHash,
  type ModelReader,
  type SimulateInput,
  type SimulatedTick,
  type SimulationStop,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationReply, SimulationRequest } from '../simulation/messages';
import { stopwatch } from '../test/cpu';
import { loadNodeEngine } from './engine-node';
import type { CodeReply, ElementAnswers, PackageRun, RunPackage } from './messages';
import { CodeRunner, type RunnerOptions } from './runner';
import { CodeSandbox, type CallOutcome } from './sandbox';
import { GAUGES_CODE } from './test/project';
import { TANK_CODE, simulationPackage, simulationProject } from './test/simulation';

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

/** A sandbox that notes each tick `simulate` is called for. */
class NotingSandbox extends CodeSandbox {
  constructor(
    module: QuickJSWASMModule,
    callMs: number,
    private readonly noted: number[],
  ) {
    // Calls are timed as the least of the clock and the process's time (test/cpu.ts): a loaded
    // machine stretched the clock alone past a call's 50 ms, and runs stopped for time.
    super(module, { callMs, now: stopwatch() });
  }

  override simulate(
    id: Id,
    input: SimulateInput,
    seed: number,
    tick: number,
    reader?: ModelReader,
  ): CallOutcome {
    this.noted.push(tick);
    return super.simulate(id, input, seed, tick, reader);
  }
}

interface Played {
  ticks: SimulatedTick[];
  stop?: SimulationStop;
  unavailable?: string;
}

/** A runner over the node engine, with what it said of runs and of hooks gathered. */
function harness(options: Partial<RunnerOptions> & { callMs?: number } = {}) {
  const replies: CodeReply[] = [];
  const called: number[] = [];
  const runner = new CodeRunner({
    newSandbox: () => Promise.resolve(new NotingSandbox(engine, options.callMs ?? 250, called)),
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
    ...options,
  });
  const runs = new Map<Id, Played>();
  const elements = new Map<Id, ElementAnswers>();
  const packages = new Map<Id, PackageRun>();
  let read = 0;
  const absorb = () => {
    for (; read < replies.length; read += 1) {
      const reply = replies[read] as CodeReply;
      if (reply.kind === 'answers') {
        for (const each of reply.elements) elements.set(each.element, each);
        for (const each of reply.cleared) elements.delete(each);
        for (const each of reply.packages) packages.set(each.package, each);
      } else if (reply.kind === 'simulation/ticks') {
        const played = runs.get(reply.element) ?? { ticks: [] };
        played.ticks.splice(reply.from, Infinity, ...reply.ticks);
        if (reply.stop) played.stop = reply.stop;
        else delete played.stop;
        runs.set(reply.element, played);
      } else if (reply.kind === 'simulation/unavailable') {
        const played = runs.get(reply.element) ?? { ticks: [] };
        played.unavailable = reply.reason;
        runs.set(reply.element, played);
      }
    }
  };
  return {
    runner,
    replies,
    runs,
    elements,
    packages,
    called,
    absorb,
    async run(...requests: Parameters<CodeRunner['receive']>[0][]) {
      for (const request of requests) runner.receive(request);
      await runner.settled();
      absorb();
    },
  };
}

function start(
  element: Id,
  extra: Partial<Extract<SimulationRequest, { kind: 'simulation/start' }>> = {},
): SimulationRequest {
  return {
    kind: 'simulation/start',
    element,
    parameters: { rate: 4 },
    seed: 1,
    ticks: 50,
    until: 50,
    ...extra,
  };
}

/** The kitchen, with the gauges package running `code`, and a run of the loose thermometer played out. */
async function played(code: readonly string[], request: SimulationRequest = start('loose')) {
  const it = harness();
  await it.run(
    { kind: 'project', project: simulationProject(code) },
    { kind: 'packages', packages: [simulationPackage(code)] },
    request,
  );
  return it;
}

/** Each tick's values, in order. */
function valuesOf(run: Played | undefined): unknown[] {
  return (run?.ticks ?? []).map((each) => each.values);
}

describe('simulation runs in the code runner', () => {
  it('plays a run of the package’s simulate to its ticks, taking requests sent with the project', async () => {
    const it = await played(TANK_CODE);
    const run = it.runs.get('loose');
    expect(run?.ticks).toHaveLength(50);
    expect(run?.stop).toEqual({ kind: 'ticks', tick: 49 });
    expect(run?.ticks[0]?.marks).toEqual(['loose']);
    expect(run?.ticks[1]?.marks).toEqual([]);
    // The hooks never call simulate: only runs do.
    expect(it.packages.get('gauges')).toEqual({
      package: 'gauges',
      state: 'running',
      hooks: ['simulate'],
      stops: 0,
    });
    expect(it.replies.at(-1)).toEqual({ kind: 'idle' });
  });

  it('gives the same ticks for the same code, parameters, seed and model, and others for another seed', async () => {
    const first = await played(TANK_CODE);
    const again = await played(TANK_CODE);
    expect(valuesOf(again.runs.get('loose'))).toEqual(valuesOf(first.runs.get('loose')));
    expect(again.runs.get('loose')?.ticks).toEqual(first.runs.get('loose')?.ticks);
    // In one runner too: started again, it gives the same.
    await first.run(start('loose'));
    expect(first.runs.get('loose')?.ticks).toEqual(again.runs.get('loose')?.ticks);
    const other = await played(TANK_CODE, start('loose', { seed: 2 }));
    expect(valuesOf(other.runs.get('loose'))).not.toEqual(valuesOf(first.runs.get('loose')));
  });

  it('works only as far as the tab asks, and on when it asks for more', async () => {
    const it = await played(TANK_CODE, start('loose', { until: 10 }));
    expect(it.runs.get('loose')?.ticks).toHaveLength(10);
    expect(it.runs.get('loose')?.stop).toBeUndefined();
    await it.run({ kind: 'simulation/until', element: 'loose', until: 30 });
    expect(it.runs.get('loose')?.ticks).toHaveLength(30);
  });

  it('runs from a kept state after thinning as it ran the first time', async () => {
    const code = [
      'export function simulate(element, context) {',
      '  const before = context.state === undefined ? 0 : context.state.level;',
      '  const level = before + Math.floor(Math.random() * 10);',
      '  return { values: { level, draw: context.random() }, state: { level, pad: "x".repeat(40) } };',
      '}',
    ];
    const it = harness({ simulationBudget: { stateKeptText: 400, stateEvery: 10 } });
    await it.run(
      { kind: 'project', project: simulationProject(code) },
      { kind: 'packages', packages: [simulationPackage(code)] },
      start('loose', { ticks: 60, until: 60 }),
    );
    const first = structuredClone(it.runs.get('loose')?.ticks);
    expect(first).toHaveLength(60);
    it.called.length = 0;
    await it.run({ kind: 'simulation/from-here', element: 'loose', tick: 35, until: 60 });
    // Its states were thinned to every tenth: it worked 31 to 35 out again from tick 30's state.
    expect(it.called.slice(0, 5)).toEqual([31, 32, 33, 34, 35]);
    expect(it.called.at(-1)).toBe(59);
    expect(it.runs.get('loose')?.ticks).toEqual(first);
    expect(it.runs.get('loose')?.stop).toEqual({ kind: 'ticks', tick: 59 });
  });

  it('stops at a limit, at its end or at its ticks without counting a stop of the code', async () => {
    const code = [
      'export function simulate(element, context) {',
      '  if (context.parameters.rate === 1) return { values: { level: -1 } };',
      '  if (context.parameters.rate === 2) return { values: { level: NaN } };',
      '  return { values: { level: context.tick }, done: context.tick === 4 ? "It is full." : false };',
      '}',
    ];
    const it = harness();
    await it.run(
      { kind: 'project', project: simulationProject(code) },
      { kind: 'packages', packages: [simulationPackage(code)] },
    );
    for (let round = 0; round < 3; round += 1) {
      await it.run(start('loose', { parameters: { rate: 1 } }));
      expect(it.runs.get('loose')).toMatchObject({
        ticks: [],
        stop: { kind: 'limit', tick: 0, value: 'level', limit: 'min', limitValue: 0, got: -1 },
      });
      await it.run(start('loose', { parameters: { rate: 2 } }));
      expect(it.runs.get('loose')?.stop).toMatchObject({ kind: 'limit', limit: 'finite' });
      await it.run(start('loose', { parameters: { rate: 3 } }));
      expect(it.runs.get('loose')?.stop).toEqual({ kind: 'done', tick: 4, message: 'It is full.' });
    }
    expect(it.packages.get('gauges')).toMatchObject({ state: 'running', stops: 0 });
  });

  const hostile: [string, string, string[]][] = [
    ['a loop', 'for (;;) {}', ['time']],
    [
      // In small arrays: the interpreter looks at its deadline every few thousand steps, and an array
      // of 100,000 filled in one step left it seconds between looks (the client's watchdog stops a
      // worker that stays silent that long; client.ts).
      'an allocation bomb',
      'const all = []; for (;;) all.push(new Array(1000).fill(1));',
      ['memory', 'time'],
    ],
    // Writing 4 MiB of state out may itself run past the call's time.
    [
      'a huge state',
      'return { values: { level: 1 }, state: "x".repeat(1 << 22) };',
      ['answer', 'time'],
    ],
    [
      'a state past 64 KiB',
      'return { values: { level: 1 }, state: "x".repeat(70 * 1024) };',
      ['answer'],
    ],
    [
      'reaching for fetch',
      'return { values: { level: globalThis.fetch("http://x/") } };',
      ['threw'],
    ],
  ];

  for (const [what, body, kinds] of hostile) {
    it(`stops a run on ${what} cleanly, counts it, and turns the package off at the third`, async () => {
      const code = [
        'export function simulate(element, context) {',
        '  if (context.tick < 3) return { values: { level: context.tick }, state: context.tick };',
        `  ${body}`,
        '}',
      ];
      const it = harness({ callMs: 50 });
      await it.run(
        { kind: 'project', project: simulationProject(code) },
        { kind: 'packages', packages: [simulationPackage(code)] },
        start('loose'),
      );
      const run = it.runs.get('loose');
      expect(run?.ticks.map((each) => each.values)).toEqual([
        { level: 0 },
        { level: 1 },
        { level: 2 },
      ]);
      expect(run?.stop).toMatchObject({ kind: 'failed', tick: 3 });
      const failure = (run?.stop as Extract<SimulationStop, { kind: 'failed' }>).failure;
      expect(kinds).toContain(failure.kind);
      expect(it.packages.get('gauges')).toMatchObject({ state: 'running', stops: 1 });
      expect(it.packages.get('gauges')?.problem?.subjects).toEqual(['gauges', 'loose']);
      // Two more in a row turn it off; a run then cannot start, and says why.
      await it.run(start('loose'));
      expect(it.packages.get('gauges')).toMatchObject({ state: 'running', stops: 2 });
      await it.run(start('fridge'));
      expect(it.packages.get('gauges')).toMatchObject({
        state: 'off',
        stops: 3,
        problem: { code: 'code-off' },
      });
      await it.run(start('oven'));
      expect(it.runs.get('oven')).toEqual({ ticks: [], unavailable: 'off' });
    });
  }

  it('ends the other runs of a package turned off, saying why', async () => {
    const code = [
      'export function simulate(element, context) {',
      '  if (element.id === "oven" && context.tick === 2) for (;;) {}',
      '  return { values: { level: context.tick } };',
      '}',
    ];
    const it = harness({ callMs: 50 });
    await it.run(
      { kind: 'project', project: simulationProject(code) },
      { kind: 'packages', packages: [simulationPackage(code, { stops: 2 })] },
      start('loose', { ticks: 10_000, until: 10_000 }),
      start('oven'),
    );
    expect(it.runs.get('oven')?.stop).toMatchObject({ kind: 'failed', tick: 2 });
    expect(it.packages.get('gauges')?.state).toBe('off');
    expect(it.runs.get('loose')).toMatchObject({ stop: { kind: 'changed' }, unavailable: 'off' });
  });

  it('says why a run cannot start: no simulate, code not approved, or no simulation', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: simulationProject(GAUGES_CODE) },
      { kind: 'packages', packages: [simulationPackage(GAUGES_CODE)] },
      start('loose'),
      start('kitchen'),
    );
    expect(it.runs.get('loose')).toEqual({ ticks: [], unavailable: 'no-code' });
    expect(it.runs.get('kitchen')).toEqual({ ticks: [], unavailable: 'no-simulation' });
    const other: RunPackage = { ...simulationPackage(TANK_CODE), package: 'other' };
    await it.run({ kind: 'packages', packages: [other] }, start('loose'));
    expect(it.runs.get('loose')).toEqual({ ticks: [], unavailable: 'not-approved' });
  });

  it('ends a run whose element changed, keeping its ticks, and one whose code changed', async () => {
    const it = await played(TANK_CODE, start('loose', { until: 5 }));
    const project = simulationProject();
    const edited = structuredClone(project);
    edited.model.elements = edited.model.elements.map((each) =>
      each.id === 'loose' ? { ...each, name: 'Tank' } : each,
    );
    await it.run({ kind: 'project', project: edited });
    expect(it.runs.get('loose')).toMatchObject({ stop: { kind: 'changed', tick: 5 } });
    expect(it.runs.get('loose')?.ticks).toHaveLength(5);
    const code = [...TANK_CODE, '// changed'];
    await it.run(start('loose', { until: 5 }));
    await it.run({ kind: 'packages', packages: [simulationPackage(code)] });
    expect(it.runs.get('loose')).toMatchObject({ stop: { kind: 'changed', tick: 5 } });
  });

  it('reads the model a run started from, and ends a run of code granted model:read at any edit to it', async () => {
    const counting = [
      'export function simulate(element, context) {',
      '  return { values: { level: context.model.elements().length, draw: 0 } };',
      '}',
    ];
    const reading = simulationPackage(counting, {
      hash: codeHash(counting, ['model:read']),
      declared: ['model:read'],
      granted: ['model:read'],
    });
    const project = simulationProject(counting);
    const it = harness();
    await it.run(
      { kind: 'project', project },
      { kind: 'packages', packages: [reading] },
      start('loose', { until: 5 }),
    );
    const before = it.runs.get('loose')?.ticks.map((each) => each.values.level);
    expect(before).toHaveLength(5);
    // An element added far from the thermometer: what lies around it is the same, the model is not.
    const edited = structuredClone(project);
    edited.model.elements.push({ id: 'far', component: 'essence', name: 'Far away' });
    await it.run({ kind: 'project', project: edited });
    expect(it.runs.get('loose')).toMatchObject({ stop: { kind: 'changed', tick: 5 } });
    // Run from here and Play more never go on from the model it started from.
    await it.run({ kind: 'simulation/from-here', element: 'loose', tick: 2, until: 10 });
    expect(it.runs.get('loose')).toMatchObject({ stop: { kind: 'changed' } });
    expect(it.runs.get('loose')?.ticks.map((each) => each.values.level)).toEqual(before);
    await it.run({ kind: 'simulation/more', element: 'loose', until: 20 });
    expect(it.runs.get('loose')?.ticks).toHaveLength(5);
  });

  it('keeps a run of code that does not read the model going through an edit that does not touch its element', async () => {
    const it = await played(TANK_CODE, start('loose', { until: 5 }));
    const edited = structuredClone(simulationProject());
    edited.model.elements.push({ id: 'far', component: 'essence', name: 'Far away' });
    await it.run({ kind: 'project', project: edited });
    expect(it.runs.get('loose')?.stop).toBeUndefined();
    await it.run({ kind: 'simulation/until', element: 'loose', until: 8 });
    expect(it.runs.get('loose')?.ticks).toHaveLength(8);
  });

  it('still answers the canvas’s hooks while a run works as fast as it goes', async () => {
    const code = [...GAUGES_CODE, ...TANK_CODE];
    let clock = 0;
    const it = harness({
      // Each look at the clock is a millisecond: slices of a few ticks, the same on any machine.
      now: () => (clock += 1),
      sliceMs: 8,
      // A turn of the event loop between slices, as the worker's timer gives, without waiting on the
      // system's timer: on Windows a timer of 0 ms waits up to 16 ms, and hundreds of them stretched
      // this test past its time.
      pause: () => new Promise((resolve) => setImmediate(resolve)),
    });
    await it.run(
      { kind: 'project', project: simulationProject(code) },
      { kind: 'packages', packages: [simulationPackage(code)] },
    );
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'fahrenheit', value: 212, package: 'gauges' },
    ]);
    it.runner.receive(start('loose', { ticks: 2_000, until: 2_000 }));
    const until = async (done: () => boolean) => {
      for (let wait = 0; wait < 10_000 && !done(); wait += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        it.absorb();
      }
    };
    await until(() => (it.runs.get('loose')?.ticks.length ?? 0) > 0);
    const hotter = structuredClone(simulationProject(code));
    hotter.model.elements = hotter.model.elements.map((each) =>
      each.id === 'oven' ? { ...each, attributes: { celsius: 300 } } : each,
    );
    it.runner.receive({ kind: 'project', project: hotter });
    await until(() => it.elements.get('oven')?.attributes[0]?.value === 572);
    expect(it.elements.get('oven')?.attributes[0]?.value).toBe(572);
    // The run was still at work when the hooks answered, and goes on to its ticks.
    const atAnswer = it.runs.get('loose');
    expect(atAnswer?.stop).toBeUndefined();
    expect(atAnswer?.ticks.length).toBeLessThan(2_000);
    await it.runner.settled();
    it.absorb();
    expect(it.runs.get('loose')?.stop).toEqual({ kind: 'ticks', tick: 1_999 });
    // And the run was told of its ticks a slice at a time, not all at the end.
    const told = it.replies.filter(
      (reply): reply is Extract<SimulationReply, { kind: 'simulation/ticks' }> =>
        reply.kind === 'simulation/ticks',
    );
    expect(told.length).toBeGreaterThan(10);
  });
});
