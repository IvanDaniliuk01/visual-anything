/**
 * The drawing defaults the canvas, the read-only page and the exports draw with (ADR 0086): the
 * resolved values for a project and a view, cached by the identity of their `drawing` objects, so
 * that resolving them costs nothing a frame and a change gives another object, which draws again.
 *
 * This is the one place the app chooses how a project that names no preset is drawn. Until A5.2
 * makes Clean the look of such a project, it is drawn as the canvas drew before drawing defaults
 * (`DRAWING_BEFORE_A5`), with whatever the project and the view set laid over it; a project or a
 * view that names a preset is drawn from that preset, as the core resolves it.
 */
import {
  DRAWING_BEFORE_A5,
  DRAWING_GROUPS,
  resolveDrawing,
  type ProjectSnapshot,
  type ResolvedDrawing,
} from '@visual-anything/core';
import type { DrawingDefaults, Id } from '@visual-anything/schema';
import { ROBOTO, SANS_FAMILY } from './robotoFonts';

/** What a project that names no preset is drawn from. A5.2 changes this line to Clean. */
const NO_PRESET: ResolvedDrawing | undefined = DRAWING_BEFORE_A5;

/** The drawing of a project and a view that set nothing. */
export const BASE_DRAWING: ResolvedDrawing = resolveCanvasDrawing(undefined, undefined);

/** Stands for a project or a view that sets no drawing, as a key of the cache. */
const NONE = {};
const resolved = new WeakMap<object, WeakMap<object, ResolvedDrawing>>();

/**
 * The drawing defaults a project's and a view's `drawing` resolve to, the same object for the same
 * two: the project's preset, or the base, with the project's values and then the view's laid over.
 */
export function canvasDrawing(
  project: DrawingDefaults | undefined,
  view: DrawingDefaults | undefined,
): ResolvedDrawing {
  if (project === undefined && view === undefined) return BASE_DRAWING;
  const outer = project ?? NONE;
  let byView = resolved.get(outer);
  if (byView === undefined) {
    byView = new WeakMap();
    resolved.set(outer, byView);
  }
  const inner = view ?? NONE;
  let drawing = byView.get(inner);
  if (drawing === undefined) {
    drawing = resolveCanvasDrawing(project, view);
    byView.set(inner, drawing);
  }
  return drawing;
}

/** The drawing defaults the view with this id is drawn with; with no view, the project's. */
export function drawingOfView(project: ProjectSnapshot, viewId?: Id): ResolvedDrawing {
  const view =
    viewId === undefined ? undefined : project.views.find((each) => each.id === viewId)?.drawing;
  return canvasDrawing(project.project.drawing, view);
}

/**
 * The corner radius of a rounded rectangle of this size: the drawing's `shapes.cornerRadius`, at most
 * a quarter of either side.
 */
export function roundedCornerRadius(
  drawing: ResolvedDrawing,
  width: number,
  height: number,
): number {
  return Math.min(drawing.shapes.cornerRadius, width / 4, height / 4);
}

/** The corner radius of a person's body, a fifth rounder than a rounded rectangle's (12 for 10). */
export function personCornerRadius(drawing: ResolvedDrawing, width: number): number {
  return Math.min(drawing.shapes.cornerRadius * 1.2, width / 4);
}

/** The corner radius of a rounded shape that draws rows, a fifth tighter (8 for 10). */
export function rowsCornerRadius(drawing: ResolvedDrawing, width: number, height: number): number {
  return Math.min(drawing.shapes.cornerRadius * 0.8, width / 4, height / 2);
}

/**
 * How far in from its sides a shape keeps its text: the drawing's `text.padding`, which it keeps
 * from its label area's top and bottom, and 4 more (12 for 8).
 */
export function textSideInset(drawing: ResolvedDrawing): number {
  return drawing.text.padding + 4;
}

/**
 * The weight names are drawn in, as a CSS weight, one of those the canvas loads (`robotoFonts.ts`):
 * 400, 500 or 700, so that no weight that is not loaded is ever asked for.
 */
export function nameWeightOf(drawing: ResolvedDrawing): '400' | '500' | '700' {
  const weight = drawing.text.nameWeight;
  return weight === 400 ? '400' : weight === 500 ? '500' : '700';
}

/**
 * The widths names are measured in: Roboto's Regular at 400, its Bold above, which leans as wide as
 * Medium or wider, so that a name measured to fit fits once drawn.
 */
export function nameVariantOf(drawing: ResolvedDrawing): 'regular' | 'bold' {
  return drawing.text.nameWeight === 400 ? 'regular' : 'bold';
}

// --- Measures the canvas and the exports share, which no drawing default changes ------------------
// Kept here, with no PixiJS, so that the SVG writer reads the canvas's own rather than copies.

/** How much wider than its line a casing is, in canvas units. */
export const CASING_EXTRA = 2;
/** How far a relation's name's back reaches past its text, across and down, in canvas units. */
export const RELATION_LABEL_BACK: Readonly<{ x: number; y: number }> = { x: 3, y: 1 };
/** The corner radius of a drawing's plate, at most. */
export const PLATE_RADIUS = 6;
/** The height a name takes on one line, which a shape with its own outline gives it at least. */
export const NAME_LINE = 20;
/** The length of a dash and the period it repeats with, in line widths. */
export const DASH_PATTERNS: Readonly<Record<'dashed' | 'dotted', { on: number; period: number }>> =
  {
    dashed: { on: 4, period: 7 },
    // As a dash one line width long with round caps reads: two widths on, one off.
    dotted: { on: 2, period: 3 },
  };

/** The bundled Roboto first, then the system's fonts until it is loaded (`robotoFonts.ts`). */
const ROBOTO_FIRST: string[] = [...SANS_FAMILY];
/** The system's fonts alone. */
const SYSTEM_FONTS: string[] = SANS_FAMILY.filter((family) => family !== ROBOTO);

/**
 * The fonts a drawing writes in, first available first, by its `text.font`: one list for each,
 * shared, which no caller changes.
 */
export function fontFamilyOf(drawing: ResolvedDrawing): string[] {
  return drawing.text.font === 'system' ? SYSTEM_FONTS : ROBOTO_FIRST;
}

function resolveCanvasDrawing(
  project: DrawingDefaults | undefined,
  view: DrawingDefaults | undefined,
): ResolvedDrawing {
  const named = view?.preset ?? project?.preset;
  if (named !== undefined || NO_PRESET === undefined) return resolveDrawing(project, view);
  const base = NO_PRESET;
  const drawing: ResolvedDrawing = {
    preset: base.preset,
    lines: { ...base.lines },
    shapes: { ...base.shapes },
    text: { ...base.text },
    containers: { ...base.containers },
    aggregated: { ...base.aggregated },
    reading: { ...base.reading },
    grid: { ...base.grid },
  };
  for (const layer of [project, view]) {
    if (layer === undefined) continue;
    for (const group of DRAWING_GROUPS) {
      const values = layer[group];
      if (values === undefined) continue;
      for (const [name, value] of Object.entries(values)) {
        if (value !== undefined) (drawing[group] as Record<string, unknown>)[name] = value;
      }
    }
  }
  drawing.lines.arrow = base.lines.arrow;
  return drawing;
}
