/**
 * Times one layout of the synthetic benchmark view, step by step, as the app runs it: what the main
 * thread does (the input from the scene, the copy to the worker, the command, and applying it), and
 * what the worker does (ELK and the rest), here run in one thread. Then it routes every line of the
 * view as drawn after it, as the routing worker does (`avoidRoutes`), runs the channel pass over them,
 * and measures the result (`measureScene`, ADR 0080's "Layout quality"). A short check, not a
 * benchmark:
 *
 *   pnpm exec tsx packages/app/src/canvas/layout/timing.ts [elements] [view|new] [boxes|tables] [no-measures]
 *
 * `view` lays out the whole view, as Layout does; `new` lays out a view whose shapes have no position,
 * as automatic layout does when such a view opens. `boxes` is the benchmark's project
 * (`syntheticProject`), `tables` its view of tables (`syntheticTables`), which ADR 0080 measures.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { syntheticProject, syntheticTables } from '../../bench/synthetic';
import { avoidRoutes } from '../routing/avoid';
import { avoidBatchOf, channelledScene, withAvoidedRoutes } from '../routing/avoided';
import { buildScene, type RelationLine } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput, type LayoutScope } from './input';
import { measureScene } from './quality';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const mode = args[3] === 'new' ? 'new' : 'view';
const kind = args[4] === 'tables' ? 'tables' : 'boxes';
// The measures take more than 20 minutes on `boxes`' 9,600 lines: `no-measures` leaves them out.
const measures = args[5] !== 'no-measures';

const synthetic = kind === 'tables' ? syntheticTables(elements) : syntheticProject({ elements });
const project: ProjectSnapshot =
  mode === 'new'
    ? { ...synthetic, views: synthetic.views.map((view) => ({ ...view, positions: [] })) }
    : synthetic;
const viewId = project.views[0]?.id as string;

const timed = <T>(name: string, run: () => T): T => {
  const started = performance.now();
  const result = run();
  console.log(`${name.padEnd(44)} ${(performance.now() - started).toFixed(1).padStart(9)} ms`);
  return result;
};

const scene = timed('scene, built once before (not layout)', () => buildScene(project, viewId));
const scope: LayoutScope =
  mode === 'new'
    ? { kind: 'new', keys: new Set(scene.shapes.map((shape) => shape.key)) }
    : { kind: 'view' };
const input = timed('main thread: input from the scene', () => layoutInput(scene, project, scope));
if (!input) throw new Error('Nothing to lay out.');
timed('main thread: copy of the input to the worker', () => structuredClone(input));

// ELK runs in this thread here, where nothing can interrupt it, so there is no time limit: the
// numbers are ELK's whole cost, in one thread, where the app's worker shares it among its ELK workers.
const started = performance.now();
const result = await layOut(input, new ELK(), {
  timeLimit: Number.POSITIVE_INFINITY,
  onProgress: ({ done, total }) =>
    console.log(
      `  progress ${String(done).padStart(4)} of ${total} at ${(performance.now() - started).toFixed(0)} ms`,
    ),
});
const worker = performance.now() - started;
console.log(`${'worker: the whole layout'.padEnd(44)} ${worker.toFixed(1).padStart(9)} ms`);
console.log(
  `${'  of which ELK'.padEnd(44)} ${result.stats.elkMs.toFixed(1).padStart(9)} ms in ${result.stats.elkRuns} runs`,
);
console.log(
  `  ${result.stats.levels} levels, ${result.stats.shapes} shapes, ${result.stats.relations} relations given to ELK, ${result.stats.leftOut} left out, ${result.stats.packedForTime} levels packed for time`,
);

timed('main thread: copy of the result back', () => structuredClone(result));
const action = timed('main thread: the command', () =>
  layoutCommand(project, viewId, scene, scope, result.shapes),
);
if (!action) throw new Error('The layout moved nothing.');
const applied = timed('core: applying the command', () => executeCommand(project, action.command));
if (!applied.ok) throw new Error(applied.problems.map((each) => each.message).join(' '));
const after = timed('main thread: the scene after it', () => buildScene(applied.state, viewId));
console.log(
  `${action.moved} positions stored in one action: ${JSON.stringify(labelOf(action.command))}`,
);

// Routing, as the canvas asks the routing worker for every line at once, and the channel pass.
const batch = timed('main thread: the routing request', () => avoidBatchOf(after));
timed('main thread: copy of the request to the worker', () =>
  structuredClone({ shapes: batch.shapes, lines: batch.lines }),
);
const avoided = timed(`worker: every line routed (${batch.lines.length})`, () =>
  avoidRoutes(batch.shapes, batch.lines),
);
console.log(`  ${avoided.filter((each) => each.gaveUp).length} lines given up`);
const routes = new Map<RelationLine, Float64Array>();
avoided.forEach((each, at) => {
  if (each.route) routes.set(batch.drawn[at] as RelationLine, each.route);
});
const routed = timed('main thread: the routes applied', () =>
  withAvoidedRoutes(after, (line) => routes.get(line)),
);
const drawn = timed('channel pass: input, pass and routes applied', () =>
  channelledScene(routed, after),
);
if (measures) {
  const quality = timed('the measures', () => measureScene(drawn));
  console.log(
    `  ${quality.lines} lines: ${quality.crossings} crossings (${quality.crossingsPerLine} a line), ${quality.sharedSegments} shared segments, ${quality.linesThroughShapes} through shapes (+${quality.linesOverCoveringShapes} over covering ones), ${quality.bendsPerLine} bends a line, ${quality.overlappingSiblings} overlapping siblings, rows at middle ${quality.rowEndsAtMiddle}/${quality.rowEnds}, fill ${quality.fill}, aspect ${quality.aspect}`,
  );
}

function labelOf(command: Command): string {
  return command.type === 'batch' ? command.label : command.type;
}
