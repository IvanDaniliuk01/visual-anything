/** Tour commands (ADR 0058): each one action, undone exactly; steps naming deleted things are kept. */
import fc from 'fast-check';
import type { TourFile, TourStep } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import type { NewTourStep } from './commands/types';
import { applyOperations } from './operations';
import { previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';
import { MAX_SPEAKER_NOTES, MAX_TOUR_TEXT, isBrokenTourStep } from './tours';

function ids() {
  let n = 0;
  return (base: string) => `${base}-${(n += 1)}`;
}

function run(state: ProjectSnapshot, command: Command): CommandOutcome {
  return executeCommand(state, command, { newId: ids() });
}

function done(state: ProjectSnapshot, command: Command) {
  const outcome = run(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): { code: string; message: string } {
  const outcome = run(state, command);
  if (outcome.ok) throw new Error(`The command was not refused: ${outcome.label}`);
  const [first] = outcome.problems;
  return { code: first?.code ?? '', message: first?.message ?? '' };
}

const START: NewTourStep = { viewState: { view: 'overview' }, caption: { title: 'The system' } };
const API: NewTourStep = {
  viewState: { view: 'overview', select: ['api'], focus: { degrees: 1, direction: 'both' } },
  caption: { title: 'The API', text: 'It answers the client.\n\n- fast\n- small' },
  marks: ['api', 'api-reads-db'],
  play: { scenario: 'request', from: 'call', to: 'read' },
  notes: 'Say why it is small.',
};

/** The test project with a tour of two steps. */
function withTour(): { state: ProjectSnapshot; tour: TourFile } {
  const outcome = done(testProject(), {
    type: 'create-tour',
    tour: { id: 'walk', name: 'A walk', steps: [START, API] },
  });
  const tour = outcome.state.tours[0];
  if (!tour) throw new Error('No tour was made.');
  return { state: outcome.state, tour };
}

describe('create-tour', () => {
  it('makes a tour with its steps, ids generated, as one action that undoes exactly', () => {
    const state = testProject();
    const outcome = done(state, {
      type: 'create-tour',
      tour: { name: 'How it works', description: 'From the client on.', steps: [START, API] },
    });
    expect(outcome.label).toBe('Create the tour "How it works"');
    expect(outcome.created).toEqual(['how-it-works-1']);
    expect(outcome.state.tours).toEqual([
      {
        id: 'how-it-works-1',
        name: 'How it works',
        description: 'From the client on.',
        steps: [
          { id: 'step-2', ...START },
          { id: 'step-3', ...API },
        ],
      },
    ]);
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });

  it('makes a tour with no steps yet, as Claude does before adding them', () => {
    expect(
      done(testProject(), { type: 'create-tour', tour: { name: 'Later' } }).state.tours,
    ).toEqual([{ id: 'later-1', name: 'Later', steps: [] }]);
  });

  it('keeps a step in the form its file keeps it', () => {
    const outcome = done(testProject(), {
      type: 'create-tour',
      tour: {
        name: 'Plain',
        steps: [
          {
            viewState: {
              view: 'overview',
              focus: { degrees: 1, direction: 'both', isolate: false },
              filters: { components: ['test.box'], relationTypes: [], conditions: [] },
            },
            caption: { title: 'T', text: '' },
            marks: [],
            notes: '',
          },
        ],
      },
    });
    expect(outcome.state.tours[0]?.steps[0]).toEqual({
      id: 'step-2',
      viewState: {
        view: 'overview',
        filters: { components: ['test.box'] },
        focus: { degrees: 1, direction: 'both' },
      },
      caption: { title: 'T' },
    });
  });

  it('keeps markup in a caption as the plain text it is', () => {
    const outcome = done(testProject(), {
      type: 'create-tour',
      tour: {
        name: '<b>Bold</b>',
        steps: [{ ...START, caption: { title: '<img src=x onerror=alert(1)>', text: '<script>' } }],
      },
    });
    expect(outcome.state.tours[0]?.name).toBe('<b>Bold</b>');
    expect(outcome.state.tours[0]?.steps[0]?.caption).toEqual({
      title: '<img src=x onerror=alert(1)>',
      text: '<script>',
    });
  });

  it.each<[string, Command, string, string]>([
    [
      'an empty name',
      { type: 'create-tour', tour: { name: ' ' } },
      'empty-name',
      'A tour needs a name.',
    ],
    [
      'an id already taken',
      { type: 'create-tour', tour: { id: 'api', name: 'Tour' } },
      'id-taken',
      'The id "api" is already taken.',
    ],
    [
      'a step over a view the project does not have',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ ...START, viewState: { view: 'gone' } }] },
      },
      'unknown-view',
      'Step 1 of the tour: The project has no view "gone".',
    ],
    [
      'a mark that is no element or relation',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [START, { ...START, marks: ['nothing'] }] },
      },
      'unknown-element',
      'Step 2 of the tour: A step marks elements and relations, and "nothing" is neither.',
    ],
    [
      'a scenario played over another view than the step’s',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ ...START, play: { scenario: 'nothing' } }] },
      },
      'unknown-scenario',
      'Step 1 of the tour: The project has no scenario "nothing".',
    ],
    [
      'a step without a caption',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ viewState: { view: 'overview' } } as NewTourStep] },
      },
      'invalid-command',
      'Step 1 of the tour needs a caption with a title.',
    ],
    [
      'a caption without a title',
      { type: 'create-tour', tour: { name: 'T', steps: [{ ...START, caption: { title: '' } }] } },
      'empty-name',
      'Step 1 of the tour needs a caption with a title.',
    ],
    [
      'a caption with more than a title and a text',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ ...START, caption: { title: 'T', html: '<b>' } as never }] },
      },
      'invalid-command',
      'A caption holds a title and a text, nothing else.',
    ],
    [
      'a malformed view state',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ ...START, viewState: { view: 'overview', step: 'x' } }] },
      },
      'invalid-command',
      'Step 1 of the tour: A step needs its scenario: scenario=<id>.',
    ],
    [
      'two steps with one id',
      {
        type: 'create-tour',
        tour: {
          name: 'T',
          steps: [
            { ...START, id: 'a' },
            { ...START, id: 'a' },
          ],
        },
      },
      'id-taken',
      'Step 2 of the tour takes the id "a", which an earlier step has.',
    ],
    [
      'a mark named twice',
      { type: 'create-tour', tour: { name: 'T', steps: [{ ...START, marks: ['api', 'api'] }] } },
      'invalid-command',
      'Step 1 of the tour marks "api" twice.',
    ],
    [
      'a title longer than a caption holds',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: [{ ...START, caption: { title: 'x'.repeat(201) } }] },
      },
      'invalid-command',
      "A caption's title holds at most 200 characters.",
    ],
    [
      'speaker notes longer than a step holds',
      { type: 'create-tour', tour: { name: 'T', steps: [{ ...START, notes: 'x'.repeat(20001) }] } },
      'invalid-command',
      'Speaker notes hold at most 20000 characters.',
    ],
    [
      'more steps than a tour holds',
      {
        type: 'create-tour',
        tour: { name: 'T', steps: Array.from({ length: 1001 }, () => START) },
      },
      'invalid-command',
      'A tour holds at most 1000 steps.',
    ],
    [
      'a tour that is not an object',
      { type: 'create-tour', tour: 'walk' } as unknown as Command,
      'invalid-command',
      'A tour is an object with a name.',
    ],
  ])('refuses %s', (_, command, code, message) => {
    expect(refusal(testProject(), command)).toEqual({ code, message });
  });
});

