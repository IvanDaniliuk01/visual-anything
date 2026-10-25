/**
 * The sandbox package code runs in (ADR 0054, ADR 0012): QuickJS compiled to WebAssembly, with one
 * runtime and one context for each package, so that packages cannot see each other. A call stops
 * past 50 ms or past 32 MiB for its package's runtime; the code has no module to import, no code made
 * from text, no clock unless granted, and nothing of the page, the network or the files at all.
 *
 * It runs wherever it is given a QuickJS module: in the app's code worker, and in Claude's tools. It
 * knows nothing of projects: it is handed the code, the capabilities granted and each hook's input,
 * and hands back what the code answered, parsed from JSON and not yet checked by the core.
 */
import type { CodeFailure, HookInput, HookName, ModelReader } from '@visual-anything/core';
import { CODE_LIMITS, HOOK_NAMES } from '@visual-anything/core';
import type { Capability, Id } from '@visual-anything/schema';
import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import { NOT_AN_ERROR, PRELUDE, REFUSED } from './prelude';

/**
 * The stack QuickJS may use, in bytes. Native recursion, such as `JSON.stringify` of a deeply nested
 * value, takes several times more of the engine's own stack than QuickJS counts: past about 128 KiB
 * it reaches the browser's limit before QuickJS's, so this keeps well under it.
 */
export const STACK_BYTES = 48 * 1024;

/**
 * Runs code of its own once in a new module, so that the browser or Node has compiled the
 * interpreter's WebAssembly before any package's call is timed: a cold interpreter can take longer
 * than a call may on its first runs. Gives back the module.
 */
export function warmedUp(module: QuickJSWASMModule): QuickJSWASMModule {
  const runtime = module.newRuntime();
  try {
    const context = runtime.newContext();
    try {
      for (let round = 0; round < 3; round += 1) {
        const result = context.evalCode(
          'let s = 0; for (let i = 0; i < 20000; i++) { s += JSON.stringify({ i, a: [i] }).length; } JSON.parse(JSON.stringify({ s })).s',
        );
        if (result.error) result.error.dispose();
        else result.value.dispose();
      }
    } finally {
      context.dispose();
    }
  } finally {
    runtime.dispose();
  }
  return module;
}

/**
 * What the code of a package granted an origin reads of the network in one call of `attributes`
 * (ADR 0063): what the local program last fetched from an address, nothing yet, or why the address
 * may not be fetched.
 */
export interface NetworkReader {
  fetched(
    url: string,
    everySeconds: number,
  ):
    | { kind: 'answer'; status: number; text: string }
    | { kind: 'refused'; reason: string }
    | { kind: 'not-yet' };
}

/** The code of one package, as the sandbox loads it. */
export interface LoadRequest {
  package: Id;
  /** The module's text. */
  code: string;
  /** The capabilities the person granted it. */
  granted: readonly Capability[];
}

/** How loading a package's module ended. */
export type LoadOutcome =
  { ok: true; hooks: HookName[] } | { ok: false; failure: CodeFailure; crashed?: true };

/** How one call ended: what the code answered, or why there is no answer. */
export type CallOutcome =
  | { ok: true; answer: unknown; ms: number }
  | {
      ok: false;
      failure: CodeFailure;
      ms: number;
      /** The interpreter itself failed: the sandbox is spent, and a new one must take its place. */
      crashed?: true;
    };

interface Loaded {
  runtime: QuickJSRuntime;
  context: QuickJSContext;
  run: QuickJSHandle;
  describe: QuickJSHandle;
  hooks: Map<HookName, QuickJSHandle>;
  granted: ReadonlySet<Capability>;
  readModel: QuickJSHandle | undefined;
  /** The reader of the call under way, for `model:read`. */
  reader: ModelReader | undefined;
  /** What `context.fetched` reads through, for a package granted an origin. */
  readNetwork: QuickJSHandle | undefined;
  /** The network reader of the call under way. */
  network: NetworkReader | undefined;
}

export interface SandboxOptions {
  /** The clock calls are timed by; `performance.now()` by default. */
  now?: () => number;
  /** How long one call may run, in milliseconds; 50 by default. */
  callMs?: number;
}

/** Runs the code of packages, one runtime each, in one QuickJS module. */
export class CodeSandbox {
  private readonly packages = new Map<Id, Loaded>();
  private readonly now: () => number;
  private readonly callMs: number;
  private deadline = Infinity;
  private spent = false;

  constructor(
    private readonly module: QuickJSWASMModule,
    options: SandboxOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.callMs = options.callMs ?? CODE_LIMITS.callMs;
  }

  /** Whether the interpreter failed, so that nothing more can run here. */
  get crashed(): boolean {
    return this.spent;
  }

