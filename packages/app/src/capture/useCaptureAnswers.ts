/**
 * The canvas area answers the pictures Claude asks for (ADR 0081): while it is mounted, it lends the
 * live session what takes them with its renderer, which draws in the theme it shows through the PNG
 * export's path, and with a canvas off screen for the other theme. The view is the one it draws now.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
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

/** Lends the live session what takes Claude's pictures with the controller's renderer. */
export function useCaptureAnswers(
  controller: RefObject<{ readonly renderer: CanvasRenderer } | null>,
  view: Id,
): void {
  const lend = useContext(LiveContext)?.lendCapture;
  const shown = useRef(view);
  useLayoutEffect(() => {
    shown.current = view;
  });
  useEffect(
    () => lend?.((ask) => takeCapture(ask, canvasFor(controller.current?.renderer, shown.current))),
    [lend, controller],
  );
}
