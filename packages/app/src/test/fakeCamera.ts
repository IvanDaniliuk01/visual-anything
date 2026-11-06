import type { Camera } from '../canvas/camera';
import type { CanvasCamera } from '../view-state/canvas';

/** The camera of each fake canvas made, by the view it shows, last made last. */
export const fakeCameras = new Map<string, FakeCamera>();

/** A canvas's camera without a canvas: it moves where it is told and says so. */
export class FakeCamera implements CanvasCamera {
  #camera: Camera = { x: 0, y: 0, scale: 1 };
  readonly #listeners = new Set<() => void>();

  camera(): Camera {
    return this.#camera;
  }

  viewport() {
    return { width: 800, height: 600 };
  }

  setCamera(camera: Camera): void {
    this.#camera = camera;
    for (const listener of [...this.#listeners]) listener();
  }

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  reveal(): void {}

  targetOf(): Camera {
    return this.#camera;
  }

  glideTo(camera: Camera): void {
    this.setCamera(camera);
  }
}
