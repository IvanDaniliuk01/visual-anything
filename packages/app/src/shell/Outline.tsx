import { modelIndexOf } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useState } from 'react';
import { scopeActions, type ScopeAction } from '../canvas/scopeActions';
import { useEditor } from '../editor/EditorContext';
import { OutlineMenu } from './OutlineMenu';
import { OutlineTree } from './OutlineTree';

interface OutlineProps {
  /** Whether the outline's tab is the one shown; a hidden outline draws nothing and keeps its state. */
  active: boolean;
}

/**
 * The app's outline of the open view (`OutlineTree`), with the menu of an element's row, which
 * leaves it out of the view or adds what its leaving relations reach (ADR-0040). The read-only page
 * shows the tree alone, since it changes nothing.
 */
export function Outline({ active }: OutlineProps) {
  const editor = useEditor();
  const { project, viewId, selection } = editor;
  // The menu of an element's row, where it was asked for (ADR-0040).
  const [menu, setMenu] = useState<OpenMenu>();

  const closeMenu = () => {
    // The focus goes back to the row the menu was opened on.
    menu?.from?.focus();
    setMenu(undefined);
  };
  const act = (action: ScopeAction) => {
    closeMenu();
    void editor.send?.(action.command);
  };
  const menuActions =
    menu && viewId !== undefined ? scopeActions(project, viewId, selection, menu.element) : {};
  const outlineTree = (
    <OutlineTree
      active={active}
      {...(viewId === undefined
        ? {}
        : {
            onMenu: (element: Id, at: OpenMenu['at'], from: HTMLElement | null) =>
              setMenu({ element, at, from }),
          })}
    />
  );
  if (!active || !menu || (!menuActions.leaveOut && !menuActions.add)) return outlineTree;
  return (
    <>
      {outlineTree}
      <OutlineMenu
        title={modelIndexOf(project).element(menu.element)?.name ?? menu.element}
        at={menu.at}
        actions={menuActions}
        editable={editor.send !== undefined}
        onAction={act}
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
