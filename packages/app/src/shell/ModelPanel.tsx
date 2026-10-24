import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useId, useMemo, type ReactNode } from 'react';
import {
  componentOrEssence,
  containmentTree,
  type Definitions,
  type Placement,
} from '@visual-anything/core';

interface ModelPanelProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
}

/**
 * The model panel: World's contents as a containment tree, then the project's views and scenarios.
 * The tree nests by every relation type that nests in the packages in use, whatever the open view
 * chooses. It is read-only.
 */
export function ModelPanel({ project, definitions, openViewId }: ModelPanelProps) {
  const panelHeading = useId();
  const worldHeading = useId();
  const viewsHeading = useId();
  const scenariosHeading = useId();
  const tree = useMemo(
    () =>
      containmentTree(project.model, (relationType) =>
        definitions.nestingRelationTypes.has(relationType),
      ),
    [project.model, definitions],
  );
  const elements = useMemo(
    () => new Map(project.model.elements.map((element) => [element.id, element])),
    [project.model.elements],
  );
  const viewNames = new Map(project.views.map((view) => [view.id, view.name]));

  return (
    <aside className="panel model-panel" aria-labelledby={panelHeading}>
      <h2 id={panelHeading}>Model</h2>

      <section className="panel-section">
        <h3 id={worldHeading}>World</h3>
        {tree.length > 0 ? (
          <ContainmentList
            placements={tree}
            elements={elements}
            definitions={definitions}
            labelledBy={worldHeading}
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
              const open = view.id === openViewId;
              return (
                <li key={view.id} aria-current={open ? 'true' : undefined}>
                  <span className="item-name">{view.name}</span>
                  <Secondary>{view.perspective.name}</Secondary>
                  {open && (
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
                  <Secondary>
                    {scenario.steps.length === 1 ? '1 step' : `${scenario.steps.length} steps`}
                    {viewName !== undefined && ` over ${viewName}`}
                  </Secondary>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">This project has no scenarios yet.</p>
        )}
      </section>
    </aside>
  );
}

interface ContainmentListProps {
  placements: readonly Placement[];
  elements: ReadonlyMap<Id, Element>;
  definitions: Definitions;
  labelledBy?: string;
}

function ContainmentList({ placements, elements, definitions, labelledBy }: ContainmentListProps) {
  return (
    <ul className="containment" aria-labelledby={labelledBy}>
      {placements.map((placement) => {
        const element = elements.get(placement.element);
        return (
          <li key={placement.element}>
            <span className="item-name">{element?.name ?? placement.element}</span>
            {element && (
              <Secondary>{componentOrEssence(definitions, element.component).name}</Secondary>
            )}
            {placement.contents.length > 0 && (
              <ContainmentList
                placements={placement.contents}
                elements={elements}
                definitions={definitions}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Secondary text after an item's name; screen readers hear it after a comma. */
function Secondary({ children }: { children: ReactNode }) {
  return (
    <span className="item-detail">
      <span className="visually-hidden">, </span>
      {children}
    </span>
  );
}