  /** The packages loaded, by id. */
  get loaded(): Id[] {
    return [...this.packages.keys()];
  }

  /** Loads a package's module in a runtime of its own, in place of any loaded before for it. */
  load(request: LoadRequest): LoadOutcome {
    this.unload(request.package);
    if (this.spent) return crashedLoad('The interpreter stopped working.');
    let runtime: QuickJSRuntime | undefined;
    try {
      runtime = this.module.newRuntime();
      runtime.setMemoryLimit(CODE_LIMITS.memoryBytes);
      runtime.setMaxStackSize(STACK_BYTES);
      runtime.setInterruptHandler(() => this.now() > this.deadline);
      runtime.setModuleLoader(() => ({
        error: new Error('Package code imports nothing: it is one module on its own.'),
      }));
      const context = runtime.newContext();
      const { run, describe } = this.prelude(context, request.granted.includes('time'));
      this.deadline = this.now() + this.callMs;
      const evaluated = context.evalCode(request.code, `${request.package}.js`, {
        type: 'module',
        strict: true,
      });
      if (evaluated.error) {
        const failure = this.thrownFailure(context, describe, evaluated.error);
        this.deadline = Infinity;
        evaluated.error.dispose();
        run.dispose();
        describe.dispose();
        context.dispose();
        runtime.dispose();
        return { ok: false, failure };
      }
      this.deadline = Infinity;
      const namespace = evaluated.value;
      const state = context.getPromiseState(namespace);
      if (state.type !== 'fulfilled' || state.notAPromise !== true) {
        if (state.type === 'fulfilled' && state.value !== namespace) state.value.dispose();
        if (state.type === 'rejected') state.error.dispose();
        namespace.dispose();
        run.dispose();
        describe.dispose();
        context.dispose();
        runtime.dispose();
        return {
          ok: false,
          failure: {
            kind: 'threw',
            message: 'Package code may not wait at the top of its module.',
          },
        };
      }
      const hooks = new Map<HookName, QuickJSHandle>();
      for (const name of HOOK_NAMES) {
        const hook = context.getProp(namespace, name);
        if (context.typeof(hook) === 'function') hooks.set(name, hook);
        else hook.dispose();
      }
      namespace.dispose();
      const granted = new Set(request.granted);
      const loaded: Loaded = {
        runtime,
        context,
        run,
        describe,
        hooks,
        granted,
        readModel: undefined,
        reader: undefined,
        readNetwork: undefined,
        network: undefined,
      };
      if (granted.has('model:read')) loaded.readModel = this.modelBridge(loaded);
      if ([...granted].some((each) => each.startsWith('network:'))) {
        loaded.readNetwork = this.networkBridge(loaded);
      }
      this.packages.set(request.package, loaded);
      return { ok: true, hooks: [...hooks.keys()] };
    } catch (error) {
      this.deadline = Infinity;
      this.spent = true;
      try {
        runtime?.dispose();
      } catch {
        // The interpreter is spent: what it held goes with it.
      }
      return crashedLoad(messageOf(error));
    }
  }

  /** Forgets a package's runtime and everything in it. */
  unload(id: Id): void {
    const loaded = this.packages.get(id);
    if (!loaded) return;
    this.packages.delete(id);
    if (this.spent) return;
    try {
      for (const hook of loaded.hooks.values()) hook.dispose();
      loaded.readModel?.dispose();
      loaded.readNetwork?.dispose();
      loaded.run.dispose();
      loaded.describe.dispose();
      loaded.context.dispose();
      loaded.runtime.dispose();
    } catch {
      this.spent = true;
    }
  }

  /** The hooks a loaded package exports. */
  hooksOf(id: Id): HookName[] {
    return [...(this.packages.get(id)?.hooks.keys() ?? [])];
  }

