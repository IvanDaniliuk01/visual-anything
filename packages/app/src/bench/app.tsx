/**
 * The app benchmark: mounts the whole app, the shell with its outline, its inspector and the canvas, on
 * a synthetic project of 10,000 elements, and uses it as a person would, through pointer, wheel and key
 * events on the real elements. It plays the local program itself: each command runs in the core and
 * the project it gives goes back to the shell. Open `/app-bench.html` from the dev server;
 * `?elements=N` and `?overlap=…` work as on `/bench.html`, and `?strict` mounts the app in React's
 * StrictMode, as `main.tsx` does, which renders everything twice in development.
 *
 * Each interaction is timed from its input event to the second animation frame after React has
 * committed what it changed: the first of the two frames draws the canvas, the second starts once
 * that frame was shown. Panning and zooming are measured as the frames the browser shows, one input
 * event a frame, so the window must be in front.
 */
import { applyOperations, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
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
  fitCamera,
  panBy,
  screenToWorld,
  wheelFactor,
  worldToScreen,
  zoomAt,
  type Camera,
} from '../canvas/camera';
import type { SendCommand } from '../canvas/CanvasArea';
import { centerOf, type Point, type Size } from '../canvas/geometry';
import { hitAt, indexScene, type IndexedScene } from '../canvas/hit';
import { NAMES_FROM } from '../canvas/renderer';
import { buildScene, type ElementShape } from '../canvas/scene';
import { ProjectErrorBoundary } from '../shell/ProjectErrorBoundary';
import { Shell } from '../shell/Shell';
import { SHOWN, TARGET_FPS, WORK, addRow, showVerdict, summarize, type Summary } from './report';
import { OVERLAPS, seeded, syntheticProject, type Overlap } from './synthetic';
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
  /** How long to rest after the canvas starts, and between phases, in milliseconds. */
  rest: { start: number; between: number };
}

/** One interaction, in milliseconds from its input event. */
export interface Step {
  /** To the start of the second frame after the change was committed. */
  total: number;
  /** Until the event's listeners returned. */
  listeners: number;
  /** Until what the step waits for showed: the inspector or the project changed. */
  shown: number;
  /** Spent running commands in the core, and applying their operations. */
  core: number;
  /** Spent rendering in React, as the Profiler measures it, and in how many commits. */
  rendering: number;
  commits: number;
  /** Until the shell committed a new project, and until the effects of that commit ran. */
  committed?: number;
  effects?: number;
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
}

export interface BenchResults {
  steps: StepPhase[];
  frames: FramePhase[];
  /** From the first render of the app to the end of its first commit's effects. */
  mounted: number;
  /** The canvas's size, and the scale it clicks shapes at. */
  viewport: Size;
  clickScale: number;
}

interface AppBenchProps {
  project: ProjectSnapshot;
  plan: BenchPlan;
  /** Says what the benchmark is doing. */
  onStatus?: (text: string) => void;
  /** Called once, with the results or with why the benchmark stopped. */
  onFinish: (outcome: { results: BenchResults } | { error: unknown }) => void;
}

/** Clicks shapes where names show, as a person does who reads what they click. */
const CLICK_SCALE = NAMES_FROM * 1.3;
/** Copied from the renderer and the controller, which keep them to themselves. */
const FIT_MARGIN = 32;
const HIT_TOLERANCE = 6;
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

/**
 * The app as `LiveApp` mounts it, with a local program of its own, and the benchmark that drives it
 * once the canvas has started.
 */
export function AppBench({ project, plan, onStatus, onFinish }: AppBenchProps) {
  const [shown, setShown] = useState(project);
  const [trace] = useState(() => new Trace());
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
      const outcome = executeCommand(current.current, command);
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
    (_id, _phase, actualDuration) => trace.render(actualDuration),
    [trace],
  );

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
      <Profiler id="shell" onRender={onRender}>
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
  private readonly refusals: string[] = [];
  /** The project whose commit's effects ran last, and when the first ever ran. */
  private effected: ProjectSnapshot | undefined;
  private firstEffects: number | undefined;
  private readonly created = performance.now();

  begin(): void {
    this.began = performance.now();
    this.core = 0;
    this.rendering = 0;
    this.commits = 0;
    this.committedAt = undefined;
    this.effectsAt = undefined;
  }

  run(core: number): void {
    this.core += core;
  }

  refuse(problems: string): void {
    this.refusals.push(problems);
  }

  render(actualDuration: number): void {
    this.rendering += actualDuration;
    this.commits += 1;
  }

  commit(): void {
    this.committedAt = performance.now();
  }

  affect(project: ProjectSnapshot): void {
    this.effectsAt = performance.now();
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

  end(): Pick<Step, 'core' | 'rendering' | 'commits' | 'committed' | 'effects'> {
    return {
      core: this.core,
      rendering: this.rendering,
      commits: this.commits,
      ...(this.committedAt === undefined ? {} : { committed: this.committedAt - this.began }),
      ...(this.effectsAt === undefined ? {} : { effects: this.effectsAt - this.began }),
    };
  }
}