describe('update-tour', () => {
  it('names each change to the steps by what it does, and undoes it exactly', () => {
    const { state, tour } = withTour();
    const [first, second] = tour.steps as [TourStep, TourStep];
    const cases: [NewTourStep[], string][] = [
      [[first, second, START], 'Add a step to the tour "A walk"'],
      [[first, START, second], 'Add a step to the tour "A walk"'],
      [[second], 'Delete a step of the tour "A walk"'],
      [[second, first], 'Reorder the steps of the tour "A walk"'],
      [[first, { ...second, caption: { title: 'Changed' } }], 'Edit the tour "A walk"'],
    ];
    for (const [steps, label] of cases) {
      const outcome = done(state, { type: 'update-tour', id: 'walk', changes: { steps } });
      expect(outcome.label).toBe(label);
      expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
    }
  });

  it('renames a tour and takes its description away', () => {
    const { state } = withTour();
    const outcome = done(state, {
      type: 'update-tour',
      id: 'walk',
      changes: { name: 'A stroll', description: null },
    });
    expect(outcome.label).toBe('Edit the tour "A stroll"');
    expect(outcome.state.tours[0]?.name).toBe('A stroll');
  });

  it('records nothing for a change that changes nothing', () => {
    const { state, tour } = withTour();
    const outcome = done(state, {
      type: 'update-tour',
      id: 'walk',
      changes: { steps: tour.steps },
    });
    expect(outcome.operations).toEqual([]);
  });

  it('keeps a step that names something deleted, given back as it is, and refuses it changed', () => {
    const { state } = withTour();
    const deleted = done(state, { type: 'delete', elements: ['api'] }).state;
    const tour = deleted.tours[0] as TourFile;
    const broken = tour.steps[1] as TourStep;
    expect(isBrokenTourStep(deleted, broken)).toBe(true);

    const kept = done(deleted, {
      type: 'update-tour',
      id: 'walk',
      changes: { steps: [broken, tour.steps[0] as TourStep] },
    });
    expect(kept.state.tours[0]?.steps[0]).toBe(broken);

    expect(
      refusal(deleted, {
        type: 'update-tour',
        id: 'walk',
        changes: { steps: [{ ...broken, notes: 'Changed' }] },
      }),
    ).toEqual({
      code: 'unknown-element',
      message: 'Step 1 of the tour: Nothing in the view "Overview" has the id "api".',
    });
  });

  it('refuses a tour the project does not have', () => {
    expect(refusal(testProject(), { type: 'update-tour', id: 'gone', changes: {} })).toEqual({
      code: 'unknown-tour',
      message: 'There is no tour "gone".',
    });
  });
});

