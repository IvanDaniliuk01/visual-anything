/**
 * The app benchmark: mounts the whole app, the shell with its outline, its inspector and the canvas, on
 * a synthetic project of 10,000 elements, and uses it as a person would, through pointer, wheel and key
 * events on the real elements. It plays the local program itself: each command runs in the core and
 * the project it gives goes back to the shell.
 *
 * `pnpm bench` builds it for production and serves it on 127.0.0.1:47707 as `/app-bench.html`, and
 * its official numbers come from there. The dev server serves the same page for quick checks, but
 * React's development build more than doubles what it measures. `?elements=N` and `?overlap=…` work
 * as on `/bench.html`, `?strict` mounts the app in React's StrictMode, as `main.tsx` does, which
 * renders everything twice in development, `?profile` says which components and canvas methods the
 * time goes to, and `?clicks=`, `?selectAlls=`, `?frames=`, `?nudges=` and `?renames=` change how
 * many of each the benchmark makes.
 *
 * It times interactions: each one from its input event to the second animation frame after React has
 * committed what it changed, since the first of the two frames draws the canvas and the second starts
 * once that frame was shown. It judges panning and zooming on the frames as shown, one input event a
 * frame, so its window must stay in front, at 60 Hz.
 */
import {
  applyOperations,
  executeCommand,
  modelIndexOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Element as ModelElement } from '@visual-anything/schema';
import {
  Profiler,
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  readableFitCamera,
  panBy,
  screenToWorld,
  wheelFactor,
  worldToScreen,
  zoomAt,
  type Camera,
} from '../canvas/camera';
import type { SendCommand } from '../canvas/CanvasArea';
import { CanvasController, HIT_TOLERANCE } from '../canvas/controller';
import type { Point, Rect, Size } from '../canvas/geometry';
import { hitAt, indexScene, type IndexedScene } from '../canvas/hit';
import { CanvasRenderer, FIT_MARGIN, NAMES_FROM } from '../canvas/renderer';
import { buildScene, type ElementShape } from '../canvas/scene';
import { outlineOf } from '../shell/outlineItems';
import { ProjectErrorBoundary } from '../shell/ProjectErrorBoundary';
import { Shell } from '../shell/Shell';
import {
  SHOWN,
  TARGET_FPS,
  WORK,
  addRow,
  percentile,
  showVerdict,
  summarize,
  type Summary,
} from './report';
import { importPhases } from './imports';
import { OVERLAPS, seeded, syntheticProject, type Overlap } from './synthetic';
import { withCommentThreads } from './comments';
import '../styles.css';

/** How many of each interaction the benchmark makes, and how long it lets the app rest. */
export interface BenchPlan {
  /** Clicks on shapes, one after another. */
  clicks: number;
  /** Presses of Ctrl+A, each after Escape. */
  selectAlls: number;
  /** Frames of each pan and zoom. */
  frames: number;
  /** Presses of Shift+ArrowRight. */
  nudges: number;
  /** Renames from the inspector. */
  renames: number;
  /** How often each import the dialog reads is read and prepared; none are when absent. */
  imports?: number;
  /** How long to rest after the canvas starts, and between phases, in milliseconds. */
  rest: { start: number; between: number };
}

/**
 * Where time went, in milliseconds: React's components by name, each for rendering itself and for its
 * own effects, without its children; the canvas's methods by name, each with what it calls; and the
 * frames that took more than 50 ms, as the browser reports them.
 */
export interface Breakdown {
  components: Record<string, number>;
  effects: Record<string, number>;
  methods: Record<string, number>;
  frames: LongFrames;
  /** What happened, in order: milliseconds from the start, what it was, and how long it took. */
  timeline: [number, string, number][];
}

/** What the long animation frames of a step took, in milliseconds, where the browser reports them. */
export interface LongFrames {
  count: number;
  /** In all. */
  duration: number;
  /** From the start of their rendering: animation frame callbacks, style, layout and paint. */
  rendering: number;
  /** Style and layout at the end of each frame. */
  styleAndLayout: number;
  /** Style and layout that scripts forced by reading the layout. */
  forcedStyleAndLayout: number;
}

/** One interaction, in milliseconds from its input event. */
export interface Step {
  /** To the start of the second frame after the change was committed. */
  total: number;
  /** Until the event's listeners returned. */
  listeners: number;
  /** Until what the step waits for showed: the inspector or the project changed. */
  shown: number;
  /**
   * The work of the main thread until the canvas drew the change: until it showed, then the canvas's
   * drawing in the next frame, without waiting for that frame to start.
   */
  work: number;
  /** Spent running commands in the core, and applying their operations. */
  core: number;
  /** Spent rendering in React, as the Profiler measures it, and in how many commits. */
  rendering: number;
  commits: number;
  /** Until the shell committed a new project, and until the effects of that commit ran. */
  committed?: number;
  effects?: number;
  /** What React says its layout effects and its passive effects took, in every commit of the step. */
  layoutEffects: number;
  passiveEffects: number;
  profile?: Breakdown;
}

/** What a pass mark asks of a series of times. */
export interface Mark {
  /** What it says, for the table. */
  text: string;
  passes(summary: Summary): boolean;
}

/** The interactions timed one at a time. */
export interface StepPhase {
  name: string;
  mark?: Mark;
  steps: Step[];
}

/** Panning or zooming: the frames as shown, and the work each input event made in them. */
export interface FramePhase {
  name: string;
  /** The time between frames. */
  intervals: number[];
  /** The listeners of each event and React's work after them, then the next frame's drawing. */
  work: number[];
  profile?: Breakdown;
}

export interface BenchResults {
  steps: StepPhase[];
  frames: FramePhase[];
  /** From the first render of the app to the end of its first commit's effects. */
  mounted: number;
  /** How often the browser starts a frame while nothing happens, in milliseconds. */
  frameInterval: number;
  /** The canvas's size, and the scale it clicks shapes at. */
  viewport: Size;
  clickScale: number;
  /** While profiling, what the functions the shell runs on every change take on their own. */
  functions?: Record<string, number>;
}

interface AppBenchProps {
  project: ProjectSnapshot;
  plan: BenchPlan;
  /** Says which components and canvas methods the time goes to; React reports it in development. */
  profile?: boolean;
  /** Says what the benchmark is doing. */
  onStatus?: (text: string) => void;
  /** Called once, with the results or with why the benchmark stopped. */
  onFinish: (outcome: { results: BenchResults } | { error: unknown }) => void;
}

