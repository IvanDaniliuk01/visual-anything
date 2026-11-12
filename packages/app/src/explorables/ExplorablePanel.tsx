/**
 * The explorable panel (ADR 0107): beside the canvas, between it and the inspector, it shows the
 * explorable of the selected element live, an element's own appearance winning over its
 * component's. It can be open together with the physical-space panel (ADR 0076), one above the
 * other in the same column: the physical-space panel on top, this one below, with a divider between
 * them that moves the height this one takes. Its side edge moves the column's width, its own while
 * it stands alone and the physical-space panel's while they stand together. Its bar names what it
 * shows, opens it in a pane of the split view (ADR 0102) and closes the panel.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  useContext,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { OverflowButton } from '../canvas/ToolbarMore';
import type { Selection } from '../editor/selection';
import { useT } from '../i18n';
import { DismissIcon } from '../shell/icons';
import { maxSpacePanelWidth } from '../space/store';
import type { SpacePanelStore } from '../space/store';
import { ExplorablePanelContext } from './context';
import { explorableOf, explorableOfElement } from './explorable';
import { ExplorableView } from './ExplorableView';
import {
  MIN_EXPLORABLE_PANEL_HEIGHT,
  MIN_EXPLORABLE_PANEL_WIDTH,
  keyedSize,
  type ExplorablePanelStore,
} from './panel-store';
import './explorables.css';

export interface ExplorablePanelProps {
  id: string;
  store: ExplorablePanelStore;
  /** The physical-space panel's store, whose column this panel shares while both are open. */
  space: SpacePanelStore;
  project: ProjectSnapshot;
  selection: Selection;
  onSelect: (element: Id) => void;
  /** Opens an explorable in a pane of the split view, beside the active one. */
  onOpenBeside?: ((explorable: Id, element: Id | undefined) => void) | undefined;
}

/** The element whose explorable the panel shows: the one selected, while one is. */
function selectedElement(selection: Selection): Id | undefined {
  return selection.elements.size === 1 ? [...selection.elements][0] : undefined;
}

export function ExplorablePanel(props: ExplorablePanelProps) {
  const { store, space } = props;
  useSyncExternalStore(store.subscribe, store.snapshot);
  useSyncExternalStore(space.subscribe, space.snapshot);
  if (!store.open) return null;
  const stacked = space.shown;
  return (
    <>
      <SideEdge control={stacked ? space : store} controls={props.id} stacked={stacked} />
      <OpenExplorablePanel {...props} stacked={stacked} />
    </>
  );
}

function OpenExplorablePanel({
  id,
  store,
  project,
  selection,
  onSelect,
  onOpenBeside,
  stacked,
}: ExplorablePanelProps & { stacked: boolean }) {
  const t = useT();
  const heading = useId();
  const element = selectedElement(selection);
  const explorable = useMemo(
    () => (element === undefined ? undefined : explorableOfElement(project, element)),
    [project, element],
  );
  const shown = explorable === undefined ? undefined : explorableOf(project, explorable);
  return (
    <section className="explorable-panel" id={id} aria-labelledby={heading}>
      {stacked && <TopDivider store={store} controls={id} />}
      <div className="explorable-panel-bar">
        <h2 id={heading} className="explorable-panel-title">
          {t('Explorable')}
        </h2>
        {shown && <span className="explorable-panel-shows">{shown.definition.name}</span>}
        {shown && onOpenBeside && (
          <button
            type="button"
            className="space-panel-tool"
            title={t('Open “{name}” in a pane beside the active one', {
              name: shown.definition.name,
            })}
            onClick={() => onOpenBeside(shown.id, element)}
          >
            {t('Open beside')}
          </button>
        )}
        <button
          type="button"
          className="space-panel-close"
          aria-label={t('Close the explorable panel')}
          title={t('Close the explorable panel')}
          onClick={() => store.setOpen(false)}
        >
          <DismissIcon />
        </button>
      </div>
      <div className="explorable-panel-body">
        {explorable === undefined ? (
          <p className="explorable-message">
            {element === undefined
              ? t('Select one element that shows an explorable, and it runs here.')
              : t('The element selected shows no explorable.')}
          </p>
        ) : (
          <ExplorableView
            key={`${explorable} ${element ?? ''}`}
            project={project}
            explorable={explorable}
            element={element}
            onSelect={onSelect}
          />
        )}
      </div>
    </section>
  );
}

