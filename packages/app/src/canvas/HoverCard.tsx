/**
 * A shape's hover card (ADR 0082): its name and its whole detail, with its text emphasis, under the
 * shape, in the HTML layer over the canvas, once the pointer rested on it, or the keys reached it, for
 * 400 ms, and only when the canvas cut what it writes. It is built of text nodes only, and hidden
 * from screen readers, which hear the whole detail when the shape is announced. The editor's canvas
 * and the read-only page show the same card.
 */
import { useSyncExternalStore } from 'react';
import { EmphasisRunsOf } from '../text/EmphasisText';
import { worldToScreen, type Camera } from './camera';
import { detailOf } from './draw';
import type { Point } from './geometry';
import type { ElementShape } from './scene';
import './hover-card.css';

export function HoverCard({ shape, at }: { shape: ElementShape; at: Point }) {
  const detail = detailOf(shape);
  return (
    <div
      className="canvas-hover-card"
      aria-hidden="true"
      data-shape={shape.key}
      style={{ transform: `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)` }}
    >
      <div className="canvas-hover-card-name">{shape.name}</div>
      {detail !== '' && (
        <div className="canvas-hover-card-detail">
          {shape.detailRuns && shape.collapsed === undefined ? (
            <EmphasisRunsOf runs={shape.detailRuns} />
          ) : (
            detail
          )}
        </div>
      )}
    </div>
  );
}

/** What follows the canvas's camera, as each canvas keeps it outside React's state. */
export interface CameraSource {
  subscribe: (listener: () => void) => () => void;
  current: () => Camera | undefined;
}

/** A shape's hover card, under the shape where the camera shows it now. */
export function PlacedHoverCard({
  shape,
  cameras,
}: {
  shape: ElementShape | undefined;
  cameras: CameraSource;
}) {
  const camera = useSyncExternalStore(cameras.subscribe, cameras.current);
  if (!shape || !camera) return null;
  const { x, y, height } = shape.rect;
  const at = worldToScreen(camera, { x, y: y + height });
  return <HoverCard shape={shape} at={{ x: at.x, y: at.y + 6 }} />;
}
