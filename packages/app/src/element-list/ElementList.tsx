/**
 * The element list (R42): a panel below the canvas that lists elements, those the open view shows or
 * a component's, with their attributes and external identifiers as columns. It is a grid: the arrow
 * keys move through its cells, Enter or F2 edits one in place, Delete empties it, and a block of
 * cells pasted from a spreadsheet is one action. Pressing a row selects its element, on the canvas
 * too, and what the canvas selects is marked here; Alt+Enter on a destination follows it. Only the
 * rows in sight are drawn, so that ten thousand elements scroll at once.
 *
 * Its cells read attributes through the app's lookup (ADR 0057): live and computed values show over
 * stored ones with the canvas's marks, and the list sorts, filters and copies what it shows. Editing,
 * clearing and pasting change what is stored.
 */
import type { Element, Id } from '@visual-anything/schema';
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { readDestination } from '@visual-anything/core';
import { useFollow } from '../destinations/follower';
import { useEditor } from '../editor/EditorContext';
import { useHoverStore } from '../editor/hover';
import { selectionOf, type Selection } from '../editor/selection';
import { useT, type Translator } from '../i18n';
import { LiveContext } from '../live/context';
import { useAttributeLookup } from '../live-values/context';
import { senderWords } from '../live-values/words';
import { ArrowDownIcon, ArrowUpIcon, DismissIcon } from '../shell/icons';
import { byPackage } from '../shell/inspector/describe';
import { perform } from '../shell/inspector/send';
import { cellsText, parseCells, pasteCommand, readCell } from './edit';
import {
  cellValue,
  columnKey,
  columnLabel,
  columnsOf,
  editText,
  editable,
  extraNamesOf,
  filterElements,
  listedElements,
  ownValue,
  shownCell,
  sortElements,
  type Column,
  type ListSource,
  type ShownCell,
  type SortDirection,
} from './rows';
import { EmphasisRuns } from '../text/EmphasisText';
import './elementList.css';

/** How tall a row is, in CSS pixels; rows are placed by it, so it is the same for every row. */
export const ROW_HEIGHT = 28;
/** How many rows out of sight are drawn above and below those in sight. */
const OVERSCAN = 8;
/** The most cells one paste sets, so that a pasted block always fits in one action. */
export const MOST_PASTED_CELLS = 50_000;

/** A cell, by its element and its column's key, which stay the same as the list sorts and filters. */
interface Cell {
  row: Id;
  column: string;
}

interface Editing extends Cell {
  text: string;
  problem?: string;
}

/** How wide each column is: the name wider than the rest. */
function templateOf(columns: readonly Column[]): string {
  return columns.map((column) => (column.kind === 'name' ? '14rem' : '10rem')).join(' ');
}

/** What the list lists at first, and when the component it listed goes. */
const VIEW_SOURCE: ListSource = { kind: 'view' };

/** The class a cell takes by where its value comes from. */
function cellClass(shown: ShownCell): string {
  switch (shown.origin) {
    case 'default':
      return 'element-list-cell element-list-default';
    case 'live':
      return shown.stale
        ? 'element-list-cell element-list-live element-list-stale'
        : 'element-list-cell element-list-live';
    case 'computed':
      return 'element-list-cell element-list-computed';
    case 'simulated':
      return 'element-list-cell element-list-simulated';
    default:
      return 'element-list-cell';
  }
}

/** What a cell's value from outside says when pointed at: who sent it, and that it is never saved. */
function cellTitle(
  t: Translator,
  shown: ShownCell,
  packageName: (id: Id) => string,
): string | undefined {
  const { from } = shown;
  if (from === undefined) return undefined;
  if (shown.origin === 'simulated' && 'package' in from) {
    return t('Simulated by the code of “{name}”, and never saved.', {
      name: packageName(from.package),
    });
  }
  if (shown.origin === 'computed' && 'package' in from) {
    return t('Computed by the code of “{name}”, and never saved.', {
      name: packageName(from.package),
    });
  }
  const sender = senderWords(
    t,
    'package' in from ? { kind: 'package', package: from.package } : { kind: from.sender },
    packageName,
  );
  return t('A live value from {sender}, never saved.', { sender });
}