/** What an edge moves: the explorable panel's own width, or the physical-space panel's. */
interface WidthControl {
  readonly width: number;
  setWidth(width: number): void;
  preview(width: number): void;
  reset(): void;
  setResizing(resizing: boolean): void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => unknown;
}

interface Drag {
  pointer: number;
  at: number;
  size: number;
  last: number;
}

/** The panel's left side: the width of the column it stands in. */
function SideEdge({
  control,
  controls,
  stacked,
}: {
  control: WidthControl;
  controls: string;
  stacked: boolean;
}) {
  const t = useT();
  useSyncExternalStore(control.subscribe, control.snapshot);
  const width = control.width;
  const windowWidth = typeof window === 'undefined' ? width * 2 : window.innerWidth;
  const most = maxSpacePanelWidth(windowWidth);
  const drag = useRef<Drag | undefined>(undefined);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = keyedSize(event.key, width, MIN_EXPLORABLE_PANEL_WIDTH, most, 'ArrowLeft');
    if (next === undefined) return;
    event.preventDefault();
    control.setWidth(next);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, at: event.clientX, size: width, last: width };
    control.setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    // The edge is the panel's left side: moving it left widens the panel.
    current.last = current.size - (event.clientX - current.at);
    control.preview(current.last);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    control.setResizing(false);
    control.setWidth(current.last);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      className={
        stacked ? 'panel-edge explorable-panel-edge stacked' : 'panel-edge explorable-panel-edge'
      }
      aria-orientation="vertical"
      aria-controls={controls}
      aria-label={t('Width of the explorable panel')}
      aria-valuenow={width}
      aria-valuemin={MIN_EXPLORABLE_PANEL_WIDTH}
      aria-valuemax={most}
      aria-valuetext={t('{width} pixels', { width })}
      title={t('Drag to change the width; double-click for the default width')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={() => control.reset()}
    />
  );
}

/** The divider between the physical-space panel and this one, below it: the height this one takes. */
function TopDivider({ store, controls }: { store: ExplorablePanelStore; controls: string }) {
  const t = useT();
  const height = store.height;
  const drag = useRef<Drag | undefined>(undefined);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = keyedSize(event.key, height, MIN_EXPLORABLE_PANEL_HEIGHT, 100_000, 'ArrowUp');
    if (next === undefined) return;
    event.preventDefault();
    store.setHeight(next);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, at: event.clientY, size: height, last: height };
    store.setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    // The divider is the panel's top: moving it up makes the panel taller.
    current.last = current.size - (event.clientY - current.at);
    store.previewHeight(current.last);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    store.setResizing(false);
    store.setHeight(current.last);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      className="explorable-panel-divider"
      aria-orientation="horizontal"
      aria-controls={controls}
      aria-label={t('Height of the explorable panel')}
      aria-valuenow={height}
      aria-valuemin={MIN_EXPLORABLE_PANEL_HEIGHT}
      aria-valuetext={t('{height} pixels', { height })}
      title={t('Drag to change the height; double-click for the default height')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onDoubleClick={() => store.resetHeight()}
    />
  );
}

/**
 * Explorable, in the canvas toolbar: opens the explorable panel beside the canvas, or closes it. It
 * shows pressed while the panel is open, and goes under More with the physical-space panel's button
 * when the toolbar's row has no room. Outside the shell there is no panel, and no button.
 */
export function ExplorablePanelToggle() {
  const t = useT();
  const store = useContext(ExplorablePanelContext);
  const subscribe = store?.subscribe ?? noSubscribe;
  useSyncExternalStore(subscribe, store?.snapshot ?? noSnapshot);
  if (!store) return null;
  const open = store.open;
  return (
    <OverflowButton
      group="space"
      type="button"
      className="space-panel-toggle"
      aria-pressed={open}
      title={t(open ? 'Close the explorable panel' : 'Open the explorable panel')}
      onClick={() => store.toggle()}
    >
      <span className="canvas-toolbar-label">{t('Explorable')}</span>
    </OverflowButton>
  );
}

const noSubscribe = () => () => {};
const noSnapshot = () => undefined;