/** Drives the app through its elements and times what it does. */
class Driver {
  private stopped = false;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private readonly indexed: IndexedScene;
  private readonly names: Map<Id, string>;

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
    this.showOutline();
    const host = this.host();
    host.focus();
    // Fitted, then zoomed in around the middle to where names show.
    this.key(host, '0');
    this.camera = fitCamera(this.indexed.scene.bounds, this.viewport(), FIT_MARGIN);
    this.zoomTo(CLICK_SCALE);
    await this.frames(2);

    const steps: StepPhase[] = [];
    const frames: FramePhase[] = [];

    this.status(`Clicking ${this.plan.clicks} shapes…`);
    const clicks: Step[] = [];
    for (const shape of this.targets(this.plan.clicks)) clicks.push(await this.click(shape));
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
      await this.untimed(
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
    await this.untimed(
      () => this.press(host, 'Escape'),
      () => this.inspectsNothing(),
    );
    await this.rest(this.plan.rest.between);

    // A shape at the left of its container, so that moving it right keeps it inside.
    const [moved] = this.targets(1, (a, b) => a.offset.x - b.offset.x);
    if (!moved) throw new Error('No shape shows to move.');
    await this.click(moved);
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

    const viewport = this.viewport();
    return {
      steps,
      frames,
      mounted: this.trace.mounted ?? 0,
      viewport,
      clickScale: CLICK_SCALE,
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
  private async click(shape: ElementShape): Promise<Step> {
    const host = this.host();
    const at = this.client(worldToScreen(this.camera, centerOf(shape.rect)));
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
    }
    const shown = performance.now() - began;
    await this.frames(2);
    return { total: performance.now() - began, listeners, shown, ...this.trace.end() };
  }

  private async untimed(act: () => void, done: () => boolean): Promise<void> {
    await this.step(act, done);
  }

  /**
   * Makes one input a frame for `count` frames, and records the time between frames and the work of
   * each input: its listeners and what React did after them, then the drawing in the next frame.
   */
  private measureFrames(
    count: number,
    step: (frame: number) => void,
  ): Promise<Pick<FramePhase, 'intervals' | 'work'>> {
    return new Promise((resolve) => {
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
  }

  /**
   * Shapes holding nothing, wholly on screen, that a click at their middle selects whatever the canvas
   * draws them as, in a shuffled order or the order given, `count` of them, one after another.
   */
  private targets(count: number, order?: (a: ElementShape, b: ElementShape) => number) {
    const { width, height } = this.viewport();
    const tolerance = HIT_TOLERANCE / this.camera.scale;
    const inside = (point: Point) =>
      point.x >= 8 && point.y >= 8 && point.x <= width - 8 && point.y <= height - 8;
    const found = this.indexed.scene.shapes.filter((shape) => {
      const { rect } = shape;
      if (shape.holdsContents) return false;
      const topLeft = worldToScreen(this.camera, rect);
      const bottomRight = worldToScreen(this.camera, {
        x: rect.x + rect.width,
        y: rect.y + rect.height,
      });
      if (!inside(topLeft) || !inside(bottomRight)) return false;
      const client = this.client(worldToScreen(this.camera, centerOf(rect)));
      const world = screenToWorld(this.camera, this.local(client));
      return [true, false].every((exact) => {
        const hit = hitAt(this.indexed, world, tolerance, () => exact);
        return hit?.kind === 'shape' && hit.shape.element === shape.element;
      });
    });
    if (order) found.sort(order);
    else shuffle(found, seeded(11));
    if (found.length === 0 || (count > 1 && found.length < 2)) {
      throw new Error('Too few shapes show to click one after another.');
    }
    return Array.from({ length: count }, (_, each) => found[each % found.length] as ElementShape);
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
    const host = this.root.querySelector<HTMLElement>('[aria-roledescription="canvas"]');
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (this.stopped) throw new Error('The benchmark was stopped.');
    }
  }

  private async rest(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    if (this.stopped) throw new Error('The benchmark was stopped.');
  }
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
  const status = document.getElementById('status') as HTMLElement;
  const began = performance.now();
  const project = syntheticProject({ elements: size, overlap });
  const prepared = performance.now() - began;
  const plan: BenchPlan = {
    clicks: 40,
    selectAlls: 10,
    frames: 180,
    nudges: 20,
    renames: 20,
    rest: { start: 2500, between: 300 },
  };
  const app = (
    <AppBench
      project={project}
      plan={plan}
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
        report(outcome.results, { size, overlap, strict, prepared, project });
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
    name: 'The canvas update (effects)',
    of: (step) => (step.effects ?? step.shown) - (step.committed ?? step.shown),
  },
  { name: 'The frame', of: (step) => step.total - (step.effects ?? step.shown) },
  { name: 'Of the render: React’s Profiler', of: (step) => step.rendering },
];

function report(results: BenchResults, setup: PageSetup): void {
  const marked: boolean[] = [];
  const stepBody = document.querySelector('#steps tbody') as HTMLElement;
  const stepRows = results.steps.map((phase) => {
    const summary = summarize(phase.steps.map((step) => step.total));
    const passes = phase.mark?.passes(summary);
    if (passes !== undefined) marked.push(passes);
    addRow(stepBody, passes === undefined ? '' : passes ? 'pass' : 'fail', [
      phase.name,
      String(summary.count),
      summary.p50.toFixed(1),
      summary.p95.toFixed(1),
      summary.worst.toFixed(1),
      phase.mark?.text ?? 'report only',
    ]);
    return { name: phase.name, summary, passes };
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
      work.p95.toFixed(1),
    ]);
    return { name: phase.name, summary, work, passes };
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
      const frame = of((step) => step.total - step.shown);
      return `${phase.name}: listeners p50 ${listeners.p50.toFixed(1)} ms (p95 ${listeners.p95.toFixed(1)}); React’s render, commit and effects p50 ${react.p50.toFixed(1)} ms (p95 ${react.p95.toFixed(1)}), of which rendering p50 ${rendering.p50.toFixed(1)} ms (p95 ${rendering.p95.toFixed(1)}); the frame p50 ${frame.p50.toFixed(1)} ms (p95 ${frame.p95.toFixed(1)}).`;
    });

