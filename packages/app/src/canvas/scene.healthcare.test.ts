/**
 * The healthcare sample, "Clinic claim" (ADR 0079, Track P5), as the canvas's scene draws it: it opens
 * with nothing to warn about, every name and detail in its three views is written whole, a claim draws
 * its lines and a care plan its goals as rows that relations end on, its views keep the places the
 * app's layout gives them, its scenario plays a claim to payment or to denial (ADR 0078), and its tour
 * finds nothing to look at.
 */
import { checkProject, checkTour, scenarioTimeline } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { cutOnCanvas } from './hoverCut';
import { layoutCommand } from './layout/command';
import { layOut } from './layout/engine';
import { layoutInput } from './layout/input';
import { inputAfter } from './layout/settle';
import { buildScene, buildSceneAfresh } from './scene';

const project = loadSample('clinic-claim');
const VIEWS = ['care-plan', 'claim-audit', 'claim-journey'];

describe('the healthcare sample', () => {
  it('opens with nothing to warn about, using only the healthcare package', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['healthcare']);
    expect(project.views.map((view) => view.id).sort()).toEqual(VIEWS);
    // Every person and organization in it is invented, and it says so.
    expect(project.project.description).toMatch(/invented/);
  });

  it.each(VIEWS)('writes every name and detail in %s whole', (view) => {
    const scene = buildScene(project, view);
    expect(scene.shapes.length).toBeGreaterThanOrEqual(8);
    for (const shape of scene.shapes) expect(cutOnCanvas(shape), shape.key).toBe(false);
  });

  it('draws the claim’s lines and the care plan’s goals as rows that relations end on', () => {
    const journey = buildScene(project, 'claim-journey');
    const rows = journey.shapes.filter((shape) => shape.row !== undefined).map((each) => each.key);
    expect(rows).toEqual(['claim/line-visit', 'claim/line-mri', 'claim/line-contrast']);
    const denial = journey.relations.find((each) => each.relation === 'harbor-denies-contrast');
    expect(denial?.ends?.to).toEqual({ kind: 'shape', key: 'claim/line-contrast' });
    const care = buildScene(project, 'care-plan');
    const goals = care.shapes.filter((shape) => shape.row !== undefined).map((each) => each.key);
    expect(goals).toEqual(['diabetes-plan/goal-a1c', 'diabetes-plan/goal-walk']);
    const audit = buildScene(project, 'claim-audit');
    const finding = audit.relations.find((each) => each.relation === 'finding-in-contrast-line');
    expect(finding?.ends?.to).toEqual({ kind: 'shape', key: 'claim/line-contrast' });
  });

  it.each(VIEWS)(
    'keeps %s where the app’s layout puts it: laying it out again moves nothing',
    { timeout: 30_000 },
    async (view) => {
      const elk = new ELK();
      const scope = { kind: 'view' } as const;
      const scene = buildSceneAfresh(project, view);
      const input = layoutInput(scene, project, scope);
      if (!input) throw new Error('Nothing to lay out.');
      let result = await layOut(input, elk);
      const again = inputAfter(project, view, scene, scope, input, result.shapes);
      if (again) result = await layOut(again, elk);
      expect(layoutCommand(project, view, scene, scope, result.shapes)).toBeUndefined();
    },
  );

  it('plays the claim from the visit through its authorization to payment, or to denial', () => {
    const scenario = project.scenarios.find((each) => each.id === 'a-claim');
    if (!scenario) throw new Error('No scenario "a-claim".');
    expect(scenario.view).toBe('claim-journey');
    const played = (choices?: Record<string, string>) =>
      scenarioTimeline(project, scenario, undefined, choices).entries.flatMap(
        (entry) => entry.relations,
      );
    const shared = [
      'ortiz-treats-jordan',
      'visit-for-jordan',
      'jordan-covered',
      'ortiz-requests-auth',
      'auth-to-harbor',
      'auth-for-mri',
      'haddad-treats-jordan',
      'appointment-for-jordan',
      'visit-line-bills',
      'mri-line-bills',
      'contrast-line-bills',
      'claim-to-harbor',
    ];
    expect(played()).toEqual([...shared, 'harbor-pays-claim']);
    expect(played({ review: 'contrast-denied' })).toEqual([
      ...shared,
      'harbor-denies-contrast',
      'harbor-pays-claim',
    ]);
  });

  it('has a tour that plays the claim both ways and ends on the audit, with nothing to look at', () => {
    expect(project.tours.map((each) => each.id)).toEqual(['a-claim-and-its-audit']);
    const [tour] = project.tours;
    if (!tour) throw new Error('No tour.');
    expect(checkTour(project, tour).map((each) => each.warnings)).toEqual(tour.steps.map(() => []));
    expect(tour.steps.map((step) => step.play?.choices)).toEqual([
      undefined,
      undefined,
      undefined,
      { review: 'contrast-denied' },
      undefined,
    ]);
    expect(tour.steps.at(-1)?.viewState.view).toBe('claim-audit');
  });
});
