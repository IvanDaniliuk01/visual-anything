/**
 * Layout on the canvas: shapes that appear without a position are laid out automatically, and the
 * toolbar's Layout lays out the view, or the selected container's contents, on demand. Every layout
 * runs in the layout worker; its result is stored as one undoable action, unpinned, and moves in on
 * the canvas unless the system asks for reduced motion (ADR-0009, ADR-0015).
 *
 * Automatic layout places the shapes that the view shows without a position when it opens, and each
 * new one after that, such as the elements Claude adds. A shape whose position an undo took away is
 * not new, so it stays where the canvas puts it, and undo can go on past the layout.
 */
import { modelIndexOf, type Command, type ProjectSnapshot } from '@visual-anything/core';
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
import type { Scene } from '../scene';
import { sharedRunner, type LayoutRunner } from './client';
import { layoutCommand } from './command';
import { layoutInput, type LayoutScope } from './input';
import {
  frameAt,
  prefersReducedMotion,
  TRANSITION_MS,
  transitionBetween,
  type Transition,
} from './transition';

/**
 * What runs the canvas's layouts: by default (null) the layout worker every canvas shares; tests give
 * a runner of their own, and undefined turns layout off.
 */
export const LayoutRunnerContext = createContext<LayoutRunner | null | undefined>(null);

/** How long automatic layout waits for more new shapes before it runs, in milliseconds. */
export const AUTO_DELAY = 120;

/** The toolbar's Layout control. */
export interface LayoutControl {
  /** What it lays out now, or why it cannot. */
  title: string;
  enabled: boolean;
  /** Whether a layout it asked for is under way. */
  busy: boolean;
  run: () => void;
}

export interface LayoutOptions {
  project: ProjectSnapshot;
  view: ViewFile;
  /** The scene of the view as the project has it now. */
  scene: Scene;
  selection: Selection;
  /** Sends a command; absent while the project cannot be changed. */
  send: ((command: Command) => Promise<{ ok: boolean }>) | undefined;
  /** Says something to screen readers. */
  announce: (text: string) => void;
}

/** A layout's change on its way: the scene it was made from, to move in from once it is drawn. */
interface Armed {
  before: Scene;
  project: ProjectSnapshot;
  view: Id;
  animate: boolean;
}

/**
 * Layout for one canvas: the scene to draw, which is a frame of a layout moving in or else `scene`,
 * and the toolbar's control.
 */
export function useLayout({ project, view, scene, selection, send, announce }: LayoutOptions): {
  scene: Scene;
  control: LayoutControl;
} {
  const given = useContext(LayoutRunnerContext);
  const [shared] = useState(() => (given === null ? sharedRunner() : undefined));
  const runner = given === null ? shared : given;
  const editable = send !== undefined;

  const latest = useRef({ project, view, scene, send, announce });
  useLayoutEffect(() => {
    latest.current = { project, view, scene, send, announce };
  });

  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<Armed>();
  const [moving, setMoving] = useState<{ transition: Transition; progress: number }>();
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Once a layout's change is drawn, it moves in from the scene it was made from.
  if (armed && (armed.view !== view.id || (project !== armed.project && scene !== armed.before))) {
    setArmed(undefined);
    const transition =
      armed.animate && armed.view === view.id ? transitionBetween(armed.before, scene) : undefined;
    setMoving(transition && { transition, progress: 0 });
  } else if (moving && moving.transition.to !== scene) {
    // Something else changed the view meanwhile: it shows as it is now.
    setMoving(undefined);
  }

  const transition = moving?.transition;
  useEffect(() => {
    if (!transition) return;
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = (time - start) / TRANSITION_MS;
      if (progress >= 1) {
        setMoving(undefined);
        return;
      }
      setMoving({ transition, progress });
      frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [transition]);

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
        if (!automatic) asked.announce('Every shape there is pinned, so layout leaves them all.');
        return;
      }
      let laidOut;
      try {
        laidOut = await runner.layOut(input);
      } catch (error) {
        latest.current.announce(
          `The layout failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      const now = latest.current;
      if (now.view.id !== asked.view.id || !now.send) return;
      const action = layoutCommand(now.project, now.view.id, now.scene, scope, laidOut.shapes);
      if (!action) {
        if (!automatic) now.announce('Layout leaves every shape where it is.');
        return;
      }
      setArmed({
        before: now.scene,
        project: now.project,
        view: now.view.id,
        animate: !prefersReducedMotion(),
      });
      const sent = await now.send(action.command);
      if (!sent.ok) {
        setArmed(undefined);
        return;
      }
      if (!automatic) {
        const shapes = action.moved === 1 ? '1 shape moved' : `${action.moved} shapes moved`;
        latest.current.announce(`${labelOf(action.command)}: ${shapes}.`);
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
      if (shape.positioned === 'placed' && (opened || !last.keys.has(shape.key))) {
        waiting.current.add(shape.key);
      }
    }
    seen.current = { view: view.id, keys };
    if (waiting.current.size > 0 && editable && runner) layOutSoon();
  }, [scene, view.id, editable, runner]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const target = useMemo(() => targetOf(scene, selection), [scene, selection]);
  const nameOf = (id: Id) => modelIndexOf(project).element(id)?.name ?? id;
  const control: LayoutControl = {
    title: !runner
      ? 'Layout needs web workers, which this browser does not offer.'
      : !editable
        ? 'Visual Anything is not connected, so nothing can be laid out.'
        : busy
          ? 'Laying out…'
          : target.kind === 'contents'
            ? `Lay out the contents of "${nameOf(target.container)}": arrange the shapes inside it that are not pinned.`
            : `Lay out "${view.name}": arrange every shape that is not pinned.`,
    enabled: runner !== undefined && editable && !busy,
    busy,
    run: () => {
      if (!runner || !editable || busy) return;
      setBusy(true);
      void enqueue(target, false).finally(() => setBusy(false));
    },
  };

  return { scene: drawn, control };
}

/**
 * What Layout lays out: the contents of the one element selected when its shape holds contents, and
 * the whole view otherwise.
 */
function targetOf(scene: Scene, selection: Selection): LayoutScope {
  const [only] = selection.elements;
  if (sizeOf(selection) !== 1 || only === undefined) return { kind: 'view' };
  const holds = scene.shapes.some((shape) => shape.element === only && shape.holdsContents);
  return holds ? { kind: 'contents', container: only } : { kind: 'view' };
}

function labelOf(command: Command): string {
  return command.type === 'batch' ? command.label : 'Lay out';
}