/** Clicks shapes where names show, as a person does who reads what they click. */
const CLICK_SCALE = NAMES_FROM * 1.3;
/** The longest the benchmark waits for something to show before it gives up, in frames. */
const MAX_WAIT_FRAMES = 600;
const CLICKS_MARK = 2000 / TARGET_FPS;
const SELECT_ALL_MARK = 100;
/** Frames as shown, as the canvas benchmark's `?mode=frames` judges them, never more than two frames. */
const FRAMES_MARK: Mark = {
  text: `avg ≤ ${SHOWN.average.toFixed(1)}, p95 ≤ ${SHOWN.p95}, worst ≤ ${WORK.worst.toFixed(1)}`,
  passes: ({ average, p95, worst }) =>
    average <= SHOWN.average && p95 <= SHOWN.p95 && worst <= WORK.worst,
};
/** The work of each frame, as the canvas benchmark judges it, here without the GPU. */
const WORK_MARK: Mark = {
  text: `avg ≤ ${WORK.average}, p95 ≤ ${WORK.p95}, worst ≤ ${WORK.worst.toFixed(1)}`,
  passes: ({ average, p95, worst }) =>
    average <= WORK.average && p95 <= WORK.p95 && worst <= WORK.worst,
};
/** The classes whose methods are timed while profiling, every method on their prototypes. */
const TIMED_CLASSES: readonly [object, string][] = [
  [CanvasController.prototype, 'CanvasController'],
  [CanvasRenderer.prototype, 'CanvasRenderer'],
];
/** The track React's development build logs each component's render and effects on. */
const COMPONENTS_TRACK = 'Components \u269b';

/**
 * The app as `LiveApp` mounts it, with a local program of its own, and the benchmark that drives it
 * once the canvas has started.
 */
export function AppBench({ project, plan, profile = false, onStatus, onFinish }: AppBenchProps) {
  const [shown, setShown] = useState(project);
  const [profiling] = useState(() => (profile ? new Profiling() : undefined));
  const [trace] = useState(() => new Trace(profiling));
  const frame = useRef<HTMLDivElement>(null);
  const current = useRef(project);
  const callbacks = useRef({ onStatus, onFinish });
  useLayoutEffect(() => {
    callbacks.current = { onStatus, onFinish };
  });

  // The local program: runs the command in the core, applies what it did, shows the new project and
  // answers, as the live connection does once the change has come back.
  const onCommand = useCallback<SendCommand>(
    (command) => {
      const began = performance.now();
      // As the local program does, it says who sends the command: the person (ADR 0059).
      const outcome = executeCommand(current.current, command, { author: 'user' });
      if (!outcome.ok) {
        trace.refuse(outcome.problems.map((problem) => problem.message).join(' '));
        return Promise.resolve({ ok: false });
      }
      const next = applyOperations(current.current, outcome.operations).state;
      trace.run(performance.now() - began);
      current.current = next;
      setShown(next);
      return Promise.resolve({ ok: true, created: outcome.created });
    },
    [trace],
  );
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration) => trace.render(phase, actualDuration),
    [trace],
  );
  // React's Profiler also says what each commit's effects took, though its types leave it out.
  const [effectHooks] = useState(() => ({
    onCommit: (_id: string, _phase: string, duration: number) => trace.layout(duration),
    onPostCommit: (_id: string, _phase: string, duration: number) => trace.passive(duration),
  }));

  useLayoutEffect(() => {
    const container = frame.current?.parentElement;
    if (!profiling || !container) return;
    profiling.start(container);
    return () => profiling.stop();
  }, [profiling]);

  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    const driver = new Driver(
      root,
      project,
      plan,
      trace,
      () => current.current,
      (text) => callbacks.current.onStatus?.(text),
    );
    let finished = false;
    driver.run().then(
      (results) => {
        if (!finished) callbacks.current.onFinish({ results });
        finished = true;
      },
      (error: unknown) => {
        if (!finished) callbacks.current.onFinish({ error });
        finished = true;
      },
    );
    return () => {
      finished = true;
      driver.stop();
    };
  }, [project, plan, trace]);

  return (
    <div ref={frame} className="app-bench-frame">
      <Profiler id="shell" onRender={onRender} {...(effectHooks as object)}>
        <ProjectErrorBoundary>
          <Shell project={shown} onCommand={onCommand} />
        </ProjectErrorBoundary>
        <Committed project={shown} trace={trace} />
      </Profiler>
    </div>
  );
}

/**
 * Tells the trace when the shell committed a project, and when that commit's effects ran: it comes
 * after the shell, so its effects run after the shell's, the canvas's update among them.
 */
function Committed({ project, trace }: { project: ProjectSnapshot; trace: Trace }) {
  useLayoutEffect(() => trace.commit(), [project, trace]);
  useEffect(() => trace.affect(project), [project, trace]);
  return null;
}

/** What the local program and React did during one step, and the project last shown. */
class Trace {
  private began = 0;
  private core = 0;
  private rendering = 0;
  private commits = 0;
  private committedAt: number | undefined;
  private effectsAt: number | undefined;
  private layoutEffects = 0;
  private passiveEffects = 0;
  private readonly refusals: string[] = [];
  /** The project whose commit's effects ran last, and when the first ever ran. */
  private effected: ProjectSnapshot | undefined;
  private firstEffects: number | undefined;
  private readonly created = performance.now();

  constructor(readonly profiling: Profiling | undefined) {}

  begin(): void {
    this.began = performance.now();
    this.core = 0;
    this.rendering = 0;
    this.commits = 0;
    this.committedAt = undefined;
    this.effectsAt = undefined;
    this.layoutEffects = 0;
    this.passiveEffects = 0;
    this.profiling?.take();
    this.profiling?.log('input');
  }

  run(core: number): void {
    this.core += core;
  }

  refuse(problems: string): void {
    this.refusals.push(problems);
  }

  render(phase: string, actualDuration: number): void {
    this.rendering += actualDuration;
    this.commits += 1;
    this.profiling?.committed();
    this.profiling?.log(`React: render (${phase})`, actualDuration);
  }

  layout(duration: number): void {
    this.layoutEffects += duration;
    this.profiling?.log('React: layout effects', duration);
  }

  passive(duration: number): void {
    this.passiveEffects += duration;
    this.profiling?.log('React: passive effects', duration);
  }

  commit(): void {
    this.committedAt = performance.now();
    this.profiling?.log('committed');
  }

  affect(project: ProjectSnapshot): void {
    this.effectsAt = performance.now();
    this.profiling?.log('effects ran');
    this.effected = project;
    this.firstEffects ??= this.effectsAt;
  }

  /** Whether the effects of a commit showing this project have run. */
  shows(project: ProjectSnapshot): boolean {
    return this.effected === project;
  }

  /** From the first render of the app to the end of its first commit's effects. */
  get mounted(): number | undefined {
    return this.firstEffects === undefined ? undefined : this.firstEffects - this.created;
  }

