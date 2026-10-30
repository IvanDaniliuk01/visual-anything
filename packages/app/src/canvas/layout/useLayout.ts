/**
 * Layout on the canvas: shapes that appear without a position are laid out automatically, and the
 * toolbar's Layout lays out the view, or the selected container's contents, on demand, as Claude's
 * guidance can ask it to (ADR-0029). Every layout
 * runs in the layout worker; its result is stored as one undoable action, unpinned, and moves in on
 * the canvas unless the system asks for reduced motion (ADR-0009, ADR-0015).
 *
 * Automatic layout places the shapes that the view shows without a position when it opens, and each
 * new one after that, such as the elements Claude adds. A shape whose position an undo took away is
 * not new, so it stays where the canvas puts it, and undo can go on past the layout. It asks to join the
 * newest action, so that the placement of what an action added is part of it (ADR 0065); the local
 * program decides whether it does.
 */
import {
  modelIndexOf,
  MAX_LAYOUT_WHY,
  type Command,
  type LayoutEnding,
  type LayoutResult,
  type ListedAction,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sizeOf, type Selection } from '../../editor/selection';
import type { GuidedLayoutAnswer, GuidedLayoutRequest } from '../../guidance/state';
import { t } from '../../i18n';
import type { Scene } from '../scene';
import { setCollapsedCommand } from '../collapse';
import { LayoutStopped } from './client';
import { layoutCommand } from './command';
import { expansionCommand, expansionMemory, planExpansion } from './expand';
import { keepRoutes, type KeptRoutes } from './keptRoutes';
import { useLayoutRunner } from './runnerContext';
import { layoutInput, waitsForLayout, type LayoutScope } from './input';
import {
  frameAt,
  retargeted,
  sameGeometry,
  TRANSITION_MS,
  transitionBetween,
  type Transition,
} from './transition';
import type { LaidOutRoute, LayoutProgress } from './types';
import { useReducedMotion } from '../../scenarios/motion';

export { LayoutRunnerContext } from './runnerContext';

/** How long automatic layout waits for more new shapes before it runs, in milliseconds. */
export const AUTO_DELAY = 120;

/** The toolbar's Layout control. */
export interface LayoutControl {
  /** What the button says: Layout, or Stop layout with how far the layout under way has come. */
  label: string;
  /** What it lays out now, how far a layout under way has come, or why it cannot lay out. */
  title: string;
  enabled: boolean;
  /** Whether a layout is under way, asked for or automatic. */
  busy: boolean;
  /** Lays out; while a layout is under way, stops it. */
  run: () => void;
}

/** A layout under way: how many shapes it arranges, how far it has come, and how to stop it. */
interface Running {
  shapes: number;
  progress: LayoutProgress | undefined;
  stop: () => void;
}

export interface LayoutOptions {
  project: ProjectSnapshot;
  view: ViewFile;
  /** The scene of the view as the project has it now. */
  scene: Scene;
  selection: Selection;
  /**
   * Sends a command; absent while the project cannot be changed. An automatic layout asks to join the
   * newest action with `joins` (ADR 0065).
   */
  send: ((command: Command, options?: { joins?: number }) => Promise<{ ok: boolean }>) | undefined;
  /** Says something to screen readers. */
  announce: (text: string) => void;
  /**
   * Claude's latest request for a layout, as the tab's guidance holds it (ADR-0029): run once, as
   * Layout runs, when the view it names is the one open.
   */
  guided?: GuidedLayoutRequest;
  /** The actions of the history, as the local program last listed them, oldest first. */
  actions?: readonly ListedAction[];
  /**
   * Called once every layout Claude's request asked for is done or given up, with what they laid
   * out: the canvas then fits it, so that the person sees what moved (ADR-0029's clarification of
   * 2026-10-26).
   */
  onGuidedDone?: (scopes: readonly LayoutScope[]) => void;
  /**
   * Called once for each of Claude's requests that waits for an answer, which the tab sends the local
   * program: what each layout it asked for came to, or why this tab ran none (M3d).
   */
  onGuidedAnswered?: (request: GuidedLayoutRequest, answer: GuidedLayoutAnswer) => void;
}

/** How one layout ended, and how many shapes it moved. */
interface Ended {
  ended: LayoutEnding;
  moved: number;
  why?: string;
}

/** A layout's change on its way: the scene it was made from, to move in from once it is drawn. */
interface Armed {
  before: Scene;
  project: ProjectSnapshot;
  view: Id;
  animate: boolean;
  /** The routes ELK gave, kept once the change is drawn (ADR 0080, section 2). */
  routes?: readonly LaidOutRoute[] | undefined;
}

