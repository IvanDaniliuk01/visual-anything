import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useMemo, useState } from 'react';
import { scopeActions, type ScopeAction } from '../canvas/scopeActions';
import { useEditor } from '../editor/EditorContext';
import { useEmphasis } from '../editor/emphasis';
import { selectionOf, sizeOf, type Selectable } from '../editor/selection';
import { useT } from '../i18n';
import {
  isItemSelected,
  outlineOf,
  placeOfSelection,
  revealKeyOf,
  selectablesOf,
  type OutlineItem,
  type RelationItem,
} from './outlineItems';
import { farNameOf, labelOf, relationTypeName, shapeNote, typedTextOf } from './outlineText';
import { OutlineMenu } from './OutlineMenu';
import { Secondary } from './Secondary';
import { shownRows, type TreeRow } from './tree';
import { useTreeState } from './useTreeState';
import { VirtualTree, type Activation } from './VirtualTree';

interface OutlineProps {
  /** Whether the outline's tab is the one shown; a hidden outline draws nothing and keeps its state. */
  active: boolean;
}

/** How a relation's row shows its direction, seen from the shape it sits under. */
const ARROWS: Record<RelationItem['way'], string> = { out: '→', in: '←', both: '—' };

/**
 * The outline of the open view: the shapes the canvas draws, as a tree that keyboards and screen
 * readers can move through. Enter or a click selects what a row stands for and shows it on the canvas;
 * Enter on the row of the selected relation goes to its far end, as Enter does on the canvas.
 */
export function Outline({ active }: OutlineProps) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId, scene, selection } = editor;
  // What filters and focus hide is left out, as the canvas leaves it out.
  const { hidden } = useEmphasis();
  const outline = useMemo(
    () => (active && scene ? outlineOf(scene, project, hidden) : undefined),
    [active, scene, project, hidden],
  );
  const tree = useTreeState(
    selection,
    (next) => editor.select(next),
    outline && ((next) => placeOfSelection((selectable) => outline.placeOf(selectable), next)),
    (id) => outline?.openAtFirstOf(id) ?? false,
  );
  const { open } = tree;
  // The menu of an element's row, where it was asked for (ADR-0040).
  const [menu, setMenu] = useState<OpenMenu>();
  const shown = useMemo(
    () => outline && shownRows(outline, (item, id) => open.get(id) ?? outline.openAtFirst(item)),
    [outline, open],
  );

  if (!active) return null;
  if (!scene) return <p className="panel-empty">{t('There is no view to outline.')}</p>;
  if (!outline || !shown || shown.rows.length === 0) {
    return <p className="panel-empty">{t('This view has no shapes yet.')}</p>;
  }

  /** Selects the relation's far end, shows it on the canvas and moves the focus to its row. */
  const follow = (item: RelationItem) => {
    const farShape = outline.shapeOf(item.far);
    const far: Selectable = farShape
      ? { kind: 'element', id: item.far }
      : { kind: 'relation', id: item.far };
    tree.choose(selectionOf([far]));
    editor.reveal(farShape ? farShape.key : item.far);
    const place = outline.placeOf(far);
    if (place) tree.bringIntoView(place, true);
  };

  const activate = (row: TreeRow<OutlineItem>, how: Activation) => {
    const { item } = row;
    if (
      how === 'key' &&
      item.kind === 'relation' &&
      sizeOf(selection) === 1 &&
      selection.relations.has(item.relation)
    ) {
      follow(item);
      return;
    }
    tree.choose(selectionOf(selectablesOf(item)));
    editor.reveal(revealKeyOf(item));
  };

  const viewName = project.views.find((view) => view.id === viewId)?.name;
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
    <VirtualTree
      shown={shown}
      label={viewName === undefined ? t('Outline') : t('Outline of {view}', { view: viewName })}
      selectedId={placeOfSelection((selectable) => outline.placeOf(selectable), selection)?.id}
      request={tree.request}
      isSelected={(row) => isItemSelected(selection, row.item)}
      textOf={(row) => typedTextOf(t, row.item)}
      labelOf={(row) => labelOf(t, project, row.item)}
      onOpen={(row, value) => tree.setOpen(row.id, value)}
      onActivate={activate}
      renderRow={(row) => <OutlineRow project={project} item={row.item} />}
      onMenu={(row, at) => {
        const { item } = row;
        if (item.kind !== 'shape' || viewId === undefined) return false;
        const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setMenu({ element: item.shape.element, at, from });
        return true;
      }}
    />
  );
  if (!menu || (!menuActions.leaveOut && !menuActions.add)) return outlineTree;
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

/** What a row says: an element's name and component, a relation, or a free shape. */
function OutlineRow({ project, item }: { project: ProjectSnapshot; item: OutlineItem }) {
  const t = useT();
  switch (item.kind) {
    case 'shape': {
      // How many relations leave the view from it, as its mark on the canvas says (ADR-0040).
      const leaving = item.shape.leaving?.length ?? 0;
      const note = shapeNote(t, project, item);
      const leaves =
        leaving === 0
          ? undefined
          : t(
              {
                one: '{count} relation leaves this view',
                other: '{count} relations leave this view',
              },
              { count: leaving },
            );
      return (
        <>
          <span className="item-name">{item.shape.name}</span>
          <Secondary text={leaves === undefined ? note : `${note} · ${leaves}`} />
        </>
      );
    }
    case 'relation': {
      // The far end comes first, so that a narrow panel cuts the relation type rather than it.
      const relationType = relationTypeName(t, project, item);
      return (
        <>
          <span className="outline-arrow" aria-hidden="true">
            {ARROWS[item.way]}
          </span>{' '}
          <span className="item-name">{farNameOf(t, item)}</span>
          <Secondary
            text={item.name === undefined ? relationType : `${relationType} “${item.name}”`}
          />
        </>
      );
    }
    case 'note':
      return (
        <>
          <span className="item-name">{t('Note')}</span>
          <Secondary text={item.note.text} />
        </>
      );
    case 'arrow':
      return <span className="item-name">{t('Arrow')}</span>;
    case 'undrawn':
      // A row draws none of what its element holds (ADR 0023).
      return (
        <>
          <span className="item-name">{item.name}</span>
          <Secondary text={t('Not drawn: inside a row')} />
        </>
      );
  }
}
