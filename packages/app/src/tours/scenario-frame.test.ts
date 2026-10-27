/** Where a scenario a tour's step plays is drawn (ADR 0077). */
import { scenarioTimeline } from '@visual-anything/core';
import type { ScenarioFile, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { Rect } from '../canvas/geometry';
import { buildScene } from '../canvas/scene';
import { highlightOf } from '../scenarios/emphasis';
import { stepBounds } from '../scenarios/follow';
import { loadSample } from '../test/sample';
import { playedBounds, scenarioStepBounds } from './scenario-frame';

const project = loadSample();
const scenario = project.scenarios[0] as ScenarioFile;
const view = project.views.find((each) => each.id === scenario.view) as ViewFile;
const scene = buildScene(project, view.id);

function holds(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x + 1e-9 &&
    outer.y <= inner.y + 1e-9 &&
    outer.x + outer.width >= inner.x + inner.width - 1e-9 &&
    outer.y + outer.height >= inner.y + inner.height - 1e-9
  );
}

describe('playedBounds', () => {
  it('holds every step its range plays, and only those', () => {
    const timeline = scenarioTimeline(project, scenario);
    const all = playedBounds(project, scene, scenario, 0, 2);
    if (!all) throw new Error('The range is drawn nowhere.');
    for (const at of [0, 1, 2]) {
      const entry = timeline.entries[timeline.entryOf[at] ?? -1];
      if (!entry) throw new Error('No entry plays the step.');
      const each = stepBounds(scene, highlightOf(project, view, scene, entry));
      if (each) expect(holds(all, each)).toBe(true);
    }
    const first = playedBounds(project, scene, scenario, 0, 0);
    expect(first).toEqual(scenarioStepBounds(project, scene, scenario, 0));
  });

  it('is nothing for a scenario whose view is gone, or a step it does not have', () => {
    const other = { ...scenario, view: 'gone' };
    expect(playedBounds(project, scene, other, 0, 2)).toBeUndefined();
    expect(scenarioStepBounds(project, scene, scenario, 99)).toBeUndefined();
  });
});