/**
 * A layout moving in: the move, how far through it is, and the move it started as, which stays the
 * same while a live update retargets it, so that its frames go on rather than start again.
 */
interface Moving {
  transition: Transition;
  progress: number;
  started: Transition;
}

/**
 * Layout for one canvas: the scene to draw, which is a frame of a layout moving in or else `scene`,
 * and the toolbar's control.
 */
export function useLayout({
  project,
  view,
  scene,
  selection,
  send,
  announce,
  guided,
  actions,
  onGuidedDone,
  onGuidedAnswered,
}: LayoutOptions): {
  scene: Scene;
  control: LayoutControl;
  /** ELK's routes from the last layout in one pass of this view, while some of them hold. */
  routes: KeptRoutes | undefined;
  /**
   * Expands containers in place by hand (ADR 0080, section 4), in one undoable action under `label`,
   * after the layouts asked for before; `zoomExpanded` are those the zoom shows expanded. Says
   * whether it was done.
   */
  expand: (
    elements: readonly Id[],
    label: string,
    zoomExpanded?: ReadonlySet<Id>,
  ) => Promise<boolean>;
} {
  const runner = useLayoutRunner();
  const editable = send !== undefined;

  // Moving shapes into place follows the person's Motion preference (ADR 0077, ADR 0032).
  const reducedMotion = useReducedMotion();
  const latest = useRef({ project, view, scene, send, announce, actions, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { project, view, scene, send, announce, actions, reducedMotion };
  });

  const [running, setRunning] = useState<Running>();
  const [armed, setArmed] = useState<Armed>();
  const [moving, setMoving] = useState<Moving>();
  const [kept, setKept] = useState<{ view: Id; routes: KeptRoutes | undefined }>();
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Once a layout's change is drawn, it moves in from the scene it was made from.
  if (armed && (armed.view !== view.id || (project !== armed.project && scene !== armed.before))) {
    setArmed(undefined);
    // A layout in one pass brings ELK's routes, which hold from the scene it made (ADR 0080).
    if (armed.view === view.id && armed.routes) {
      setKept({ view: view.id, routes: keepRoutes(scene, armed.routes) });
    }
    const transition =
      armed.animate && armed.view === view.id ? transitionBetween(armed.before, scene) : undefined;
    setMoving(transition && { transition, progress: 0, started: transition });
  } else if (moving && moving.transition.to !== scene) {
    // A live update reads otherwise in the same places (ADR 0057): the move goes on to it. Anything
    // that moved a shape or a line meanwhile shows as it is now.
    setMoving(
      sameGeometry(moving.transition.to, scene)
        ? { ...moving, transition: retargeted(moving.transition, scene) }
        : undefined,
    );
  }

  // Each frame moves on the move it started as, whatever it now ends on.
  const started = moving?.started;
  useEffect(() => {
    if (!started) return;
    const ours = (now: Moving | undefined): now is Moving => now?.started === started;
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = (time - start) / TRANSITION_MS;
      if (progress >= 1) {
        setMoving((now) => (ours(now) ? undefined : now));
        return;
      }
      setMoving((now) => (ours(now) ? { ...now, progress } : now));
      frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started]);

  const drawn = useMemo(
    () =>
      moving && moving.transition.to === scene
        ? frameAt(moving.transition, moving.progress)
        : scene,
    [moving, scene],
  );

  /**
   * Runs one layout after the ones asked for before it, and stores its result as one action; says how
   * it ended and how many shapes it moved.
   */
  const enqueue = (scope: LayoutScope, automatic: boolean): Promise<Ended> => {
    const run = queue.current.then(async (): Promise<Ended> => {
      const asked = latest.current;
      if (!runner) return failed('This browser runs no web workers.');
      if (!asked.send) return failed(NOT_CONNECTED);
      const input = layoutInput(asked.scene, asked.project, scope);
      if (!input) {
        if (!automatic) {
          asked.announce(t('Every shape there is pinned, so layout leaves them all.'));
        }
        return { ended: 'done', moved: 0 };
      }
      // While it runs, the control shows how far it has come, and stops it when pressed.
      const stopper = new AbortController();
      const shown: Running = {
        shapes: input.shapes.filter((shape) => shape.free).length,
        progress: undefined,
        stop: () => stopper.abort(),
      };
      const ours = (current: Running | undefined) => current?.stop === shown.stop;
      setRunning(shown);
      let laidOut;
      try {
        laidOut = await runner.layOut(input, {
          signal: stopper.signal,
          onProgress: (progress) =>
            setRunning((current) => (ours(current) ? { ...shown, progress } : current)),
        });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        latest.current.announce(
          error instanceof LayoutStopped
            ? t('Layout stopped, and nothing moved.')
            : t('The layout failed: {why}', { why: t.message(why) }),
        );
        return error instanceof LayoutStopped ? { ended: 'stopped', moved: 0 } : failed(why);
      } finally {
        setRunning((current) => (ours(current) ? undefined : current));
      }
      const now = latest.current;
      // The tab shows another view now: nothing moves.
      if (now.view.id !== asked.view.id) return { ended: 'replaced', moved: 0 };
      if (!now.send) return failed(NOT_CONNECTED);
      const action = layoutCommand(now.project, now.view.id, now.scene, scope, laidOut.shapes);
      if (!action) {
        if (!automatic) now.announce(t('Layout leaves every shape where it is.'));
        return { ended: 'done', moved: 0 };
      }
      setArmed({
        before: now.scene,
        project: now.project,
        view: now.view.id,
        animate: typeof requestAnimationFrame === 'function' && !now.reducedMotion,
        routes: laidOut.routes,
      });
      // Placing new shapes asks to join the newest action, which may be what added them (ADR 0065).
      const joins = automatic ? newestDone(now.actions) : undefined;
      const sent = await now.send(action.command, joins === undefined ? undefined : { joins });
      if (!sent.ok) {
        setArmed(undefined);
        return failed('Visual Anything refused the change the layout made.');
      }
      if (!automatic) {
        latest.current.announce(
          t(
            { one: '{action}: {count} shape moved.', other: '{action}: {count} shapes moved.' },
            { action: t.message(labelOf(action.command)), count: action.moved },
          ),
        );
      }
      return { ended: 'done', moved: action.moved };
    });
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  // Shapes without a position, when the view opens and as they appear, wait for automatic layout,
  // which runs once no more have come for a moment.
  const seen = useRef<{ view: Id; keys: Set<string> } | undefined>(undefined);
  const waiting = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const layOutSoon = useEffectEvent(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // While the project cannot be changed, they wait on, for when it can again.
      if (!latest.current.send) return;
      const keys = waiting.current;
      waiting.current = new Set();
      void enqueue({ kind: 'new', keys }, true);
    }, AUTO_DELAY);
  });
  useEffect(() => {
    const last = seen.current;
    const opened = last === undefined || last.view !== view.id;
    if (opened) waiting.current = new Set();
    const keys = new Set<string>();
    for (const shape of scene.shapes) {
      keys.add(shape.key);
      if (waitsForLayout(shape) && (opened || !last.keys.has(shape.key))) {
        waiting.current.add(shape.key);
      }
    }
    seen.current = { view: view.id, keys };
    if (waiting.current.size > 0 && editable && runner) layOutSoon();
  }, [scene, view.id, editable, runner]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Claude's request runs once, as Layout does, once its view is open and the project can change: the
  // whole view, or the contents of each container it names that the canvas draws holding contents.
  const ran = useRef<number | undefined>(undefined);
  const guidedDone = useEffectEvent((scopes: readonly LayoutScope[]) => onGuidedDone?.(scopes));
  const guidedAnswered = useEffectEvent(
    (request: GuidedLayoutRequest, answer: GuidedLayoutAnswer) => {
      if (request.answer !== undefined) onGuidedAnswered?.(request, answer);
    },
  );
  const layOutAsked = useEffectEvent((request: GuidedLayoutRequest) => {
    ran.current = request.request;
    // Each container asked for is answered, in order: one the canvas draws holding no shapes, empty.
    const asked: (LayoutScope | Id)[] =
      request.containers === undefined
        ? [{ kind: 'view' }]
        : request.containers.map((container) =>
            holdsShapes(latest.current.scene, container)
              ? { kind: 'contents', container }
              : container,
          );
    const scopes = asked.filter((each): each is LayoutScope => typeof each !== 'string');
    const runs = asked.map((each) =>
      typeof each === 'string'
        ? Promise.resolve<LayoutResult>({ container: each, ended: 'empty', moved: 0 })
        : enqueue(each, false).then((ended): LayoutResult => ({
            ...(each.kind === 'contents' ? { container: each.container } : {}),
            ...ended,
          })),
    );
    void Promise.all(runs).then((layouts) => {
      guidedDone(scopes);
      guidedAnswered(request, { layouts });
    });
  });
  useEffect(() => {
    if (!guided || ran.current === guided.request || !editable) return;
    if (!runner) {
      // Without web workers nothing is laid out: Claude hears so rather than waiting (M3d).
      ran.current = guided.request;
      guidedAnswered(guided, { passed: 'cannot-lay-out' });
      return;
    }
    if (guided.view !== undefined && guided.view !== view.id) return;
    layOutAsked(guided);
  }, [guided, editable, runner, view.id]);

  const target = useMemo(() => targetOf(scene, selection), [scene, selection]);
  const nameOf = (id: Id) => modelIndexOf(project).element(id)?.name ?? id;
  let control: LayoutControl;
  if (running) {
    const { done = 0, total = 0 } = running.progress ?? {};
    const percent = total > 0 ? Math.round((100 * done) / total) : undefined;
    const values = { count: running.shapes, percent: percent ?? 0 };
    control = {
      label: percent === undefined ? t('Stop layout') : t('Stop layout ({percent}%)', values),
      title:
        percent === undefined
          ? t(
              {
                one: 'Laying out {count} shape. Press to stop it; nothing moves then.',
                other: 'Laying out {count} shapes. Press to stop it; nothing moves then.',
              },
              values,
            )
          : t(
              {
                one: 'Laying out {count} shape: {percent}% done. Press to stop it; nothing moves then.',
                other:
                  'Laying out {count} shapes: {percent}% done. Press to stop it; nothing moves then.',
              },
              values,
            ),
      enabled: true,
      busy: true,
      run: running.stop,
    };
  } else {
    const enabled = runner !== undefined && editable;
    const title = !runner
      ? t('Layout needs web workers, which this browser does not offer.')
      : !editable
        ? t('Visual Anything is not connected, so nothing can be laid out.')
        : target.kind === 'contents'
          ? t(
              'Lay out the contents of "{name}": arrange the shapes inside it that are not pinned.',
              { name: nameOf(target.container) },
            )
          : t('Lay out "{name}": arrange every shape that is not pinned.', { name: view.name });
    control = {
      label: t('Layout'),
      title,
      enabled,
      busy: false,
      run: () => {
        // Pressed while it cannot lay out, it says why, as the stacking buttons do.
        if (!enabled) {
          announce(title);
          return;
        }
        void enqueue(target, false);
      },
    };
  }

  const expand = (
    elements: readonly Id[],
    label: string,
    zoomExpanded?: ReadonlySet<Id>,
  ): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const asked = latest.current;
      const sendNow = asked.send;
      if (!sendNow) return false;
      const plainly = async () =>
        (await sendNow(setCollapsedCommand(asked.view.id, elements, false))).ok;
      const plan = runner
        ? planExpansion(asked.project, asked.view.id, asked.scene, elements, zoomExpanded)
        : undefined;
      if (!runner || !plan?.input) return plainly();
      let laidOut;
      try {
        laidOut = await runner.layOut(plan.input);
      } catch {
        // Without its layout, the container still expands, where its contents are.
        return plainly();
      }
      const now = latest.current;
      if (now.view.id !== asked.view.id || !now.send) return false;
      const made = expansionCommand(asked.view.id, elements, plan, laidOut.shapes, label);
      setArmed({
        before: now.scene,
        project: now.project,
        view: now.view.id,
        animate: typeof requestAnimationFrame === 'function' && !now.reducedMotion,
      });
      const sent = await now.send(made.command);
      if (!sent.ok) {
        setArmed(undefined);
        return false;
      }
      expansionMemory.remember(asked.view.id, elements, made.moved);
      return true;
    });
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    scene: drawn,
    control,
    routes: kept?.view === view.id ? kept.routes : undefined,
    expand,
  };
}

