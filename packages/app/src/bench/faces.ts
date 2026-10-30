/**
 * The benchmark's phases with faces (ADR 0083, F5), with `?faces`: every component the view draws
 * gains a face through a project appearance; with `?tables`, every table a header with its name and
 * its component over its rows, and every column its name in monospace, its type in italics and its
 * badges, as Data modeling's faces draw them. The canvas then lays out each face its tiles draw, and
 * draws its boxes and its text by glyph quads, while the camera pans and zooms where faces show.
 *
 * What the browser does not need to measure is measured here too, in Node as in the page
 * (`measureFacesScene`): the scene's first build with every face, which lays out every face that
 * sizes its shape before layout (F2 left it unmeasured); the scene built again after one move; and how
 * often the face layout cache already holds the drawing a tile asks for. Recorded, never held.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { Face, Id, ViewFile } from '@visual-anything/schema';
import { faceCounts, resetFaceCounts, shapeFaceDrawing } from '../canvas/faces';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from '../canvas/scene';

/** A table's face: its name in bold over its component's name, as the header of its rows. */
export const BENCH_TABLE_FACE: Face = {
  markup: [
    '<header class="head">',
    '  <b>{{name}}</b>',
    '  <small>{{component}}</small>',
    '</header>',
    '<rows/>',
  ],
  style: [
    '.head { display: flex; flex-direction: column; padding: 6px 10px; gap: 2px; }',
    'b { font-size: 13px; line-clamp: 1; }',
    'small { color: var(--text-muted); }',
  ],
};

/** A column's face: its name in monospace, its type in italics, and its badges, on one line. */
export const BENCH_COLUMN_FACE: Face = {
  markup: ['<p><code>{{name}}</code> <i>{{type ?? "—"}}</i> <badges/></p>'],
  style: ['face { justify-content: center; padding: 0 8px; }', 'p { white-space: nowrap; }'],
};

/** Every other component's face: its name, and its component's name under it, in its shape. */
export const BENCH_CARD_FACE: Face = {
  markup: ['<b>{{name}}</b>', '<small>{{component}}</small>'],
  style: [
    'face { justify-content: center; padding: 4px 8px; gap: 2px; }',
    'b { line-clamp: 1; text-align: center; }',
    'small { color: var(--text-muted); text-align: center; line-clamp: 1; }',
  ],
};

/** The face the benchmark gives a component, by its id. */
function benchFaceOf(component: Id): Face {
  if (component === 'data-modeling.table') return BENCH_TABLE_FACE;
  if (component === 'data-modeling.column') return BENCH_COLUMN_FACE;
  return BENCH_CARD_FACE;
}

/**
 * The project with a face on every component its elements are of, through project appearances (ADR
 * 0034), so that the packages stay as they are.
 */
export function withBenchFaces(project: ProjectSnapshot): ProjectSnapshot {
  const used = new Set(project.model.elements.map((element) => element.component));
  const components = { ...project.project.appearances?.components };
  for (const id of used) components[id] = { ...components[id], face: benchFaceOf(id) };
  return {
    ...project,
    project: {
      ...project.project,
      appearances: { ...project.project.appearances, components },
    },
  };
}

/** How the face layout cache answered a run of drawings: how many were asked for and laid out. */
export interface FaceCounts {
  asked: number;
  laidOut: number;
  /** How long it took, in milliseconds, where it was timed. */
  took?: number;
}

/** What `measureFacesScene` measured, in milliseconds and counts. */
export interface FacesSceneNumbers {
  shapes: number;
  /** Shapes that carry a face. */
  faced: number;
  /** The scene built from nothing with every face, as when the view opens, each run. */
  firstBuilds: number[];
  /** Faces laid out during it: those of size `content`, and every header before `<rows/>`. */
  firstBuildCounts: FaceCounts;
  /** The scene built again from the one before, after one shape moves, each time. */
  moves: number[];
  /** Faces laid out during those builds. */
  moveCounts: FaceCounts;
  /** Every face drawn once after the first build, as tiles over the whole view would ask. */
  drawn: FaceCounts;
  /** Every face drawn once more after the moves: what a tile drawn again asks for. */
  drawnAgain: FaceCounts;
}

/** The shape a move moves: a shape of its own in World, the middle one of the view's. */
function movedShape(scene: Scene): ElementShape | undefined {
  const free = scene.shapes.filter(
    (shape) => shape.row === undefined && shape.containerShape === undefined,
  );
  return free[Math.floor(free.length / 2)];
}

/** Draws every face of a scene once, as tiles drawing it all would, and counts the cache's answers. */
function drawEvery(scene: Scene): FaceCounts {
  resetFaceCounts();
  const began = performance.now();
  for (const shape of scene.shapes) if (shape.face) shapeFaceDrawing(shape);
  return { ...faceCounts(), took: performance.now() - began };
}

/**
 * Measures the scene with faces: its first build, from nothing, `runs` times; `moves` builds after one
 * move each, going on from the scene before as the app's do; and the face layout cache's answers when
 * every face is drawn after the first build, and again after the moves, as tiles drawn again ask.
 * `project` is drawn with faces as it is: give it `withBenchFaces` first.
 */
export function measureFacesScene(
  project: ProjectSnapshot,
  viewId: Id = (project.views[0] as ViewFile).id,
  options: { moves?: number; runs?: number } = {},
): FacesSceneNumbers {
  const { moves = 10, runs = 1 } = options;
  // A build from nothing keeps nothing, not even a face laid out: each lays out every face anew.
  const firstBuilds: number[] = [];
  let first: Scene | undefined;
  let firstBuildCounts: FaceCounts = { asked: 0, laidOut: 0 };
  for (let run = 0; run < Math.max(1, runs); run++) {
    resetFaceCounts();
    const began = performance.now();
    first = buildSceneAfresh(project, viewId);
    firstBuilds.push(performance.now() - began);
    firstBuildCounts = faceCounts();
  }
  const built = first as Scene;
  const drawn = drawEvery(built);

  // The app's scene, drawn whole once, then built again after each move from the one before.
  let current = project;
  let scene = buildScene(current, viewId);
  drawEvery(scene);
  const shape = movedShape(scene);
  const times: number[] = [];
  resetFaceCounts();
  for (let each = 1; each <= moves && shape; each++) {
    const outcome = executeCommand(current, {
      type: 'set-positions',
      view: viewId,
      positions: [{ element: shape.element, x: shape.offset.x + each * 8, y: shape.offset.y }],
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    current = outcome.state;
    const began = performance.now();
    scene = buildScene(current, viewId);
    times.push(performance.now() - began);
  }
  const moveCounts = faceCounts();
  const drawnAgain = drawEvery(scene);
  return {
    shapes: built.shapes.length,
    faced: built.shapes.filter((each) => each.face !== undefined).length,
    firstBuilds,
    firstBuildCounts,
    moves: times,
    moveCounts,
    drawn,
    drawnAgain,
  };
}

/** A share as a percentage with one decimal, or "–" of nothing. */
export function hitRate(counts: FaceCounts): string {
  if (counts.asked === 0) return '–';
  return `${(((counts.asked - counts.laidOut) / counts.asked) * 100).toFixed(1)}%`;
}