  /**
   * Calls one hook of a loaded package with a frozen copy of its input: `hook(element, context)`.
   * With `model:read` granted, `context.model` reads the whole model through `reader`; with an origin
   * granted, `context.fetched` reads what was fetched through `network`, in `attributes` only.
   */
  call(
    id: Id,
    hook: HookName,
    input: HookInput,
    reader?: ModelReader,
    network?: NetworkReader,
  ): CallOutcome {
    const started = this.now();
    const loaded = this.packages.get(id);
    const handle = loaded?.hooks.get(hook);
    if (!loaded || !handle) {
      return {
        ok: false,
        failure: { kind: 'threw', message: `The package exports no ${hook}.` },
        ms: 0,
      };
    }
    if (this.spent) return crashedCall('The interpreter stopped working.', 0);
    const { context } = loaded;
    const handles: QuickJSHandle[] = [];
    try {
      const json = context.newString(JSON.stringify([input.element, input.context]));
      handles.push(json);
      const limit = context.newNumber(CODE_LIMITS.answerText);
      handles.push(limit);
      loaded.reader = reader;
      loaded.network = network;
      const read =
        loaded.readModel !== undefined && reader !== undefined
          ? loaded.readModel
          : context.undefined;
      const readNetwork =
        loaded.readNetwork !== undefined && network !== undefined && hook === 'attributes'
          ? loaded.readNetwork
          : context.undefined;
      // The deadline stays in force until everything is read back: whatever reads a value the code
      // made runs inside `run`, and a getter or a proxy trap that never ends is stopped there.
      this.deadline = started + this.callMs;
      const result = context.callFunction(
        loaded.run,
        context.undefined,
        handle,
        json,
        limit,
        read,
        readNetwork,
      );
      const ms = this.now() - started;
      if (result.error) {
        // Only what the interpreter itself throws gets past `run`: it was stopped, or ran out.
        const failure = escapedFailure(context, result.error);
        result.error.dispose();
        return { ok: false, failure, ms };
      }
      const value = result.value;
      handles.push(value);
      // A call that ran past its time, in code the interpreter could not stop, stops all the same.
      if (ms > this.callMs) return { ok: false, failure: { kind: 'time' }, ms };
      const type = context.typeof(value);
      if (type === 'number') {
        const code = context.getNumber(value);
        const reason = REFUSED[code]?.(CODE_LIMITS.answerText) ?? 'it is not plain data';
        return { ok: false, failure: { kind: 'answer', reason }, ms };
      }
      if (type !== 'string') {
        return { ok: false, failure: { kind: 'answer', reason: 'it is not plain data' }, ms };
      }
      // A primitive string: its length is read before its text, so a long one is never copied out.
      const length = lengthOf(context, value, handles);
      if (length > CODE_LIMITS.answerText + 1 + LONGEST_DESCRIPTION) {
        return {
          ok: false,
          failure: { kind: 'answer', reason: REFUSED[3]?.(CODE_LIMITS.answerText) ?? '' },
          ms,
        };
      }
      const text = context.getString(value);
      if (text.startsWith('E')) return { ok: false, failure: describedFailure(text.slice(1)), ms };
      if (!text.startsWith('A') || text.length - 1 > CODE_LIMITS.answerText) {
        return {
          ok: false,
          failure: { kind: 'answer', reason: REFUSED[3]?.(CODE_LIMITS.answerText) ?? '' },
          ms,
        };
      }
      return { ok: true, answer: JSON.parse(text.slice(1)) as unknown, ms };
    } catch (error) {
      this.deadline = Infinity;
      this.spent = true;
      return crashedCall(messageOf(error), this.now() - started);
    } finally {
      this.deadline = Infinity;
      loaded.reader = undefined;
      loaded.network = undefined;
      if (!this.spent) for (const each of handles) each.dispose();
    }
  }

  /**
   * What a value the module threw as it loaded is, as `describe` reads it inside the interpreter,
   * under a short deadline of its own: past it, the value counts as having stopped for time.
   */
  private thrownFailure(
    context: QuickJSContext,
    describe: QuickJSHandle,
    thrown: QuickJSHandle,
  ): CodeFailure {
    // Whatever the module threw, the engine's interrupt included, is read inside the interpreter.
    this.deadline = this.now() + DESCRIBE_MS;
    const described = context.callFunction(describe, context.undefined, thrown);
    if (described.error) {
      const failure = escapedFailure(context, described.error);
      described.error.dispose();
      return failure.kind === 'memory' ? failure : { kind: 'time' };
    }
    const handles: QuickJSHandle[] = [described.value];
    try {
      if (context.typeof(described.value) !== 'string') return notAnError();
      if (lengthOf(context, described.value, handles) > 1 + 2 * LONGEST_DESCRIPTION + 16) {
        return notAnError();
      }
      return describedFailure(context.getString(described.value));
    } finally {
      for (const each of handles) each.dispose();
    }
  }

  /** Forgets every package. The module stays, for a sandbox that takes this one's place. */
  dispose(): void {
    for (const id of [...this.packages.keys()]) this.unload(id);
  }

  /**
   * Runs the prelude in a fresh context, before any of the package's code, and keeps its `run` and
   * its `describe`.
   */
  private prelude(
    context: QuickJSContext,
    grantTime: boolean,
  ): { run: QuickJSHandle; describe: QuickJSHandle } {
    this.deadline = Infinity;
    const made = context.evalCode(PRELUDE, 'prelude.js', { type: 'global', strict: true });
    const make = context.unwrapResult(made);
    try {
      const flag = grantTime ? context.true : context.false;
      const pair = context.unwrapResult(
        context.callFunction(make, context.undefined, context.global, flag),
      );
      try {
        return { run: context.getProp(pair, 0), describe: context.getProp(pair, 1) };
      } finally {
        pair.dispose();
      }
    } finally {
      make.dispose();
    }
  }

