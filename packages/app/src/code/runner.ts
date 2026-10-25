/**
 * What the code worker does (ADR 0054): it keeps the project, loads the approved packages in the
 * sandbox, and runs each package's hooks on the elements created from its components, again only for
 * an element whose input changed. It works a slice at a time, telling the app what changed and which
 * package it runs, so that the app knows it is alive; and it turns off a package whose calls stopped
 * three times in a row, until the project opens again. Nothing here touches the page.
 */
import {
  CODE_LIMITS,
  callProblem,
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
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type {
  CodeReply,
  CodeRequest,
  ComputedValue,
  ElementAnswers,
  PackageRun,
  RunPackage,
} from './messages';
import type { CodeSandbox } from './sandbox';

/** What one hook of one package answered for one element, kept until its input changes. */
interface HookResult {
  /** What it was called with: the package's hash, the model for `model:read`, and its input. */
  key: string;
  attributes?: ComputedValue[];
  problems: Problem[];
  drawing?: Drawing;
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

  constructor(private readonly options: RunnerOptions) {
    this.now = options.now ?? (() => performance.now());
    this.pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    this.sliceMs = options.sliceMs ?? 40;
  }

  /** Takes a request from the app; the work it calls for starts at once, or after the work under way. */
  receive(request: CodeRequest): void {
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
    }
    this.generation += 1;
    this.working ??= this.work().finally(() => {
      this.working = undefined;
    });
  }

  /** Resolves once everything asked for so far is done. */
  async settled(): Promise<void> {
    while (this.working) await this.working;
  }

  private async work(): Promise<void> {
    let finished = false;
    while (!finished) {
      const generation = this.generation;
      finished = (await this.round(generation)) && generation === this.generation;
    }
    this.calling = undefined;
    this.flush();
    this.options.post({ kind: 'idle' });
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
    if (results.get(id)?.key === key) return;
    this.calling = request.package;
    const outcome = sandbox.call(request.package, hook, input, reads ? reader : undefined);
    const named = { id: request.package, name: request.name };
    const element = { id, name: input.element.name };
    const result: HookResult = { key, problems: [] };
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
    for (const id of codePackagesOn(project, element)) {
      const byHook = this.results.get(id);
      if (!byHook) continue;
      for (const each of byHook.get('attributes')?.get(element)?.attributes ?? []) {
        if (names.has(each.name)) continue;
        names.add(each.name);
        answers.attributes.push(each);
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
      answers.drawing === undefined;
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
