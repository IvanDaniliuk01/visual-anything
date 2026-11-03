// @vitest-environment node
/**
 * The tour editor's "Use the joints' positions here" (ADR 0090), on the robot-arm sample: a step
 * takes each joint its view's panel shows at the position drawn, the panel's own over a simulation's
 * over the stored one, and nothing else of the step changes; it says why when it cannot.
 */
import type { TourStep } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  PANEL_CLOSED,
  PANEL_SHOWS_NO_JOINTS,
  STEP_SHOWS_NO_PANEL,
  stepJointsFrom,
  withStepJoints,
} from './step-joints';

const project = loadSample('robot-arm');
const NONE = new Map<string, number>();
const step: TourStep = {
  id: 'reach',
  viewState: { view: 'workcell', space: { names: true } },
  caption: { title: 'Reach' },
};

describe('a step’s joints taken from the panel', () => {
  it('takes every joint the panel shows, at the position it is drawn at', () => {
    const taken = stepJointsFrom(
      project,
      step,
      { joints: { 'joint-2': 30 } },
      new Map([
        ['joint-2', 5],
        ['joint-3', -12],
      ]),
    );
    expect(taken).toEqual({
      ok: true,
      count: 6,
      joints: {
        'joint-1': 0,
        'joint-2': 30,
        'joint-3': -12,
        'joint-4': 0,
        'joint-5': 0,
        'joint-6': 0,
      },
    });
  });

  it('changes nothing of the step but its joints’ positions', () => {
    const next = withStepJoints(step, { 'joint-1': 10 });
    expect(next).toEqual({
      ...step,
      viewState: { view: 'workcell', space: { names: true, joints: { 'joint-1': 10 } } },
    });
  });

  it('says why it cannot: no panel in the step, the panel closed, or no joints shown', () => {
    const bare: TourStep = { ...step, viewState: { view: 'workcell' } };
    expect(stepJointsFrom(project, bare, {}, NONE)).toEqual({
      ok: false,
      reason: STEP_SHOWS_NO_PANEL,
    });
    expect(stepJointsFrom(project, step, undefined, NONE)).toEqual({
      ok: false,
      reason: PANEL_CLOSED,
      view: 'Workcell',
    });
    // Shown alone, the workpiece holds no joint.
    expect(stepJointsFrom(project, step, { root: 'workpiece' }, NONE)).toEqual({
      ok: false,
      reason: PANEL_SHOWS_NO_JOINTS,
    });
  });
});
