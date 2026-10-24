/**
 * Times one layout of the synthetic benchmark view, step by step, as the app runs it: what the main
 * thread does (the input from the scene, the copy to the worker, the command, and applying it), and
 * what the worker does (ELK and the rest), here run in one thread. A short check, not a benchmark:
 *
 *   pnpm exec tsx packages/app/src/canvas/layout/timing.ts [elements] [view|new]
 *
 * `view` lays out the whole view, as Layout does; `new` lays out a view whose shapes have no position,
 * as automatic layout does when such a view opens.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { syntheticProject } from '../../bench/synthetic';
import { buildScene } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput, type LayoutScope } from './input';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const mode = args[3] === 'new' ? 'new' : 'view';

const synthetic = syntheticProject({ elements });
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

const started = performance.now();
const result = await layOut(input, new ELK());
const worker = performance.now() - started;
console.log(`${'worker: the whole layout'.padEnd(44)} ${worker.toFixed(1).padStart(9)} ms`);
console.log(
  `${'  of which ELK'.padEnd(44)} ${result.stats.elkMs.toFixed(1).padStart(9)} ms in ${result.stats.elkRuns} runs`,
);
console.log(
  `  ${result.stats.levels} levels, ${result.stats.shapes} shapes, ${result.stats.relations} relations given to ELK`,
);

timed('main thread: copy of the result back', () => structuredClone(result));
const action = timed('main thread: the command', () =>
  layoutCommand(project, viewId, scene, scope, result.shapes),
);
if (!action) throw new Error('The layout moved nothing.');
const applied = timed('core: applying the command', () => executeCommand(project, action.command));
if (!applied.ok) throw new Error(applied.problems.map((each) => each.message).join(' '));
timed('main thread: the scene after it', () => buildScene(applied.state, viewId));
console.log(
  `${action.moved} positions stored in one action: ${JSON.stringify(labelOf(action.command))}`,
);

function labelOf(command: Command): string {
  return command.type === 'batch' ? command.label : command.type;
}