/** The value a select writes for a source. */
function sourceValue(source: ListSource): string {
  return source.kind === 'view' ? 'view' : `component ${source.component}`;
}

export function ElementList({ onClose }: { onClose: () => void }) {
  const t = useT();
  const editor = useEditor();
  // Resting the pointer on a row hovers its element everywhere (ADR 0076).
  const hovers = useHoverStore();
  useEffect(() => () => hovers?.set('list', undefined), [hovers]);
  const { project, definitions, viewId, selection, send, scene } = editor;
  const live = useContext(LiveContext);
  // How attributes read: live and computed values over stored ones (ADR 0057).
  const lookup = useAttributeLookup();
  const follower = useFollow();
  const ids = {
    heading: useId(),
    source: useId(),
    exactly: useId(),
    filter: useId(),
    within: useId(),
    count: useId(),
    problem: useId(),
  };
  const [source, setSource] = useState<ListSource>(VIEW_SOURCE);
  const [sort, setSort] = useState<{ column: string; direction: SortDirection }>();
  const [filter, setFilter] = useState('');
  const [within, setWithin] = useState('');
  // The cell the keys are on, and the selection it was chosen under: when the canvas selects
  // something else, the keys go on from the first row it selects.
  const [chosen, setChosen] = useState<{ cell: Cell; under: Selection }>();
  const setActive = (cell: Cell) => setChosen({ cell, under: selection });
  const [editing, setEditing] = useState<Editing>();
  const [said, setSaid] = useState({ text: '', count: 0 });
  const say = (text: string) => setSaid((last) => ({ text, count: last.count + 1 }));
  const anchor = useRef<Id | undefined>(undefined);
  const body = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [sight, setSight] = useState({ top: 0, height: 320 });
  // The cell the keys moved to, which takes the focus once it is drawn.
  const focusWanted = useRef(false);

  // A component that went away lists what the view shows again.
  const known = source.kind === 'view' || definitions.component(source.component) !== undefined;
  const shownSource = known ? source : VIEW_SOURCE;
  const listed = useMemo(
    () => listedElements(project, definitions, viewId, shownSource),
    [project, definitions, viewId, shownSource],
  );
  // The attributes only live values or package code give have columns too; the columns change only
  // when those names do, not with every live update.
  const extraText = useMemo(() => extraNamesOf(listed, lookup).join('\n'), [listed, lookup]);
  const columns = useMemo(
    () => columnsOf(definitions, listed, extraText === '' ? [] : extraText.split('\n')),
    [definitions, listed, extraText],
  );
  const withinColumn = columns.find((column) => columnKey(column) === within);
  const filtered = useMemo(
    () => filterElements(t, project, listed, columns, filter, withinColumn, definitions, lookup),
    [t, project, listed, columns, filter, withinColumn, definitions, lookup],
  );
  const sortColumn =
    sort === undefined ? undefined : columns.find((column) => columnKey(column) === sort.column);
  const rows = useMemo(
    () =>
      sortColumn === undefined || sort === undefined
        ? filtered
        : sortElements(filtered, sortColumn, sort.direction, definitions, lookup),
    [filtered, sortColumn, sort, definitions, lookup],
  );
  const rowAt = useMemo(() => new Map(rows.map((element, at) => [element.id, at])), [rows]);

  /** Where a cell is now, by indexes; the first cell when it is not listed. */
  const placeOf = (cell: Cell | undefined): { row: number; column: number } => {
    const row = cell === undefined ? undefined : rowAt.get(cell.row);
    const column =
      cell === undefined ? -1 : columns.findIndex((each) => columnKey(each) === cell.column);
    return row === undefined || column < 0 ? { row: 0, column: 0 } : { row, column };
  };
  const firstSelected = useMemo(
    () => rows.find((element) => selection.elements.has(element.id)),
    [rows, selection],
  );
  const active: Cell | undefined =
    chosen !== undefined &&
    (chosen.under === selection ||
      firstSelected === undefined ||
      selection.elements.has(chosen.cell.row))
      ? chosen.cell
      : firstSelected === undefined
        ? undefined
        : { row: firstSelected.id, column: chosen?.cell.column ?? 'name' };
  const at = placeOf(active);
  const cellAt = (row: number, column: number): Cell | undefined => {
    const element = rows[row];
    const col = columns[column];
    return element === undefined || col === undefined
      ? undefined
      : { row: element.id, column: columnKey(col) };
  };

  // Rows in sight, and a few beyond them.
  const first = Math.max(0, Math.floor(sight.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((sight.top + sight.height) / ROW_HEIGHT) + OVERSCAN);

  useEffect(() => {
    const element = body.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setSight((now) => ({ ...now, height: element.clientHeight || now.height })),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Scrolls the body so that a row shows, and says where it scrolled to; nothing when it shows. */
  const scrollToRow = (row: number): { top: number; height: number } | undefined => {
    const element = body.current;
    if (!element) return undefined;
    const top = row * ROW_HEIGHT;
    const height = element.clientHeight || sight.height;
    let next = element.scrollTop;
    if (top < next) next = top;
    else if (top + ROW_HEIGHT > next + height) next = top + ROW_HEIGHT - height;
    if (next === element.scrollTop) return undefined;
    element.scrollTop = next;
    return { top: next, height };
  };

  /** Scrolls a row into sight, at once, so that it is drawn before it takes the focus. */
  const bringIntoSight = (row: number) => {
    const scrolled = scrollToRow(row);
    if (scrolled !== undefined) setSight(scrolled);
  };

  // What the canvas selects comes into sight here; the scroll draws the rows it brings in.
  useEffect(() => {
    if (firstSelected === undefined) return;
    scrollToRow(rowAt.get(firstSelected.id) ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selection]);

  useLayoutEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    const target = grid.current?.querySelector<HTMLElement>(`[data-cell="${at.row}:${at.column}"]`);
    target?.focus();
  });

  const moveTo = (row: number, column: number) => {
    const clampedRow = Math.max(0, Math.min(rows.length - 1, row));
    const clampedColumn = Math.max(0, Math.min(columns.length - 1, column));
    const cell = cellAt(clampedRow, clampedColumn);
    if (cell === undefined) return;
    bringIntoSight(clampedRow);
    focusWanted.current = true;
    setActive(cell);
  };

  /** Selects an element's row, and its element on the canvas, as a press does. */
  const selectRow = (element: Element, how: { toggle: boolean; range: boolean }) => {
    let next: Selection;
    if (how.range && anchor.current !== undefined && rowAt.has(anchor.current)) {
      const from = rowAt.get(anchor.current) as number;
      const to = rowAt.get(element.id) as number;
      const [low, high] = from <= to ? [from, to] : [to, from];
      next = selectionOf(
        rows.slice(low, high + 1).map((each) => ({ kind: 'element' as const, id: each.id })),
      );
    } else if (how.toggle) {
      const chosen = new Set(selection.elements);
      if (chosen.has(element.id)) chosen.delete(element.id);
      else chosen.add(element.id);
      next = selectionOf([...chosen].map((id) => ({ kind: 'element' as const, id })));
      anchor.current = element.id;
    } else {
      next = selectionOf([{ kind: 'element', id: element.id }]);
      anchor.current = element.id;
    }
    editor.select(next);
    const shape = scene?.shapes.find((each) => each.element === element.id);
    if (shape !== undefined) editor.reveal(shape.key);
  };

  const startEditing = (cell: Cell, text?: string) => {
    const element = rows[rowAt.get(cell.row) ?? -1];
    const column = columns.find((each) => columnKey(each) === cell.column);
    if (element === undefined || column === undefined) return;
    if (!editable(column)) {
      say(t('The component is changed in the inspector.'));
      return;
    }
    if (send === undefined) {
      say(t('The project cannot be changed now.'));
      return;
    }
    setEditing({
      ...cell,
      text: text ?? editText(cellValue(element, column, definitions)),
    });
  };

  /** Sends what a cell now holds; resolves to whether it was done, or nothing needed doing. */
  const commit = async (now: Editing): Promise<boolean> => {
    const element = rows[rowAt.get(now.row) ?? -1];
    const column = columns.find((each) => columnKey(each) === now.column);
    if (element === undefined || column === undefined) return true;
    const value = cellValue(element, column, definitions);
    if (now.text === editText(value) && ownValue(element, column)) return true;
    const current = column.kind === 'attribute' ? element.attributes?.[column.name] : value;
    const read = readCell(column, now.text, current);
    if (!read.ok) {
      setEditing({ ...now, problem: read.message });
      say(read.message);
      return false;
    }
    return perform(send, { type: 'update-element', id: element.id, changes: read.change });
  };

  const finishEditing = async (now: Editing, then: { row: number; column: number } | undefined) => {
    if (!(await commit(now))) return;
    setEditing(undefined);
    focusWanted.current = true;
    if (then !== undefined) moveTo(then.row, then.column);
    else setActive({ row: now.row, column: now.column });
  };

  const clearCell = async () => {
    const cell = cellAt(at.row, at.column);
    const column = columns[at.column];
    const element = rows[at.row];
    if (cell === undefined || column === undefined || element === undefined) return;
    if (!editable(column)) return;
    const current = column.kind === 'attribute' ? element.attributes?.[column.name] : undefined;
    const read = readCell(column, '', current);
    if (!read.ok) {
      say(read.message);
      return;
    }
    await perform(send, { type: 'update-element', id: element.id, changes: read.change });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing !== undefined) return;
    // Only the cells take these keys: a column's header is a button of its own.
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute('role') !== 'gridcell'
    ) {
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    const page = Math.max(1, Math.floor(sight.height / ROW_HEIGHT) - 1);
    const moves: Record<string, () => void> = {
      ArrowDown: () => moveTo(at.row + 1, at.column),
      ArrowUp: () => moveTo(at.row - 1, at.column),
      ArrowRight: () => moveTo(at.row, at.column + 1),
      ArrowLeft: () => moveTo(at.row, at.column - 1),
      PageDown: () => moveTo(at.row + page, at.column),
      PageUp: () => moveTo(at.row - page, at.column),
      Home: () => moveTo(command ? 0 : at.row, 0),
      End: () => moveTo(command ? rows.length - 1 : at.row, columns.length - 1),
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      move();
      return;
    }
    const cell = cellAt(at.row, at.column);
    const element = rows[at.row];
    if (cell === undefined || element === undefined) return;
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      const column = columns[at.column] as Column;
      const read = readDestination(cellValue(element, column, definitions));
      if (read.ok) follower?.follow(read.destination);
      else say(t('This cell holds no destination to follow.'));
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing(cell);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      selectRow(element, { toggle: command, range: event.shiftKey });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void clearCell();
      return;
    }
    // Typing starts editing the cell with what was typed, as a spreadsheet does.
    if (event.key.length === 1 && !command && !event.altKey) {
      event.preventDefault();
      startEditing(cell, event.key);
    }
  };

  /** A cell's value as it shows, without its mark: what a copy takes. */
  const copied = (element: Element, column: Column) =>
    editText(shownCell(t, project, element, column, definitions, lookup).value);

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing !== undefined) return;
    const chosen = rows.filter((element) => selection.elements.has(element.id));
    const text =
      chosen.length > 1
        ? cellsText(chosen.map((element) => columns.map((column) => copied(element, column))))
        : (() => {
            const element = rows[at.row];
            const column = columns[at.column];
            return element === undefined || column === undefined
              ? ''
              : cellsText([[copied(element, column)]]);
          })();
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editing !== undefined) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const cells = parseCells(text);
    const size = cells.reduce((sum, row) => sum + row.length, 0);
    if (size > MOST_PASTED_CELLS) {
      say(t('A paste sets at most {n} cells at once.', { n: MOST_PASTED_CELLS }));
      return;
    }
    if (send === undefined) {
      say(t('The project cannot be changed now.'));
      return;
    }
    const pasted = pasteCommand(rows, columns, at, cells);
    if (pasted.problems.length > 0)
      live?.notify('warning', pasted.problems.slice(0, 10).join('\n'));
    if (pasted.command === undefined) {
      say(t('Nothing here could be pasted.'));
      return;
    }
    void perform(send, pasted.command).then((done) => {
      if (done) {
        say(
          t(
            { one: 'Pasted {count} cell.', other: 'Pasted {count} cells.' },
            { count: pasted.cells },
          ),
        );
      }
    });
  };

  const toggleSort = (column: Column) => {
    const key = columnKey(column);
    const next: { column: string; direction: SortDirection } | undefined =
      sort?.column !== key
        ? { column: key, direction: 'ascending' }
        : sort.direction === 'ascending'
          ? { column: key, direction: 'descending' }
          : undefined;
    setSort(next);
    const label = columnLabel(t, column);
    say(
      next === undefined
        ? t('In the model’s order again.')
        : next.direction === 'ascending'
          ? t('Sorted by {column}, ascending.', { column: label })
          : t('Sorted by {column}, descending.', { column: label }),
    );
  };

  const offered = byPackage(definitions.components, project.packages);
  const nameOf = (id: Id) => t.definition(id, definitions.component(id)?.name ?? id);
  const packageName = (id: Id) => project.packages.find((each) => each.id === id)?.name ?? id;
  const template = templateOf(columns);
  const empty: ReactNode =
    listed.length === 0 ? (
      <p className="panel-empty">
        {t('Nothing is listed here. Choose another component, or add elements on the canvas.')}
      </p>
    ) : rows.length === 0 ? (
      <p className="panel-empty">
        {t('No element matches “{filter}”. Change the filter, or clear it.', { filter })}
      </p>
    ) : null;

  return (
    <section className="panel element-list" aria-labelledby={ids.heading}>
      <div className="element-list-bar">
        <h2 id={ids.heading} className="element-list-title">
          {t('Element list')}
        </h2>
        <label htmlFor={ids.source}>{t('List')}</label>
        <select
          id={ids.source}
          value={sourceValue(shownSource)}
          onChange={(event) => {
            const value = event.target.value;
            setSource(
              value === 'view'
                ? { kind: 'view' }
                : {
                    kind: 'component',
                    component: value.slice('component '.length),
                    exactly: shownSource.kind === 'component' && shownSource.exactly,
                  },
            );
          }}
        >
          <option value="view">{t('What this view shows')}</option>
          {offered.map((from) => (
            <optgroup key={from.id} label={t.definition(from.id, from.name)}>
              {from.members.map((id) => (
                <option key={id} value={`component ${id}`}>
                  {nameOf(id)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {shownSource.kind === 'component' && (
          <label className="element-list-check" htmlFor={ids.exactly}>
            <input
              id={ids.exactly}
              type="checkbox"
              checked={shownSource.exactly}
              onChange={(event) => setSource({ ...shownSource, exactly: event.target.checked })}
            />
            {t('Only this component')}
          </label>
        )}
        <label htmlFor={ids.filter}>{t('Filter')}</label>
        <input
          id={ids.filter}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <label htmlFor={ids.within} className="visually-hidden">
          {t('Filter in')}
        </label>
        <select id={ids.within} value={within} onChange={(event) => setWithin(event.target.value)}>
          <option value="">{t('Any column')}</option>
          {columns.map((column) => (
            <option key={columnKey(column)} value={columnKey(column)}>
              {columnLabel(t, column)}
            </option>
          ))}
        </select>
        <span id={ids.count} className="element-list-count">
          {t(
            { one: '{shown} of {count} element', other: '{shown} of {count} elements' },
            { shown: rows.length, count: listed.length },
          )}
        </span>
        <button
          type="button"
          className="element-list-close"
          aria-label={t('Close the element list')}
          onClick={onClose}
        >
          <DismissIcon />
        </button>
      </div>
      {editing?.problem !== undefined && (
        <p id={ids.problem} role="alert" className="element-list-problem">
          {editing.problem}
        </p>
      )}
      {empty ?? (
        <div
          ref={grid}
          role="grid"
          className="element-list-grid"
          aria-labelledby={ids.heading}
          aria-describedby={ids.count}
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length}
          aria-multiselectable="true"
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onPaste={onPaste}
        >
          <div ref={head} role="rowgroup" className="element-list-head">
            <div
              role="row"
              aria-rowindex={1}
              className="element-list-row"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((column, index) => {
                const key = columnKey(column);
                const sorted = sort?.column === key ? sort.direction : undefined;
                return (
                  <div
                    key={key}
                    role="columnheader"
                    aria-colindex={index + 1}
                    aria-sort={sorted}
                    className="element-list-header"
                  >
                    <button
                      type="button"
                      title={t('Sort by {column}', { column: columnLabel(t, column) })}
                      onClick={() => toggleSort(column)}
                    >
                      {columnLabel(t, column)}
                      {column.kind === 'id' && (
                        <span className="element-list-scheme">{t('identifier')}</span>
                      )}
                      {sorted === 'ascending' && (
                        <ArrowUpIcon size={12} className="element-list-sorted" />
                      )}
                      {sorted === 'descending' && (
                        <ArrowDownIcon size={12} className="element-list-sorted" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div
            ref={body}
            role="rowgroup"
            className="element-list-body"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (head.current) head.current.scrollLeft = element.scrollLeft;
              setSight({ top: element.scrollTop, height: element.clientHeight || sight.height });
            }}
          >
            <div className="element-list-space" style={{ height: rows.length * ROW_HEIGHT }}>
              {rows.slice(first, last).map((element, offset) => {
                const row = first + offset;
                const selected = selection.elements.has(element.id);
                return (
                  <div
                    key={element.id}
                    role="row"
                    aria-rowindex={row + 2}
                    aria-selected={selected}
                    className="element-list-row"
                    onPointerEnter={() => hovers?.set('list', element.id)}
                    onPointerLeave={() => hovers?.set('list', undefined)}
                    style={{
                      top: row * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                      gridTemplateColumns: template,
                    }}
                  >
                    {columns.map((column, index) => {
                      const key = columnKey(column);
                      const isActive = row === at.row && index === at.column;
                      const shown = shownCell(t, project, element, column, definitions, lookup);
                      const editingHere =
                        editing !== undefined &&
                        editing.row === element.id &&
                        editing.column === key;
                      return (
                        <div
                          key={key}
                          role="gridcell"
                          aria-colindex={index + 1}
                          aria-readonly={editable(column) ? undefined : true}
                          tabIndex={isActive ? 0 : -1}
                          data-cell={`${row}:${index}`}
                          className={cellClass(shown)}
                          title={cellTitle(t, shown, packageName)}
                          onClick={(event: MouseEvent) => {
                            setActive({ row: element.id, column: key });
                            selectRow(element, {
                              toggle: event.ctrlKey || event.metaKey,
                              range: event.shiftKey,
                            });
                          }}
                          onDoubleClick={() => startEditing({ row: element.id, column: key })}
                        >
                          {editingHere ? (
                            <CellEditor
                              label={`${columnLabel(t, column)}, ${element.name}`}
                              problemId={ids.problem}
                              editing={editing}
                              onChange={(text) =>
                                setEditing({ ...editing, text, problem: undefined })
                              }
                              onCommit={(then) =>
                                void finishEditing(
                                  editing,
                                  then === 'down'
                                    ? { row: row + 1, column: index }
                                    : then === 'right'
                                      ? { row, column: index + 1 }
                                      : then === 'left'
                                        ? { row, column: index - 1 }
                                        : undefined,
                                )
                              }
                              onCancel={() => {
                                setEditing(undefined);
                                focusWanted.current = true;
                              }}
                            />
                          ) : shown.emphasis !== undefined ? (
                            <EmphasisRuns text={shown.emphasis} />
                          ) : (
                            shown.text
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {said.text}
        {said.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}

interface CellEditorProps {
  label: string;
  /** The id of what says why its text cannot be committed, while something does. */
  problemId: string;
  editing: Editing;
  onChange: (text: string) => void;
  /** Commits, then moves down, right, left, or stays. */
  onCommit: (then: 'down' | 'right' | 'left' | 'stay') => void;
  onCancel: () => void;
}

/** A cell edited in place: Enter commits and goes down, Tab right, Escape cancels. */
function CellEditor({ label, problemId, editing, onChange, onCommit, onCancel }: CellEditorProps) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, []);
  return (
    <input
      ref={input}
      type="text"
      className="element-list-input"
      aria-label={label}
      value={editing.text}
      aria-invalid={editing.problem === undefined ? undefined : true}
      aria-describedby={editing.problem === undefined ? undefined : problemId}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit('down');
        } else if (event.key === 'Tab') {
          event.preventDefault();
          onCommit(event.shiftKey ? 'left' : 'right');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit('stay')}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
