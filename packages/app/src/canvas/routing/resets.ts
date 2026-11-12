/**
 * Getting back to automatic routes, from the keys (ADR 0092 §1): which lines Reset routes (Alt+Shift+R)
 * and Attach ends automatically act on, the selected ones and those of the selected shapes; which
 * Ctrl+Shift+E selects; and which a dragged box takes with the shapes. Pure, so that each can be
 * tested without a canvas.
 */
import {
  attachEndsCommand,
  resetRoutesCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { isEmpty, type Selection } from '../../editor/selection';
import { t } from '../../i18n';
import type { Rect } from '../geometry';
import type { IndexedScene, Skipped } from '../hit';
import type { RelationLine, Scene } from '../scene';
import { rectAround, within } from '../spatial';

const NOTHING_SKIPPED: Skipped = { has: () => false };

/** The relations a line stands for: its own, or those of an aggregated relation. */
function relationsOf(line: RelationLine): readonly Id[] {
  return line.aggregate ? line.aggregate.relations : [line.relation];
}

/** Whether one of a line's ends is the shape of one of `elements`, or a shape inside one. */
function endsOn(line: RelationLine, elements: ReadonlySet<Id>): boolean {
  for (const which of ['from', 'to'] as const) {
    const end = line.ends?.[which];
    if (end?.kind === 'shape' && end.key.split('/').some((id) => elements.has(id))) return true;
  }
  return false;
}

/** Each id once, in the order first given. */
function once(ids: Iterable<Id>): Id[] {
  return [...new Set(ids)];
}

/**
 * The relations of the lines the canvas draws whose end is a shape of one of `elements`, or a shape
 * inside one; every line's when `elements` is absent. Lines that `hidden` holds, by their line's key,
 * are left out. In the order of the lines.
 */
export function linesOf(
  scene: Scene,
  elements?: ReadonlySet<Id>,
  hidden: Skipped = NOTHING_SKIPPED,
): Id[] {
  return once(
    scene.relations
      .filter(
        (line) => !hidden.has(line.relation) && (elements === undefined || endsOn(line, elements)),
      )
      .flatMap(relationsOf),
  );
}

/** The relations of the lines that lie wholly inside a box, but those `hidden` holds. */
export function linesWithin(
  indexed: IndexedScene,
  box: Rect,
  hidden: Skipped = NOTHING_SKIPPED,
): Id[] {
  const { relations } = indexed.scene;
  const inside = indexed.relations
    .query(box)
    .sort((a, b) => a - b)
    .map((at) => relations[at] as RelationLine)
    .filter(
      (line) =>
        !hidden.has(line.relation) && line.route.length > 0 && within(rectAround(line.route), box),
    );
  return once(inside.flatMap(relationsOf));
}

/**
 * What Reset routes and Attach ends automatically act on: the selected relations, then the lines
 * whose end is a selected shape or lies inside one.
 */
export function resetTargets(scene: Scene, selection: Selection): Id[] {
  const ofShapes = selection.elements.size === 0 ? [] : linesOf(scene, selection.elements);
  return once([...selection.relations, ...ofShapes]);
}

/** Reset routes forgets every choice of the routes; Attach ends automatically only their ends'. */
export type ResetHow = 'routes' | 'ends';

/** What one press of Reset routes or Attach ends automatically sends, or why it sends nothing. */
export type ResetAction = { command: Command; count: number } | { reason: string };

/**
 * Reset routes, or Attach ends automatically, for the selection (ADR 0092 §1): one action on those
 * of `resetTargets` routed by hand, or with an end attached by hand, labelled with their count; with
 * none, why nothing is done.
 */
export function resetAction(
  project: ProjectSnapshot,
  viewId: Id,
  scene: Scene,
  selection: Selection,
  how: ResetHow,
): ResetAction {
  if (isEmpty(selection)) {
    return {
      reason:
        how === 'routes'
          ? t('Select lines, or shapes, to reset their routes.')
          : t('Select lines, or shapes, to attach their ends automatically.'),
    };
  }
  const targets = resetTargets(scene, selection);
  if (targets.length === 0) return { reason: t('The selection has no lines.') };
  const command =
    how === 'routes'
      ? resetRoutesCommand(project, viewId, targets)
      : attachEndsCommand(project, viewId, targets);
  if (command === undefined) {
    return {
      reason:
        how === 'routes'
          ? t('Each of these lines is routed automatically already.')
          : t('Each end of these lines is attached automatically already.'),
    };
  }
  return { command, count: changedBy(command) };
}

/** How many routes a reset or an attaching changes. */
function changedBy(command: Command): number {
  if (command.type === 'reset-route') return command.relations.length;
  if (command.type === 'batch') return command.commands.length;
  return 1;
}

/** What is said once a reset or an attaching is done. */
export function resetDone(how: ResetHow, count: number): string {
  return how === 'routes'
    ? t({ one: 'Reset 1 route.', other: 'Reset {count} routes.' }, { count })
    : t(
        {
          one: 'Attached the ends of 1 line automatically.',
          other: 'Attached the ends of {count} lines automatically.',
        },
        { count },
      );
}
