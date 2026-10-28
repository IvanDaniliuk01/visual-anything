/**
 * Claude's scenario tools: creating a scenario from steps, which is how a description or a pasted log
 * becomes one, its decisions between labelled alternatives included (ADR 0078); editing it with the
 * core's step-edit and decision helpers as one undoable action; deleting it; and playing it in the
 * open app as live guidance (ADR-0031): opening it, playing and pausing, going from step to step, with
 * the alternatives to play at its decisions, and choosing one. Playing and choosing change nothing;
 * the person can pause, choose again or close it at any time.
 */
import {
  brokenStepsOf,
  choicesToReach,
  chosenAlternative,
  deleteStep,
  describeStep,
  entryOfStep,
  modelIndexOf,
  moveStep,
  readBlocks,
  recordRelation,
  repairStep,
  scenarioTimeline,
  setStepData,
  takeOutOfStep,
  type Guidance,
  type NewStep,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  DecisionBlock,
  DecisionChoices,
  Id,
  JsonValue,
  ScenarioFile,
  Step,
} from '@visual-anything/schema';
import { z } from 'zod';
import type { Program } from './bridge';
import {
  DECISION_OPS,
  alternativesHolding,
  alternativesPlayed,
  applyDecisionEdit,
  choicesProblem,
  decisionsProblem,
  flattenTree,
  indexOf,
  keptWith,
  listed,
  newStepId,
  takenIn,
  type DecisionEdit,
  type GivenStep,
  type TreeItem,
  type Working,
} from './decision-edits';
import {
  DELETE,
  GUIDE,
  ONE_TAB,
  WRITE,
  act,
  counted,
  fail,
  guideApps,
  id,
  tool,
  withoutUndefined,
} from './kit';
import type { Tool, ToolOutcome } from './tools';

const json = () => z.unknown().describe('Any JSON value.');

const newStep = () =>
  z.object({
    description: z.string().describe('What happens in this step, in a short sentence.'),
    relations: z
      .array(id())
      .min(1)
      .describe('The relations it activates at the same time, each once: ids from the model.'),
    dataIn: json().optional().describe('What the step takes in, as JSON.'),
    dataOut: json().optional().describe('What the step produces, as JSON.'),
  });

const stepRef = () =>
  z
    .union([id(), z.number().int().min(1)])
    .describe(
      'The step: its id from read_scenario, or its number from 1, counted in the steps as the edits before this one left them.',
    );

const playedScenario = () => id().describe('The scenario, by id: get_project lists them.');

const question = () =>
  z
    .string()
    .min(1)
    .max(200)
    .describe('What the decision decides, as a question: "Is every item in stock?".');

const label = () =>
  z
    .string()
    .min(1)
    .max(200)
    .describe(
      'The alternative’s label, a short answer to the question: "Yes", "No, it is sold out".',
    );

const ends = () =>
  z
    .boolean()
    .describe('true when the scenario ends after this alternative, as an error does, or a break.');

/** An alternative of a decision in a tree of steps, holding `inner` items. */
const givenAlternative = (inner: z.ZodType) =>
  z.object({
    label: label(),
    steps: z
      .array(inner)
      .max(10000)
      .describe(
        'What plays when it is chosen: its steps in order, and decisions inside it; none for the way where nothing happens, as an opt does.',
      ),
    ends: ends().optional(),
  });

/** A decision in a tree of steps, whose alternatives hold `inner` items. */
const givenDecision = (inner: z.ZodType) =>
  z.object({
    decision: question(),
    alternatives: z.array(givenAlternative(inner)).min(2).max(8),
    default: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'The label of the alternative that plays when nothing chooses; the first when left out.',
      ),
  });

/** A step, or a decision holding more, nested at most `depth` decisions deep. */
const treeItem = (depth: number): z.ZodType =>
  depth === 0 ? newStep() : z.union([newStep(), givenDecision(treeItem(depth - 1))]);

const choicesInput = () =>
  z
    .record(id(), id())
    .describe(
      'The alternative to play at each decision, by the decision’s id, as read_scenario gives them: { "<decision id>": "<alternative id>" }. They replace the tab’s choices: a decision you do not name plays its default, so {} plays every default. Left out, the tab’s choices stay.',
    );

// ——— Create, edit and delete ———

