import type { Scene } from '../canvas/scene';

/** Stands in for the canvas area, whose PixiJS canvas needs WebGL and jsdom has none. */
export function CanvasArea({ label }: { scene: Scene; label: string }) {
  return <div role="img" aria-label={label} />;
}
