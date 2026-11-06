import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '@visual-anything/core';
import { filesIn, testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const tourNamed = (name: string) => tools.session.snapshot.tours.find((each) => each.name === name);

/** A tour of two steps, made as Claude makes it; its id. */
async function walk(): Promise<string> {
  const created = await tools.value('create_tour', {
    name: 'Checkout',
    steps: [
      { viewState: { view: 'overview' }, title: 'The shop' },
      {
        viewState: { view: 'overview', select: ['api'], focus: { degrees: 1 } },
        title: 'The API',
        text: 'It answers the customer.',
        marks: ['api', 'api-reads-db'],
        play: { scenario: 'request', from: 1, to: 2 },
        notes: 'Mention the cache.',
      },
    ],
  });
  return created.tour as string;
}

describe('create_tour', () => {
  it('creates a tour from its steps as one action of Claude’s, view states as get_view_address takes them', async () => {
    const created = await tools.value('create_tour', {
      name: 'Checkout',
      description: 'From the customer to the database.',
      steps: [
        {
          viewState: { view: 'overview' },
          title: 'The shop',
          text: 'Two parts:\n\n- the API\n- the DB',
        },
        {
          viewState: {
            view: 'overview',
            select: ['api'],
            filters: { components: ['systems.person'] },
            focus: { degrees: 2, direction: 'outgoing' },
            scenario: 'request',
            step: 2,
          },
          title: 'The API',
          marks: ['api'],
          play: { scenario: 'request', from: 1, to: 'read' },
          notes: 'Say it is small.',
        },
      ],
    });
    expect(created).toMatchObject({
      done: 'Create the tour "Checkout"',
      undo: 'The person can undo it in the app.',
      steps: 2,
    });
    const tour = tourNamed('Checkout');
    expect(created.tour).toBe(tour?.id);
    expect(tour).toMatchObject({
      description: 'From the customer to the database.',
      steps: [
        {
          viewState: { view: 'overview' },
          caption: { title: 'The shop', text: 'Two parts:\n\n- the API\n- the DB' },
        },
        {
          viewState: {
            view: 'overview',
            select: ['api'],
            filters: { components: ['systems.person'] },
            focus: { degrees: 2, direction: 'outgoing' },
            scenario: 'request',
            step: 'read',
          },
          caption: { title: 'The API' },
          marks: ['api'],
          play: { scenario: 'request', from: 'call', to: 'read' },
          notes: 'Say it is small.',
        },
      ],
    });
    expect(tools.session.history.undo).toEqual({
      label: 'Create the tour "Checkout"',
      author: 'claude',
    });
    expect(await tools.value('get_project')).toMatchObject({
      tours: [{ id: tour?.id, name: 'Checkout', steps: 2, brokenSteps: 0 }],
    });
  });

  it('refuses a view state the project does not hold, and what the core refuses, changing nothing', async () => {
    expect(
      await tools.failure('create_tour', {
        name: 'T',
        steps: [{ viewState: { view: 'nowhere' }, title: 'T' }],
      }),
    ).toBe(
      'Not created: step 1: The project has no view "nowhere". Use the ids the read tools give.',
    );
    expect(
      await tools.failure('create_tour', {
        name: 'T',
        steps: [{ viewState: { view: 'overview' }, title: 'T', marks: ['nothing'] }],
      }),
    ).toBe(
      'Refused, so nothing changed: Step 1 of the tour: A step marks elements, relations, notes and arrows of its view, and "nothing" is none of them. (unknown-element)',
    );
    expect(
      await tools.failure('create_tour', {
        name: 'T',
        steps: [
          { viewState: { view: 'overview' }, title: 'T', play: { scenario: 'request', to: 9 } },
        ],
      }),
    ).toBe('Not created: step 1: The scenario "A request" has 2 steps.');
    expect(tools.session.snapshot.tours).toEqual([]);
    expect(tools.session.history).toEqual({});
  });
});

describe('add_tour_step, update_tour_step and remove_tour_step', () => {
  it('add a step last or at a number, each as one action', async () => {
    const tour = await walk();
    expect(
      await tools.value('add_tour_step', {
        tour,
        viewState: { view: 'overview', select: ['db'] },
        title: 'The DB',
      }),
    ).toMatchObject({ done: 'Add a step to the tour "Checkout"', number: 3, of: 3 });
    expect(
      await tools.value('add_tour_step', {
        tour,
        at: 1,
        viewState: { view: 'overview' },
        title: 'Start',
      }),
    ).toMatchObject({ number: 1, of: 4 });
    expect(tourNamed('Checkout')?.steps.map((step) => step.caption.title)).toEqual([
      'Start',
      'The shop',
      'The API',
      'The DB',
    ]);
  });

  it('change only what is given, take away what is null, and move a step', async () => {
    const tour = await walk();
    const changed = await tools.value('update_tour_step', {
      tour,
      step: 2,
      text: 'It answers fast.',
      marks: null,
      notes: null,
      moveTo: 1,
    });
    expect(changed).toMatchObject({ done: 'Edit the tour "Checkout"', number: 1 });
    const [first, second] = tourNamed('Checkout')?.steps ?? [];
    expect(first).toMatchObject({
      caption: { title: 'The API', text: 'It answers fast.' },
      viewState: { view: 'overview', select: ['api'] },
      play: { scenario: 'request' },
    });
    expect(first?.marks).toBeUndefined();
    expect(first?.notes).toBeUndefined();
    expect(second?.caption.title).toBe('The shop');

    await tools.value('update_tour_step', {
      tour,
      step: first?.id,
      viewState: { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } },
      play: null,
    });
    expect(tourNamed('Checkout')?.steps[0]).toMatchObject({
      viewState: { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } },
    });
    expect(tourNamed('Checkout')?.steps[0]?.play).toBeUndefined();
  });

  it('add a step that reveals, dims the rest, places its caption and advances, as the file keeps it', async () => {
    const tour = await walk();
    const added = await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'Who reads',
      text: 'First the customer.',
      marks: ['customer'],
      reveal: [
        { marks: ['api'], text: 'Then the API.' },
        { marks: ['db', 'api-reads-db'], text: '' },
      ],
      dimRest: true,
      place: 'top-right',
      advance: 4000,
    });
    expect(added).toMatchObject({
      done: 'Add a step to the tour "Checkout"',
      number: 3,
      check: { camera: 'fit' },
    });
    expect(tourNamed('Checkout')?.steps[2]).toEqual({
      id: added.step,
      viewState: { view: 'overview' },
      caption: { title: 'Who reads', text: 'First the customer.', place: 'top-right' },
      marks: ['customer'],
      reveal: [{ marks: ['api'], text: 'Then the API.' }, { marks: ['db', 'api-reads-db'] }],
      dimRest: true,
      advance: 4000,
    });
  });

  it('write none of the new keys with their defaults, so a step that uses none stays as it was', async () => {
    const tour = await walk();
    await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'Plain',
      reveal: [],
      dimRest: false,
      place: 'auto',
    });
    expect(tourNamed('Checkout')?.steps[2]).toEqual({
      id: tourNamed('Checkout')?.steps[2]?.id,
      viewState: { view: 'overview' },
      caption: { title: 'Plain' },
    });
  });

  it('change reveals, dimming, the caption’s place and advancing, and take each away', async () => {
    const tour = await walk();
    await tools.value('update_tour_step', {
      tour,
      step: 2,
      reveal: [{ marks: ['db'] }],
      dimRest: true,
      place: 'bottom-left',
      advance: 'after-scenario',
    });
    expect(tourNamed('Checkout')?.steps[1]).toMatchObject({
      caption: { title: 'The API', place: 'bottom-left' },
      reveal: [{ marks: ['db'] }],
      dimRest: true,
      advance: 'after-scenario',
    });
    const changed = await tools.value('update_tour_step', {
      tour,
      step: 2,
      reveal: null,
      dimRest: false,
      place: 'auto',
      advance: null,
    });
    expect(changed).toMatchObject({ check: { camera: 'fit' } });
    const step = tourNamed('Checkout')?.steps[1];
    expect(step?.caption).toEqual({ title: 'The API', text: 'It answers the customer.' });
    expect(step).not.toHaveProperty('reveal');
    expect(step).not.toHaveProperty('dimRest');
    expect(step).not.toHaveProperty('advance');
  });

  it('sets how a tour and its steps mark what they mark, the tour’s default never written (ADR 0100)', async () => {
    const created = await tools.value('create_tour', {
      name: 'Restyled',
      emphasis: 'style',
      steps: [
        { viewState: { view: 'overview' }, title: 'Plain', marks: ['api-reads-db'] },
        {
          viewState: { view: 'overview' },
          title: 'Haloed',
          marks: ['api-reads-db'],
          emphasis: 'halo',
        },
      ],
    });
    const tour = created.tour as string;
    expect(tourNamed('Restyled')?.emphasis).toBe('style');
    expect(tourNamed('Restyled')?.steps.map((step) => step.emphasis)).toEqual([undefined, 'halo']);
    await tools.value('update_tour_step', { tour, step: 1, emphasis: 'style' });
    await tools.value('update_tour_step', { tour, step: 2, emphasis: null });
    expect(tourNamed('Restyled')?.steps.map((step) => step.emphasis)).toEqual(['style', undefined]);
    await tools.value('update_tour', { tour, emphasis: 'halo' });
    expect(tourNamed('Restyled')).not.toHaveProperty('emphasis');
    const read = await tools.value('read_tour', { tour });
    expect(read).toMatchObject({ emphasis: 'halo', steps: [{ emphasis: 'style' }, {}] });
    const checked = await tools.value('check_tour', { tour });
    expect(checked).toMatchObject({ tour, steps: [{ number: 1 }, { number: 2 }] });
  });

  it('accepts and returns the view a step shows beside it, and takes it away (ADR 0102)', async () => {
    const created = await tools.value('create_tour', {
      name: 'Side by side',
      steps: [
        {
          viewState: { view: 'overview' },
          beside: { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } },
          title: 'Where it is kept',
        },
      ],
    });
    const tour = created.tour as string;
    expect(tourNamed('Side by side')?.steps[0]?.beside).toEqual({
      view: 'overview',
      camera: { x: 10, y: 20, zoom: 2 },
    });
    const added = await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      beside: { view: 'overview' },
      title: 'Around it',
    });
    expect(added).toMatchObject({ number: 2 });
    expect(tourNamed('Side by side')?.steps[1]?.beside).toEqual({ view: 'overview' });
    const read = await tools.value('read_tour', { tour });
    expect(read).toMatchObject({
      steps: [
        { beside: { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } } },
        { beside: { view: 'overview' } },
      ],
    });
    // Changing one step sends the whole list again: the others keep what they show beside them.
    await tools.value('update_tour_step', { tour, step: 2, text: 'Around it, still.' });
    expect(tourNamed('Side by side')?.steps[0]?.beside).toEqual({
      view: 'overview',
      camera: { x: 10, y: 20, zoom: 2 },
    });
    // Moving and removing a step replace the whole list of steps: each keeps its own view beside it.
    await tools.value('update_tour_step', { tour, step: 2, moveTo: 1 });
    expect(tourNamed('Side by side')?.steps.map((each) => each.beside)).toEqual([
      { view: 'overview' },
      { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } },
    ]);
    await tools.value('add_tour_step', { tour, viewState: { view: 'overview' }, title: 'Plain' });
    await tools.value('remove_tour_step', { tour, step: 1 });
    expect(tourNamed('Side by side')?.steps.map((each) => each.beside)).toEqual([
      { view: 'overview', camera: { x: 10, y: 20, zoom: 2 } },
      undefined,
    ]);
    await tools.value('update_tour_step', { tour, step: 1, beside: { view: 'overview' } });
    expect(tourNamed('Side by side')?.steps[0]?.beside).toEqual({ view: 'overview' });
    await tools.value('update_tour_step', { tour, step: 2, beside: { view: 'overview' } });
    await tools.value('update_tour_step', { tour, step: 2, beside: null });
    expect(tourNamed('Side by side')?.steps[1]).not.toHaveProperty('beside');
    expect(
      await tools.failure('add_tour_step', {
        tour,
        viewState: { view: 'overview' },
        beside: { view: 'gone' },
        title: 'X',
      }),
    ).toMatch(/^Not added: Beside it: /);
    expect(
      await tools.failure('update_tour_step', { tour, step: 1, beside: { view: 'gone' } }),
    ).toMatch(/^Not changed: Beside it: /);
  });

  it('add and change a caption that points, a pulse and a cut, never writing their defaults (ADR 0084)', async () => {
    const tour = await walk();
    const added = await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'Who reads',
      marks: ['api', 'api-reads-db'],
      pointTo: 'api-reads-db',
      pulse: { relations: ['customer-calls-api', 'api-reads-db'], repeat: 2 },
      transition: 'cut',
    });
    expect(tourNamed('Checkout')?.steps[2]).toEqual({
      id: added.step,
      viewState: { view: 'overview' },
      caption: { title: 'Who reads', pointTo: 'api-reads-db' },
      marks: ['api', 'api-reads-db'],
      transition: 'cut',
      pulse: { relations: ['customer-calls-api', 'api-reads-db'], repeat: 2 },
    });
    await tools.value('update_tour_step', {
      tour,
      step: 3,
      pulse: { relations: ['api-reads-db'], repeat: 1 },
      transition: 'glide',
    });
    expect(tourNamed('Checkout')?.steps[2]).toMatchObject({
      pulse: { relations: ['api-reads-db'] },
    });
    expect(tourNamed('Checkout')?.steps[2]).not.toHaveProperty('transition');
    await tools.value('update_tour_step', { tour, step: 3, pointTo: null, pulse: null });
    const step = tourNamed('Checkout')?.steps[2];
    expect(step?.caption).toEqual({ title: 'Who reads' });
    expect(step).not.toHaveProperty('pulse');
    expect(
      await tools.failure('update_tour_step', {
        tour,
        step: 3,
        pulse: { relations: ['api-reads-db', 'customer-calls-api', 'db-in-system'] },
      }),
    ).toContain('does not draw as a line');
  });

  it('write captions, reveals and speaker notes as the characters they are with escapeText', async () => {
    const tour = await walk();
    await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'The *_id columns',
      text: 'Columns named *_id are keys',
      marks: ['api'],
      reveal: [{ marks: ['db'], text: '**not bold**' }],
      notes: '# not a heading',
      escapeText: true,
    });
    const step = tourNamed('Checkout')?.steps[2];
    expect(step?.caption).toEqual({
      title: 'The *_id columns',
      text: 'Columns named \\*\\_id are keys',
    });
    expect(step?.reveal).toEqual([{ marks: ['db'], text: '\\*\\*not bold\\*\\*' }]);
    expect(step?.notes).toBe('\\# not a heading');
    await tools.value('update_tour_step', { tour, step: 3, text: '_a_', escapeText: true });
    expect(tourNamed('Checkout')?.steps[2]?.caption.text).toBe('\\_a\\_');
    await tools.value('update_tour_step', { tour, step: 3, text: '*mine*' });
    expect(tourNamed('Checkout')?.steps[2]?.caption.text).toBe('*mine*');
  });

  it('refuse what the core refuses, in its words, and say what the step’s check warns about', async () => {
    const tour = await walk();
    expect(
      await tools.failure('update_tour_step', {
        tour,
        step: 2,
        play: null,
        advance: 'after-scenario',
      }),
    ).toBe(
      'Refused, so nothing changed: Step 2 of the tour moves on after its scenario, but plays none. (invalid-command)',
    );
    expect(
      await tools.failure('add_tour_step', {
        tour,
        viewState: { view: 'overview' },
        title: 'X',
        reveal: [{ marks: ['nothing'] }],
      }),
    ).toBe(
      'Refused, so nothing changed: Step 3 of the tour: Reveal 1 of the step marks elements, relations, notes and arrows of its view, and "nothing" is none of them. (unknown-element)',
    );
    const quick = await tools.value('update_tour_step', {
      tour,
      step: 1,
      text: 'A long caption that takes far longer to read than half a second does, word after word after word.',
      advance: 500,
    });
    expect(quick.check).toEqual({
      camera: 'fit',
      warnings: [
        'Step 1 moves on after 0.5 s, but its text takes 6.3 s to read: it waits until then.',
      ],
    });
  });

  it('remove a step, and say which steps a tour has when one is not there', async () => {
    const tour = await walk();
    expect(await tools.value('remove_tour_step', { tour, step: 1 })).toMatchObject({
      done: 'Delete a step of the tour "Checkout"',
    });
    expect(tourNamed('Checkout')?.steps).toHaveLength(1);
    expect(await tools.failure('remove_tour_step', { tour, step: 4 })).toBe(
      'The tour "Checkout" has no step 4: it has 1.',
    );
    expect(await tools.failure('update_tour_step', { tour, step: 'gone', title: 'X' })).toBe(
      'The tour "Checkout" has no step "gone". read_tour lists its steps.',
    );
    expect(
      await tools.failure('add_tour_step', {
        tour: 'gone',
        viewState: { view: 'overview' },
        title: 'X',
      }),
    ).toBe('There is no tour "gone". get_project lists the tours.');
  });
});

