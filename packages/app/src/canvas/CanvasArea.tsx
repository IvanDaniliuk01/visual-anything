/**
 * The canvas area: PixiJS draws the open view imperatively, outside React's state, so that drawing
 * scales to thousands of shapes. React owns the host element and what sits around the drawing: the
 * toolbar, the menu that relates two ends, the delete preview, the in-place text editor, the keyboard
 * help, and the live region that says what the keys select.
 */
import {
  appearanceOf,
  definitionsOf,
  modelIndexOf,
  previewDelete,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Note, ViewFile } from '@visual-anything/schema';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from 'react';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import type { Camera } from './camera';
import { CanvasController } from './controller';
import { CanvasToolbar } from './CanvasToolbar';
import { DeleteDialog } from './DeleteDialog';
import { centerOf, type Point } from './geometry';
import { createAtCommand } from './gestures';
import { indexScene, type IndexedScene } from './hit';
import { InlineEditor } from './InlineEditor';
import { KeyboardHelp } from './KeyboardHelp';
import { CANVAS_KEYS_HINT } from './keys';
import { RelationMenu } from './RelationMenu';
import type { ElementShape, Scene } from './scene';

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
}

/**
 * What the in-place editor edits: an element's name, through the shape it was opened on or else its
 * first shape, or a note's text. `shown` is the name it was drawn for, once it has been drawn.
 */
type Editing =
  | { kind: 'element'; element: Id; key?: string; shown?: string }
  | { kind: 'note'; id: Id; shown?: string };

/** What the delete preview deletes: what was selected when it opened. */
interface Deleting {
  elements: Id[];
  relations: Id[];
  freeShapes: Id[];
}

const NOTE_SIZE = { width: 220, height: 90 };
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
}: CanvasAreaProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const [failure, setFailure] = useState<string>();
  // The camera moves on every frame of a pan: only what shows it renders again.
  const [cameras] = useState(() => new CameraWatch());
  const [relating, setRelating] = useState<{ from: Id; to: Id; at: Point }>();
  const [deleting, setDeleting] = useState<Deleting>();
  const [editing, setEditing] = useState<Editing>();
  // Each message counts, so that the same words said again are heard again.
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  // Counts the times something holding the focus closed by itself, to give the focus to the canvas.
  const [closedByItself, setClosedByItself] = useState(0);
  const hint = useId();
  // A scene that cannot be indexed cannot be drawn either: the canvas area says so, and the rest of
  // the app keeps working.
  const indexing = useMemo(() => {
    try {
      return { indexed: indexScene(scene) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [scene]);
  const indexed = indexing.indexed;
  const editable = onCommand !== undefined;
  const latest = useRef({ project, view, selection, onSelect, onCommand });
  useLayoutEffect(() => {
    latest.current = { project, view, selection, onSelect, onCommand };
  });

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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new CanvasController(host, {
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
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // The controller lives as long as the canvas area; `latest` gives it the current props.
  }, [cameras]);

  useEffect(() => {
    if (indexed) controllerRef.current?.update(project, view.id, indexed, editable);
  }, [project, view.id, indexed, editable]);

  useEffect(() => {
    controllerRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    if (revealed) controllerRef.current?.reveal(revealed.key);
  }, [revealed]);

  // The menu and the delete preview can change nothing once the project cannot be changed, and the
  // preview shows what deleting would do now: it closes once nothing it deletes is left.
  const deletion = useMemo(
    () => (deleting ? deletionOf(project, view, deleting) : undefined),
    [project, view, deleting],
  );
  if ((relating || deleting) && !editable) {
    setRelating(undefined);
    setDeleting(undefined);
    setClosedByItself((count) => count + 1);
  } else if (deleting && !deletion) {
    setDeleting(undefined);
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

  const add = async (component: Id) => {
    const canvas = controller();
    if (!canvas) return;
    const [selected] = selection.elements;
    const inside =
      selection.elements.size === 1 && selected !== undefined
        ? indexed?.byElement.get(selected)?.[0]
        : undefined;
    const container = inside?.holdsContents ? inside : undefined;
    const size = appearanceOf({ component }, definitionsOf(project.packages));
    const center = container ? centerOf(container.rect) : canvas.center;
    const command = createAtCommand(
      project,
      view.id,
      component,
      { x: center.x - size.width / 2, y: center.y - size.height / 2 },
      container,
    );
    if (!command) return;
    const unchanged = intent();
    const result = await send(command);
    const id = result.created?.[0];
    if (result.ok && id !== undefined && unchanged()) {
      onSelect(selectionOf([{ kind: 'element', id }]));
      setEditing({ kind: 'element', element: id });
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
    hostRef.current?.focus();
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
    hostRef.current?.focus();
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

  /**
   * Closes the in-place editor. Closed with Enter or Escape, it gives the focus back to the canvas;
   * closed because the focus went elsewhere, it leaves the focus there.
   */
  const closeEditor = () => {
    setEditing(undefined);
    if (frameRef.current?.contains(document.activeElement)) hostRef.current?.focus();
  };

  return (
    <div ref={frameRef} className="canvas-frame">
      <ZoomedToolbar
        cameras={cameras}
        project={project}
        editable={editable}
        onAdd={(component) => void add(component)}
        onAddNote={() => void addNote()}
        onAddArrow={() => void addArrow()}
        onZoom={(factor) => controller()?.zoomBy(factor)}
        onFit={() => controller()?.fit()}
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
      <p id={hint} className="visually-hidden">
        {CANVAS_KEYS_HINT}
      </p>
      <div role="status" aria-label="Selection" className="visually-hidden">
        {announcement.text}
        {announcement.count % 2 === 1 ? ' ' : ''}
      </div>
      <KeyboardHelp />
      {relating && (
        <RelationMenu
          project={project}
          from={relating.from}
          to={relating.to}
          at={relating.at}
          onChoose={(relationType) => void relate(relationType)}
          onClose={() => {
            setRelating(undefined);
            hostRef.current?.focus();
          }}
        />
      )}
      {deletion && (
        <DeleteDialog
          project={project}
          preview={deletion.preview}
          freeShapes={deletion.freeShapes.length}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setDeleting(undefined);
            hostRef.current?.focus();
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
  const preview = previewDelete(project, { elements, relations });
  return preview.problems.length === 0 ? { preview, freeShapes } : undefined;
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
