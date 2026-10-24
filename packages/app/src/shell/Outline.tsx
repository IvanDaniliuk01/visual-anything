import { useMemo } from 'react';
import { drawnRelations } from '../canvas/navigation';
import { useEditor } from '../editor/EditorContext';
import { selectionOf, sizeOf, type Selectable } from '../editor/selection';
import {
  isItemSelected,
  outlineOf,
  placeOfSelection,
  revealKeyOf,
  selectableOf,
  textOf,
  type OutlineItem,
  type RelationItem,
} from './outlineItems';
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
  const editor = useEditor();
  const { project, viewId, scene, selection } = editor;
  const outline = useMemo(
    () => (active && scene ? outlineOf(scene, project) : undefined),
    [active, scene, project],
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

  if (!active) return null;
  if (!scene) return <p className="panel-empty">There is no view to outline.</p>;
  if (!outline || !shown || shown.rows.length === 0) {
    return <p className="panel-empty">This view has no shapes yet.</p>;
  }

  /** Selects the relation's far end, shows it on the canvas and moves the focus to its row. */
  const follow = (item: RelationItem) => {
    const farShape = drawnRelations(scene, project).shapeOf(item.far);
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
    tree.choose(selectionOf([selectableOf(item)]));
    editor.reveal(revealKeyOf(item));
  };

  const viewName = project.views.find((view) => view.id === viewId)?.name;
  return (
    <VirtualTree
      shown={shown}
      label={viewName === undefined ? 'Outline' : `Outline of ${viewName}`}
      selectedId={placeOfSelection((selectable) => outline.placeOf(selectable), selection)?.id}
      request={tree.request}
      isSelected={(row) => isItemSelected(selection, row.item)}
      textOf={(row) => textOf(row.item)}
      labelOf={(row) => labelOf(row.item)}
      onOpen={(row, value) => tree.setOpen(row.id, value)}
      onActivate={activate}
      renderRow={(row) => <OutlineRow item={row.item} />}
    />
  );
}

/** What a row says: an element's name and component, a relation, or a free shape. */
function OutlineRow({ item }: { item: OutlineItem }) {
  switch (item.kind) {
    case 'shape':
      return (
        <>
          <span className="item-name">{item.shape.name}</span>
          <Secondary text={item.shape.componentName} />
        </>
      );
    case 'relation':
      // The far end comes first, so that a narrow panel cuts the relation type rather than it.
      return (
        <>
          <span className="outline-arrow" aria-hidden="true">
            {ARROWS[item.way]}
          </span>{' '}
          <span className="item-name">{item.farName}</span>
          <Secondary
            text={
              item.name === undefined ? item.relationType : `${item.relationType} “${item.name}”`
            }
          />
        </>
      );
    case 'note':
      return (
        <>
          <span className="item-name">Note</span>
          <Secondary text={item.note.text} />
        </>
      );
    case 'arrow':
      return <span className="item-name">Arrow</span>;
  }
}

/** A relation's row is heard as the sentence it reads as; the other rows as they read. */
function labelOf(item: OutlineItem): string | undefined {
  if (item.kind !== 'relation') return undefined;
  return item.name === undefined ? item.sentence : `${item.sentence}, “${item.name}”`;
}