  const passed = marked.every(Boolean);
  const relations = setup.project.model.relations.length;
  const status = document.getElementById('status') as HTMLElement;
  status.textContent = `${setup.size.toLocaleString()} elements and ${relations.toLocaleString()} relations, overlap “${setup.overlap}”; React ${import.meta.env.DEV ? 'development' : 'production'} build${setup.strict ? ' in StrictMode' : ''}. Project built in ${setup.prepared.toFixed(0)} ms; the app mounted in ${results.mounted.toFixed(0)} ms.`;
  showVerdict(document.getElementById('verdict') as HTMLElement, passed, {
    pass: 'Meets every mark.',
    fail: 'Misses at least one mark.',
  });
  (document.getElementById('notes') as HTMLElement).textContent = [
    `Canvas ${results.viewport.width} × ${results.viewport.height} px; shapes are clicked at scale ${results.clickScale.toFixed(3)}.`,
    'Interactions: from the input event to the second requestAnimationFrame callback after React committed the change; the canvas draws in the first of those frames.',
    'Pan and zoom: one input event a frame, timed as the frames shown (requestAnimationFrame timestamps); the work column adds the listeners and React’s work for each event to the canvas drawing it in the next frame, without the GPU.',
    ...selecting,
  ].join('\n');

  const json = {
    elements: setup.size,
    relations,
    overlap: setup.overlap,
    build: import.meta.env.DEV ? 'development' : 'production',
    strict: setup.strict,
    prepared: setup.prepared,
    mounted: results.mounted,
    viewport: results.viewport,
    clickScale: results.clickScale,
    steps: stepRows,
    frames: frameRows,
    parts: parts.map(({ name, figures }) => ({
      name,
      figures: figures.map((figure, at) => ({ phase: changing[at]?.name, ...figure })),
    })),
    selecting,
    passed,
  };
  Object.assign(window, { appBenchmark: { results, report: json } });
  console.info('Visual Anything app benchmark', JSON.stringify(json));
}
