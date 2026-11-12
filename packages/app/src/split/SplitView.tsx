/**
 * The split view (ADR 0102): the canvas area's panes side by side, each drawing the canvas the shell
 * gives it, with the borders between them, which a drag or the arrow keys move, and, while two or
 * more show, a header on each that names its view, chooses another, opens it beside and closes it.
 * Pressing in a pane, or moving the focus into it, makes it active, which its border shows.
 *
 * What acts on the open view but is not the canvas itself, as the comment pins, Claude's guidance,
 * the find bar and a tour's stage, shows over the active pane: laid over the canvas area where that
 * pane's canvas is, so that it stays mounted as another pane becomes active.
 *
 * One pane shows no header and no border: the canvas area is then the single canvas it was.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { explorableOf } from '../explorables/explorable';
import { useT } from '../i18n';
import { DismissIcon } from '../shell/icons';
import { viewsInListOrder } from '../shell/viewFolders';
import { RESIZE_STEP, minimumShare, type Pane, type PaneLayout, type SplitPanes } from './panes';
import { viewOf } from './views';
import './split.css';

interface SplitViewProps {
  store: SplitPanes;
  layout: PaneLayout;
  project: ProjectSnapshot;
  /** Opens a view in a pane beside the active one. */
  onOpenBeside: (view: Id) => void;
  /** The canvas each pane draws, and whether it is the active one. */
  children: (pane: Pane, active: boolean) => ReactNode;
  /** What shows over the active pane. */
  overlay: ReactNode;
  /** Whether the active pane stays active whatever is pressed, as while a tour plays in it. */
  held?: boolean;
}

export function SplitView({
  store,
  layout,
  project,
  onOpenBeside,
  children,
  overlay,
  held = false,
}: SplitViewProps) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const split = layout.panes.length > 1;
  // Pressing in a pane makes it active first, as moving the focus into it does; its header, whose
  // controls act on that pane by itself, does not. While a tour plays, it stays in its pane.
  const activate = (pane: Pane, target: EventTarget) => {
    if (held) return;
    if (target instanceof Element && target.closest('.canvas-pane-header') !== null) return;
    store.activate(pane.id);
  };
  return (
    <>
      <div ref={container} className="canvas-panes" {...(split ? { 'data-split': '' } : {})}>
        {layout.panes.map((pane, index) => {
          const active = pane.id === layout.active;
          const view = viewOf(project, pane.view);
          const name = paneName(project, pane);
          const left = layout.panes[index - 1];
          return (
            <Fragment key={pane.id}>
              {left && (
                <PaneBorder
                  store={store}
                  border={index - 1}
                  share={left.width / (left.width + pane.width)}
                  container={container}
                  label={t('Resize “{left}” and “{right}”', {
                    left: paneName(project, left),
                    right: name,
                  })}
                />
              )}
              <section
                className="canvas-pane"
                data-pane={pane.id}
                {...(active ? { 'data-active': '' } : {})}
                {...(split
                  ? {
                      'aria-label': pane.explorable
                        ? t('{name}, an explorable beside the views', { name })
                        : active
                          ? t('{view}, the active pane', { view: name })
                          : t('{view}, a pane', { view: name }),
                      style: { flexGrow: pane.width },
                    }
                  : {})}
                onPointerDownCapture={(event) => activate(pane, event.target)}
                onFocusCapture={(event) => activate(pane, event.target)}
              >
                {split && pane.explorable && (
                  <ExplorablePaneHeader store={store} pane={pane} name={name} />
                )}
                {split && !pane.explorable && view && (
                  <PaneHeader
                    store={store}
                    pane={pane}
                    view={view}
                    project={project}
                    onOpenBeside={onOpenBeside}
                  />
                )}
                <div className="canvas-pane-body">{children(pane, active)}</div>
              </section>
            </Fragment>
          );
        })}
      </div>
      <ActiveOverlay container={container} layout={layout}>
        {overlay}
      </ActiveOverlay>
    </>
  );
}

/** What a pane shows, by name: its view's, or its explorable's. */
function paneName(project: ProjectSnapshot, pane: Pane): string {
  if (pane.explorable) {
    return explorableOf(project, pane.explorable.id)?.definition.name ?? pane.explorable.id;
  }
  return viewOf(project, pane.view)?.name ?? '';
}

/** The header of a pane that shows an explorable (ADR 0107): its name, and closing it. */
function ExplorablePaneHeader({
  store,
  pane,
  name,
}: {
  store: SplitPanes;
  pane: Pane;
  name: string;
}) {
  const t = useT();
  return (
    <div className="canvas-pane-header">
      <span className="canvas-pane-explorable">{t('Explorable: {name}', { name })}</span>
      <button
        type="button"
        className="canvas-pane-action canvas-pane-close"
        aria-label={t('Close the pane of “{name}”', { name })}
        title={t('Close the pane of “{name}”', { name })}
        onClick={() => store.close(pane.id)}
      >
        <DismissIcon />
      </button>
    </div>
  );
}

