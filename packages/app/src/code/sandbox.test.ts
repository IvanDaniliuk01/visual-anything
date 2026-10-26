/**
 * Hostile package code (ADR 0054): loops, allocation bombs, reaching for globals, the network, the
 * page, code from text and other packages, answers that pollute or are far over their caps. Each
 * stops or is refused, and the sandbox goes on running the next call.
 */
import { CODE_LIMITS, hookInputOf, modelReaderOf, type HookInput } from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadNodeEngine } from './engine-node';
import { CodeSandbox, SANDBOX_REASONS, type CallOutcome } from './sandbox';
import { codeProject } from './test/project';

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

const project = codeProject();
const input = hookInputOf(project, 'oven') as HookInput;

/**
 * How long a call may run in these tests: longer than the app's 50 ms, so that a busy machine never
 * stops a call that is not about time; the calls that are about time stop all the same.
 */
const CALL_MS = 250;

/** A sandbox with one package whose module is `code`, granted `granted`. */
function sandboxWith(code: string, granted: string[] = []) {
  const sandbox = new CodeSandbox(engine, { callMs: CALL_MS });
  const loaded = sandbox.load({ package: 'gauges', code, granted });
  return { sandbox, loaded };
}

/** Calls `attributes`, whose body is `body`, on the oven. */
function attributes(body: string, granted: string[] = []): CallOutcome {
  const { sandbox, loaded } = sandboxWith(
    `export function attributes(element, context) {\n${body}\n}`,
    granted,
  );
  expect(loaded).toEqual({ ok: true, hooks: ['attributes'] });
  const outcome = sandbox.call('gauges', 'attributes', input, modelReaderOf(project));
  sandbox.dispose();
  return outcome;
}

function answer(body: string, granted: string[] = []): unknown {
  const outcome = attributes(body, granted);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
  return outcome.answer;
}

describe('the sandbox', () => {
  it('loads a module, finds its hooks and calls them with the element and its context', () => {
    const { sandbox, loaded } = sandboxWith(
      [
        'const toF = (c) => c * 9 / 5 + 32;',
        'export function attributes(element) { return { fahrenheit: toF(element.attributes.celsius) }; }',
        'export function check(element) { return element.attributes.celsius > 90 ? ["Too hot."] : []; }',
        'export function draw(element, context) { return { width: 10, height: 10, items: [], scale: context.scale }; }',
        'export const other = 1;',
      ].join('\n'),
    );
    expect(loaded).toEqual({ ok: true, hooks: ['attributes', 'check', 'draw'] });
    expect(sandbox.call('gauges', 'attributes', input)).toMatchObject({
      ok: true,
      answer: { fahrenheit: 212 },
    });
    expect(sandbox.call('gauges', 'check', input)).toMatchObject({
      ok: true,
      answer: ['Too hot.'],
    });
    const drawn = hookInputOf(project, 'oven', { view: 'kitchen', scale: 2 }) as HookInput;
    expect(sandbox.call('gauges', 'draw', drawn)).toMatchObject({
      ok: true,
      answer: { width: 10, height: 10, items: [], scale: 2 },
    });
  });

  it('hands the code a frozen copy, which it cannot change', () => {
    const outcome = attributes('element.name = "changed"; return {};');
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'threw' } });
    expect(answer('return { frozen: Object.isFrozen(context.relations) };')).toEqual({
      frozen: true,
    });
    expect(input.element.name).toBe('Oven');
  });

  it('gives the error the code throws as the package’s, and runs the next call', () => {
    const { sandbox } = sandboxWith(
      'let calls = 0;\nexport function attributes() { calls += 1; if (calls === 1) throw new RangeError("bad value"); return { calls }; }',
    );
    expect(sandbox.call('gauges', 'attributes', input)).toMatchObject({
      ok: false,
      failure: { kind: 'threw', message: 'RangeError: bad value' },
    });
    expect(sandbox.call('gauges', 'attributes', input)).toMatchObject({
      ok: true,
      answer: { calls: 2 },
    });
  });

  it('refuses a module that is not one, that imports, or that waits at its top', () => {
    expect(sandboxWith('export function attributes( {').loaded).toMatchObject({
      ok: false,
      failure: { kind: 'threw', message: expect.stringMatching(/^SyntaxError/) as unknown },
    });
    expect(sandboxWith('import x from "./other.js";\nexport const a = x;').loaded).toMatchObject({
      ok: false,
      failure: { kind: 'threw', message: SANDBOX_REASONS.imports },
    });
    expect(sandboxWith('await 1;\nexport const a = 1;').loaded).toEqual({
      ok: false,
      failure: { kind: 'threw', message: SANDBOX_REASONS.waits },
    });
  });
});

