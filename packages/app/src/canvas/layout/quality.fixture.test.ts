/**
 * Layout quality on the fixture shaped like the user's data model (ADR 0080, "Layout quality, held
 * by tests"): Layout in one pass, as the app runs it, measured as drawn, against the numbers the
 * Layout before ADR 0080 gave; and expanding in place, by hand, against the expansion thresholds.
 */
import {
  applyOperations,
  executeCommand,
  positionKey,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadDataModel } from '../../test/dataModel';
import type { Camera } from '../camera';
import type { Rect } from '../geometry';
import { avoidedScene } from '../routing/avoided';
import { buildSceneAfresh, type ElementShape, type Scene } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import {
  ExpansionMemory,
  cameraToShow,
  collapseCommand,
  expansionCommand,
  planExpansion,
} from './expand';
import { layoutInput } from './input';
import { keepRoutes, withKeptRoutes } from './keptRoutes';
import { measureScene, type LayoutQuality } from './quality';

const elk = new ELK();
const base = loadDataModel();

function apply(project: ProjectSnapshot, command: Command) {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done;
}

function viewOf(project: ProjectSnapshot, id: Id): ViewFile {
  return project.views.find((view) => view.id === id) as ViewFile;
}

/** The three views ADR 0080 holds, as the research opened them. */
function cases(): { name: string; view: Id; project: ProjectSnapshot }[] {
  const overview = viewOf(base, 'overview');
  const processing = viewOf(base, 'processing');
  return [
    { name: 'schema-view', view: 'schema-view', project: base },
    {
      name: 'overview expanded',
      view: 'overview',
      project: apply(base, {
        type: 'set-collapsed',
        view: 'overview',
        elements: [...(overview.collapsed ?? [])],
        collapsed: false,
      }).state,
    },
    {
      name: 'processing with its tables open',
      view: 'processing',
      project: apply(base, {
        type: 'set-collapsed',
        view: 'processing',
        elements: (processing.collapsed ?? []).filter((id) => id.startsWith('table-')),
        collapsed: false,
      }).state,
    },
  ];
}

/**
 * What the Layout before ADR 0080 drew of each view, measured on this fixture on 2026-10-29 with
 * `measureScene`, its lines routed as the canvas routes them. The research measured the same on the
 * user's own project: 38 crossings on `esquema-engine` and 2,192 to 2,247 on the whole database.
 */
const TODAY: Record<
  string,
  Pick<LayoutQuality, 'crossings' | 'linesThroughShapes' | 'sharedSegments'>
> = {
  'schema-view': { crossings: 38, linesThroughShapes: 6, sharedSegments: 1 },
  'overview expanded': { crossings: 2247, linesThroughShapes: 107, sharedSegments: 59 },
  'processing with its tables open': { crossings: 39, linesThroughShapes: 12, sharedSegments: 0 },
};

