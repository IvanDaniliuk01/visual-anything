import { modelIndexOf } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useContext, useState } from 'react';
import {
  collapseDone,
  rowCollapseActions,
  setCollapsedCommand,
  type CollapseAction,
  type CollapseActions,
} from '../canvas/collapse';
import { inPlaceFor } from '../canvas/layout/expand';
import { ZoomExpansionContext, withoutZoomExpanded } from '../canvas/overlays/useZoomExpansion';
import { scopeActions, type ScopeAction } from '../canvas/scopeActions';
import { useEditor } from '../editor/EditorContext';
import { t as translateNow, useT } from '../i18n';
import { OutlineMenu } from './OutlineMenu';
import { OutlineTree } from './OutlineTree';

interface OutlineProps {
  /** Whether the outline's tab is the one shown; a hidden outline draws nothing and keeps its state. */
  active: boolean;
}

/**
 * The app's outline of the open view (`OutlineTree`), with the menu of an element's row, which
 * collapses or expands it when it is a container, as the canvas does, and leaves it out of the view
 * or adds what its leaving relations reach (ADR-0040); Alt with − and + collapse and expand from the
 * keys there too. The read-only page shows the tree alone, since it changes nothing.
 */
export function Outline({ active }: OutlineProps) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId, selection, scene } = editor;
  const zoom = useContext(ZoomExpansionContext);
  // The menu of an element's row, where it was asked for (ADR-0040).
  const [menu, setMenu] = useState<OpenMenu>();
  // What collapsing said once it was done, for screen readers.
  const [said, setSaid] = useState({ text: '', count: 0 });
  const say = (text: string) => setSaid((last) => ({ text, count: last.count + 1 }));

  const closeMenu = () => {
    // The focus goes back to the row the menu was opened on.
    menu?.from?.focus();
    setMenu(undefined);
  };
  const act = (action: ScopeAction) => {
    closeMenu();
    void editor.send?.(action.command);
  };
  /** Collapses or expands with the canvas's command, and says so once it is done. */
  const collapse = (action: CollapseAction, collapsed: boolean) => {
    if (viewId === undefined) return;
    // A container the zoom shows expanded is collapsed in the view already: the zoom lets it go.
    const elements = collapsed
      ? withoutZoomExpanded(zoom, viewId, action.elements)
      : action.elements;
    if (elements.length === 0) {
      say(collapseDone(action, collapsed));
      return;
    }
    if (!editor.send) {
      say(translateNow('The project cannot be changed now.'));
      return;
    }
    // As the canvas showing the view does: in place (ADR 0080, section 4).
    const inPlace = inPlaceFor(viewId);
    if (inPlace) {
      void (collapsed ? inPlace.collapse : inPlace.expand)(elements, action.label).then((done) => {
        if (done) say(collapseDone(action, collapsed));
      });
      return;
    }
    void editor.send(setCollapsedCommand(viewId, elements, collapsed)).then((result) => {
      if (result.ok) say(collapseDone(action, collapsed));
    });
  };
  const collapseActionsOf = (element: Id): CollapseActions =>
    scene ? rowCollapseActions(scene, project, selection, element) : {};
  /** Alt with − or + on a row: collapses or expands, or says why nothing does. */
  const collapseFromKeys = (element: Id, collapsed: boolean) => {
    const actions = collapseActionsOf(element);
    const action = collapsed ? actions.collapse : actions.expand;
    if (action) collapse(action, collapsed);
    else {
      say(
        collapsed
          ? t('Select an expanded container to collapse it.')
          : t('Select a collapsed container to expand it.'),
      );
    }
  };

  const menuActions =
    menu && viewId !== undefined ? scopeActions(project, viewId, selection, menu.element) : {};
  const menuCollapse = menu ? collapseActionsOf(menu.element) : {};
  const outlineTree = (
    <OutlineTree
      active={active}
      {...(viewId === undefined
        ? {}
        : {
            onMenu: (element: Id, at: OpenMenu['at'], from: HTMLElement | null) =>
              setMenu({ element, at, from }),
            onCollapse: collapseFromKeys,
          })}
    />
  );
  const announcement = (
    <p className="visually-hidden" aria-live="polite">
      {said.text}
      {said.count % 2 === 1 ? ' ' : ''}
    </p>
  );
  const offered =
    menuActions.leaveOut ?? menuActions.add ?? menuCollapse.collapse ?? menuCollapse.expand;
  if (!active || !menu || !offered) {
    return (
      <>
        {outlineTree}
        {announcement}
      </>
    );
  }
  return (
    <>
      {outlineTree}
      {announcement}
      <OutlineMenu
        title={modelIndexOf(project).element(menu.element)?.name ?? menu.element}
        at={menu.at}
        actions={menuActions}
        collapse={menuCollapse}
        editable={editor.send !== undefined}
        onAction={act}
        onCollapse={(action, collapsed) => {
          closeMenu();
          collapse(action, collapsed);
        }}
        onClose={closeMenu}
      />
    </>
  );
}

/** The menu of an element's row, open where it was asked for, and what had the focus then. */
interface OpenMenu {
  element: Id;
  at: { x: number; y: number };
  from: HTMLElement | null;
}
