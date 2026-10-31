import {
  modelIndexOf,
  nestingTypesInView,
  type ChangeContainerCommand,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Destination, Id } from '@visual-anything/schema';
import { Fragment, useEffect, useId } from 'react';
import type { Selection } from '../editor/selection';
import { useT } from '../i18n';
import type { AlignHow } from './align';
import { ALIGN_GROUPS, ALIGN_NAMES, type AlignAction } from './alignActions';
import type { CollapseAction, CollapseActions } from './collapse';
import './drop.css';
import { putInsideCommand, putInsideTarget, takeOutCommand } from './drop';
import { menuKeyDown, useMenuInsideFrame, useOutsidePress } from './focus';
import type { Point } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';
import { scopeActions, type ScopeAction, type ScopeActions } from './scopeActions';
import { describeDestination, elementDestinations } from '../destinations/follow';
import { STACKING_MOVES, STACKING_NAMES, type StackingAction, type StackingMove } from './stacking';

export interface ShapeMenuProps {
  indexed: IndexedScene;
  project: ProjectSnapshot;
  viewId: Id;
  selection: Selection;
  /** The shape the menu is for. */
  shape: ElementShape;
  /** Where it opens, on screen relative to the canvas. */
  at: Point;
  /**
   * The shapes under the pointer where it was opened (`shapesAt`), topmost first; absent when it was
   * opened from the keyboard.
   */
  under?: readonly ElementShape[];
  /** The stacking items' states, as the toolbar shows them (`stackingActions`). */
  stacking: Record<StackingMove, StackingAction>;
  /** Whether the project can be changed; the items that put the shape elsewhere are off while not. */
  editable: boolean;
  /** Called on every press of a stacking item, also of one that would change nothing, to say why. */
  onRestack: (move: StackingMove) => void;
  /** Put inside "T", Move into "T" or Take out of "A": the change of container to confirm and send. */
  onChange: (change: ChangeContainerCommand) => void;
  /** Put inside… (`put`, for a shape directly in World) or Move to… (`move`): opens the chooser. */
  onChooseContainer: (mode: 'put' | 'move') => void;
  /** Add inside "X"…: the next element added goes inside this element. */
  onAddInside: (element: Id) => void;
  /** Select "S", from the shapes under the pointer. */
  onSelectShape: (shape: ElementShape) => void;
  onClose: () => void;
  /** What collapsing and expanding offer for the selection (`collapseActions`). */
  collapse?: CollapseActions;
  /** Collapse "X" or Expand "X", for the selected containers, through I1's command. */
  onCollapse?: (action: CollapseAction, collapsed: boolean) => void;
  /** Leave out of this view, or Add to this view, as `scopeActions` offers them (ADR-0040). */
  onScope?: (action: ScopeAction) => void;
  /** Follow "D", for each destination of the shape's element (ADR 0056). */
  onFollow?: (destination: Destination) => void;
  /**
   * Align's items' states for a selection of two shapes or more (`alignActions`, ADR 0074), and what
   * pressing one does; absent, the menu has no aligning.
   */
  align?: Readonly<Record<AlignHow, AlignAction>>;
  onAlign?: (how: AlignHow) => void;
  /**
   * For a shape whose solid can be turned (ADR 0075): whether it turns now, and how many animations
   * Play offers while it does, none under reduced motion; and what Turn, Stop turning, Use this view,
   * Play and Pause do.
   */
  solid?: { turning: boolean; animations: number; playing: boolean };
  onTurn?: () => void;
  onEndTurning?: () => void;
  onUseThisView?: () => void;
  onPlay?: (on: boolean) => void;
  /**
   * Show in physical space (ADR 0076), and what it does for the shape's element: opens the
   * physical-space panel showing it, or frames it there when it is in physical space under World
   * (`frames`). Absent where there is no panel, as in the read-only page for now.
   */
  showInSpace?: { frames: boolean };
  onShowInSpace?: () => void;
}

/** How many of the other shapes under the pointer the menu lists. */
const UNDER_LISTED = 8;

const NOT_EDITABLE = 'The project cannot be changed now.';

