import type { SendCommand } from '../canvas/CanvasArea';
import type { Scene } from '../canvas/scene';
import { CANVAS_COMMAND } from './canvasCommand';

/**
 * Stands in for the canvas area, whose PixiJS canvas needs WebGL and jsdom has none. While the project
 * can be changed, it offers a button that sends one command, as an edit on the canvas would.
 */
export function CanvasArea({
  label,
  onCommand,
}: {
  scene: Scene;
  label: string;
  onCommand?: SendCommand;
}) {
  return (
    <>
      <div role="img" aria-label={label} />
      {onCommand && (
        <button type="button" onClick={() => void onCommand(CANVAS_COMMAND)}>
          Edit on the canvas
        </button>
      )}
    </>
  );
}
