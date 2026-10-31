/**
 * The table of a drawing's part states (ADR 0075): what the parts' shader reads, one entry for each of
 * its solid's named parts, so that a change of focus, selection, hover, playback step or overlay
 * rewrites the table and never the picture.
 *
 * Each entry says how its part looks over the picture:
 * - **a veil** of the drawing's fill, for a part drawn faintly by focus or as the container of what a
 *   filter shows, or by an overlay's opacity;
 * - **an overlay's fill**, laid over it, faint as the part is;
 * - **marks** along its edges in the part buffer: selection, hover and highlight (playback, guidance
 *   and a tour), each with a casing that keeps 3:1 on any picture;
 * - whether a filter or isolation **hides** it, which draws the solid again without it: it then draws
 *   no mark while the old picture still shows.
 *
 * A part's entry comes from the element it stands for and from those of the parts holding it, so that
 * selecting the heart marks its chambers too: marks are inherited by every part inside, and a part
 * that stands for no element takes its veil, fill and hiding from the part holding it, or from the
 * drawing for a part held by none.
 *
 * Pure, with no PixiJS: the layer uploads `table` as a texture, and the tests read it.
 */
import type { Color, SolidPart } from '@visual-anything/schema';
import { DIMMED_ALPHA } from '../colors';

/** Bits of an entry's marks. */
export const PART_MARK = { selected: 1, hovered: 2, highlighted: 4, hidden: 8 } as const;

/** How many entries a row of the table holds: the texture is this wide. */
export const STATE_TABLE_WIDTH = 256;

/** What one part looks like over the picture. */
export interface PartState {
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  hidden: boolean;
  /** How much of the drawing's fill is laid over it, from 0 to 1. */
  veil: number;
  /** An overlay's fill, and how much of it covers the part. */
  fill?: Color;
  fillAlpha?: number;
}

/** What the canvas says of one element drawn as a part. */
export interface PartElementState {
  selected?: boolean;
  hovered?: boolean;
  highlighted?: boolean;
  /** Drawn faintly by focus, or as the container of what a filter shows. */
  faint?: boolean;
  /** Hidden by a filter or isolation. */
  hidden?: boolean;
  /** An overlay's fill and opacity, below 1. */
  fill?: Color;
  opacity?: number;
}

/** A drawing's part states, and the table the shader reads them from. */
export interface PartStates {
  /** One for each named part, in the solid's depth-first order. */
  parts: PartState[];
  /**
   * RGBA bytes, `STATE_TABLE_WIDTH` entries a row, two rows for each band of entries: entry `v`, the
   * value a part buffer holds (0 for none, a part's index plus one), sits at column `v % 256` of rows
   * `2 * floor(v / 256)` (its fill: red, green, blue and how much of it covers) and the one under it
   * (its veil, its marks' bits, 0 and 255).
   */
  table: Uint8Array;
  /** The table's size, in entries across and rows down. */
  width: number;
  height: number;
  /** The indexes of the parts hidden, ascending: what the picture is drawn again without. */
  hidden: number[];
  /** Whether any part shows a mark, a veil or a fill: without, the picture is drawn as it is. */
  any: boolean;
}

/**
 * The states of a solid's parts, from what the canvas says of the elements its parts stand for, by
 * part index, and whether the drawing itself is drawn faintly.
 */