const createScenarioFromSteps = tool({
  name: 'create_scenario_from_steps',
  title: 'Create a scenario from steps',
  description: `Creates a scenario over a view from its steps, as one undoable action. Each step activates one or more relations of the model at the same time, says in a short sentence what happens, and may say what it takes in and produces, as JSON.

Use it to turn a description of an example, or a log the person pasted, into a scenario: map each line or sentence to the relations of the model it crosses (find_relations, get_item), in order, one step per moment; lines that happen at once share a step; take data in and out from the payloads the log shows. When a line matches nothing in the model, do not guess: ask the person what it maps to, or offer to add the relation first. A relation the model does not have is refused with its id. Then offer to play it with play_scenario.

Where the example can go more than one way, put a decision among its steps: { "decision": "<question>", "alternatives": [{ "label": "<answer>", "steps": [...] }, ...] }, two to eight alternatives, each with the steps that play when it is chosen, and decisions inside them up to three deep. An alternative with no steps is the way where nothing happens; one with "ends": true ends the scenario after it, as an error does; "default" names, by its label, the alternative that plays when nothing chooses, the first otherwise. Steps are numbered in reading order, every alternative's included. The person, you (choose_alternative) or a tour choose which alternative plays; nothing in the scenario is a condition.

An OpenTelemetry trace, or a Mermaid or PlantUML sequence diagram, becomes a scenario the same way: one step per call between services (a CLIENT span and its SERVER span) or per message, in the order they start; calls at the same time share a step; a reply right after its request is that step's dataOut; alt and opt blocks become decisions, a break an alternative that ends. Logs of the same process that differ become one scenario with a decision where they part. Leave personal data and secrets out of descriptions and data.

Example: {
  "name": "Patient books an appointment",
  "view": "system-overview",
  "description": "From the log of booking 1042.",
  "steps": [
    { "description": "The patient asks on WhatsApp.", "relations": ["patient-to-whatsapp"], "dataIn": { "text": "Can I see a cardiologist?" } },
    { "description": "The agent reads free slots and holds one.", "relations": ["agent-to-api", "api-reads-db"], "dataOut": { "slot": "2026-11-03T10:00" } }
  ]
}
Example, with a decision: {
  "name": "Patient books, or waits",
  "view": "system-overview",
  "steps": [
    { "description": "The agent asks for free slots.", "relations": ["agent-to-api"] },
    { "decision": "Is there a free slot?", "alternatives": [
      { "label": "Yes", "steps": [{ "description": "The API books it.", "relations": ["api-writes-db"] }] },
      { "label": "No, the week is full", "ends": true, "steps": [{ "description": "The agent offers the waiting list.", "relations": ["agent-to-patient"] }] }
    ] },
    { "description": "The reminder service schedules a reminder.", "relations": ["api-to-reminders"] }
  ]
}`,
  input: {
    name: z.string().min(1),
    description: z.string().optional(),
    view: id().describe('The view it plays over.'),
    steps: z
      .array(treeItem(3))
      .describe('Its steps in order, and its decisions among them, as the description says.'),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    if (!state.views.some((view) => view.id === args.view)) {
      return fail(`There is no view "${args.view}". get_project lists the views.`);
    }
    const tree = treeOf(args.steps as TreeArgs[]);
    // Without decisions, the steps go as before, and the core gives them their ids.
    if (!tree.some((item) => 'decision' in item)) {
      const steps = tree as GivenStep[];
      const unknown = unknownRelations(state, steps);
      if (unknown !== undefined) return fail(`Not created: ${unknown}`);
      return act(
        program,
        {
          type: 'create-scenario',
          scenario: withoutUndefined({
            name: args.name,
            description: args.description,
            view: args.view,
            steps,
          }),
        },
        (answer) => ({ scenario: answer.created[0], steps: steps.length, next: NEXT }),
      );
    }
    const flat = flattenTree(tree, takenIn(state, undefined));
    if (!flat.ok) return fail(`Not created: ${flat.message}`);
    const unknown = unknownRelations(state, flat.steps);
    if (unknown !== undefined) return fail(`Not created: ${unknown}`);
    return act(
      program,
      {
        type: 'create-scenario',
        scenario: withoutUndefined({
          name: args.name,
          description: args.description,
          view: args.view,
          steps: flat.steps,
          blocks: flat.blocks,
        }),
      },
      (answer) => ({
        scenario: answer.created[0],
        steps: flat.steps.length,
        decisions: flat.blocks.length,
        next: `${NEXT} read_scenario numbers its steps and gives its decisions; choose_alternative, or choices in play_scenario and go_to_step, plays a given alternative.`,
      }),
    );
  },
});

const NEXT =
  'Play it in the app with play_scenario, or step through it with go_to_step and next_step while you explain.';

