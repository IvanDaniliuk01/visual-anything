/**
 * Times in Node what the space benchmark (`?space`, M10) measures without a GPU (ADR 0076): making its
 * twenty canonical files and its project; the panel's work on the page, `spaceOf`, the entries the
 * worker draws and the states after a selection on the canvas; and the solid worker's own work apart
 * from drawing, its solids built with three.js, the space laid out, placed and looked at again, its
 * pieces merged, its scene made and following a change of looks, the exploded view's moves, the
 * farthest solids boxed while the camera moves, and picks on the solids' bounding volume hierarchies.
 * A short check, not a benchmark: the frames are the browser's to measure (`pnpm bench`, `?space`).
 *
 *   pnpm exec tsx packages/app/src/bench/space-timing.ts [elements] [runs]
 */
import { modelIndexOf, spaceOf } from '@visual-anything/core';
import { buildScene } from '../canvas/scene';
import { emphasize } from '../canvas/emphasize';
import type { SpaceElementState } from '../solids/protocol';
import { buildSolid, type BuiltSolid } from '../solids/worker/build';
import type { SpaceToDraw } from '../solids/worker/host';
import { explosionShifts, layOut, placeOut } from '../solids/worker/space/layout';
import { drawGroupsOf } from '../solids/worker/space/merge';
import { SpaceScene } from '../solids/worker/space/scene';
import { SPACE_TRIANGLE_BUDGET, boxedFrom } from '../solids/worker/space/lod';
import { pickInSpace } from '../solids/worker/space/pick';
import { boundsPlaced, frameSpace } from '../space/camera';
import { spaceEntriesOf } from '../space/entries';
import { shapeEmphasisOf, spaceStateList, spaceStates } from '../space/states';
import { spaceSolidFiles } from './solidFiles';
import { SPACE_VIEW, syntheticSpace } from './spaceProject';
import { seeded } from './synthetic';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const runs = Number(args[3] ?? 3);

const ms = (value: number) => value.toFixed(3).padStart(9);
const at = (values: readonly number[], share: number) => {
  const all = [...values].sort((a, b) => a - b);
  return all[Math.min(all.length - 1, Math.floor(share * all.length))] ?? 0;
};
const line = (name: string, values: readonly number[]) =>
  console.log(
    `  ${name.padEnd(52)} median ${ms(at(values, 0.5))} ms, p95 ${ms(at(values, 0.95))} ms, max ${ms(Math.max(0, ...values))} ms (${values.length})`,
  );
const time = (work: () => void): number => {
  const began = performance.now();
  work();
  return performance.now() - began;
};

