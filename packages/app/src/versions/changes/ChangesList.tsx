/**
 * The changes of a comparison, a proposal or the project's conflicts, as a list (ADR 0070): their
 * counts by state, then the changes grouped by kind, each saying what it is and what differs.
 *
 * - It can be filtered by state, and to what the open view draws.
 * - Choosing a change, with Enter or a click, shows it on the canvas, in the first view that draws
 *   it, as search does; the change chosen shows every difference below the list.
 * - It draws only the rows in sight, so that 10,000 changes cost a screenful, and works from the keys
 *   as every tree of the app does: Up and Down, Left and Right, Home and End, and typing a name.
 * - It follows the canvas's selection: the first change about what is selected is the row the list
 *   holds its place on, and scrolls to.
 * - Where a proposal asks for ticks, each change has one, which Space or a click on it turns.
 */
import {
  changeKey,
  compareView,
  itemKey,
  type Change,
  type ChangeStatus,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { isSelected as isInSelection, type Selection } from '../../editor/selection';
import { useT } from '../../i18n';
import { shownRows, type TreeItems, type TreeRow } from '../../shell/tree';
import { VirtualTree, type TreeRequest } from '../../shell/VirtualTree';
import {
  ChangeNames,
  STATUS_GLYPHS,
  changeSentence,
  changeTitle,
  changesByKind,
  countText,
  differenceText,
  differencesText,
  kindHeading,
  statusName,
  type ChangeKind,
} from './describe';
import { targetOf } from './show';
import type { OpenedChanges } from './store';
import './changes.css';

const STATUSES: readonly ChangeStatus[] = ['added', 'removed', 'changed', 'moved'];

interface ChangesListProps {
  changes: OpenedChanges;
  /** The view open on the canvas, which the list can be filtered to. */
  openViewId: Id | undefined;
  /** The canvas's selection, which the list follows. */
  selection: Selection;
  /** Shows a change on the canvas. */
  onShow: (change: Change) => void;
}

/** A row of the list: a kind, or a change of it. */
type Item =
  | { kind: 'group'; group: ChangeKind; changes: Change[] }
  | { kind: 'change'; change: Change; key: string };

/** Which changes the filters keep. */
interface Filters {
  statuses: ReadonlySet<ChangeStatus>;
  openViewOnly: boolean;
}

const EVERY_STATUS: ReadonlySet<ChangeStatus> = new Set(STATUSES);

export function ChangesList({ changes, openViewId, selection, onShow }: ChangesListProps) {
  const t = useT();
  const heading = useId();
  const { older, newer, comparison, ticks, actions } = changes;
  const [filters, setFilters] = useState<Filters>({ statuses: EVERY_STATUS, openViewOnly: false });
  const [closed, setClosed] = useState<ReadonlySet<ChangeKind>>(new Set());
  const [chosen, setChosen] = useState<string>();
  const names = useMemo(
    () => new ChangeNames(older, newer, comparison),
    [older, newer, comparison],
  );
  // What the open view draws, in either version, for the filter to the open view.
  const inOpenView = useMemo(() => {
    if (!filters.openViewOnly || openViewId === undefined) return undefined;
    const { states } = compareView(comparison, older, newer, openViewId);
    return (change: Change) => {
      const { ref } = change;
      if (ref.kind === 'element' || ref.kind === 'relation') return states.has(itemKey(ref));
      return 'view' in ref && ref.view === openViewId;
    };
  }, [filters.openViewOnly, openViewId, comparison, older, newer]);
  const kept = useMemo(
    () =>
      comparison.changes.filter(
        (change) =>
          filters.statuses.has(change.status) && (inOpenView === undefined || inOpenView(change)),
      ),
    [comparison.changes, filters.statuses, inOpenView],
  );
  const groups = useMemo(() => changesByKind(kept), [kept]);
  const shown = useMemo(() => {
    const top: Item[] = groups.map(([group, list]) => ({ kind: 'group', group, changes: list }));
    const items: TreeItems<Item> = {
      top,
      inside: (item) =>
        item.kind === 'group'
          ? item.changes.map((change) => ({ kind: 'change', change, key: changeKey(change) }))
          : [],
      countInside: (item) => (item.kind === 'group' ? item.changes.length : 0),
      idOf: (item) => (item.kind === 'group' ? `kind ${item.group}` : item.key),
    };
    return shownRows(items, (item) => item.kind !== 'group' || !closed.has(item.group));
  }, [groups, closed]);

  // The list follows the canvas's selection: the first change about what is selected.
  const followed = useMemo(() => {
    if (selection.elements.size + selection.relations.size + selection.freeShapes.size === 0) {
      return undefined;
    }
    return shown.rows.find((row) => {
      if (row.item.kind !== 'change') return false;
      const target = targetOf(row.item.change)?.target;
      return target !== undefined && isInSelection(selection, target);
    })?.id;
  }, [selection, shown]);
  const [request, setRequest] = useState<TreeRequest>();
  const [requestedFor, setRequestedFor] = useState<string>();
  if (followed !== undefined && followed !== requestedFor) {
    setRequestedFor(followed);
    setRequest({ id: followed, focus: false, serial: (request?.serial ?? 0) + 1 });
  }

  const byKey = useMemo(
    () => new Map(comparison.changes.map((change) => [changeKey(change), change])),
    [comparison.changes],
  );
  const chosenChange =
    (chosen === undefined ? undefined : byKey.get(chosen)) ??
    (followed === undefined ? undefined : byKey.get(followed));

  const toggleStatus = (status: ChangeStatus) =>
    setFilters((last) => {
      const statuses = new Set(last.statuses);
      if (statuses.has(status)) statuses.delete(status);
      else statuses.add(status);
      return { ...last, statuses };
    });

  const tick = (row: TreeRow<Item>) => {
    if (!ticks) return;
    const keys =
      row.item.kind === 'change'
        ? [row.item.key]
        : row.item.changes.map((change) => changeKey(change));
    const all = keys.every((key) => ticks.ticked.has(key));
    ticks.onTick(keys, !all);
  };

  const onKey = (row: TreeRow<Item>, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' && ticks) {
      tick(row);
      return true;
    }
    return false;
  };

  const textOf = (row: TreeRow<Item>) =>
    row.item.kind === 'group'
      ? kindHeading(t, row.item.group)
      : changeTitle(t, row.item.change, names);

  const labelOf = (row: TreeRow<Item>) => {
    if (row.item.kind === 'group') {
      return t('{kind}: {count}', { kind: kindHeading(t, row.item.group), count: row.item.changes.length });
    }
    const sentence = changeSentence(t, row.item.change, names);
    if (!ticks) return sentence;
    return `${sentence} ${ticks.ticked.has(row.item.key) ? t('Ticked.') : t('Not ticked.')}`;
  };

  const renderRow = (row: TreeRow<Item>) => {
    const { item } = row;
    if (item.kind === 'group') {
      const keys = item.changes.map((change) => changeKey(change));
      const ticked = ticks ? keys.filter((key) => ticks.ticked.has(key)).length : 0;
      return (
        <span className="changes-group">
          {ticks && (
            <TickBox
              checked={ticked === keys.length}
              mixed={ticked > 0 && ticked < keys.length}
              onToggle={() => tick(row)}
            />
          )}
          <span>{kindHeading(t, item.group)}</span>
          <span className="changes-group-count">{item.changes.length}</span>
        </span>
      );
    }
    const { change } = item;
    const differs = differencesText(t, change, names);
    return (
      <span className="changes-row">
        {ticks && (
          <TickBox checked={ticks.ticked.has(item.key)} onToggle={() => tick(row)} />
        )}
        <StatusBadge status={change.status} />
        <span className="changes-row-title">{changeTitle(t, change, names)}</span>
        {differs !== '' && <span className="changes-row-differs">{differs}</span>}
      </span>
    );
  };

  const total = comparison.changes.length;
  return (
    <section className="changes-list" aria-labelledby={heading}>
      <h3 id={heading} className="changes-title">
        {changes.title}
      </h3>
      <ul className="changes-counts" aria-label={t('Changes by state')}>
        {STATUSES.map((status) => (
          <li key={status}>
            <StatusBadge status={status} />
            <span>{countText(t, status, comparison.counts[status])}</span>
          </li>
        ))}
      </ul>
      <fieldset className="changes-filters">
        <legend className="visually-hidden">{t('Which changes to list')}</legend>
        {STATUSES.map((status) => (
          <label key={status} className="changes-filter">
            <input
              type="checkbox"
              checked={filters.statuses.has(status)}
              onChange={() => toggleStatus(status)}
            />
            {statusName(t, status)}
          </label>
        ))}
        <label className="changes-filter">
          <input
            type="checkbox"
            checked={filters.openViewOnly}
            disabled={openViewId === undefined}
            onChange={(event) => {
              const openViewOnly = event.currentTarget.checked;
              setFilters((last) => ({ ...last, openViewOnly }));
            }}
          />
          {t('Only the open view')}
        </label>
      </fieldset>
      {total === 0 ? (
        <p className="panel-empty">{t('No changes.')}</p>
      ) : kept.length === 0 ? (
        <p className="panel-empty">{t('No change matches the filters.')}</p>
      ) : (
        <VirtualTree
          shown={shown}
          labelledBy={heading}
          selectedId={chosen ?? followed}
          request={request}
          isSelected={(row) => row.id === (chosen ?? followed)}
          textOf={textOf}
          labelOf={labelOf}
          onOpen={(row, open) => {
            if (row.item.kind !== 'group') return;
            const group = row.item.group;
            setClosed((last) => {
              const next = new Set(last);
              if (open) next.delete(group);
              else next.add(group);
              return next;
            });
          }}
          onActivate={(row) => {
            if (row.item.kind !== 'change') return;
            setChosen(row.item.key);
            onShow(row.item.change);
          }}
          onKey={onKey}
          renderRow={renderRow}
        />
      )}
      {chosenChange && (
        <div className="changes-chosen" aria-live="polite">
          <p className="changes-chosen-title">
            <StatusBadge status={chosenChange.status} />
            {changeTitle(t, chosenChange, names)}
          </p>
          {chosenChange.differences.length > 0 && (
            <ul className="changes-differences">
              {chosenChange.differences.map((difference) => (
                <li key={difference.path}>{differenceText(t, difference, names)}</li>
              ))}
            </ul>
          )}
          {actions?.(chosenChange)}
        </div>
      )}
    </section>
  );
}

/** A state's glyph on its color, which the text beside it always names too. */
export function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span className={`change-badge change-${status}`} aria-hidden="true">
      {STATUS_GLYPHS[status]}
    </span>
  );
}

/** A tick beside a change or a kind, which the row's own keys turn as well. */
function TickBox({
  checked,
  mixed = false,
  onToggle,
}: {
  checked: boolean;
  mixed?: boolean;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      className="changes-tick"
      tabIndex={-1}
      aria-hidden="true"
      checked={checked}
      ref={(element) => {
        if (element) element.indeterminate = mixed;
      }}
      onClick={(event) => event.stopPropagation()}
      onChange={onToggle}
    />
  );
}