const edit = () =>
  z.discriminatedUnion('op', [
    z.object({
      op: z.literal('add'),
      step: newStep(),
      at: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('The number it takes, from 1; left out, it goes last.'),
    }),
    z.object({
      op: z.literal('move'),
      step: stepRef(),
      to: z.number().int().min(1).describe('The number it takes, from 1.'),
    }),
    z.object({ op: z.literal('remove'), step: stepRef() }),
    z.object({ op: z.literal('describe'), step: stepRef(), description: z.string() }),
    z.object({
      op: z.literal('set-data'),
      step: stepRef(),
      dataIn: json().optional().describe('What it takes in; null takes it away.'),
      dataOut: json().optional().describe('What it produces; null takes it away.'),
    }),
    z.object({ op: z.literal('add-relation'), step: stepRef(), relation: id() }),
    z.object({ op: z.literal('remove-relation'), step: stepRef(), relation: id() }),
    z.object({
      op: z.literal('repair'),
      step: stepRef(),
      by: id().optional().describe('A relation of the model to use in place of the missing ones.'),
    }),
    z.object({
      op: z.literal('insert'),
      step: newStep(),
      after: stepRef()
        .optional()
        .describe('The step it follows; it joins every alternative that holds that step.'),
      afterDecision: id()
        .optional()
        .describe(
          'The decision it follows, by id: it goes after the decision, in every alternative that holds the decision.',
        ),
    }),
    z.object({
      op: z.literal('add-alternative'),
      label: label(),
      steps: z
        .array(newStep())
        .max(1000)
        .optional()
        .describe('Its steps, in order; none for the way where nothing happens.'),
      ends: ends().optional(),
      after: stepRef()
        .optional()
        .describe(
          'The step it follows: it joins the decision that starts right after that step, or starts a new one there.',
        ),
      decision: id().optional().describe('The decision it joins, last, by id.'),
      question: question().optional().describe('For a new decision: its question.'),
      keptLabel: label()
        .optional()
        .describe(
          'For a new decision: the label of its first alternative, which keeps the steps that followed, up to the end of the alternative they are in.',
        ),
    }),
    z.object({
      op: z.literal('add-decision'),
      question: question(),
      alternatives: z
        .array(
          z.object({
            label: label(),
            steps: z
              .array(stepRef())
              .describe(
                'Its steps, which follow one another, and those of the next alternative follow them.',
              ),
            ends: ends().optional(),
          }),
        )
        .min(2)
        .max(8),
      default: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'The label of the alternative that plays when nothing chooses; the first when left out.',
        ),
    }),
    z.object({ op: z.literal('rejoin'), step: stepRef() }),
    z.object({ op: z.literal('remove-decision'), decision: id() }),
    z.object({
      op: z.literal('set-decision'),
      decision: id(),
      question: question().optional(),
      default: id()
        .nullable()
        .optional()
        .describe('The alternative, by id, that plays when nothing chooses; null for the first.'),
    }),
    z.object({
      op: z.literal('set-alternative'),
      alternative: id(),
      label: label().optional(),
      ends: ends().optional(),
    }),
    z.object({ op: z.literal('remove-decisions') }),
  ]);

type EditArgs = z.infer<ReturnType<typeof edit>>;

