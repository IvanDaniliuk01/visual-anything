/**
 * A shape's hover card (ADR 0082): its name and its whole detail, with its text emphasis, beside the
 * shape, in the HTML layer over the canvas. It is built of text nodes only, and hidden from screen
 * readers, which hear the whole detail when the shape is announced.
 */
import { EmphasisRunsOf } from '../text/EmphasisText';
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
