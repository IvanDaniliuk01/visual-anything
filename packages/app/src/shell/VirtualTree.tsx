import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { rowStartingWith, type ShownRows, type TreeRow } from './tree';
import './panel.css';

/** How tall every row is, in pixels; a row's place follows from its position alone. */
export const ROW_HEIGHT = 28;
/** How many rows are drawn beyond each edge of the viewport, so that scrolling shows no gap. */
const OVERSCAN = 6;
/** The height assumed until the viewport is measured, and where nothing lays it out. */
const UNMEASURED_HEIGHT = 600;
/** How long a pause in typing starts a new search. */
const TYPING_PAUSE = 500;
/** How far each level is indented, and the indent of the top level, in pixels. */
const INDENT = 16;
const FIRST_INDENT = 6;

/** A row to scroll into view, and to focus when `focus` is set; each new `serial` acts again. */
export interface TreeRequest {
  id: string;
  focus: boolean;
  serial: number;
}

/** How a row was chosen: with Enter, or with a click. */
export type Activation = 'key' | 'pointer';

interface VirtualTreeProps<T> {
  shown: ShownRows<T>;
  label?: string;
  labelledBy?: string;
  /** The row that stands for the selection, which takes the tab stop until a row gets focus. */
  selectedId: string | undefined;
  request?: TreeRequest | undefined;
  isSelected: (row: TreeRow<T>) => boolean;
  /** The text a row starts with, which typing a few letters matches. */
  textOf: (row: TreeRow<T>) => string;
  /** A row's accessible name, when its text does not say it well. */
  labelOf?: (row: TreeRow<T>) => string | undefined;
  onOpen: (row: TreeRow<T>, open: boolean) => void;
  /** Enter or a click on a row. */
  onActivate: (row: TreeRow<T>, how: Activation) => void;
  renderRow: (row: TreeRow<T>) => ReactNode;
  /**
   * A row's menu, asked for with a secondary press, Shift+F10 or the menu key, at a point on screen;
   * true when the row has one, so that the browser's own menu does not open.
   */
  onMenu?: (row: TreeRow<T>, at: { x: number; y: number }) => boolean;
  /**
   * A key pressed on a row, before the tree's own keys: true when it handled the key, which the tree
   * then leaves, as Alt with − and + collapse and expand containers in the outline.
   */
  onKey?: (row: TreeRow<T>, event: KeyboardEvent<HTMLDivElement>) => boolean;
}

/**
 * A tree that draws only the rows in its viewport and a few around them, so that 10,000 rows cost no
 * more than a screenful. It is an ARIA tree with a roving tabindex: one row is in the tab order, and
 * the keys move the focus between rows. Up and Down go to the row above or below; Right opens a row,
 * or goes to the first row inside it; Left closes a row, or goes to the row that holds it; Home and
 * End go to the first and last rows; typing a few letters goes to a row that starts with them.
 */