describe('a step that plays a given alternative (ADR 0078)', () => {
  /** The test project whose scenario decides whether the API reads the DB or answers from memory. */
  function deciding(): ProjectSnapshot {
    const project = testProject();
    const [request] = project.scenarios;
    if (!request) throw new Error('The test project has no scenario.');
    return {
      ...project,
      scenarios: [
        {
          ...request,
          steps: [
            ...request.steps,
            {
              id: 'remember',
              description: 'The API answers from memory.',
              relations: ['customer-calls-api'],
            },
          ],
          blocks: [
            {
              id: 'cached',
              kind: 'decision',
              question: 'Is it cached?',
              alternatives: [
                { id: 'not-cached', label: 'No', steps: ['read'] },
                { id: 'is-cached', label: 'Yes', steps: ['remember'] },
              ],
            },
          ],
        },
      ],
    };
  }

  beforeEach(async () => {
    await tools.close();
    tools = await startToolHarness(deciding());
  });

  it('add_tour_step and update_tour_step take choices in play, as the file keeps them', async () => {
    const tour = await walk();
    await tools.value('add_tour_step', {
      tour,
      viewState: {
        view: 'overview',
        scenario: 'request',
        step: 'remember',
        choices: { cached: 'is-cached' },
      },
      title: 'From memory',
      play: { scenario: 'request', from: 1, to: 'remember', choices: { cached: 'is-cached' } },
    });
    expect(tourNamed('Checkout')?.steps[2]).toMatchObject({
      viewState: {
        view: 'overview',
        scenario: 'request',
        step: 'remember',
        choices: { cached: 'is-cached' },
      },
      play: { scenario: 'request', from: 'call', to: 'remember', choices: { cached: 'is-cached' } },
    });
    await tools.value('update_tour_step', {
      tour,
      step: 3,
      play: { scenario: 'request', choices: { cached: 'not-cached' } },
    });
    expect(tourNamed('Checkout')?.steps[2]?.play).toEqual({
      scenario: 'request',
      choices: { cached: 'not-cached' },
    });
  });

  it('refuse choices the scenario does not have, and a range they do not play, saying what would', async () => {
    const tour = await walk();
    expect(
      await tools.failure('add_tour_step', {
        tour,
        viewState: { view: 'overview' },
        title: 'X',
        play: { scenario: 'request', choices: { cached: 'maybe' } },
      }),
    ).toBe(
      'Not added: The decision "Is it cached?" has no alternative "maybe": its alternatives are "not-cached" (No) and "is-cached" (Yes).',
    );
    expect(
      await tools.failure('add_tour_step', {
        tour,
        viewState: { view: 'overview' },
        title: 'X',
        play: { scenario: 'request', from: 'remember' },
      }),
    ).toBe(
      'Not added: With every decision playing its default, the scenario "A request" does not play the step "remember". Give choices {"cached":"is-cached"}, which play it.',
    );
    expect(tourNamed('Checkout')?.steps).toHaveLength(2);
  });
});