/** A pane's header: its view, which another may replace, Beside, and closing it. */
function PaneHeader({
  store,
  pane,
  view,
  project,
  onOpenBeside,
}: {
  store: SplitPanes;
  pane: Pane;
  view: ViewFile;
  project: ProjectSnapshot;
  onOpenBeside: (view: Id) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="canvas-pane-header">
      <label htmlFor={id} className="visually-hidden">
        {t('View in this pane')}
      </label>
      <select
        id={id}
        className="canvas-pane-view"
        value={view.id}
        onChange={(event) => store.setView(pane.id, event.currentTarget.value)}
      >
        {viewsInListOrder(project).map((each) => (
          <option key={each.id} value={each.id}>
            {each.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="canvas-pane-action"
        aria-label={t('Open "{name}" beside', { name: view.name })}
        title={t('Open "{name}" beside the active pane', { name: view.name })}
        onClick={() => onOpenBeside(view.id)}
      >
        {t('Beside')}
      </button>
      <button
        type="button"
        className="canvas-pane-action canvas-pane-close"
        aria-label={t('Close the pane of “{name}”', { name: view.name })}
        title={t('Close the pane of “{name}”', { name: view.name })}
        onClick={() => store.close(pane.id)}
      >
        <DismissIcon />
      </button>
    </div>
  );
}

/** Where a drag of a border started, and the left pane's share then. */
interface Drag {
  pointer: number;
  x: number;
  width: number;
}

/**
 * The border between two panes: a separator that a drag moves, or the arrow keys when it has the
 * focus, each pane keeping its least width.
 */
function PaneBorder({
  store,
  border,
  share,
  container,
  label,
}: {
  store: SplitPanes;
  border: number;
  /** The left pane's share of the two. */
  share: number;
  container: RefObject<HTMLDivElement | null>;
  label: string;
}) {
  const t = useT();
  const drag = useRef<Drag | undefined>(undefined);
  const width = () => container.current?.getBoundingClientRect().width ?? 0;
  const percent = Math.round(share * 100);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? RESIZE_STEP * 5 : RESIZE_STEP;
    const by = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : undefined;
    if (by === undefined) return;
    event.preventDefault();
    store.resize(border, by, minimumShare(width()));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // No text is selected while the border moves.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const width = store.snapshot().panes[border]?.width;
    if (width === undefined) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, width };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const total = width();
    if (current?.pointer !== event.pointerId || total <= 0) return;
    // The left pane takes the share it started from and what the pointer moved, as far as the least
    // widths let it, so that a pointer gone past the limit moves the border only once it is back.
    const now = store.snapshot().panes[border]?.width;
    if (now === undefined) return;
    const wanted = current.width + (event.clientX - current.x) / total;
    store.resize(border, wanted - now, minimumShare(total));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = undefined;
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      className="canvas-pane-border"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={t('{percent}% to the left', { percent })}
      title={t('Drag, or press the arrow keys, to share the width between the panes')}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    />
  );
}

/**
 * What shows over the active pane, laid where its canvas is: the whole canvas area while one pane
 * shows, and the active pane's body, under its header, while several do.
 */
function ActiveOverlay({
  container,
  layout,
  children,
}: {
  container: RefObject<HTMLDivElement | null>;
  layout: PaneLayout;
  children: ReactNode;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = overlay.current;
    const panes = container.current;
    if (!element || !panes) return;
    const sides = ['top', 'left', 'width', 'height'] as const;
    if (layout.panes.length < 2) {
      for (const side of sides) element.style.removeProperty(side);
      return;
    }
    const body = panes.querySelector<HTMLElement>(
      // Pane ids are `pane-` and a number, read strictly from the tab's storage.
      `[data-pane="${layout.active}"] > .canvas-pane-body`,
    );
    if (!body) return;
    const place = () => {
      const area = (element.offsetParent ?? panes).getBoundingClientRect();
      const shown = body.getBoundingClientRect();
      element.style.top = `${shown.top - area.top}px`;
      element.style.left = `${shown.left - area.left}px`;
      element.style.width = `${shown.width}px`;
      element.style.height = `${shown.height}px`;
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    observer?.observe(body);
    observer?.observe(panes);
    return () => observer?.disconnect();
  }, [container, layout]);
  return (
    <div ref={overlay} className="canvas-pane-overlay">
      {children}
    </div>
  );
}