async function main(): Promise<void> {
  console.log(`The space benchmark's work without a GPU, ${elements.toLocaleString()} elements`);
  line(
    'Making the twenty canonical files',
    Array.from({ length: Math.max(1, runs) }, () => time(() => spaceSolidFiles('full'))),
  );
  let made: ReturnType<typeof syntheticSpace> | undefined;
  line('Making them again, hashed, described, with the project', [
    time(() => {
      made = syntheticSpace({ elements });
    }),
  ]);
  const { project, files, holders, triangles } = made as ReturnType<typeof syntheticSpace>;
  const bytes = [...files.values()].reduce((sum, each) => sum + each.length, 0);
  console.log(
    `    ${(bytes / 1024 / 1024).toFixed(1)} MiB of canonical files; ${(triangles / 1e6).toFixed(2)} million triangles posed`,
  );
  const view = project.views.find((each) => each.id === SPACE_VIEW) ?? project.views[0];
  const index = modelIndexOf(project);
  const scene = buildScene(project, SPACE_VIEW);

  // The page's work.
  const spaceTimes: number[] = [];
  let space = spaceOf(project, view);
  for (let run = 0; run < Math.max(1, runs); run++) {
    // A model of its own each run, so that what `spaceOf` keeps for a model is not reused.
    const fresh = { ...project, model: { ...project.model } };
    spaceTimes.push(
      time(() => {
        space = spaceOf(fresh, view);
      }),
    );
  }
  line(`spaceOf, from nothing (${space.entries.size.toLocaleString()} entries)`, spaceTimes);
  let entries = spaceEntriesOf(space, (id) => index.element(id)?.name ?? id);
  line(
    'The entries the worker draws',
    Array.from({ length: Math.max(1, runs) }, () =>
      time(() => {
        entries = spaceEntriesOf(space, (id) => index.element(id)?.name ?? id);
      }),
    ),
  );
  const posed = [...space.entries.values()]
    .filter((entry) => entry.how === 'posed' && entry.solid)
    .map((entry) => entry.element);
  const random = seeded(31);
  const emphasized = shapeEmphasisOf(emphasize(scene, {}));
  const statesTimes: number[] = [];
  for (let each = 0; each < 50; each++) {
    const selected = new Set([posed[Math.floor(random() * posed.length)] as string]);
    statesTimes.push(
      time(() =>
        spaceStateList(
          spaceStates({
            space,
            shapes: scene.shapes,
            emphasis: emphasized,
            selected,
            containersOf: (element) => index.containersOf(element),
            world: index.world.id,
          }),
        ),
      ),
    );
  }
  line('The panel’s states after a selection, from the emphasis', statesTimes);
  const emphasisTimes: number[] = [];
  for (let each = 0; each < 20; each++) {
    const element = posed[Math.floor(random() * posed.length)] as string;
    const dimmed = new Set(
      scene.shapes.filter((shape) => shape.element !== element).map((shape) => shape.key),
    );
    emphasisTimes.push(time(() => shapeEmphasisOf(emphasize(scene, { dimmed }))));
  }
  line('The canvas’s emphasis of a change of focus, for the panel', emphasisTimes);

  // The worker's work apart from drawing.
  const solids = new Map<string, BuiltSolid>();
  const buildTimes: number[] = [];
  for (const [hash, file] of files) {
    const began = performance.now();
    const built = await buildSolid(file, hash, { decodeImage: () => Promise.resolve(undefined) });
    buildTimes.push(performance.now() - began);
    if (!built.ok) throw new Error(built.message);
    solids.set(hash, built.solid);
  }
  line('Building each solid with three.js', buildTimes);
  const states = new Map<string, SpaceElementState>();
  const size = { width: 480, height: 900 };
  const boxes = entries.flatMap((entry) =>
    entry.bounds ? [boundsPlaced(entry.matrix, entry.bounds)] : [],
  );
  const camera = frameSpace(boxes, size.width / size.height);
  const toDraw = (explode: number): SpaceToDraw => ({
    space: 1,
    size,
    camera,
    entries,
    states,
    cut: undefined,
    explode,
    names: false,
    lines: [],
    solids,
    boxed: new Set(),
    theme: 'light',
    pixelRatio: 1,
    handles: undefined,
  });
  let layout = layOut(toDraw(0));
  line(
    'Laying the space out',
    Array.from({ length: Math.max(1, runs) }, () =>
      time(() => {
        layout = layOut(toDraw(0));
      }),
    ),
  );
  console.log(
    `    ${layout.solids.length.toLocaleString()} solids, ${layout.solids.reduce((sum, laid) => sum + laid.pieces.length, 0).toLocaleString()} pieces`,
  );
  line(
    'Laying it out exploded, at a factor of 1',
    Array.from({ length: Math.max(1, runs) }, () => time(() => layOut(toDraw(1)))),
  );
  // What a change of states costs the worker now: looking again from the placement kept, and the
  // scene following it in place.
  const placement = placeOut(toDraw(0));
  line(
    'Placing the space, from nothing',
    Array.from({ length: Math.max(1, runs) }, () => time(() => placeOut(toDraw(0)))),
  );
  const lookTimes: number[] = [];
  const looked: ReturnType<typeof layOut>[] = [];
  for (let each = 0; each < 50; each++) {
    const selected = posed[Math.floor(random() * posed.length)] as string;
    const changed = { ...toDraw(0), states: new Map([[selected, { selected: true }]]) };
    lookTimes.push(time(() => looked.push(layOut(changed, placement))));
  }
  line('Looking again after a selection, from the placement kept', lookTimes);
  line('Merging the pieces of each solid that draw alike, once', [
    time(() => {
      for (const solid of solids.values()) drawGroupsOf(solid);
    }),
  ]);
  let mergedBytes = 0;
  for (const solid of solids.values()) {
    for (const group of drawGroupsOf(solid)) {
      if (!group.merged) continue;
      const { attributes, index } = group.geometry;
      for (const name of Object.keys(attributes)) {
        mergedBytes += (attributes[name]?.array as ArrayLike<number> & { byteLength: number })
          .byteLength;
      }
      mergedBytes += index?.array.byteLength ?? 0;
    }
  }
  console.log(`    ${(mergedBytes / 2 ** 20).toFixed(1)} MiB of merged geometry, a second copy`);
  let spaceScene: SpaceScene | undefined;
  line(
    'Making the space’s scene',
    Array.from({ length: Math.max(1, runs) }, () =>
      time(() => {
        spaceScene?.dispose();
        spaceScene = new SpaceScene(layOut(toDraw(0), placement), {
          cut: undefined,
          theme: 'light',
        });
      }),
    ),
  );
  const drawnScene = spaceScene as SpaceScene;
  console.log(
    `    ${drawnScene.batches.length} batches, ${drawnScene.batches.filter((batch) => batch.kind === 'piece').length} of pieces, for ${layout.solids.length} solids`,
  );
  line(
    'The scene following a change of looks, in place',
    looked.map((each) => time(() => drawnScene.show(each))),
  );
  line(
    'The exploded view’s moves, as a frame sends them',
    Array.from({ length: 20 }, () => time(() => explosionShifts(entries, solids, 1))),
  );
  const boxable = entries.flatMap((entry) => {
    const solid = entry.solid === undefined ? undefined : solids.get(entry.solid);
    return solid && entry.bounds
      ? [
          {
            element: entry.element,
            triangles: solid.description.counts.triangles,
            bounds: boundsPlaced(entry.matrix, entry.bounds),
          },
        ]
      : [];
  });
  let boxed = new Set<string>();
  line(
    'The farthest solids boxed while the camera moves',
    Array.from({ length: 50 }, () =>
      time(() => {
        boxed = boxedFrom(boxable, camera, SPACE_TRIANGLE_BUDGET);
      }),
    ),
  );
  const drawnMoving = boxable.reduce(
    (sum, each) => sum + (boxed.has(each.element) ? 12 : each.triangles),
    0,
  );
  console.log(
    `    ${boxed.size} of ${boxable.length} solids boxed, ${(drawnMoving / 1e6).toFixed(2)} million triangles drawn while moving`,
  );

  // Picks, at the whole space and close in on the holder at every cap.
  for (const [name, from] of [
    ['whole space', camera],
    [
      'close in',
      (() => {
        const holder = entries.find((entry) => entry.element === holders[0]);
        const framed = frameSpace(
          holder?.bounds ? [boundsPlaced(holder.matrix, holder.bounds)] : [],
          size.width / size.height,
        );
        return { ...framed, distance: framed.distance * 0.6 };
      })(),
    ],
  ] as const) {
    for (let run = 0; run < Math.max(1, runs); run++) {
      const picks: number[] = [];
      let found = 0;
      const input = {
        layout,
        camera: from,
        size,
        pixelRatio: 1,
        lines: [],
        cut: undefined,
      };
      for (let each = 0; each < 200; each++) {
        const x = Math.floor(random() * size.width);
        const y = Math.floor(random() * size.height);
        const began = performance.now();
        const picked = pickInSpace(input, x, y);
        picks.push(performance.now() - began);
        if (picked.element) found += 1;
      }
      line(`A pick in the panel, ${name} (run ${run + 1})`, picks);
      if (run === 0) console.log(`    ${found} of 200 found an element`);
    }
  }
}

void main();