  /** Why the last command was refused, if one was. */
  takeRefusal(): string | undefined {
    return this.refusals.pop();
  }

  end(): Pick<
    Step,
    | 'core'
    | 'rendering'
    | 'commits'
    | 'committed'
    | 'effects'
    | 'layoutEffects'
    | 'passiveEffects'
    | 'profile'
  > {
    const profile = this.profiling?.take(this.began);
    return {
      core: this.core,
      rendering: this.rendering,
      commits: this.commits,
      layoutEffects: this.layoutEffects,
      passiveEffects: this.passiveEffects,
      ...(this.committedAt === undefined ? {} : { committed: this.committedAt - this.began }),
      ...(this.effectsAt === undefined ? {} : { effects: this.effectsAt - this.began }),
      ...(profile ? { profile } : {}),
    };
  }
}

/** React's fibers, as far as the profile reads them: React's own fields, filled in development. */
interface Fiber {
  type: unknown;
  child: Fiber | null;
  sibling: Fiber | null;
  alternate: Fiber | null;
  flags: number;
  selfBaseDuration?: number;
  stateNode: unknown;
}

/** React's flag on a component that rendered in the commit at hand. */
const PERFORMED_WORK = 1;

/** A span React logged on its components track: an effect's, from its start to its end. */
interface Span {
  name: string;
  start: number;
  end: number;
  /** The time of the spans inside it. */
  inner: number;
}

/** A long animation frame, as the browser reports it; Chrome has them since version 123. */
interface LongFrame extends PerformanceEntry {
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: readonly { forcedStyleAndLayoutDuration: number }[];
}

/**
 * Says which components and canvas methods the time goes to. React's Profiler times every component
 * inside it in development; each commit, the components that rendered add how long they took to render
 * themselves. React's development build also logs each component's effects on its own track of the
 * Performance panel, which the profile reads as they are logged. The canvas's methods are wrapped while
 * profiling, so that each adds how long it took, with the methods it calls. The browser reports the
 * frames that took long.
 */
class Profiling {
  private components = new Map<string, number>();
  private methods = new Map<string, number>();
  private spans: Span[] = [];
  private frames: LongFrame[] = [];
  private timeline: [number, string, number][] = [];
  /** How many timed methods are running now, each called from the one before. */
  private running = 0;
  private container: HTMLElement | undefined;
  private observer: PerformanceObserver | undefined;
  private readonly restores: (() => void)[] = [];

  start(container: HTMLElement): void {
    this.container = container;
    const methods = this.methods;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the wrapped methods have their own `this`.
    const profiling = this;
    for (const [target, owner] of TIMED_CLASSES) {
      for (const name of Object.getOwnPropertyNames(target)) {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        const original: unknown = descriptor?.value;
        if (name === 'constructor' || typeof original !== 'function') continue;
        const key = `${owner}.${name}`;
        const timed = function (this: unknown, ...args: unknown[]): unknown {
          const began = performance.now();
          profiling.running += 1;
          try {
            return Reflect.apply(original, this, args) as unknown;
          } finally {
            profiling.running -= 1;
            const took = performance.now() - began;
            methods.set(key, (methods.get(key) ?? 0) + took);
            if (profiling.running === 0) profiling.timeline.push([began, key, took]);
          }
        };
        Reflect.set(target, name, timed);
        this.restores.push(() => Reflect.set(target, name, original));
      }
    }
    const logged: unknown = Reflect.get(console, 'timeStamp');
    if (typeof logged === 'function') {
      const spans = this.spans;
      const timeStamp = (...args: unknown[]): unknown => {
        const [name, start, end, track, , color] = args;
        if (
          track === COMPONENTS_TRACK &&
          typeof name === 'string' &&
          typeof start === 'number' &&
          typeof end === 'number' &&
          // React colours the spans of effects in its secondary colours, and renders otherwise.
          typeof color === 'string' &&
          (color.startsWith('secondary') || color === 'error')
        ) {
          spans.push({ name, start, end, inner: 0 });
        }
        return Reflect.apply(logged, console, args) as unknown;
      };
      Reflect.set(console, 'timeStamp', timeStamp);
      this.restores.push(() => Reflect.set(console, 'timeStamp', logged));
    }
    if (
      typeof PerformanceObserver === 'function' &&
      PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
    ) {
      this.observer = new PerformanceObserver((list) => {
        this.frames.push(...(list.getEntries() as LongFrame[]));
      });
      this.observer.observe({ type: 'long-animation-frame' });
    }
  }

  stop(): void {
    for (const restore of this.restores.splice(0)) restore();
    this.observer?.disconnect();
    this.container = undefined;
  }

  /** Adds what the components that rendered in the commit at hand took. */
  committed(): void {
    const root = this.container && currentTree(this.container);
    if (!root) return;
    const visit: Fiber[] = [root];
    for (let fiber = visit.pop(); fiber; fiber = visit.pop()) {
      const name = nameOf(fiber.type);
      if ((fiber.flags & PERFORMED_WORK) !== 0 && name && fiber.selfBaseDuration !== undefined) {
        this.components.set(name, (this.components.get(name) ?? 0) + fiber.selfBaseDuration);
      }
      // Below a fiber whose children were not rendered again, nothing rendered in this commit.
      if (fiber.alternate !== null && fiber.child === fiber.alternate.child) continue;
      for (let child = fiber.child; child; child = child.sibling) visit.push(child);
    }
  }

  /** Notes when something happened, and how long it took if it is over. */
  log(what: string, took = 0): void {
    this.timeline.push([performance.now() - took, what, took]);
  }

  /** What was added since the last time, which starts again from nothing; times from `since`. */
  take(since = 0): Breakdown {
    this.frames.push(...((this.observer?.takeRecords() ?? []) as LongFrame[]));
    const frames: LongFrames = {
      count: this.frames.length,
      duration: 0,
      rendering: 0,
      styleAndLayout: 0,
      forcedStyleAndLayout: 0,
    };
    for (const frame of this.frames) {
      const end = frame.startTime + frame.duration;
      frames.duration += frame.duration;
      if (frame.renderStart > 0) frames.rendering += end - frame.renderStart;
      if (frame.styleAndLayoutStart > 0) frames.styleAndLayout += end - frame.styleAndLayoutStart;
      for (const script of frame.scripts) {
        frames.forcedStyleAndLayout += script.forcedStyleAndLayoutDuration;
      }
    }
    const taken: Breakdown = {
      components: Object.fromEntries(this.components),
      effects: selfTimes(this.spans),
      methods: Object.fromEntries(this.methods),
      frames,
      timeline: this.timeline
        .sort((a, b) => a[0] - b[0])
        .map(([at, what, took]): [number, string, number] => [
          Math.round((at - since) * 10) / 10,
          what,
          Math.round(took * 10) / 10,
        ]),
    };
    this.timeline = [];
    this.components = new Map();
    this.methods.clear();
    this.spans.splice(0);
    this.frames = [];
    return taken;
  }
}

