/**
 * A side panel's inner edge, beside the canvas: a separator that takes the width the person drags it
 * to, or gives it with the keys, and a button that collapses the panel to a strip. While the panel is
 * collapsed, the strip shows in its place, with the button that opens it again.
 */
import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useT } from '../../i18n';
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from '../icons';
import { MIN_PANEL_WIDTH, keyedWidth, maxPanelWidth, shownWidth, type PanelSide } from './layout';
import { PANEL_SHORTCUT, PANEL_SHORTCUT_SHOWN } from './keys';
import type { PanelLayoutStore } from './store';
import './panels.css';

interface PanelEdgeProps {
  store: PanelLayoutStore;
  side: PanelSide;
  /** The id of the panel it sizes, collapses and opens. */
  controls: string;
}

/** What each panel's controls say, in English; they show translated. */
const NAMES: Readonly<
  Record<
    PanelSide,
    {
      width: string;
      collapse: string;
      open: string;
      Close: typeof PanelLeftCloseIcon;
      Open: typeof PanelLeftOpenIcon;
    }
  >
> = {
  model: {
    width: 'Width of the model panel',
    collapse: 'Collapse the model panel',
    open: 'Open the model panel',
    Close: PanelLeftCloseIcon,
    Open: PanelLeftOpenIcon,
  },
  inspector: {
    width: 'Width of the inspector',
    collapse: 'Collapse the inspector',
    open: 'Open the inspector',
    Close: PanelRightCloseIcon,
    Open: PanelRightOpenIcon,
  },
};

export function PanelEdge({ store, side, controls }: PanelEdgeProps) {
  const { layout } = useSyncExternalStore(store.subscribe, store.snapshot);
  return layout[side].collapsed ? (
    <PanelStrip store={store} side={side} controls={controls} />
  ) : (
    <OpenEdge store={store} side={side} controls={controls} />
  );
}

/** Where a drag of the edge started, and the width it last asked for. */
interface Drag {
  pointer: number;
  x: number;
  width: number;
  last: number;
}

function OpenEdge({ store, side, controls }: PanelEdgeProps) {
  const t = useT();
  const { layout, windowWidth } = useSyncExternalStore(store.subscribe, store.snapshot);
  const width = shownWidth(layout[side].width, windowWidth);
  const names = NAMES[side];
  const collapse = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | undefined>(undefined);

  useLayoutEffect(() => {
    if (store.takeFocus(side, 'collapse')) collapse.current?.focus();
  }, [store, side]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      store.toggle(side);
      return;
    }
    const next = keyedWidth(side, event.key, width, windowWidth);
    if (next === undefined) return;
    event.preventDefault();
    store.setWidth(side, next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // No text is selected while the edge moves.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, width, last: width };
    store.setResizing(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    const moved = event.clientX - current.x;
    current.last = current.width + (side === 'model' ? moved : -moved);
    store.preview(side, current.last);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    // Where the pointer is let go is where the edge ends; a cancelled drag ends where it was last.
    if (event.type === 'pointerup') {
      const moved = event.clientX - current.x;
      current.last = current.width + (side === 'model' ? moved : -moved);
    }
    store.setResizing(false);
    store.commit(side, current.last);
  };

  return (
    <>
      <div
        role="separator"
        tabIndex={0}
        className={`panel-edge panel-edge-${side}`}
        data-panel-edge={side}
        aria-orientation="vertical"
        aria-controls={controls}
        aria-label={t(names.width)}
        aria-valuenow={width}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={maxPanelWidth(windowWidth)}
        aria-valuetext={t('{width} pixels', { width })}
        title={t('Drag to change the width; double-click for the default width')}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onDoubleClick={() => store.reset(side)}
      />
      {/* A band of its own at the panel's foot, which the panel ends above, so that it covers nothing. */}
      <div className={`panel-foot panel-foot-${side}`}>
        <button
          ref={collapse}
          type="button"
          className="panel-toggle panel-collapse"
          data-panel-edge={side}
          aria-controls={controls}
          aria-label={t(names.collapse)}
          aria-keyshortcuts={PANEL_SHORTCUT[side]}
          title={t('{name} ({shortcut})', {
            name: t(names.collapse),
            shortcut: PANEL_SHORTCUT_SHOWN[side],
          })}
          onClick={() => store.toggle(side)}
        >
          <names.Close />
        </button>
      </div>
    </>
  );
}

/** The strip a collapsed panel leaves, with the button that opens it again. */
function PanelStrip({ store, side, controls }: PanelEdgeProps) {
  const t = useT();
  const names = NAMES[side];
  const open = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (store.takeFocus(side, 'open')) open.current?.focus();
  }, [store, side]);

  return (
    <div className={`panel-strip panel-strip-${side}`} data-panel-strip={side}>
      <button
        ref={open}
        type="button"
        className="panel-toggle"
        aria-controls={controls}
        aria-label={t(names.open)}
        aria-keyshortcuts={PANEL_SHORTCUT[side]}
        title={t('{name} ({shortcut})', {
          name: t(names.open),
          shortcut: PANEL_SHORTCUT_SHOWN[side],
        })}
        onClick={() => store.toggle(side)}
      >
        <names.Open />
      </button>
    </div>
  );
}

/** What collapsing or opening a panel says, politely, to screen readers. */
export function PanelAnnouncer({ store }: { store: PanelLayoutStore }) {
  const t = useT();
  const { announcement } = useSyncExternalStore(store.subscribe, store.snapshot);
  const text =
    announcement === undefined
      ? ''
      : t(ANNOUNCEMENTS[announcement.side][announcement.collapsed ? 'collapsed' : 'open']);
  return (
    <p className="visually-hidden" aria-live="polite">
      {text}
    </p>
  );
}

const ANNOUNCEMENTS: Readonly<Record<PanelSide, { collapsed: string; open: string }>> = {
  model: { collapsed: 'The model panel is collapsed.', open: 'The model panel is open.' },
  inspector: { collapsed: 'The inspector is collapsed.', open: 'The inspector is open.' },
};
