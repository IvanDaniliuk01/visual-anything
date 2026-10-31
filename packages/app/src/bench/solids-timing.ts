/**
 * Times in Node what the solids benchmark (`?solids`, M9) measures without a GPU (ADR 0075): making
 * its twenty canonical files and describing them; the scene's first build with 200 shapes that show
 * solids and 1,000 anchored parts, and its build after one move; finding what is under the pointer
 * through a drawing's part buffer, as the canvas does when it moves; the table of part states for the
 * drawing at the cap on parts and for one of 100; and the solid client's ordering of 200 pictures by
 * their distance from the middle of the screen. A short check, not a benchmark: the frames, the
 * pictures and turning are the browser's to measure (`pnpm bench`, `?solids`).
 *
 *   pnpm exec tsx packages/app/src/bench/solids-timing.ts [elements] [runs]
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import { HIT_TOLERANCE } from '../canvas/controller';
import { hitAt, indexScene } from '../canvas/hit';
import { buildScene, buildSceneAfresh, type ElementShape } from '../canvas/scene';
import {
  anchoredByIndex,
  isSolidAnchor,
  pointedPart,
  type PlacedPartBuffer,
} from '../canvas/solids/pointing';
import { partStatesOf, type PartElementState } from '../canvas/solids/states';
import { createSolidClient, solidAskFor, type SolidPictureAsk } from '../solids/client';
import { StandInSolidWorker } from '../solids/stand-in';
import { benchSolidFiles } from './solidFiles';
import { SOLIDS_VIEW, syntheticSolids } from './solidsProject';
import { seeded } from './synthetic';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const runs = Number(args[3] ?? 3);

const ms = (value: number) => value.toFixed(3).padStart(9);
const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);
const at = (values: readonly number[], share: number) => {
  const all = sorted(values);
  return all[Math.min(all.length - 1, Math.floor(share * all.length))] ?? 0;
};
const line = (name: string, values: readonly number[]) =>
  console.log(
    `  ${name.padEnd(46)} median ${ms(at(values, 0.5))} ms, p95 ${ms(at(values, 0.95))} ms, max ${ms(Math.max(0, ...values))} ms (${values.length})`,
  );
const time = (work: () => void): number => {
  const began = performance.now();
  work();
  return performance.now() - began;
};

console.log(`The solids benchmark's work without a GPU, ${elements.toLocaleString()} elements`);

// The files and the project.
const filesTimes: number[] = [];
for (let run = 0; run < Math.max(1, runs); run++)
  filesTimes.push(time(() => benchSolidFiles('full')));
line('Making the twenty canonical files', filesTimes);
let made: ReturnType<typeof syntheticSolids> | undefined;
const projectTime = time(() => {
  made = syntheticSolids({ elements });
});
const { project, definitions, drawings } = made as ReturnType<typeof syntheticSolids>;
const bytes = [...(made as ReturnType<typeof syntheticSolids>).files.values()].reduce(
  (sum, each) => sum + each.length,
  0,
);
line('Making them again, hashed and described, with the project', [projectTime]);
console.log(`    ${(bytes / 1024 / 1024).toFixed(1)} MiB of canonical files`);

// The scene.
const firsts: number[] = [];
for (let run = 0; run < Math.max(1, runs); run++) {
  firsts.push(time(() => buildSceneAfresh(project, SOLIDS_VIEW)));
}
const scene = buildScene(project, SOLIDS_VIEW);
const showing = scene.shapes.filter((shape) => shape.solid && !shape.part).length;
const anchored = scene.shapes.filter((shape) => shape.part?.inDrawing === true).length;
line(`The scene's first build (${showing} solids, ${anchored} parts)`, firsts);
const moves: number[] = [];
let current: ProjectSnapshot = project;
let previous = scene;
const moved = scene.shapes.find((shape) => shape.element === drawings[0]) as ElementShape;
for (let each = 1; each <= 10; each++) {
  const outcome = executeCommand(current, {
    type: 'set-positions',
    view: SOLIDS_VIEW,
    positions: [{ element: moved.element, x: moved.offset.x + each * 8, y: moved.offset.y }],
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  current = outcome.state;
  moves.push(
    time(() => {
      previous = buildScene(current, SOLIDS_VIEW);
    }),
  );
}
line('Built again after moving the middle drawing', moves);
console.log(`    ${previous.shapes.length.toLocaleString()} shapes`);

// Pointing through the middle drawing's part buffer, at 400 pixels across.
const indexed = indexScene(scene);
const drawing = indexed.byElement.get(drawings[0] as string)?.[0] as ElementShape;
const definitionOf = (id: string) => definitions.find((each) => each.id === id) as SolidDefinition;
const definition = definitionOf(drawing.solid?.id as string);
const side = 400;
const columns = Math.ceil(Math.sqrt(definition.parts.length));
const data = new Uint16Array(side * side);
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    // Each part a square of the grid, with a gap of nothing between them.
    const column = Math.floor((x / side) * columns);
    const row = Math.floor((y / side) * columns);
    const inside = (x / side) * columns - column < 0.85 && (y / side) * columns - row < 0.85;
    const part = row * columns + column;
    data[y * side + x] = inside && part < definition.parts.length ? part + 1 : 0;
  }
}
const rect = drawing.solid?.rect ?? drawing.rect;
const placed: PlacedPartBuffer = { buffer: { width: side, height: side, data }, rect };
const contents = indexed.scene.shapes.filter(
  (shape) => shape.containerShape === drawing.key && isSolidAnchor(shape),
);
const anchoredParts = anchoredByIndex(contents);
const scale = side / Math.max(rect.width, rect.height);
const random = seeded(23);
const points = Array.from({ length: 2_000 }, () => ({
  x: rect.x + random() * rect.width,
  y: rect.y + random() * rect.height,
}));
for (let run = 0; run < Math.max(1, runs); run++) {
  const pointing: number[] = [];
  let parts = 0;
  for (const point of points) {
    const began = performance.now();
    const hit = hitAt(indexed, point, HIT_TOLERANCE / scale);
    let shape = hit?.kind === 'shape' ? hit.shape : undefined;
    if (shape && isSolidAnchor(shape) && shape.containerShape !== undefined) {
      shape = indexed.byKey.get(shape.containerShape) ?? shape;
    }
    if (shape?.solid?.placement === 'parts') {
      shape = pointedPart(shape, placed, point, definition.parts, anchoredParts);
    }
    pointing.push(performance.now() - began);
    if (shape && isSolidAnchor(shape)) parts += 1;
  }
  line(
    `Pointing over ${definition.parts.length.toLocaleString()} parts (run ${run + 1})`,
    pointing,
  );
  if (run === 0)
    console.log(
      `    ${parts.toLocaleString()} of ${points.length.toLocaleString()} found an anchored part`,
    );
}

// The table of part states, for the drawing at the cap on parts and one of 100.
for (const id of [definition.id, definitionOf(definitions[2]?.id as string).id]) {
  const parts = definitionOf(id).parts;
  const elementStates = new Map<number, PartElementState>();
  for (let index = 0; index < Math.min(100, parts.length); index++) {
    elementStates.set(Math.floor((index * parts.length) / 100), { faint: index % 2 === 0 });
  }
  const tables: number[] = [];
  for (let each = 0; each < 200; each++) {
    const selected = Math.floor((each * parts.length) / 200);
    const states = new Map(elementStates);
    states.set(selected, { ...states.get(selected), selected: true });
    tables.push(time(() => partStatesOf(parts, states)));
  }
  line(`The state table of ${parts.length.toLocaleString()} parts`, tables);
}

// The client's ordering of 200 pictures, nearest the middle first, its files never arriving.
const client = createSolidClient({
  files: { get: () => new Promise(() => undefined) },
  start: () => new StandInSolidWorker(),
});
const shown = scene.shapes.filter((shape) => shape.solid && !shape.part);
const ordering: number[] = [];
for (let each = 0; each < 500; each++) {
  const asks = shown
    .map((shape) => solidAskFor(shape, 256, random() * 2_000))
    .filter((ask): ask is SolidPictureAsk => ask !== undefined)
    .sort((a, b) => a.distance - b.distance);
  ordering.push(time(() => client.ask(asks)));
}
line(`The client's ordering of ${shown.length} pictures`, ordering);
client.dispose();
