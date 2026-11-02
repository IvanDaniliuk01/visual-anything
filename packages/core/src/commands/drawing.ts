/**
 * The drawing defaults of the project or of one view (ADR 0086), set whole as one action: what it
 * gives replaces what was there, and `null` goes back to the preset as built in, or to the project's
 * for a view. Every value is checked against the schema's ranges and choices as it arrives.
 */
import type { DrawingDefaults } from '@visual-anything/schema';
import { compactDrawing, drawingProblems } from '../drawing';
import { reject, sameJson, type Draft } from './draft';
import type { SetDrawingDefaultsCommand } from './types';
import { viewProperties } from './views';

export function setDrawingDefaults(draft: Draft, command: SetDrawingDefaultsCommand): string {
  const given = command.drawing === null ? undefined : checked(command.drawing);
  if (command.view === undefined) {
    const next = { ...draft.state.project };
    if (given === undefined) delete next.drawing;
    else next.drawing = given;
    if (!sameJson(next.drawing, draft.state.project.drawing)) {
      draft.apply({ op: 'set-project', project: next });
    }
    return given === undefined
      ? 'Reset the drawing defaults of the project'
      : 'Set the drawing defaults of the project';
  }
  const view = draft.view(command.view);
  const properties = viewProperties(view);
  if (given === undefined) delete properties.drawing;
  else properties.drawing = given;
  if (!sameJson(properties.drawing, view.drawing)) {
    draft.apply({ op: 'set-view', view: view.id, properties });
  }
  return given === undefined
    ? `Reset the drawing defaults of "${view.name}"`
    : `Set the drawing defaults of "${view.name}"`;
}

function checked(drawing: unknown): DrawingDefaults | undefined {
  const problems = drawingProblems(drawing);
  if (problems.length > 0) reject('invalid-drawing', problems.join(' '));
  return compactDrawing(drawing as DrawingDefaults);
}
