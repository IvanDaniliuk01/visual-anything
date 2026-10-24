import {
  componentOrEssence,
  containmentTree,
  modelIndexOf,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo } from 'react';
import { useEditor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { firstShapeOf, worldTreeOf, type WorldItem } from './outlineItems';
import { Secondary } from './Secondary';
import { shownRows, type TreeRow } from './tree';
import { useTreeState } from './useTreeState';
import { VirtualTree } from './VirtualTree';

interface ModelTabProps {
  /** Whether the tab is the one shown; a hidden tab draws nothing and keeps its state. */
  active: boolean;
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
}

/**
 * What the model holds: World's contents as a containment tree, then the project's views and
 * scenarios. The tree nests by every relation type that nests in the packages in use, whatever the
 * open view chooses. Enter or a click on an element selects it and shows it on the canvas.
 */
export function ModelTab({ active, project, definitions, openViewId }: ModelTabProps) {
  const editor = useEditor();
  const { scene, selection } = editor;
  const worldHeading = useId();
  const viewsHeading = useId();
  const scenariosHeading = useId();
  const world = useMemo(
    () =>
      active
        ? worldTreeOf(
            containmentTree(project.model, (relationType) =>
              definitions.nestingRelationTypes.has(relationType),
            ),
          )
        : undefined,
    [active, project.model, definitions],
  );
  const tree = useTreeState(
    selection,
    (next) => editor.select(next),
    world &&
      ((next) => {
        const [element] = next.elements;
        return element === undefined ? undefined : world.placeOf(element);
      }),
    () => true,
  );
  const { open } = tree;
  const shown = useMemo(
    () => world && shownRows(world, (_, id) => open.get(id) ?? true),
    [world, open],
  );

  if (!active) return null;
  const index = modelIndexOf(project);
  const nameOf = (row: TreeRow<WorldItem>) =>
    index.element(row.item.placement.element)?.name ?? row.item.placement.element;
  const viewNames = new Map(project.views.map((view) => [view.id, view.name]));
  const [selected] = selection.elements;

  return (
    <div className="model-tab">
      <section className="panel-section model-world">
        <h3 id={worldHeading}>World</h3>
        {world && shown && shown.rows.length > 0 ? (
          <VirtualTree
            shown={shown}
            labelledBy={worldHeading}
            selectedId={selected === undefined ? undefined : world.placeOf(selected)?.id}
            request={tree.request}
            isSelected={(row) => selection.elements.has(row.item.placement.element)}
            textOf={nameOf}
            onOpen={(row, value) => tree.setOpen(row.id, value)}
            onActivate={(row) => {
              const { element } = row.item.placement;
              tree.choose(selectionOf([{ kind: 'element', id: element }]));
              const shape = scene && firstShapeOf(scene, element);
              if (shape) editor.reveal(shape.key);
            }}
            renderRow={(row) => {
              const element = index.element(row.item.placement.element);
              return (
                <>
                  <span className="item-name">{nameOf(row)}</span>
                  {element && (
                    <Secondary text={componentOrEssence(definitions, element.component).name} />
                  )}
                </>
              );
            }}
          />
        ) : (
          <p className="panel-empty">World holds no elements yet.</p>
        )}
      </section>

      <section className="panel-section">
        <h3 id={viewsHeading}>Views</h3>
        {project.views.length > 0 ? (
          <ul className="item-list" aria-labelledby={viewsHeading}>
            {project.views.map((view) => {
              const isOpen = view.id === openViewId;
              return (
                <li key={view.id} aria-current={isOpen ? 'true' : undefined}>
                  <span className="item-name">{view.name}</span>
                  <Secondary text={view.perspective.name} />
                  {isOpen && (
                    <span className="item-badge" aria-hidden="true">
                      Open
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">This project has no views yet.</p>
        )}
      </section>

      <section className="panel-section">
        <h3 id={scenariosHeading}>Scenarios</h3>
        {project.scenarios.length > 0 ? (
          <ul className="item-list" aria-labelledby={scenariosHeading}>
            {project.scenarios.map((scenario) => {
              const viewName = viewNames.get(scenario.view);
              return (
                <li key={scenario.id}>
                  <span className="item-name">{scenario.name}</span>
                  <Secondary
                    text={
                      <>
                        {scenario.steps.length === 1 ? '1 step' : `${scenario.steps.length} steps`}
                        {viewName !== undefined && ` over ${viewName}`}
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">This project has no scenarios yet.</p>
        )}
      </section>
    </div>
  );
}