/** Each component's own time in spans that nest, without the spans inside its own. */
function selfTimes(spans: readonly Span[]): Record<string, number> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const open: Span[] = [];
  for (const span of sorted) {
    span.inner = 0;
    while (open.length > 0 && (open.at(-1) as Span).end <= span.start) open.pop();
    const outer = open.at(-1);
    if (outer && span.end <= outer.end) outer.inner += span.end - span.start;
    open.push(span);
  }
  const times: Record<string, number> = {};
  for (const span of sorted) {
    times[span.name] = (times[span.name] ?? 0) + span.end - span.start - span.inner;
  }
  return times;
}

/** The tree React shows now in a container it renders into. */
function currentTree(container: HTMLElement): Fiber | undefined {
  const key = Object.keys(container).find((each) => each.startsWith('__reactContainer$'));
  const hostRoot = key === undefined ? undefined : (Reflect.get(container, key) as Fiber | null);
  const root = hostRoot?.stateNode as { current?: Fiber } | null | undefined;
  return root?.current;
}

/** A component's name; none for the elements of the page. */
function nameOf(type: unknown): string | undefined {
  if (typeof type === 'function') {
    const named = type as { displayName?: string; name?: string };
    return named.displayName ?? named.name;
  }
  if (typeof type === 'object' && type !== null) {
    const wrapped = type as { displayName?: string; type?: unknown; render?: unknown };
    return wrapped.displayName ?? nameOf(wrapped.type ?? wrapped.render);
  }
  return undefined;
}

/** Drives the app through its elements and times what it does. */
class Driver {
  private stopped = false;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private readonly indexed: IndexedScene;
  private readonly names: Map<Id, string>;
  private readonly viewId: Id;

  constructor(
    private readonly root: HTMLElement,
    project: ProjectSnapshot,
    private readonly plan: BenchPlan,
    private readonly trace: Trace,
    private readonly current: () => ProjectSnapshot,
    private readonly status: (text: string) => void,
  ) {
    const view = project.views[0];
    if (!view) throw new Error('The project has no view to draw.');
    this.viewId = view.id;
    // The same scene as the shell's, for where the shapes are.
    this.indexed = indexScene(buildScene(project, view.id));
    this.names = new Map(project.model.elements.map((element) => [element.id, element.name]));
  }

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<BenchResults> {
    await this.canvasStarted();
    this.status('Resting, so that the garbage of building the project is collected…');
    await this.rest(this.plan.rest.start);
    const frameInterval = await this.frameInterval();
    this.showOutline();
    const host = this.host();
    host.focus();
    // Fitted, as Fit fits a view whose whole draws no names, then zoomed in around the middle to
    // where names show.
    this.key(host, '0');
    this.camera = readableFitCamera(
      this.indexed.scene.bounds,
      this.viewport(),
      FIT_MARGIN,
      NAMES_FROM,
    );
    this.zoomTo(CLICK_SCALE);
    await this.frames(2);

    const steps: StepPhase[] = [];
    const frames: FramePhase[] = [];

    this.status(`Clicking ${this.plan.clicks} shapes…`);
    const clicks: Step[] = [];
    for (const target of this.targets(this.plan.clicks)) clicks.push(await this.click(target));
    steps.push({
      name: 'Select by clicking',
      mark: {
        text: `p95 ≤ ${CLICKS_MARK.toFixed(1)}, worst ≤ 50`,
        passes: ({ p95, worst }) => p95 <= CLICKS_MARK && worst <= 50,
      },
      steps: clicks,
    });
    await this.rest(this.plan.rest.between);

    this.status('Panning and zooming with one element selected…');
    frames.push(...(await this.panAndZoom('one element selected')));
    await this.rest(this.plan.rest.between);

    this.status('Selecting everything…');
    const everything: Step[] = [];
    for (let each = 0; each < this.plan.selectAlls; each++) {
      await this.step(
        () => this.press(host, 'Escape'),
        () => this.inspectsNothing(),
      );
      everything.push(
        await this.step(
          () => this.press(host, 'a', { ctrlKey: true }),
          () => this.inspectsSeveral(),
        ),
      );
    }
    steps.push({
      name: 'Select everything',
      mark: { text: `worst ≤ ${SELECT_ALL_MARK}`, passes: ({ worst }) => worst <= SELECT_ALL_MARK },
      steps: everything,
    });
    await this.rest(this.plan.rest.between);

    this.status('Panning and zooming with everything selected…');
    frames.push(...(await this.panAndZoom('everything selected')));
    await this.step(
      () => this.press(host, 'Escape'),
      () => this.inspectsNothing(),
    );
    await this.rest(this.plan.rest.between);

    // A shape at the left of its container, so that moving it right keeps it inside.
    const [target] = this.targets(1, (a, b) => a.offset.x - b.offset.x);
    if (!target) throw new Error('No shape shows to move.');
    const moved = target.shape;
    await this.click(target);
    host.focus();
    this.status(`Moving ${moved.name} with Shift+ArrowRight…`);
    const nudges: Step[] = [];
    for (let each = 0; each < this.plan.nudges; each++) {
      nudges.push(await this.change(() => this.press(host, 'ArrowRight', { shiftKey: true })));
      await this.frames(2);
    }
    steps.push({ name: 'Keyboard move', steps: nudges });
    await this.rest(this.plan.rest.between);

    this.status(`Renaming ${moved.name} from the inspector…`);
    const field = this.nameField();
    if (!field) throw new Error(`The inspector shows no name for ${moved.name}.`);
    field.focus();
    const renames: Step[] = [];
    for (let each = 0; each < this.plan.renames; each++) {
      const name = `${moved.name} renamed ${each + 1}`;
      typeInto(field, name);
      await this.frames(1);
      renames.push(
        await this.change(
          () => this.press(field, 'Enter'),
          (project) => elementOf(project, moved.element)?.name === name,
        ),
      );
      await this.frames(3);
    }
    steps.push({ name: 'One edit: a rename', steps: renames });

    this.status('Timing what the import dialog reads and prepares…');
    if (this.plan.imports !== undefined) {
      steps.push(...importPhases(this.current(), this.plan.imports));
    }

    return {
      steps,
      frames,
      mounted: this.trace.mounted ?? 0,
      frameInterval,
      viewport: this.viewport(),
      clickScale: CLICK_SCALE,
      ...(this.trace.profiling ? { functions: this.functions(moved.element) } : {}),
    };
  }

