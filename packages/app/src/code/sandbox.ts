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
import { PRELUDE, REFUSED } from './prelude';

/**
 * The stack QuickJS may use, in bytes. Native recursion, such as `JSON.stringify` of a deeply nested
 * value, takes several times more of the engine's own stack than QuickJS counts: past about 128 KiB
 * it reaches the browser's limit before QuickJS's, so this keeps well under it.
 */
export const STACK_BYTES = 48 * 1024;

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
  hooks: Map<HookName, QuickJSHandle>;
  granted: ReadonlySet<Capability>;
  readModel: QuickJSHandle | undefined;
  /** The reader of the call under way, for `model:read`. */
  reader: ModelReader | undefined;
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
      const run = this.prelude(context, request.granted.includes('time'));
      this.deadline = this.now() + this.callMs;
      const evaluated = context.evalCode(request.code, `${request.package}.js`, {
        type: 'module',
        strict: true,
      });
      this.deadline = Infinity;
      if (evaluated.error) {
        const failure = failureOf(context, evaluated.error);
        evaluated.error.dispose();
        run.dispose();
        context.dispose();
        runtime.dispose();
        return { ok: false, failure };
      }
      const namespace = evaluated.value;
      const state = context.getPromiseState(namespace);
      if (state.type !== 'fulfilled' || state.notAPromise !== true) {
        if (state.type === 'fulfilled' && state.value !== namespace) state.value.dispose();
        if (state.type === 'rejected') state.error.dispose();
        namespace.dispose();
        run.dispose();
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
        hooks,
        granted,
        readModel: undefined,
        reader: undefined,
      };
      if (granted.has('model:read')) loaded.readModel = this.modelBridge(loaded);
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
      loaded.run.dispose();
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
   * With `model:read` granted, `context.model` reads the whole model through `reader`.
   */
  call(id: Id, hook: HookName, input: HookInput, reader?: ModelReader): CallOutcome {
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
      const read =
        loaded.readModel !== undefined && reader !== undefined
          ? loaded.readModel
          : context.undefined;
      this.deadline = started + this.callMs;
      const result = context.callFunction(loaded.run, context.undefined, handle, json, limit, read);
      this.deadline = Infinity;
      const ms = this.now() - started;
      if (result.error) {
        const failure = failureOf(context, result.error);
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
      // Its length is read before the text, so that a long one is never copied out.
      const lengthHandle = context.getProp(value, 'length');
      handles.push(lengthHandle);
      const length =
        context.typeof(lengthHandle) === 'number' ? context.getNumber(lengthHandle) : Infinity;
      if (length > CODE_LIMITS.answerText) {
        return {
          ok: false,
          failure: { kind: 'answer', reason: REFUSED[3]?.(CODE_LIMITS.answerText) ?? '' },
          ms,
        };
      }
      return { ok: true, answer: JSON.parse(context.getString(value)) as unknown, ms };
    } catch (error) {
      this.deadline = Infinity;
      this.spent = true;
      return crashedCall(messageOf(error), this.now() - started);
    } finally {
      loaded.reader = undefined;
      if (!this.spent) for (const each of handles) each.dispose();
    }
  }

  /** Forgets every package. The module stays, for a sandbox that takes this one's place. */
  dispose(): void {
    for (const id of [...this.packages.keys()]) this.unload(id);
  }

  /** Runs the prelude in a fresh context, and keeps its `run`. */
  private prelude(context: QuickJSContext, grantTime: boolean): QuickJSHandle {
    this.deadline = Infinity;
    const made = context.evalCode(PRELUDE, 'prelude.js', { type: 'global', strict: true });
    const make = context.unwrapResult(made);
    try {
      const flag = grantTime ? context.true : context.false;
      return context.unwrapResult(
        context.callFunction(make, context.undefined, context.global, flag),
      );
    } finally {
      make.dispose();
    }
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

/** What an error the interpreter threw says: stopped for time or memory, or the code's own error. */
function failureOf(context: QuickJSContext, error: QuickJSHandle): CodeFailure {
  let name = '';
  let message = '';
  try {
    if (context.typeof(error) === 'object') {
      const nameHandle = context.getProp(error, 'name');
      const messageHandle = context.getProp(error, 'message');
      if (context.typeof(nameHandle) === 'string') name = context.getString(nameHandle);
      if (context.typeof(messageHandle) === 'string') message = context.getString(messageHandle);
      nameHandle.dispose();
      messageHandle.dispose();
    } else if (context.typeof(error) === 'string') {
      message = context.getString(error);
    }
  } catch {
    message = 'it threw something that cannot be read';
  }
  if (name === 'InternalError' && message === 'interrupted') return { kind: 'time' };
  if (name === 'InternalError' && message === 'out of memory') return { kind: 'memory' };
  const text = name === '' ? message : message === '' ? name : `${name}: ${message}`;
  return {
    kind: 'threw',
    message: text === '' ? 'it threw nothing that says why' : text.slice(0, 1000),
  };
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
