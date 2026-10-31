/**
 * `simulate` in the sandbox (ADR 0085): the tick's generator in place of `Math.random()` and as
 * `context.random()`, drawing what the core's `tickRandom` draws; numbers that are not finite carried
 * through to the core's check; and every limit of ADR 0054 kept, for hostile code too.
 */
import {
  CODE_LIMITS,
  SIMULATION_LIMITS,
  checkSimulateAnswer,
  hookInputOf,
  markableOf,
  simulateInputAt,
  tickRandom,
  type HookInput,
  type SimulateInput,
} from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadNodeEngine } from './engine-node';
import { CodeSandbox, SIMULATE_ANSWER_TEXT, type CallOutcome } from './sandbox';
import { TANK, TANK_CODE, simulationProject } from './test/simulation';

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

/** Longer than the app's 50 ms, so that a busy machine never stops a call that is not about time. */
const CALL_MS = 250;

const project = simulationProject();
const base = hookInputOf(project, 'loose') as HookInput;

function inputAt(tick: number, state?: SimulateInput['context']['state']): SimulateInput {
  return simulateInputAt(base, {
    parameters: { rate: 4 },
    state,
    tick,
    ...(TANK.tick ? { tickLength: TANK.tick } : {}),
  });
}

/** A sandbox with the gauges package's module `code` loaded. */
function sandboxWith(code: string, granted: string[] = []): CodeSandbox {
  const sandbox = new CodeSandbox(engine, { callMs: CALL_MS });
  const loaded = sandbox.load({ package: 'gauges', code, granted });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.failure));
  return sandbox;
}

/** Calls `simulate`, whose body is `body`, once, at `tick` of a run seeded `seed`. */
function simulateOnce(body: string, seed = 7, tick = 3, granted: string[] = []): CallOutcome {
  const sandbox = sandboxWith(`export function simulate(element, context) {\n${body}\n}`, granted);
  try {
    return sandbox.simulate('gauges', inputAt(tick), seed, tick);
  } finally {
    sandbox.dispose();
  }
}

function draws(seed: number, tick: number, count: number): number[] {
  const random = tickRandom(seed, tick);
  return Array.from({ length: count }, () => random());
}

