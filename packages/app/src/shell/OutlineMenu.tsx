/**
 * The menu of an element's row in the outline, opened with a secondary press, Shift+F10 or the menu
 * key: Collapse or Expand for a container, then Leave out of this view, and Add to this view for what
 * the relations that leave the view from it reach (ADR-0040), for the element or the selection that
 * holds it, as the shape menu offers them.
 * The arrow keys, Home and End move through it, Enter presses an item, and Escape or a press outside
 * it closes it and gives the focus back to the row.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { menuKeyDown, useOutsidePress } from '../canvas/focus';
import type { CollapseAction, CollapseActions } from '../canvas/collapse';
import type { ScopeAction, ScopeActions } from '../canvas/scopeActions';
import { useT } from '../i18n';
import './scope.css';

/** How far from the window's edges the menu stays, in CSS pixels. */
const EDGE = 8;

export function OutlineMenu({
  title,
  at,
  actions,
  collapse = {},
  editable,
  onAction,
  onCollapse = () => undefined,
  onClose,
}: {
  /** What the menu is for: the element's name. */
  title: string;
  /** Where it opens, on screen. */
  at: { x: number; y: number };
  actions: ScopeActions;
  /** What collapsing and expanding offer for the row (`rowCollapseActions`). */
  collapse?: CollapseActions;
  editable: boolean;
  onAction: (action: ScopeAction) => void;
  onCollapse?: (action: CollapseAction, collapsed: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const menu = useRef<HTMLDivElement>(null);
  useOutsidePress(menu, onClose);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  // Inside the window, however near its edge it opens.
  useLayoutEffect(() => {
    const element = menu.current;
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return;
    const left = Math.max(EDGE, Math.min(at.x, view.innerWidth - element.offsetWidth - EDGE));
    const top = Math.max(EDGE, Math.min(at.y, view.innerHeight - element.offsetHeight - EDGE));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [at]);

  const items = [actions.leaveOut, actions.add].filter(
    (action): action is ScopeAction => action !== undefined,
  );
  const folds = [
    collapse.collapse && {
      action: collapse.collapse,
      collapsed: true,
      title: t('Draws none of what it holds; their relations become aggregated relations. Alt+−'),
    },
    collapse.expand && {
      action: collapse.expand,
      collapsed: false,
      title: t('Draws again what it holds. Alt++'),
    },
  ].filter((fold) => fold !== undefined);
  const readOnly = editable ? undefined : t('The project cannot be changed now.');
  return (
    <div
      ref={menu}
      className="canvas-menu outline-menu"
      role="menu"
      aria-label={title}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        } else menuKeyDown(event);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="canvas-menu-title" aria-hidden="true">
        {title}
      </p>
      {folds.map(({ action, collapsed, title }) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          title={readOnly ?? title}
          aria-disabled={editable ? undefined : true}
          onClick={editable ? () => onCollapse(action, collapsed) : undefined}
        >
          {t.message(action.label)}
        </button>
      ))}
      {folds.length > 0 && items.length > 0 && (
        <div role="separator" className="canvas-menu-separator" />
      )}
      {items.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          title={editable ? undefined : t('The project cannot be changed now.')}
          aria-disabled={editable ? undefined : true}
          onClick={editable ? () => onAction(action) : undefined}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
