/**
 * The open view's threads as pins over the canvas (ADR 0059): open threads show on what they are
 * about, resolved ones only while the panel shows resolved threads, and nothing the filters hide.
 * Pins follow the camera without drawing the canvas again; one pin holds every thread about one
 * thing. Choosing a pin shows its thread, or its threads, in the comments tab and selects what it is
 * on. While a thread is being placed on a point, a layer over the canvas takes the click.
 */
import { authorKeyOf, isResolved } from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { screenToWorld, worldToScreen, type Camera } from '../canvas/camera';
import { EditorContext } from '../editor/EditorContext';
import { useEmphasis } from '../editor/emphasis';
import { selectionOf } from '../editor/selection';
import { useT } from '../i18n';
import type { CanvasCamera } from '../view-state/canvas';
import { aboutText } from './about';
import { pinsOf, type Pin } from './pins';
import { useComments, type CommentFilters } from './store';
import './comments.css';

/** How large a pin is on screen, in CSS pixels: the --control-sm token at the root size. */
const PIN_SIZE = 28;

interface CommentPinsProps {
  /** The canvas's camera, once the canvas is made; no pin shows before. */
  canvas: CanvasCamera | undefined;
}

export function CommentPins({ canvas }: CommentPinsProps) {
  const t = useT();
  const editor = useContext(EditorContext);
  const [store, state] = useComments();
  const emphasis = useEmphasis();
  const project = editor?.project;
  const scene = editor?.scene;
  const viewId = editor?.viewId;
  const { filters, placing, composing, point } = state;

  const threads = useMemo(
    () => (project ? project.comments.filter((thread) => pinned(thread, filters)) : []),
    [project, filters],
  );
  const pins = useMemo(() => {
    if (!scene || viewId === undefined) return [];
    const shown = pinsOf(scene, viewId, threads, emphasis.hidden);
    // A thread being written on a point shows where it goes.
    if (composing?.kind === 'point' && composing.view === viewId) {
      shown.push({
        key: 'composing',
        at: { x: composing.x, y: composing.y },
        threads: [],
        resolved: false,
      });
    }
    return shown;
  }, [scene, viewId, threads, emphasis.hidden, composing]);

  // Pins follow the camera: their places are written straight onto them, frame by frame.
  const layer = useRef<HTMLDivElement>(null);
  const place = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    place.current = () => {
      const element = layer.current;
      if (element) placePins(element, pins, canvas);
    };
    place.current();
  });
  useEffect(() => canvas?.subscribe(() => place.current()), [canvas]);

  // A point asked for comes into the middle of the canvas once its view is open and drawn.
  const moved = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!point || !canvas || point.view !== viewId || moved.current === point.request) return;
    const camera = canvas.camera();
    if (!camera) return;
    moved.current = point.request;
    const { width, height } = canvas.viewport();
    canvas.setCamera({
      scale: camera.scale,
      x: width / 2 - point.x * camera.scale,
      y: height / 2 - point.y * camera.scale,
    });
  }, [point, canvas, viewId, scene]);

  if (!project || !scene || viewId === undefined) return null;

  const choose = (pin: Pin) => {
    const [first] = pin.threads;
    if (!first) return;
    const { anchor } = first;
    if (anchor.kind === 'element')
      editor?.select(selectionOf([{ kind: 'element', id: anchor.element }]));
    if (anchor.kind === 'relation')
      editor?.select(selectionOf([{ kind: 'relation', id: anchor.relation }]));
    if (pin.threads.length === 1) store.openThread(first.id);
    else {
      store.openThread(undefined);
      store.setFilters({
        about:
          anchor.kind === 'element'
            ? anchor.element
            : anchor.kind === 'relation'
              ? anchor.relation
              : anchor.view,
      });
    }
    store.show();
  };

  const placeAt = (camera: Camera, x: number, y: number) => {
    const at = screenToWorld(camera, { x, y });
    store.compose({ kind: 'point', view: viewId, x: Math.round(at.x), y: Math.round(at.y) });
    store.show();
  };
  const onPlace = (event: MouseEvent<HTMLDivElement>) => {
    const camera = canvas?.camera();
    if (!camera) return;
    const box = event.currentTarget.getBoundingClientRect();
    placeAt(camera, event.clientX - box.left, event.clientY - box.top);
  };
  const onPlacingKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      store.setPlacing(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const camera = canvas?.camera();
      if (!camera || !canvas) return;
      const { width, height } = canvas.viewport();
      placeAt(camera, width / 2, height / 2);
    }
  };

  return (
    <div ref={layer} className="comment-pins">
      {pins.map((pin) => {
        const [first] = pin.threads;
        if (!first) {
          return (
            <span
              key={pin.key}
              data-pin={pin.key}
              className="comment-pin comment-pin-new"
              aria-hidden="true"
              hidden
            >
              +
            </span>
          );
        }
        const about = aboutText(t, project, first.anchor);
        const label = pin.resolved
          ? t(
              {
                one: '{count} resolved thread: {about}',
                other: '{count} resolved threads: {about}',
              },
              { count: pin.threads.length, about },
            )
          : t(
              { one: '{count} thread: {about}', other: '{count} threads: {about}' },
              { count: pin.threads.length, about },
            );
        return (
          <button
            key={pin.key}
            type="button"
            data-pin={pin.key}
            className={pin.resolved ? 'comment-pin comment-pin-resolved' : 'comment-pin'}
            aria-label={label}
            title={label}
            hidden
            onClick={() => choose(pin)}
          >
            {pin.threads.length > 1 ? pin.threads.length : ''}
          </button>
        );
      })}
      {placing && (
        <div
          className="comment-placing"
          role="button"
          tabIndex={0}
          aria-label={t(
            'Place the comment: click where it goes, or press Enter for the middle of the canvas. Escape gives up.',
          )}
          // The layer takes the keys while it waits for the place.
          autoFocus
          onClick={onPlace}
          onKeyDown={onPlacingKey}
        />
      )}
    </div>
  );
}

/** Writes where each pin is on screen straight onto it, and hides those off the canvas. */
function placePins(
  layer: HTMLElement,
  pins: readonly Pin[],
  canvas: CanvasCamera | undefined,
): void {
  const camera = canvas?.camera();
  const viewport = canvas?.viewport();
  for (const button of layer.querySelectorAll<HTMLElement>('[data-pin]')) {
    const pin = pins.find((each) => each.key === button.dataset.pin);
    if (!camera || !pin || !viewport) {
      button.hidden = true;
      continue;
    }
    const at = worldToScreen(camera, pin.at);
    button.hidden =
      at.x < -PIN_SIZE ||
      at.y < -PIN_SIZE ||
      at.x > viewport.width + PIN_SIZE ||
      at.y > viewport.height + PIN_SIZE;
    button.style.transform = `translate(${Math.round(at.x - PIN_SIZE / 2)}px, ${Math.round(at.y - PIN_SIZE / 2)}px)`;
  }
}

/** Whether a thread has a pin while the panel's filters are these: their state and author. */
function pinned(thread: CommentFile, filters: Readonly<CommentFilters>): boolean {
  if (filters.state !== 'all' && isResolved(thread) !== (filters.state === 'resolved'))
    return false;
  return (
    filters.author === undefined ||
    thread.comments.some((comment) => authorKeyOf(comment.author) === filters.author)
  );
}
