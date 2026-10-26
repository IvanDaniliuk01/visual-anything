/**
 * Claude's tour tools (ADR 0058): reading a tour with what its steps name that the project no longer
 * holds; creating one, so that "walk me through checkout" can be saved as a tour and not only shown
 * once as guidance; adding, changing, moving and removing its steps; renaming and deleting it. Each
 * call is one undoable action of Claude's. A step is a view state, as get_view_address takes one, with a
 * caption, the elements and relations it marks, a scenario it plays, and speaker notes. play_tour plays
 * a tour full screen in the open apps, as guidance that records nothing.
 */
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_GUIDANCE_TARGETS,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_NAME,
  savedViewStateOf,
  tourStepProblems,
  type NewTourStep,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, TourFile, TourPlayback, TourStep } from '@visual-anything/schema';
import { z } from 'zod';
import {
  DELETE,
  GUIDE,
  READ,
  WRITE,
  act,
  counted,
  fail,
  id,
  ok,
  tool,
  withoutUndefined,
} from './kit';
import type { Tool } from './tools';
import { STATE_HELP, STATE_PARTS, askedState } from './view-tools';

const tourId = () => id().describe('The tour, by id: get_project lists the tours.');

const stepRef = () =>
  z
    .union([id(), z.number().int().min(1)])
    .describe('The step: its id from read_tour, or its number from 1.');

const scenarioStepRef = () => z.union([id(), z.number().int().min(1)]);

/** A view state as the tour tools take it: a view, and the rest as get_view_address takes them. */
const viewState = () =>
  z
    .object({ view: id().describe('The view the step shows.'), ...STATE_PARTS })
    .describe(
      'Where the step takes the canvas, and how it reads there: a view, and if you like where the canvas looks, a selection, filters, focus, and a scenario open at a step. Left out, the canvas shows the selection, or else the whole view.',
    );

const caption = () => ({
  title: z
    .string()
    .min(1)
    .max(MAX_CAPTION_TITLE)
    .describe('The caption card’s title: a few words.'),
  text: z
    .string()
    .max(MAX_CAPTION_TEXT)
    .optional()
    .describe(
      'The caption card’s text, plain text, never HTML: a blank line starts a paragraph; lines that start with "- ", or with a number and ". ", make a list. A few sentences: the person reads it while the step shows.',
    ),
});

const marks = () =>
  z
    .array(id())
    .max(MAX_GUIDANCE_TARGETS)
    .describe('The elements and relations the step highlights, as highlight does, each once.');

const play = () =>
  z
    .object({
      scenario: id().describe('A scenario that plays over the step’s view.'),
      from: scenarioStepRef()
        .optional()
        .describe('The step it starts on, by id or number from 1; its first when left out.'),
      to: scenarioStepRef()
        .optional()
        .describe('The step it stops on, by id or number from 1; its last when left out.'),
    })
    .describe('A scenario played, step by step, while the step shows.');

const notes = () =>
  z
    .string()
    .max(MAX_SPEAKER_NOTES)
    .describe(
      'Speaker notes: what the person presenting says while the step shows, in the notes window only. Plain text, as the caption.',
    );

const newStep = () =>
  z.object({
    viewState: viewState(),
    ...caption(),
    marks: marks().optional(),
    play: play().optional(),
    notes: notes().optional(),
  });

type NewStepArgs = z.infer<ReturnType<typeof newStep>>;

const STEP_HELP = `A step's viewState is a view state as get_view_address takes it: ${STATE_HELP} Its caption has a title and a text; marks highlight elements and relations; play plays a scenario over the step's view from one of its steps to another; notes are the speaker's.`;

// ——— Read ———

const readTour = tool({
  name: 'read_tour',
  title: 'Read a tour',
  description: `Reads a tour: its steps in order, each with its number, id, view state, caption, marks, the scenario it plays and its speaker notes, and what it names that the project no longer holds: such a step is kept and flagged as broken, and plays without it. Read it before changing a tour's steps.

Example: { "tour": "how-booking-works" }`,
  input: { tour: tourId() },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === args.tour);
    if (!tour) return fail(`There is no tour "${args.tour}". get_project lists the tours.`);
    return ok(describeTour(state, tour));
  },
});

// ——— Create and change ———