const updateScenario = tool({
  name: 'update_scenario',
  title: 'Change a scenario',
  description: `Changes a scenario as one undoable action: its name, description or view, and its steps and decisions through edits applied in order. An edit adds a step (last, or at a number), moves one, removes one, sets its description, sets or takes away its data in and out (null takes it away), adds a relation to it or takes one out, or repairs it.

A broken step uses a relation that was deleted; read_scenario lists them, and which alternative each is in. Repair one by taking the missing relations out, with by naming a relation of the model to use in their place when none would be left; any change to a broken step's relations also leaves the missing ones out. A relation the model does not have is refused with its id: ask the person what it should be.

Decisions (read_scenario gives their ids and those of their alternatives):
- insert puts a new step after a step, in every alternative that holds that step, or after a decision (afterDecision), outside it: inside an alternative, use insert rather than add, which knows nothing of alternatives;
- add-alternative adds an alternative with its steps after a step: it joins the decision that starts right after that step, or starts a new decision there, whose question you give and whose first alternative, keptLabel, keeps the steps that followed; with decision instead of after, it joins that decision, last. With no steps, it is the way where nothing happens; ends ends the scenario after it;
- add-decision groups steps that follow one another into a decision's alternatives;
- rejoin makes a step of an alternative, and those after it in that alternative, the steps every alternative goes on to;
- set-decision changes a decision's question or its default, and set-alternative an alternative's label or whether it ends the scenario;
- remove-decision takes a decision away, keeping the steps of the alternative it plays by default and deleting the others' steps: it is refused until you pass cascade: true, so tell the person first;
- remove-decisions takes every decision away, keeping every step in order, as when they no longer hold together.
Decisions that would not hold together are refused in the core's words.

Example: {
  "scenario": "patient-books-appointment",
  "name": "Patient books a cardiology appointment",
  "edits": [
    { "op": "add", "at": 2, "step": { "description": "The channel checks who the patient is.", "relations": ["whatsapp-to-agent"] } },
    { "op": "describe", "step": "hold-slot", "description": "The agent holds the 10:00 slot." },
    { "op": "set-data", "step": 4, "dataOut": { "slot": "10:00" } },
    { "op": "repair", "step": "send-reminder", "by": "api-to-reminders" },
    { "op": "move", "step": 5, "to": 1 }
  ]
}
Example, with decisions: {
  "scenario": "patient-books-appointment",
  "edits": [
    { "op": "add-alternative", "after": 3, "question": "Is there a free slot?", "keptLabel": "Yes", "label": "No, the week is full", "ends": true, "steps": [{ "description": "The agent offers the waiting list.", "relations": ["agent-to-patient"] }] },
    { "op": "insert", "after": "hold-slot", "step": { "description": "The API confirms the slot.", "relations": ["api-to-agent"] } },
    { "op": "set-decision", "decision": "is-there-a-free-slot-k3f9q2", "question": "Is a slot free this week?" }
  ]
}`,
  input: {
    scenario: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    view: id().optional().describe('Another view for it to play over.'),
    edits: z.array(edit()).optional(),
    cascade: z
      .boolean()
      .optional()
      .describe(
        'true once the person knows that remove-decision deletes the steps of the alternatives it does not keep.',
      ),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const scenario = state.scenarios.find((each) => each.id === args.scenario);
    if (!scenario) return fail(`There is no scenario "${args.scenario}". get_project lists them.`);
    if (
      args.name === undefined &&
      args.description === undefined &&
      args.view === undefined &&
      (args.edits ?? []).length === 0
    ) {
      return fail('Give something to change: a name, a description, a view or edits.');
    }
    let steps: NewStep[] | undefined;
    let blocks: DecisionBlock[] | null | undefined;
    if (args.edits !== undefined && args.edits.length > 0) {
      const edited = editScenario(state, scenario, args.edits, args.cascade === true);
      if (!edited.ok) return fail(`Not changed: ${edited.message}`);
      steps = edited.steps;
      blocks = edited.blocks;
    }
    return act(
      program,
      {
        type: 'update-scenario',
        id: scenario.id,
        changes: withoutUndefined({
          name: args.name,
          description: args.description,
          view: args.view,
          steps,
          blocks,
        }),
      },
      async () => {
        const project = await program.project();
        const now = project.scenarios.find((each) => each.id === scenario.id);
        if (!now) return {};
        const broken = brokenStepsOf(project, now).map((each) => each.index + 1);
        return {
          steps: now.steps.length,
          ...(now.blocks === undefined ? {} : { decisions: now.blocks.length }),
          ...(broken.length > 0 ? { brokenSteps: broken } : {}),
        };
      },
    );
  },
});

const deleteScenario = tool({
  name: 'delete_scenario',
  title: 'Delete a scenario',
  description: `Deletes a scenario, as one undoable action. The model and the views are untouched. Ask the person first.

Example: { "scenario": "draft-scenario" }`,
  input: { scenario: id() },
  hints: DELETE,
  run: async (args, program) => act(program, { type: 'delete-scenario', id: args.scenario }),
});

// ——— Play and step, as guidance ———

const CHOICES_HELP =
  'At a scenario with decisions, choices plays the alternatives you name, and every other decision its default; the answer says which alternative plays at each decision playback reaches.';

const openScenario = tool({
  name: 'open_scenario',
  title: 'Open a scenario in the app',
  description: `Opens a scenario in the scenario panel of the app the person has open, and its view, at its first step, paused. Each decision plays its default unless choices names another. It changes nothing in the project, and the person can close it. ${ONE_TAB}

Example: { "scenario": "patient-books-appointment" }
Example: { "scenario": "patient-books-appointment", "choices": { "free-slot": "week-full" } }`,
  input: { scenario: playedScenario(), choices: choicesInput().optional() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'open', { choices: args.choices }),
});

const playScenario = tool({
  name: 'play_scenario',
  title: 'Play a scenario in the app',
  description: `Plays a scenario in the app the person has open, from the step it is on, or from the first once it has played to the end: it opens the scenario and its view first when needed, highlights each step's relations with a marker travelling along them, and goes on step after step. Steps inside a container the view shows collapsed play as one aggregated step. ${CHOICES_HELP} Playing changes nothing in the project, and the person can pause it at any time. To start elsewhere, call go_to_step first. ${ONE_TAB}

Example: { "scenario": "patient-books-appointment" }
Example: { "scenario": "patient-books-appointment", "choices": { "free-slot": "week-full" } }`,
  input: { scenario: playedScenario(), choices: choicesInput().optional() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'play', { choices: args.choices }),
});

