/**
 * The divider under World's tree in the Model tab: a separator dragged, or moved with the arrow keys,
 * to give the tree more or less of the tab's height. Double-click or Enter gives the tree its own
 * height again, the room the views and scenarios leave it. The height is each person's, kept in the
 * browser, not in the project.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../i18n';
import { MIN_WORLD_HEIGHT } from './worldHeight';

/** How far an arrow key moves the divider; with Shift, further. */
const STEP = 16;
const BIG_STEP = 64;

interface WorldDividerProps {
  /** The section of World's tree, whose height it reads when a drag starts. */
  world: React.RefObject<HTMLElement | null>;
  /** The id of that section, which the divider controls. */
  controls: string;
  height: number | undefined;
  setHeight: (height: number | undefined) => void;
  maxHeight: () => number;
}

export function WorldDivider({ world, controls, height, setHeight, maxHeight }: WorldDividerProps) {
  const t = useT();
  const drag = useRef<{ pointer: number; y: number; height: number } | undefined>(undefined);
  // World's own height, measured once it is drawn and whenever it changes size.
  const [own, setOwn] = useState<number>(MIN_WORLD_HEIGHT);
  useLayoutEffect(() => {
    const section = world.current;
    if (!section) return;
    const measure = () => setOwn(section.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [world]);
  const current = () => height ?? own;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? BIG_STEP : STEP;
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = current() + step;
    else if (event.key === 'ArrowUp') next = current() - step;
    else if (event.key === 'Home') next = MIN_WORLD_HEIGHT;
    else if (event.key === 'End') next = maxHeight();
    else if (event.key === 'Enter') {
      event.preventDefault();
      setHeight(undefined);
      return;
    } else return;
    event.preventDefault();
    setHeight(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // No text is selected while the divider moves.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, y: event.clientY, height: current() };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const started = drag.current;
    if (started?.pointer !== event.pointerId) return;
    // From where the drag started, so that going past a limit and back never drifts.
    setHeight(started.height + event.clientY - started.y);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const shown = Math.round(current());
  return (
    <div
      role="separator"
      tabIndex={0}
      className="model-world-divider"
      aria-orientation="horizontal"
      aria-controls={controls}
      aria-label={t('Height of World')}
      aria-valuemin={MIN_WORLD_HEIGHT}
      aria-valuemax={Math.round(maxHeight())}
      aria-valuenow={shown}
      aria-valuetext={
        height === undefined
          ? t('Its own height, {n} pixels', { n: shown })
          : t('{n} pixels', { n: shown })
      }
      title={t(
        'Drag to give World more or less room; double-click to give it its own height again.',
      )}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={() => setHeight(undefined)}
    />
  );
}
