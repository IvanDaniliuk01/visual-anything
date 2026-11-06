/**
 * The canvas area answers the pictures Claude asks for (ADR 0081): while it is mounted, it lends the
 * live session what takes them with its renderer, which draws in the theme it shows through the PNG
 * export's path, and with a canvas off screen for the other theme. The view is the one it draws now.
 *
 * A picture waits until the canvas draws the scene of the view the canvas area shows, and no layout is
 * moving in (#16): right after guidance opened another view, the canvas area shows that view before
 * its canvas is given its scene, and a picture taken then showed the view before, or found none of
 * the elements named.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { IndexedScene } from '../canvas/hit';
import type { CanvasRenderer } from '../canvas/renderer';
import { LiveContext } from '../live/context';
import { THEMES } from '../theme/themes';
import { drawOffScreen } from './mirror';
import { takeCapture, type CaptureCanvas } from './take';

/** What takes a picture with this renderer, of the view it draws. */
export function canvasFor(renderer: CanvasRenderer | undefined, view: Id): CaptureCanvas {
  const theme: ThemeName = renderer?.theme ?? 'light';
  return {
    view,
    theme,
    seen: () => {
      // Undefined while the canvas has not started, or has drawn no scene yet.
      if (renderer === undefined || renderer.canvas === undefined) return undefined;
      const { indexed } = renderer.drawnFrom;
      if (indexed === undefined) return undefined;
      return {
        indexed,
        camera: renderer.camera,
        viewport: renderer.viewport,
        hidden: renderer.hiddenShapes,
      };
    },
    draw: async (image) => {
      if (renderer === undefined) throw new Error('The canvas is gone.');
      return renderer.captureImage(image);
    },
    drawIn: async (other, image) => {
      if (renderer === undefined) throw new Error('The canvas is gone.');
      return drawOffScreen(
        renderer.drawnFrom,
        THEMES[other].canvas,
        image,
        image.asShown ? { camera: renderer.camera, viewport: renderer.viewport } : undefined,
      );
    },
  };
}

/** What the canvas area gives its canvas to draw now (#16). */
export interface CaptureDrawn {
  /** The scene of the view it shows, indexed; undefined where it cannot be drawn. */
  indexed: IndexedScene | undefined;
  /** Whether that scene is the one drawn, rather than a frame of a layout moving in. */
  settled: boolean;
}

/**
 * What a picture still waits for before this renderer draws what the canvas area gives it, in words
 * for Claude; undefined once it does, and while the canvas has not started, which a picture says.
 */
export function waitsForOf(
  renderer: CanvasRenderer | undefined,
  view: Id,
  drawn: CaptureDrawn | undefined,
): string | undefined {
  if (drawn === undefined || renderer === undefined || renderer.canvas === undefined)
    return undefined;
  if (!drawn.settled) return `the layout moving in on the view "${view}" to end`;
  if (drawn.indexed !== undefined && renderer.drawnFrom.indexed !== drawn.indexed) {
    return `the canvas to draw the view "${view}"`;
  }
  return undefined;
}

/**
 * Lends the live session what takes Claude's pictures with the controller's renderer, while `lends`,
 * as only the active pane of a split view does (ADR 0102). With `drawn`, what the canvas area gives
 * the canvas, a picture waits until the canvas draws it (#16).
 */
export function useCaptureAnswers(
  controller: RefObject<{ readonly renderer: CanvasRenderer } | null>,
  view: Id,
  lends = true,
  drawn?: CaptureDrawn,
): void {
  const live = useContext(LiveContext);
  const lend = live?.lendCapture;
  const changed = live?.captureChanged;
  const shown = useRef({ view, drawn });
  useLayoutEffect(() => {
    shown.current = { view, drawn };
  });
  useEffect(
    () =>
      lends
        ? lend?.(
            (ask) => takeCapture(ask, canvasFor(controller.current?.renderer, shown.current.view)),
            () => waitsForOf(controller.current?.renderer, shown.current.view, shown.current.drawn),
          )
        : undefined,
    [lend, controller, lends],
  );
  // What a picture waits for may change with each drawing the canvas area gives its canvas: a picture
  // waiting checks again once the canvas has it.
  useEffect(() => {
    if (lends) changed?.();
  });
}
