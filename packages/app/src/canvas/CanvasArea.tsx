/**
 * The canvas area: PixiJS draws the open view imperatively, outside React's state, so that drawing
 * scales to thousands of shapes. React owns the host element and what sits around the drawing: the
 * toolbar, the menu that relates two ends, the shape menu, the container chooser, the delete preview
 * and the question before a change of container, the in-place text editor, the caption beside a
 * drop, the keyboard help, and the live region that says what the keys select and what changed.
 *
 * The keys of the stacking order work wherever the focus is, except while typing: they are taken
 * for the whole window here, so that ⌘[ and ⌘] never leave the app.
 *
 * The canvas draws the emphasis that filters, focus, playback and guidance set (interface I2), and
 * collapses and expands containers through one command (interface I1), from the shape menu, the
 * toggle on a container's shape and the keys.
 */
import {
  appearanceOf,
  definitionsIn,
  modelIndexOf,
  nestingTypesInView,
  previewChangeContainer,
  previewDelete,
  type ChangeContainerCommand,
  type Command,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id, Note, ViewFile } from '@visual-anything/schema';
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from 'react';
import { useEmphasis, type Emphasis } from '../editor/emphasis';
import { EMPTY_SELECTION, selectionOf, sizeOf, type Selection } from '../editor/selection';
import { isTextEntry } from '../live/shortcuts';
import { RecordingCue } from '../scenarios/RecordingCue';
import type { ScenarioSession } from '../scenarios/session';
import { useCanvasRecording } from '../scenarios/useCanvasRecording';
import { THEMES } from '../theme/themes';
import type { Camera } from './camera';
import {
  collapseActions,
  collapseDone,
  setCollapsedCommand,
  type CollapseAction,
} from './collapse';
import { CanvasController, type ChangeToConfirm } from './controller';
import { CanvasToolbar, type AddPlace } from './CanvasToolbar';
import { ContainerChooser } from './ContainerChooser';
import { DeleteDialog } from './DeleteDialog';
import { confirmLabelOf, containerChangeLabel, moveToCommand, needsConfirmation } from './drop';
import './drop.css';
import type { Point } from './geometry';
import { createAtCommand, createBesideCommand, createInsideCommand } from './gestures';
import { addRowCommand } from './rowCommands';
import { indexScene, withoutShapes, type IndexedScene } from './hit';
import { InlineEditor } from './InlineEditor';
import { KeyboardHelp } from './KeyboardHelp';
import { CANVAS_KEYS_HINT } from './keys';
import { useLayout } from './layout/useLayout';
import { RelationMenu } from './RelationMenu';
import type { ElementShape, Scene } from './scene';
import { ShapeMenu } from './ShapeMenu';
import { restackCommand, stackingActions, stackingShortcut, type StackingMove } from './stacking';

/** Sends a command to the local program; resolves with what it created, or `ok: false` when refused. */
export type SendCommand = (command: Command) => Promise<{ ok: boolean; created?: Id[] }>;

interface CanvasAreaProps {
  project: ProjectSnapshot;
  view: ViewFile;
  /** What to draw. */
  scene: Scene;
  /** The text alternative for the drawing, which screen readers cannot see. */
  label: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Sends commands; absent while the project cannot be changed, such as when the connection closed. */
  onCommand?: SendCommand;
  /** The shape to bring into sight; each new request moves the camera again. */
  revealed?: { key: string; request: number };
  /** The scenario session, whose recording takes clicks on relations while it records. */
  scenarios?: ScenarioSession;
  /** The theme to draw in; the light theme by default. */
  theme?: ThemeName;
  /** Called in the frame the canvas first shows a theme, so that the panels change with it. */
  onThemeShown?: (theme: ThemeName) => void;
}

/**
 * What the in-place editor edits: an element's name, through the shape it was opened on or else its
 * first shape, or a note's text. `shown` is the name it was drawn for, once it has been drawn.
 */
type Editing =
  | {
      kind: 'element';
      element: Id;
      key?: string;
      shown?: string;
      /** For a row just added: the shape of its container, where Ctrl+Enter adds the next one. */
      rows?: string;
    }
  | { kind: 'note'; id: Id; shown?: string };

/** What the delete preview deletes: what was selected when it opened. */
interface Deleting {
  elements: Id[];
  relations: Id[];
  freeShapes: Id[];
  /** Whether the rows and the other elements the deleted ones hold go too; rows do at first. */
  rows?: boolean;
  others?: boolean;
}