export function VirtualTree<T>({
  shown,
  label,
  labelledBy,
  selectedId,
  request,
  isSelected,
  textOf,
  labelOf,
  onOpen,
  onActivate,
  renderRow,
  onMenu,
  onKey,
}: VirtualTreeProps<T>) {
  const { rows, at } = shown;
  const viewport = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | undefined>(undefined);
  const handledRequest = useRef(0);
  // A request the tree finds when it shows only scrolls: the focus stays where it is, such as on a tab.
  const shownAfter = useRef(request?.serial ?? 0);
  const typed = useRef({ text: '', at: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(UNMEASURED_HEIGHT);
  // The row last focused, and the request it came after: a newer request takes the tab stop.
  const [focused, setFocused] = useState<{ id: string; after: number }>();
  const serial = request?.serial ?? 0;

  const tabStop =
    (focused && focused.after >= serial && at.has(focused.id) ? focused.id : undefined) ??
    (request && at.has(request.id) ? request.id : undefined) ??
    (selectedId !== undefined && at.has(selectedId) ? selectedId : undefined) ??
    rows[0]?.id;
  const tabStopAt = tabStop === undefined ? -1 : (at.get(tabStop) ?? -1);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight || UNMEASURED_HEIGHT));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A request scrolls its row into view once, and focuses it when asked while the focus is in the
  // tree; the row is drawn as the tab stop wherever it is. The rows around it are drawn before the
  // browser paints, not only once the scroll event comes.
  useLayoutEffect(() => {
    if (!request || request.serial === handledRequest.current) return;
    const index = at.get(request.id);
    const element = viewport.current;
    if (index === undefined || !element) return;
    handledRequest.current = request.serial;
    const next = scrollToShow(index, element.scrollTop, element.clientHeight || height);
    element.scrollTop = next;
    setScrollTop(next);
    if (
      request.focus &&
      request.serial > shownAfter.current &&
      element.contains(element.ownerDocument.activeElement)
    ) {
      pendingFocus.current = request.id;
    }
  }, [request, at, height]);

  // The focus follows the keys to the row they reached, once that row is drawn.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === undefined) return;
    const element = elements.current.get(id);
    if (!element) return;
    pendingFocus.current = undefined;
    element.focus({ preventScroll: true });
  });

  function moveTo(index: number): void {
    const row = rows[index];
    if (!row) return;
    setFocused({ id: row.id, after: serial });
    pendingFocus.current = row.id;
    const element = viewport.current;
    if (!element) return;
    const next = scrollToShow(index, element.scrollTop, element.clientHeight || height);
    element.scrollTop = next;
    setScrollTop(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // The keys act on the row that has the focus.
    const index = Number(
      (event.target as HTMLElement).closest('[role="treeitem"]')?.getAttribute('data-index') ??
        tabStopAt,
    );
    const row = rows[index];
    if (!row) return;
    if (onKey?.(row, event)) {
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        moveTo(index + 1);
        break;
      case 'ArrowUp':
        moveTo(index - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(rows.length - 1);
        break;
      case 'ArrowRight':
        if (row.opens && !row.open) onOpen(row, true);
        else if (row.open) moveTo(index + 1);
        break;
      case 'ArrowLeft':
        if (row.open) onOpen(row, false);
        else if (row.outer !== undefined) moveTo(row.outer);
        break;
      case 'Enter':
        onActivate(row, 'key');
        break;
      default: {
        const now = Date.now();
        const sofar = now - typed.current.at <= TYPING_PAUSE ? typed.current.text : '';
        if (!isTyping(event, sofar)) return;
        const text = sofar + event.key;
        typed.current = { text, at: now };
        const found = rowStartingWith(rows, textOf, index, text);
        if (found !== undefined) moveTo(found);
      }
    }
    event.preventDefault();
  }

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    setScrollTop(event.currentTarget.scrollTop);
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length - 1, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const drawn: number[] = [];
  for (let index = first; index <= last; index++) drawn.push(index);
  // The tab stop is drawn wherever it is, in reading order, so the tree keeps its place in the tab
  // order and the focus never falls out of it while the viewport scrolls.
  if (tabStopAt >= 0 && tabStopAt < first) drawn.unshift(tabStopAt);
  else if (tabStopAt > last) drawn.push(tabStopAt);

  return (
    <div ref={viewport} className="tree-viewport" onScroll={onScroll}>
      <div
        role="tree"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-multiselectable="true"
        className="tree"
        style={{ height: rows.length * ROW_HEIGHT }}
        onKeyDown={onKeyDown}
      >
        {drawn.map((index) => {
          const row = rows[index] as TreeRow<T>;
          return (
            <div
              key={row.id}
              ref={(element) => {
                if (!element) return;
                elements.current.set(row.id, element);
                return () => {
                  elements.current.delete(row.id);
                };
              }}
              role="treeitem"
              aria-level={row.level}
              aria-posinset={row.position}
              aria-setsize={row.count}
              aria-expanded={row.opens ? row.open : undefined}
              aria-selected={isSelected(row)}
              aria-label={labelOf?.(row)}
              tabIndex={row.id === tabStop ? 0 : -1}
              data-index={index}
              className="tree-row"
              style={{
                top: index * ROW_HEIGHT,
                height: ROW_HEIGHT,
                paddingLeft: FIRST_INDENT + (row.level - 1) * INDENT,
              }}
              onFocus={() => setFocused({ id: row.id, after: serial })}
              onClick={() => onActivate(row, 'pointer')}
              onContextMenu={
                onMenu &&
                ((event) => {
                  // From the keyboard the event has no place of its own: the menu opens at the row.
                  const box = event.currentTarget.getBoundingClientRect();
                  const fromKeys = event.clientX === 0 && event.clientY === 0;
                  const at = fromKeys
                    ? { x: box.left + FIRST_INDENT, y: box.bottom }
                    : { x: event.clientX, y: event.clientY };
                  if (onMenu(row, at)) event.preventDefault();
                })
              }
            >
              {/* The triangle is drawn by the stylesheet, from aria-expanded. */}
              <span
                className="tree-toggle"
                aria-hidden="true"
                onClick={(event) => {
                  if (!row.opens) return;
                  event.stopPropagation();
                  onOpen(row, !row.open);
                }}
              />
              <span className="tree-row-text">{renderRow(row)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The scroll position that shows the row at `index`, moving from `from` as little as it can. */
function scrollToShow(index: number, from: number, visible: number): number {
  const top = index * ROW_HEIGHT;
  if (top < from) return top;
  if (top + ROW_HEIGHT > from + visible) return top + ROW_HEIGHT - visible;
  return from;
}

/** Whether a key press types a letter of a name: a printable key, without a shortcut's modifiers. */
function isTyping(event: KeyboardEvent, sofar: string): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return false;
  // A space only continues a name being typed; on its own it is left alone.
  return event.key !== ' ' || sofar !== '';
}