const pauseScenario = tool({
  name: 'pause_scenario',
  title: 'Pause a scenario in the app',
  description: `Pauses a scenario playing in the app the person has open, on the step it is on.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: playedScenario() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'pause'),
});

const goToStep = tool({
  name: 'go_to_step',
  title: 'Go to a step of a scenario',
  description: `Shows one step of a scenario in the app the person has open: it opens the scenario and its view first when needed, then plays that step's travel once and holds there, or goes on from it when the scenario is playing. Name the step by its number from 1 or by its id, from read_scenario. A step in an alternative not chosen chooses the alternatives that reach it, and says so. ${CHOICES_HELP} Use it with show_caption to walk the person through the steps one at a time. ${ONE_TAB}

Example: { "scenario": "patient-books-appointment", "step": 3 }
Example: { "scenario": "patient-books-appointment", "step": "hold-slot" }
Example: { "scenario": "patient-books-appointment", "step": 5, "choices": { "free-slot": "week-full" } }`,
  input: {
    scenario: playedScenario(),
    step: z
      .union([z.number().int().min(1), id()])
      .describe('The step: its number from 1, or its id.'),
    choices: choicesInput().optional(),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const scenario = state.scenarios.find((each) => each.id === args.scenario);
    if (!scenario) return fail(`There is no scenario "${args.scenario}". get_project lists them.`);
    const at =
      typeof args.step === 'number'
        ? args.step - 1
        : scenario.steps.findIndex((step) => step.id === args.step);
    const step = scenario.steps[at];
    if (at < 0 || !step) {
      return fail(
        `The scenario "${scenario.name}" has no step ${typeof args.step === 'number' ? args.step : `"${args.step}"`}: it has ${counted(scenario.steps.length, 'step')}.`,
      );
    }
    const about = {
      step: withoutUndefined({
        number: at + 1,
        id: step.id,
        description: step.description,
        playsAs: playsAs(state, scenario, at),
      }),
    };
    if (args.choices === undefined) {
      const holding = alternativesHolding(scenario, step.id);
      return play(program, scenario.id, 'go-to-step', {
        step: at,
        more: {
          ...about,
          ...(holding.length > 0
            ? {
                chooses: holding,
                note: 'Going there chooses the alternatives that hold the step; the tab’s other choices stay.',
              }
            : {}),
        },
      });
    }
    const problem = choicesProblem(scenario, args.choices);
    if (problem !== undefined) return fail(problem);
    const reached = choicesToReach(scenario, step.id, args.choices);
    if (!reached) {
      return fail(
        `No choices reach step ${at + 1} of "${scenario.name}": an alternative before it ends the scenario, whichever is chosen.`,
      );
    }
    const changed = changedChoices(scenario, args.choices, reached);
    return play(program, scenario.id, 'go-to-step', {
      step: at,
      choices: reached,
      more: {
        ...about,
        ...(changed.length > 0
          ? {
              note: `Step ${at + 1} is in ${listed(changed.map((each) => `"${each.label}" at "${each.question}"`))}, so that plays there, in place of what your choices gave.`,
            }
          : {}),
      },
    });
  },
});

const nextStep = tool({
  name: 'next_step',
  title: 'Go to the next step',
  description: `Goes to the next step of a scenario in the app the person has open, from the step it is on there; at the last step it stays. An aggregated step counts as one, and at a decision it goes on in the alternative chosen.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: playedScenario() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'next-step'),
});

