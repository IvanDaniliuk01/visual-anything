/**
 * Claude's tool for view addresses (ADR-0030's addendum of 2026-10-25): `link_to` answers the view
 * address of a view state: a view, with where the canvas looks, what is selected, the filters, focus
 * mode and the scenario step played, written as the app writes its own address. It changes nothing,
 * and the address holds no secret: never the session token, nor a launch code.
 */
import {
  MAX_CAMERA_ZOOM,
  MAX_GUIDANCE_TARGETS,
  MIN_CAMERA_ZOOM,
  checkViewState,
  viewStateProblems,
  writeViewState,
  type ViewFocus,
  type ViewState,
} from '@visual-anything/core';
import { z } from 'zod';
import { READ, fail, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The tests a condition can make, as the app's filters offer them. */
const TESTS = ['is', 'is-not', 'contains', 'below', 'above', 'set', 'unset'] as const;

/** Which way focus follows relations. */
const DIRECTIONS = [
  'both',
  'outgoing',
  'incoming',
] as const satisfies readonly ViewFocus['direction'][];

const linkTo = tool({
  name: 'link_to',
  title: 'Give the address of a view state',
  description: `Answers the view address of a view state: a view of the project, and, if you give them, where the canvas looks, what is selected, the filters, focus mode, and the scenario and step played. It is the same address the app keeps in its address bar and copies with Copy address: pasted into the address bar of the tab where the person has the project open, or opened by a reload of it, it opens the project at that view state. It holds ids, so it survives renames, and no secret. It changes nothing and needs no app open.

A new tab cannot open it alone: it has no session. To open a view in a new tab, the person runs \`visual-anything open <folder> --view <view> --select <id>\`, which opens the browser at an address that works once and carries the view and selection; or call open_app, then guide the person there with focus_view, filter_view and go_to_step.

camera is the point of the view at the middle of the canvas, in canvas units, and the zoom (1 is 100%). select names elements, relations and free shapes of the view. focus starts from the selection unless from names where it starts. step names a step of the scenario by its id or its number from 1; the scenario must play over the view.

Example: { "view": "system-overview", "select": ["appointments-api"] }
Example: { "view": "system-overview", "filters": { "components": ["systems.person"] }, "focus": { "degrees": 2, "direction": "outgoing", "from": ["booking-agent"] }, "scenario": "patient-books-appointment", "step": 3 }`,
  input: {
    view: id().describe('The view the address opens.'),
    camera: z
      .object({
        x: z.number().describe('Canvas units: the point at the middle of the canvas.'),
        y: z.number(),
        zoom: z.number().min(MIN_CAMERA_ZOOM).max(MAX_CAMERA_ZOOM).describe('1 is 100%.'),
      })
      .optional(),
    select: z.array(id()).min(1).max(MAX_GUIDANCE_TARGETS).optional(),
    filters: z
      .object({
        components: z
          .array(id())
          .optional()
          .describe('Hides the elements created from exactly these components.'),
        relationTypes: z.array(id()).optional().describe('Hides the relations of these types.'),
        conditions: z
          .array(
            z.object({
              of: z.enum(['elements', 'relations']),
              attribute: z.string().min(1),
              test: z.enum(TESTS),
              value: z.union([z.string(), z.number(), z.boolean()]).optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    focus: z
      .object({
        degrees: z.union([z.number().int().min(1).max(5), z.literal('all')]).optional(),
        direction: z.enum(DIRECTIONS).optional(),
        isolate: z.boolean().optional(),
        from: z.array(id()).min(1).max(MAX_GUIDANCE_TARGETS).optional(),
      })
      .optional(),
    scenario: id().optional(),
    step: z.union([z.number().int().min(1), id()]).optional(),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const scenario =
      args.scenario === undefined
        ? undefined
        : state.scenarios.find((each) => each.id === args.scenario);
    if (args.step !== undefined && args.scenario === undefined) {
      return fail('A step needs its scenario: give scenario too.');
    }
    const step =
      typeof args.step === 'number' ? (scenario?.steps[args.step - 1]?.id ?? '') : args.step;
    if (typeof args.step === 'number' && step === '') {
      return fail(
        scenario === undefined
          ? `There is no scenario "${args.scenario ?? ''}". get_project lists them.`
          : `The scenario "${scenario.name}" has no step ${args.step}: it has ${scenario.steps.length}.`,
      );
    }
    const asked: Record<string, unknown> = { view: args.view };
    if (args.camera) asked.camera = args.camera;
    if (args.select) asked.select = args.select;
    if (args.filters) {
      asked.filters = {
        components: args.filters.components ?? [],
        relationTypes: args.filters.relationTypes ?? [],
        conditions: (args.filters.conditions ?? []).map(({ of, attribute, test, value }) => ({
          of,
          attribute,
          test,
          value: value === undefined || test === 'set' || test === 'unset' ? '' : String(value),
        })),
      };
    }
    if (args.focus) {
      asked.focus = {
        degrees: args.focus.degrees ?? 1,
        direction: args.focus.direction ?? 'both',
        isolate: args.focus.isolate ?? false,
        ...(args.focus.from ? { from: args.focus.from } : {}),
      };
    }
    if (args.scenario !== undefined) asked.scenario = args.scenario;
    if (step !== undefined) asked.step = step;
    const checked = checkViewState(asked);
    if (!checked.ok) return fail(checked.message);
    const problems = viewStateProblems(state, checked.state);
    if (problems.length > 0) {
      return fail(`${problems.join(' ')} Use the ids the read tools give.`);
    }
    return ok(answerFor(checked.state));
  },
});

/** The answer: the address, and what it holds, as Claude reads it back. */
function answerFor(state: ViewState): Record<string, unknown> {
  return {
    address: `#${writeViewState(state)}`,
    viewState: state,
    note: 'Append it to the address of the tab where the person has the project open, or tell the person to paste it there. It is no launch address: a new tab opens it only through visual-anything open with --view and --select, or once a tab of the project holds it.',
  };
}

/** The view address tools, in the order Claude reads them. */
export const VIEW_STATE_TOOLS: readonly Tool[] = [linkTo];