describe('hostile code', () => {
  it('stops `while (true) {}` past its time, even when it catches, and runs the next call', () => {
    const started = performance.now();
    expect(attributes('while (true) {}')).toMatchObject({ ok: false, failure: { kind: 'time' } });
    expect(attributes('while (true) { try { for (;;) {} } catch (error) {} }')).toMatchObject({
      ok: false,
      failure: { kind: 'time' },
    });
    expect(performance.now() - started).toBeLessThan(2000);
    const { sandbox } = sandboxWith(
      'let first = true;\nexport function attributes() { if (first) { first = false; for (;;) {} } return { again: 1 }; }',
    );
    expect(sandbox.call('gauges', 'attributes', input)).toMatchObject({
      failure: { kind: 'time' },
    });
    expect(sandbox.call('gauges', 'attributes', input)).toMatchObject({
      ok: true,
      answer: { again: 1 },
    });
  });

  it('stops a module that loops as it loads', () => {
    expect(sandboxWith('for (;;) {}\nexport const a = 1;').loaded).toEqual({
      ok: false,
      failure: { kind: 'time' },
    });
  });

  it('stops allocation bombs past 32 MiB, or past their time', () => {
    expect(attributes('return { text: "x".repeat(2 ** 28) };')).toMatchObject({
      ok: false,
      failure: { kind: 'memory' },
    });
    const pushed = attributes('const all = []; for (;;) all.push(new Array(1000).fill(1));');
    expect(pushed.ok).toBe(false);
    expect(['memory', 'time']).toContain(!pushed.ok && pushed.failure.kind);
    const caught = attributes('for (;;) { try { "x".repeat(2 ** 28); } catch (error) {} }');
    expect(caught).toMatchObject({ ok: false, failure: { kind: 'time' } });
    expect(attributes('const big = new ArrayBuffer(64 * 1024 * 1024); return {};')).toMatchObject({
      ok: false,
    });
  });

  it('turns deep recursion into the code’s own error, never the interpreter’s', () => {
    expect(attributes('function f() { return f() + 1; } return { v: f() };')).toMatchObject({
      ok: false,
      failure: { kind: 'threw', message: 'InternalError: stack overflow' },
    });
    // Native recursion the interpreter cannot interrupt: its own stack overflow, or past its time
    // when the machine is slow, but never a failure of the interpreter itself.
    const deep = attributes(
      'let o = {}; let c = o; for (let i = 0; i < 10000; i++) { c.a = {}; c = c.a; } return { n: JSON.stringify(o).length };',
    );
    expect(deep.ok).toBe(false);
    expect(deep).not.toHaveProperty('crashed');
    expect(['threw', 'time']).toContain(!deep.ok && deep.failure.kind);
  });

  it('finds no page, no network, no files, no workers and no host on globalThis', () => {
    const names = [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'window',
      'document',
      'self',
      'navigator',
      'location',
      'localStorage',
      'indexedDB',
      'postMessage',
      'importScripts',
      'Worker',
      'process',
      'require',
      'module',
      'Buffer',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'std',
      'os',
      'WebAssembly',
    ];
    expect(
      answer(
        `return Object.fromEntries(${JSON.stringify(names)}.map((name) => [name, typeof globalThis[name]]));`,
      ),
    ).toEqual(Object.fromEntries(names.map((name) => [name, 'undefined'])));
  });

  it('never loads anything through import()', () => {
    // A promise is no plain answer, and nothing ever settles it.
    expect(attributes('return import("https://example.com/evil.js");')).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it is not plain data' },
    });
    expect(answer('import("./x.js").then(() => {}); return { tried: true };')).toEqual({
      tried: true,
    });
  });

  it('makes no code from text: no eval, and no Function of any kind', () => {
    expect(
      answer('return { eval: typeof eval, indirect: typeof globalThis["ev" + "al"] };'),
    ).toEqual({
      eval: 'undefined',
      indirect: 'undefined',
    });
    for (const make of [
      'Function("return 1")',
      'new Function("return 1")',
      '(function () {}).constructor("return 1")',
      '(() => 1).constructor("return 1")',
      '(async function () {}).constructor("return 1")',
      '(function* () {}).constructor("return 1")',
      '(async function* () {}).constructor("return 1")',
      'Object.getPrototypeOf(function () {}).constructor("return 1")',
    ]) {
      expect(attributes(`return { made: ${make} };`)).toMatchObject({
        ok: false,
        failure: { kind: 'threw', message: 'EvalError: Package code cannot make code from text.' },
      });
    }
    // Functions themselves work as functions do.
    expect(
      answer('const f = function () {}; return { isFunction: f instanceof Function };'),
    ).toEqual({
      isFunction: true,
    });
  });

  it('refuses an answer that would pollute what objects derive from, and pollutes nothing', () => {
    expect(attributes('return JSON.parse(\'{"__proto__": {"polluted": true}}\');')).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it has the key "__proto__"' },
    });
    expect(attributes('return { __proto__: { polluted: true } };')).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it is not plain data' },
    });
    expect(
      answer('Object.prototype.polluted = true; Array.prototype.polluted = true; return { a: 1 };'),
    ).toEqual({ a: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(([] as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses answers far over their caps, or that are not plain data', () => {
    expect(
      attributes(`return { text: "x".repeat(${CODE_LIMITS.answerText + 10}) };`),
    ).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it is over 65536 characters as JSON' },
    });
    expect(
      attributes('let v = 1; for (let i = 0; i < 40; i++) v = [v]; return { v };'),
    ).toMatchObject({
      ok: false,
      failure: { kind: 'answer', reason: 'it nests deeper than 16 levels' },
    });
    for (const value of [
      'new Map()',
      '() => 1',
      'Symbol("s")',
      '1n',
      'NaN',
      '[, 1]',
      'new Proxy({}, {})',
    ]) {
      const outcome = attributes(`return { value: ${value} };`);
      if (value === 'new Proxy({}, {})') {
        // A proxy over a plain object reads as one: what it gives is checked as any answer is.
        expect(outcome).toMatchObject({ ok: true });
      } else {
        expect(outcome).toMatchObject({
          ok: false,
          failure: { kind: 'answer', reason: 'it is not plain data' },
        });
      }
    }
    // A getter that never ends is stopped like any loop.
    expect(attributes('return { get value() { for (;;) {} } };')).toMatchObject({
      ok: false,
      failure: { kind: 'time' },
    });
  });

  it('reads what the code throws without running it past its time: getters and proxies included', () => {
    const notAnError = {
      ok: false,
      failure: { kind: 'threw', message: 'it threw something that is not an error' },
    };
    const started = performance.now();
    // A thrown object whose message is a getter that never ends.
    expect(attributes('throw { get message() { for (;;) {} } };')).toMatchObject(notAnError);
    // An error whose own message is such a getter, and one whose prototype's name is.
    expect(
      attributes(
        'const error = new Error("x"); Object.defineProperty(error, "message", { get() { for (;;) {} } }); throw error;',
      ),
    ).toMatchObject(notAnError);
    expect(
      attributes(
        'Object.defineProperty(Error.prototype, "name", { get() { for (;;) {} } }); throw new Error("x");',
      ),
    ).toMatchObject(notAnError);
    // A proxy, of an error or of anything, whose traps never end.
    const traps =
      '{ get() { for (;;) {} }, getOwnPropertyDescriptor() { for (;;) {} }, getPrototypeOf() { for (;;) {} }, ownKeys() { for (;;) {} } }';
    expect(attributes(`throw new Proxy(new Error("x"), ${traps});`)).toMatchObject(notAnError);
    expect(attributes(`throw new Proxy({}, ${traps});`)).toMatchObject(notAnError);
    // A module that throws such a proxy as it loads.
    const module = `throw new Proxy({}, ${traps});\nexport const a = 1;`;
    expect(sandboxWith(module).loaded).toEqual(notAnError);
    // Plain values thrown read as what they are.
    expect(attributes('throw "plain text";')).toMatchObject({
      failure: { kind: 'threw', message: 'plain text' },
    });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('still tells a call stopped for time when the code hid the name of its errors', () => {
    expect(
      attributes(
        'Object.defineProperty(Object.getPrototypeOf(new InternalError("")), "name", { get() { for (;;) {} } }); for (;;) {}',
      ),
    ).toMatchObject({ ok: false, failure: { kind: 'time' } });
  });

  it('reads an answer with getters inside the call, once, and stops one that never ends', () => {
    expect(answer('let reads = 0; return { get value() { reads += 1; return reads; } };')).toEqual({
      value: 1,
    });
    expect(attributes('return { get value() { for (;;) {} } };')).toMatchObject({
      ok: false,
      failure: { kind: 'time' },
    });
    expect(attributes('return new Proxy({ a: 1 }, { ownKeys() { for (;;) {} } });')).toMatchObject({
      ok: false,
      failure: { kind: 'time' },
    });
    // Intrinsics replaced by the code change nothing of how the answer is written.
    expect(
      answer(
        'JSON.stringify = () => "{}"; Object.keys = () => ["evil"]; Array.prototype.toJSON = () => 1; String.prototype.slice = () => "x"; return { list: [1, 2] };',
      ),
    ).toEqual({ list: [1, 2] });
  });

  it('keeps one package from reaching another', () => {
    const sandbox = new CodeSandbox(engine, { callMs: CALL_MS });
    expect(
      sandbox.load({
        package: 'first',
        code: 'globalThis.secret = 42; Object.prototype.leaked = true; export function attributes() { return { secret: globalThis.secret }; }',
        granted: [],
      }),
    ).toMatchObject({ ok: true });
    expect(
      sandbox.load({
        package: 'second',
        code: 'export function attributes() { return { secret: typeof globalThis.secret, leaked: typeof ({}).leaked, packages: typeof globalThis.first }; }',
        granted: [],
      }),
    ).toMatchObject({ ok: true });
    expect(sandbox.call('first', 'attributes', input)).toMatchObject({ answer: { secret: 42 } });
    expect(sandbox.call('second', 'attributes', input)).toMatchObject({
      answer: { secret: 'undefined', leaked: 'undefined', packages: 'undefined' },
    });
    sandbox.dispose();
  });
});

