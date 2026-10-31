/**
 * Claude's tools for simulations (M12, ADR 0085): reading what an element or a component can
 * simulate (`get_simulation`), running a simulation in Claude's own process, in the app's sandbox,
 * as `run_package_code` runs a hook (`run_simulation`), and showing one in the open apps
 * (`show_simulation`), as guidance that records nothing.
 *
 * - **Words.** A tick is never a step, and a run is never a scenario (CONTEXT.md).
 * - **Data, never instructions** (ADR 0029): names and descriptions come from the package, and are
 *   given as data.
 */
import {
  SIMULATION_LIMITS,
  checkParameters,
  codeStatusOf,
  definitionsIn,
  modelIndexOf,
  packageCodeOf,
  simulationOf,
  ticksOf,
  type ComponentSimulation,
  type Guidance,
  type ProjectSnapshot,
  type SimulatedTick,
  type SimulationRun,
  type SimulationStop,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import { GUIDE, ONE_TAB, READ, fail, guideApps, guidedView, id, ok, tool } from './kit';
import type { Tool } from './tools';

/** The most ticks `run_simulation` answers one by one. */
export const MAX_TICKS_ANSWERED = 200;

const APPROVAL =
  'The person approves package code in the app, by its hash: in the inspector of one of its elements, or from the package in the Components tab. Claude cannot approve it.';

const parameterValue = () => z.union([z.number(), z.boolean(), z.string().min(1).max(200)]);

const parameters = () =>
  z
    .record(z.string().min(1).max(64), parameterValue())
    .optional()
    .describe(
      'Parameters by name, each within its declared range; those left out keep their defaults.',
    );

const seed = () =>
  z
    .number()
    .int()
    .min(0)
    .max(SIMULATION_LIMITS.maxSeed)
    .optional()
    .describe('The run’s seed: the same seed always gives the same run. 1 by default.');

/** What an element simulates, found from its id or its component's; or why there is none. */
function simulatedFor(
  state: ProjectSnapshot,
  args: { element?: Id; component?: Id },
): { ok: true; simulation: ComponentSimulation; component: Id } | { ok: false; message: string } {
  const definitions = definitionsIn(state);
  let component = args.component;
  if (args.element !== undefined) {
    const element = modelIndexOf(state).element(args.element);
    if (!element) {
      return {
        ok: false,
        message: `There is no element "${args.element}". Use find_elements to find the right one.`,
      };
    }
    component = element.component;
  }
  if (component === undefined) return { ok: false, message: 'Name an element or a component.' };
  const simulation = simulationOf(definitionsIn(state), component);
  if (!simulation) {
    const name = definitions.component(component)?.name ?? component;
    return {
      ok: false,
      message: `"${name}" simulates nothing: neither it nor what it derives from declares a simulation.`,
    };
  }
  return { ok: true, simulation, component };
}

/** Whether the code that works a simulation out is approved as it is now, in words. */
async function approvalOf(
  state: ProjectSnapshot,
  simulation: ComponentSimulation,
  program: Parameters<Tool['run']>[1],
): Promise<{ approved: boolean; granted: string[]; reason?: string }> {
  const file = state.packages.find((each) => each.id === simulation.package);
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) {
    return { approved: false, granted: [], reason: 'Its package holds no code to work it out.' };
  }
  const status = codeStatusOf(code, (await program.codeApprovals?.()) ?? []);
  if (status.state === 'too-large') {
    return { approved: false, granted: [], reason: 'Its code is over 256 KiB, so it never runs.' };
  }
  if (status.state !== 'approved') {
    return {
      approved: false,
      granted: [],
      reason: `The code of "${simulation.package}" as it is now is not approved, so it does not run. ${APPROVAL}`,
    };
  }
  return { approved: true, granted: [...status.granted] };
}

