/**
 * What Claude's scenario and tour tools say and do of the pictures, videos and link cards a step
 * shows (ADR 0098, stage 4), the whole way from an MCP client to the program: the steps they make
 * and change take shows and playing, read_scenario and read_tour give them back, and a step that
 * shows what was deleted since keeps it, listed as gone.
 */
import type { FreeShape } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

const guide: FreeShape = {
  kind: 'link',
  id: 'guide',
  x: 0,
  y: 400,
  width: 320,
  height: 112,
  url: 'https://example.com/guide',
  title: 'The guide',
};
const clip: FreeShape = {
  kind: 'picture',
  id: 'clip',
  x: 400,
  y: 400,
  width: 320,
  height: 180,
  media: { hash: 'c'.repeat(64), format: 'mp4', width: 640, height: 360, bytes: 1000 },
  name: 'Check-in',
};

let tools: ToolHarness;

beforeEach(async () => {
  const project = testProject();
  const [view] = project.views;
  if (view) view.freeShapes.push(guide, clip);
  tools = await startToolHarness(project);
}, 30_000);

afterEach(async () => {
  await tools.close();
});

const scenarioSteps = () => tools.session.snapshot.scenarios[0]?.steps ?? [];

describe('a scenario step’s pictures', () => {
  it('are set by update_scenario’s show, and read back by read_scenario', async () => {
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'show', step: 1, shows: ['guide', 'clip'], playing: ['clip'] }],
    });
    expect(scenarioSteps()[0]).toMatchObject({ shows: ['guide', 'clip'], playing: ['clip'] });
    const read = await tools.value('read_scenario', { scenario: 'request' });
    expect((read.steps as object[])[0]).toMatchObject({
      shows: ['guide', 'clip'],
      playing: ['clip'],
    });
    // Left out, what it plays that it still shows stays; null shows nothing.
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'show', step: 1, shows: ['clip'] }],
    });
    expect(scenarioSteps()[0]).toMatchObject({ shows: ['clip'], playing: ['clip'] });
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'show', step: 1, shows: null }],
    });
    expect(scenarioSteps()[0]?.shows).toBeUndefined();
    expect(scenarioSteps()[0]?.playing).toBeUndefined();
  });

  it('are refused when the view does not hold them, in the core’s words', async () => {
    const said = await tools.failure('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'show', step: 1, shows: ['note'] }],
    });
    expect(said).toContain('"note" is none of them');
  });

  it('are taken by create_scenario_from_steps', async () => {
    const made = await tools.value('create_scenario_from_steps', {
      name: 'With pictures',
      view: 'overview',
      steps: [
        { description: 'It calls.', relations: ['customer-calls-api'], shows: ['guide'] },
        { description: 'It reads.', relations: ['api-reads-db'] },
      ],
    });
    const scenario = tools.session.snapshot.scenarios.find((each) => each.id === made.scenario);
    expect(scenario?.steps[0]?.shows).toEqual(['guide']);
  });

  it('keep a deleted card, listed under missingShows', async () => {
    await tools.value('update_scenario', {
      scenario: 'request',
      edits: [{ op: 'show', step: 1, shows: ['guide', 'clip'] }],
    });
    await tools.value('delete_free_shapes', { view: 'overview', ids: ['guide'] });
    expect(scenarioSteps()[0]?.shows).toEqual(['guide', 'clip']);
    const read = await tools.value('read_scenario', { scenario: 'request' });
    expect((read.steps as object[])[0]).toMatchObject({ missingShows: ['guide'] });
  });
});

describe('a tour step’s pictures', () => {
  it('are taken by add_tour_step, set by update_tour_step and read back by read_tour', async () => {
    const created = await tools.value('create_tour', {
      name: 'Pictures',
      steps: [{ viewState: { view: 'overview' }, title: 'All of it' }],
    });
    const tour = created.tour as string;
    await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'The check-in',
      shows: ['clip', 'guide'],
      playing: ['clip'],
    });
    const steps = () => tools.session.snapshot.tours.find((each) => each.id === tour)?.steps ?? [];
    expect(steps()[1]).toMatchObject({ shows: ['clip', 'guide'], playing: ['clip'] });
    const read = await tools.value('read_tour', { tour });
    expect((read.steps as object[])[1]).toMatchObject({ shows: ['clip', 'guide'] });
    await tools.value('update_tour_step', { tour, step: 2, shows: ['guide'] });
    expect(steps()[1]?.shows).toEqual(['guide']);
    expect(steps()[1]?.playing).toBeUndefined();
    await tools.value('update_tour_step', { tour, step: 2, shows: null });
    expect(steps()[1]?.shows).toBeUndefined();
  });

  it('are refused when the view does not hold them', async () => {
    const said = await tools.failure('create_tour', {
      name: 'Pictures',
      steps: [{ viewState: { view: 'overview' }, title: 'Gone', shows: ['nothing'] }],
    });
    expect(said).toContain('"nothing" is none of them');
  });
});