/**
 * A change of container that asks first, because it deletes more than the relations that placed the
 * shapes: what it sends, and what the history calls it after the change's own label, as for a drop
 * that moves other shapes along. A drop's waits in the canvas, which shows where its shapes land.
 */
interface Changing {
  command: Command;
  change: ChangeContainerCommand;
  rest: string;
  dropped: boolean;
}

/** The shape menu: where it opened, for which shape, and the shapes under the pointer there. */
interface OpenMenu {
  at: Point;
  shape: string;
  under?: string[];
  /** Counts the openings, so that each one starts again from its first item. */
  opening: number;
  /** The shapes the emphasis hid when it opened, which it looks past. */
  hidden: ReadonlySet<string>;
}

/** The container chooser: for which element, from which container, and how it asks. */
interface Choosing {
  element: Id;
  container?: Id;
  mode: 'put' | 'move';
}

const NOTE_SIZE = { width: 220, height: 90 };
const NO_KEYS: ReadonlySet<string> = new Set();
const ARROW_LENGTH = 160;
const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';

export function CanvasArea({
  project,
  view,
  scene,
  label,
  selection,
  onSelect,
  onCommand,
  revealed,
  scenarios,
  theme = 'light',
  onThemeShown,
}: CanvasAreaProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const addSelect = useRef<HTMLSelectElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const [failure, setFailure] = useState<string>();
  // The camera moves on every frame of a pan: only what shows it renders again.
  const [cameras] = useState(() => new CameraWatch());
  const [relating, setRelating] = useState<{ from: Id; to: Id; at: Point }>();
  const [deleting, setDeleting] = useState<Deleting>();
  const [changing, setChanging] = useState<Changing>();
  const [menu, setMenu] = useState<OpenMenu>();
  const [choosing, setChoosing] = useState<Choosing>();
  // The element the next element added goes inside, set from its menu, for the selection it was set for.
  const [addTarget, setAddTarget] = useState<{ element: Id; selection: Selection }>();
  const [editing, setEditing] = useState<Editing>();
  // Each message counts, so that the same words said again are heard again.
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  // Counts the times something holding the focus closed by itself, to give the focus to the canvas.
  const [closedByItself, setClosedByItself] = useState(0);
  // The element just added, whose first shape the camera brings into sight once it is drawn.
  const revealNext = useRef<Id | undefined>(undefined);
  // The shape of the row just added, by its key, which the camera brings into sight once drawn.
  const revealKey = useRef<string | undefined>(undefined);
  // The emphasis to draw, kept for the controller made after it came.
  const emphasis = useRef<Emphasis>({});
  const hint = useId();
  // Layout: shapes without a position are laid out as they appear, and the toolbar's Layout lays out
  // on demand; what the canvas draws is a frame of a layout moving in, or else the scene.
  const layout = useLayout({
    project,
    view,
    scene,
    selection,
    send: onCommand,
    announce: (text) => setAnnouncement((last) => ({ text, count: last.count + 1 })),
  });
  // A scene that cannot be indexed cannot be drawn either: the canvas area says so, and the rest of
  // the app keeps working.
  const drawn = layout.scene;
  const indexing = useMemo(() => {
    try {
      return { indexed: indexScene(drawn) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [drawn]);
  const indexed = indexing.indexed;
  const editable = onCommand !== undefined;
  const latest = useRef({ project, view, indexed, selection, onSelect, onCommand, theme });
  useLayoutEffect(() => {
    latest.current = { project, view, indexed, selection, onSelect, onCommand, theme };
  });
  const themeShown = useEffectEvent((shown: ThemeName) => onThemeShown?.(shown));

  const announce = (text: string) => setAnnouncement((last) => ({ text, count: last.count + 1 }));

  /** Sends a command; while the project cannot be changed, sends nothing and says so. */
  const send = async (command: Command): Promise<{ ok: boolean; created?: Id[] }> => {
    const sendNow = latest.current.onCommand;
    if (!sendNow) {
      setAnnouncement((last) => ({ text: NOT_CONNECTED, count: last.count + 1 }));
      return { ok: false };
    }
    return sendNow(command);
  };

  /** Collapses or expands containers with I1's command, and says what it did once it is done. */
  const collapse = (action: CollapseAction, collapsed: boolean) => {
    void send(setCollapsedCommand(latest.current.view.id, action.elements, collapsed)).then(
      (result) => {
        if (result.ok) announce(collapseDone(action, collapsed));
      },
    );
  };
  // The toggle and the keys, from the controller, which lives as long as the canvas area.
  const collapseFromCanvas = useEffectEvent(collapse);

  /**
   * Adds a row to a shape that draws rows, below `below` or at the end, and edits its name in place
   * on that copy of the container, once it is drawn and brought into sight (ADR 0023).
   */
  const addRow = async (container: ElementShape, below?: Id) => {
    const { project: now, view: open } = latest.current;
    const made = addRowCommand(now, open.id, container.element, below);
    if (!made) return;
    // As `intent` tells: an answer that comes after the person moved on changes nothing more.
    const chosen = latest.current.selection;
    const focused = document.activeElement;
    const result = await send(made.command);
    if (!result.ok || latest.current.selection !== chosen || document.activeElement !== focused) {
      return;
    }
    const key = `${container.key}/${made.id}`;
    latest.current.onSelect(selectionOf([{ kind: 'element', id: made.id }]));
    setEditing({ kind: 'element', element: made.id, key, rows: container.key });
    if (latest.current.indexed?.byKey.has(key)) controllerRef.current?.reveal(key);
    else revealKey.current = key;
  };
  const addRowFromCanvas = useEffectEvent((container: ElementShape, below?: Id) => {
    void addRow(container, below);
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const caption = captionRef.current;
    const controller = new CanvasController(
      host,
      {
        select: (next) => latest.current.onSelect(next),
        command: async (command) => (await send(command)).ok,
        relate: (from, to, at) => setRelating({ from, to, at }),
        // The preview opens unless the selection cannot be deleted, as World cannot.
        remove: () => {
          const { view: open, selection: selected } = latest.current;
          setDeleting({
            elements: [...selected.elements],
            relations: [...selected.relations],
            freeShapes: open.freeShapes
              .filter((shape) => selected.freeShapes.has(shape.id))
              .map((shape) => shape.id),
          });
        },
        rename: (target) =>
          setEditing(
            target.kind === 'element'
              ? { kind: 'element', element: target.shape.element, key: target.shape.key }
              : { kind: 'note', id: target.note.id },
          ),
        camera: (camera) => cameras.set(camera),
        failure: (error) => setFailure(error instanceof Error ? error.message : String(error)),
        announce: (text) => setAnnouncement((last) => ({ text, count: last.count + 1 })),
        confirmChange: (asked: ChangeToConfirm) => {
          const { project: now, view: open } = latest.current;
          setChanging({
            command: asked.command,
            change: asked.change,
            rest: restOfLabel(asked.label, containerChangeLabel(now, open.id, asked.change)),
            dropped: true,
          });
        },
        menu: (at, shape, under) =>
          setMenu((last) => ({
            at,
            shape: shape.key,
            hidden: controllerRef.current?.renderer.hiddenShapes ?? NO_KEYS,
            ...(under ? { under: under.map((each) => each.key) } : {}),
            opening: (last?.opening ?? 0) + 1,
          })),
        collapse: (action, collapsed) => collapseFromCanvas(action, collapsed),
        addRow: (container, below) => addRowFromCanvas(container, below),
        themeShown: (shown) => themeShown(shown),
      },
      // The canvas starts in the theme shown now, and follows it from then on.
      { ...(caption ? { caption } : {}), theme: THEMES[latest.current.theme].canvas },
    );
    controllerRef.current = controller;
    controller.setEmphasis(emphasis.current);
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // The controller lives as long as the canvas area; `latest` gives it the current props.
  }, [cameras]);

  useEffect(() => {
    controllerRef.current?.renderer.setTheme(THEMES[theme].canvas);
  }, [theme]);

  // While a scenario records, clicks on relations record its steps.
  const recording = useCanvasRecording(controllerRef, scenarios);

  useEffect(() => {
    if (indexed) controllerRef.current?.update(project, view.id, indexed, editable);
  }, [project, view.id, indexed, editable]);

  // Once the row just added is drawn, the camera brings it into sight on its container's copy.
  useEffect(() => {
    const key = revealKey.current;
    if (key === undefined || !indexed?.byKey.has(key)) return;
    revealKey.current = undefined;
    controllerRef.current?.reveal(key);
  }, [indexed]);

  // Once the element just added is drawn, the camera brings its first shape into sight.
  useEffect(() => {
    const id = revealNext.current;
    const first = id === undefined ? undefined : indexed?.byElement.get(id)?.[0];
    if (!first) return;
    revealNext.current = undefined;
    controllerRef.current?.reveal(first.key);
  }, [indexed]);

  useEffect(() => {
    controllerRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    if (revealed) controllerRef.current?.reveal(revealed.key);
  }, [revealed]);

  // A drop's question that closed without being confirmed sends nothing, and its ghost goes.
  const dropAsked = changing?.dropped === true;
  useEffect(() => {
    if (!dropAsked) controllerRef.current?.resolveChange(false);
  }, [dropAsked]);

  // What the toolbar, the shape menu and the stacking keys offer for the selection.
  const stacking = useMemo(
    () => (indexed ? stackingActions(indexed, project, view.id, selection, editable) : undefined),
    [indexed, project, view.id, selection, editable],
  );
  // The target set from a menu ends once the selection changes.
  const target = addTarget && addTarget.selection === selection ? addTarget.element : undefined;
  const adding = useMemo(
    () => addRuleOf(project, view, indexed, selection, target),
    [project, view, indexed, selection, target],
  );

  // The menus and dialogs can change nothing once the project cannot be changed, and the previews
  // show what deleting or changing would do now: one closes once nothing it deletes is left, or once
  // the change can no longer be made.
  const deletion = useMemo(
    () => (deleting ? deletionOf(project, view, deleting) : undefined),
    [project, view, deleting],
  );
  const changePreview = useMemo(
    () => (changing ? previewChangeContainer(project, changing.change) : undefined),
    [project, changing],
  );
  const [changeProblem] = changePreview?.problems ?? [];
  const chosenGone =
    choosing !== undefined && modelIndexOf(project).element(choosing.element) === undefined;
  const menuShape = menu ? indexed?.byKey.get(menu.shape) : undefined;
  if ((relating || deleting || changing || choosing) && !editable) {
    setRelating(undefined);
    setDeleting(undefined);
    setChanging(undefined);
    setChoosing(undefined);
    setClosedByItself((count) => count + 1);
  } else if (deleting && !deletion) {
    setDeleting(undefined);
    setClosedByItself((count) => count + 1);
  } else if (changing && changeProblem) {
    setChanging(undefined);
    setClosedByItself((count) => count + 1);
    announce(changeProblem.message);
  } else if (chosenGone) {
    setChoosing(undefined);
    setClosedByItself((count) => count + 1);
  } else if (menu && !menuShape) {
    setMenu(undefined);
    setClosedByItself((count) => count + 1);
  }

  // The in-place editor opens once what it edits is drawn, as for what was just created, and closes
  // once it is no longer drawn, saying so.
  const editedShape = editing?.kind === 'element' ? shapeToEdit(indexed, editing) : undefined;
  const editedNote =
    editing?.kind === 'note' ? scene.notes.find((note) => note.id === editing.id) : undefined;
  const edited = editedShape?.name ?? (editedNote ? 'The note' : undefined);
  if (editing && edited !== undefined && editing.shown === undefined) {
    setEditing({ ...editing, shown: edited });
  } else if (editing?.shown !== undefined && edited === undefined) {
    setEditing(undefined);
    setClosedByItself((count) => count + 1);
    announce(
      editing.kind === 'element'
        ? `${editing.shown} is no longer in this view, so its name was not changed.`
        : 'The note is no longer in this view, so its text was not changed.',
    );
  }

  // What closed by itself held the focus, which fell to the page: the canvas takes it back.
  useLayoutEffect(() => {
    if (closedByItself === 0) return;
    const active = document.activeElement;
    if (!active || active === document.body) hostRef.current?.focus();
  }, [closedByItself]);

  const controller = () => controllerRef.current;
  const focusCanvas = () => hostRef.current?.focus();

  /**
   * What the user has chosen now, to tell when an answer comes whether they moved on since they
   * asked: they selected something else, or put the focus elsewhere. An answer that comes after that
   * changes neither the selection nor the focus.
   */
  const intent = () => {
    const chosen = latest.current.selection;
    const focused = document.activeElement;
    return () => latest.current.selection === chosen && document.activeElement === focused;
  };

  /**
   * Changes the stacking order of the selection, and says what it did; a move that would change
   * nothing says why instead.
   */
  const restack = (move: StackingMove) => {
    if (!indexed) return;
    const { command, reason, done } = restackCommand(
      indexed,
      project,
      view.id,
      selection,
      move,
      editable,
    );
    if (!command) {
      if (reason !== undefined) announce(reason);
      return;
    }
    void send(command).then((result) => {
      if (result.ok && done !== undefined) announce(done);
    });
  };

  // The stacking keys, wherever the focus is: never while typing, nor for a key something else took.
  const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || isTextEntry(event.target)) return;
    const move = stackingShortcut({
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      altGraph: event.getModifierState('AltGraph'),
    });
    if (move === undefined) return;
    // Taken wherever it is pressed, so that ⌘[ and ⌘] never go back or forward in the browser.
    event.preventDefault();
    // A dialog or a menu takes its own keys: the stacking order waits for it to close.
    const open = relating || deletion || changing || choosing || menu;
    const inDialog =
      event.target instanceof Element && event.target.closest('[role="dialog"]') !== null;
    if (open || inDialog) return;
    restack(move);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onWindowKeyDown(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);

  /**
   * Changes the container of a shape, from the shape menu or the chooser: what it would delete is
   * worked out first; a change the core would refuse says why, and one that deletes more than the
   * relation that placed the shape asks first.
   */
  const changeContainer = (change: ChangeContainerCommand) => {
    const preview = previewChangeContainer(project, change);
    const [problem] = preview.problems;
    if (problem) {
      announce(problem.message);
      return;
    }
    if (needsConfirmation(preview)) {
      setChanging({ command: change, change, rest: '', dropped: false });
      return;
    }
    void sendChange(change, containerChangeLabel(project, view.id, change));
  };

  /** Sends a change of container, and says what it did once it is done. */
  const sendChange = async (command: Command, done: string) => {
    const result = await send(command);
    if (result.ok) announce(`${done}.`);
  };

  const add = async (component: Id) => {
    const canvas = controller();
    if (!canvas) return;
    setAddTarget(undefined);
    let command: Command | undefined;
    if (adding.beside && indexed) {
      command = createBesideCommand(indexed, project, view.id, component, adding.beside);
    } else if (adding.inside !== undefined) {
      command = createInsideCommand(project, view.id, component, adding.inside);
    } else {
      const size = appearanceOf({ component }, definitionsIn(project));
      const center = canvas.center;
      command = createAtCommand(
        project,
        view.id,
        component,
        { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        undefined,
      );
    }
    if (!command) return;
    const unchanged = intent();
    const result = await send(command);
    const id = result.created?.[0];
    if (result.ok && id !== undefined && unchanged()) {
      onSelect(selectionOf([{ kind: 'element', id }]));
      setEditing({ kind: 'element', element: id });
      const first = latest.current.indexed?.byElement.get(id)?.[0];
      if (first) controller()?.reveal(first.key);
      else revealNext.current = id;
    }
  };

  const addNote = async () => {
    const center = controller()?.center;
    if (!center) return;
    const unchanged = intent();
    const result = await send({
      type: 'create-free-shape',
      view: view.id,
      shape: {
        kind: 'note',
        x: Math.round(center.x - NOTE_SIZE.width / 2),
        y: Math.round(center.y - NOTE_SIZE.height / 2),
        ...NOTE_SIZE,
        text: 'Note',
      },
    });
    const id = result.created?.[0];
    if (result.ok && id !== undefined && unchanged()) {
      onSelect(selectionOf([{ kind: 'free-shape', id }]));
      setEditing({ kind: 'note', id });
    }
  };

  const addArrow = async () => {
    const center = controller()?.center;
    if (!center) return;
    const y = Math.round(center.y);
    const unchanged = intent();
    const result = await send({
      type: 'create-free-shape',
      view: view.id,
      shape: {
        kind: 'arrow',
        from: { x: Math.round(center.x - ARROW_LENGTH / 2), y },
        to: { x: Math.round(center.x + ARROW_LENGTH / 2), y },
      },
    });
    const id = result.created?.[0];
    if (result.ok && id !== undefined && unchanged()) {
      onSelect(selectionOf([{ kind: 'free-shape', id }]));
    }
  };

  const relate = async (relationType: Id) => {
    if (!relating) return;
    const { from, to } = relating;
    // The menu goes, and the focus it held comes back to the canvas now, not when the answer comes.
    setRelating(undefined);
    focusCanvas();
    const unchanged = intent();
    const result = await send({ type: 'create-relation', relation: { relationType, from, to } });
    const id = result.created?.[0];
    if (result.ok && id !== undefined && unchanged()) {
      onSelect(selectionOf([{ kind: 'relation', id }]));
    }
  };

  const confirmDelete = async () => {
    if (!deletion) return;
    const { preview, freeShapes } = deletion;
    setDeleting(undefined);
    focusCanvas();
    const commands: Command[] = [];
    if (preview.elements.length > 0 || preview.relations.length > 0) {
      const cascaded = new Set(preview.cascaded);
      commands.push({
        type: 'delete',
        elements: preview.elements,
        relations: preview.relations.filter((id) => !cascaded.has(id)),
      });
    }
    if (freeShapes.length > 0)
      commands.push({ type: 'delete-free-shapes', view: view.id, ids: freeShapes });
    const command: Command | undefined =
      commands.length > 1
        ? { type: 'batch', label: 'Delete the selection', commands }
        : commands[0];
    if (!command) return;
    const unchanged = intent();
    const result = await send(command);
    if (result.ok && unchanged()) onSelect(EMPTY_SELECTION);
  };

  /** How the history names the change asked about, from the project as it is now. */
  const changeLabel = changing
    ? `${containerChangeLabel(project, view.id, changing.change)}${changing.rest}`
    : '';

  const confirmChange = () => {
    if (!changing) return;
    setChanging(undefined);
    focusCanvas();
    // A drop's is sent by the canvas, which shows where its shapes land until it comes back.
    if (changing.dropped) controller()?.resolveChange(true);
    else void sendChange(changing.command, changeLabel);
  };

  const closeMenu = () => {
    setMenu(undefined);
    focusCanvas();
  };

  /**
   * Closes the in-place editor. Closed with Enter or Escape, it gives the focus back to the canvas;
   * closed because the focus went elsewhere, it leaves the focus there.
   */
  const closeEditor = () => {
    setEditing(undefined);
    if (frameRef.current?.contains(document.activeElement)) focusCanvas();
  };

  return (
    <div ref={frameRef} className="canvas-frame">
      <DrawnEmphasis
        onEmphasis={(next) => {
          emphasis.current = next;
          controllerRef.current?.setEmphasis(next);
        }}
      />
      <ZoomedToolbar
        cameras={cameras}
        project={project}
        editable={editable}
        onAdd={(component) => void add(component)}
        onAddNote={() => void addNote()}
        onAddArrow={() => void addArrow()}
        onZoom={(factor) => controller()?.zoomBy(factor)}
        onFit={() => controller()?.fit()}
        {...(adding.place ? { addPlace: adding.place } : {})}
        {...(stacking ? { stacking } : {})}
        onRestack={restack}
        addSelect={addSelect}
        onAddLeave={() => setAddTarget(undefined)}
        layout={layout.control}
      />
      <div
        ref={hostRef}
        className="canvas-host"
        // The canvas takes its keys itself, so screen readers pass them on; the outline reads it.
        role="application"
        aria-roledescription="canvas"
        aria-label={label}
        aria-describedby={hint}
        tabIndex={0}
      />
      <div ref={captionRef} className="canvas-drop-caption" aria-hidden="true" />
      <p id={hint} className="visually-hidden">
        {CANVAS_KEYS_HINT}
      </p>
      <div role="status" aria-label="Selection" className="visually-hidden">
        {announcement.text}
        {announcement.count % 2 === 1 ? ' ' : ''}
      </div>
      <KeyboardHelp />
      {recording && <RecordingCue />}
      {relating && (
        <RelationMenu
          project={project}
          from={relating.from}
          to={relating.to}
          at={relating.at}
          onChoose={(relationType) => void relate(relationType)}
          onClose={() => {
            setRelating(undefined);
            focusCanvas();
          }}
        />
      )}
      {menu && menuShape && indexed && stacking && (
        <ShapeMenu
          key={menu.opening}
          // The shape to put this one inside is never one the emphasis hides.
          indexed={withoutShapes(indexed, menu.hidden)}
          project={project}
          viewId={view.id}
          selection={selection}
          shape={menuShape}
          at={menu.at}
          {...(menu.under
            ? { under: menu.under.flatMap((key) => indexed.byKey.get(key) ?? []) }
            : {})}
          stacking={stacking}
          collapse={collapseActions(indexed, project, selection)}
          onCollapse={(action, collapsed) => {
            closeMenu();
            collapse(action, collapsed);
          }}
          editable={editable}
          onRestack={(move) => {
            // A move that would change nothing says why, and leaves the menu open for another.
            if (stacking[move].enabled) closeMenu();
            restack(move);
          }}
          onChange={(change) => {
            closeMenu();
            changeContainer(change);
          }}
          onChooseContainer={(mode) => {
            setMenu(undefined);
            setChoosing({
              element: menuShape.element,
              ...(menuShape.container === undefined ? {} : { container: menuShape.container }),
              mode,
            });
          }}
          onAddInside={(element) => {
            setMenu(undefined);
            setAddTarget({ element, selection });
            const select = addSelect.current;
            select?.focus();
            try {
              select?.showPicker?.();
            } catch {
              // Where the browser does not allow it, the list opens from the keyboard.
            }
          }}
          onSelectShape={(other) => {
            closeMenu();
            onSelect(selectionOf([{ kind: 'element', id: other.element }]));
            controller()?.reveal(other.key);
          }}
          onClose={closeMenu}
        />
      )}
      {choosing && (
        <ContainerChooser
          project={project}
          viewId={view.id}
          element={choosing.element}
          mode={choosing.mode}
          onChoose={(to) => {
            setChoosing(undefined);
            focusCanvas();
            changeContainer(moveToCommand(view.id, choosing, to));
          }}
          onCancel={() => {
            setChoosing(undefined);
            focusCanvas();
          }}
        />
      )}
      {deletion && (
        <DeleteDialog
          project={project}
          preview={deletion.preview}
          freeShapes={deletion.freeShapes.length}
          {...(deletion.held.contents.length > 0
            ? {
                held: {
                  ...deletion.held,
                  onChange: (group: 'rows' | 'other', checked: boolean) =>
                    setDeleting(
                      (last) =>
                        last && {
                          ...last,
                          ...(group === 'rows' ? { rows: checked } : { others: checked }),
                        },
                    ),
                },
              }
            : {})}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setDeleting(undefined);
            focusCanvas();
          }}
        />
      )}
      {changing && changePreview && (
        <DeleteDialog
          project={project}
          preview={changePreview}
          freeShapes={0}
          action={{
            title: `${changeLabel}?`,
            confirmLabel: confirmLabelOf(project, changing.change),
            leaving: changePreview.leaving,
            withData: changePreview.withData,
          }}
          onConfirm={confirmChange}
          onCancel={() => {
            setChanging(undefined);
            focusCanvas();
          }}
        />
      )}
      {editing?.kind === 'element' && editedShape && (
        <PlacedEditor
          // Kept while the element's shape changes, as when it moves into another container.
          key={`element ${editing.element}`}
          cameras={cameras}
          rect={editedShape.rect}
          value={editedShape.name}
          multiline={false}
          label={`Name of ${editedShape.name}`}
          onCommit={(name) => {
            closeEditor();
            void send({ type: 'update-element', id: editedShape.element, changes: { name } });
          }}
          onCancel={closeEditor}
          {...(editing.rows === undefined
            ? {}
            : {
                // Ctrl+Enter in a row's name adds the next row below it.
                onNext: () => {
                  const container =
                    editing.rows === undefined ? undefined : indexed?.byKey.get(editing.rows);
                  if (container) void addRow(container, editedShape.element);
                },
              })}
        />
      )}
      {editing?.kind === 'note' && editedNote && (
        <PlacedEditor
          key={`note ${editedNote.id}`}
          cameras={cameras}
          rect={editedNote.rect}
          value={editedNote.text}
          multiline
          label="Text of the note"
          onCommit={(text) => {
            closeEditor();
            const note = view.freeShapes.find(
              (shape): shape is Note => shape.id === editedNote.id && shape.kind === 'note',
            );
            if (note)
              void send({ type: 'update-free-shape', view: view.id, shape: { ...note, text } });
          }}
          onCancel={closeEditor}
        />
      )}
      {(failure ?? indexing.error) !== undefined ? (
        <p className="canvas-message canvas-failure" role="alert">
          The canvas could not draw this view: {failure ?? indexing.error}
        </p>
      ) : (
        scene.bounds === undefined && <p className="canvas-message">This view has no shapes yet.</p>
      )}
    </div>
  );
}

/**
 * Where "Add element" puts the next element, and how the toolbar says it:
 * 1. inside the element set from its menu with Add inside "X"…, whatever it holds;
 * 2. inside the one element selected, when its first shape holds contents;
 * 3. beside the first shape of the one element selected, when it holds nothing, in the container it
 *    sits in or directly in World, so that adding one after another makes a row;
 * 4. otherwise directly in World, at the middle of the canvas.
 * In a view arranged by no relation type that nests, always directly in World.
 */
function addRuleOf(
  project: ProjectSnapshot,
  view: ViewFile,
  indexed: IndexedScene | undefined,
  selection: Selection,
  target: Id | undefined,
): { inside?: Id; beside?: ElementShape; place?: AddPlace } {
  const [selected] = selection.elements;
  const first =
    sizeOf(selection) === 1 && selected !== undefined
      ? indexed?.byElement.get(selected)?.[0]
      : undefined;
  if (nestingTypesInView(project, view).length === 0) return first ? { beside: first } : {};
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const inside = (container: Id, title: string): { inside: Id; place: AddPlace } => ({
    inside: container,
    place: {
      option: `Add inside "${nameOf(container)}"…`,
      label: `Add an element inside "${nameOf(container)}"`,
      title,
    },
  });
  const insideItself = (container: Id) =>
    inside(
      container,
      `Adds the element inside "${nameOf(container)}". With nothing selected, elements are added directly in World.`,
    );
  if (target !== undefined && index.element(target)) return insideItself(target);
  if (!first || selected === undefined) return {};
  // A shape that draws rows takes new contents even while it is empty (ADR 0023).
  if (first.holdsContents || first.rowCount !== undefined) return insideItself(selected);
  if (first.container === undefined) {
    return {
      beside: first,
      place: {
        option: 'Add element…',
        label: 'Add an element',
        title: `Adds the element directly in World, beside "${nameOf(selected)}". To add inside "${nameOf(selected)}" itself, use Add inside "${nameOf(selected)}"… in its menu or in the inspector.`,
      },
    };
  }
  return {
    ...inside(
      first.container,
      `Adds the element inside "${nameOf(first.container)}", where "${nameOf(selected)}" sits. To add inside "${nameOf(selected)}" itself, use Add inside "${nameOf(selected)}"… in its menu or in the inspector.`,
    ),
    beside: first,
  };
}

/** What a drop's label says after the label of its change, such as ", and move 2 other shapes". */
function restOfLabel(label: string, changeLabel: string): string {
  return label.startsWith(changeLabel) ? label.slice(changeLabel.length) : '';
}

/**
 * What deleting the targets would do now, with the free shapes still in the view; undefined when
 * none of them is left, or when they cannot be deleted.
 */
function deletionOf(project: ProjectSnapshot, view: ViewFile, targets: Deleting) {
  const index = modelIndexOf(project);
  const inView = new Set(view.freeShapes.map((shape) => shape.id));
  const elements = targets.elements.filter((id) => index.element(id) !== undefined);
  const relations = targets.relations.filter((id) => index.relation(id) !== undefined);
  const freeShapes = targets.freeShapes.filter((id) => inView.has(id));
  if (elements.length === 0 && relations.length === 0 && freeShapes.length === 0) return undefined;
  const asked = previewDelete(project, { elements, relations }, view.id);
  if (asked.problems.length > 0) return undefined;
  // What the deleted elements hold goes only when chosen: the rows at first, the rest when asked.
  const rows = targets.rows ?? true;
  const others = targets.others ?? false;
  const taken = asked.contents
    .filter((each) => (each.group === 'rows' ? rows : others))
    .map((each) => each.element);
  const preview =
    taken.length === 0
      ? asked
      : previewDelete(project, { elements: [...elements, ...taken], relations }, view.id);
  return { preview, freeShapes, held: { contents: asked.contents, rows, others } };
}

/** The shape an element's name is edited on: the one it was opened on, or else its first one. */
function shapeToEdit(
  indexed: IndexedScene | undefined,
  editing: Extract<Editing, { kind: 'element' }>,
): ElementShape | undefined {
  const opened = editing.key === undefined ? undefined : indexed?.byKey.get(editing.key);
  return opened ?? indexed?.byElement.get(editing.element)?.[0];
}

/** The camera, kept outside React's state, for the few things that show it to follow it. */
class CameraWatch {
  camera: Camera | undefined;
  private readonly listeners = new Set<() => void>();

  set(camera: Camera): void {
    this.camera = camera;
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly current = (): Camera | undefined => this.camera;

  readonly scale = (): number | undefined => this.camera?.scale;
}

/**
 * Hands the canvas the emphasis to draw. It renders on its own, so that markers moving every frame
 * render nothing else.
 */
function DrawnEmphasis({ onEmphasis }: { onEmphasis: (emphasis: Emphasis) => void }) {
  const emphasis = useEmphasis();
  const draw = useEffectEvent(onEmphasis);
  useEffect(() => {
    draw(emphasis);
  }, [emphasis]);
  return null;
}

/** The toolbar, which shows the zoom: it renders again when the zoom changes, not on every pan. */
function ZoomedToolbar({
  cameras,
  ...props
}: Omit<ComponentProps<typeof CanvasToolbar>, 'scale'> & { cameras: CameraWatch }) {
  const scale = useSyncExternalStore(cameras.subscribe, cameras.scale);
  return <CanvasToolbar {...props} scale={scale} />;
}

/** The in-place editor, laid over the canvas where the camera shows what it edits, as it moves. */
function PlacedEditor({
  cameras,
  ...props
}: Omit<ComponentProps<typeof InlineEditor>, 'camera'> & { cameras: CameraWatch }) {
  const camera = useSyncExternalStore(cameras.subscribe, cameras.current);
  return camera ? <InlineEditor {...props} camera={camera} /> : null;
}
