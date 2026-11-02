/**
 * The physical-space panel's frames under the pointer, the fingers and the keys (ADR 0076):
 * - **the camera**: dragging turns it around the point it looks at, Shift, the middle or the right
 *   button drag pans, the wheel and a pinch zoom toward the pointer, two fingers pan, double-clicking
 *   frames what is there or everything, and the keys turn, pan, zoom and fit it;
 * - **selecting and hovering**, linked to the canvas, the outline, the element list and the
 *   inspector: a click selects what it picks, an element or a relation's line, Ctrl, ⌘ or Shift adding
 *   to the selection, and the pointer resting on something hovers it everywhere;
 * - **the handles** that move and rotate the selected posed elements, drawn by the worker and
 *   hit-tested here, snapped to 1 cm and 15° unless Alt is held, sent as one `set-poses` when the
 *   gesture ends; Escape lets a gesture go. While the exploded view is on, the handles stand where
 *   the worker draws what they hold, by how far it says it moved each entry.
 */
import type { Space } from '@visual-anything/core';
import type { Id, SpacePoint } from '@visual-anything/schema';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { useEditor } from '../editor/EditorContext';
import { useHoverStore } from '../editor/hover';
import { EMPTY_SELECTION, selectionOf, toggle, type Selectable } from '../editor/selection';
import { useT } from '../i18n';
import type { PixelSize, SpaceAxis, SpaceDrawnEntry, SpaceHandles } from '../solids/protocol';
import type { SpacePick } from '../solids/solid-client';
import { handleAt, handleShapes } from './handles';
import type { SpaceControl } from './control';
import {
  entriesMoved,
  handlesOf,
  handleTargetOf,
  HandleGesture,
  movedMatrices,
  posesMoved,
  shiftedHandles,
  shiftOfHandles,
} from './drag';
import { cameraKeyOf, cameraMovedByKey, panByDrag, turnByDrag, zoomBy } from './orbit';
import { whereIs } from './where';

/** How far a press moves, in pixels of the page, before it is a drag rather than a click. */
const CLICK_SLOP = 4;
/** How much a wheel's pixel of travel zooms. */
const WHEEL_ZOOM = 0.0015;

export type HandleMode = SpaceHandles['mode'];

export interface SpaceInteractionInput {
  control: SpaceControl;
  canvas: RefObject<HTMLCanvasElement | null>;
  /** The frames' size, in their pixels. */
  size: PixelSize;
  pixelRatio: number;
  space: Space;
  entries: readonly SpaceDrawnEntry[];
  mode: HandleMode;
  setMode: (mode: HandleMode) => void;
  /** Says something through the panel's status. */
  say: (text: string) => void;
  /** Whether nothing can ever be changed here, as in the read-only page: M and R choose nothing. */
  readOnly?: boolean | undefined;
  /** How far the exploded view moves each entry it moves, as the newest frame that said so. */
  shifts?: ReadonlyMap<Id, SpacePoint>;
}

export interface SpaceInteraction {
  /** The entries to draw: what a gesture moves, where it is now. */
  entries: readonly SpaceDrawnEntry[];
  /** The handles to draw, while the selection holds something that moves. */
  handles: SpaceHandles | undefined;
  /** What the frames' canvas takes. */
  props: {
    tabIndex: number;
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerLeave: (event: PointerEvent<HTMLCanvasElement>) => void;
    onDoubleClick: (event: MouseEvent<HTMLCanvasElement>) => void;
    onContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
  };
}

type Point = { x: number; y: number };

/** What the pointers are doing. */
type Gesture =
  | { kind: 'idle' }
  | { kind: 'press'; pointer: number; start: Point; last: Point; moved: boolean; pan: boolean }
  | { kind: 'handle'; pointer: number; gesture: HandleGesture; elements: Id[]; amount: number }
  | { kind: 'pinch'; middle: Point; spread: number };

