/**
 * What the code worker does (ADR 0054): it keeps the project, loads the approved packages in the
 * sandbox, and runs each package's hooks on the elements created from its components, again only for
 * an element whose input changed. It works a slice at a time, telling the app what changed and which
 * package it runs, so that the app knows it is alive; and it turns off a package whose calls stopped
 * three times in a row, until the project opens again. Nothing here touches the page.
 *
 * For a package granted an origin (ADR 0063), `attributes` reads through `context.fetched` what the
 * local program fetched for it: the runner says which addresses each package wants, the app has them
 * fetched and hands back what came, and the elements that read an address are called again when its
 * answer changes. What such a call answers is a live value, not a computed one: the app sends it to
 * the program, as the package's.
 *
 * It also plays simulation runs (ADR 0085), through a `SimulationDriver` it owns: the tab's requests
 * go to the driver, and the runs' ticks are worked out in slices of their own, taking turns with the
 * hooks' slices whenever both have work, so that neither waits on the other. A call of `simulate`
 * keeps every limit a hook's call keeps, and a failure of the code in it counts towards turning its
 * package off as a stopped call does; a stop at a limit, at its ticks or by itself does not.
 */
import {
  CODE_LIMITS,
  LIVE_FETCH_LIMITS,
  LIVE_LIMITS,
  callProblem,
  checkFetchAddress,
  checkAttributesAnswer,
  checkDrawAnswer,
  checkProblemsAnswer,
  checkedProblem,
  codeHash,
  codePackagesOn,
  hookInputOf,
  imagesIn,
  loadProblem,
  modelReaderOf,
  notApprovedProblem,
  offProblem,
  type Drawing,
  type HookName,
  type ModelReader,
  type Problem,
  type ProjectSnapshot,
  type RunBudget,
  type CodeFailure,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { SimulationDriver, type SimulateOutcome, type SimulationHost } from '../simulation/driver';
import type { SimulationReply, SimulationRequest } from '../simulation/messages';
import type {
  CodeReply,
  CodeRequest,
  ComputedValue,
  ElementAnswers,
  FetchedResponse,
  PackageRun,
  RunPackage,
  WantedAddress,
} from './messages';
import { exportsNo, type CodeSandbox, type NetworkReader } from './sandbox';

/** What one hook of one package answered for one element, kept until its input changes. */
interface HookResult {
  /** What it was called with: the package's hash, the model for `model:read`, and its input. */
  key: string;
  attributes?: ComputedValue[];
  problems: Problem[];
  drawing?: Drawing;
  /** The addresses the call read through `context.fetched`: the version of each it read, and how often it asked. */
  reads?: Map<string, { version: number; every: number }>;
  /** Whether what it answered was made of what was fetched: live values, not computed ones. */
  live?: { freshFor: number };
}

/** An address a package's code reads: what the program last fetched from it, and its version. */
interface Fetched {
  version: number;
  response?: FetchedResponse;
}

interface Running {
  request: RunPackage;
  run: PackageRun;
}

export interface RunnerOptions {
  /** Makes a sandbox with a fresh interpreter: at the start, and after one fails. */
  newSandbox: () => Promise<CodeSandbox>;
  /** Tells the app. */
  post: (reply: CodeReply) => void;
  now?: () => number;
  /** Lets the messages that came in meanwhile be read; a macrotask by default. */
  pause?: () => Promise<void>;
  /** How long a slice of work runs before it tells the app and lets messages in, in milliseconds. */
  sliceMs?: number;
  /** For tests: smaller budgets for what simulation runs keep than the limits'. */
  simulationBudget?: Partial<RunBudget>;
}

export class CodeRunner {
  private project: ProjectSnapshot | undefined;
  private requested: RunPackage[] = [];
  private view: { view: Id | undefined; scale: number; shown: ReadonlySet<Id> } = {
    view: undefined,
    scale: 1,
    shown: new Set(),
  };
  private sandbox: CodeSandbox | undefined;
  private readonly running = new Map<Id, Running>();
  /** By package, hook and element. */
  private readonly results = new Map<Id, Map<HookName, Map<Id, HookResult>>>();
  /** What was fetched for each package, by address. */
  private readonly fetched = new Map<Id, Map<string, Fetched>>();
  /** What each package was last said to want fetched, as JSON. */
  private readonly wantedSaid = new Map<Id, string>();
  /** What the app was last told of each element, as JSON. */
  private readonly told = new Map<Id, string>();
  private readonly pendingElements = new Map<Id, ElementAnswers>();
  private readonly pendingCleared = new Set<Id>();
  private readonly pendingPackages = new Map<Id, PackageRun>();
  private calling: Id | undefined;
  private generation = 0;
  private working: Promise<void> | undefined;
  private readonly now: () => number;
  private readonly pause: () => Promise<void>;
  private readonly sliceMs: number;
  /** The simulation runs, worked out here (ADR 0085). */
  private readonly driver: SimulationDriver;
  /** What the tab asked of its runs that the driver has not taken yet, in order. */
  private readonly simulationRequests: SimulationRequest[] = [];
  /** The generation the hooks last went over everything for. */
  private roundFor = -1;
  /** The package and the element of the call of `simulate` under way, or the last one. */
  private simulating: { pkg: Id; element: { id: Id; name: string } } | undefined;

  constructor(private readonly options: RunnerOptions) {
    this.now = options.now ?? (() => performance.now());
    this.pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    this.sliceMs = options.sliceMs ?? 40;
    this.driver = new SimulationDriver(
      this.simulationHost(),
      options.simulationBudget ? { budget: options.simulationBudget } : {},
    );
  }

  /** Takes a request from the app; the work it calls for starts at once, or after the work under way. */
  receive(request: CodeRequest): void {
    if (isSimulationRequest(request)) {
      // Taken in order, once the packages asked for before it run.
      this.simulationRequests.push(request);
      this.start();
      return;
    }
    switch (request.kind) {
      case 'project':
        this.project = request.project;
        break;
      case 'packages':
        this.requested = request.packages;
        break;
      case 'view':
        this.view = { view: request.view, scale: request.scale, shown: new Set(request.shown) };
        break;
      case 'fetched':
        if (!this.takeFetched(request)) return;
        break;
    }
    this.generation += 1;
    this.start();
  }

  /** Starts working, unless it works already. */
  private start(): void {
    this.working ??= this.work().finally(() => {
      this.working = undefined;
    });
  }

  /** Resolves once everything asked for so far is done. */
  async settled(): Promise<void> {
    while (this.working) await this.working;
  }

  /**
   * Works until everything asked for is done: the hooks' rounds, and the ticks the tab asked its runs
   * for. While both have work, a slice of each in turn.
   */
  private async work(): Promise<void> {
    let runsTurn = false;
    for (;;) {
      this.sandbox ??= await this.options.newSandbox();
      this.syncPackages();
      this.takeSimulationRequests();
      const hooksDue = this.roundFor !== this.generation;
      const runsDue = this.driver.busy;
      if (!hooksDue && !runsDue) break;
      if (runsDue && (runsTurn || !hooksDue)) {
        await this.simulationSlice();
        runsTurn = false;
        continue;
      }
      runsTurn = true;
      const generation = this.generation;
      if (await this.round(generation)) this.roundFor = generation;
    }
    this.calling = undefined;
    this.flush();
    this.options.post({ kind: 'idle' });
  }

  /** Hands the driver what the tab asked of its runs, and tells the tab what it answers at once. */
  private takeSimulationRequests(): void {
    for (const request of this.simulationRequests.splice(0)) {
      this.postSimulation(this.driver.receive(request));
    }
  }

  /**
   * One slice of simulation runs: ticks worked out, one from each run in turn, until the slice is
   * over or no run wants more; then the tab is told, and the messages that came in are let in.
   */
  private async simulationSlice(): Promise<void> {
    const started = this.now();
    const replies = this.driver.work(
      () => this.sandbox?.crashed === true || this.now() - started > this.sliceMs,
    );
    this.postSimulation(replies);
    if (this.sandbox?.crashed) await this.replaceSandbox();
    this.flush();
    await this.pause();
  }

  private postSimulation(replies: readonly SimulationReply[]): void {
    for (const reply of replies) this.options.post(reply);
  }

  /** Tells the driver the project and the packages as they run now: a run that reads otherwise ends. */
  private refreshRuns(): void {
    if (this.project) this.postSimulation(this.driver.refresh(this.project));
  }

  /** What the driver needs of this worker: the packages' code, their sandbox and their row of stops. */
  private simulationHost(): SimulationHost {
    return {
      code: (pkg) => {
        const running = this.running.get(pkg);
        if (!running || !this.requested.some((each) => each.package === pkg)) {
          return { ok: false, reason: 'not-approved' };
        }
        const { run } = running;
        if (run.state === 'off') return { ok: false, reason: 'off' };
        if (run.state === 'failed' && run.problem?.code === 'code-not-approved') {
          return { ok: false, reason: 'not-approved' };
        }
        if (run.state !== 'running' || !run.hooks.includes('simulate')) {
          return { ok: false, reason: 'no-code' };
        }
        return { ok: true, hash: running.request.hash };
      },
      call: (pkg, input, seed, tick): SimulateOutcome => {
        const running = this.running.get(pkg);
        const sandbox = this.sandbox;
        this.simulating = { pkg, element: { id: input.element.id, name: input.element.name } };
        if (!running || running.run.state !== 'running' || !sandbox) {
          return { ok: false, failure: { kind: 'threw', message: exportsNo('simulate') } };
        }
        this.calling = pkg;
        const reads = running.request.granted.includes('model:read');
        const outcome = sandbox.simulate(
          pkg,
          input,
          seed,
          tick,
          reads && this.project ? modelReaderOf(this.project) : undefined,
        );
        return outcome.ok
          ? { ok: true, answer: outcome.answer }
          : { ok: false, failure: outcome.failure };
      },
      failed: (pkg, failure) => this.simulationFailed(pkg, failure),
    };
  }

  /**
   * A run's failure, which counts as a call that stopped (ADR 0085): its code threw, ran past its
   * time or its memory, or answered what the core's checks refuse. It shows as the package's last
   * problem, and the third in a row turns the package off, ending its other runs. A tick that
   * answers ends no row: a run calls `simulate` for every tick, so code that fails at its fourth
   * tick every time would never be counted, nor would code that stalls the worker there, whose runs
   * the tab starts again; a hook's call that does not stop ends it, as ADR 0054 has it.
   */
  private simulationFailed(pkg: Id, failure: CodeFailure): void {
    const running = this.running.get(pkg);
    if (!running || running.run.state !== 'running') return;
    const on = this.simulating?.pkg === pkg ? this.simulating.element : undefined;
    if (on) {
      const named = { id: pkg, name: running.request.name };
      running.run = { ...running.run, problem: callProblem(named, 'simulate', on, failure) };
      this.pendingPackages.set(pkg, running.run);
    }
    this.count(running, true);
  }

  /** One pass over everything; false when a newer request came in during it. */
  private async round(generation: number): Promise<boolean> {
    this.sandbox ??= await this.options.newSandbox();
    this.syncPackages();
    const project = this.project;
    if (!project) return true;
    const reader = modelReaderOf(project);
    const catalog = imagesIn(project);
    const hasImage = (id: Id) => catalog.image(id) !== undefined;
    let sliceStart = this.now();
    const seen = new Set<Id>();
    for (const element of [project.model.world, ...project.model.elements]) {
      const packages = codePackagesOn(project, element.id).filter((id) => this.running.has(id));
      if (packages.length === 0) continue;
      seen.add(element.id);
      for (const id of packages) {
        const running = this.running.get(id);
        for (const hook of running?.run.hooks ?? []) {
          if (!running || running.run.state !== 'running') break;
          // Only simulation runs call simulate, tick by tick, in slices of their own.
          if (hook === 'simulate') continue;
          if (hook === 'draw' && !this.view.shown.has(element.id)) {
            this.resultsOf(id, hook).delete(element.id);
            continue;
          }
          this.callIfChanged(project, running, hook, element.id, reader, hasImage);
          if (this.sandbox.crashed) await this.replaceSandbox();
          if (this.now() - sliceStart > this.sliceMs) {
            this.tell(element.id);
            this.flush();
            await this.pause();
            if (generation !== this.generation) return false;
            this.takeSimulationRequests();
            if (this.driver.busy) {
              await this.simulationSlice();
              if (generation !== this.generation) return false;
            }
            sliceStart = this.now();
          }
        }
      }
      this.tell(element.id);
    }
    // What no longer runs on an element, or no longer exists, has no answers.
    for (const byHook of this.results.values()) {
      for (const byElement of byHook.values()) {
        for (const element of [...byElement.keys()]) {
          if (!seen.has(element)) byElement.delete(element);
        }
      }
    }
    // Told again: a package turned off on the way took the answers it gave earlier in the round.
    for (const element of [...this.told.keys()]) this.tell(element);
    this.sayWanted();
    return true;
  }

  /**
   * Takes what the program fetched for a package: false when it changes nothing to call again, as
   * the same answer again or a failure, which shows as the package's last problem.
   */
  private takeFetched(request: Extract<CodeRequest, { kind: 'fetched' }>): boolean {
    const running = this.running.get(request.package);
    const known = this.fetched.get(request.package)?.get(request.url);
    if (!running || !known) return false;
    if (request.response === undefined) {
      if (request.problem !== undefined) {
        running.run = { ...running.run, problem: request.problem };
        this.pendingPackages.set(request.package, running.run);
        this.flush();
      }
      return false;
    }
    const before = known.response;
    if (before?.status === request.response.status && before.text === request.response.text) {
      return false;
    }
    known.response = { status: request.response.status, text: request.response.text };
    known.version += 1;
    return true;
  }

  /** Says, for each package granted an origin, every address its code reads now, when that changed. */
  private sayWanted(): void {
    for (const [id, running] of this.running) {
      if (!running.request.granted.some((each) => each.startsWith('network:'))) continue;
      const wanted = new Map<string, number>();
      for (const result of this.results.get(id)?.get('attributes')?.values() ?? []) {
        for (const [url, read] of result.reads ?? []) {
          wanted.set(url, Math.min(wanted.get(url) ?? Number.POSITIVE_INFINITY, read.every));
        }
      }
      // What no call reads any longer is no longer fetched, nor kept.
      const fetched = this.fetched.get(id);
      for (const url of [...(fetched?.keys() ?? [])]) if (!wanted.has(url)) fetched?.delete(url);
      const list: WantedAddress[] = [...wanted].map(([url, every]) => ({ url, every }));
      this.say(id, list);
    }
    for (const id of [...this.wantedSaid.keys()]) {
      if (!this.running.has(id)) this.say(id, []);
    }
  }

  private say(id: Id, wanted: WantedAddress[]): void {
    const text = JSON.stringify(wanted);
    if ((this.wantedSaid.get(id) ?? '[]') === text) return;
    if (wanted.length === 0) this.wantedSaid.delete(id);
    else this.wantedSaid.set(id, text);
    this.options.post({ kind: 'network', package: id, wanted });
  }

  /**
   * What `context.fetched` reads in one call of a package granted an origin, and what it read: only
   * addresses on an origin granted, at most so many for the package, each version as it is now.
   */
  private networkFor(request: RunPackage): {
    reader: NetworkReader;
    reads: Map<string, { version: number; every: number }>;
    answered: () => boolean;
  } {
    const reads = new Map<string, { version: number; every: number }>();
    let answered = false;
    let fetched = this.fetched.get(request.package);
    if (!fetched) {
      fetched = new Map();
      this.fetched.set(request.package, fetched);
    }
    const known = fetched;
    const reader: NetworkReader = {
      fetched: (url, everySeconds) => {
        const checked = checkFetchAddress(url, request.granted);
        if (!checked.ok)
          return { kind: 'refused', reason: `${url.slice(0, 200)} ${checked.reason}.` };
        let entry = known.get(checked.url);
        if (!entry) {
          if (known.size >= LIVE_FETCH_LIMITS.urls) {
            return {
              kind: 'refused',
              reason: `Package code fetches at most ${LIVE_FETCH_LIMITS.urls} addresses.`,
            };
          }
          entry = { version: 0 };
          known.set(checked.url, entry);
        }
        reads.set(checked.url, { version: entry.version, every: everyOf(everySeconds) });
        if (entry.response === undefined) return { kind: 'not-yet' };
        answered = true;
        return { kind: 'answer', status: entry.response.status, text: entry.response.text };
      },
    };
    return { reader, reads, answered: () => answered };
  }

  /** Whether every address a call read is still at the version it read. */
  private readsCurrent(id: Id, reads: HookResult['reads']): boolean {
    if (reads === undefined) return true;
    const fetched = this.fetched.get(id);
    for (const [url, read] of reads) if (fetched?.get(url)?.version !== read.version) return false;
    return true;
  }

  /** Loads what was asked for and is not loaded yet, and unloads the rest. */
  private syncPackages(): void {
    const sandbox = this.sandbox;
    if (!sandbox) return;
    const wanted = new Map(this.requested.map((each) => [each.package, each]));
    for (const [id, running] of [...this.running]) {
      const asked = wanted.get(id);
      if (!asked || asked.hash !== running.request.hash || !sameGrant(asked, running.request)) {
        sandbox.unload(id);
        this.running.delete(id);
        this.results.delete(id);
        this.fetched.delete(id);
      }
    }
    for (const request of this.requested) {
      if (this.running.has(request.package)) continue;
      const named = { id: request.package, name: request.name };
      let run: PackageRun;
      if (request.stops >= CODE_LIMITS.stopsBeforeOff) {
        run = off(request.package, request.stops, offProblem(named));
      } else if (codeHash(request.code.split('\n'), request.declared) !== request.hash) {
        // Only the code the person approved runs: never other code under its hash.
        run = {
          package: request.package,
          state: 'failed',
          hooks: [],
          problem: notApprovedProblem(named),
          stops: request.stops,
        };
      } else {
        const loaded = sandbox.load({
          package: request.package,
          code: request.code,
          granted: request.granted,
        });
        run = loaded.ok
          ? {
              package: request.package,
              state: 'running',
              hooks: loaded.hooks,
              stops: request.stops,
            }
          : {
              package: request.package,
              state: 'failed',
              hooks: [],
              problem: loadProblem(named, loaded.failure),
              stops: request.stops,
            };
      }
      this.running.set(request.package, { request, run });
      this.pendingPackages.set(request.package, run);
    }
    this.refreshRuns();
  }

  /** Calls a hook on an element when what it would be given changed since it was last called. */
  private callIfChanged(
    project: ProjectSnapshot,
    running: Running,
    hook: HookName,
    id: Id,
    reader: ModelReader,
    hasImage: (id: Id) => boolean,
  ): void {
    const sandbox = this.sandbox;
    if (!sandbox) return;
    const drawn =
      hook === 'draw' && this.view.view !== undefined
        ? { view: this.view.view, scale: this.view.scale }
        : undefined;
    const input = hookInputOf(project, id, drawn);
    if (!input) return;
    const { request } = running;
    const reads = request.granted.includes('model:read');
    // With model:read, the whole model is part of what a hook is given: any change calls it again.
    const key = `${request.hash}\n${reads ? modelToken(project) : ''}\n${JSON.stringify(input)}`;
    const results = this.resultsOf(request.package, hook);
    const before = results.get(id);
    if (before?.key === key && this.readsCurrent(request.package, before.reads)) return;
    this.calling = request.package;
    const network =
      hook === 'attributes' && request.granted.some((each) => each.startsWith('network:'))
        ? this.networkFor(request)
        : undefined;
    const outcome = sandbox.call(
      request.package,
      hook,
      input,
      reads ? reader : undefined,
      network?.reader,
    );
    const named = { id: request.package, name: request.name };
    const element = { id, name: input.element.name };
    const result: HookResult = {
      key,
      problems: [],
      ...(network === undefined || network.reads.size === 0 ? {} : { reads: network.reads }),
      ...(network?.answered() === true ? { live: { freshFor: freshForOf(network.reads) } } : {}),
    };
    const dropped = (reason: string) =>
      result.problems.push(callProblem(named, hook, element, { kind: 'answer', reason }));
    if (outcome.ok) {
      this.count(running, false);
      if (hook === 'attributes') {
        const checked = checkAttributesAnswer(outcome.answer);
        if (checked.ok) {
          result.attributes = checked.value.map((each) => ({ ...each, package: named.id }));
        } else dropped(checked.reason);
      } else if (hook === 'check') {
        const checked = checkProblemsAnswer(outcome.answer);
        if (checked.ok) {
          for (const each of checked.value) {
            result.problems.push(checkedProblem(named, element, each.message));
          }
        } else dropped(checked.reason);
      } else {
        const checked = checkDrawAnswer(outcome.answer, hasImage);
        if (checked.ok) {
          if (checked.value !== undefined) result.drawing = checked.value;
        } else dropped(checked.reason);
      }
    } else {
      const problem = callProblem(named, hook, element, outcome.failure);
      result.problems.push(problem);
      running.run = { ...running.run, problem };
      this.pendingPackages.set(request.package, running.run);
      const kind = outcome.failure.kind;
      this.count(running, kind === 'time' || kind === 'memory' || outcome.crashed === true);
    }
    // A package turned off keeps no answers.
    if (running.run.state === 'running') results.set(id, result);
  }

  /**
   * Counts a call that stopped, or one that did not, which ends the row of stops; the third stop in
   * a row turns the package off until the project opens again.
   */
  private count(running: Running, stop: boolean): void {
    const stops = stop ? running.run.stops + 1 : 0;
    if (stops === running.run.stops) return;
    const { request } = running;
    if (stops >= CODE_LIMITS.stopsBeforeOff) {
      this.sandbox?.unload(request.package);
      this.results.delete(request.package);
      running.run = off(
        request.package,
        stops,
        offProblem({ id: request.package, name: request.name }),
      );
      this.pendingPackages.set(request.package, running.run);
      this.refreshRuns();
      return;
    } else {
      running.run = { ...running.run, stops };
    }
    this.pendingPackages.set(request.package, running.run);
  }

  /** A fresh interpreter in place of one that failed, with the packages that still run. */
  private async replaceSandbox(): Promise<void> {
    this.sandbox = await this.options.newSandbox();
    for (const [id, running] of [...this.running]) {
      if (running.run.state !== 'running') continue;
      this.running.delete(id);
      this.requested = this.requested.map((each) =>
        each.package === id ? { ...each, stops: running.run.stops } : each,
      );
    }
    this.syncPackages();
  }

  private resultsOf(id: Id, hook: HookName): Map<Id, HookResult> {
    let byHook = this.results.get(id);
    if (!byHook) {
      byHook = new Map();
      this.results.set(id, byHook);
    }
    let byElement = byHook.get(hook);
    if (!byElement) {
      byElement = new Map();
      byHook.set(hook, byElement);
    }
    return byElement;
  }

  /** Gathers an element's answers from every package that runs on it, and queues what changed. */
  private tell(element: Id): void {
    const project = this.project;
    if (!project) return;
    const answers: ElementAnswers = { element, attributes: [], problems: [] };
    const names = new Set<string>();
    const live: ComputedValue[] = [];
    let freshFor = 0;
    for (const id of codePackagesOn(project, element)) {
      const byHook = this.results.get(id);
      if (!byHook) continue;
      const attributes = byHook.get('attributes')?.get(element);
      for (const each of attributes?.attributes ?? []) {
        if (names.has(each.name)) continue;
        names.add(each.name);
        // What was made of what was fetched goes to the program as live values, never as computed.
        if (attributes?.live) live.push(each);
        else answers.attributes.push(each);
      }
      if (attributes?.live) freshFor = Math.max(freshFor, attributes.live.freshFor);
      if (live.length > 0 && answers.live === undefined) {
        answers.live = { values: live, freshFor };
      } else if (answers.live) {
        answers.live.freshFor = freshFor;
      }
      for (const hook of ['attributes', 'check', 'draw'] as const) {
        answers.problems.push(...(byHook.get(hook)?.get(element)?.problems ?? []));
      }
      const drawing = byHook.get('draw')?.get(element)?.drawing;
      if (drawing !== undefined && answers.drawing === undefined) answers.drawing = drawing;
    }
    const empty =
      answers.attributes.length === 0 &&
      answers.problems.length === 0 &&
      answers.drawing === undefined &&
      answers.live === undefined;
    const text = empty ? '' : JSON.stringify(answers);
    if (text === (this.told.get(element) ?? '')) return;
    if (empty) {
      this.told.delete(element);
      this.pendingElements.delete(element);
      this.pendingCleared.add(element);
    } else {
      this.told.set(element, text);
      this.pendingCleared.delete(element);
      this.pendingElements.set(element, answers);
    }
  }

  /** Tells the app what changed, and which package runs now: also when nothing changed, as a sign of life. */
  private flush(): void {
    this.options.post({
      kind: 'answers',
      ...(this.calling === undefined ? {} : { calling: this.calling }),
      elements: [...this.pendingElements.values()],
      cleared: [...this.pendingCleared],
      packages: [...this.pendingPackages.values()],
    });
    this.pendingElements.clear();
    this.pendingCleared.clear();
    this.pendingPackages.clear();
  }
}

const SIMULATION_REQUESTS: ReadonlySet<string> = new Set<SimulationRequest['kind']>([
  'simulation/start',
  'simulation/until',
  'simulation/from-here',
  'simulation/more',
  'simulation/close',
]);

function isSimulationRequest(request: CodeRequest): request is SimulationRequest {
  return SIMULATION_REQUESTS.has(request.kind);
}

/** How often an address is fetched again, in milliseconds, from the seconds the code asked for. */
function everyOf(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return LIVE_FETCH_LIMITS.every;
  return Math.min(LIVE_FETCH_LIMITS.everyMax, Math.max(LIVE_FETCH_LIMITS.everyMin, seconds * 1000));
}

/** How long values made of what was fetched stay fresh: twice as long as the slowest fetch they read. */
function freshForOf(reads: ReadonlyMap<string, { every: number }>): number {
  let every = 0;
  for (const read of reads.values()) every = Math.max(every, read.every);
  return Math.min(LIVE_LIMITS.freshForMax, Math.max(LIVE_LIMITS.freshForMin, 2 * every));
}

function off(id: Id, stops: number, problem: Problem): PackageRun {
  return { package: id, state: 'off', hooks: [], problem, stops };
}

function sameGrant(a: RunPackage, b: RunPackage): boolean {
  return (
    a.granted.length === b.granted.length && a.granted.every((each, at) => each === b.granted[at])
  );
}

/** A token for each model a project held: a hook with `model:read` is called again when it changes. */
const modelTokens = new WeakMap<object, number>();
let lastModelToken = 0;

function modelToken(project: ProjectSnapshot): string {
  let token = modelTokens.get(project.model);
  if (token === undefined) {
    lastModelToken += 1;
    token = lastModelToken;
    modelTokens.set(project.model, token);
  }
  return String(token);
}
