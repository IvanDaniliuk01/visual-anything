/**
 * The app's side of the code worker (ADR 0054). The worker starts only when the project has approved
 * package code, and stops when it has none. The main thread never waits on it: it hands over the
 * project, the approved packages and what the open view shows, and keeps what comes back.
 *
 * A worker that stays silent past its watchdog, in work the interpreter cannot stop, such as an
 * allocation that drowns its garbage collector, is stopped and started again: the package it was
 * running counts a call that stopped, and the third in a row turns it off.
 *
 * It also asks the worker for the hooks that add to the app (ADR 0089), through {@link PackageCalls}:
 * each call answers once, with what the code answered, checked by the core, or with the problem that
 * names the package and the hook. While one of them runs, the worker runs nothing else, for up to its
 * time, so the watchdog waits that much longer.
 */
import {
  CODE_LIMITS,
  callMsOf,
  fileTooLongProblem,
  notApprovedProblem,
  stalledProblem,
  type ActionInput,
  type Drawing,
  type ExportFileInput,
  type ExtensionHookName,
  type ImportFileInput,
  type Named,
  type PanelBlock,
  type PanelInput,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type {
  CodeReply,
  CodeRequest,
  ElementAnswers,
  ExtensionCall,
  ExtensionValues,
  PackageAnswer,
  PackageCodeChanges,
  PackageRun,
  RunPackage,
  WantedAddress,
} from './messages';
import type { SimulationReply, SimulationRequest } from '../simulation/messages';

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

/** Hears what the worker says of simulation runs (ADR 0085). */
export type SimulationListener = (reply: SimulationReply) => void;

/**
 * How the app runs what package code adds to it (ADR 0089): an action, an importer, an exporter or
 * a panel of one package, by the id its file declares. Each answers once, never throws, and is never
 * retried: what the code answered, checked by the core, or the problem naming the package and the
 * hook, for a notice. Only approved code runs, and only what its file declares; while `act`,
 * `importFile` or `exportFile` runs, for up to 2 s, the canvas's hooks wait.
 */
export interface PackageCalls {
  /** Runs an action on a selection: the changes it proposes, for the person's review. */
  runPackageAction(pkg: Id, input: ActionInput): Promise<PackageAnswer<PackageCodeChanges>>;
  /** Reads a file's text with one of the package's importers: the changes that build it, for review. */
  readFileWithPackage(pkg: Id, input: ImportFileInput): Promise<PackageAnswer<PackageCodeChanges>>;
  /** Writes a view, or the model, with one of the package's exporters: the file's text. */
  writeFileWithPackage(pkg: Id, input: ExportFileInput): Promise<PackageAnswer<string>>;
  /** One of the package's panels for an element: the blocks the inspector draws. */
  packagePanel(pkg: Id, input: PanelInput): Promise<PackageAnswer<PanelBlock[]>>;
}

/** A call of a hook that adds to the app, sent and not answered yet. */
interface PendingCall {
  pkg: Id;
  call: ExtensionCall;
  resolve: (answer: PackageAnswer<ExtensionValues[ExtensionHookName]>) => void;
}

/** Starts the code worker. Vite bundles the worker from this exact expression. */
export function startCodeWorker(): CodeWorkerLike {
  return new Worker(new URL('./code.worker.ts', import.meta.url), {
    type: 'module',
    name: 'package code',
  });
}

export class CodeHost implements PackageCalls {
  private worker: CodeWorkerLike | undefined;
  /** The calls of the hooks that add to the app not answered yet, by their number. */
  private readonly calls = new Map<number, PendingCall>();
  private lastCall = 0;
  /** The call the worker said it runs now, until it answers. */
  private runningCall: number | undefined;
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
  private readonly simulationListeners = new Set<SimulationListener>();
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
      this.settleCalls();
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

  /**
   * Asks the worker to start, work out, run from a tick or close a simulation run (ADR 0085). Without
   * a worker, which runs only while some package code is approved, it is not asked, and it answers
   * false: no code that could simulate runs.
   */
  simulate(request: SimulationRequest): boolean {
    if (!this.worker) return false;
    this.post(this.worker, request);
    return true;
  }

  /** Calls `listener` with everything the worker says of simulation runs, and when it restarted. */
  onSimulation(listener: SimulationListener): () => void {
    this.simulationListeners.add(listener);
    return () => {
      this.simulationListeners.delete(listener);
    };
  }

  /** Hands the worker what the local program fetched for a package, or why it did not. */
  fetched(request: Extract<CodeRequest, { kind: 'fetched' }>): void {
    if (this.worker) this.post(this.worker, request);
  }

  runPackageAction(pkg: Id, input: ActionInput): Promise<PackageAnswer<PackageCodeChanges>> {
    return this.callPackage(pkg, { hook: 'act', input });
  }

  readFileWithPackage(pkg: Id, input: ImportFileInput): Promise<PackageAnswer<PackageCodeChanges>> {
    return this.callPackage(pkg, { hook: 'importFile', input });
  }

  writeFileWithPackage(pkg: Id, input: ExportFileInput): Promise<PackageAnswer<string>> {
    return this.callPackage(pkg, { hook: 'exportFile', input });
  }

  packagePanel(pkg: Id, input: PanelInput): Promise<PackageAnswer<PanelBlock[]>> {
    return this.callPackage(pkg, { hook: 'panel', input });
  }

  /**
   * Asks the worker for one call of a hook that adds to the app. Refused at once when the package's
   * code is not among the approved ones, and so no worker runs it, or when the file is longer than
   * an importer is given, which is never sent.
   */
  private callPackage<H extends ExtensionHookName>(
    pkg: Id,
    asked: Extract<ExtensionCall, { hook: H }>,
  ): Promise<PackageAnswer<ExtensionValues[H]>> {
    const call: ExtensionCall = asked;
    return new Promise((resolve) => {
      const named = this.namedOf(pkg);
      const approved = this.input?.packages.find((each) => each.package === pkg);
      if (!this.worker || !approved) {
        resolve({ ok: false, problem: notApprovedProblem(named) });
        return;
      }
      if (call.hook === 'importFile' && call.input.text.length > CODE_LIMITS.importText) {
        const { importer, name } = call.input;
        const label = approved.extensions?.importers?.find((each) => each.id === importer)?.label;
        const what = { id: importer, name: label ?? importer };
        resolve({ ok: false, problem: fileTooLongProblem(named, what, name) });
        return;
      }
      this.lastCall += 1;
      const number = this.lastCall;
      this.calls.set(number, {
        pkg,
        call,
        resolve: resolve as PendingCall['resolve'],
      });
      this.post(this.worker, { kind: 'extension/call', call: number, package: pkg, ...call });
    });
  }

  /** Answers every call not answered yet: the code that would run them no longer runs. */
  private settleCalls(): void {
    const pending = [...this.calls.values()];
    this.calls.clear();
    this.runningCall = undefined;
    for (const each of pending) {
      each.resolve({ ok: false, problem: notApprovedProblem(this.namedOf(each.pkg)) });
    }
  }

  /** A package as messages name it: by its name among the approved ones, or the project's. */
  private namedOf(pkg: Id): Named {
    const name =
      this.input?.packages.find((each) => each.package === pkg)?.name ??
      this.input?.project.packages.find((each) => each.id === pkg)?.name;
    return { id: pkg, name: name ?? pkg };
  }

  /** Stops the worker for good. */
  dispose(): void {
    this.stop();
    this.settleCalls();
    this.listeners.clear();
    this.wantedListeners.clear();
    this.simulationListeners.clear();
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
    if (reply.kind === 'simulation/ticks' || reply.kind === 'simulation/unavailable') {
      this.arm();
      for (const listener of [...this.simulationListeners]) listener(reply);
      return;
    }
    if (reply.kind === 'simulation/restarted') return;
    if (reply.kind === 'extension/running') {
      // Nothing else runs in the worker until it answers, for up to the hook's time.
      this.calling = reply.package;
      this.runningCall = reply.call;
      this.arm(callMsOf(reply.hook) + this.watchdogMs);
      return;
    }
    if (reply.kind === 'extension/answer') {
      if (this.runningCall === reply.call) this.runningCall = undefined;
      const pending = this.calls.get(reply.call);
      this.calls.delete(reply.call);
      this.arm();
      pending?.resolve(reply.answer);
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
    const stalled = this.runningCall;
    this.runningCall = undefined;
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
    // The call that kept the worker silent is answered with that; the others go to the new worker.
    const pending = stalled === undefined ? undefined : this.calls.get(stalled);
    if (stalled !== undefined) this.calls.delete(stalled);
    pending?.resolve({ ok: false, problem: stalledProblem(this.namedOf(pending.pkg)) });
    if (this.input) this.update(this.input);
    const worker = this.worker;
    if (worker) {
      for (const [call, each] of this.calls) {
        this.post(worker, { kind: 'extension/call', call, package: each.pkg, ...each.call });
      }
    }
    for (const listener of [...this.simulationListeners])
      listener({ kind: 'simulation/restarted' });
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

  /** Starts the watchdog again: the worker's own time, a new worker's, or the time given. */
  private arm(ms?: number): void {
    this.disarm();
    this.timer = this.setTimer(
      () => {
        this.timer = undefined;
        this.restart();
      },
      ms ?? (this.heard ? this.watchdogMs : this.startingMs),
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
