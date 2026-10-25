/**
 * Where the export finds what draws the open view: the canvas area lends it its renderer while it is
 * mounted, through a context the shell provides, so that the header's Export reaches the canvas
 * without the two knowing of each other.
 */
import { createContext, useContext, useEffect, type RefObject } from 'react';
import type { Camera } from '../canvas/camera';
import type { Size } from '../canvas/geometry';
import type { ImageRequest } from './image';

/** What draws images of the open view: the canvas's renderer. */
export interface ImageMaker {
  /** Where the canvas looks now. */
  readonly camera: Camera;
  /** The canvas's size on screen, in CSS pixels. */
  readonly viewport: Size;
  /** Draws a PNG of the open view (`CanvasRenderer.exportImage`). */
  exportImage(request: ImageRequest): Promise<Blob>;
}

/** What the export asks for what draws images: the canvas lends it. */
export class ImageSource {
  #lent: (() => ImageMaker | undefined) | undefined;

  /** Lends a way to reach what draws images; returns what takes it back. */
  lend(find: () => ImageMaker | undefined): () => void {
    this.#lent = find;
    return () => {
      if (this.#lent === find) this.#lent = undefined;
    };
  }

  /** What draws images now; none while no canvas lends one, or its renderer is gone. */
  get maker(): ImageMaker | undefined {
    return this.#lent?.();
  }
}

/** The shell's image source; null where nothing exports, as in tests of the canvas alone. */
export const ImageSourceContext = createContext<ImageSource | null>(null);

/**
 * Lends the export the renderer of the canvas's controller, read when an image is asked for, for as
 * long as the component that calls it is mounted.
 */
export function useLendRenderer(
  controller: RefObject<{ readonly renderer: ImageMaker } | null>,
): void {
  const source = useContext(ImageSourceContext);
  useEffect(() => source?.lend(() => controller.current?.renderer), [source, controller]);
}