const createTour = tool({
  name: 'create_tour',
  title: 'Create a tour',
  description: `Creates a tour, as one undoable action: steps that each take the canvas to a view state and explain it with a caption, which the person plays full screen to walk someone through a concept. Use it when the person asks to keep an explanation, as in "walk me through checkout and save it", rather than only to be shown once with guidance.

Plan the walk first: a few steps, each one idea, in the order the person should meet them; start wide (the whole view, no camera), then narrow with select, focus and marks; let a scenario play where something moves. Give the steps now, or add them one at a time with add_tour_step. Then tell the person they can play it from the tours panel.

${STEP_HELP}

Example: {
  "name": "How booking works",
  "description": "From a patient's message to a booked slot.",
  "steps": [
    { "viewState": { "view": "system-overview" }, "title": "Clinic booking", "text": "Three parts do the work:\\n\\n- the booking agent\\n- the Appointments API\\n- the reminder service" },
    { "viewState": { "view": "system-overview", "select": ["booking-agent"], "focus": { "degrees": 1 } }, "title": "The booking agent", "marks": ["booking-agent", "agent-to-api"], "notes": "Mention the retries." },
    { "viewState": { "view": "system-overview" }, "title": "One request", "play": { "scenario": "patient-books-appointment", "from": 1, "to": 3 } }
  ]
}`,
  input: {
    name: z.string().min(1).max(MAX_TOUR_NAME),
    description: z.string().max(MAX_TOUR_DESCRIPTION).optional(),
    steps: z.array(newStep()).max(200).optional(),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const steps: NewTourStep[] = [];
    for (const [at, given] of (args.steps ?? []).entries()) {
      const made = stepFrom(state, given);
      if (!made.ok) return fail(`Not created: step ${at + 1}: ${made.message}`);
      steps.push(made.step);
    }
    return act(
      program,
      {
        type: 'create-tour',
        tour: withoutUndefined({ name: args.name, description: args.description, steps }),
      },
      (answer) => ({
        tour: answer.created[0],
        steps: steps.length,
        next: 'The person plays it from the tours panel. Add steps with add_tour_step, change them with update_tour_step.',
      }),
    );
  },
});

const addTourStep = tool({
  name: 'add_tour_step',
  title: 'Add a step to a tour',
  description: `Adds one step to a tour, as one undoable action: last, or at the number given.

${STEP_HELP}

Example: { "tour": "how-booking-works", "viewState": { "view": "system-overview", "select": ["appointments-db"] }, "title": "Where bookings live", "text": "The API reads and writes the calendar here.", "marks": ["api-reads-db", "api-writes-db"] }
Example: { "tour": "how-booking-works", "at": 1, "viewState": { "view": "system-overview" }, "title": "Start here" }`,
  input: {
    tour: tourId(),
    at: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('The number the step takes, from 1; left out, it goes last.'),
    ...newStep().shape,
  },
  hints: WRITE,
  run: async (args, program) => {
    const { tour: tourArg, at, ...given } = args;
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === tourArg);
    if (!tour) return fail(`There is no tour "${tourArg}". get_project lists the tours.`);
    const made = stepFrom(state, given);
    if (!made.ok) return fail(`Not added: ${made.message}`);
    const place = Math.min(tour.steps.length, (at ?? tour.steps.length + 1) - 1);
    const steps: NewTourStep[] = [...tour.steps];
    steps.splice(place, 0, made.step);
    return act(program, { type: 'update-tour', id: tour.id, changes: { steps } }, async () => {
      const after = (await program.project()).tours.find((each) => each.id === tour.id);
      return { step: after?.steps[place]?.id, number: place + 1, of: after?.steps.length };
    });
  },
});

