/**
 * Claude's scenario tools: creating a scenario from steps, which is how a description or a pasted log
 * becomes one, editing it with the core's step-edit helpers as one undoable action, deleting it, and
 * playing it in the open app as live guidance (ADR-0031): opening it, playing and pausing, and going
 * from step to step. Playing changes nothing; the person can pause or close it at any time.
 */
import {
  brokenStepsOf,
  deleteStep,
  describeStep,
  entryOfStep,
  modelIndexOf,
  moveStep,
  recordRelation,
  repairStep,
  scenarioTimeline,
  setStepData,
  takeOutOfStep,
  type Guidance,
  type NewStep,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, JsonValue, ScenarioFile } from '@visual-anything/schema';
import { z } from 'zod';
import type { Program } from './bridge';
import {
  DELETE,
  GUIDE,
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

// ——— Create, edit and delete ———

const createScenarioFromSteps = tool({
  name: 'create_scenario_from_steps',
  title: 'Create a scenario from steps',
  description: `Creates a scenario over a view from its steps, as one undoable action. Each step activates one or more relations of the model at the same time, says in a short sentence what happens, and may say what it takes in and produces, as JSON.

Use it to turn a description of an example, or a log the person pasted, into a scenario: map each line or sentence to the relations of the model it crosses (find_relations, get_item), in order, one step per moment; lines that happen at once share a step; take data in and out from the payloads the log shows. When a line matches nothing in the model, do not guess: ask the person what it maps to, or offer to add the relation first. A relation the model does not have is refused with its id. Then offer to play it with play_scenario.

Example: {
  "name": "Patient books an appointment",
  "view": "system-overview",
  "description": "From the log of booking 1042.",
  "steps": [
    { "description": "The patient asks on WhatsApp.", "relations": ["patient-to-whatsapp"], "dataIn": { "text": "Can I see a cardiologist?" } },
    { "description": "The agent reads free slots and holds one.", "relations": ["agent-to-api", "api-reads-db"], "dataOut": { "slot": "2026-11-03T10:00" } }
  ]
}`,
  input: {
    name: z.string().min(1),
    description: z.string().optional(),
    view: id().describe('The view it plays over.'),
    steps: z.array(newStep()),
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    if (!state.views.some((view) => view.id === args.view)) {
      return fail(`There is no view "${args.view}". get_project lists the views.`);
    }
    const unknown = unknownRelations(state, args.steps);
    if (unknown !== undefined) return fail(`Not created: ${unknown}`);
    return act(
      program,
      {
        type: 'create-scenario',
        scenario: withoutUndefined({
          name: args.name,
          description: args.description,
          view: args.view,
          steps: args.steps.map(stepOf),
        }),
      },
      (answer) => ({
        scenario: answer.created[0],
        steps: args.steps.length,
        next: 'Play it in the app with play_scenario, or step through it with go_to_step and next_step while you explain.',
      }),
    );
  },
});

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
  ]);