describe('simulate in the sandbox', () => {
  it('finds simulate among the hooks, and calls it with the tick’s context', () => {
    const sandbox = sandboxWith(TANK_CODE.join('\n'));
    expect(sandbox.hooksOf('gauges')).toEqual(['simulate']);
    const outcome = sandbox.simulate('gauges', inputAt(0), 1, 0);
    expect(outcome).toMatchObject({ ok: true });
    const answer = (outcome as { answer: { values: { level: number }; state: unknown } }).answer;
    expect(answer.state).toEqual({ level: answer.values.level });
    const seen = simulateOnce(
      'return { values: {}, state: [context.tick, context.time, context.unit, context.parameters.rate, context.state === undefined] };',
      1,
      3,
    );
    expect(seen).toMatchObject({ ok: true, answer: { state: [3, 6, 's', 4, true] } });
    sandbox.dispose();
  });

  it('draws from context.random() and Math.random() what tickRandom(seed, tick) draws, in one sequence', () => {
    for (const [seed, tick] of [
      [1, 0],
      [7, 3],
      [SIMULATION_LIMITS.maxSeed, 9_999],
    ] as const) {
      const outcome = simulateOnce(
        'return { values: {}, state: [context.random(), Math.random(), context.random(), Math.random()] };',
        seed,
        tick,
      );
      expect(outcome).toMatchObject({ ok: true, answer: { state: draws(seed, tick, 4) } });
    }
  });

  it('makes the generator afresh for each call: the same seed and tick draw the same, another tick otherwise', () => {
    const sandbox = sandboxWith(
      [
        // Taken before any call, at the module's top: it still draws from the tick under way.
        'const draw = Math.random;',
        'Math.imul = () => 0;',
        'export function simulate(element, context) {',
        '  return { values: {}, state: [draw(), context.random(), draw()] };',
        '}',
        'export function attributes() { return { chance: Math.random() }; }',
      ].join('\n'),
    );
    const at = (seed: number, tick: number) =>
      sandbox.simulate('gauges', inputAt(tick), seed, tick);
    const first = at(5, 10);
    expect(first).toMatchObject({ ok: true, answer: { state: draws(5, 10, 3) } });
    expect(at(5, 11)).toMatchObject({ ok: true, answer: { state: draws(5, 11, 3) } });
    expect(at(5, 10)).toEqual({ ...first, ms: expect.any(Number) as number });
    // Other hooks draw as the engine does, never from a tick's generator.
    const chance = sandbox.call('gauges', 'attributes', base);
    expect(chance).toMatchObject({ ok: true });
    const value = (chance as { answer: { chance: number } }).answer.chance;
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    sandbox.dispose();
  });

  it('keeps Math.random() the tick’s: code can neither replace it nor reach the engine’s', () => {
    const outcome = simulateOnce(
      [
        'let replaced = "kept";',
        'try { Math.random = () => 0.5; replaced = "replaced"; } catch (error) { replaced = "refused"; }',
        'return { values: {}, state: [replaced, Math.random()] };',
      ].join('\n'),
      2,
      4,
    );
    expect(outcome).toMatchObject({ ok: true, answer: { state: ['refused', draws(2, 4, 1)[0]] } });
  });

  it('carries values that are not finite through, for the core to stop the run at their limit', () => {
    const outcome = simulateOnce(
      'return { values: { level: NaN, draw: -Infinity }, state: { level: 1 } };',
    );
    expect(outcome.ok).toBe(true);
    const answer = (outcome as { answer: { values: Record<string, number> } }).answer;
    expect(answer.values.level).toBeNaN();
    expect(answer.values.draw).toBe(Number.NEGATIVE_INFINITY);
    expect(checkSimulateAnswer(TANK, answer, markableOf(base))).toEqual({
      kind: 'limit',
      value: 'level',
      limit: 'finite',
      got: Number.NaN,
    });
    const infinite = simulateOnce('return { values: { level: 1 / 0 } };');
    expect(
      checkSimulateAnswer(TANK, (infinite as { answer: unknown }).answer, markableOf(base)),
    ).toMatchObject({ kind: 'limit', value: 'level', limit: 'finite' });
  });

  it('carries only simulated values that are not finite: anywhere else they are not plain data', () => {
    expect(simulateOnce('return { values: { level: 1 }, state: { level: NaN } };')).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it is not plain data' },
    });
    expect(simulateOnce('return { values: [Infinity] };')).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it is not plain data' },
    });
    // A value that only looks like a carried one stays what it is, and the core drops it.
    const looks = simulateOnce('return { values: { level: null, draw: "NaN" } };');
    expect(looks).toMatchObject({ ok: true, answer: { values: { level: null, draw: 'NaN' } } });
  });

  it('stops a loop past its time, even one that catches, and runs the next call', () => {
    const sandbox = sandboxWith(
      [
        'let calls = 0;',
        'export function simulate(element, context) {',
        '  calls += 1;',
        '  if (calls === 1) { for (;;) { try { for (;;) {} } catch (error) {} } }',
        '  return { values: { level: calls } };',
        '}',
      ].join('\n'),
    );
    expect(sandbox.simulate('gauges', inputAt(0), 1, 0)).toMatchObject({
      ok: false,
      failure: { kind: 'time' },
    });
    expect(sandbox.simulate('gauges', inputAt(0), 1, 0)).toMatchObject({
      ok: true,
      answer: { values: { level: 2 } },
    });
    sandbox.dispose();
  });

  it('stops an allocation bomb past 32 MiB, or past its time', () => {
    const outcome = simulateOnce(
      'const all = []; for (;;) { all.push(new Array(100000).fill(context.random())); }',
    );
    expect(outcome.ok).toBe(false);
    expect(['memory', 'time']).toContain((outcome as { failure: { kind: string } }).failure.kind);
    expect(CODE_LIMITS.memoryBytes).toBe(32 * 1024 * 1024);
  });

  it('refuses a huge state before it leaves the interpreter, and lets the core refuse one past 64 KiB', () => {
    expect(
      simulateOnce('return { values: { level: 1 }, state: "x".repeat(1024 * 1024) };'),
    ).toMatchObject({
      ok: false,
      failure: {
        kind: 'answer',
        reason: `it is over ${SIMULATE_ANSWER_TEXT} characters as JSON`,
      },
    });
    const over = simulateOnce(
      `return { values: { level: 1 }, state: "x".repeat(${SIMULATION_LIMITS.stateText + 10}) };`,
    );
    expect(over.ok).toBe(true);
    expect(
      checkSimulateAnswer(TANK, (over as { answer: unknown }).answer, markableOf(base)),
    ).toMatchObject({ kind: 'dropped' });
  });

  it('finds no network, page or host on globalThis, and no clock without "time"', () => {
    expect(simulateOnce('fetch("http://127.0.0.1:1/"); return { values: {} };')).toMatchObject({
      ok: false,
      failure: { kind: 'threw', message: "ReferenceError: 'fetch' is not defined" },
    });
    expect(
      simulateOnce(
        'return { values: {}, state: ["fetch", "XMLHttpRequest", "WebSocket", "document", "postMessage", "importScripts", "process", "require"].filter((name) => name in globalThis) };',
      ),
    ).toMatchObject({ ok: true, answer: { state: [] } });
    expect(simulateOnce('return { values: { level: Date.now() } };')).toMatchObject({
      ok: false,
      failure: { kind: 'threw' },
    });
    expect(simulateOnce('return { values: { level: Date.now() } };', 1, 0, ['time'])).toMatchObject(
      { ok: true },
    );
  });

  it('is 50 ms in the app', () => {
    expect(CODE_LIMITS.callMs).toBe(50);
  });
});