const updateTourStep = tool({
  name: 'update_tour_step',
  title: 'Change a step of a tour',
  description: `Changes one step of a tour, as one undoable action: what you give replaces what the step has, and what you leave out stays. viewState replaces the step's view state as a whole; null takes the text, marks, play or notes away. moveTo moves the step to another number. Fixing a broken step means giving it back what it names without what was deleted.

${STEP_HELP}

Example: { "tour": "how-booking-works", "step": 2, "text": "It answers in a second." }
Example: { "tour": "how-booking-works", "step": "the-agent", "viewState": { "view": "system-overview", "select": ["booking-agent"] }, "marks": null, "moveTo": 1 }`,
  input: {
    tour: tourId(),
    step: stepRef(),
    viewState: viewState().optional(),
    title: caption().title.optional(),
    text: caption().text.unwrap().nullable().optional(),
    marks: marks().nullable().optional(),
    play: play().nullable().optional(),
    notes: notes().nullable().optional(),
    moveTo: z.number().int().min(1).optional().describe('The number the step moves to, from 1.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === args.tour);
    if (!tour) return fail(`There is no tour "${args.tour}". get_project lists the tours.`);
    const at = stepIndex(tour, args.step);
    if (at === undefined) return fail(noStep(tour, args.step));
    const current = tour.steps[at] as TourStep;
    const next: TourStep = { ...current, caption: { ...current.caption } };
    if (args.viewState !== undefined) {
      const asked = askedState(args.viewState, state);
      if (!asked.ok) return fail(`Not changed: ${asked.message}`);
      next.viewState = savedViewStateOf(asked.state);
    }
    if (args.title !== undefined) next.caption.title = args.title;
    if (args.text === null || args.text === '') delete next.caption.text;
    else if (args.text !== undefined) next.caption.text = args.text;
    if (args.marks === null || args.marks?.length === 0) delete next.marks;
    else if (args.marks !== undefined) next.marks = args.marks;
    if (args.play === null) delete next.play;
    else if (args.play !== undefined) {
      const played = playFrom(state, args.play);
      if (!played.ok) return fail(`Not changed: ${played.message}`);
      next.play = played.play;
    }
    if (args.notes === null || args.notes === '') delete next.notes;
    else if (args.notes !== undefined) next.notes = args.notes;
    const steps = tour.steps.map((step, index) => (index === at ? next : step));
    const moved =
      args.moveTo === undefined
        ? steps
        : steps.toSpliced(at, 1).toSpliced(Math.min(steps.length - 1, args.moveTo - 1), 0, next);
    return act(program, { type: 'update-tour', id: tour.id, changes: { steps: moved } }, () => ({
      step: next.id,
      number: moved.indexOf(next) + 1,
    }));
  },
});

const removeTourStep = tool({
  name: 'remove_tour_step',
  title: 'Remove a step of a tour',
  description: `Removes one step of a tour, as one undoable action. The rest keep their order.

Example: { "tour": "how-booking-works", "step": 3 }`,
  input: { tour: tourId(), step: stepRef() },
  hints: DELETE,
  run: async (args, program) => {
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === args.tour);
    if (!tour) return fail(`There is no tour "${args.tour}". get_project lists the tours.`);
    const at = stepIndex(tour, args.step);
    if (at === undefined) return fail(noStep(tour, args.step));
    return act(program, {
      type: 'update-tour',
      id: tour.id,
      changes: { steps: tour.steps.toSpliced(at, 1) },
    });
  },
});

const updateTour = tool({
  name: 'update_tour',
  title: 'Rename a tour',
  description: `Changes a tour's name or description, as one undoable action; null takes the description away.

Example: { "tour": "how-booking-works", "name": "Booking, step by step" }`,
  input: {
    tour: tourId(),
    name: z.string().min(1).max(MAX_TOUR_NAME).optional(),
    description: z.string().max(MAX_TOUR_DESCRIPTION).nullable().optional(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'update-tour',
      id: args.tour,
      changes: withoutUndefined({ name: args.name, description: args.description }),
    }),
});

const deleteTour = tool({
  name: 'delete_tour',
  title: 'Delete a tour',
  description: `Deletes a tour, as one undoable action. The model and the views are untouched. Ask the person first.

Example: { "tour": "how-booking-works" }`,
  input: { tour: tourId() },
  hints: DELETE,
  run: async (args, program) => act(program, { type: 'delete-tour', id: args.tour }),
});

// ——— Play, as guidance ———