/** Lays out a view as Layout does, and draws it as the canvas does right after. */
async function laidOut(project: ProjectSnapshot, viewId: Id) {
  const before = buildSceneAfresh(project, viewId);
  const input = layoutInput(before, project, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(project, viewId, before, { kind: 'view' }, result.shapes);
  if (!action) throw new Error('The layout moved nothing.');
  const after = apply(project, action.command).state;
  const drawn = avoidedScene(buildSceneAfresh(after, viewId));
  const kept = keepRoutes(drawn, result.routes);
  return { before, after, result, scene: withKeptRoutes(drawn, kept), kept };
}

describe("Layout on a view shaped like the user's data model (ADR 0080)", () => {
  it.each(cases())('$name: no overlaps, ends at their rows, fewer crossings', async (each) => {
    const { before, scene, result, kept } = await laidOut(each.project, each.view);
    expect(result.stats.onePass).toBe(true);
    const quality = measureScene(scene);
    expect(quality.overlappingSiblings).toBe(0);
    expect(quality.rowEnds).toBeGreaterThan(0);
    expect(quality.rowEndsAtMiddle).toBe(quality.rowEnds);
    expect(quality.crossings).toBeLessThanOrEqual(TODAY[each.name]?.crossings ?? 0);
    // Lines beside rows keep their lane routes until Stage 0b, except those ELK routed: these share
    // no segment with another line and cross no shape.
    if (kept) {
      const elkRouted = measureScene(scene, { lines: (line) => kept.routes.has(line.relation) });
      expect(elkRouted.sharedSegments).toBe(0);
      expect(elkRouted.linesThroughShapes).toBe(0);
      expect(elkRouted.rowEndsAtMiddle).toBe(elkRouted.rowEnds);
    }
    // Pinned shapes never move.
    const pinned = before.shapes.filter((shape) => shape.positioned === 'pinned');
    const now = new Map(scene.shapes.map((shape) => [shape.key, shape]));
    for (const shape of pinned) expect(now.get(shape.key)?.offset).toEqual(shape.offset);
  });

  it('routes the schema view with ELK, crossing half as often as before', async () => {
    const { scene, kept } = await laidOut(base, 'schema-view');
    const quality = measureScene(scene);
    // 36 lines: 34 routed by ELK, 2 to shapes kept beyond the schema.
    expect(kept?.routes.size).toBeGreaterThanOrEqual(30);
    expect(quality.sharedSegments).toBe(0);
    expect(quality.linesThroughShapes).toBe(0);
    expect(quality.crossingsPerLine).toBeLessThanOrEqual(0.7);
    expect(quality.fill).toBeGreaterThan(0.2);
    expect(quality.aspect).toBeGreaterThanOrEqual(0.5);
    expect(quality.aspect).toBeLessThanOrEqual(3);
  });
});

/** Where each shape is, relative to World, by key. */
function rectsOf(scene: Scene): Map<string, ElementShape> {
  return new Map(scene.shapes.map((shape) => [shape.key, shape]));
}

/** Whether a rectangle shows whole in a viewport through a camera, `margin` pixels inside it. */
function onScreen(camera: Camera, viewport: { width: number; height: number }, rect: Rect) {
  const left = rect.x * camera.scale + camera.x;
  const top = rect.y * camera.scale + camera.y;
  return (
    left >= -0.5 &&
    top >= -0.5 &&
    left + rect.width * camera.scale <= viewport.width + 0.5 &&
    top + rect.height * camera.scale <= viewport.height + 0.5
  );
}

describe('Expanding in place on the fixture (ADR 0080, section 4)', () => {
  const overview = viewOf(base, 'overview');
  const schemas = (overview.collapsed ?? []).filter((id) => id.startsWith('schema-'));
  const viewport = { width: 1600, height: 1000 };

  it.each(schemas)(
    'expanding %s keeps its corner, moves only what it covers, overlaps nothing',
    async (schema) => {
      const before = buildSceneAfresh(base, 'overview');
      const plan = planExpansion(base, 'overview', before, [schema]);
      if (!plan?.input) throw new Error('Nothing to expand.');
      const result = await layOut(plan.input, elk);
      const label = `Expand "${schema}"`;
      const made = expansionCommand('overview', [schema], plan, result.shapes, label);
      expect(made.command.type === 'batch' && made.command.label).toBe(label);
      const done = apply(base, made.command);
      const after = buildSceneAfresh(done.state, 'overview');
      const was = rectsOf(before);
      const now = rectsOf(after);
      const box = [...was.values()].find((shape) => shape.element === schema) as ElementShape;
      const opened = now.get(box.key) as ElementShape;
      expect(opened.collapsed).toBeUndefined();
      // Its anchored corner moves 0.
      const corners = [
        [box.rect.x, box.rect.y, opened.rect.x, opened.rect.y],
        [box.rect.x + box.rect.width, box.rect.y, opened.rect.x + opened.rect.width, opened.rect.y],
        [
          box.rect.x,
          box.rect.y + box.rect.height,
          opened.rect.x,
          opened.rect.y + opened.rect.height,
        ],
      ];
      expect(corners.some(([x0, y0, x1, y1]) => x0 === x1 && y0 === y1)).toBe(true);
      // No other shape moves more than the box grew, plus 40.
      const grew = {
        x: opened.rect.width - box.rect.width,
        y: opened.rect.height - box.rect.height,
      };
      for (const [key, shape] of was) {
        const other = now.get(key);
        if (!other || key === box.key || key.startsWith(`${box.key}/`)) continue;
        if (box.key.startsWith(`${key}/`)) continue;
        expect(Math.abs(other.rect.x - shape.rect.x), key).toBeLessThanOrEqual(grew.x + 40);
        expect(Math.abs(other.rect.y - shape.rect.y), key).toBeLessThanOrEqual(grew.y + 40);
      }
      // Nothing overlaps that layout could move.
      expect(measureScene(after).overlappingSiblings).toBe(0);
      // The box is whole on screen once the camera eases, from a camera centered on it collapsed.
      const scale = 0.5;
      const camera: Camera = {
        scale,
        x: viewport.width / 2 - (box.rect.x + box.rect.width / 2) * scale,
        y: viewport.height / 2 - (box.rect.y + box.rect.height / 2) * scale,
      };
      const eased = cameraToShow(camera, viewport, opened.extent) ?? camera;
      expect(onScreen(eased, viewport, opened.extent)).toBe(true);
      // Undo puts everything back.
      const undone = applyOperations(done.state, done.inverse).state;
      expect(viewOf(undone, 'overview')).toEqual(overview);
      // Collapsing again gives every moved shape its place back.
      const memory = new ExpansionMemory();
      memory.remember('overview', [schema], made.moved);
      const back = apply(
        done.state,
        collapseCommand(done.state, 'overview', [schema], label, memory),
      );
      const stored = new Map(overview.positions.map((each) => [positionKey(each), each]));
      for (const position of viewOf(back.state, 'overview').positions) {
        const first = stored.get(positionKey(position));
        if (!first || !made.moved.some((each) => positionKey(each) === positionKey(position)))
          continue;
        expect(Math.abs(position.x - first.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(position.y - first.y)).toBeLessThanOrEqual(1);
      }
      expect(new Set(viewOf(back.state, 'overview').collapsed)).toEqual(
        new Set(overview.collapsed),
      );
    },
  );

  it("opening processing's tables in place overlaps nothing, where opening them as stored covered 15", async () => {
    const processing = viewOf(base, 'processing');
    const tables = (processing.collapsed ?? []).filter((id) => id.startsWith('table-'));
    const opened = apply(base, {
      type: 'set-collapsed',
      view: 'processing',
      elements: tables,
      collapsed: false,
    }).state;
    expect(measureScene(buildSceneAfresh(opened, 'processing')).overlappingSiblings).toBe(15);
    const before = buildSceneAfresh(base, 'processing');
    const plan = planExpansion(base, 'processing', before, tables);
    if (!plan?.input) throw new Error('Nothing to expand.');
    const result = await layOut(plan.input, elk);
    const made = expansionCommand(
      'processing',
      tables,
      plan,
      result.shapes,
      'Expand 26 containers',
    );
    const after = buildSceneAfresh(apply(base, made.command).state, 'processing');
    expect(measureScene(after).overlappingSiblings).toBe(0);
  });
});