  /** Drags the view with the middle button, pans it with the wheel and zooms it with Ctrl and the wheel. */
  private async panAndZoom(selected: string): Promise<FramePhase[]> {
    const count = this.plan.frames;
    const half = Math.floor(count / 2);
    const host = this.host();
    const middle = this.client(this.middle());
    const phases: FramePhase[] = [];

    this.pointer(host, 'pointerdown', middle, { button: 1, buttons: 4 });
    const start = { camera: this.camera, at: this.local(middle) };
    let dragged = 0;
    phases.push({
      name: `Pan by dragging, ${selected}`,
      ...(await this.measureFrames(count, (frame) => {
        dragged += frame < half ? 6 : -6;
        const at = { x: middle.x + dragged, y: middle.y + Math.round(dragged / 2) };
        this.pointer(host, 'pointermove', at, { button: -1, buttons: 4 });
        const local = this.local(at);
        this.camera = panBy(start.camera, local.x - start.at.x, local.y - start.at.y);
      })),
    });
    this.pointer(host, 'pointerup', middle, { button: 1, buttons: 0 });
    await this.frames(2);

    phases.push({
      name: `Pan with the wheel, ${selected}`,
      ...(await this.measureFrames(count, (frame) => {
        const sign = frame < half ? 1 : -1;
        this.wheel(host, middle, { deltaX: 8 * sign, deltaY: 4 * sign });
      })),
    });
    await this.frames(2);

    phases.push({
      name: `Zoom with the wheel, ${selected}`,
      ...(await this.measureFrames(count, (frame) => {
        this.wheel(host, middle, { deltaY: frame < half ? 20 : -20, ctrlKey: true });
      })),
    });
    await this.frames(2);
    return phases;
  }

  /**
   * Hovers a shape, then presses on it, timing from the press until the inspector shows its element
   * and two frames more, then lets go.
   */
  private async click({ shape, spot }: Target): Promise<Step> {
    const host = this.host();
    const at = this.client(worldToScreen(this.camera, pointIn(shape.rect, spot)));
    this.pointer(host, 'pointermove', at, { button: -1, buttons: 0 });
    await this.frames(2);
    const name = this.names.get(shape.element) ?? shape.name;
    const step = await this.step(
      () => this.pointer(host, 'pointerdown', at, { button: 0, buttons: 1 }),
      () => this.inspects(name),
    );
    this.pointer(host, 'pointerup', at, { button: 0, buttons: 0 });
    await this.frames(1);
    return step;
  }

  /** Times an input that sends a command, until its change is back and drawn. */
  private change(act: () => void, holds?: (project: ProjectSnapshot) => boolean): Promise<Step> {
    const before = this.current();
    return this.step(act, () => {
      const refused = this.trace.takeRefusal();
      if (refused !== undefined) throw new Error(`The local program refused a command: ${refused}`);
      const now = this.current();
      return now !== before && this.trace.shows(now) && (holds?.(now) ?? true);
    });
  }

  /**
   * Times one interaction: from its input event until `done` holds, which it checks once React has
   * done what the event set off and then once a frame, and two frames more.
   */
  private async step(act: () => void, done: () => boolean): Promise<Step> {
    this.trace.begin();
    const began = performance.now();
    act();
    const listeners = performance.now() - began;
    await drain();
    for (let waited = 0; !done(); waited++) {
      if (waited >= MAX_WAIT_FRAMES) throw new Error('What the benchmark waited for never showed.');
      await this.frames(1);
      this.trace.profiling?.log('frame, waiting');
    }
    const shownAt = performance.now();
    this.trace.profiling?.log('shown');
    // The canvas draws in this frame, before this callback: its own was asked for before.
    const { start, called } = await nextFrame();
    this.trace.profiling?.log('frame');
    const drawn = called - Math.max(start, shownAt);
    await this.frames(1);
    this.trace.profiling?.log('frame');
    return {
      total: performance.now() - began,
      listeners,
      shown: shownAt - began,
      work: shownAt - began + drawn,
      ...this.trace.end(),
    };
  }