describe('check_tour', () => {
  /** A tour whose steps glide, cut, stay, fit and mark what their camera or filters hide. */
  async function wandering(): Promise<string> {
    const near = { view: 'overview', camera: { x: 0, y: 0, zoom: 1 } };
    const created = await tools.value('create_tour', {
      name: 'Wandering',
      steps: [
        { viewState: near, title: 'Near', marks: ['customer'] },
        {
          viewState: { view: 'overview', camera: { x: 3000, y: 0, zoom: 1 } },
          title: 'Beside',
          marks: ['customer', 'api'],
        },
        {
          viewState: { view: 'overview', camera: { x: 30000, y: 0, zoom: 1 } },
          title: 'Far',
        },
        {
          viewState: { view: 'overview', camera: { x: 30000, y: 0, zoom: 1 } },
          title: 'Far again',
        },
        {
          viewState: { view: 'overview', filters: { components: ['systems.person'] } },
          title: 'Without people',
          marks: ['customer-calls-api', 'db'],
        },
      ],
    });
    return created.tour as string;
  }

  it('says step by step how the camera gets there, and what to look at', async () => {
    const tour = await wandering();
    const checked = await tools.value('check_tour', { tour });
    const ids = tourNamed('Wandering')?.steps.map((step) => step.id) ?? [];
    expect(checked).toMatchObject({
      tour,
      name: 'Wandering',
      screen: { width: 1366, height: 768 },
      warnings: 4,
      cuts: [3],
    });
    expect(checked.steps).toEqual([
      { number: 1, step: ids[0], title: 'Near', camera: 'cut' },
      {
        number: 2,
        step: ids[1],
        title: 'Beside',
        camera: 'glide',
        warnings: [
          {
            kind: 'marks-outside',
            message: 'Step 2 marks what its camera does not show: "Customer", "API".',
            subjects: ['customer', 'api'],
          },
        ],
      },
      {
        number: 3,
        step: ids[2],
        title: 'Far',
        camera: 'cut',
        warnings: [
          {
            kind: 'cuts',
            message:
              'Step 3 cuts from step 2: its camera is too far, or too much zoomed, to glide to.',
          },
        ],
      },
      {
        number: 4,
        step: ids[3],
        title: 'Far again',
        camera: 'stay',
        warnings: [
          {
            kind: 'could-be-reveal',
            message:
              'Step 4 shows the same view state as step 3: it could be a reveal of that step.',
          },
        ],
      },
      {
        number: 5,
        step: ids[4],
        title: 'Without people',
        camera: 'fit',
        warnings: [
          {
            kind: 'marks-hidden',
            message: 'Step 5 marks what its filters hide: "HTTPS".',
            subjects: ['customer-calls-api'],
          },
        ],
      },
    ]);
    expect(checked.note).toMatch(/where each view draws its shapes now/);
    expect(checked.glides).toEqual([]);
  });

  it('says which steps into another view glide and which cut, a pointing that misses and a broken pulse (ADR 0084)', async () => {
    const made = await tools.value('create_view', {
      name: 'Again',
      perspective: { name: 'Data flow' },
      nestingRelationTypes: ['systems.is-part-of'],
    });
    const again = { id: made.view as string };
    const created = await tools.value('create_tour', {
      name: 'Across',
      steps: [
        { viewState: { view: 'overview' }, title: 'Here' },
        { viewState: { view: again.id }, title: 'There', marks: ['api'], pointTo: 'db' },
        { viewState: { view: 'overview' }, title: 'Back', transition: 'cut' },
      ],
    });
    const checked = await tools.value('check_tour', { tour: created.tour });
    const steps = checked.steps as { shapes?: unknown; warnings?: { kind: string }[] }[];
    expect(steps.map((step) => step.shapes)).toEqual([
      undefined,
      // The two views draw the same five elements.
      { kind: 'glide', shared: 5 },
      { kind: 'cut', reason: 'opted-out', shared: 0 },
    ]);
    expect(steps[1]?.warnings?.map((each) => each.kind)).toEqual(['point-to-not-mark']);
  });

  it('reads the tour against the screen given, and changes nothing', async () => {
    const tour = await wandering();
    const actions = tools.session.actions.length;
    const wide = await tools.value('check_tour', { tour, screen: { width: 8000, height: 768 } });
    expect(wide.screen).toEqual({ width: 8000, height: 768 });
    // On a screen that wide, the camera of step 2 shows the customer and the API.
    const second = (wide.steps as { number: number; warnings?: { kind: string }[] }[])[1];
    expect(second?.warnings).toBeUndefined();
    expect(tools.session.actions).toHaveLength(actions);
  });

  it('says what names what was deleted, and refuses a tour the project does not have', async () => {
    const tour = await wandering();
    await tools.asPerson({ type: 'delete', elements: ['db'] });
    const checked = await tools.value('check_tour', { tour });
    const fifth = (checked.steps as { warnings?: { kind: string; message: string }[] }[])[4];
    expect(fifth?.warnings?.[0]).toEqual({
      kind: 'broken',
      message:
        'Step 5 names what the project no longer holds, and plays without it: A step marks elements, relations, notes and arrows of its view, and "db" is none of them.',
      subjects: ['db'],
    });
    expect(await tools.failure('check_tour', { tour: 'gone' })).toBe(
      'There is no tour "gone". get_project lists the tours.',
    );
  });
});

