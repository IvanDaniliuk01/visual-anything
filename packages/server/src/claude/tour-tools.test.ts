import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesIn } from '../test-support';
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
      'Refused, so nothing changed: Step 1 of the tour: A step marks elements and relations, and "nothing" is neither. (unknown-element)',
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
          problems: ['A step marks elements and relations, and "api-reads-db" is neither.'],
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