const previousStep = tool({
  name: 'previous_step',
  title: 'Go to the previous step',
  description: `Goes to the previous step of a scenario in the app the person has open, from the step it is on there; at the first step it plays that one again.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: playedScenario() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'previous-step'),
});

const chooseAlternative = tool({
  name: 'choose_alternative',
  title: 'Choose an alternative at a decision',
  description: `Chooses the alternative that plays at a decision of a scenario, in the app the person has open, as the decision card does: it opens the scenario and its view first when needed; playback stays on its step while the alternative chosen still plays it, and otherwise goes to its first step; and the canvas draws the relations that only the other alternatives use dimmed and dashed. The choice is the tab's: it changes nothing in the project, is never saved, and the person chooses again at will. read_scenario gives the decisions and their alternatives by id. Use it to show "what happens if the week is full", then play on with play_scenario. ${ONE_TAB}

Example: { "scenario": "patient-books-appointment", "decision": "free-slot", "alternative": "week-full" }`,
  input: {
    scenario: playedScenario(),
    decision: id().describe('The decision, by id, from read_scenario.'),
    alternative: id().describe('The alternative of that decision to play, by id.'),
  },
  hints: GUIDE,
  run: async (args, program) => {
    const state = await program.project();
    const scenario = state.scenarios.find((each) => each.id === args.scenario);
    if (!scenario) return fail(`There is no scenario "${args.scenario}". get_project lists them.`);
    if (scenario.blocks === undefined || scenario.blocks.length === 0) {
      return fail(`The scenario "${scenario.name}" has no decisions: there is nothing to choose.`);
    }
    const problem = choicesProblem(scenario, { [args.decision]: args.alternative });
    if (problem !== undefined) return fail(problem);
    const block = scenario.blocks.find((each) => each.id === args.decision) as DecisionBlock;
    const alternative = block.alternatives.find((each) => each.id === args.alternative);
    const numbers = (alternative?.steps ?? []).flatMap((each) => {
      const at = scenario.steps.findIndex((step) => step.id === each);
      return at < 0 ? [] : [at + 1];
    });
    return guideApps(
      program,
      {
        kind: 'playback',
        scenario: scenario.id,
        action: 'choose',
        decision: block.id,
        alternative: args.alternative,
      },
      {
        chose: {
          decision: block.id,
          question: block.question,
          alternative: args.alternative,
          label: alternative?.label,
          steps: numbers,
          ...(alternative?.ends ? { ends: true } : {}),
        },
        note:
          numbers.length === 0
            ? 'Nothing happens in that alternative: playback goes on after the decision. The tab’s other choices stay.'
            : 'The tab’s other choices stay; the person can choose again on the decision card.',
      },
    );
  },
});

/** Claude's scenario tools, in the order Claude reads them. */
export const SCENARIO_TOOLS: readonly Tool[] = [
  createScenarioFromSteps,
  updateScenario,
  deleteScenario,
  openScenario,
  playScenario,
  pauseScenario,
  goToStep,
  nextStep,
  previousStep,
  chooseAlternative,
];

// ——— Helpers ———

type PlaybackAction = Extract<Guidance, { kind: 'playback' }>['action'];

/**
 * Sends playback guidance for a scenario that exists, and that has steps to play unless opened, with
 * the choices given, checked against the scenario; the answer says which alternatives play.
 */
async function play(
  program: Program,
  scenarioId: Id,
  action: PlaybackAction,
  options: {
    step?: number;
    choices?: DecisionChoices | undefined;
    more?: Record<string, unknown>;
  } = {},
): Promise<ToolOutcome> {
  const state = await program.project();
  const scenario = state.scenarios.find((each) => each.id === scenarioId);
  if (!scenario) return fail(`There is no scenario "${scenarioId}". get_project lists them.`);
  if (action !== 'open' && scenario.steps.length === 0) {
    return fail(
      `The scenario "${scenario.name}" has no steps yet: add some with update_scenario, or ask the person to record them.`,
    );
  }
  const { step, choices } = options;
  if (choices !== undefined) {
    const problem = choicesProblem(scenario, choices);
    if (problem !== undefined) return fail(problem);
  }
  return guideApps(
    program,
    {
      kind: 'playback',
      scenario: scenario.id,
      action,
      ...(step === undefined ? {} : { step }),
      ...(choices === undefined ? {} : { choices }),
    },
    { ...options.more, ...decisionsSaid(scenario, action, choices) },
  );
}

/**
 * What a playback answer says of a scenario's decisions: which alternative plays at each decision
 * playback reaches, when that is known, as with choices given or on opening, which starts from every
 * default; otherwise that the tab's choices play.
 */
function decisionsSaid(
  scenario: ScenarioFile,
  action: PlaybackAction,
  choices: DecisionChoices | undefined,
): Record<string, unknown> {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return {};
  if (choices !== undefined || action === 'open') {
    return { plays: alternativesPlayed(scenario, choices ?? {}) };
  }
  if (action !== 'play') return {};
  return {
    decisions:
      'It plays the alternatives chosen in the tab: each decision’s default unless the person, or choose_alternative, chose another. Pass choices to play given ones.',
  };
}

/** The decisions where reaching a step plays another alternative than the choices gave. */
function changedChoices(
  scenario: ScenarioFile,
  given: DecisionChoices,
  reached: DecisionChoices,
): { question: string; label: string }[] {
  return (scenario.blocks ?? []).flatMap((block) => {
    const before = chosenAlternative(block, given);
    const after = chosenAlternative(block, reached);
    return before.id === after.id ? [] : [{ question: block.question, label: after.label }];
  });
}

/** How a step plays over its scenario's view now: on its own, or inside an aggregated step. */
function playsAs(state: ProjectSnapshot, scenario: ScenarioFile, at: number): string | undefined {
  const timeline = scenarioTimeline(state, scenario);
  const entry = timeline.entries[entryOfStep(timeline, at) ?? -1];
  if (entry?.kind !== 'aggregated') return undefined;
  const container = modelIndexOf(state).element(entry.container)?.name ?? entry.container;
  return `It plays inside the aggregated step of steps ${entry.first + 1} to ${entry.first + entry.count}, since the view collapses “${container}”; expand it to see the step on its own.`;
}

type StepArgs = z.infer<ReturnType<typeof newStep>>;
type TreeArgs =
  | StepArgs
  | {
      decision: string;
      alternatives: { label: string; steps: TreeArgs[]; ends?: boolean | undefined }[];
      default?: string | undefined;
    };

/** A step to send, without the keys left out. */
function stepOf(step: StepArgs): GivenStep {
  return withoutUndefined({
    description: step.description,
    relations: step.relations,
    dataIn: step.dataIn as JsonValue | undefined,
    dataOut: step.dataOut as JsonValue | undefined,
  });
}

/** A tree of steps and decisions as the arguments give it, each step without the keys left out. */
function treeOf(items: readonly TreeArgs[]): TreeItem[] {
  return items.map((item) =>
    'decision' in item
      ? {
          decision: item.decision,
          alternatives: item.alternatives.map((alternative) => ({
            label: alternative.label,
            steps: treeOf(alternative.steps),
            ends: alternative.ends,
          })),
          default: item.default,
        }
      : stepOf(item),
  );
}

/** What steps use that the model does not have, in words; undefined when they use none. */
function unknownRelations(
  state: ProjectSnapshot,
  steps: readonly { relations: readonly Id[] }[],
  nameOf: (position: number) => string = (position) => `step ${position + 1}`,
): string | undefined {
  const index = modelIndexOf(state);
  const lines = steps.flatMap((step, position) => {
    const missing = step.relations.filter((relation) => index.relation(relation) === undefined);
    return missing.length === 0
      ? []
      : [`${nameOf(position)} uses ${missing.map((each) => `"${each}"`).join(', ')}`];
  });
  if (lines.length === 0) return undefined;
  return `the model has no relation with these ids: ${lines.join('; ')}. Ask the person what those lines map to, or offer to add the relations first with add_to_model; find_relations finds the ones that exist.`;
}

/**
 * The steps and decisions of a scenario after Claude's edits, applied in order with the core's
 * helpers: the steps, and the decisions when an edit changed them (`null` for none), to send.
 */
function editScenario(
  state: ProjectSnapshot,
  scenario: ScenarioFile,
  edits: readonly EditArgs[],
  cascade: boolean,
):
  | { ok: true; steps: NewStep[]; blocks: DecisionBlock[] | null | undefined }
  | { ok: false; message: string } {
  const index = modelIndexOf(state);
  const exists = (relation: Id) => index.relation(relation) !== undefined;
  const ids = takenIn(state, scenario);
  const holdingBefore = decisionsProblem(scenario) === undefined;
  let working: Working = {
    steps: scenario.steps.map((step) => ({ ...step })),
    blocks: scenario.blocks,
  };
  // Whether the decisions are sent: once an edit changes them, they go whole.
  let decided = false;
  // Whether an edit that knows nothing of alternatives added or moved a step.
  let placedPlainly = false;
  for (const [position, change] of edits.entries()) {
    const failed = (message: string) => ({
      ok: false as const,
      message: `edit ${position + 1} (${change.op}): ${message}`,
    });

    if (isDecisionArgs(change)) {
      const given = newStepsOf(change);
      const unknown = unknownRelations(state, given, (at) =>
        given.length === 1 ? 'the new step' : `new step ${at + 1}`,
      );
      if (unknown !== undefined) return failed(unknown);
      const edited = applyDecisionEdit(scenario, working, decisionEditOf(change), ids);
      if (!edited.ok) return failed(edited.message);
      if (edited.removed !== undefined && edited.removed.length > 0 && !cascade) {
        return { ok: false, message: removalRefusal(working, change, edited.removed) };
      }
      working = edited.working;
      decided = true;
      continue;
    }

    let steps: NewStep[] = working.steps;
    if (change.op === 'add') {
      const unknown = unknownRelations(
        state,
        [change.step],
        () =>
          `step ${change.at === undefined ? steps.length + 1 : Math.min(change.at, steps.length + 1)}`,
      );
      if (unknown !== undefined) return failed(unknown);
      const place = Math.min((change.at ?? steps.length + 1) - 1, steps.length);
      const added: Step = { id: newStepId(ids), ...stepOf(change.step) };
      steps = [...steps.slice(0, place), added, ...steps.slice(place)];
      placedPlainly = true;
    } else {
      const at = indexOf(steps, change.step);
      if (at === undefined) {
        return failed(
          `the scenario has no step ${typeof change.step === 'number' ? change.step : `"${change.step}"`} there: it has ${counted(steps.length, 'step')}.`,
        );
      }
      const step = steps[at] as NewStep;
      const number = at + 1;
      switch (change.op) {
        case 'move':
          steps = moveStep(steps, at, change.to - 1);
          placedPlainly = true;
          break;
        case 'remove':
          steps = deleteStep(steps, at);
          break;
        case 'describe':
          steps = describeStep(steps, at, change.description);
          break;
        case 'set-data':
          for (const which of ['dataIn', 'dataOut'] as const) {
            const value = change[which];
            if (value === undefined) continue;
            steps = setStepData(
              steps,
              at,
              which,
              value === null ? undefined : (value as JsonValue),
            );
          }
          break;
        case 'add-relation': {
          if (!exists(change.relation)) {
            return failed(
              `the model has no relation "${change.relation}". Ask the person what it should be; find_relations finds the ones that exist.`,
            );
          }
          if (step.relations.includes(change.relation)) break;
          steps = recordRelation(
            steps,
            { relation: change.relation, simultaneous: true, at },
            exists,
          ).steps;
          break;
        }
        case 'remove-relation': {
          if (!step.relations.includes(change.relation)) {
            return failed(`step ${number} does not use "${change.relation}".`);
          }
          const next = takeOutOfStep(steps, at, change.relation, exists);
          if (!next) {
            return failed(
              `step ${number} would be left with no relation: remove the step instead, or add another relation to it first.`,
            );
          }
          steps = next;
          break;
        }
        case 'repair': {
          if (change.by !== undefined && !exists(change.by)) {
            return failed(
              `the model has no relation "${change.by}". Ask the person what the step should use instead; find_relations finds the ones that exist.`,
            );
          }
          const next = repairStep(steps, at, exists, change.by);
          if (!next) {
            return failed(
              `step ${number} uses only relations that were deleted: give by, a relation of the model to use in their place, or remove the step.`,
            );
          }
          steps = next;
          break;
        }
      }
    }
    // An edit of steps keeps the decisions, without the steps gone, as the core does.
    const kept = steps as Step[];
    working = { steps: kept, blocks: keptWith(kept, working.blocks) };
  }

  const problem = decisionsProblem(working);
  if (problem !== undefined) {
    const hint = !holdingBefore
      ? ' Its decisions did not hold together before this change either: remove-decisions takes them away, keeping every step.'
      : placedPlainly
        ? ' To add a step inside an alternative, insert puts it after another step, in every alternative that holds that step.'
        : '';
    return { ok: false, message: `${problem}${hint}` };
  }
  return {
    ok: true,
    steps: working.steps,
    blocks: decided ? (working.blocks ?? null) : undefined,
  };
}

/** A decision operation, as the arguments give it. */
type DecisionArgs = Extract<EditArgs, { op: DecisionEdit['op'] }>;

function isDecisionArgs(change: EditArgs): change is DecisionArgs {
  return DECISION_OPS.has(change.op);
}

/** The new steps a decision operation brings, as the arguments give them. */
function newStepsOf(change: DecisionArgs): StepArgs[] {
  if (change.op === 'insert') return [change.step];
  if (change.op === 'add-alternative') return change.steps ?? [];
  return [];
}

/** A decision operation as `decision-edits.ts` takes it, its new steps without the keys left out. */
function decisionEditOf(change: DecisionArgs): DecisionEdit {
  switch (change.op) {
    case 'insert':
      return withoutUndefined({
        op: 'insert' as const,
        step: stepOf(change.step),
        after: change.after,
        afterDecision: change.afterDecision,
      });
    case 'add-alternative':
      return withoutUndefined({
        ...change,
        steps: (change.steps ?? []).map(stepOf),
      });
    default:
      return withoutUndefined(change) as DecisionEdit;
  }
}

/** Why removing a decision waits for cascade: the steps it deletes, by number and description. */
function removalRefusal(working: Working, change: DecisionArgs, removed: readonly Id[]): string {
  const decision = change.op === 'remove-decision' ? change.decision : '';
  const block = working.blocks?.find((each) => each.id === decision);
  const kept = block ? chosenAlternative(block, undefined) : undefined;
  const gone = removed.flatMap((id) => {
    const at = working.steps.findIndex((step) => step.id === id);
    const step = working.steps[at];
    return step ? [`${at + 1} ("${step.description}")`] : [];
  });
  return `removing the decision "${block?.question ?? decision}" keeps the steps of "${kept?.label ?? ''}", which plays by default, and deletes ${gone.length === 1 ? 'step' : 'steps'} ${listed(gone)}. Tell the person, then call again with cascade: true.`;
}
