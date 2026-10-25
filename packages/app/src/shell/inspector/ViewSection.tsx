import {
  modelIndexOf,
  nestingTypesInView,
  previewChangeContainer,
  type ChangeContainerCommand,
  type Command,
  type ModelIndex,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ComponentSelect } from '../../canvas/CanvasToolbar';
import {
  collapseActions,
  collapseDone,
  insideCount,
  setCollapsedCommand,
} from '../../canvas/collapse';
import { ContainerChooser } from '../../canvas/ContainerChooser';
import { DeleteDialog } from '../../canvas/DeleteDialog';
import {
  confirmLabelOf,
  containerChangeLabel,
  moveToCommand,
  needsConfirmation,
  takeOutCommand,
} from '../../canvas/drop';
import { createInsideCommand } from '../../canvas/gestures';
import { indexScene, type IndexedScene } from '../../canvas/hit';
import type { ElementShape } from '../../canvas/scene';
import {
  STACKING_KEYS,
  STACKING_MOVES,
  STACKING_NAMES,
  drawingRank,
  restackCommand,
  stackingActions,
  stackingNeighbours,
  type StackingMove,
} from '../../canvas/stacking';
import { useEditor } from '../../editor/EditorContext';
import { selectionOf } from '../../editor/selection';
import { useT } from '../../i18n';

/** How many of the shapes that overlap it each line names. */
const NEIGHBOURS_NAMED = 3;

const NESTS_NOTHING =
  'This view puts nothing inside containers: it is arranged by no relation type that nests.';

/** The chooser, open for one membership: Put inside… from World, or Move to… from a container. */
interface Choosing {
  container?: Id;
  mode: 'put' | 'move';
}

/**
 * The element in the open view: for each container it sits in there, or directly in World, where it
 * sits and how to take it out or move it, and its place in the stacking order there, with what
 * overlaps it and the four moves; then adding an element inside it. A change of container that
 * deletes more than the relation that placed the shape asks first. Shown only for an element the view
 * draws; the model's containers stay listed under Containers.
 */
