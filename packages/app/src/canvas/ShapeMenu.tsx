import {
  modelIndexOf,
  nestingTypesInView,
  type ChangeContainerCommand,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useId } from 'react';
import type { Selection } from '../editor/selection';
import './drop.css';
import { putInsideCommand, putInsideTarget, takeOutCommand } from './drop';
import { menuKeyDown, useMenuInsideFrame, useOutsidePress } from './focus';
import type { Point } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape } from './scene';
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
}: ShapeMenuProps) {
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
      {STACKING_MOVES.map((move) => (
        <Item
          key={move}
          label={STACKING_NAMES[move]}
          title={stacking[move].description}
          disabled={!stacking[move].enabled}
          onPress={() => onRestack(move)}
        />
      ))}
      {containment && (
        <>
          <div role="separator" className="canvas-menu-separator" />
          {target && (
            <Item
              label={fromWorld ? `Put inside "${target.name}"` : `Move into "${target.name}"`}
              readOnly={!editable}
              onPress={change(() => putInsideCommand(indexed, project, viewId, shape, target))}
            />
          )}
          <Item
            label={fromWorld ? 'Put inside…' : 'Move to…'}
            readOnly={!editable}
            onPress={() => onChooseContainer(fromWorld ? 'put' : 'move')}
          />
          {takeOutOf !== undefined && (
            <Item
              label={`Take out of "${takeOutOf}"`}
              readOnly={!editable}
              onPress={change(() => takeOutCommand(indexed, project, viewId, shape))}
            />
          )}
          <Item
            label={`Add inside "${shape.name}"…`}
            readOnly={!editable}
            onPress={() => onAddInside(shape.element)}
          />
        </>
      )}
      {others.length > 0 && (
        <>
          <div role="separator" className="canvas-menu-separator" />
          <div role="group" aria-labelledby={underId}>
            <p id={underId} className="canvas-menu-title">
              Under the pointer
            </p>
            {others.map((other) => (
              <Item
                key={other.key}
                label={`Select "${other.name}"`}
                onPress={() => onSelectShape(other)}
              />
            ))}
          </div>
        </>
      )}
    </div>
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
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      title={readOnly ? NOT_EDITABLE : title}
      aria-disabled={disabled || readOnly ? true : undefined}
      onClick={readOnly ? undefined : onPress}
    >
      {label}
    </button>
  );
}
