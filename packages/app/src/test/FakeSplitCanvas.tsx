import type { ViewFile } from '@visual-anything/schema';
import { useEffect, useRef, useState } from 'react';
import { selectionOf, type Selection } from '../editor/selection';
import type { CanvasCamera } from '../view-state/canvas';
import { FakeCamera, fakeCameras } from './fakeCamera';

/**
 * Stands in for the canvas area in tests of the split view (ADR 0102): it says which view it draws,
 * whether it is the active pane and places new shapes, how many scenes it was given, and what it
 * selects, hands the shell a camera, and offers buttons
 * that select the patient, or the view's first free shape, as a click on its shape would.
 */
export function CanvasArea({
  view,
  label,
  selection,
  onSelect,
  onCanvas,
  active = true,
  placesNew = true,
  scene,
}: {
  view: ViewFile;
  scene: unknown;
  placesNew?: boolean;
  label: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCanvas?: (canvas: CanvasCamera | undefined) => void;
  active?: boolean;
}) {
  const [camera] = useState(() => new FakeCamera());
  // Every scene this canvas was given, as the real one indexes and draws each anew.
  const scenes = useRef(new Set<unknown>());
  // eslint-disable-next-line react-hooks/refs -- a count of what this stand-in was given, for tests
  scenes.current.add(scene);
  useEffect(() => {
    fakeCameras.set(view.id, camera);
  }, [view.id, camera]);
  useEffect(() => {
    onCanvas?.(camera);
    return () => onCanvas?.(undefined);
  }, [onCanvas, camera]);
  return (
    <div
      role="application"
      aria-roledescription="canvas"
      aria-label={label}
      data-view={view.id}
      data-active={String(active)}
      data-places-new={String(placesNew)}
      // eslint-disable-next-line react-hooks/refs -- read for tests, as above
      data-scenes={scenes.current.size}
      data-selected={[...selection.elements].join(' ')}
      data-free={[...selection.freeShapes].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(selectionOf([{ kind: 'element', id: 'patient' }]))}
      >
        Select the patient in {view.name}
      </button>
      {view.freeShapes[0] && (
        <button
          type="button"
          onClick={() =>
            onSelect(selectionOf([{ kind: 'free-shape', id: view.freeShapes[0]?.id ?? '' }]))
          }
        >
          Select a free shape in {view.name}
        </button>
      )}
    </div>
  );
}
