/**
 * The simulation benchmark's project (`?simulate`, M12, ADR 0085): the synthetic view of 10,000
 * elements, of which 100, spread over it, are created from a component of the benchmark's own package
 * that simulates a load wandering by chance. Its package code is written here, as generated code
 * whose hash the page approves as the person would; the same tick as a plain function stands in for
 * it where no code worker runs. The view's overlay colors every shape by its `load`, an attribute the
 * component defines, so that while a run is shown the overlay reads its simulated value in place of
 * the stored one, through the attribute lookup's `simulated` map.
 *
 * Each tick marks the element and one of its relations drawn as lines, a different one each tick
 * where it has several, so that a tick's marks highlight shapes and send markers along relations.
 */
import { SYSTEMS, packagesWithCode, type ProjectSnapshot } from '@visual-anything/core';
import type { RunPackage } from '../code/messages';
import type {
  Component,
  Element,
  Id,
  Overlay,
  PackageFile,
  SimulationDefinition,
} from '@visual-anything/schema';
import { syntheticProject } from './synthetic';

/** The benchmark's own package, and the component its simulating elements are created from. */
export const SIMULATE_PACKAGE = 'bench-simulation';
export const SIMULATED_COMPONENT = 'bench-simulation.load';
/** The simulated value the overlay reads, also an attribute of the component. */
export const SIMULATED_VALUE = 'load';
/** How many elements simulate at once (M12's "Done when"). */
export const SIMULATING = 100;
/** The relation type that nests contents in their systems, never drawn as a line. */
const NESTING = 'systems.is-part-of';

/** What the component simulates: a load between 0 and 1,000, and which way it went. */
export const BENCH_SIMULATION: SimulationDefinition = {
  parameters: [
    { name: 'start', type: 'number', default: 500, min: 0, max: 1000, step: 10 },
    { name: 'swing', type: 'number', default: 120, min: 0, max: 400, step: 10 },
  ],
  values: [
    { name: SIMULATED_VALUE, type: 'number', min: 0, max: 1000 },
    { name: 'trend', type: 'string', choices: ['up', 'down', 'steady'] },
  ],
  tick: { length: 1, unit: 's' },
  // As many as a run plays, so that a run at its fastest goes on while it is measured.
  ticks: 10_000,
  description: 'A load that wanders by chance, kept between 0 and 1,000.',
};

/** The package code, line by line: its `simulate` is `benchTick`, written for the sandbox. */
export const BENCH_CODE: readonly string[] = [
  '/**',
  ' * The simulation benchmark’s package code (ADR 0085): a load that wanders by chance between 0 and',
  ' * 1,000. Each tick marks the element and one of its relations, a different one each tick.',
  ' */',
  'export function simulate(element, context) {',
  '  const { parameters, state, tick } = context;',
  '  const level = state ? state.level : parameters.start;',
  '  const drift = (context.random() - 0.5) * parameters.swing;',
  '  const next = Math.min(1000, Math.max(0, level + drift));',
  `  const lines = context.relations.filter((each) => each.relationType !== '${NESTING}');`,
  '  const marks = [element.id];',
  '  if (lines.length > 0) marks.push(lines[tick % lines.length].id);',
  '  return {',
  '    values: {',
  `      ${SIMULATED_VALUE}: Math.round(next),`,
  "      trend: drift > 1 ? 'up' : drift < -1 ? 'down' : 'steady',",
  '    },',
  '    state: { level: next },',
  '    marks,',
  '  };',
  '}',
];

/** What `simulate` gets, as far as the benchmark's tick reads it. */
export interface BenchTickInput {
  element: { id: Id };
  context: {
    parameters: Record<string, unknown>;
    state?: unknown;
    tick: number;
    relations: readonly { id: Id; relationType: Id }[];
  };
}

