/**
 * The physical-space panel's edge, between it and the canvas (ADR 0076): a separator that takes the
 * width the person drags it to, or gives it with the keys, down to 280 pixels, the canvas keeping the
 * rest; a double click gives back the width it opens at. Closing is the toolbar's and the panel's own.
 */
import { useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../i18n';
import {
  MIN_SPACE_PANEL_WIDTH,
  keyedSpacePanelWidth,
  maxSpacePanelWidth,
  type SpacePanelStore,
} from './store';

interface Drag {
  pointer: number;
  x: number;
  width: number;
  last: number;
}

export function SpacePanelEdge({ store, controls }: { store: SpacePanelStore; controls: string }) {
  const t = useT();
  useSyncExternalStore(store.subscribe, store.snapshot);
  const width = store.width;
  const windowWidth = typeof window === 'undefined' ? width * 2 : window.innerWidth;
  const drag = useRef<Drag | undefined>(undefined);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = keyedSpacePanelWidth(event.key, width, windowWidth);
    if (next === undefined) return;
    event.preventDefault();
    store.setWidth(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, width, last: width };
    store.setResizing(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    // The edge is the panel's left side: moving it left widens the panel.
    current.last = current.width - (event.clientX - current.x);
    store.preview(current.last);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    if (event.type === 'pointerup') current.last = current.width - (event.clientX - current.x);
    store.setResizing(false);
    store.setWidth(current.last);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      className="panel-edge space-panel-edge"
      aria-orientation="vertical"
      aria-controls={controls}
      aria-label={t('Width of the physical-space panel')}
      aria-valuenow={width}
      aria-valuemin={MIN_SPACE_PANEL_WIDTH}
      aria-valuemax={maxSpacePanelWidth(windowWidth)}
      aria-valuetext={t('{width} pixels', { width })}
      title={t('Drag to change the width; double-click for the default width')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={() => store.reset()}
    />
  );
}