/** A handle gesture's move, shown until the project answers it. */
interface Preview {
  /** The project it was shown over: once the project changes, it answered or moved on. */
  project: unknown;
  elements: Id[];
  move: readonly number[];
  axis: SpaceAxis;
}

export function useSpaceInteraction(input: SpaceInteractionInput): SpaceInteraction {
  const { control, canvas, size, pixelRatio, space, entries, mode, setMode, say, shifts } = input;
  const readOnly = input.readOnly ?? false;
  const t = useT();
  const editor = useEditor();
  const { project, selection, send } = editor;
  const hovers = useHoverStore();
  const [kept, setPreview] = useState<Preview>();
  const [pointedAxis, setPointedAxis] = useState<SpaceAxis>();
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const pointers = useRef(new Map<number, Point>());
  const hovering = useRef<{ busy: boolean; next: Point | undefined; inside: boolean }>({
    busy: false,
    next: undefined,
    inside: false,
  });

  // A move shown until the project answers it, or the gesture is let go.
  const preview = kept?.project === project ? kept : undefined;

  const editable = send !== undefined;
  const target = useMemo(
    () => (editable ? handleTargetOf(space, selection.elements) : undefined),
    [editable, space, selection.elements],
  );
  const moved = useMemo(
    () => (preview ? movedMatrices(space, preview.elements, preview.move) : undefined),
    [preview, space],
  );
  const shownEntries = useMemo(
    () => (moved ? entriesMoved(entries, moved) : entries),
    [entries, moved],
  );
  // Where the exploded view draws what the handles hold.
  const shift = useMemo(
    () => (target ? shiftOfHandles(target.elements, shifts) : undefined),
    [target, shifts],
  );
  const handles = useMemo(() => {
    if (!target) return undefined;
    const at =
      preview && mode === 'move'
        ? {
            x: target.at.x + (preview.move[12] ?? 0),
            y: target.at.y + (preview.move[13] ?? 0),
            z: target.at.z + (preview.move[14] ?? 0),
          }
        : target.at;
    const drawn = handlesOf({ ...target, at }, mode, preview?.axis ?? pointedAxis);
    return shift ? shiftedHandles(drawn, shift) : drawn;
  }, [target, mode, preview, pointedAxis, shift]);

  /** A point of the page, from the canvas's top left, in pixels of the page. */
  const pageAt = (event: { clientX: number; clientY: number }): Point => {
    const box = canvas.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };
  /** The canvas's size on the page. */
  const pageSize = (): { width: number; height: number } => {
    const box = canvas.current?.getBoundingClientRect();
    return { width: box?.width || size.width, height: box?.height || size.height };
  };
  /** A point of the page in the frames' pixels. */
  const framePoint = (point: Point): Point => {
    const page = pageSize();
    return { x: (point.x * size.width) / page.width, y: (point.y * size.height) / page.height };
  };
  /** The camera the newest frame was drawn from, which is what is pointed at. */
  const drawnCamera = () => control.space?.frame?.camera ?? control.camera();

  /** The handle's axis under a point of the page, if any. */
  const axisAt = (point: Point): SpaceAxis | undefined => {
    const camera = drawnCamera();
    if (!handles || !camera) return undefined;
    const at = framePoint(point);
    return handleAt(handleShapes(handles, camera, size, pixelRatio), at.x, at.y, pixelRatio);
  };

  const latest = useRef({ selection, select: editor.select, project, space, shifts });
  useEffect(() => {
    latest.current = { selection, select: editor.select, project, space, shifts };
  });

  /** Selects what a pick found, adding to the selection with a modifier. */
  const choose = (pick: SpacePick | undefined, adding: boolean) => {
    const { selection: now, select, project: model, space: shown, shifts: moved } = latest.current;
    const item: Selectable | undefined =
      pick?.element != null
        ? { kind: 'element', id: pick.element }
        : pick?.relation !== undefined
          ? { kind: 'relation', id: pick.relation }
          : undefined;
    if (!item) {
      if (!adding) select?.(EMPTY_SELECTION);
      return;
    }
    select?.(adding ? toggle(now, item) : selectionOf([item]));
    if (item.kind === 'element') say(`${whereIs(t, model, shown, item.id, moved)}.`);
  };

  const pickAt = (point: Point) => {
    const at = framePoint(point);
    return control.space?.pick(at.x, at.y) ?? Promise.resolve(undefined);
  };

  /** Hovers what lies under the pointer, one pick at a time, the newest point next. */
  const hoverAt = (point: Point) => {
    const state = hovering.current;
    state.next = point;
    if (state.busy) return;
    const next = state.next;
    state.next = undefined;
    state.busy = true;
    void pickAt(next).then((pick) => {
      state.busy = false;
      if (state.inside) hovers?.set('space', pick?.element ?? undefined);
      if (state.next && state.inside) hoverAt(state.next);
    });
  };

  /** Ends a handle gesture: one `set-poses`, or nothing when nothing moved. */
  const endHandle = (state: Extract<Gesture, { kind: 'handle' }>, cancelled: boolean) => {
    gesture.current = { kind: 'idle' };
    if (cancelled || state.amount === 0 || !send) {
      setPreview(undefined);
      return;
    }
    const { project: model, space: shown } = latest.current;
    const move = state.gesture.matrixOf(state.amount);
    const poseOf = (id: Id) => model.model.elements.find((each) => each.id === id)?.pose;
    const poses = posesMoved(shown, state.elements, move, poseOf);
    if (poses.length === 0) {
      setPreview(undefined);
      return;
    }
    void send({ type: 'set-poses', poses })
      .then((result) => {
        if (!result.ok) setPreview(undefined);
      })
      .catch(() => setPreview(undefined));
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pageAt(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      gesture.current = { kind: 'pinch', middle: middleOf(a, b), spread: spreadOf(a, b) };
      return;
    }
    if (pointers.current.size > 2) return;
    const camera = drawnCamera();
    const axis = event.button === 0 ? axisAt(point) : undefined;
    if (axis && handles && camera && target) {
      gesture.current = {
        kind: 'handle',
        pointer: event.pointerId,
        gesture: new HandleGesture(handles, axis, camera, size, framePoint(point), shift),
        elements: target.elements,
        amount: 0,
      };
      setPreview({ project, elements: target.elements, move: identity(), axis });
      return;
    }
    gesture.current = {
      kind: 'press',
      pointer: event.pointerId,
      start: point,
      last: point,
      moved: false,
      pan: event.button === 1 || event.button === 2 || event.shiftKey,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pageAt(event);
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, point);
    const state = gesture.current;
    const camera = control.camera();
    switch (state.kind) {
      case 'idle': {
        hovering.current.inside = true;
        const axis = axisAt(point);
        if (axis !== pointedAxis) setPointedAxis(axis);
        if (axis) hovers?.set('space', undefined);
        else hoverAt(point);
        return;
      }
      case 'press': {
        if (state.pointer !== event.pointerId) return;
        const dx = point.x - state.last.x;
        const dy = point.y - state.last.y;
        state.last = point;
        if (!state.moved) {
          if (Math.hypot(point.x - state.start.x, point.y - state.start.y) < CLICK_SLOP) return;
          state.moved = true;
        }
        if (!camera) return;
        control.setCamera(
          state.pan ? panByDrag(camera, dx, dy, pageSize().height) : turnByDrag(camera, dx, dy),
        );
        return;
      }
      case 'handle': {
        if (state.pointer !== event.pointerId) return;
        state.amount = state.gesture.moveTo(framePoint(point), !event.altKey);
        setPreview({
          project,
          elements: state.elements,
          move: state.gesture.matrixOf(state.amount),
          axis: state.gesture.axis,
        });
        return;
      }
      case 'pinch': {
        if (pointers.current.size < 2 || !camera) return;
        const [a, b] = [...pointers.current.values()] as [Point, Point];
        const middle = middleOf(a, b);
        const spread = spreadOf(a, b);
        const page = pageSize();
        let next = panByDrag(
          camera,
          middle.x - state.middle.x,
          middle.y - state.middle.y,
          page.height,
        );
        if (state.spread > 0 && spread > 0) {
          next = zoomBy(next, state.spread / spread, {
            x: middle.x / page.width,
            y: middle.y / page.height,
            aspect: page.width / page.height,
          });
        }
        control.setCamera(next);
        gesture.current = { kind: 'pinch', middle, spread };
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    const state = gesture.current;
    if (state.kind === 'handle' && state.pointer === event.pointerId) {
      endHandle(state, false);
      return;
    }
    if (state.kind === 'pinch') {
      // The finger left behind starts afresh, rather than turning by the pinch's last move.
      const [rest] = [...pointers.current];
      gesture.current = rest
        ? {
            kind: 'press',
            pointer: rest[0],
            start: rest[1],
            last: rest[1],
            moved: true,
            pan: false,
          }
        : { kind: 'idle' };
      return;
    }
    if (state.kind !== 'press' || state.pointer !== event.pointerId) return;
    gesture.current = { kind: 'idle' };
    if (state.moved || event.button !== 0) return;
    const adding = event.ctrlKey || event.metaKey || event.shiftKey;
    void pickAt(pageAt(event)).then((pick) => choose(pick, adding));
  };

  const onPointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    const state = gesture.current;
    if (state.kind === 'handle') endHandle(state, true);
    else gesture.current = { kind: 'idle' };
  };

  const onPointerLeave = () => {
    hovering.current.inside = false;
    hovers?.set('space', undefined);
    setPointedAxis(undefined);
  };

  const onDoubleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    void pickAt(pageAt(event)).then((pick) => {
      const element = pick?.element;
      void control.fit(element != null ? [element] : undefined);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const state = gesture.current;
    if (event.key === 'Escape') {
      if (state.kind === 'handle') endHandle(state, true);
      else if (selection.elements.size + selection.relations.size > 0) {
        editor.select?.(EMPTY_SELECTION);
      } else return;
      event.preventDefault();
      return;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'Enter' && plain) {
      const framed = [...selection.elements].filter(
        (each) => space.entries.has(each) || space.faint.has(each),
      );
      void control.fit(framed);
      event.preventDefault();
      return;
    }
    const letter = event.key.toLowerCase();
    if (!readOnly && plain && !event.shiftKey && (letter === 'm' || letter === 'r')) {
      const next: HandleMode = letter === 'm' ? 'move' : 'rotate';
      setMode(next);
      say(next === 'move' ? t('The handles move.') : t('The handles rotate.'));
      event.preventDefault();
      return;
    }
    const key = cameraKeyOf(event);
    if (!key) return;
    event.preventDefault();
    if (key.kind === 'fit') {
      void control.fit();
      return;
    }
    const camera = control.camera();
    if (camera) control.setCamera(cameraMovedByKey(camera, key, pageSize().height));
  };

  // The wheel zooms toward the pointer; it is listened to directly so that it can keep the page still.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    const camera = control.camera();
    if (!camera) return;
    event.preventDefault();
    const point = pageAt(event);
    const page = pageSize();
    const travel = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    control.setCamera(
      zoomBy(camera, Math.exp(travel * WHEEL_ZOOM), {
        x: point.x / page.width,
        y: point.y / page.height,
        aspect: page.width / page.height,
      }),
    );
  });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const listener = (event: WheelEvent) => onWheel(event);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, [canvas]);

  // What the panel hovered stops being hovered once it goes.
  useEffect(() => () => hovers?.set('space', undefined), [hovers]);

  return {
    entries: shownEntries,
    handles,
    props: {
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onDoubleClick,
      onContextMenu: (event) => event.preventDefault(),
      onKeyDown,
    },
  };
}

function middleOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function spreadOf(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