describe('the text a tour holds', () => {
  /** Steps of the longest speaker notes, each with a caption of ten characters. */
  function noted(count: number): NewTourStep[] {
    return Array.from({ length: count }, () => ({
      ...START,
      caption: { title: 'The system' },
      notes: 'n'.repeat(MAX_SPEAKER_NOTES),
    }));
  }
  const TOO_LONG = {
    code: 'invalid-command',
    message:
      'The tour would hold more than 1,000,000 characters of text, in its name, description, captions and speaker notes: put the rest of its steps in another tour.',
  };

  it('is at most 1,000,000 characters, counted over its name, description, captions and notes', () => {
    expect(MAX_TOUR_TEXT).toBe(1_000_000);
    // A name of 4, 50 captions of 10, 49 notes of 20,000, and the last notes that fill it.
    const rest = MAX_TOUR_TEXT - 4 - 50 * 10 - 49 * MAX_SPEAKER_NOTES;
    const full = [
      ...noted(49),
      { ...START, caption: { title: 'The system' }, notes: 'n'.repeat(rest) },
    ];
    const made = done(testProject(), {
      type: 'create-tour',
      tour: { id: 'long', name: 'Long', steps: full },
    });
    expect(made.state.tours[0]?.steps).toHaveLength(50);
    expect(
      refusal(testProject(), { type: 'create-tour', tour: { name: 'Long', steps: noted(50) } }),
    ).toEqual(TOO_LONG);
    const steps = made.state.tours[0]?.steps ?? [];
    expect(
      refusal(made.state, {
        type: 'update-tour',
        id: 'long',
        changes: { steps: [...steps, { ...START, caption: { title: 'One more' } }] },
      }),
    ).toEqual(TOO_LONG);
    expect(
      refusal(made.state, { type: 'update-tour', id: 'long', changes: { description: 'd' } }),
    ).toEqual(TOO_LONG);
    expect(
      refusal(made.state, { type: 'update-tour', id: 'long', changes: { name: 'Longer' } }),
    ).toEqual(TOO_LONG);
    expect(done(made.state, { type: 'update-tour', id: 'long', changes: { name: 'Lon' } }).ok).toBe(
      true,
    );
    // Text of more bytes than one counts as one character, as everywhere else.
    expect(
      done(testProject(), {
        type: 'create-tour',
        tour: {
          name: 'Long',
          steps: noted(49).map((step) => ({ ...step, notes: '語'.repeat(MAX_SPEAKER_NOTES) })),
        },
      }).ok,
    ).toBe(true);
  });

  it('lets a tour kept past it be changed, as long as it grows no longer', () => {
    const { state, tour } = withTour();
    // A tour written by hand, longer than the commands make one.
    const steps = Array.from({ length: 60 }, (_, at) => ({
      id: `s${at}`,
      ...START,
      notes: 'n'.repeat(MAX_SPEAKER_NOTES),
    }));
    const kept: ProjectSnapshot = { ...state, tours: [{ ...tour, steps }] };
    expect(done(kept, { type: 'update-tour', id: 'walk', changes: { name: 'Walk' } }).ok).toBe(
      true,
    );
    expect(
      done(kept, { type: 'update-tour', id: 'walk', changes: { steps: steps.slice(1) } }).label,
    ).toBe('Delete a step of the tour "A walk"');
    expect(
      refusal(kept, {
        type: 'update-tour',
        id: 'walk',
        changes: { name: 'A longer walk' },
      }),
    ).toEqual(TOO_LONG);
  });
});