const updateScenario = tool({
  name: 'update_scenario',
  title: 'Change a scenario',
  description: `Changes a scenario as one undoable action: its name, description or view, and its steps through edits applied in order. An edit adds a step (last, or at a number), moves one, removes one, sets its description, sets or takes away its data in and out (null takes it away), adds a relation to it or takes one out, or repairs it.

A broken step uses a relation that was deleted; read_scenario lists them. Repair one by taking the missing relations out, with by naming a relation of the model to use in their place when none would be left; any change to a broken step's relations also leaves the missing ones out. A relation the model does not have is refused with its id: ask the person what it should be.

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
}`,
  input: {
    scenario: id(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    view: id().optional().describe('Another view for it to play over.'),
    edits: z.array(edit()).optional(),
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
    if (args.edits !== undefined && args.edits.length > 0) {
      const edited = editSteps(state, scenario, args.edits);
      if (!edited.ok) return fail(`Not changed: ${edited.message}`);
      steps = edited.steps;
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
        }),
      },
      async () => {
        const now = (await program.project()).scenarios.find((each) => each.id === scenario.id);
        if (!now) return {};
        const broken = brokenStepsOf(await program.project(), now).map((each) => each.index + 1);
        return { steps: now.steps.length, ...(broken.length > 0 ? { brokenSteps: broken } : {}) };
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

const openScenario = tool({
  name: 'open_scenario',
  title: 'Open a scenario in the app',
  description: `Opens a scenario in the scenario panel of the app the person has open, and its view, at its first step, paused. It changes nothing in the project, and the person can close it.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: playedScenario() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'open'),
});

const playScenario = tool({
  name: 'play_scenario',
  title: 'Play a scenario in the app',
  description: `Plays a scenario in the app the person has open, from the step it is on, or from the first once it has played to the end: it opens the scenario and its view first when needed, highlights each step's relations with a marker travelling along them, and goes on step after step. Steps inside a container the view shows collapsed play as one aggregated step. Playing changes nothing in the project, and the person can pause it at any time. To start elsewhere, call go_to_step first.

Example: { "scenario": "patient-books-appointment" }`,
  input: { scenario: playedScenario() },
  hints: GUIDE,
  run: async (args, program) => play(program, args.scenario, 'play'),
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
  description: `Shows one step of a scenario in the app the person has open: it opens the scenario and its view first when needed, then plays that step's travel once and holds there, or goes on from it when the scenario is playing. Name the step by its number from 1 or by its id, from read_scenario. Use it with show_caption to walk the person through the steps one at a time.

Example: { "scenario": "patient-books-appointment", "step": 3 }
Example: { "scenario": "patient-books-appointment", "step": "hold-slot" }`,
  input: {
    scenario: playedScenario(),
    step: z
      .union([z.number().int().min(1), id()])
      .describe('The step: its number from 1, or its id.'),
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
    return play(program, scenario.id, 'go-to-step', at, {
      step: withoutUndefined({
        number: at + 1,
        id: step.id,
        description: step.description,
        playsAs: playsAs(state, scenario, at),
      }),
    });
  },
});

const nextStep = tool({
  name: 'next_step',
  title: 'Go to the next step',
  description: `Goes to the next step of a scenario in the app the person has open, from the step it is on there; at the last step it stays. An aggregated step counts as one.

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
];

// ——— Helpers ———

type PlaybackAction = Extract<Guidance, { kind: 'playback' }>['action'];

/** Sends playback guidance for a scenario that exists, and that has steps to play unless opened. */
async function play(
  program: Program,
  scenarioId: Id,
  action: PlaybackAction,
  step?: number,
  more: Record<string, unknown> = {},
): Promise<ToolOutcome> {
  const state = await program.project();
  const scenario = state.scenarios.find((each) => each.id === scenarioId);
  if (!scenario) return fail(`There is no scenario "${scenarioId}". get_project lists them.`);
  if (action !== 'open' && scenario.steps.length === 0) {
    return fail(
      `The scenario "${scenario.name}" has no steps yet: add some with update_scenario, or ask the person to record them.`,
    );
  }
  return guideApps(
    program,
    { kind: 'playback', scenario: scenario.id, action, ...(step === undefined ? {} : { step }) },
    more,
  );
}

/** How a step plays over its scenario's view now: on its own, or inside an aggregated step. */
function playsAs(state: ProjectSnapshot, scenario: ScenarioFile, at: number): string | undefined {
  const timeline = scenarioTimeline(state, scenario);
  const entry = timeline.entries[entryOfStep(timeline, at) ?? -1];
  if (entry?.kind !== 'aggregated') return undefined;
  const container = modelIndexOf(state).element(entry.container)?.name ?? entry.container;
  return `It plays inside the aggregated step of steps ${entry.first + 1} to ${entry.first + entry.count}, since the view collapses “${container}”; expand it to see the step on its own.`;
}

/** A step to send, without the keys left out. */
function stepOf(step: z.infer<ReturnType<typeof newStep>>): NewStep {
  return withoutUndefined({
    description: step.description,
    relations: step.relations,
    dataIn: step.dataIn as JsonValue | undefined,
    dataOut: step.dataOut as JsonValue | undefined,
  });
}

/** What steps use that the model does not have, in words; undefined when they use none. */
function unknownRelations(
  state: ProjectSnapshot,
  steps: readonly { relations: readonly Id[] }[],
  numberOf: (position: number) => number = (position) => position + 1,
): string | undefined {
  const index = modelIndexOf(state);
  const lines = steps.flatMap((step, position) => {
    const missing = step.relations.filter((relation) => index.relation(relation) === undefined);
    return missing.length === 0
      ? []
      : [`step ${numberOf(position)} uses ${missing.map((each) => `"${each}"`).join(', ')}`];
  });
  if (lines.length === 0) return undefined;
  return `the model has no relation with these ids: ${lines.join('; ')}. Ask the person what those lines map to, or offer to add the relations first with add_to_model; find_relations finds the ones that exist.`;
}

/** The steps of a scenario after Claude's edits, applied in order with the core's helpers. */
function editSteps(
  state: ProjectSnapshot,
  scenario: ScenarioFile,
  edits: readonly z.infer<ReturnType<typeof edit>>[],
): { ok: true; steps: NewStep[] } | { ok: false; message: string } {
  const index = modelIndexOf(state);
  const exists = (relation: Id) => index.relation(relation) !== undefined;
  let steps: NewStep[] = scenario.steps.map((step) => ({ ...step }));
  for (const [position, change] of edits.entries()) {
    const failed = (message: string) => ({
      ok: false as const,
      message: `edit ${position + 1} (${change.op}): ${message}`,
    });
    if (change.op === 'add') {
      const unknown = unknownRelations(state, [change.step], () =>
        change.at === undefined ? steps.length + 1 : Math.min(change.at, steps.length + 1),
      );
      if (unknown !== undefined) return failed(unknown);
      const place = Math.min((change.at ?? steps.length + 1) - 1, steps.length);
      steps = [...steps.slice(0, place), stepOf(change.step), ...steps.slice(place)];
      continue;
    }
    const at = stepIndex(steps, change.step);
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
          steps = setStepData(steps, at, which, value === null ? undefined : (value as JsonValue));
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
  return { ok: true, steps };
}

/** The index of a step named by its id or its number from 1. */
function stepIndex(steps: readonly NewStep[], ref: Id | number): number | undefined {
  if (typeof ref === 'number') return ref >= 1 && ref <= steps.length ? ref - 1 : undefined;
  const at = steps.findIndex((step) => step.id === ref);
  return at < 0 ? undefined : at;
}
