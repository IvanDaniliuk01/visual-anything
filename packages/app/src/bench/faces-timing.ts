/**
 * Times the scene with faces in Node (ADR 0083, F5): the scene's first build from nothing, the scene
 * built again after one move, and the face layout cache's hit rate, with every face the benchmark's
 * `?faces` phase gives, against the same view without faces. A short check, not a benchmark: the
 * frames are the browser's to measure (`pnpm bench`, `?tables&faces`).
 *
 *   pnpm exec tsx packages/app/src/bench/faces-timing.ts [elements] [tables|boxes] [runs]
 *
 * `tables` (the default) is the view of tables (`syntheticTables`), where every table and column has a
 * face; `boxes` the benchmark's own project, where every shape has one.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { hitRate, measureFacesScene, withBenchFaces, type FacesSceneNumbers } from './faces';
import { syntheticProject, syntheticTables } from './synthetic';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const kind = args[3] === 'boxes' ? 'boxes' : 'tables';
const runs = Number(args[4] ?? 3);

/** A fresh synthetic project, so that nothing is kept from a build before. */
const synthetic = (): ProjectSnapshot =>
  kind === 'tables' ? syntheticTables(elements) : syntheticProject({ elements });

const ms = (value: number) => value.toFixed(1).padStart(8);
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function print(name: string, numbers: FacesSceneNumbers): void {
  console.log(`\n${name}: ${numbers.shapes} shapes, ${numbers.faced} with a face`);
  console.log(`  first build, from nothing      ${numbers.firstBuilds.map(ms).join(' ')} ms`);
  console.log(
    `    faces laid out in it         ${numbers.firstBuildCounts.laidOut} of ${numbers.firstBuildCounts.asked} asked`,
  );
  console.log(
    `  built again after one move     median ${ms(median(numbers.moves))} ms, max ${ms(Math.max(0, ...numbers.moves))} ms (${numbers.moves.length} moves)`,
  );
  console.log(
    `    faces laid out in them       ${numbers.moveCounts.laidOut} of ${numbers.moveCounts.asked} asked`,
  );
  console.log(
    `  every face drawn after build   ${numbers.drawn.asked} asked, ${numbers.drawn.laidOut} laid out in ${ms(numbers.drawn.took ?? 0)} ms, hit rate ${hitRate(numbers.drawn)}`,
  );
  console.log(
    `  every face drawn after moves   ${numbers.drawnAgain.asked} asked, ${numbers.drawnAgain.laidOut} laid out in ${ms(numbers.drawnAgain.took ?? 0)} ms, hit rate ${hitRate(numbers.drawnAgain)}`,
  );
}

const plainProject = synthetic();
const plainView = plainProject.views[0]?.id as string;
print('Without faces', measureFacesScene(plainProject, plainView, { runs }));
const facedProject = withBenchFaces(synthetic());
const facedView = facedProject.views[0]?.id as string;
print('With faces', measureFacesScene(facedProject, facedView, { runs }));