  /**
   * The function through which `context.fetched` reads what the local program fetched, for a package
   * granted an origin: `A` and the answer's JSON, `R` and why not, or nothing yet.
   */
  private networkBridge(loaded: Loaded): QuickJSHandle {
    const { context } = loaded;
    return context.newFunction('readNetwork', (urlHandle, everyHandle) => {
      const url = context.typeof(urlHandle) === 'string' ? context.getString(urlHandle) : '';
      const every =
        everyHandle !== undefined && context.typeof(everyHandle) === 'number'
          ? context.getNumber(everyHandle)
          : 0;
      const read = loaded.network?.fetched(url, every) ?? { kind: 'not-yet' as const };
      const text =
        read.kind === 'answer'
          ? `A${JSON.stringify({ status: read.status, text: read.text })}`
          : read.kind === 'refused'
            ? `R${read.reason}`
            : '';
      return context.newString(text);
    });
  }

  /** The function through which `context.model` reads the model, for `model:read`. */
  private modelBridge(loaded: Loaded): QuickJSHandle {
    const { context } = loaded;
    return context.newFunction('readModel', (kindHandle, argHandle) => {
      const kind = context.typeof(kindHandle) === 'string' ? context.getString(kindHandle) : '';
      const arg =
        argHandle !== undefined && context.typeof(argHandle) === 'string'
          ? context.getString(argHandle)
          : undefined;
      const reader = loaded.reader;
      let value: unknown = null;
      if (reader !== undefined) {
        if (kind === 'element') value = arg === undefined ? null : reader.element(arg);
        else if (kind === 'relation') value = arg === undefined ? null : reader.relation(arg);
        else if (kind === 'elements') value = reader.elements(arg);
        else if (kind === 'relationsOn') value = arg === undefined ? [] : reader.relationsOn(arg);
      }
      return context.newString(JSON.stringify(value));
    });
  }
}

/** How long `describe` may take to read what a module threw as it loaded, in milliseconds. */
const DESCRIBE_MS = 5;

/** The longest name or message `describe` gives, as the prelude cuts them. */
const LONGEST_DESCRIPTION = 1000;

/** The length of a primitive string, read without running anything: strings' own length. */
function lengthOf(context: QuickJSContext, text: QuickJSHandle, handles: QuickJSHandle[]): number {
  const length = context.getProp(text, 'length');
  handles.push(length);
  return context.typeof(length) === 'number' ? context.getNumber(length) : Infinity;
}

/**
 * What got past `run`, which catches whatever the code can throw: what only the interpreter throws,
 * stopping the code for time or because it ran out of memory. Only the message is read, which the
 * engine sets on the error as its own data, never the name, which a prototype could hide behind a
 * getter; a value of any other kind reads as something that is not an error.
 */
function escapedFailure(context: QuickJSContext, error: QuickJSHandle): CodeFailure {
  if (context.typeof(error) !== 'object') return notAnError();
  const message = context.getProp(error, 'message');
  try {
    if (context.typeof(message) !== 'string') return notAnError();
    const text = context.getString(message);
    if (text === 'interrupted') return { kind: 'time' };
    if (text === 'out of memory') return { kind: 'memory' };
    return { kind: 'threw', message: text.slice(0, LONGEST_DESCRIPTION) };
  } finally {
    message.dispose();
  }
}

/** What `describe` said of a thrown value: stopped for time or memory, or the code's own error. */
function describedFailure(described: string): CodeFailure {
  if (!described.startsWith('M')) return notAnError();
  let parts: unknown;
  try {
    parts = JSON.parse(`[${described.slice(1)}]`);
  } catch {
    return notAnError();
  }
  if (!Array.isArray(parts) || parts.length !== 2) return notAnError();
  const [name, message] = parts as unknown[];
  if (typeof name !== 'string' || typeof message !== 'string') return notAnError();
  if (name === 'InternalError' && message === 'interrupted') return { kind: 'time' };
  if (name === 'InternalError' && message === 'out of memory') return { kind: 'memory' };
  const text = name === '' ? message : message === '' ? name : `${name}: ${message}`;
  return { kind: 'threw', message: text === '' ? 'it threw nothing that says why' : text };
}

function notAnError(): CodeFailure {
  return { kind: 'threw', message: NOT_AN_ERROR };
}

function crashedLoad(why: string): LoadOutcome {
  return {
    ok: false,
    failure: { kind: 'threw', message: `The interpreter failed: ${why}` },
    crashed: true,
  };
}

function crashedCall(why: string, ms: number): CallOutcome {
  return {
    ok: false,
    failure: { kind: 'threw', message: `The interpreter failed: ${why}` },
    ms,
    crashed: true,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
