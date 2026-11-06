import {
  componentOrEssence,
  containmentTree,
  modelIndexOf,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, useRef } from 'react';
import { useEditor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { useT } from '../i18n';
import { firstShapeOf, worldTreeOf, type WorldItem } from './outlineItems';
import { Secondary } from './Secondary';
import { shownRows, type TreeRow } from './tree';
import { useTreeState } from './useTreeState';
import { ViewList } from './ViewList';
import { VirtualTree } from './VirtualTree';
import { WorldDivider } from './WorldDivider';
import { useWorldHeight } from './worldHeight';

const STEPS = { one: '{count} step', other: '{count} steps' };
const STEPS_OVER = { one: '{count} step over {view}', other: '{count} steps over {view}' };

interface ModelTabProps {
  /** Whether the tab is the one shown; a hidden tab draws nothing and keeps its state. */
  active: boolean;
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
}

/**
 * What the model holds: World's contents as a containment tree, then the project's views, which open
 * on the canvas and are made, changed and deleted there, and its scenarios. The tree nests by every
 * relation type that nests in the packages in use, whatever the open view chooses. Enter or a click on
 * an element selects it and shows it on the canvas.
 */
export function ModelTab({ active, project, definitions, openViewId }: ModelTabProps) {
  const t = useT();
  const editor = useEditor();
  const { scene, selection } = editor;
  const worldHeading = useId();
  const worldSection = useId();
  const tabRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLElement>(null);
  const worldHeight = useWorldHeight(tabRef);
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
    <div className="model-tab" ref={tabRef}>
      <section
        ref={worldRef}
        id={worldSection}
        className="panel-section model-world"
        {...(worldHeight.height === undefined
          ? {}
          : { 'data-sized': '', style: { height: worldHeight.height } })}
      >
        <h3 id={worldHeading}>{t('World')}</h3>
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
              const component = element && componentOrEssence(definitions, element.component);
              return (
                <>
                  <span className="item-name">{nameOf(row)}</span>
                  {component && <Secondary text={t.definition(component.id, component.name)} />}
                </>
              );
            }}
          />
        ) : (
          <p className="panel-empty">
            {t('World holds no elements yet. Add one with Add an element, on the canvas.')}
          </p>
        )}
      </section>
      <WorldDivider
        world={worldRef}
        controls={worldSection}
        height={worldHeight.height}
        setHeight={worldHeight.setHeight}
        maxHeight={worldHeight.maxHeight}
      />

      <section className="panel-section">
        <h3 id={viewsHeading}>{t('Views')}</h3>
        <ViewList
          project={project}
          definitions={definitions}
          openViewId={openViewId}
          labelledBy={viewsHeading}
        />
      </section>

      <section className="panel-section">
        <h3 id={scenariosHeading}>{t('Scenarios')}</h3>
        {project.scenarios.length > 0 ? (
          <ul className="item-list" aria-labelledby={scenariosHeading}>
            {project.scenarios.map((scenario) => {
              const viewName = viewNames.get(scenario.view);
              return (
                <li key={scenario.id}>
                  <span className="item-name">{scenario.name}</span>
                  <Secondary
                    text={
                      viewName === undefined
                        ? t(STEPS, { count: scenario.steps.length })
                        : t(STEPS_OVER, { count: scenario.steps.length, view: viewName })
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">
            {t(
              'This project has no scenarios yet. Make one with New scenario, then click relations on the canvas in the order they happen.',
            )}
          </p>
        )}
      </section>
    </div>
  );
}
