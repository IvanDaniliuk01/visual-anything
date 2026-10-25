/**
 * What the canvas's keys do on rows (ADR 0023). Pure, so that the controller only asks.
 *
 * - Shift+Up and Shift+Down move a row among its container's rows, in the model's order, since a row
 *   has no position to nudge; Shift+Left and Shift+Right do nothing on a row.
 * - Ctrl+Enter (⌘Enter) on a row adds one below it, and on a shape that draws rows adds one at its end.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { IndexedScene } from './hit';
import { moveRowCommand } from './rowCommands';
import type { ElementShape } from './scene';

/**
 * What Shift with an arrow key does on a shape: `handled` when it is a row, with the command that
 * moves it up or down, or none at the top, at the bottom, or to the left or the right.
 */
export function rowMoveFor(
  project: ProjectSnapshot,
  viewId: Id,
  shape: ElementShape,
  direction: 'up' | 'down' | 'left' | 'right',
): { handled: boolean; command?: Command } {
  if (shape.row === undefined || shape.container === undefined) return { handled: false };
  if (direction === 'left' || direction === 'right') return { handled: true };
  const view = project.views.find((each) => each.id === viewId);
  const command = view && moveRowCommand(project, view, shape.container, shape.element, direction);
  return command ? { handled: true, command } : { handled: true };
}

/**
 * Where Ctrl+Enter adds a row from a shape: below a row, in its container's shape, or at the end of a
 * shape that draws rows; nowhere from any other shape.
 */
export function rowTargetFor(
  indexed: IndexedScene,
  shape: ElementShape,
): { container: ElementShape; below?: Id } | undefined {
  if (shape.rowCount !== undefined) return { container: shape };
  if (shape.row === undefined || shape.containerShape === undefined) return undefined;
  const container = indexed.byKey.get(shape.containerShape);
  return container ? { container, below: shape.element } : undefined;
}
