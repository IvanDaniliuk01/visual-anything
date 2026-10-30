/**
 * Layout gives ELK the relations the view draws. A relation whose ends touch, as two tables side by
 * side, draws no line until they move apart, so a first Layout of such a view leaves it out, and a
 * second Layout, which finds it drawn, would arrange the view again. So a Layout of the view or of a
 * container's contents, once its run is done, looks at the view as the run leaves it: when it draws
 * relations the run was not given, the run goes again with them, and its places are the ones stored
 * (ADR 0080's clarification of Stage 3, "Layout twice moves nothing").
 *
 * It is pure: the canvas runs it on the main thread between the two runs, only for runs within the
 * one-pass budget, whose scenes build in a few milliseconds.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { buildSceneAfresh, type Scene } from '../scene';
import { layoutCommand } from './command';
import { layoutInput, type LayoutScope } from './input';
import type { LaidOutShape, LayoutInput } from './types';
import { WHOLE_SHAPES } from './whole';

/**
 * The input of a second run, when the view as `laidOut` leaves it draws relations that `input`, the
 * first run's, was not given; undefined when it gives the same relations, and for layouts that
 * place new shapes or open containers, whose second run would place other shapes.
 */
export function inputAfter(
  project: ProjectSnapshot,
  viewId: Id,
  scene: Scene,
  scope: LayoutScope,
  input: LayoutInput,
  laidOut: readonly LaidOutShape[],
): LayoutInput | undefined {
  if (scope.kind !== 'view' && scope.kind !== 'contents') return undefined;
  if (!input.onePass || input.shapes.length > WHOLE_SHAPES) return undefined;
  const action = layoutCommand(project, viewId, scene, scope, laidOut);
  if (!action) return undefined;
  const done = executeCommand(project, action.command);
  if (!done.ok) return undefined;
  const after = buildSceneAfresh(done.state, viewId);
  const again = layoutInput(after, done.state, scope);
  if (!again) return undefined;
  return sameRelations(input, again) ? undefined : again;
}

/** Whether two inputs relate the same shapes, by their keys, in the same way. */
export function sameRelations(a: LayoutInput, b: LayoutInput): boolean {
  const keysOf = (input: LayoutInput) =>
    new Set(
      input.relations.map(
        (each) =>
          `${each.relation} ${input.shapes[each.from]?.key ?? ''} ${input.shapes[each.to]?.key ?? ''}`,
      ),
    );
  const one = keysOf(a);
  const other = keysOf(b);
  return one.size === other.size && [...one].every((key) => other.has(key));
}