/** The package code's tick as a plain function, `random` the tick's generator: for the stand-in. */
export function benchTick({ element, context }: BenchTickInput, random: () => number): unknown {
  const { parameters, state, tick } = context;
  const level = state ? (state as { level: number }).level : (parameters.start as number);
  const drift = (random() - 0.5) * (parameters.swing as number);
  const next = Math.min(1000, Math.max(0, level + drift));
  const lines = context.relations.filter((each) => each.relationType !== NESTING);
  const marks: Id[] = [element.id];
  const line = lines[tick % Math.max(1, lines.length)];
  if (line) marks.push(line.id);
  return {
    values: {
      [SIMULATED_VALUE]: Math.round(next),
      trend: drift > 1 ? 'up' : drift < -1 ? 'down' : 'steady',
    },
    state: { level: next },
    marks,
  };
}

/** Colors every shape by its load, which the simulating elements read from their runs. */
export const LOAD_FILL: Overlay = {
  id: 'simulated-load',
  name: 'Simulated load',
  of: 'elements',
  attribute: SIMULATED_VALUE,
  channel: 'fill',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, color: '#DCFCE7', label: 'idle' },
      { at: 500, color: '#FEF08A' },
      { at: 1000, color: '#FCA5A5', label: 'full' },
    ],
  },
};

const component: Component = {
  id: SIMULATED_COMPONENT,
  name: 'Simulated service',
  derivesFrom: 'systems.service',
  description: 'A service whose load the benchmark simulates.',
  attributes: [{ name: SIMULATED_VALUE, type: 'number', default: 0 }],
  simulation: BENCH_SIMULATION,
};

/** The benchmark's package, with its code. */
export const SIMULATE_PACKAGE_FILE: PackageFile = {
  id: SIMULATE_PACKAGE,
  name: 'Benchmark simulation',
  components: [component],
  relationTypes: [],
  code: [...BENCH_CODE],
};

/**
 * The benchmark's package as the code worker is handed it once approved: by the hash of its code and
 * of the capabilities it declares, none, worked out as the app works it out, and granted nothing.
 */
export function approvedBenchPackage(project: ProjectSnapshot): Omit<RunPackage, 'stops'> {
  const code = packagesWithCode(project).find((each) => each.package === SIMULATE_PACKAGE);
  if (!code) throw new Error('The benchmark’s project has no package of its own with code.');
  return {
    package: code.package,
    name: code.name,
    hash: code.hash,
    code: code.text,
    declared: code.declared,
    granted: [],
  };
}

export interface SimulateProject {
  project: ProjectSnapshot;
  view: Id;
  /** The elements that simulate, spread over the view, in order. */
  simulating: Id[];
}

/**
 * The synthetic view of `elements` elements with `simulating` of them created from the simulating
 * component: contents of systems with a relation drawn as a line, spread evenly over the view, and
 * the overlay that colors shapes by their load.
 */
export function syntheticSimulations(options: {
  elements: number;
  simulating?: number;
}): SimulateProject {
  const base = syntheticProject({ elements: options.elements });
  const wanted = options.simulating ?? SIMULATING;
  const lines = new Set<Id>();
  for (const relation of base.model.relations) {
    if (relation.relationType === NESTING) continue;
    lines.add(relation.from);
    lines.add(relation.to);
  }
  const candidates = base.model.elements.filter(
    (element) => element.component !== 'systems.system' && lines.has(element.id),
  );
  const chosen = new Set<Id>();
  const count = Math.min(wanted, candidates.length);
  for (let each = 0; each < count; each++) {
    const at = Math.floor(((each + 0.5) * candidates.length) / count);
    chosen.add((candidates[at] as Element).id);
  }
  const elements = base.model.elements.map((element) =>
    chosen.has(element.id) ? { ...element, component: SIMULATED_COMPONENT } : element,
  );
  const view = base.views[0]?.id ?? 'everything';
  return {
    project: {
      ...base,
      project: {
        ...base.project,
        name: `${options.elements} elements, ${count} simulating`,
        packages: [...base.project.packages, SIMULATE_PACKAGE],
      },
      model: { ...base.model, elements },
      packages: [
        SYSTEMS,
        ...base.packages.filter((each) => each.id !== 'systems'),
        SIMULATE_PACKAGE_FILE,
      ],
      views: base.views.map((each) =>
        each.id === view ? { ...each, overlays: [LOAD_FILL] } : each,
      ),
    },
    view,
    simulating: elements.filter((element) => chosen.has(element.id)).map((element) => element.id),
  };
}
