/**
 * Layout quality with libavoid as the router (ADR 0080, section 2, Stage 1b), on the fixture shaped
 * like the user's data model: the views as Layout leaves them, routed by libavoid container by
 * container with the program's router as the fallback, then the channel pass, measured as drawn,
 * against the program's router alone. With `LIBAVOID_LOG` naming a file, the measures and each
 * container's routing time are written to it; `LIBAVOID_LINES` and `LIBAVOID_CROSSING` try other
 * budgets.
 */
import { appendFileSync } from 'node:fs';
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDataModel } from '../../test/dataModel';
import { avoidBatchOf } from '../routing/avoided';
import {
  LIBAVOID_BUDGET,
  LibavoidRouter,
  loadLibavoid,
  routeLines,
  type Libavoid,
} from '../routing/libavoid';
import { buildSceneAfresh } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput } from './input';
import { keepRoutes, routedWithKept } from './keptRoutes';
import { measureScene } from './quality';

const elk = new ELK();
const base = loadDataModel();
let lib: Libavoid | undefined;
const budget = {
  ...LIBAVOID_BUDGET,
  // No limit of time, so that what libavoid routes does not hang on how fast the machine is.
  time: Infinity,
  slow: Infinity,
  lines: Number(process.env.LIBAVOID_LINES ?? LIBAVOID_BUDGET.lines),
  crossingLines: Number(process.env.LIBAVOID_CROSSING ?? LIBAVOID_BUDGET.crossingLines),
};

beforeAll(async () => {
  lib = await loadLibavoid();
});

function apply(project: ProjectSnapshot, command: Command) {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

function viewOf(project: ProjectSnapshot, id: Id): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

function expanded(view: Id, only?: (id: Id) => boolean): ProjectSnapshot {
  const collapsed = viewOf(base, view).collapsed ?? [];
  return apply(base, {
    type: 'set-collapsed',
    view,
    elements: only ? collapsed.filter(only) : [...collapsed],
    collapsed: false,
  });
}

function unpinned(project: ProjectSnapshot, view: Id): ProjectSnapshot {
  const pinned = viewOf(project, view).positions.filter((each) => each.pinned === true);
  return apply(project, {
    type: 'set-positions',
    view,
    positions: pinned.map((each) => ({ ...each, pinned: false })),
  });
}

const cases = [
  { name: 'schema-view', view: 'schema-view', project: () => base },
  { name: 'overview expanded', view: 'overview', project: () => expanded('overview') },
  {
    name: 'overview expanded, unpinned',
    view: 'overview',
    project: () => unpinned(expanded('overview'), 'overview'),
  },
  {
    name: 'processing with its tables open',
    view: 'processing',
    project: () => expanded('processing', (id) => id.startsWith('table-')),
  },
];

async function laidOut(project: ProjectSnapshot, viewId: Id) {
  const before = buildSceneAfresh(project, viewId);
  const input = layoutInput(before, project, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(project, viewId, before, { kind: 'view' }, result.shapes);
  if (!action) throw new Error('The layout moved nothing.');
  const built = buildSceneAfresh(apply(project, action.command), viewId);
  return { built, kept: keepRoutes(built, result.routes) };
}

describe('libavoid on the fixture (ADR 0080, section 2, Stage 1b)', () => {
  it.each(cases)(
    '$name',
    async (each) => {
      if (!lib) throw new Error('libavoid did not load');
      const { built, kept } = await laidOut(each.project(), each.view);
      const log = process.env.LIBAVOID_LOG;
      const row = (name: string, q: ReturnType<typeof measureScene>) =>
        `${name}: shared ${q.sharedSegments}, through ${q.linesThroughShapes} (+${q.linesOverCoveringShapes}), crossings ${q.crossings}, bends ${q.bendsPerLine.toFixed(2)}, rows at middle ${q.rowEndsAtMiddle}/${q.rowEnds}, lines ${q.lines}`;
      const report: string[] = [`== ${each.name}`];
      // Right after Layout, with ELK's kept routes; and once every line is routed, as after a move.
      for (const [when, held] of [
        ['after Layout', kept],
        ['all routed', undefined],
      ] as const) {
        const began = performance.now();
        const fallback = measureScene(routedWithKept(built, held));
        const fallbackTook = performance.now() - began;
        const router = new LibavoidRouter(lib, budget);
        const scene = routedWithKept(
          built,
          held,
          (shapes, lines, existing) => routeLines(shapes, lines, existing, router).results,
        );
        router.dispose();
        const quality = measureScene(scene);
        report.push(
          row(`  ${when}, fallback`, fallback),
          `    fallback routing and channels ${fallbackTook.toFixed(0)} ms`,
          row(`  ${when}, libavoid`, quality),
        );
        if (log) appendFileSync(log, `${report.splice(0).join('\n')}\n`);
        // What libavoid must hold wherever it routes: every end on a row at its row's middle, no
        // more shared segments than the program's router leaves, and no line through a shape where
        // that router leaves none. Crossings and bends are measured, not held: libavoid is only
        // compared here, and ships nowhere (ADR 0080's clarifications of 2026-10-30).
        expect(quality.rowEndsAtMiddle).toBe(quality.rowEnds);
        // With its pinned schemas, overview's corridors hold more lines than they have room for.
        if (each.name !== 'overview expanded') {
          expect(quality.sharedSegments).toBeLessThanOrEqual(fallback.sharedSegments);
        }
        if (fallback.linesThroughShapes === 0) expect(quality.linesThroughShapes).toBe(0);
      }
      // The routing time of each container, every line routed.
      const router = new LibavoidRouter(lib, budget);
      const batch = avoidBatchOf(built);
      const timed = router.route(batch.shapes, batch.lines);
      router.dispose();
      // No container keeps libavoid past its budget: those beyond it fall back.
      for (const run of timed.containers) {
        if (run.by === 'libavoid') expect(run.lines).toBeLessThanOrEqual(budget.lines);
      }
      report.push(
        ...timed.containers.map(
          (run) =>
            `  container ${run.holder}: ${run.lines} lines, ${run.shapes} shapes, ${run.by}${run.why ? ` (${run.why})` : ''}, ${run.took.toFixed(0)} ms`,
        ),
      );
      if (log) appendFileSync(log, `${report.join('\n')}\n`);
    },
    120_000,
  );
});
