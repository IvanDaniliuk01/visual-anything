/**
 * The canvas area: PixiJS draws the open view imperatively, outside React's state, so that drawing
 * scales to thousands of shapes. React owns the host element and what sits around the drawing: the
 * toolbar, the menu that relates two ends, the delete preview and the in-place text editor.
 */
import {
  appearanceOf,
  definitionsOf,
  previewDelete,
  type Command,
  type DeletePreview,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, Note, ViewFile } from '@visual-anything/schema';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import type { Camera } from './camera';
import { CanvasController } from './controller';
import { CanvasToolbar } from './CanvasToolbar';
import { DeleteDialog } from './DeleteDialog';
import { centerOf, type Point } from './geometry';
import { createAtCommand } from './gestures';
import { indexScene } from './hit';
import { InlineEditor } from './InlineEditor';
import { RelationMenu } from './RelationMenu';
import type { ElementShape, NoteShape, Scene } from './scene';

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
}

type Editing = { kind: 'element'; key: string } | { kind: 'note'; id: Id };

const NOTE_SIZE = { width: 220, height: 90 };
const ARROW_LENGTH = 160;

export function CanvasArea({
  project,
  view,
  scene,
  label,
  selection,
  onSelect,
  onCommand,
}: CanvasAreaProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const [failure, setFailure] = useState<string>();
  const [camera, setCamera] = useState<Camera>();
  const [relating, setRelating] = useState<{ from: Id; to: Id; at: Point }>();
  const [deleting, setDeleting] = useState<{ preview: DeletePreview; freeShapes: Id[] }>();
  const [editing, setEditing] = useState<Editing>();
  const [pendingEdit, setPendingEdit] = useState<{ kind: 'element' | 'note'; id: Id }>();
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

  const send = async (command: Command) =>
    (await latest.current.onCommand?.(command)) ?? { ok: false };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new CanvasController(host, {
      select: (next) => latest.current.onSelect(next),
      command: async (command) => (await send(command)).ok,
      relate: (from, to, at) => setRelating({ from, to, at }),
      remove: () => {
        const { project: current, view: open, selection: selected } = latest.current;
        const freeShapes = open.freeShapes
          .filter((shape) => selected.freeShapes.has(shape.id))
          .map((shape) => shape.id);
        const preview = previewDelete(current, {
          elements: [...selected.elements],
          relations: [...selected.relations],
        });
        if (preview.problems.length === 0) setDeleting({ preview, freeShapes });
      },
      rename: (target) =>
        setEditing(
          target.kind === 'element'
            ? { kind: 'element', key: target.shape.key }
            : { kind: 'note', id: target.note.id },
        ),
      camera: setCamera,
      failure: (error) => setFailure(error instanceof Error ? error.message : String(error)),
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // The controller lives as long as the canvas area; `latest` gives it the current props.
  }, []);

  useEffect(() => {
    if (indexed) controllerRef.current?.update(project, view.id, indexed, editable);
  }, [project, view.id, indexed, editable]);

  useEffect(() => {
    controllerRef.current?.setSelection(selection);
  }, [selection]);

  const controller = () => controllerRef.current;

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
    const result = await send(command);
    const id = result.created?.[0];
    if (result.ok && id !== undefined) {
      onSelect(selectionOf([{ kind: 'element', id }]));
      setPendingEdit({ kind: 'element', id });
    }
  };

  const addNote = async () => {
    const center = controller()?.center;
    if (!center) return;
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
    if (result.ok && id !== undefined) {
      onSelect(selectionOf([{ kind: 'free-shape', id }]));
      setPendingEdit({ kind: 'note', id });
    }
  };

  const addArrow = async () => {
    const center = controller()?.center;
    if (!center) return;
    const y = Math.round(center.y);
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
    if (result.ok && id !== undefined) onSelect(selectionOf([{ kind: 'free-shape', id }]));
  };

  const relate = async (relationType: Id) => {
    if (!relating) return;
    const { from, to } = relating;
    setRelating(undefined);
    const result = await send({ type: 'create-relation', relation: { relationType, from, to } });
    const id = result.created?.[0];
    if (result.ok && id !== undefined) onSelect(selectionOf([{ kind: 'relation', id }]));
    hostRef.current?.focus();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { preview, freeShapes } = deleting;
    setDeleting(undefined);
    const commands: Command[] = [];
    if (preview.elements.length > 0 || preview.relations.length > 0) {
      commands.push({
        type: 'delete',
        elements: preview.elements,
        relations: preview.relations.filter((id) => !preview.cascaded.includes(id)),
      });
    }
    if (freeShapes.length > 0)
      commands.push({ type: 'delete-free-shapes', view: view.id, ids: freeShapes });
    const command: Command | undefined =
      commands.length > 1
        ? { type: 'batch', label: 'Delete the selection', commands }
        : commands[0];
    if (!command) return;
    const result = await send(command);
    if (result.ok) onSelect(EMPTY_SELECTION);
    hostRef.current?.focus();
  };

  // What was just created opens in the in-place editor as soon as it is drawn.
  const pendingShape =
    pendingEdit?.kind === 'element' ? indexed?.byElement.get(pendingEdit.id)?.[0] : undefined;
  const pendingNote =
    pendingEdit?.kind === 'note' && scene.notes.some((note) => note.id === pendingEdit.id)
      ? pendingEdit.id
      : undefined;
  const opened: Editing | undefined =
    editing ??
    (pendingShape
      ? { kind: 'element', key: pendingShape.key }
      : pendingNote !== undefined
        ? { kind: 'note', id: pendingNote }
        : undefined);
  const editedShape: ElementShape | undefined =
    opened?.kind === 'element' ? indexed?.byKey.get(opened.key) : undefined;
  const editedNote: NoteShape | undefined =
    opened?.kind === 'note' ? scene.notes.find((note) => note.id === opened.id) : undefined;
  const closeEditor = () => {
    setEditing(undefined);
    setPendingEdit(undefined);
    hostRef.current?.focus();
  };

  return (
    <div className="canvas-frame">
      <CanvasToolbar
        project={project}
        editable={editable}
        scale={camera?.scale}
        onAdd={(component) => void add(component)}
        onAddNote={() => void addNote()}
        onAddArrow={() => void addArrow()}
        onZoom={(factor) => controller()?.zoomBy(factor)}
        onFit={() => controller()?.fit()}
      />
      <div ref={hostRef} className="canvas-host" role="img" aria-label={label} tabIndex={0} />
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
      {deleting && (
        <DeleteDialog
          project={project}
          preview={deleting.preview}
          freeShapes={deleting.freeShapes.length}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setDeleting(undefined);
            hostRef.current?.focus();
          }}
        />
      )}
      {camera && editedShape && (
        <InlineEditor
          key={editedShape.key}
          rect={editedShape.rect}
          camera={camera}
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
      {camera && editedNote && (
        <InlineEditor
          key={editedNote.id}
          rect={editedNote.rect}
          camera={camera}
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
