/**
 * An explorable live in place on the canvas (ADR 0107, A10.3): its frame laid over its shape, at the
 * shape's size in canvas units, so that the page lays out as its still was taken, and scaled with the
 * camera, so that it follows pan and zoom. Its position is written to the element's style as the
 * camera moves, outside React, so that panning renders nothing. Escape, or Show still, turns it
 * still again; an explorable that may not run shows its card here, with what can be done about it.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { ExplorableView } from '../../explorables/ExplorableView';
import { useT } from '../../i18n';
import type { Camera } from '../camera';
import type { Rect } from '../geometry';
import type { LiveTarget } from './live';
import './live.css';

export interface LiveExplorableProps {
  target: LiveTarget;
  project: ProjectSnapshot;
  /** Where its spot is, in canvas units. */
  rect: Rect;
  camera: () => Camera | undefined;
  subscribe: (listener: () => void) => () => void;
  onSelect: (element: Id) => void;
  onStill: () => void;
}

export function LiveExplorable({
  target,
  project,
  rect,
  camera,
  subscribe,
  onSelect,
  onStill,
}: LiveExplorableProps) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const place = () => {
      const now = camera();
      if (!now) return;
      element.style.transform = `translate(${now.x + rect.x * now.scale}px, ${now.y + rect.y * now.scale}px) scale(${now.scale})`;
    };
    place();
    return subscribe(place);
  }, [camera, subscribe, rect.x, rect.y]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onStill();
  };
  return (
    <div
      ref={box}
      className="canvas-live-explorable"
      style={{ width: rect.width, height: rect.height }}
      onKeyDown={keyDown}
    >
      <ExplorableView
        project={project}
        explorable={target.explorable}
        element={target.element}
        onSelect={onSelect}
      />
      <button
        type="button"
        className="canvas-live-explorable-still"
        title={t('Show its still again (Escape)')}
        aria-label={t('Show its still again (Escape)')}
        onClick={onStill}
      >
        ×
      </button>
    </div>
  );
}