export function partStatesOf(
  parts: readonly SolidPart[],
  elements: ReadonlyMap<number, PartElementState>,
  drawingFaint = false,
): PartStates {
  const states: PartState[] = [];
  for (let at = 0; at < parts.length; at++) {
    const part = parts[at] as SolidPart;
    // A part's parent comes before it in depth-first order; one that does not is held by none.
    const holder = part.parent === undefined || part.parent >= at ? undefined : states[part.parent];
    const own = elements.get(at);
    const state: PartState = {
      selected: own?.selected === true || holder?.selected === true,
      hovered: own?.hovered === true || holder?.hovered === true,
      highlighted: own?.highlighted === true || holder?.highlighted === true,
      hidden: own ? own.hidden === true : holder?.hidden === true,
      veil: 0,
    };
    if (own) {
      const faint = own.faint === true;
      // What shows of it: the faint share when faint, times an overlay's opacity.
      state.veil = clamp01(1 - (faint ? DIMMED_ALPHA : 1) * (own.opacity ?? 1));
      if (own.fill !== undefined) {
        state.fill = own.fill;
        state.fillAlpha = faint ? DIMMED_ALPHA : 1;
      }
    } else if (holder) {
      state.veil = holder.veil;
      if (holder.fill !== undefined) {
        state.fill = holder.fill;
        state.fillAlpha = holder.fillAlpha ?? 1;
      }
    } else if (drawingFaint) {
      state.veil = 1 - DIMMED_ALPHA;
    }
    states.push(state);
  }
  return tableOf(states);
}

function tableOf(parts: PartState[]): PartStates {
  const entries = parts.length + 1;
  const bands = Math.max(1, Math.ceil(entries / STATE_TABLE_WIDTH));
  const width = STATE_TABLE_WIDTH;
  const height = 2 * bands;
  const table = new Uint8Array(width * height * 4);
  // Entry 0, where no part is drawn, holds nothing: no veil, no fill, no marks.
  writeEntry(table, 0, undefined);
  const hidden: number[] = [];
  let any = false;
  parts.forEach((state, at) => {
    writeEntry(table, at + 1, state);
    if (state.hidden) hidden.push(at);
    any ||=
      state.selected ||
      state.hovered ||
      state.highlighted ||
      state.veil > 0 ||
      (state.fill !== undefined && (state.fillAlpha ?? 0) > 0);
  });
  return { parts, table, width, height, hidden, any };
}

/** Where entry `v`'s first byte sits in the table, in its fill's row. */
export function entryOffset(value: number): number {
  const column = value % STATE_TABLE_WIDTH;
  const band = Math.floor(value / STATE_TABLE_WIDTH);
  return (2 * band * STATE_TABLE_WIDTH + column) * 4;
}

/** The bits of a part's marks, as the table holds them. */
export function markBits(state: PartState): number {
  return (
    (state.selected ? PART_MARK.selected : 0) |
    (state.hovered ? PART_MARK.hovered : 0) |
    (state.highlighted ? PART_MARK.highlighted : 0) |
    (state.hidden ? PART_MARK.hidden : 0)
  );
}

function writeEntry(table: Uint8Array, value: number, state: PartState | undefined): void {
  const fillAt = entryOffset(value);
  const veilAt = fillAt + STATE_TABLE_WIDTH * 4;
  const fill = state?.fill !== undefined ? rgbOf(state.fill) : [0, 0, 0];
  table[fillAt] = fill[0] as number;
  table[fillAt + 1] = fill[1] as number;
  table[fillAt + 2] = fill[2] as number;
  table[fillAt + 3] = state?.fill !== undefined ? Math.round(255 * (state.fillAlpha ?? 1)) : 0;
  table[veilAt] = Math.round(255 * (state?.veil ?? 0));
  table[veilAt + 1] = state ? markBits(state) : 0;
  table[veilAt + 2] = 0;
  table[veilAt + 3] = 255;
}

/** A color's red, green and blue, from 0 to 255. */
export function rgbOf(color: Color): [number, number, number] {
  const value = Number.parseInt(color.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Whether two tables hold the same bytes, so that an unchanged one is not uploaded again. */
export function sameTable(a: PartStates | undefined, b: PartStates): boolean {
  if (!a || a.width !== b.width || a.height !== b.height) return false;
  const x = a.table;
  const y = b.table;
  for (let at = 0; at < x.length; at++) if (x[at] !== y[at]) return false;
  return true;
}
