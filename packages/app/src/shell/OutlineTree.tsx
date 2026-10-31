import { plainText, spaceOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useMemo } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useEmphasis } from '../editor/emphasis';
import { selectionOf, sizeOf, type Selectable } from '../editor/selection';
import { useT } from '../i18n';
import { useSpacePanel, useSpacePanelState } from '../space/context';
import { SpaceIcon } from './icons';
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
import { Secondary } from './Secondary';
import { shownRows, type TreeRow } from './tree';
import { useTreeState } from './useTreeState';
import { VirtualTree, type Activation } from './VirtualTree';

interface OutlineTreeProps {
  /** Whether the outline's tab is the one shown; a hidden outline draws nothing and keeps its state. */
  active: boolean;
  /**
   * Opens the menu of an element's row, where it was asked for, with what had the focus then; absent
   * where rows have no menu, as in the read-only page, which changes nothing.
   */
  onMenu?: (element: Id, at: { x: number; y: number }, from: HTMLElement | null) => void;
  /**
   * Alt with − or + on an element's row: collapses (true) or expands (false) it, or the selection
   * that holds it, as on the canvas; absent where rows change nothing, as in the read-only page.
   */
  onCollapse?: (element: Id, collapsed: boolean) => void;
}

/** The keys that collapse (true) or expand (false) with Alt, by their place, as on the canvas. */
const COLLAPSE_KEYS: Partial<Record<string, boolean>> = {
  Minus: true,
  NumpadSubtract: true,
  Equal: false,
  NumpadAdd: false,
};

/** How a relation's row shows its direction, seen from the shape it sits under. */
const ARROWS: Record<RelationItem['way'], string> = { out: '→', in: '←', both: '—' };

/**
 * The outline of the open view: the shapes the canvas draws, as a tree that keyboards and screen
 * readers can move through. Enter or a click selects what a row stands for and shows it on the canvas;
 * Enter on the row of the selected relation goes to its far end, as Enter does on the canvas. The
 * app's `Outline` adds the menu of an element's row; the read-only page shows the tree alone.
 */
export function OutlineTree({ active, onMenu, onCollapse }: OutlineTreeProps) {
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
  const shown = useMemo(
    () => outline && shownRows(outline, (item, id) => open.get(id) ?? outline.openAtFirst(item)),
    [outline, open],
  );
  // What is in physical space (ADR 0076): under World, and under what the view's panel shows.
  const panelShows = useSpacePanelState(useSpacePanel(), viewId)?.root;
  const inSpace = useMemo(
    () => (active ? inPhysicalSpace(project, panelShows) : undefined),
    [active, project, panelShows],
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
  return (
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
      renderRow={(row) => (
        <OutlineRow
          project={project}
          item={row.item}
          inSpace={row.item.kind === 'shape' && (inSpace?.has(row.item.shape.element) ?? false)}
        />
      )}
      onMenu={(row, at) => {
        const { item } = row;
        if (!onMenu || item.kind !== 'shape') return false;
        const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onMenu(item.shape.element, at, from);
        return true;
      }}
      onKey={(row, event) => {
        const folding =
          event.altKey && !event.ctrlKey && !event.metaKey ? COLLAPSE_KEYS[event.code] : undefined;
        if (folding === undefined || !onCollapse || row.item.kind !== 'shape') return false;
        onCollapse(row.item.shape.element, folding);
        return true;
      }}
    />
  );
}

/**
 * The elements in physical space (ADR 0076): under World, and under the element the view's panel
 * shows while it shows one; World itself is not marked.
 */
function inPhysicalSpace(project: ProjectSnapshot, panelShows: Id | undefined): ReadonlySet<Id> {
  const world = project.model.world.id;
  const found = new Set<Id>(spaceOf(project).entries.keys());
  if (panelShows !== undefined && panelShows !== world) {
    for (const element of spaceOf(project, undefined, panelShows).entries.keys()) {
      found.add(element);
    }
  }
  found.delete(world);
  return found;
}

/**
 * What a row says: an element's name and component, a relation, or a free shape. A shape whose
 * element is in physical space has its mark after its name, heard as ", in physical space".
 */
function OutlineRow({
  project,
  item,
  inSpace,
}: {
  project: ProjectSnapshot;
  item: OutlineItem;
  inSpace: boolean;
}) {
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
          {inSpace && (
            <span className="outline-space" title={t('In physical space')}>
              <SpaceIcon size={12} />
              <span className="visually-hidden">{t(', in physical space')}</span>
            </span>
          )}
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
          <Secondary text={plainText(item.note.text)} />
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
