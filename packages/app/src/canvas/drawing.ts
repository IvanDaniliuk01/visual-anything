/**
 * The drawing defaults the canvas, the read-only page and the exports draw with (ADR 0086): the
 * resolved values for a project and a view, cached by the identity of their `drawing` objects, so
 * that resolving them costs nothing a frame and a change gives another object, which draws again.
 *
 * The core resolves them (`resolveDrawing`; ADR 0086, "One module resolves them"): a project that
 * names no preset is drawn from Clean, the default preset (A5.2), with whatever the project and the
 * view set laid over it, and a project or a view that names a preset from that preset.
 *
 * It also holds the measures the canvas and the exports share: those a drawing default changes, as
 * a container's header (`headerPlacesOf`), and those none changes, as the casing.
 */
import {
  DRAWING_GROUPS,
  resolveDrawing,
  type ProjectSnapshot,
  type ResolvedDrawing,
} from '@visual-anything/core';
import type { DrawingDefaults, Id } from '@visual-anything/schema';
import { ROBOTO, SANS_FAMILY } from './fontFamilies';
import type { Rect } from './geometry';

/** The drawing of a project and a view that set nothing: Clean (A5.2). */
export const BASE_DRAWING: ResolvedDrawing = resolveDrawing(undefined, undefined);

/** Stands for a project or a view that sets no drawing, as a key of the cache. */
const NONE = {};
const resolved = new WeakMap<object, WeakMap<object, ResolvedDrawing>>();

/**
 * The drawing defaults a project's and a view's `drawing` resolve to, the same object for the same
 * two: the project's preset, or the base, with the project's values and then the view's laid over.
 * Drawing defaults that come to the base's values, as an empty one, are the base itself.
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
    const made = resolveDrawing(project, view);
    drawing = sameDrawing(made, BASE_DRAWING) ? BASE_DRAWING : made;
    byView.set(inner, drawing);
  }
  return drawing;
}

/** Whether two resolved drawings hold the same values, group by group. */
function sameDrawing(a: ResolvedDrawing, b: ResolvedDrawing): boolean {
  if (a.preset !== b.preset) return false;
  if (!sameValues(a.lines.arrow, b.lines.arrow)) return false;
  return DRAWING_GROUPS.every((group) => sameValues(a[group], b[group]));
}

function sameValues(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key === 'arrow' || Object.is(left[key], right[key]))
  );
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

/**
 * A soft shadow (ADR 0086): one copy of a shape offset 2 down, 12 % dark at its middle, blurred by
 * three layers each a unit wider than the next, which cost three fills rather than a filter.
 */
export const SOFT_SHADOW = { offset: 2, alpha: 0.12, layers: 3 } as const;
/** How far a count badge's pill reaches past its count, across and down, and its border's width. */
export const COUNT_BADGE_PADDING = { x: 5, y: 2, border: 1 } as const;

/** How large a count badge's pill is around a count this large: never narrower than tall. */
export function countBadgeSize(width: number, height: number): { width: number; height: number } {
  const tall = height + 2 * COUNT_BADGE_PADDING.y;
  return { width: Math.max(tall, width + 2 * COUNT_BADGE_PADDING.x), height: tall };
}

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

// --- A container's header, as one drawn as its kind writes it -------------------------------------
// The canvas, the SVG, the hover card, the scene and the routing read these, so that a header's
// rooms grow with the sizes it writes in, and no size the panel or Claude allows loses a name.

/** How far below a container's top its name is written, and the gap between its name and detail. */
export const HEADER_NAME_TOP = 8;
export const HEADER_NAME_GAP = 6;
/** What a header keeps free under its name's and its detail's rooms, inside its body. */
const HEADER_KEEPS = 4;
/** The least room a header gives its detail: the canvas's before drawing defaults. */
const LEAST_DETAIL_ROOM = 16;
/**
 * How tall a label of one line is drawn, in ems, and a little more: Roboto's ascent and descent
 * together come to about 1.17, whatever the drawing's line height.
 */
const LABEL_LINE = 1.25;

/**
 * The height a line of text this size takes in a drawing: its line height, and never less than a
 * label of one line is drawn, on the canvas or in the exports.
 */
export function lineOf(drawing: ResolvedDrawing, size: number): number {
  return size * Math.max(drawing.text.lineHeight, LABEL_LINE);
}

/** Where a container's header writes its name and its detail, below its top, and how tall each may be. */
export interface HeaderPlaces {
  nameTop: number;
  nameRoom: number;
  detailTop: number;
  detailRoom: number;
}

/**
 * Where a container drawn as its kind writes its name and its detail, from the drawing's sizes and
 * line height: its name 8 below its top, in a room of one line of it and never less than 20; its
 * detail 6 under the name's size, in a room of one line of it and never less than 16, the rooms of
 * before drawing defaults.
 */
export function headerPlacesOf(drawing: ResolvedDrawing): HeaderPlaces {
  const { containerNameSize, detailSize } = drawing.text;
  return {
    nameTop: HEADER_NAME_TOP,
    nameRoom: Math.max(NAME_LINE, lineOf(drawing, containerNameSize)),
    detailTop: HEADER_NAME_TOP + containerNameSize + HEADER_NAME_GAP,
    detailRoom: Math.max(LEAST_DETAIL_ROOM, lineOf(drawing, detailSize)),
  };
}

/**
 * How tall a container's name and its detail may be in a body this tall, so that they stay inside
 * it: one line each, the name's room under its top and the detail's under the name's. At the sizes
 * of before, 20 and 16 at most, and 12 and 32 less than the body.
 */
export function headerRoomsOf(
  drawing: ResolvedDrawing,
  height: number,
): { name: number; detail: number } {
  const { nameTop, nameRoom, detailRoom } = headerPlacesOf(drawing);
  return {
    name: Math.min(nameRoom, height - nameTop - HEADER_KEEPS),
    detail: Math.min(detailRoom, height - nameTop - nameRoom - HEADER_KEEPS),
  };
}

/**
 * How tall a container's body must be at least for its header to give its name and one line of its
 * detail their whole rooms: 48 at the sizes of before, more where the drawing writes larger.
 */
export function headerHeldOf(drawing: ResolvedDrawing): number {
  const { nameTop, nameRoom, detailRoom } = headerPlacesOf(drawing);
  return Math.ceil(nameTop + nameRoom + detailRoom + HEADER_KEEPS);
}

/**
 * A container's toggle, as the canvas and the SVG draw it: its corners' radius, its border's width,
 * how far its sign reaches from its middle, as a part of its side, and the sign's width.
 */
export const TOGGLE_LOOK = { radius: 3, border: 1, arm: 0.28, sign: 1.5 } as const;

/** How far below a note's top its text starts, and how far above its bottom it stops. */
const NOTE_TEXT_TOP = 10;
const NOTE_TEXT_BOTTOM = 8;

/**
 * Where a note writes its text in its rectangle, and at what size: the drawing's side inset in at
 * the sides (12 units unless it says otherwise), 10 below its top and 8 above its bottom, at its
 * `text.noteSize`.
 */
export function noteTextPlaceIn(
  rect: Rect,
  drawing: ResolvedDrawing,
): { x: number; y: number; width: number; height: number; size: number } {
  const inset = textSideInset(drawing);
  return {
    x: rect.x + inset,
    y: rect.y + NOTE_TEXT_TOP,
    width: Math.max(1, rect.width - 2 * inset),
    height: Math.max(0, rect.height - NOTE_TEXT_TOP - NOTE_TEXT_BOTTOM),
    size: drawing.text.noteSize,
  };
}