describe('capabilities', () => {
  it('reads no clock without "time", and dates from given parts all the same', () => {
    for (const read of ['Date.now()', 'new Date()', 'Date()', 'new Date().getTime()']) {
      expect(attributes(`return { now: ${read} };`)).toMatchObject({
        ok: false,
        failure: {
          kind: 'threw',
          message: 'TypeError: Package code reads the clock only with the "time" capability.',
        },
      });
    }
    expect(answer('return { year: new Date(Date.UTC(2020, 0, 1)).getUTCFullYear() };')).toEqual({
      year: 2020,
    });
    const now = answer('return { now: Date.now(), isDate: new Date() instanceof Date };', [
      'time',
    ]) as {
      now: number;
    };
    expect(Math.abs(now.now - Date.now())).toBeLessThan(60_000);
  });

  it('reads the whole model only with "model:read"', () => {
    expect(answer('return { model: typeof context.model };')).toEqual({ model: 'undefined' });
    expect(
      answer(
        'const m = context.model; return { db: m.element("db").name, none: m.element("nope"), frozen: Object.isFrozen(m.element("db")), count: m.elements().length, relations: m.relationsOn("oven").length };',
        ['model:read'],
      ),
    ).toEqual({ db: 'DB', none: null, frozen: true, count: 7, relations: 1 });
  });
});

describe('the limit of a call', () => {
  it('is 50 ms in the app', () => {
    const sandbox = new CodeSandbox(engine);
    sandbox.load({
      package: 'gauges',
      code: 'export function attributes() { for (;;) {} }',
      granted: [],
    });
    const outcome = sandbox.call('gauges', 'attributes', input);
    expect(outcome).toMatchObject({ ok: false, failure: { kind: 'time' } });
    expect(outcome.ms).toBeGreaterThanOrEqual(CODE_LIMITS.callMs);
    sandbox.dispose();
  });
});