const playTour = tool({
  name: 'play_tour',
  title: 'Play a tour in the app',
  description: `Plays a tour full screen in the app the person has open, from its first step or from the step you name, as the tours panel's Play does: the panels hide, each step's caption shows in a card, its marks highlight and its scenario plays. From then on the tour is the person's: they move through it with the arrow keys and end it with Escape, and the tab goes back to where it was; you cannot move it on or end it. Playing it changes nothing in the project, and nothing is recorded. It answers how many open apps it reached; with none, nothing plays, and open_app opens one. Use it when the person asks to see a tour, rather than walking them through the same steps with guidance.

Example: { "tour": "how-booking-works" }
Example: { "tour": "how-booking-works", "step": 3 }`,
  input: {
    tour: tourId(),
    step: stepRef()
      .optional()
      .describe('The step it plays from, by id or number from 1; its first when left out.'),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === args.tour);
    if (!tour) return fail(`There is no tour "${args.tour}". get_project lists the tours.`);
    if (tour.steps.length === 0) {
      return fail(`The tour "${tour.name}" has no steps to play: add_tour_step adds one.`);
    }
    const at = args.step === undefined ? 0 : stepIndex(tour, args.step);
    if (at === undefined) return fail(noStep(tour, args.step as Id | number));
    const step = tour.steps[at] as TourStep;
    const apps = await program.guide({ kind: 'tour', tour: tour.id, step: at });
    return ok({
      apps,
      tour: tour.id,
      from: { number: at + 1, id: step.id, title: step.caption.title },
      note:
        apps === 0
          ? 'No app has the project open, so no tour plays: it plays full screen in the app. Call open_app to open it, or ask the person to, then call play_tour again.'
          : `The tour plays full screen in ${apps === 1 ? 'the open app' : `each of the ${apps} open apps`}, from step ${at + 1} of ${tour.steps.length}. It is the person’s: they move through it with the arrow keys and end it with Escape. Nothing was recorded.`,
    });
  },
});

// ——— Helpers ———

/** A step the arguments ask for, its view state checked as get_view_address checks one. */
function stepFrom(
  state: ProjectSnapshot,
  given: NewStepArgs,
): { ok: true; step: NewTourStep } | { ok: false; message: string } {
  const asked = askedState(given.viewState, state);
  if (!asked.ok) return asked;
  let played: TourPlayback | undefined;
  if (given.play) {
    const checked = playFrom(state, given.play);
    if (!checked.ok) return checked;
    played = checked.play;
  }
  return {
    ok: true,
    step: withoutUndefined({
      viewState: savedViewStateOf(asked.state),
      caption: withoutUndefined({ title: given.title, text: given.text || undefined }),
      marks: given.marks && given.marks.length > 0 ? given.marks : undefined,
      play: played,
      notes: given.notes || undefined,
    }),
  };
}

/** A scenario to play, its steps given by number turned into their ids. */
function playFrom(
  state: ProjectSnapshot,
  given: z.infer<ReturnType<typeof play>>,
): { ok: true; play: TourPlayback } | { ok: false; message: string } {
  const scenario = state.scenarios.find((each) => each.id === given.scenario);
  if (!scenario) {
    return {
      ok: false,
      message: `There is no scenario "${given.scenario}". get_project lists them.`,
    };
  }
  const stepOf = (ref: Id | number | undefined): Id | undefined | false => {
    if (ref === undefined || typeof ref === 'string') return ref;
    return scenario.steps[ref - 1]?.id ?? false;
  };
  const from = stepOf(given.from);
  const to = stepOf(given.to);
  if (from === false || to === false) {
    return {
      ok: false,
      message: `The scenario "${scenario.name}" has ${counted(scenario.steps.length, 'step')}.`,
    };
  }
  return { ok: true, play: withoutUndefined({ scenario: scenario.id, from, to }) };
}

/** Where a step is in its tour, by id or number from 1. */
function stepIndex(tour: TourFile, ref: Id | number): number | undefined {
  const at = typeof ref === 'number' ? ref - 1 : tour.steps.findIndex((step) => step.id === ref);
  return at >= 0 && at < tour.steps.length ? at : undefined;
}

function noStep(tour: TourFile, ref: Id | number): string {
  return typeof ref === 'number'
    ? `The tour "${tour.name}" has no step ${ref}: it has ${tour.steps.length}.`
    : `The tour "${tour.name}" has no step "${ref}". read_tour lists its steps.`;
}

/** A tour as Claude reads it: each step with its number, and what it names that is gone. */
function describeTour(state: ProjectSnapshot, tour: TourFile) {
  const steps = tour.steps.map((step, at) => {
    const problems = tourStepProblems(state, step).map((each) => each.message);
    return {
      number: at + 1,
      ...step,
      ...(problems.length > 0 ? { broken: true, problems } : {}),
    };
  });
  return {
    id: tour.id,
    name: tour.name,
    ...(tour.description === undefined ? {} : { description: tour.description }),
    steps,
    brokenSteps: steps.filter((step) => 'broken' in step).map((step) => step.number),
  };
}

/** The tour tools, in the order Claude reads them. */
export const TOUR_TOOLS: readonly Tool[] = [
  readTour,
  createTour,
  addTourStep,
  updateTourStep,
  removeTourStep,
  updateTour,
  deleteTour,
  playTour,
];
