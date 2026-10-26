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
  type Command,
  type ListedAction,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sizeOf, type Selection } from '../../editor/selection';
import type { GuidedLayoutRequest } from '../../guidance/state';
import { t } from '../../i18n';
import type { Scene } from '../scene';
import { LayoutStopped, sharedRunner, type LayoutRunner } from './client';
import { layoutCommand } from './command';
import { layoutInput, type LayoutScope } from './input';
import {
  frameAt,
  prefersReducedMotion,
  retargeted,
  sameGeometry,
  TRANSITION_MS,
  transitionBetween,
  type Transition,
} from './transition';
import type { LayoutProgress } from './types';

/**
 * What runs the canvas's layouts: by default (null) the layout worker every canvas shares; tests give
 * a runner of their own, and undefined turns layout off.
 */
export const LayoutRunnerContext = createContext<LayoutRunner | null | undefined>(null);

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
}

/** A layout's change on its way: the scene it was made from, to move in from once it is drawn. */
interface Armed {
  before: Scene;
  project: ProjectSnapshot;
  view: Id;
  animate: boolean;
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
}: LayoutOptions): {
  scene: Scene;
  control: LayoutControl;
} {
  const given = useContext(LayoutRunnerContext);
  const [shared] = useState(() => (given === null ? sharedRunner() : undefined));
  const runner = given === null ? shared : given;
  const editable = send !== undefined;

  const latest = useRef({ project, view, scene, send, announce, actions });
  useLayoutEffect(() => {
    latest.current = { project, view, scene, send, announce, actions };
  });

  const [running, setRunning] = useState<Running>();
  const [armed, setArmed] = useState<Armed>();
  const [moving, setMoving] = useState<Moving>();
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Once a layout's change is drawn, it moves in from the scene it was made from.
  if (armed && (armed.view !== view.id || (project !== armed.project && scene !== armed.before))) {
    setArmed(undefined);
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

  /** Runs one layout after the ones asked for before it, and stores its result as one action. */
  const enqueue = (scope: LayoutScope, automatic: boolean): Promise<void> => {
    const run = queue.current.then(async () => {
      const asked = latest.current;
      if (!runner || !asked.send) return;
      const input = layoutInput(asked.scene, asked.project, scope);
      if (!input) {
        if (!automatic) {
          asked.announce(t('Every shape there is pinned, so layout leaves them all.'));
        }
        return;
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
        latest.current.announce(
          error instanceof LayoutStopped
            ? t('Layout stopped, and nothing moved.')
            : t('The layout failed: {why}', {
                why: t.message(error instanceof Error ? error.message : String(error)),
              }),
        );
        return;
      } finally {
        setRunning((current) => (ours(current) ? undefined : current));
      }
      const now = latest.current;
      if (now.view.id !== asked.view.id || !now.send) return;
      const action = layoutCommand(now.project, now.view.id, now.scene, scope, laidOut.shapes);
      if (!action) {
        if (!automatic) now.announce(t('Layout leaves every shape where it is.'));
        return;
      }
      setArmed({
        before: now.scene,
        project: now.project,
        view: now.view.id,
        animate: typeof requestAnimationFrame === 'function' && !prefersReducedMotion(),
      });
      // Placing new shapes asks to join the newest action, which may be what added them (ADR 0065).
      const joins = automatic ? newestDone(now.actions) : undefined;
      const sent = await now.send(action.command, joins === undefined ? undefined : { joins });
      if (!sent.ok) {
        setArmed(undefined);
        return;
      }
      if (!automatic) {
        latest.current.announce(
          t(
            { one: '{action}: {count} shape moved.', other: '{action}: {count} shapes moved.' },
            { action: t.message(labelOf(action.command)), count: action.moved },
          ),
        );
      }
    });
    queue.current = run.catch(() => undefined);
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
      // A row is placed by its container's rows, never by layout (ADR 0023), and an anchored part
      // by its part, in its drawing (ADR 0067).
      const waits =
        shape.positioned === 'placed' && shape.row === undefined && shape.part?.inDrawing !== true;
      if (waits && (opened || !last.keys.has(shape.key))) {
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
  const layOutAsked = useEffectEvent((request: GuidedLayoutRequest) => {
    ran.current = request.request;
    const scopes: LayoutScope[] =
      request.containers === undefined
        ? [{ kind: 'view' }]
        : request.containers
            .filter((container) => holdsShapes(latest.current.scene, container))
            .map((container) => ({ kind: 'contents', container }));
    void Promise.all(scopes.map((scope) => enqueue(scope, false))).then(() => guidedDone(scopes));
  });
  useEffect(() => {
    if (!guided || ran.current === guided.request || !editable || !runner) return;
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

  return { scene: drawn, control };
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

function labelOf(command: Command): string {
  return command.type === 'batch' ? command.label : 'Lay out';
}
