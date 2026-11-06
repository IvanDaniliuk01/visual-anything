/**
 * Claude's tour tools (ADR 0058, ADR 0077): reading a tour with what its steps name that the project
 * no longer holds; creating one, so that "walk me through checkout" can be saved as a tour and not
 * only shown once as guidance; adding, changing, moving and removing its steps; renaming and deleting
 * it. Each call is one undoable action of Claude's. A step is a view state, as get_view_address takes
 * one, with a caption, the elements and relations it marks, reveals that bring in more one press at a
 * time, dimming of the rest, a scenario it plays, advancing by itself, a mark its caption points at,
 * a pulse along a chain of relations, a transition that always cuts (ADR 0084), how it marks what it
 * marks, with a halo or in its own style (ADR 0100), a view shown beside it in the pane right of the
 * tour's (ADR 0102), and speaker notes;
 * with `escapeText`, its caption's text, its reveals' texts and its notes are written as the
 * characters they are (ADR 0082). check_tour
 * says how a tour plays, step by step, reading marks outside a camera from the app's own scene.
 * play_tour plays a tour full screen in the open apps, as guidance that records nothing.
 */
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_GUIDANCE_TARGETS,
  MAX_PULSE_RELATIONS,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_DESCRIPTION,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MAX_TOUR_REVEALS,
  TOUR_ADVANCE,
  TOUR_CHECK_SCREEN,
  checkTour,
  choicesToReach,
  playedSteps,
  savedViewStateOf,
  tourStepProblems,
  type GlideShape,
  type NewTourStep,
  type ProjectSnapshot,
  type TourRect,
} from '@visual-anything/core';
import type {
  Id,
  TourCaption,
  TourFile,
  TourPlayback,
  TourPulse,
  TourReveal,
  TourStep,
} from '@visual-anything/schema';
import { z } from 'zod';
import { choicesProblem } from './decision-edits';
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
import { TAKES_MARKDOWN, escapeTextInput, escapedIf } from './emphasis';

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
      'Where the step takes the canvas, and how it reads there: a view, and if you like where the canvas looks, a selection, filters, focus, a scenario open at a step, and the physical-space panel open beside the canvas (space), with its joints’ positions (space.joints), which glide from the step before. Left out, the canvas shows the selection, or else the whole view.',
    );

/** The view a step shows beside it, in the pane right of the tour's (ADR 0102). */
const beside = () =>
  z
    .object({ view: id().describe('The view shown beside the step.'), ...STATE_PARTS })
    .describe(
      'A view shown beside the step, in the pane right of the one the tour plays in, as a viewState is given: the pane shows its view, at its camera, or else the whole view, gliding there as steps do. Use it to show, beside a story, the view of how its data is stored. Left out, that pane stays as the step before left it; when the tour ends, the panes come back as they were.',
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
      `The caption card’s text, never HTML: a blank line starts a paragraph; lines that start with "- ", or with a number and ". ", make a list. A few sentences: the person reads it while the step shows. ${TAKES_MARKDOWN}`,
    ),
});

const marks = () =>
  z
    .array(id())
    .max(MAX_GUIDANCE_TARGETS)
    .describe(
      'The elements, relations, notes and arrows the step highlights, as highlight does, each once: a note that explains a table can be marked with it.',
    );

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
      choices: z
        .record(id(), id())
        .optional()
        .describe(
          'The alternative it plays at each decision of the scenario, by the decision’s id, as read_scenario gives them: { "<decision id>": "<alternative id>" }. A decision left out plays its default. from and to must be steps these choices play.',
        ),
    })
    .describe(
      'A scenario played, step by step, while the step shows, in the alternatives you choose at its decisions.',
    );

const notes = () =>
  z
    .string()
    .max(MAX_SPEAKER_NOTES)
    .describe(
      'Speaker notes: what the person presenting says while the step shows, in the notes window only. Markdown, as the caption’s text.',
    );

const reveal = () =>
  z
    .array(
      z.object({
        marks: z
          .array(id())
          .min(1)
          .max(MAX_TOUR_MARKS)
          .describe('The elements, relations, notes and arrows this reveal brings in, each once.'),
        text: z
          .string()
          .max(MAX_CAPTION_TEXT)
          .optional()
          .describe(
            'A paragraph added to the caption as it comes in: Markdown, as the caption’s text.',
          ),
      }),
    )
    .max(MAX_TOUR_REVEALS)
    .describe(
      'Reveals: marks brought in one press forward at a time, after the step’s own marks, each fading in with its text added to the caption; a press back takes the last one away. Use them to build one picture up, rather than steps that repeat the same view state.',
    );

