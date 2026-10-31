/**
 * Times M11b's work in Node (ADR 0070, ADR 0072, ADR 0073), on the benchmark's project and a newer
 * version of it with 100 changes spread over its view (`versions.ts`):
 *
 * - comparing the two versions, and one view of them;
 * - following the comparison after one action of the person's, a rename and a move;
 * - at 10,000 elements only: the comparison's scene in its three drawings, with the marks the canvas's
 *   layer works out for it, chunk by chunk; an action while a proposal of Claude's is open, with its
 *   rebase and the proposal shown again; and merging the model file in the core.
 *
 * A short check, not a benchmark: what PixiJS does with the marks on the GPU is the browser's to
 * measure (`pnpm bench`). Here the marks are drawn into PixiJS's `Graphics`, which records them, so it
 * times the layer's own work.
 *
 *   pnpm exec tsx packages/app/src/bench/versions-timing.ts [elements|reading] [runs]
 *
 * `reading` is the reading benchmark's size, 100,000 elements and about 200,000 relations, at which
 * only comparing and following are timed.
 */
import {
  BUILTIN_PACKAGES,
  compareProjects,
  compareView,
  executeCommand,
  mergeFile,
  operationsBetween,
  propose,
  proposalChanges,
  rebaseProposal,
  recompare,
  type Command,
  type Comparison,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { Container } from 'pixi.js';
import { ComparisonLayer } from '../canvas/comparison/layer';
import { markItems } from '../canvas/comparison/marks';
import { comparisonScene, COMPARISON_DRAWINGS } from '../canvas/comparison/scene';
import { buildScene, buildSceneAfresh, type Scene } from '../canvas/scene';
import type { MarkText } from '../canvas/screenMarks';
import { THEMES } from '../theme/themes';
import { syntheticProject } from './synthetic';
import {
  READING_SIZE,
  changedVersion,
  claudesCommand,
  personsMove,
  personsRename,
  renamedEverywhere,
  sideOfMerge,
} from './versions';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const reading = args[2] === 'reading';
const elements = reading ? READING_SIZE.elements : Number(args[2] ?? 10_000);
const runs = Number(args[3] ?? (reading ? 5 : 10));
const VIEW = 'everything';

const ms = (value: number) => `${value.toFixed(2)} ms`;
const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * Runs `work` once to warm the code, then `count` times, each timed; `prepare` runs before each, and
 * is not timed.
 */
function time<T, P>(
  count: number,
  work: (run: number, prepared: NoInfer<P>) => T,
  prepare: (run: number) => P = () => undefined as P,
): { times: number[]; result: T } {
  const times: number[] = [];
  let result = work(-1, prepare(-1));
  for (let run = 0; run < count; run++) {
    const prepared = prepare(run);
    const began = performance.now();
    result = work(run, prepared);
    times.push(performance.now() - began);
  }
  return { times, result };
}

function say(name: string, times: readonly number[]): void {
  console.log(
    `  ${name.padEnd(58)} median ${ms(median(times)).padStart(11)}, worst ${ms(Math.max(...times)).padStart(11)} (${times.length} runs)`,
  );
}

function applied(project: ProjectSnapshot, command: Command) {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

const made = performance.now();
const older = syntheticProject(reading ? READING_SIZE : { elements });
const newer = changedVersion(older, 100);
console.log(
  `${older.model.elements.length} elements and ${older.model.relations.length} relations; the newer version made in ${ms(performance.now() - made)}`,
);

// ——— Comparing ———

console.log('\nComparing the two versions');
const compared = time(runs, () => compareProjects(older, newer));
say('compareProjects', compared.times);
const comparison: Comparison = compared.result;
const { counts } = comparison;
console.log(
  `    ${comparison.changes.length} changes: ${counts.added} added, ${counts.removed} removed, ${counts.changed} changed, ${counts.moved} moved`,
);
const viewed = time(runs, () => compareView(comparison, older, newer, VIEW));
say('compareView, the one view', viewed.times);

// ——— Following ———

/** One action of the person's on the newer version, then the comparison followed through it. */
function follow(name: string, action: (project: ProjectSnapshot, run: number) => Command): void {
  console.log(`
Following the comparison after one ${name}`);
  const act = (run: number) => applied(newer, action(newer, run));
  say(`the ${name} itself, executeCommand`, time(runs, act).times);
  const followed = time(
    runs,
    (_, outcome) => recompare(comparison, older, outcome.state, outcome.operations),
    act,
  );
  say('recompare', followed.times);
  const afresh = time(runs, (_, outcome) => compareProjects(older, outcome.state), act);
  say('compareProjects afresh, for reference', afresh.times);
}

follow('rename', personsRename);
follow('move', personsMove);

if (!reading) {
  // ——— Drawing ———

  console.log('\nThe comparison’s scene, as the canvas builds it');
  const afresh = time(runs, () => buildSceneAfresh(newer, VIEW));
  say('buildSceneAfresh of the newer version, for reference', afresh.times);
  const newerScene: Scene = buildScene(newer, VIEW);
  const viewComparison = viewed.result;
  for (const drawing of COMPARISON_DRAWINGS) {
    const scened = time(
      runs,
      () => comparisonScene(older, newer, VIEW, viewComparison, drawing, { newer: newerScene }),
      // As on the canvas: the newer version's scene is the last one built, and it is given.
      () => void buildScene(newer, VIEW),
    );
    say(`comparisonScene, ${drawing}`, scened.times);
    if (drawing === 'comparison') {
      const shown = scened.result;
      console.log(
        `    ${shown.scene.shapes.length} shapes, ${shown.shapes.size} marked, ${shown.lines.size} lines marked, ${shown.moves.length} moves, ${markItems(shown).length} marks`,
      );
    }
  }

  console.log('\nFollowing in full after a rename: recompare, compareView and the scene');
  const fully = time(
    runs,
    (_, { outcome, scene }) => {
      const next = recompare(comparison, older, outcome.state, outcome.operations);
      const states = compareView(next, older, outcome.state, VIEW);
      return comparisonScene(older, outcome.state, VIEW, states, 'comparison', { newer: scene });
    },
    // As on the canvas: the action's own scene is built as after any action, and given.
    (run: number) => {
      const outcome = applied(newer, personsRename(newer, run));
      return { outcome, scene: buildScene(outcome.state, VIEW) };
    },
  );
  say('recompare, compareView and comparisonScene', fully.times);

  // ——— The marks ———

  const label = (): MarkText => Object.assign(new Container(), { text: '' });
  const theme = THEMES.light.canvas;
  /** The layer's work for a comparison: its first frame, then each frame until every mark is drawn. */
  function marks(name: string, was: ProjectSnapshot, is: ProjectSnapshot): void {
    const whole = compareProjects(was, is);
    const shown = comparisonScene(was, is, VIEW, compareView(whole, was, is, VIEW), 'comparison');
    console.log(`\nThe marks of ${name}: ${markItems(shown).length} marks`);
    const firsts: number[] = [];
    const frames: number[] = [];
    let count = 0;
    for (let run = -1; run < runs; run++) {
      const layer = new ComparisonLayer(label, () => {}, theme);
      const began = performance.now();
      layer.set(shown);
      const first = performance.now() - began;
      let framesNow = 0;
      while (layer.pending && framesNow < 1_000) {
        const at = performance.now();
        layer.frame();
        if (run >= 0) frames.push(performance.now() - at);
        framesNow += 1;
      }
      if (run >= 0) firsts.push(first);
      count = framesNow;
      layer.destroy();
    }
    say('the first frame: set, its marks and two chunks', firsts);
    if (frames.length > 0) say(`each frame after it, ${count} a run`, frames);
  }
  marks('the 100 changes', older, newer);
  marks('every element renamed', older, renamedEverywhere(older));

  // ——— A proposal open ———

  console.log('\nAn action while a proposal of Claude’s is open');
  const opened = propose(undefined, newer, claudesCommand(newer, 20), { author: 'claude' });
  if (!opened.ok || opened.proposal === undefined)
    throw new Error('Claude’s command did not join.');
  const proposal = opened.proposal;
  console.log(`    the proposal holds ${proposalChanges(proposal).changes.length} changes`);
  for (const [name, action] of [
    ['rename', personsRename],
    ['move', personsMove],
  ] as const) {
    const act = (run: number) => applied(newer, action(newer, run));
    say(`a ${name}, executeCommand`, time(runs, act).times);
    const rebased = time(
      runs,
      (_, outcome) => rebaseProposal(proposal, outcome.state, outcome.operations),
      act,
    );
    say('its rebase, rebaseProposal', rebased.times);
    const shown = time(
      runs,
      (_, again) => {
        proposalChanges(again);
        return operationsBetween(again.base, again.proposed);
      },
      (run: number) => {
        const outcome = act(run);
        return rebaseProposal(proposal, outcome.state, outcome.operations);
      },
    );
    say('shown again: proposalChanges and operationsBetween', shown.times);
  }

  // ——— Merging the model file ———

  console.log('\nMerging the model file in the core');
  const nesting = new Set(
    BUILTIN_PACKAGES.flatMap((file) =>
      file.relationTypes.filter((type) => type.nests === true).map((type) => type.id),
    ),
  );
  const ours = sideOfMerge(older.model, 'ours', { changes: 200, additions: 50 });
  const theirs = sideOfMerge(older.model, 'theirs', { changes: 200, additions: 50 });
  const merged = time(runs, () => mergeFile('model', older.model, ours, theirs, { nesting }));
  say('mergeFile, 200 changes and 50 additions a side', merged.times);
  console.log(
    `    ${merged.result.file.elements.length} elements, ${merged.result.file.relations.length} relations, ${merged.result.conflicts.length} conflicts`,
  );
}