  /**
   * Makes one input a frame for `count` frames, and records the time between frames and the work of
   * each input: its listeners and what React did after them, then the drawing in the next frame.
   */
  private async measureFrames(
    count: number,
    step: (frame: number) => void,
  ): Promise<Pick<FramePhase, 'intervals' | 'work' | 'profile'>> {
    this.trace.begin();
    const measured = await new Promise<Pick<FramePhase, 'intervals' | 'work'>>((resolve) => {
      const intervals: number[] = [];
      const work: number[] = [];
      let previous: number | undefined;
      let listeners = 0;
      let frame = 0;
      const tick = (now: number) => {
        const began = performance.now();
        if (previous !== undefined) {
          intervals.push(now - previous);
          // What ran in this frame before this callback: the canvas drawing the last input.
          work.push(listeners + Math.max(0, began - now));
        }
        previous = now;
        if (frame >= count || this.stopped) {
          resolve({ intervals, work });
          return;
        }
        step(frame);
        frame += 1;
        // After React's own work for the input, which waits for the event's listeners to return.
        queueMicrotask(() => {
          listeners = performance.now() - began;
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const { profile } = this.trace.end();
    return { ...measured, ...(profile ? { profile } : {}) };
  }

  /** How often frames start while nothing happens: the median of half a second of them. */
  private async frameInterval(): Promise<number> {
    const starts: number[] = [];
    for (let each = 0; each < 31; each++) starts.push((await nextFrame()).start);
    return percentile(
      starts.slice(1).map((start, at) => start - (starts[at] as number)),
      0.5,
    );
  }

  /**
   * What the functions the shell and the canvas run on every change of the project take on their
   * own, on a project none of them has seen: the median of three.
   */
  private functions(element: Id): Record<string, number> {
    const timings = new Map<string, number[]>();
    const time = <T,>(name: string, run: () => T): T => {
      const began = performance.now();
      const result = run();
      timings.set(name, [...(timings.get(name) ?? []), performance.now() - began]);
      return result;
    };
    for (let each = 0; each < 3; each++) {
      const outcome = executeCommand(this.current(), {
        type: 'update-element',
        id: element,
        changes: { name: `Measured ${each}` },
      });
      if (!outcome.ok) continue;
      const project = outcome.state;
      const scene = time('buildScene', () => buildScene(project, this.viewId));
      time('indexScene', () => indexScene(scene));
      time('outlineOf', () => outlineOf(scene, project));
      time('modelIndexOf', () => modelIndexOf(project));
    }
    return Object.fromEntries(
      [...timings].map(([name, values]) => [name, percentile(values, 0.5)] as const),
    );
  }

  /**
   * Shapes holding nothing, wholly on screen, with a spot where a click selects them whatever the
   * canvas draws them as, clear of relations and of the toolbar: in a shuffled order or the order
   * given, `count` of them, one after another.
   */
  private targets(count: number, order?: (a: ElementShape, b: ElementShape) => number): Target[] {
    const host = this.host();
    const { width, height } = this.viewport();
    const tolerance = HIT_TOLERANCE / this.camera.scale;
    const inside = (point: Point) =>
      point.x >= 8 && point.y >= 8 && point.x <= width - 8 && point.y <= height - 8;
    const page = this.root.ownerDocument;
    // Where nothing over the canvas, such as its toolbar, takes the press; jsdom lays out nothing.
    const onCanvas = (client: Point) => {
      const top =
        typeof page.elementFromPoint === 'function'
          ? page.elementFromPoint(client.x, client.y)
          : null;
      return top === null || host.contains(top);
    };
    const selects = (shape: ElementShape, spot: Point) => {
      const client = this.client(worldToScreen(this.camera, pointIn(shape.rect, spot)));
      if (!onCanvas(client)) return false;
      const world = screenToWorld(this.camera, this.local(client));
      return [true, false].every((exact) => {
        const hit = hitAt(this.indexed, world, tolerance, () => exact);
        return hit?.kind === 'shape' && hit.shape.element === shape.element;
      });
    };
    const found: Target[] = [];
    for (const shape of this.indexed.scene.shapes) {
      const { rect } = shape;
      if (shape.holdsContents) continue;
      const topLeft = worldToScreen(this.camera, rect);
      const bottomRight = worldToScreen(this.camera, {
        x: rect.x + rect.width,
        y: rect.y + rect.height,
      });
      if (!inside(topLeft) || !inside(bottomRight)) continue;
      const spot = SPOTS.find((each) => selects(shape, each));
      if (spot) found.push({ shape, spot });
    }
    if (order) found.sort((a, b) => order(a.shape, b.shape));
    else shuffle(found, seeded(11));
    if (found.length === 0 || (count > 1 && found.length < 2)) {
      throw new Error('Too few shapes show to click one after another.');
    }
    return Array.from({ length: count }, (_, each) => found[each % found.length] as Target);
  }

  /** Zooms around the middle of the canvas to a scale, in one turn of the wheel. */
  private zoomTo(scale: number): void {
    const perUnit = -Math.log(wheelFactor(1));
    const deltaY = -Math.log(scale / this.camera.scale) / perUnit;
    this.wheel(this.host(), this.client(this.middle()), { deltaY, ctrlKey: true });
  }

  /** Turns the wheel over the canvas, and follows the camera as the canvas moves it. */
  private wheel(
    host: HTMLElement,
    at: Point,
    turn: { deltaX?: number; deltaY: number; ctrlKey?: boolean },
  ): void {
    const deltaX = turn.deltaX ?? 0;
    const ctrlKey = turn.ctrlKey ?? false;
    host.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: at.x,
        clientY: at.y,
        deltaMode: 0,
        deltaX,
        deltaY: turn.deltaY,
        ctrlKey,
      }),
    );
    this.camera = ctrlKey
      ? zoomAt(this.camera, this.local(at), wheelFactor(turn.deltaY))
      : panBy(this.camera, -deltaX, -turn.deltaY);
  }

  private pointer(target: HTMLElement, type: string, at: Point, init: PointerEventInit): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: at.x,
        clientY: at.y,
        ...init,
      }),
    );
  }

  /** Presses a key and lets it go. */
  private press(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): void {
    this.key(target, key, modifiers);
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...modifiers }),
    );
  }

  /** Presses a key, without letting it go. */
  private key(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): void {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
    );
  }

  private host(): HTMLElement {
    // By its class: its role description reads in the language the app reads in.
    const host = this.root.querySelector<HTMLElement>('.canvas-host');
    if (!host) throw new Error('The canvas is not on the page.');
    return host;
  }

  private viewport(): Size {
    const host = this.host();
    return { width: host.clientWidth, height: host.clientHeight };
  }

  /** The middle of the canvas, on a whole pixel, relative to the canvas. */
  private middle(): Point {
    const { width, height } = this.viewport();
    return { x: Math.round(width / 2), y: Math.round(height / 2) };
  }

  /** Where a point relative to the canvas is in the window, on a whole pixel. */
  private client(point: Point): Point {
    const rect = this.host().getBoundingClientRect();
    return { x: Math.round(rect.left + point.x), y: Math.round(rect.top + point.y) };
  }

  /** Where a point in the window is relative to the canvas, as the canvas works it out. */
  private local(client: Point): Point {
    const rect = this.host().getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  private inspector(): HTMLElement {
    const inspector = [...this.root.querySelectorAll('aside')].find(
      (aside) => aside.querySelector('h2')?.textContent === 'Inspector',
    );
    if (!inspector) throw new Error('The inspector is not on the page.');
    return inspector;
  }

  /** The inspector's name field, found by its label as a person finds it. */
  private nameField(): HTMLInputElement | undefined {
    const label = [...this.inspector().querySelectorAll('label')].find(
      (each) => each.textContent === 'Name',
    );
    const field = label?.htmlFor ? this.root.ownerDocument.getElementById(label.htmlFor) : null;
    return field instanceof HTMLInputElement ? field : undefined;
  }

  private inspects(name: string): boolean {
    return this.nameField()?.value === name;
  }

  private inspectsNothing(): boolean {
    return this.inspector().textContent?.includes('Nothing is selected.') ?? false;
  }

  private inspectsSeveral(): boolean {
    return /are selected\./.test(this.inspector().textContent ?? '');
  }

  /** Shows the outline in the panel left of the canvas, as it is when the app opens. */
  private showOutline(): void {
    const tab = [...this.root.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (each) => each.textContent === 'Outline',
    );
    if (!tab) throw new Error('The outline’s tab is not on the page.');
    if (tab.getAttribute('aria-selected') !== 'true') tab.click();
  }

  /** Waits for the canvas to start drawing; the canvas says why it cannot. */
  private async canvasStarted(): Promise<void> {
    for (let waited = 0; waited < MAX_WAIT_FRAMES; waited++) {
      if (this.host().querySelector('canvas')) return;
      const failure = this.root.querySelector('.canvas-failure');
      if (failure) throw new Error(failure.textContent);
      await this.frames(1);
    }
    throw new Error('The canvas did not start.');
  }

  private async frames(count: number): Promise<void> {
    for (let each = 0; each < count; each++) {
      await nextFrame();
      if (this.stopped) throw new Error('The benchmark was stopped.');
    }
  }

  private async rest(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    if (this.stopped) throw new Error('The benchmark was stopped.');
  }
}

