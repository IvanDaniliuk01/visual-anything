import { useEffect, useRef, useState } from 'react';
import type { Scene } from './scene';
import { SceneCanvas } from './SceneCanvas';

interface CanvasAreaProps {
  /** What to draw. */
  scene: Scene;
  /** The text alternative for the drawing, which screen readers cannot see. */
  label: string;
}

/**
 * The canvas area: PixiJS draws the scene imperatively, outside React's state, so that drawing can
 * later scale to thousands of shapes. React only owns the host element and the messages around it.
 */
export function CanvasArea({ scene, label }: CanvasAreaProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SceneCanvas | null>(null);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = new SceneCanvas(host, (error) => {
      setFailure(error instanceof Error ? error.message : String(error));
    });
    canvasRef.current = canvas;
    return () => {
      canvas.destroy();
      canvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    canvasRef.current?.show(scene);
  }, [scene]);

  return (
    <div className="canvas-frame">
      <div ref={hostRef} className="canvas-host" role="img" aria-label={label} />
      {failure !== undefined ? (
        <p className="canvas-message canvas-failure" role="alert">
          The canvas could not draw this view: {failure}
        </p>
      ) : (
        scene.bounds === undefined && <p className="canvas-message">This view has no shapes yet.</p>
      )}
    </div>
  );
}