describe('delete-tour', () => {
  it('deletes a tour as one action that undoes exactly', () => {
    const { state } = withTour();
    const outcome = done(state, { type: 'delete-tour', id: 'walk' });
    expect(outcome.label).toBe('Delete the tour "A walk"');
    expect(outcome.state.tours).toEqual([]);
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });
});

describe('tours and the rest of the project', () => {
  it('keeps every tour as it is whatever is deleted, and flags exactly the steps that name it', () => {
    const { state } = withTour();
    const deletable = [
      ...state.model.elements.map((element) => ({ kind: 'element' as const, id: element.id })),
      ...state.model.relations.map((relation) => ({ kind: 'relation' as const, id: relation.id })),
    ];
    fc.assert(
      fc.property(fc.subarray(deletable, { minLength: 1 }), (picked) => {
        const outcome = run(state, {
          type: 'delete',
          elements: picked.filter((each) => each.kind === 'element').map((each) => each.id),
          relations: picked.filter((each) => each.kind === 'relation').map((each) => each.id),
        });
        if (!outcome.ok) return;
        // The tours are not touched, and their steps are flagged as the preview said.
        expect(outcome.state.tours).toEqual(state.tours);
        const preview = previewDelete(state, {
          elements: picked.filter((each) => each.kind === 'element').map((each) => each.id),
          relations: picked.filter((each) => each.kind === 'relation').map((each) => each.id),
        });
        const flagged = outcome.state.tours.flatMap((tour) =>
          tour.steps
            .filter((step) => isBrokenTourStep(outcome.state, step))
            .map((step) => ({ tour: tour.id, step: step.id })),
        );
        expect(flagged).toEqual(preview.brokenTourSteps);
        // Undo gives back exactly what was there.
        expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
      }),
    );
  });

  it('flags, and previews as flagged, a step that selects a free shape deleted from its view', () => {
    const { state, tour } = withTour();
    const second = done(state, {
      type: 'create-view',
      view: { id: 'second', name: 'Second', perspective: { name: 'Ownership' } },
    }).state;
    const toured = done(second, {
      type: 'update-tour',
      id: 'walk',
      changes: {
        steps: [
          ...tour.steps,
          { ...START, viewState: { view: 'overview', select: ['note', 'api'] } },
          { ...START, viewState: { view: 'second' } },
        ],
      },
    }).state;
    const steps = toured.tours[0]?.steps ?? [];
    const selecting = steps[2] as TourStep;

    const preview = previewDelete(toured, { freeShapes: ['note'] }, 'overview');
    expect(preview.problems).toEqual([]);
    expect(preview.brokenTourSteps).toEqual([{ tour: 'walk', step: selecting.id }]);
    // A free shape belongs to one view: the same id in another view breaks nothing here.
    expect(previewDelete(toured, { freeShapes: ['note'] }, 'second').brokenTourSteps).toEqual([]);
    // With elements too, each step once.
    expect(
      previewDelete(toured, { elements: ['api'], freeShapes: ['note'] }, 'overview')
        .brokenTourSteps,
    ).toEqual([
      { tour: 'walk', step: steps[1]?.id },
      { tour: 'walk', step: selecting.id },
    ]);

    const deleted = done(toured, { type: 'delete-free-shapes', view: 'overview', ids: ['note'] });
    const flagged = deleted.state.tours.flatMap((each) =>
      each.steps
        .filter((step) => isBrokenTourStep(deleted.state, step))
        .map((step) => ({ tour: each.id, step: step.id })),
    );
    expect(flagged).toEqual(preview.brokenTourSteps);
  });

  it('keeps a tour whose view is deleted, its steps flagged', () => {
    const { state } = withTour();
    const second = done(state, {
      type: 'create-view',
      view: { id: 'second', name: 'Second', perspective: { name: 'Ownership' } },
    }).state;
    const toured = done(second, {
      type: 'update-tour',
      id: 'walk',
      changes: {
        steps: [...(second.tours[0]?.steps ?? []), { ...START, viewState: { view: 'second' } }],
      },
    }).state;
    const deleted = done(toured, { type: 'delete-view', id: 'second' }).state;
    const steps = deleted.tours[0]?.steps ?? [];
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => isBrokenTourStep(deleted, step))).toEqual([false, false, true]);
  });

  it('never gives a new element an id a tour step names', () => {
    const { state } = withTour();
    const deleted = done(state, { type: 'delete', elements: ['api'] }).state;
    expect(
      refusal(deleted, {
        type: 'create-element',
        element: { id: 'api', component: 'test.service', name: 'Another API' },
      }),
    ).toEqual({ code: 'id-taken', message: 'The id "api" is already taken.' });
  });

  it('runs in a batch with other commands as one action', () => {
    const outcome = done(testProject(), {
      type: 'batch',
      label: 'Explain the API',
      commands: [
        { type: 'create-tour', tour: { id: 'walk', name: 'Walk' } },
        { type: 'update-tour', id: 'walk', changes: { steps: [START] } },
      ],
    });
    expect(outcome.label).toBe('Explain the API');
    expect(outcome.state.tours[0]?.steps).toHaveLength(1);
  });

  it('opens a project whose tours name what is gone, and refuses one whose ids repeat', () => {
    const { state } = withTour();
    const deleted = done(state, { type: 'delete', elements: ['api', 'db'] }).state;
    expect(checkProject(deleted).errors).toEqual([]);
    const tour = deleted.tours[0] as TourFile;
    const twice: ProjectSnapshot = {
      ...deleted,
      tours: [tour, { ...tour, steps: [tour.steps[0] as TourStep, tour.steps[0] as TourStep] }],
    };
    expect(checkProject(twice).errors.map((each) => each.message)).toEqual([
      'More than one tour has the id "walk".',
      'More than one step in the tour "A walk" has the id "step-1".',
    ]);
  });
});
