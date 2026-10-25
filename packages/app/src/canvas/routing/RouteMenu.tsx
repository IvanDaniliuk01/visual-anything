import {
  modelIndexOf,
  relationLabel,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { useMenuInsideFrame, useOutsidePress } from '../focus';
import type { Point } from '../geometry';
import type { RelationLine } from '../scene';
import {
  attachAutomaticallyCommand,
  resetCommand,
  routedByHand,
  styleCommand,
  viewIn,
} from './commands';
import type { RouteStyle } from './hand';
import { attachedByHand } from './handles';

export interface RouteMenuProps {
  project: ProjectSnapshot;
  viewId: Id;
  /** The relations the menu acts on: the one pointed at, or those selected. */
  relations: readonly Id[];
  /** The lines the canvas draws, by relation. */
  lines: ReadonlyMap<Id, RelationLine>;
  /** Where it opens, on screen relative to the canvas. */
  at: Point;
  /** Whether the project can be changed; while not, every item says so and does nothing. */
  editable: boolean;
  onSend: (command: Command) => void;
  /** Edit the route…: the keys edit the route of the relation. */
  onEditRoute: (relation: Id) => void;
  onClose: () => void;
}

const STYLES: readonly RouteStyle[] = ['orthogonal', 'straight', 'curved'];

/**
 * The menu of relations, opened with a secondary press on a line, Shift+F10 or the menu key while
 * relations are selected (ADR 0039): their style, Reset route, attaching an end chosen by hand
 * automatically again, and Edit the route…. The arrow keys, Home and End move through it, Enter
 * presses an item, and Escape or a press outside it closes it.
 */
export function RouteMenu({
  project,
  viewId,
  relations,
  lines,
  at,
  editable,
  onSend,
  onEditRoute,
  onClose,
}: RouteMenuProps) {
  const t = useT();
  const menu = useMenuInsideFrame<HTMLDivElement>(at);
  useOutsidePress(menu, onClose);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [menu]);

  const view = viewIn(project, viewId);
  const index = modelIndexOf(project);
  const ids = relations.filter((id) => index.relation(id) !== undefined);
  const [only] = ids;
  const one = ids.length === 1 && only !== undefined ? only : undefined;
  const line = one === undefined ? undefined : lines.get(one);
  const styleOf = (id: Id): RouteStyle =>
    view && routedByHand(view, id) ? (view.routes?.[id]?.style ?? 'orthogonal') : 'orthogonal';
  const anyByHand = view !== undefined && ids.some((id) => routedByHand(view, id));
  const title =
    one !== undefined
      ? relationLabel(index, one)
      : t({ one: '{count} relation', other: '{count} relations' }, { count: ids.length });
  const readOnly = !editable;
  const notEditable = t('The project cannot be changed now.');
  const press = (make: () => Command | undefined) => () => {
    if (readOnly) return;
    const command = make();
    onClose();
    if (command) onSend(command);
  };
  const styleNames: Record<RouteStyle, string> = {
    orthogonal: t('Orthogonal'),
    straight: t('Straight'),
    curved: t('Curved'),
  };

  return (
    <div
      ref={menu}
      className="canvas-menu"
      role="menu"
      aria-label={t('Route of {name}', { name: title })}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        else keyDown(event);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="canvas-menu-title" aria-hidden="true">
        {title}
      </p>
      <div role="group" aria-label={t('Style')}>
        <p className="canvas-menu-title">{t('Style')}</p>
        {STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="menuitemradio"
            tabIndex={-1}
            aria-checked={ids.length > 0 && ids.every((id) => styleOf(id) === style)}
            title={readOnly ? notEditable : undefined}
            aria-disabled={readOnly ? true : undefined}
            onClick={press(() => styleCommand(project, viewId, ids, style))}
          >
            {styleNames[style]}
          </button>
        ))}
      </div>
      <div role="separator" className="canvas-menu-separator" />
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        title={readOnly ? notEditable : anyByHand ? undefined : t('It is routed automatically')}
        aria-disabled={readOnly || !anyByHand ? true : undefined}
        onClick={anyByHand ? press(() => resetCommand(project, viewId, ids)) : undefined}
      >
        {t('Reset route')}
        {!anyByHand && (
          <span className="canvas-menu-hint"> · {t('It is routed automatically')}</span>
        )}
      </button>
      {one !== undefined && line && attachedByHand(line, 'from') && (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          title={readOnly ? notEditable : undefined}
          aria-disabled={readOnly ? true : undefined}
          onClick={press(() => attachAutomaticallyCommand(viewId, one, 'from'))}
        >
          {t('Attach the start automatically')}
        </button>
      )}
      {one !== undefined && line && attachedByHand(line, 'to') && (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          title={readOnly ? notEditable : undefined}
          aria-disabled={readOnly ? true : undefined}
          onClick={press(() => attachAutomaticallyCommand(viewId, one, 'to'))}
        >
          {t('Attach the end automatically')}
        </button>
      )}
      {one !== undefined && line && !line.aggregate && (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          title={readOnly ? notEditable : undefined}
          aria-disabled={readOnly ? true : undefined}
          onClick={
            readOnly
              ? undefined
              : () => {
                  onClose();
                  onEditRoute(one);
                }
          }
        >
          {t('Edit the route…')}
        </button>
      )}
    </div>
  );
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

/**
 * Moves through the menu's items, radio items included: Up and Down, round at the ends, Home and End,
 * and Enter presses the item with the focus.
 */
function keyDown(event: KeyboardEvent<HTMLElement>): void {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEMS)];
  const at = items.findIndex((item) => item === item.ownerDocument.activeElement);
  let next: HTMLElement | undefined;
  switch (event.key) {
    case 'ArrowDown':
      next = items[(at + 1) % items.length];
      break;
    case 'ArrowUp':
      next = at <= 0 ? items.at(-1) : items[at - 1];
      break;
    case 'Home':
      next = items[0];
      break;
    case 'End':
      next = items.at(-1);
      break;
    case 'Enter':
      if (at < 0) return;
      event.preventDefault();
      items[at]?.click();
      return;
    default:
      return;
  }
  event.preventDefault();
  next?.focus();
}
