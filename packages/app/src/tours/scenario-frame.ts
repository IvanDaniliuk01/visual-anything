/**
 * Where the scenario a tour's step plays is drawn (ADR 0077): the rectangle around everything its
 * range plays, which a step without a camera frames once, and around the step playback is on, which
 * a step with a camera brings into view when it falls outside it. Each step holds its relations'
 * lines and the shapes they run between, as playback highlights them (`highlightOf`).
 */
import { entryOfStep, scenarioTimeline, type ProjectSnapshot } from '@visual-anything/core';
import type { DecisionChoices, ScenarioFile } from '@visual-anything/schema';
import type { Rect } from '../canvas/geometry';
import type { Scene } from '../canvas/scene';
import { rectAround } from '../canvas/spatial';
import { highlightOf } from '../scenarios/emphasis';
import { stepBounds } from '../scenarios/follow';

/**
 * The rectangle around what a scenario plays from one of its steps to another, both included, with
 * these choices at its decisions (ADR 0078), in `scene`, the scene of its view; none when its view
 * is gone or the scene draws none of it.
 */
export function playedBounds(
  project: ProjectSnapshot,
  scene: Scene,
  scenario: ScenarioFile,
  from: number,
  to: number,
  choices?: DecisionChoices,
): Rect | undefined {
  const view = project.views.find((each) => each.id === scenario.view);
  if (!view) return undefined;
  const timeline = scenarioTimeline(project, scenario, view, choices);
  const first = entryOfStep(timeline, from);
  const last = entryOfStep(timeline, to);
  if (first === undefined || last === undefined) return undefined;
  const corners: { x: number; y: number }[] = [];
  for (let at = Math.min(first, last); at <= Math.max(first, last); at += 1) {
    const entry = timeline.entries[at];
    const bounds = entry && stepBounds(scene, highlightOf(project, view, scene, entry));
    if (bounds) {
      corners.push(
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      );
    }
  }
  return corners.length === 0 ? undefined : rectAround(corners);
}

/**
 * The rectangle around one step of a scenario, by its index, in the scene of its view, as it plays
 * with these choices.
 */
export function scenarioStepBounds(
  project: ProjectSnapshot,
  scene: Scene,
  scenario: ScenarioFile,
  step: number,
  choices?: DecisionChoices,
): Rect | undefined {
  if (step < 0 || step >= scenario.steps.length) return undefined;
  return playedBounds(project, scene, scenario, step, step, choices);
}