/**
 * The menu of a shape, opened with a secondary press, Shift+F10 or the menu key: its stacking order;
 * for a single element in a view that nests, putting it inside a container, taking it out of its own,
 * and adding inside it; and, opened with the pointer, the shapes under the pointer, so that a covered
 * one can be selected. The arrow keys, Home and End move through it, Enter presses an item, and Escape
 * or a press outside it closes it.
 */
export function ShapeMenu({
  indexed,
  project,
  viewId,
  selection,
  shape,
  at,
  under,
  stacking,
  editable,
  onRestack,
  onChange,
  onChooseContainer,
  onAddInside,
  onSelectShape,
  onClose,
  collapse,
  onCollapse,
  onScope,
  onFollow,
  align,
  onAlign,
  solid,
  onTurn,
  onEndTurning,
  onUseThisView,
  onPlay,
  showInSpace,
  onShowInSpace,
}: ShapeMenuProps) {
  const t = useT();
  const menu = useMenuInsideFrame<HTMLDivElement>(at);
  const underId = useId();
  useOutsidePress(menu, onClose);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  const view = project.views.find((each) => each.id === viewId);
  const containment =
    view !== undefined &&
    nestingTypesInView(project, view).length > 0 &&
    selection.elements.size === 1 &&
    selection.elements.has(shape.element);
  const fromWorld = shape.container === undefined;
  const target = containment ? putInsideTarget(indexed, project, viewId, shape) : undefined;
  const memberships = new Set(
    (indexed.byElement.get(shape.element) ?? []).map((each) => each.container ?? ''),
  );
  const takeOutOf =
    containment && memberships.size === 1 && shape.container !== undefined
      ? (modelIndexOf(project).element(shape.container)?.name ?? shape.container)
      : undefined;
  const others = (under ?? []).filter((each) => each.key !== shape.key).slice(0, UNDER_LISTED);
  const scope = onScope ? scopeActions(project, viewId, selection, shape.element) : {};
  const destinations = onFollow
    ? elementDestinations(project, modelIndexOf(project).element(shape.element))
    : [];
  const change = (make: () => ChangeContainerCommand | undefined) => () => {
    const made = make();
    if (made) onChange(made);
  };

  return (
    <div
      ref={menu}
      className="canvas-menu"
      role="menu"
      aria-label={shape.name}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        else menuKeyDown(event);
      }}
      // The menu key and Shift+F10 open it before their `contextmenu` event comes, which then comes
      // to it, where the browser's own menu would open over it.
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="canvas-menu-title" aria-hidden="true">
        {shape.name}
      </p>
      {onFollow && destinations.length > 0 && (
        <>
          {destinations.map(({ attribute, destination }) => (
            <Item
              key={attribute}
              label={t('Follow “{name}”', { name: attribute })}
              title={t('Opens {what}', {
                what: describeDestination(t, project, destination),
              })}
              onPress={() => onFollow(destination)}
            />
          ))}
          <div role="separator" className="canvas-menu-separator" />
        </>
      )}
      {solid && (
        <>
          {solid.turning ? (
            <>
              {onUseThisView && (
                <Item
                  label={t('Use this view')}
                  title={t('Keeps where its solid is seen from, in its appearance.')}
                  readOnly={!editable}
                  onPress={onUseThisView}
                />
              )}
              {onPlay && solid.animations > 0 && (
                <Item
                  label={solid.playing ? t('Pause') : t('Play')}
                  onPress={() => onPlay(!solid.playing)}
                />
              )}
              {onEndTurning && (
                <Item label={t('Stop turning')} title={t('Escape')} onPress={onEndTurning} />
              )}
            </>
          ) : (
            onTurn && (
              <Item
                label={t('Turn')}
                title={t('Turns its solid live, by the pointer or the arrow keys. T')}
                onPress={onTurn}
              />
            )
          )}
          <div role="separator" className="canvas-menu-separator" />
        </>
      )}
      {showInSpace && onShowInSpace && (
        <>
          <Item
            label={t('Show in physical space')}
            title={
              showInSpace.frames
                ? t('Frames it in the physical-space panel, where it is in World.')
                : t(
                    'Opens the physical-space panel showing it, with what is posed or anchored in it.',
                  )
            }
            onPress={onShowInSpace}
          />
          <div role="separator" className="canvas-menu-separator" />
        </>
      )}
      {STACKING_MOVES.map((move) => (
        <Item
          key={move}
          label={t(STACKING_NAMES[move])}
          title={stacking[move].description}
          disabled={!stacking[move].enabled}
          onPress={() => onRestack(move)}
        />
      ))}
      {align &&
        onAlign &&
        ALIGN_GROUPS.map((group) => (
          <Fragment key={group.join()}>
            <div role="separator" className="canvas-menu-separator" />
            {group.map((how) => (
              <Item
                key={how}
                label={t(ALIGN_NAMES[how])}
                title={align[how].description}
                disabled={!align[how].enabled}
                onPress={() => onAlign(how)}
              />
            ))}
          </Fragment>
        ))}
      {onCollapse && (collapse?.collapse || collapse?.expand) && (
        <>
          <div role="separator" className="canvas-menu-separator" />
          {collapse.collapse && (
            <Item
              label={t.message(collapse.collapse.label)}
              title={t(
                'Draws none of what it holds; their relations become aggregated relations. Alt+−',
              )}
              readOnly={!editable}
              onPress={() => onCollapse(collapse.collapse as CollapseAction, true)}
            />
          )}
          {collapse.expand && (
            <Item
              label={t.message(collapse.expand.label)}
              title={t('Draws again what it holds. Alt++')}
              readOnly={!editable}
              onPress={() => onCollapse(collapse.expand as CollapseAction, false)}
            />
          )}
        </>
      )}
      {containment && (
        <>
          <div role="separator" className="canvas-menu-separator" />
          {target && (
            <Item
              label={
                fromWorld
                  ? t('Put inside "{target}"', { target: target.name })
                  : t('Move into "{target}"', { target: target.name })
              }
              readOnly={!editable}
              onPress={change(() => putInsideCommand(indexed, project, viewId, shape, target))}
            />
          )}
          <Item
            label={fromWorld ? t('Put inside…') : t('Move to…')}
            readOnly={!editable}
            onPress={() => onChooseContainer(fromWorld ? 'put' : 'move')}
          />
          {takeOutOf !== undefined && (
            <Item
              label={t('Take out of "{from}"', { from: takeOutOf })}
              readOnly={!editable}
              onPress={change(() => takeOutCommand(indexed, project, viewId, shape))}
            />
          )}
          <Item
            label={t('Add inside "{name}"…', { name: shape.name })}
            readOnly={!editable}
            onPress={() => onAddInside(shape.element)}
          />
        </>
      )}
      {onScope && (scope.leaveOut || scope.add) && (
        <ScopeItems scope={scope} editable={editable} onScope={onScope} />
      )}
      {others.length > 0 && (
        <>
          <div role="separator" className="canvas-menu-separator" />
          <div role="group" aria-labelledby={underId}>
            <p id={underId} className="canvas-menu-title">
              {t('Under the pointer')}
            </p>
            {others.map((other) => (
              <Item
                key={other.key}
                label={t('Select "{name}"', { name: other.name })}
                onPress={() => onSelectShape(other)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Leave out of this view and Add to this view (ADR-0040), after a separator. */
function ScopeItems({
  scope,
  editable,
  onScope,
}: {
  scope: ScopeActions;
  editable: boolean;
  onScope: (action: ScopeAction) => void;
}) {
  const t = useT();
  const { leaveOut, add } = scope;
  return (
    <>
      <div role="separator" className="canvas-menu-separator" />
      {leaveOut && (
        <Item
          label={leaveOut.label}
          title={t('Deletes nothing: it stays in the model and in the other views.')}
          readOnly={!editable}
          onPress={() => onScope(leaveOut)}
        />
      )}
      {add && (
        <Item
          label={add.label}
          title={t('Brings in the far ends of the relations that leave this view from it.')}
          readOnly={!editable}
          onPress={() => onScope(add)}
        />
      )}
    </>
  );
}

/**
 * One item. A `disabled` one is pressed all the same, to say why it changes nothing; a `readOnly` one,
 * while the project cannot be changed, does nothing.
 */
function Item({
  label,
  title,
  disabled = false,
  readOnly = false,
  onPress,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      title={readOnly ? t(NOT_EDITABLE) : title}
      aria-disabled={disabled || readOnly ? true : undefined}
      onClick={readOnly ? undefined : onPress}
    >
      {label}
    </button>
  );
}
