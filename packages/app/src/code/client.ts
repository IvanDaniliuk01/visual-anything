/**
 * The app's side of the code worker (ADR 0054). The worker starts only when the project has approved
 * package code, and stops when it has none. The main thread never waits on it: it hands over the
 * project, the approved packages and what the open view shows, and keeps what comes back.
 *
 * A worker that stays silent past its watchdog, in work the interpreter cannot stop, such as an
 * allocation that drowns its garbage collector, is stopped and started again: the package it was
 * running counts a call that stopped, and the third in a row turns it off.
 */
import { stalledProblem, type Drawing, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type {
  CodeReply,
  CodeRequest,
  ElementAnswers,
  PackageRun,
  RunPackage,
  WantedAddress,
} from './messages';

/** What the host needs of a worker. */
export interface CodeWorkerLike {
  postMessage(message: CodeRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<CodeReply>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

/** What the worker is to run on. */
export interface CodeInput {
  project: ProjectSnapshot;
  /** The approved packages, with the capabilities granted. */
  packages: Omit<RunPackage, 'stops'>[];
  view: Id | undefined;
  /** The scale the view is drawn at, in steps, for `draw`. */
  scale: number;
  /** The elements the view shows, for `draw`. */
  shown: readonly Id[];
}

/** What package code answered, as the app shows it. */
export interface CodeAnswers {
  readonly elements: ReadonlyMap<Id, ElementAnswers>;
  readonly packages: ReadonlyMap<Id, PackageRun>;
  readonly drawings: ReadonlyMap<Id, Drawing>;
}

export const NO_ANSWERS: CodeAnswers = Object.freeze({
  elements: new Map(),
  packages: new Map(),
  drawings: new Map(),
});

/** How long the worker may stay silent while it works, in milliseconds. */
export const WATCHDOG_MS = 1500;

/**
 * How long a new worker may take to say anything at all: it first makes its interpreter, whose
 * WebAssembly the browser compiles, which on a slow machine takes longer than any call may.
 */
export const STARTING_MS = 15_000;

export interface CodeHostOptions {
  watchdogMs?: number;
  startingMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/** What the host hears of the addresses each package's code wants fetched (ADR 0063). */
export type WantedListener = (pkg: Id, wanted: readonly WantedAddress[]) => void;

/** Starts the code worker. Vite bundles the worker from this exact expression. */
export function startCodeWorker(): CodeWorkerLike {
  return new Worker(new URL('./code.worker.ts', import.meta.url), {
    type: 'module',
    name: 'package code',
  });
}

export class CodeHost {
  private worker: CodeWorkerLike | undefined;
  private input: CodeInput | undefined;
  private sent: { project?: unknown; packages?: string; view?: string } = {};
  /** Calls that stopped in a row, by the hash of the code that made them. */
  private readonly stops = new Map<string, number>();
  private calling: Id | undefined;
  /** Whether the worker under way said anything yet. */
  private heard = false;
  private timer: unknown;
  private answers: CodeAnswers = NO_ANSWERS;
  private readonly listeners = new Set<() => void>();
  private readonly wantedListeners = new Set<WantedListener>();
  private readonly watchdogMs: number;
  private readonly startingMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;

  constructor(
    private readonly start: () => CodeWorkerLike = startCodeWorker,
    options: CodeHostOptions = {},
  ) {
    this.watchdogMs = options.watchdogMs ?? WATCHDOG_MS;
    this.startingMs = options.startingMs ?? STARTING_MS;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  /** Hands over what the worker is to run on; only what changed is sent. */
  update(input: CodeInput): void {
    this.input = input;
    if (input.packages.length === 0) {
      this.stop();
      if (this.answers !== NO_ANSWERS) this.change(NO_ANSWERS);
      return;
    }
    const worker = this.ensure();
    if (this.sent.project !== input.project) {
      this.sent.project = input.project;
      this.post(worker, { kind: 'project', project: input.project });
    }
    const packages = input.packages.map((each) => ({
      ...each,
      stops: this.stops.get(each.hash) ?? 0,
    }));
    const packagesKey = JSON.stringify(
      packages.map((each) => [each.package, each.hash, each.granted, each.stops]),
    );
    if (this.sent.packages !== packagesKey) {
      this.sent.packages = packagesKey;
      this.post(worker, { kind: 'packages', packages });
    }
    const viewKey = JSON.stringify([input.view ?? null, input.scale, input.shown]);
    if (this.sent.view !== viewKey) {
      this.sent.view = viewKey;
      this.post(worker, {
        kind: 'view',
        view: input.view,
        scale: input.scale,
        shown: [...input.shown],
      });
    }
  }

  /** What the worker answered so far: the same object until something changes. */
  current(): CodeAnswers {
    return this.answers;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Calls `listener` with every address a package's code wants fetched, whenever that changes. */
  onWanted(listener: WantedListener): () => void {
    this.wantedListeners.add(listener);
    return () => {
      this.wantedListeners.delete(listener);
    };
  }

  /** Hands the worker what the local program fetched for a package, or why it did not. */
  fetched(request: Extract<CodeRequest, { kind: 'fetched' }>): void {
    if (this.worker) this.post(this.worker, request);
  }

  /** Stops the worker for good. */
  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.wantedListeners.clear();
  }

  private ensure(): CodeWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.start();
    worker.addEventListener('message', (event) => {
      if (this.worker === worker) this.receive(event.data);
    });
    worker.addEventListener('error', () => {
      if (this.worker === worker) this.restart();
    });
    this.worker = worker;
    this.heard = false;
    this.sent = {};
    return worker;
  }

  private post(worker: CodeWorkerLike, request: CodeRequest): void {
    worker.postMessage(request);
    this.arm();
  }

  private receive(reply: CodeReply): void {
    this.heard = true;
    if (reply.kind === 'network') {
      for (const listener of [...this.wantedListeners]) listener(reply.package, reply.wanted);
      return;
    }
    if (reply.kind === 'idle') {
      this.disarm();
      this.calling = undefined;
      return;
    }
    this.arm();
    this.calling = reply.calling;
    if (reply.elements.length === 0 && reply.cleared.length === 0 && reply.packages.length === 0) {
      return;
    }
    const elements = new Map(this.answers.elements);
    const drawings = new Map(this.answers.drawings);
    for (const each of reply.cleared) {
      elements.delete(each);
      drawings.delete(each);
    }
    for (const each of reply.elements) {
      elements.set(each.element, each);
      if (each.drawing) drawings.set(each.element, each.drawing);
      else drawings.delete(each.element);
    }
    const packages = new Map(this.answers.packages);
    for (const each of reply.packages) {
      packages.set(each.package, each);
      const hash = this.hashOf(each.package);
      if (hash !== undefined) this.stops.set(hash, each.stops);
    }
    this.change({
      elements,
      packages,
      drawings: drawingsChanged(this.answers.drawings, drawings) ? drawings : this.answers.drawings,
    });
  }

  /** A worker that went silent: stopped, the package it ran counted, and started again. */
  private restart(): void {
    const blamed = this.calling;
    this.stop();
    if (blamed !== undefined) {
      const hash = this.hashOf(blamed);
      const named = this.input?.packages.find((each) => each.package === blamed);
      if (hash !== undefined && named) {
        const stops = (this.stops.get(hash) ?? 0) + 1;
        this.stops.set(hash, stops);
        const packages = new Map(this.answers.packages);
        const before = packages.get(blamed);
        packages.set(blamed, {
          package: blamed,
          state: before?.state ?? 'running',
          hooks: before?.hooks ?? [],
          problem: stalledProblem({ id: blamed, name: named.name }),
          stops,
        });
        this.change({ ...this.answers, packages });
      }
    }
    if (this.input) this.update(this.input);
  }

  private stop(): void {
    this.disarm();
    const had = this.worker !== undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.sent = {};
    this.calling = undefined;
    // A worker that stops wants nothing fetched any longer; one started again says what it wants.
    if (had) {
      for (const each of this.input?.packages ?? []) {
        for (const listener of [...this.wantedListeners]) listener(each.package, []);
      }
    }
  }

  private arm(): void {
    this.disarm();
    this.timer = this.setTimer(
      () => {
        this.timer = undefined;
        this.restart();
      },
      this.heard ? this.watchdogMs : this.startingMs,
    );
  }

  private disarm(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private hashOf(id: Id): string | undefined {
    return this.input?.packages.find((each) => each.package === id)?.hash;
  }

  private change(answers: CodeAnswers): void {
    this.answers = answers;
    for (const listener of [...this.listeners]) listener();
  }
}

function drawingsChanged(
  before: ReadonlyMap<Id, Drawing>,
  after: ReadonlyMap<Id, Drawing>,
): boolean {
  if (before.size !== after.size) return true;
  for (const [id, drawing] of after) if (before.get(id) !== drawing) return true;
  return false;
}