export function ViewSection({ element }: { element: Element }) {
  const t = useT();
  const { project, scene, viewId, send, selection, select } = useEditor();
  const headingId = useId();
  const [choosing, setChoosing] = useState<Choosing>();
  const [changing, setChanging] = useState<ChangeContainerCommand>();
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  // The control that started a change, which takes the focus back once its dialog closes.
  const started = useRef<HTMLElement | null>(null);
  const latestSelection = useRef(selection);
  useLayoutEffect(() => {
    latestSelection.current = selection;
  });
  // The same index the canvas draws from, since `indexScene` keeps one for each scene.
  const indexed = useMemo(() => {
    try {
      return scene ? indexScene(scene) : undefined;
    } catch {
      return undefined;
    }
  }, [scene]);
  const changePreview = useMemo(
    () => (changing ? previewChangeContainer(project, changing) : undefined),
    [project, changing],
  );
  const own = useMemo(() => selectionOf([{ kind: 'element', id: element.id }]), [element.id]);

  const view = project.views.find((each) => each.id === viewId);
  const shapes = indexed?.byElement.get(element.id) ?? [];
  if (!view || !indexed || shapes.length === 0) return null;

  const editable = send !== undefined;
  const nests = nestingTypesInView(project, view).length > 0;
  const index = modelIndexOf(project);
  const say = (text: string) => setMessage((last) => ({ text, count: last.count + 1 }));
  // One row for each container it sits in, through the first of its shapes there.
  const memberships = new Map<string, ElementShape>();
  for (const shape of shapes) {
    const key = shape.container ?? '';
    if (!memberships.has(key)) memberships.set(key, shape);
  }

  const perform = async (command: Command, done: string): Promise<boolean> => {
    if (!send) return false;
    try {
      const result = await send(command);
      if (result.ok) say(done);
      return result.ok;
    } catch {
      return false;
    }
  };

  const giveFocusBack = () => {
    const control = started.current;
    started.current = null;
    if (control?.isConnected) control.focus();
  };

  /** Sends a change of container, after its preview: one that would be refused says why. */
  const change = (made: ChangeContainerCommand | undefined) => {
    if (!made) return;
    const preview = previewChangeContainer(project, made);
    const [problem] = preview.problems;
    if (problem) {
      say(t.message(problem.message));
      return;
    }
    if (needsConfirmation(preview)) {
      setChanging(made);
      return;
    }
    void perform(made, `${t.message(containerChangeLabel(project, view.id, made))}.`);
  };

  const restack = (move: StackingMove, container: Id | undefined) => {
    const { command, reason, done } = restackCommand(
      indexed,
      project,
      view.id,
      own,
      move,
      editable,
      { container },
    );
    if (command) void perform(command, done ?? '');
    else if (reason !== undefined) say(reason);
  };

  const addInside = async (component: Id) => {
    const command = createInsideCommand(project, view.id, component, element.id);
    if (!command || !send) return;
    const chosen = latestSelection.current;
    try {
      const result = await send(command);
      const id = result.created?.[0];
      // Selected unless something else was chosen meanwhile.
      if (result.ok && id !== undefined && latestSelection.current === chosen) {
        select(selectionOf([{ kind: 'element', id }]));
      }
    } catch {
      // A refusal is already shown as a notice.
    }
  };

  // Whether it is a container the view draws collapsed or expanded, and the action that changes it.
  const collapse = collapseActions(indexed, project, own);
  const collapsing = collapse.expand ?? collapse.collapse;
  const collapsedNow = collapse.expand !== undefined;
  const firstShape = shapes[0];
  const inside = firstShape === undefined ? undefined : insideCount(firstShape);

  const [problem] = changePreview?.problems ?? [];
  if (changing && (!editable || problem)) {
    setChanging(undefined);
    if (problem) say(t.message(problem.message));
  }
  if (choosing && !editable) setChoosing(undefined);

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('In this view')}</h4>
      {!nests && <p className="inspector-notes">{t(NESTS_NOTHING)}</p>}
      <ul className="inspector-memberships">
        {[...memberships.values()].map((shape) => (
          <MembershipRow
            key={shape.container ?? ''}
            shape={shape}
            indexed={indexed}
            index={index}
            nests={nests}
            editable={editable}
            stacking={stackingActions(indexed, project, view.id, own, editable, {
              container: shape.container,
            })}
            onTakeOut={(control) => {
              started.current = control;
              change(takeOutCommand(indexed, project, view.id, shape));
            }}
            onChoose={(control, mode) => {
              started.current = control;
              setChoosing({
                ...(shape.container === undefined ? {} : { container: shape.container }),
                mode,
              });
            }}
            onRestack={(move) => restack(move, shape.container)}
          />
        ))}
      </ul>
      {collapsing && (
        <div className="inspector-collapse">
          <span>
            {collapsedNow
              ? inside === undefined
                ? t('Collapsed: its contents are not drawn.')
                : t('Collapsed, with {inside}: its contents are not drawn.', { inside })
              : t('Expanded: its contents are drawn.')}
          </span>
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() =>
              void perform(
                setCollapsedCommand(view.id, collapsing.elements, !collapsedNow),
                collapseDone(collapsing, !collapsedNow),
              )
            }
          >
            {collapsedNow ? t('Expand') : t('Collapse')}
          </button>
        </div>
      )}
      {nests && (
        <div className="inspector-control">
          <label>
            <span className="visually-hidden">
              {t('Add an element inside "{name}"', { name: element.name })}
            </span>
            <ComponentSelect
              project={project}
              option={t('Add inside "{name}"…', { name: element.name })}
              disabled={!editable}
              onAdd={(component) => void addInside(component)}
            />
          </label>
        </div>
      )}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
      {choosing && (
        <ContainerChooser
          project={project}
          viewId={view.id}
          element={element.id}
          mode={choosing.mode}
          onChoose={(to) => {
            setChoosing(undefined);
            giveFocusBack();
            change(
              moveToCommand(
                view.id,
                {
                  element: element.id,
                  ...(choosing.container === undefined ? {} : { container: choosing.container }),
                },
                to,
              ),
            );
          }}
          onCancel={() => {
            setChoosing(undefined);
            giveFocusBack();
          }}
        />
      )}
      {changing && changePreview && (
        <DeleteDialog
          project={project}
          preview={changePreview}
          freeShapes={0}
          action={{
            title: `${containerChangeLabel(project, view.id, changing)}?`,
            confirmLabel: confirmLabelOf(project, changing),
            leaving: changePreview.leaving,
            withData: changePreview.withData,
          }}
          onConfirm={() => {
            setChanging(undefined);
            giveFocusBack();
            void perform(
              changing,
              `${t.message(containerChangeLabel(project, view.id, changing))}.`,
            );
          }}
          onCancel={() => {
            setChanging(undefined);
            giveFocusBack();
          }}
        />
      )}
    </section>
  );
}