const dimRest = () =>
  z
    .boolean()
    .describe(
      'true dims everything the step does not mark, but the ends of the relations it marks, so that its marks and reveals stand out; false, as left out, dims nothing.',
    );

/** How a step marks what it marks (ADR 0100). */
const EMPHASES = ['halo', 'style'] as const;

const emphasis = () =>
  z
    .enum(EMPHASES)
    .describe(
      'How the step and its reveals mark what they mark: halo lays a halo over each mark; style draws nothing over it and restyles it instead, a relation heavier, in the canvas’s emphasis color, with a bigger arrowhead, its dash flowing from its from end to its to end and its name bold on a solid back, an element with a stronger border and a soft lift. Prefer style for a step that explains one relation or its direction, which a halo hides on a thin line. Left out, as the tour says.',
    );

const tourEmphasis = () =>
  z
    .enum(EMPHASES)
    .describe(
      'How every step without an emphasis of its own marks what it marks: halo, as left out, lays a halo over each mark; style restyles each mark instead, as a step’s emphasis says.',
    );

/** Where a caption card sits; `auto` is never written. */
const CAPTION_PLACES = ['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

const place = () =>
  z
    .enum(CAPTION_PLACES)
    .describe(
      'Where the caption card sits: auto, as left out, takes the side of the screen farthest from the step’s marks once the camera stops; a corner fixes it there.',
    );

const pointTo = () =>
  id().describe(
    'One of the step’s marks, its own or a reveal’s, that the caption card points at with a thin leader line, so that the text is tied to the shape it explains: a table, a column, or the relation that ties two tables. With a reveal’s mark, the line shows once that reveal comes in.',
  );

/** How a step moves in: `glide`, the default, is never written. */
const TRANSITIONS = ['glide', 'cut'] as const;

const transition = () =>
  z
    .enum(TRANSITIONS)
    .describe(
      'glide, as left out: into another view, the shapes the step shares with the step before glide to their new places (when they share 3 to 400 shapes) instead of cross-fading; cut makes the step always cut with a cross-fade, as for a fresh start.',
    );

const pulse = () =>
  z
    .object({
      relations: z
        .array(id())
        .min(1)
        .max(MAX_PULSE_RELATIONS)
        .describe(
          'The chain, in order: 1 to 12 relations the step’s view draws, each sharing an end with the next, as a finding belongs to a case, which belongs to a subject.',
        ),
      repeat: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe('How many times the marker runs the chain, 1 to 3; once when left out.'),
    })
    .describe(
      'A pulse: once the step’s transition is over, a marker runs along each relation of the chain in turn, 600 ms each, to show what follows what without a step per link. A press forward ends it; R plays it again.',
    );

const advance = () =>
  z
    .union([
      z.number().int().min(TOUR_ADVANCE.least).max(TOUR_ADVANCE.most),
      z.literal('after-scenario'),
    ])
    .describe(
      'Moves on by itself: after this many milliseconds, 500 to 600,000, spread evenly over its reveals, though never sooner than its text takes to read at 200 words a minute; or after-scenario, once the scenario it plays ends. Left out, the step waits for the person. The stage shows a pause control.',
    );

const newStep = () =>
  z.object({
    viewState: viewState(),
    beside: beside().optional(),
    ...caption(),
    place: place().optional(),
    marks: marks().optional(),
    reveal: reveal().optional(),
    dimRest: dimRest().optional(),
    emphasis: emphasis().optional(),
    play: play().optional(),
    advance: advance().optional(),
    pointTo: pointTo().optional(),
    pulse: pulse().optional(),
    transition: transition().optional(),
    notes: notes().optional(),
  });

type NewStepArgs = z.infer<ReturnType<typeof newStep>>;

const STEP_HELP = `A step's viewState is a view state as get_view_address takes it: ${STATE_HELP} beside shows another view state, given the same way, in the pane right of the tour's. Its caption has a title and a text, and place puts its card in a corner; marks highlight elements, relations, notes and arrows; reveal brings in more marks one press at a time, each with a sentence for the caption; dimRest dims the rest; emphasis style restyles what the step marks rather than laying a halo over it; play plays a scenario over the step's view from one of its steps to another, and its choices the alternative to play at each of the scenario's decisions (read_scenario gives their ids), every other decision playing its default; advance moves on by itself; pointTo ties the caption to one of the step's marks with a leader line; pulse sends a marker along a chain of relations, to show what follows what; transition cut always cuts, where the step would otherwise glide the shapes it shares with the step before into another view; notes are the speaker's. With escapeText: true, the caption's text, the reveals' texts and the notes are written as the characters they are (use it for outside material); the title is plain text always. The answer says how the camera gets to the step (glide, cut, stay, fit or follows, as check_tour says) and what check_tour warns about it, but for marks outside its camera, which only check_tour reads.`;

// ——— Read ———

const readTour = tool({
  name: 'read_tour',
  title: 'Read a tour',
  description: `Reads a tour: its steps in order, each with its number, id, view state, the view state beside it, caption (and its place, when fixed in a corner), marks, reveals, dimRest, emphasis, the scenario it plays, advance and its speaker notes, and what it names that the project no longer holds: such a step is kept and flagged as broken, and plays without it. Read it before changing a tour's steps; check_tour says how it plays.

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
    { "viewState": { "view": "system-overview" }, "title": "One request", "play": { "scenario": "patient-books-appointment", "from": 1, "to": 3 } },
    { "viewState": { "view": "system-overview" }, "title": "Who books", "marks": ["appointments-db", "api-writes-db"], "pointTo": "api-writes-db", "pulse": { "relations": ["agent-to-api", "api-writes-db"] } }
  ]
}`,
  input: {
    name: z.string().min(1).max(MAX_TOUR_NAME),
    description: z.string().max(MAX_TOUR_DESCRIPTION).optional().describe(TAKES_MARKDOWN),
    steps: z.array(newStep()).max(200).optional(),
    emphasis: tourEmphasis().optional(),
    escapeText: escapeTextInput(),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const steps: NewTourStep[] = [];
    for (const [at, given] of (args.steps ?? []).entries()) {
      const made = stepFrom(state, given, args.escapeText);
      if (!made.ok) return fail(`Not created: step ${at + 1}: ${made.message}`);
      steps.push(made.step);
    }
    return act(
      program,
      {
        type: 'create-tour',
        tour: withoutUndefined({
          name: args.name,
          description: escapedIf(args.escapeText, args.description),
          steps,
          emphasis: args.emphasis === 'style' ? ('style' as const) : undefined,
        }),
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
Example: { "tour": "how-booking-works", "at": 1, "viewState": { "view": "system-overview" }, "title": "Start here" }
Example, playing an alternative of a decision: { "tour": "how-booking-works", "viewState": { "view": "system-overview" }, "title": "When the week is full", "play": { "scenario": "patient-books-appointment", "from": "read-calendar", "to": "join-waiting-list", "choices": { "free-slot": "week-full" } } }
Example, building one picture up: { "tour": "how-booking-works", "viewState": { "view": "system-overview", "camera": { "x": 400, "y": 300, "zoom": 1 } }, "title": "Who takes part", "text": "First, the patient.", "marks": ["patient"], "reveal": [{ "marks": ["booking-agent", "patient-to-agent"], "text": "The agent answers on WhatsApp." }, { "marks": ["appointments-api"], "text": "It books through the API." }], "dimRest": true, "place": "top-right", "advance": 9000 }
Example, pointing at the reference that ties two tables and pulsing along the chain: { "tour": "audit-model", "viewState": { "view": "audit-tables" }, "title": "A finding belongs to a case", "text": "Each finding names its case, and each case its subject.", "marks": ["finding", "case", "finding-case"], "pointTo": "finding-case", "pulse": { "relations": ["finding-case", "case-subject"], "repeat": 2 } }
Example, a fresh start that always cuts: { "tour": "audit-model", "viewState": { "view": "billing" }, "title": "Billing, apart", "transition": "cut" }
Example, with the physical-space panel beside the canvas: { "tour": "pick-a-part", "viewState": { "view": "workcell", "select": ["wrist-camera"], "space": { "root": "arm", "camera": { "target": { "x": 0, "y": 0.8, "z": 0 }, "azimuth": 45, "elevation": 20, "distance": 2.5 } } }, "title": "The wrist camera", "text": "It looks down at the bin from the wrist." }
Example, a story beside the view of how its data is stored: { "tour": "audit-model", "viewState": { "view": "audit-story" }, "beside": { "view": "audit-tables", "select": ["finding"] }, "title": "Where a finding is kept", "marks": ["auditor-writes-finding"] }
Example, a caption quoting outside text as written: { "tour": "audit-model", "viewState": { "view": "audit-tables" }, "title": "The remark", "text": "From the DDL: *_id columns are keys", "escapeText": true }`,
  input: {
    tour: tourId(),
    at: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('The number the step takes, from 1; left out, it goes last.'),
    ...newStep().shape,
    escapeText: escapeTextInput(),
  },
  hints: WRITE,
  run: async (args, program) => {
    const { tour: tourArg, at, escapeText, ...given } = args;
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === tourArg);
    if (!tour) return fail(`There is no tour "${tourArg}". get_project lists the tours.`);
    const made = stepFrom(state, given, escapeText);
    if (!made.ok) return fail(`Not added: ${made.message}`);
    const where = Math.min(tour.steps.length, (at ?? tour.steps.length + 1) - 1);
    const steps: NewTourStep[] = [...tour.steps];
    steps.splice(where, 0, made.step);
    return act(program, { type: 'update-tour', id: tour.id, changes: { steps } }, async () => {
      const project = await program.project();
      const after = project.tours.find((each) => each.id === tour.id);
      return {
        step: after?.steps[where]?.id,
        number: where + 1,
        of: after?.steps.length,
        ...checkOfStep(project, after, where),
      };
    });
  },
});

const updateTourStep = tool({
  name: 'update_tour_step',
  title: 'Change a step of a tour',
  description: `Changes one step of a tour, as one undoable action: what you give replaces what the step has, and what you leave out stays. viewState replaces the step's view state as a whole, and reveal its reveals as a whole; null takes the beside view, text, marks, reveals, play, advance, pointTo, pulse or notes away, dimRest false stops dimming, emphasis null lets the step mark as its tour says, place auto lets the caption find its side again, and transition glide lets the step glide again. moveTo moves the step to another number. Fixing a broken step means giving it back what it names without what was deleted.

${STEP_HELP}

Example: { "tour": "how-booking-works", "step": 2, "text": "It answers in a second." }
Example: { "tour": "how-booking-works", "step": "the-agent", "viewState": { "view": "system-overview", "select": ["booking-agent"] }, "marks": null, "moveTo": 1 }
Example, turning steps 3 and 4, which showed the same view state, into one step with a reveal: { "tour": "how-booking-works", "step": 3, "reveal": [{ "marks": ["api-writes-db"], "text": "Then it writes the booking." }], "dimRest": true } and then remove_tour_step { "tour": "how-booking-works", "step": 4 }
Example: { "tour": "how-booking-works", "step": 5, "advance": "after-scenario", "place": "bottom-left" }
Example: { "tour": "how-booking-works", "step": 5, "reveal": null, "dimRest": false, "advance": null, "place": "auto" }
Example, playing the other alternative: { "tour": "how-booking-works", "step": 4, "play": { "scenario": "patient-books-appointment", "from": 4, "to": 5, "choices": { "free-slot": "has-slot" } } }
Example: { "tour": "audit-model", "step": 3, "pointTo": "finding-case", "pulse": { "relations": ["finding-case", "case-subject"] } }
Example: { "tour": "audit-model", "step": 3, "pointTo": null, "pulse": null, "transition": "cut" }
Example: { "tour": "audit-model", "step": 2, "beside": { "view": "audit-tables", "camera": { "x": 400, "y": 300, "zoom": 1 } } }`,
  input: {
    tour: tourId(),
    step: stepRef(),
    viewState: viewState().optional(),
    beside: beside().nullable().optional(),
    title: caption().title.optional(),
    text: caption().text.unwrap().nullable().optional(),
    place: place().optional(),
    marks: marks().nullable().optional(),
    reveal: reveal().nullable().optional(),
    dimRest: dimRest().optional(),
    emphasis: emphasis().nullable().optional(),
    play: play().nullable().optional(),
    advance: advance().nullable().optional(),
    pointTo: pointTo().nullable().optional(),
    pulse: pulse().nullable().optional(),
    transition: transition().optional(),
    notes: notes().nullable().optional(),
    escapeText: escapeTextInput(),
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
    if (args.beside === null) delete next.beside;
    else if (args.beside !== undefined) {
      const asked = askedState(args.beside, state);
      if (!asked.ok) return fail(`Not changed: Beside it: ${asked.message}`);
      next.beside = savedViewStateOf(asked.state);
    }
    if (args.title !== undefined) next.caption.title = args.title;
    if (args.text === null || args.text === '') delete next.caption.text;
    else if (args.text !== undefined) next.caption.text = escapedIf(args.escapeText, args.text);
    if (args.place !== undefined) {
      const corner = placeOf(args.place);
      if (corner === undefined) delete next.caption.place;
      else next.caption.place = corner;
    }
    if (args.marks === null || args.marks?.length === 0) delete next.marks;
    else if (args.marks !== undefined) next.marks = args.marks;
    if (args.pointTo === null) delete next.caption.pointTo;
    else if (args.pointTo !== undefined) next.caption.pointTo = args.pointTo;
    if (args.reveal !== undefined) {
      const reveals = revealsOf(args.reveal, args.escapeText);
      if (reveals === undefined) delete next.reveal;
      else next.reveal = reveals;
    }
    if (args.dimRest === false) delete next.dimRest;
    else if (args.dimRest === true) next.dimRest = true;
    if (args.emphasis === null) delete next.emphasis;
    else if (args.emphasis !== undefined) next.emphasis = args.emphasis;
    if (args.play === null) delete next.play;
    else if (args.play !== undefined) {
      const played = playFrom(state, args.play);
      if (!played.ok) return fail(`Not changed: ${played.message}`);
      next.play = played.play;
    }
    if (args.advance === null) delete next.advance;
    else if (args.advance !== undefined) next.advance = args.advance;
    if (args.transition === 'glide') delete next.transition;
    else if (args.transition === 'cut') next.transition = 'cut';
    if (args.pulse === null) delete next.pulse;
    else if (args.pulse !== undefined) next.pulse = pulseOf(args.pulse);
    if (args.notes === null || args.notes === '') delete next.notes;
    else if (args.notes !== undefined) next.notes = escapedIf(args.escapeText, args.notes);
    const steps = tour.steps.map((step, index) => (index === at ? next : step));
    const moved =
      args.moveTo === undefined
        ? steps
        : steps.toSpliced(at, 1).toSpliced(Math.min(steps.length - 1, args.moveTo - 1), 0, next);
    return act(
      program,
      { type: 'update-tour', id: tour.id, changes: { steps: moved } },
      async () => {
        const project = await program.project();
        const after = project.tours.find((each) => each.id === tour.id);
        const number = moved.indexOf(next) + 1;
        return { step: next.id, number, ...checkOfStep(project, after, number - 1) };
      },
    );
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
  description: `Changes a tour's name, description or emphasis, as one undoable action; null takes the description away. emphasis says how every step without an emphasis of its own marks what it marks.

Example: { "tour": "how-booking-works", "name": "Booking, step by step" }
Example: { "tour": "ticket-states", "emphasis": "style" }`,
  input: {
    tour: tourId(),
    name: z.string().min(1).max(MAX_TOUR_NAME).optional(),
    description: z
      .string()
      .max(MAX_TOUR_DESCRIPTION)
      .nullable()
      .optional()
      .describe(TAKES_MARKDOWN),
    emphasis: tourEmphasis().optional(),
    escapeText: escapeTextInput(),
  },
  hints: WRITE,
  run: async (args, program) =>
    act(program, {
      type: 'update-tour',
      id: args.tour,
      changes: withoutUndefined({
        name: args.name,
        description: escapedIf(args.escapeText, args.description),
        emphasis: args.emphasis,
      }),
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

// ——— Check ———

const checkTourTool = tool({
  name: 'check_tour',
  title: 'Check a tour',
  description: `Checks a tour as the stage plays it, step by step, on a screen of 1,366 by 768 pixels unless you give another, and changes nothing. For each step it says how the camera gets there from the step before:
- glide: along the smooth zoom-and-pan path, in at most 800 ms;
- cut: too far, or too much zoomed, to glide to, or into another view, so it cuts with a cross-fade; the first step with a camera always cuts;
- stay: the same view state as the step before, so only the marks and the caption change;
- fit: the step keeps no camera, so the canvas frames its selection, or else the whole view;
- follows: the step before keeps no camera, so the move starts wherever the canvas framed it, gliding when that is near enough.
For a step into another view, shapes says how its shapes get there: { "kind": "glide", "shared": n }, the n shapes it shares with the step before gliding to their new places; or { "kind": "cut", "reason" }, with a cross-fade, because the step asks to (opted-out), shares fewer than 3 shapes (too-few) or more than 400 (too-many). Under reduced motion every step cuts.
Then what to look at, as warnings by kind: marks-outside, what it marks that its camera does not show, read from where its view draws each shape now; marks-hidden, what it marks that its filters hide; caption-too-long, a text longer than its advance lets one read, which the stage waits for; could-be-reveal, a step showing the same view state as the one before, which could be a reveal of it; long-range, a scenario range of more than ten steps; cuts, a step that cuts within its view; glide-too-many, a step into another view sharing more than 400 shapes, so that it cuts; point-to-not-mark, a caption pointing at what the step does not mark, so that no leader line shows; pulse-not-chain, a pulse whose relations do not join, are gone, or are not drawn as lines by the view; broken, a step that names what the project no longer holds. cuts lists the steps after the first that cut, whatever the reason.

Use it after building or changing a tour, and fix what it says with update_tour_step: give a step a camera that shows its marks, or none so that it frames its selection; turn steps that could be reveals into one step's reveals; bring a far camera nearer, or let it cut; point at one of the step's marks, or mark what it points at; give a pulse relations in the order they join.

Example: { "tour": "how-booking-works" }
Example: { "tour": "how-booking-works", "screen": { "width": 1920, "height": 1080 } }`,
  input: {
    tour: tourId(),
    screen: z
      .object({
        width: z.number().int().min(320).max(16384),
        height: z.number().int().min(240).max(16384),
      })
      .optional()
      .describe('The screen it is played on, in pixels; 1,366 by 768 when left out.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const tour = state.tours.find((each) => each.id === args.tour);
    if (!tour) return fail(`There is no tour "${args.tour}". get_project lists the tours.`);
    const screen = args.screen ?? TOUR_CHECK_SCREEN;
    const { boundsOf, shapesOf } = await drawnScenes(state);
    const checked = checkTour(state, tour, { screen, boundsOf, shapesOf });
    const steps = checked.map((each, at) =>
      withoutUndefined({
        number: each.n,
        step: each.step,
        title: tour.steps[at]?.caption.title,
        camera: each.camera,
        shapes: each.shapes,
        warnings: each.warnings.length > 0 ? each.warnings : undefined,
      }),
    );
    return ok({
      tour: tour.id,
      name: tour.name,
      screen,
      steps,
      warnings: checked.reduce((total, each) => total + each.warnings.length, 0),
      cuts: checked.filter((each) => each.n > 1 && each.camera === 'cut').map((each) => each.n),
      glides: checked.filter((each) => each.shapes?.kind === 'glide').map((each) => each.n),
      note: 'Marks outside a camera are read from where each view draws its shapes now, with its collapsed containers collapsed: an element inside one is where the container is drawn.',
    });
  },
});

// ——— Play, as guidance ———

const playTour = tool({
  name: 'play_tour',
  title: 'Play a tour in the app',
  description: `Plays a tour full screen in the app the person has open, from its first step or from the step you name, as the tours panel's Play does: the panels hide, each step's caption shows in a card, its marks highlight and its scenario plays. From then on the tour is the person's: they move through it with the arrow keys and end it with Escape, and the tab goes back to where it was; you cannot move it on or end it. Playing it changes nothing in the project, and nothing is recorded. It answers how many open apps it reached; with none, nothing plays, and open_app opens one. Use it when the person asks to see a tour, rather than walking them through the same steps with guidance. It plays only in the tab the person used last, or the one you opened; their other tabs stay as they are.

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
  escapeText: boolean | undefined,
): { ok: true; step: NewTourStep } | { ok: false; message: string } {
  const asked = askedState(given.viewState, state);
  if (!asked.ok) return asked;
  const besideAsked = given.beside && askedState(given.beside, state);
  if (besideAsked && !besideAsked.ok) {
    return { ok: false, message: `Beside it: ${besideAsked.message}` };
  }
  let played: TourPlayback | undefined;
  if (given.play) {
    const checked = playFrom(state, given.play);
    if (!checked.ok) return checked;
    played = checked.play;
  }
  const caption: TourCaption = withoutUndefined({
    title: given.title,
    text: escapedIf(escapeText, given.text || undefined),
    place: placeOf(given.place),
    pointTo: given.pointTo,
  });
  return {
    ok: true,
    step: withoutUndefined({
      viewState: savedViewStateOf(asked.state),
      beside: besideAsked ? savedViewStateOf(besideAsked.state) : undefined,
      caption,
      marks: given.marks && given.marks.length > 0 ? given.marks : undefined,
      play: played,
      reveal: revealsOf(given.reveal, escapeText),
      dimRest: given.dimRest === true ? (true as const) : undefined,
      emphasis: given.emphasis,
      advance: given.advance,
      transition: given.transition === 'cut' ? ('cut' as const) : undefined,
      pulse: given.pulse ? pulseOf(given.pulse) : undefined,
      notes: escapedIf(escapeText, given.notes || undefined),
    }),
  };
}

/** A caption's corner as the file keeps it: none for `auto`, which is never written. */
function placeOf(
  given: (typeof CAPTION_PLACES)[number] | undefined,
): TourCaption['place'] | undefined {
  return given === undefined || given === 'auto' ? undefined : given;
}

/** Reveals as the file keeps them: none for an empty list, and no empty text. */
function revealsOf(
  given: readonly { marks: Id[]; text?: string | undefined }[] | null | undefined,
  escapeText: boolean | undefined,
): TourReveal[] | undefined {
  if (!given || given.length === 0) return undefined;
  return given.map((each) =>
    withoutUndefined({ marks: each.marks, text: escapedIf(escapeText, each.text || undefined) }),
  );
}

/** A pulse as the file keeps it: running once is never written. */
function pulseOf(given: { relations: Id[]; repeat?: number | undefined }): TourPulse {
  return withoutUndefined({
    relations: given.relations,
    repeat: given.repeat === undefined || given.repeat === 1 ? undefined : given.repeat,
  });
}

/**
 * What check_tour says of one step of a tour as it is now, without reading marks outside its camera:
 * how the camera gets there, and its warnings' words when it has any.
 */
function checkOfStep(
  project: ProjectSnapshot,
  tour: TourFile | undefined,
  at: number,
): { check?: { camera: string; warnings?: string[] } } {
  if (!tour?.steps[at]) return {};
  const checked = checkTour(project, tour)[at];
  if (!checked) return {};
  const warnings = checked.warnings.map((each) => each.message);
  return {
    check: { camera: checked.camera, ...(warnings.length > 0 ? { warnings } : {}) },
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
  const choices =
    given.choices && Object.keys(given.choices).length > 0 ? given.choices : undefined;
  if (choices) {
    const problem = choicesProblem(scenario, choices);
    if (problem) return { ok: false, message: problem };
  }
  // A range its choices do not play is refused, with the choices that would play it.
  for (const id of [from, to]) {
    const at = id === undefined ? -1 : scenario.steps.findIndex((each) => each.id === id);
    if (id === undefined || at < 0 || playedSteps(scenario, choices).includes(at)) continue;
    const reaching = choicesToReach(scenario, id, choices);
    const hint = reaching
      ? ` Give choices ${JSON.stringify(reaching)}, which play it.`
      : ' No choices play it.';
    return {
      ok: false,
      message: `With ${choices ? 'the choices given' : 'every decision playing its default'}, the scenario "${scenario.name}" does not play the step "${id}".${hint}`,
    };
  }
  return { ok: true, play: withoutUndefined({ scenario: scenario.id, from, to, choices }) };
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
    emphasis: tour.emphasis ?? 'halo',
    steps,
    brokenSteps: steps.filter((step) => 'broken' in step).map((step) => step.number),
  };
}

/**
 * Where each view draws an element or a relation now, for check_tour's marks outside a camera, and
 * the shapes each view draws, for which steps glide, from the app's own scene, as the Tours panel
 * reads them (`app/src/tours/drawn-bounds.ts`).
 */
async function drawnScenes(project: ProjectSnapshot): Promise<{
  boundsOf: (view: Id, id: Id) => TourRect | undefined;
  shapesOf: (view: Id) => readonly GlideShape[] | undefined;
}> {
  const { drawnBounds, drawnShapes } = await import('@visual-anything/app/src/tours/drawn-bounds');
  return { boundsOf: drawnBounds(project), shapesOf: drawnShapes(project) };
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
  checkTourTool,
  playTour,
];