const getSimulation = tool({
  name: 'get_simulation',
  title: 'Read a simulation',
  description: `Reads what an element, or a component, can simulate (ADR 0085): the parameters a run starts from, each with its type, default and range; the simulated values each tick answers, with their limits, past which a run stops cleanly; how long a tick stands for and how many ticks a run plays; the package whose code works each tick out, and whether the person approved that code as it is now. A simulated value named like one of the element's attributes shows on the canvas in its place while the run is shown.

Then run_simulation runs it here and answers its values, and show_simulation shows it to the person in the app.

Example: { "element": "audit-queue" }
Example: { "component": "flow.queue" }`,
  input: {
    element: id().optional().describe('The element whose simulation to read.'),
    component: id().optional().describe('Or the component whose simulation to read.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const found = simulatedFor(state, args);
    if (!found.ok) return fail(found.message);
    const { simulation } = found;
    const approval = await approvalOf(state, simulation, program);
    const { definition } = simulation;
    return ok({
      component: found.component,
      declaredBy: simulation.declaredBy,
      package: simulation.package,
      ...(definition.description === undefined ? {} : { description: definition.description }),
      parameters: definition.parameters,
      values: definition.values,
      tick: definition.tick ?? { length: 1 },
      ticks: ticksOf(definition),
      approved: approval.approved,
      ...(approval.reason === undefined ? {} : { why: approval.reason }),
    });
  },
});

const showSimulation = tool({
  name: 'show_simulation',
  title: 'Show a simulation in the app',
  description: `Opens an element's simulation in the inspector of the open apps, as the person would (ADR 0085): with parameters, a seed and the tick to show, then plays it at a speed or pauses it. The canvas shows the simulated values named like the element's attributes in their place, marked ∿, and what the tick marks. close: true closes the simulation shown, and takes nothing else. It changes nothing in the project and records nothing: the person changes the parameters, plays, pauses and closes it at will. The code runs in the app only once the person approved it there. ${ONE_TAB}

Example: { "element": "audit-queue", "parameters": { "arrivals": 50 }, "tick": 300 }
Example: { "element": "audit-queue", "play": true, "speed": 20 }
Example: { "close": true }`,
  input: {
    element: id().optional().describe('The element whose simulation to show.'),
    parameters: parameters(),
    seed: seed(),
    tick: z
      .number()
      .int()
      .min(0)
      .max(SIMULATION_LIMITS.maxTicks)
      .optional()
      .describe('The tick to show, from 0; it is worked out first.'),
    play: z.boolean().optional().describe('true plays it on from that tick; false pauses it.'),
    speed: z
      .union([z.literal(1), z.literal(5), z.literal(20), z.literal(60), z.literal('max')])
      .optional()
      .describe('Ticks a second, or "max" for as fast as it goes.'),
    view: guidedView(),
    close: z.literal(true).optional().describe('Closes the simulation shown.'),
  },
  hints: GUIDE,
  run: async (args, program) => {
    if (args.close) {
      const others = Object.entries(args).filter(
        ([key, value]) => key !== 'close' && value !== undefined,
      );
      if (others.length > 0) return fail('close: true takes nothing else.');
      return guideApps(program, { kind: 'simulation', close: true }, { recorded: 'Nothing.' });
    }
    if (args.element === undefined) return fail('Name the element whose simulation to show.');
    const state = await program.project();
    if (args.view !== undefined && !state.views.some((each) => each.id === args.view)) {
      return fail(`There is no view "${args.view}".`);
    }
    const found = simulatedFor(state, { element: args.element });
    if (!found.ok) return fail(found.message);
    const checked = checkParameters(found.simulation.definition, args.parameters);
    if (!checked.ok) return fail(checked.reason);
    const approval = await approvalOf(state, found.simulation, program);
    const guidance: Guidance = {
      kind: 'simulation',
      element: args.element,
      ...(args.parameters === undefined || Object.keys(args.parameters).length === 0
        ? {}
        : { parameters: args.parameters }),
      ...(args.seed === undefined || args.seed === SIMULATION_LIMITS.defaultSeed
        ? {}
        : { seed: args.seed }),
      ...(args.tick === undefined || args.tick === 0 ? {} : { tick: args.tick }),
      ...(args.play === undefined ? {} : { play: args.play }),
      ...(args.speed === undefined ? {} : { speed: args.speed }),
      ...(args.view === undefined ? {} : { view: args.view }),
    };
    return guideApps(program, guidance, {
      recorded: 'Nothing: a simulation run is never saved.',
      ...(approval.approved ? {} : { warnings: [approval.reason ?? APPROVAL] }),
    });
  },
});

/**
 * What `run_simulation` answers of a run: its stop and why, each number's first, last, lowest and
 * highest, and at most `MAX_TICKS_ANSWERED` ticks sampled evenly, the last held and the one before
 * the stop always among them.
 */
export function summaryOf(run: SimulationRun, from = 0): Record<string, unknown> {
  const held: SimulatedTick[] = [];
  for (let tick = from; tick < run.length; tick++) {
    const each = run.tickAt(tick);
    if (each) held.push(each);
  }
  const numbers: Record<string, { first: number; last: number; lowest: number; highest: number }> =
    {};
  for (const tick of held) {
    for (const [name, value] of Object.entries(tick.values)) {
      if (typeof value !== 'number') continue;
      const seen = numbers[name];
      if (!seen) numbers[name] = { first: value, last: value, lowest: value, highest: value };
      else {
        seen.last = value;
        seen.lowest = Math.min(seen.lowest, value);
        seen.highest = Math.max(seen.highest, value);
      }
    }
  }
  const picked = new Set<number>();
  const count = held.length;
  if (count <= MAX_TICKS_ANSWERED) for (let i = 0; i < count; i++) picked.add(i);
  else {
    for (let i = 0; i < MAX_TICKS_ANSWERED - 1; i++) {
      picked.add(Math.round((i * (count - 1)) / (MAX_TICKS_ANSWERED - 1)));
    }
    picked.add(count - 1);
  }
  const ticks = [...picked]
    .sort((a, b) => a - b)
    .map((index) => ({ tick: from + index, ...held[index] }));
  return {
    ticks: run.length - from,
    from,
    stop: run.stop ? describeStop(run.stop) : undefined,
    numbers,
    sampled: ticks,
  };
}

/** A run's stop, with a sentence that says why. */
export function describeStop(stop: SimulationStop): Record<string, unknown> {
  const said = (why: string) => ({ ...stop, why });
  switch (stop.kind) {
    case 'done':
      return said(stop.message ?? `The behavior ended by itself at tick ${stop.tick}.`);
    case 'ticks':
      return said(`It played its ticks, to tick ${stop.tick}.`);
    case 'limit': {
      const past =
        stop.limit === 'finite'
          ? `${stop.value} was not a finite number`
          : stop.limit === 'choices'
            ? `${stop.value} was ${JSON.stringify(stop.got)}, not one of its choices`
            : `${stop.value} went ${stop.limit === 'max' ? 'above its highest' : 'below its lowest'}, ${stop.bound}, to ${String(stop.got)}`;
      return said(`At tick ${stop.tick}, ${past}; the run keeps the ticks before it.`);
    }
    case 'failed':
      return said(`The code failed at tick ${stop.tick}: ${JSON.stringify(stop.failure)}.`);
    case 'full':
      return said(`What a run keeps for going back was full at tick ${stop.tick}.`);
    case 'changed':
      return said(`The model changed while it ran, at tick ${stop.tick}.`);
  }
}

/** The tools for simulations, in the order Claude reads them; run_simulation joins with the worker. */
export const SIMULATION_TOOLS: readonly Tool[] = [getSimulation, showSimulation];