/**
 * What Layout lays out: the contents of the one element selected when its shape holds contents, and
 * the whole view otherwise.
 */
function targetOf(scene: Scene, selection: Selection): LayoutScope {
  const [only] = selection.elements;
  if (sizeOf(selection) !== 1 || only === undefined) return { kind: 'view' };
  return holdsShapes(scene, only) ? { kind: 'contents', container: only } : { kind: 'view' };
}

/**
 * Whether the canvas draws a container holding shapes to lay out. A shape that draws rows has nothing
 * inside it to lay out: its rows are placed in order.
 */
function holdsShapes(scene: Scene, container: Id): boolean {
  return scene.shapes.some(
    (shape) => shape.element === container && shape.holdsContents && shape.rowCount === undefined,
  );
}

/** The id of the newest action the history lists as done, which an undo would take back. */
function newestDone(actions: readonly ListedAction[] | undefined): number | undefined {
  return actions?.findLast((action) => !action.undone)?.id;
}

/** Why a layout could not change the project, as Claude hears it. */
const NOT_CONNECTED = 'Visual Anything is not connected.';

/** A layout that failed, with why, cut to what an answer carries. */
function failed(why: string): Ended {
  return { ended: 'failed', moved: 0, why: why.slice(0, MAX_LAYOUT_WHY) };
}

function labelOf(command: Command): string {
  return command.type === 'batch' ? command.label : 'Lay out';
}
