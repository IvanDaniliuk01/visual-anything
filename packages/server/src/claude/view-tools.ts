/**
 * Claude's tools for view states (ADR-0030's addendum of 2026-10-25, ADR-0044): `get_view_address`
 * answers the view address of a view state: a view, with where the canvas looks, what is selected,
 * the filters, focus mode and the scenario step played, written as the app writes its own address,
 * on the address the program serves the app at. It changes nothing, and the address holds no secret:
 * never the session token, nor a launch code. `open_app` opens the app in the person's browser, at a view state
 * when it is given one, through an address that works once and that Claude never sees.
 */
import {
  MAX_CAMERA_ZOOM,
  MAX_GUIDANCE_TARGETS,
  MIN_CAMERA_ZOOM,
  checkViewState,
  viewStateProblems,
  writeViewState,
  type ProjectSnapshot,
  type ViewFocus,
  type ViewState,
} from '@visual-anything/core';
import { z } from 'zod';
import type { Program } from './bridge';
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

/** The parts of a view state beside its view, as `get_view_address` and `open_app` take them. */
export const STATE_PARTS = {
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
      range: z
        .object({
          of: z.enum(['elements', 'relations']),
          attribute: z.string().min(1),
          until: z
            .string()
            .min(1)
            .optional()
            .describe('The attribute its periods end at, when the range is on periods.'),
          kind: z.enum(['number', 'date', 'time']),
          from: z.number(),
          to: z.number(),
        })
        .optional()
        .describe(
          'A time range: shows only what has its value of the attribute in the range, and what has none. Dates are milliseconds since 1970 in UTC, times of day seconds since midnight.',
        ),
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
};

/** A view state's parts, as the tools take them. */
export type StateArgs = z.infer<z.ZodObject<typeof STATE_PARTS>> & { view: string };

/** What `get_view_address` and `open_app` say a view state holds, after the view. */
export const STATE_HELP = `camera is the point of the view at the middle of the canvas, in canvas units, and the zoom (1 is 100%). select names elements, relations and free shapes of the view. filters.range is the app's time range on one date, time or number attribute, which hides what falls outside it. focus starts from the selection unless from names where it starts. step names a step of the scenario by its id or its number from 1; the scenario must play over the view.`;

const getViewAddress = tool({
  name: 'get_view_address',
  title: 'Give the address of a view state',
  description: `Answers the view address of a view state: a view of the project, and, if you give them, where the canvas looks, what is selected, the filters, focus mode, and the scenario and step played. It is the same address the app keeps in its address bar and copies with Copy address, on the address this run of Visual Anything serves the app at (http://127.0.0.1:<port>/#view=…). It holds ids, so it survives renames, and no secret. It changes nothing and needs no app open.

The person opens it in the browser where they have the project open: pasted into that tab's address bar, or in a new tab of the same browser, which joins the session of the tab that has the project open. With no tab open, it opens nothing: call open_app with the same view state to open the browser there. The port lasts while this run does; the part from # on, also answered as fragment, lasts as long as the ids do.

${STATE_HELP}

Example: { "view": "system-overview", "select": ["appointments-api"] }
Example: { "view": "system-overview", "filters": { "components": ["systems.person"] }, "focus": { "degrees": 2, "direction": "outgoing", "from": ["booking-agent"] }, "scenario": "patient-books-appointment", "step": 3 }`,
  input: { view: id().describe('The view the address opens.'), ...STATE_PARTS },
  hints: READ,
  run: async (args, program) => {
    const asked = askedState(args, await program.project());
    if (!asked.ok) return fail(asked.message);
    return ok(answerFor(asked.state, await addressOf(program)));
  },
});

/** Opens the app; it is listed with the guidance tools, which need an open app. */
export const openApp = tool({
  name: 'open_app',
  title: 'Open the app',
  description: `Opens Visual Anything on the project in a new tab of the person's browser, on the computer it runs on, at an address that works once, which you are never told. Give a view, and if you like where the canvas looks, a selection, filters, focus and a scenario step, as get_view_address takes them, and the tab opens the project there. Guidance shows only while the app is open. Use it when a guidance tool says no app is open, when the person asks to see the project, or to show them a view state in a tab of its own.

${STATE_HELP}

Example: {}
Example: { "view": "system-overview", "select": ["appointments-api"] }`,
  input: {
    view: id()
      .optional()
      .describe('The view the tab opens at; left out, the app opens as it does.'),
    ...STATE_PARTS,
  },
  hints: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async (args, program) => {
    const { view, ...parts } = args;
    if (view === undefined) {
      if (Object.values(parts).some((part) => part !== undefined)) {
        return fail('A view state names its view: give view too.');
      }
      await program.openApp();
      return ok({ opened: 'The browser was asked to open Visual Anything on the project.' });
    }
    const project = await program.project();
    const asked = askedState({ ...parts, view }, project);
    if (!asked.ok) return fail(asked.message);
    await program.openApp(asked.state);
    const name = project.views.find((each) => each.id === view)?.name ?? view;
    return ok({
      opened: `The browser was asked to open Visual Anything on the project, at the view "${name}".`,
      viewState: asked.state,
    });
  },
});

/**
 * The view state the arguments ask for, checked as an address's is and against the project. The tour
 * tools take view states the same way (ADR 0058).
 */
export function askedState(
  args: StateArgs,
  project: ProjectSnapshot,
): { ok: true; state: ViewState } | { ok: false; message: string } {
  const scenario =
    args.scenario === undefined
      ? undefined
      : project.scenarios.find((each) => each.id === args.scenario);
  if (args.step !== undefined && args.scenario === undefined) {
    return { ok: false, message: 'A step needs its scenario: give scenario too.' };
  }
  const step =
    typeof args.step === 'number' ? (scenario?.steps[args.step - 1]?.id ?? '') : args.step;
  if (typeof args.step === 'number' && step === '') {
    return {
      ok: false,
      message:
        scenario === undefined
          ? `There is no scenario "${args.scenario ?? ''}". get_project lists them.`
          : `The scenario "${scenario.name}" has no step ${args.step}: it has ${scenario.steps.length}.`,
    };
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
      ...(args.filters.range ? { range: args.filters.range } : {}),
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
  if (!checked.ok) return { ok: false, message: checked.message };
  const problems = viewStateProblems(project, checked.state);
  if (problems.length > 0) {
    return { ok: false, message: `${problems.join(' ')} Use the ids the read tools give.` };
  }
  return { ok: true, state: checked.state };
}

/** The address the program serves the app at, when it is known. */
async function addressOf(program: Program): Promise<string | undefined> {
  return program.address === undefined ? undefined : program.address();
}

/** The answer: the address, its fragment, and what it holds, as Claude reads it back. */
function answerFor(state: ViewState, served: string | undefined): Record<string, unknown> {
  const fragment = `#${writeViewState(state)}`;
  return {
    address: served === undefined ? fragment : `${served}${fragment}`,
    fragment,
    viewState: state,
    note:
      served === undefined
        ? 'Append it to the address of the tab where the person has the project open, or tell the person to paste it there. To open the browser at it, call open_app with the same view state.'
        : 'It opens in the browser where the person has the project open: in that tab, or in a new tab of that browser, which joins its session. With no tab open it opens nothing: call open_app with the same view state. The port lasts while this run of Visual Anything does.',
  };
}

/** The view address tools, in the order Claude reads them. */
export const VIEW_STATE_TOOLS: readonly Tool[] = [getViewAddress];