describe('read_tour', () => {
  it('reads each step with its number, and flags what names what was deleted', async () => {
    const tour = await walk();
    await tools.asPerson({ type: 'delete', elements: ['db'] });
    const read = await tools.value('read_tour', { tour });
    expect(read).toMatchObject({
      name: 'Checkout',
      steps: [
        { number: 1, caption: { title: 'The shop' } },
        {
          number: 2,
          caption: { title: 'The API' },
          broken: true,
          problems: [
            'A step marks elements, relations, notes and arrows of its view, and "api-reads-db" is none of them.',
          ],
        },
      ],
      brokenSteps: [2],
    });
    expect((read.steps as { broken?: boolean }[])[0]?.broken).toBeUndefined();
  });
});

describe('play_tour', () => {
  it('plays a tour full screen in every open app from a step, recording and writing nothing', async () => {
    const tour = await walk();
    const app = await tools.openApp();
    const actions = tools.session.actions.length;
    const before = await filesIn(tools.session.folder);
    const second = tourNamed('Checkout')?.steps[1]?.id;
    const played = await tools.value('play_tour', { tour, step: 2 });
    expect(played).toMatchObject({
      apps: 1,
      tour,
      from: { number: 2, id: second, title: 'The API' },
    });
    expect(played.note).toMatch(/the person’s: they move through it .* and end it with Escape/);
    // Guidance names the step by its index, from 0.
    await expect.poll(() => tools.guidanceOf(app)).toEqual([{ kind: 'tour', tour, step: 1 }]);
    expect(tools.session.actions).toHaveLength(actions);
    expect(await filesIn(tools.session.folder)).toEqual(before);
  });

  it('plays from the first step unless told, and takes a step by its id', async () => {
    const tour = await walk();
    const app = await tools.openApp();
    await tools.value('play_tour', { tour });
    const second = tourNamed('Checkout')?.steps[1]?.id as string;
    expect(await tools.value('play_tour', { tour, step: second })).toMatchObject({
      from: { number: 2 },
    });
    await expect
      .poll(() => tools.guidanceOf(app))
      .toEqual([
        { kind: 'tour', tour, step: 0 },
        { kind: 'tour', tour, step: 1 },
      ]);
  });

  it('says so when no app is open, since a tour plays only in the app', async () => {
    const tour = await walk();
    const played = await tools.value('play_tour', { tour });
    expect(played).toMatchObject({ apps: 0 });
    expect(played.note).toMatch(/^No app has the project open, so no tour plays.*open_app/);
  });

  it('refuses a tour, or a step, the project does not have, and a tour of no steps', async () => {
    const tour = await walk();
    expect(await tools.failure('play_tour', { tour: 'gone' })).toBe(
      'There is no tour "gone". get_project lists the tours.',
    );
    expect(await tools.failure('play_tour', { tour, step: 3 })).toBe(
      'The tour "Checkout" has no step 3: it has 2.',
    );
    const empty = (await tools.value('create_tour', { name: 'Empty' })).tour as string;
    expect(await tools.failure('play_tour', { tour: empty })).toBe(
      'The tour "Empty" has no steps to play: add_tour_step adds one.',
    );
  });
});

describe('update_tour and delete_tour', () => {
  it('rename a tour and delete it, each as one action', async () => {
    const tour = await walk();
    expect(
      await tools.value('update_tour', { tour, name: 'Paying', description: 'How.' }),
    ).toMatchObject({
      done: 'Edit the tour "Paying"',
    });
    expect(await tools.value('delete_tour', { tour })).toMatchObject({
      done: 'Delete the tour "Paying"',
    });
    expect(tools.session.snapshot.tours).toEqual([]);
    expect(await tools.failure('delete_tour', { tour })).toBe(
      `Refused, so nothing changed: There is no tour "${tour}". (unknown-tour)`,
    );
  });
});
