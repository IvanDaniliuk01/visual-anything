/**
 * The tour editor's "Use the joints' positions here" (ADR 0090): a step's joints' positions
 * (`space.joints`) taken from the physical-space panel of the step's view as it shows them now, each
 * joint it shows at the position it is drawn at: the one the panel's state gives (a slider, a tour's
 * step or an address), else the one a simulation shown answers, else its stored one. Nothing else of
 * the step changes. It cannot be done, and says why, while the step does not show the panel, while
 * the panel of its view is closed, or while it shows no joints.
 */
import {
  MAX_VIEW_STATE_JOINTS,
  spaceOf,
  type ProjectSnapshot,
  type ViewSpace,
} from '@visual-anything/core';
import type { Id, TourStep } from '@visual-anything/schema';
import { jointsShown, positionOf, positionsOfSaved, type JointPositions } from '../space/joints';

/** Why a step cannot take the panel's joints' positions, in English, for the translator. */
export const STEP_SHOWS_NO_PANEL =
  'This step does not show the physical-space panel: take the canvas with the panel open first.';
export const PANEL_CLOSED =
  'Open the physical-space panel of “{view}” to take its joints’ positions.';
export const PANEL_SHOWS_NO_JOINTS = 'The physical-space panel shows no joints.';

export type StepJoints =
  | { ok: true; joints: Record<Id, number>; count: number }
  | { ok: false; reason: string; view?: string };

/**
 * The positions a step would take from its view's panel, `panel` being what that panel shows (none
 * while it is closed) and `simulated` the positions the simulations shown answer.
 */
export function stepJointsFrom(
  project: ProjectSnapshot,
  step: TourStep,
  panel: ViewSpace | undefined,
  simulated: JointPositions,
): StepJoints {
  if (step.viewState.space === undefined) return { ok: false, reason: STEP_SHOWS_NO_PANEL };
  const view = project.views.find((each) => each.id === step.viewState.view);
  if (!view) return { ok: false, reason: PANEL_SHOWS_NO_JOINTS };
  if (!panel) return { ok: false, reason: PANEL_CLOSED, view: view.name };
  const shown = jointsShown(project, spaceOf(project, view, panel.root)).slice(
    0,
    MAX_VIEW_STATE_JOINTS,
  );
  if (shown.length === 0) return { ok: false, reason: PANEL_SHOWS_NO_JOINTS };
  const given = positionsOfSaved(panel.joints);
  const positions: JointPositions =
    simulated.size === 0 ? given : new Map([...simulated, ...given]);
  const joints: Record<Id, number> = {};
  for (const joint of shown) joints[joint.element] = positionOf(joint, positions);
  return { ok: true, joints, count: shown.length };
}

/** The step with the joints' positions given, and nothing else of it changed. */
export function withStepJoints(step: TourStep, joints: Record<Id, number>): TourStep {
  return { ...step, viewState: { ...step.viewState, space: { ...step.viewState.space, joints } } };
}