/** Where in a shape a click goes, as fractions of its width and height: the middle first. */
const SPOTS: readonly Point[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.3 },
  { x: 0.5, y: 0.7 },
  { x: 0.3, y: 0.5 },
  { x: 0.7, y: 0.5 },
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.7 },
];

/** A shape to click, and where. */
interface Target {
  shape: ElementShape;
  spot: Point;
}

function pointIn(rect: Rect, spot: Point): Point {
  return { x: rect.x + rect.width * spot.x, y: rect.y + rect.height * spot.y };
}

/** The next frame: when it started, and when this callback was called in it. */
function nextFrame(): Promise<{ start: number; called: number }> {
  return new Promise((resolve) =>
    requestAnimationFrame((start) => resolve({ start, called: performance.now() })),
  );
}

/** Lets the promise jobs queued so far run, React's among them. */
async function drain(): Promise<void> {
  for (let each = 0; each < 10; each++) await Promise.resolve();
}

/** Types into a text field as a person would, so that React sees the change. */
function typeInto(field: HTMLInputElement, text: string): void {
  // Past the value React keeps on the field itself, so that it sees the new value as typed.
  Reflect.set(HTMLInputElement.prototype, 'value', text, field);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function elementOf(project: ProjectSnapshot, id: Id): ModelElement | undefined {
  return project.model.elements.find((element) => element.id === id);
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let each = items.length - 1; each > 0; each--) {
    const other = Math.floor(random() * (each + 1));
    [items[each], items[other]] = [items[other] as T, items[each] as T];
  }
}

// The page: builds the project, mounts the app and shows the results.
const page = document.getElementById('app-bench');
if (page) startPage(page);

function startPage(mount: HTMLElement): void {
  const search = new URLSearchParams(location.search);
  const size = Number(search.get('elements') ?? 10_000);
  const overlap: Overlap = OVERLAPS.find((each) => each === search.get('overlap')) ?? 'none';
  const strict = search.has('strict');
  const profile = search.has('profile');
  const status = document.getElementById('status') as HTMLElement;
  // Each count can be changed, as `?clicks=10`, to look into one phase quickly.
  const count = (name: string, fallback: number) => {
    const asked = Number(search.get(name) ?? fallback);
    return Number.isInteger(asked) && asked > 0 ? asked : fallback;
  };
  const began = performance.now();
  // `?pins=200` measures every phase with that many threads of comments pinned (ADR 0059).
  const project = withCommentThreads(
    syntheticProject({ elements: size, overlap }),
    count('pins', 0),
  );
  const prepared = performance.now() - began;
  const plan: BenchPlan = {
    clicks: count('clicks', 40),
    selectAlls: count('selectAlls', 10),
    frames: count('frames', 180),
    nudges: count('nudges', 20),
    renames: count('renames', 20),
    imports: count('imports', 3),
    rest: { start: 2500, between: 300 },
  };
  const app = (
    <AppBench
      project={project}
      plan={plan}
      profile={profile}
      onStatus={(text) => {
        status.textContent = text;
      }}
      onFinish={(outcome) => {
        if ('error' in outcome) {
          const { error } = outcome;
          status.textContent = `The benchmark stopped: ${error instanceof Error ? error.message : String(error)}`;
          console.error(error);
          return;
        }
        report(outcome.results, { size, overlap, strict, profile, prepared, project });
      }}
    />
  );
  status.textContent = 'Mounting the app…';
  createRoot(mount).render(strict ? <StrictMode>{app}</StrictMode> : app);
}

interface PageSetup {
  size: number;
  overlap: Overlap;
  strict: boolean;
  profile: boolean;
  prepared: number;
  project: ProjectSnapshot;
}

/** The parts of an interaction that changes the project, in the order they happen. */
const PARTS: { name: string; of: (step: Step) => number }[] = [
  { name: 'The command in the core', of: (step) => step.core },
  {
    name: 'The shell’s render and commit',
    of: (step) => (step.committed ?? step.shown) - step.core,
  },
  {
    name: 'The canvas update and the other effects',
    of: (step) => (step.effects ?? step.shown) - (step.committed ?? step.shown),
  },
  { name: 'The frame', of: (step) => step.total - (step.effects ?? step.shown) },
  { name: 'Of the render: React’s Profiler', of: (step) => step.rendering },
  { name: 'Of the effects: their own code, as React times it', of: (step) => step.passiveEffects },
  { name: 'Of the frame: the canvas drawing', of: (step) => step.work - step.shown },
];

/** How many of the largest components and methods a phase's profile lists. */
const PROFILE_TOP = 8;