interface MembershipRowProps {
  shape: ElementShape;
  indexed: IndexedScene;
  index: ModelIndex;
  nests: boolean;
  editable: boolean;
  stacking: ReturnType<typeof stackingActions>;
  onTakeOut: (control: HTMLElement) => void;
  onChoose: (control: HTMLElement, mode: 'put' | 'move') => void;
  onRestack: (move: StackingMove) => void;
}

/** One container the element sits in, or World: where, its place in the stacking order, and moves. */
function MembershipRow({
  shape,
  indexed,
  index,
  nests,
  editable,
  stacking,
  onTakeOut,
  onChoose,
  onRestack,
}: MembershipRowProps) {
  const t = useT();
  const where =
    shape.container === undefined
      ? t('Directly in World')
      : t('In "{name}"', { name: index.element(shape.container)?.name ?? shape.container });
  const beside = indexed.contentsOf.get(shape.containerShape ?? '') ?? [];
  const rank = drawingRank(indexed, shape);
  let place = 1;
  for (const other of beside) if (drawingRank(indexed, other) < rank) place += 1;
  const { inFront, behind } = stackingNeighbours(indexed, shape);
  const named = (shapes: readonly ElementShape[]) =>
    shapes
      .slice(0, NEIGHBOURS_NAMED)
      .map((each) => `"${each.name}"`)
      .join(', ');

  return (
    <li className="inspector-membership">
      {nests && (
        <div className="inspector-membership-place">
          <span>{where}</span>
          {shape.container === undefined ? (
            <button
              type="button"
              className="inspector-action"
              disabled={!editable}
              onClick={(event) => onChoose(event.currentTarget, 'put')}
            >
              {t('Put inside…')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="inspector-action"
                disabled={!editable}
                onClick={(event) => onTakeOut(event.currentTarget)}
              >
                {t('Take out')}
              </button>
              <button
                type="button"
                className="inspector-action"
                disabled={!editable}
                onClick={(event) => onChoose(event.currentTarget, 'move')}
              >
                {t('Move to…')}
              </button>
            </>
          )}
        </div>
      )}
      <p className="inspector-stacking-place" aria-live="polite">
        {t('{where}: {place} of {count}, from the back', {
          where,
          place: t.ordinal(place),
          count: beside.length,
        })}
      </p>
      {inFront.length > 0 && (
        <p className="inspector-notes">{t('In front of it: {names}', { names: named(inFront) })}</p>
      )}
      {behind.length > 0 && (
        <p className="inspector-notes">{t('Behind it: {names}', { names: named(behind) })}</p>
      )}
      <div className="inspector-stacking" role="group" aria-label={t('Stacking order')}>
        {STACKING_MOVES.map((move) => (
          <button
            key={move}
            type="button"
            className="inspector-action"
            title={stacking[move].description}
            aria-keyshortcuts={STACKING_KEYS[move].keys}
            aria-disabled={stacking[move].enabled ? undefined : true}
            onClick={() => onRestack(move)}
          >
            {t(STACKING_NAMES[move])}
          </button>
        ))}
      </div>
    </li>
  );
}