function report(results: BenchResults, setup: PageSetup): void {
  const marked: boolean[] = [];
  const stepBody = document.querySelector('#steps tbody') as HTMLElement;
  const stepRows = results.steps.map((phase) => {
    const summary = summarize(phase.steps.map((step) => step.total));
    const work = summarize(phase.steps.map((step) => step.work));
    const passes = phase.mark?.passes(summary);
    if (passes !== undefined) marked.push(passes);
    addRow(stepBody, passes === undefined ? '' : passes ? 'pass' : 'fail', [
      phase.name,
      String(summary.count),
      summary.p50.toFixed(1),
      summary.p95.toFixed(1),
      summary.worst.toFixed(1),
      work.p95.toFixed(1),
      phase.mark?.text ?? 'report only',
    ]);
    return { name: phase.name, summary, work, passes };
  });
  (document.getElementById('steps') as HTMLElement).hidden = false;

  const frameBody = document.querySelector('#frames tbody') as HTMLElement;
  const frameRows = results.frames.map((phase) => {
    const summary = summarize(phase.intervals);
    const work = summarize(phase.work);
    const passes = FRAMES_MARK.passes(summary);
    marked.push(passes);
    addRow(frameBody, passes ? 'pass' : 'fail', [
      phase.name,
      summary.average.toFixed(1),
      summary.p95.toFixed(1),
      summary.worst.toFixed(1),
      `${work.average.toFixed(1)} / ${work.p95.toFixed(1)} / ${work.worst.toFixed(1)}`,
    ]);
    return { name: phase.name, summary, work, passes, workPasses: WORK_MARK.passes(work) };
  });
  (document.getElementById('frames') as HTMLElement).hidden = false;

  const partBody = document.querySelector('#parts tbody') as HTMLElement;
  const changing = results.steps.filter((phase) => phase.steps.some((step) => step.effects));
  const parts = PARTS.map((part) => {
    const figures = changing.map((phase) => summarize(phase.steps.map(part.of)));
    addRow(partBody, '', [
      part.name,
      ...figures.flatMap((figure) => [figure.p50.toFixed(1), figure.p95.toFixed(1)]),
    ]);
    return { name: part.name, figures };
  });
  const partHead = document.querySelector('#parts thead tr') as HTMLElement;
  for (const phase of changing) {
    for (const figure of ['p50', 'p95']) {
      const th = document.createElement('th');
      th.textContent = `${phase.name.split(':')[0] ?? phase.name} ${figure}`;
      partHead.appendChild(th);
    }
  }
  (document.getElementById('parts') as HTMLElement).hidden = false;

  // Where the time of the interactions that only select goes.
  const selecting = results.steps
    .filter((phase) => !changing.includes(phase))
    .map((phase) => {
      const of = (pick: (step: Step) => number) => summarize(phase.steps.map(pick));
      const listeners = of((step) => step.listeners);
      const react = of((step) => step.shown - step.listeners);
      const rendering = of((step) => step.rendering);
      const drawing = of((step) => step.work - step.shown);
      return `${phase.name}: listeners p50 ${listeners.p50.toFixed(1)} ms (p95 ${listeners.p95.toFixed(1)}); React’s render, commit and effects p50 ${react.p50.toFixed(1)} ms (p95 ${react.p95.toFixed(1)}), of which rendering p50 ${rendering.p50.toFixed(1)} ms (p95 ${rendering.p95.toFixed(1)}); the canvas drawing p50 ${drawing.p50.toFixed(1)} ms (p95 ${drawing.p95.toFixed(1)}).`;
    });

  // While profiling: for each phase, the components and methods that take the most, on average.
  const profiles = [
    ...results.steps.map((phase) => ({
      name: phase.name,
      count: phase.steps.length,
      breakdowns: phase.steps.flatMap((step) => (step.profile ? [step.profile] : [])),
    })),
    ...results.frames.map((phase) => ({
      name: phase.name,
      count: phase.intervals.length,
      breakdowns: phase.profile ? [phase.profile] : [],
    })),
  ]
    .filter((phase) => phase.breakdowns.length > 0)
    .map((phase) => {
      const per = (pick: (each: Breakdown) => Record<string, number>) =>
        largest(phase.breakdowns.map(pick), phase.count);
      const frames = largest(
        phase.breakdowns.map((each) => ({ ...each.frames })),
        phase.count,
      );
      return {
        name: phase.name,
        components: per((each) => each.components),
        effects: per((each) => each.effects),
        methods: per((each) => each.methods),
        frames,
      };
    });
  const listed = (entries: [string, number][]) =>
    entries.map(([name, ms]) => `${name} ${ms.toFixed(1)}`).join(', ') || 'none';
  const profileLines = profiles.map(
    (phase) =>
      `${phase.name}, ms per step. Rendering: ${listed(phase.components)}. Effects: ${listed(phase.effects)}. Canvas: ${listed(phase.methods)}. Long frames: ${listed(phase.frames)}.`,
  );

  const passed = marked.every(Boolean);
  const relations = setup.project.model.relations.length;
  const build = import.meta.env.DEV ? 'development' : 'production';
  const status = document.getElementById('status') as HTMLElement;
  status.textContent = `${setup.size.toLocaleString()} elements and ${relations.toLocaleString()} relations, overlap “${setup.overlap}”; React ${build} build${setup.strict ? ' in StrictMode' : ''}${setup.profile ? ', profiling' : ''}. Project built in ${setup.prepared.toFixed(0)} ms; the app mounted in ${results.mounted.toFixed(0)} ms. Frames start every ${results.frameInterval.toFixed(1)} ms here.`;
  showVerdict(document.getElementById('verdict') as HTMLElement, passed, {
    pass: 'Meets every mark.',
    fail: 'Misses at least one mark.',
  });
  (document.getElementById('notes') as HTMLElement).textContent = [
    ...(results.frameInterval > 1000 / TARGET_FPS + 2
      ? [
          `This browser starts a frame only every ${results.frameInterval.toFixed(1)} ms, not every ${(1000 / TARGET_FPS).toFixed(1)} ms: the marks on frames cannot be met here, and the work columns say what the app costs.`,
        ]
      : []),
    ...(import.meta.env.DEV
      ? [
          'React’s development build logs each component’s render and effects for the Performance panel while it runs the effects: the time between the effects’ own code and the canvas update, below, is that logging, which a production build leaves out.',
        ]
      : []),
    `Canvas ${results.viewport.width} × ${results.viewport.height} px; shapes are clicked at scale ${results.clickScale.toFixed(3)}.`,
    'Interactions: from the input event to the second requestAnimationFrame callback after React committed the change; the canvas draws in the first of those frames. Work: the main thread’s time from the input event until the canvas drew, without waiting for a frame to start.',
    `Pan and zoom pass with frames as shown at ${FRAMES_MARK.text} ms. One input event a frame, timed by requestAnimationFrame timestamps; work (avg / p95 / worst) is each event’s listeners and React’s work for it, then the canvas drawing it in the next frame, without the GPU, which the canvas benchmark judges at ${WORK_MARK.text} ms.`,
    ...selecting,
    ...(results.functions
      ? [
          `On their own, on a changed project: ${Object.entries(results.functions)
            .map(([name, ms]) => `${name} ${ms.toFixed(1)} ms`)
            .join(', ')}.`,
        ]
      : []),
    ...profileLines,
  ].join('\n');

  const json = {
    elements: setup.size,
    relations,
    overlap: setup.overlap,
    build,
    strict: setup.strict,
    prepared: setup.prepared,
    mounted: results.mounted,
    frameInterval: results.frameInterval,
    viewport: results.viewport,
    clickScale: results.clickScale,
    steps: stepRows,
    frames: frameRows,
    parts: parts.map(({ name, figures }) => ({
      name,
      figures: figures.map((figure, at) => ({ phase: changing[at]?.name, ...figure })),
    })),
    selecting,
    functions: results.functions,
    profiles,
    passed,
  };
  Object.assign(window, { appBenchmark: { results, report: json } });
  console.info('Visual Anything app benchmark', JSON.stringify(json));
}

/** The largest totals of a series of breakdowns, divided by how many steps they come from. */
function largest(totals: Record<string, number>[], count: number): [string, number][] {
  const sum = new Map<string, number>();
  for (const each of totals) {
    for (const [name, ms] of Object.entries(each)) sum.set(name, (sum.get(name) ?? 0) + ms);
  }
  return [...sum]
    .map(([name, ms]): [string, number] => [name, ms / Math.max(1, count)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, PROFILE_TOP);
}
