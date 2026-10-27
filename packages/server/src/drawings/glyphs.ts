/**
 * Which characters a font draws, read from its character map (ADR 0068): a drawing's text is written
 * as the outlines of Roboto's glyphs, and a character Roboto has no glyph for, such as an emoji, would
 * be drawn as an empty box. It is left out instead, and reported.
 *
 * The fonts are WOFF files, whose tables are each compressed with zlib or stored as they are. The
 * character map's subtables of format 4 (the Basic Multilingual Plane) and 12 (every plane) are read.
 */
import { inflateSync } from 'node:zlib';

/** Ranges of code points, from and to, sorted and apart. */
export type Coverage = readonly (readonly [number, number])[];

/** The code points a WOFF font maps to a glyph. Throws for bytes that are not such a font. */
export function coverageOf(woff: Uint8Array): Coverage {
  const cmap = woffTable(woff, 'cmap');
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const count = view.getUint16(2);
  let best: { offset: number; rank: number } | undefined;
  for (let at = 0; at < count; at++) {
    const record = 4 + at * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = view.getUint32(record + 4);
    const format = view.getUint16(offset);
    // Unicode's full repertoire first, then its Basic Multilingual Plane.
    const rank =
      format === 12 && (platform === 3 || platform === 0)
        ? 2
        : format === 4 && ((platform === 3 && encoding === 1) || platform === 0)
          ? 1
          : 0;
    if (rank > 0 && (best === undefined || rank > best.rank)) best = { offset, rank };
  }
  if (best === undefined) throw new Error('The font has no Unicode character map.');
  const ranges = best.rank === 2 ? format12(view, best.offset) : format4(view, best.offset);
  return merged(ranges);
}

/** Whether a coverage holds a code point. */
export function covers(coverage: Coverage, codePoint: number): boolean {
  let low = 0;
  let high = coverage.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [from, to] = coverage[middle] as readonly [number, number];
    if (codePoint < from) high = middle - 1;
    else if (codePoint > to) low = middle + 1;
    else return true;
  }
  return false;
}

/** A table of a WOFF font, inflated. */
function woffTable(woff: Uint8Array, tag: string): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < 44 || view.getUint32(0) !== 0x774f4646) {
    throw new Error('The font is not a WOFF file.');
  }
  const tables = view.getUint16(12);
  for (let at = 0; at < tables; at++) {
    const entry = 44 + at * 20;
    const name = String.fromCharCode(...woff.subarray(entry, entry + 4));
    if (name !== tag) continue;
    const offset = view.getUint32(entry + 4);
    const stored = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    const bytes = woff.subarray(offset, offset + stored);
    return stored < length ? new Uint8Array(inflateSync(bytes)) : bytes;
  }
  throw new Error(`The font has no ${tag} table.`);
}

/** The ranges of a format 4 subtable whose glyphs are not the missing one. */
function format4(view: DataView, offset: number): [number, number][] {
  const segments = view.getUint16(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  const ranges: [number, number][] = [];
  for (let segment = 0; segment < segments; segment++) {
    const end = view.getUint16(ends + segment * 2);
    const start = view.getUint16(starts + segment * 2);
    const delta = view.getUint16(deltas + segment * 2);
    const rangeOffset = view.getUint16(rangeOffsets + segment * 2);
    if (start === 0xffff) continue;
    let from: number | undefined;
    for (let code = start; code <= end; code++) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
      else {
        const at = rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
        glyph = view.getUint16(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) {
        if (from === undefined) from = code;
      } else if (from !== undefined) {
        ranges.push([from, code - 1]);
        from = undefined;
      }
    }
    if (from !== undefined) ranges.push([from, end]);
  }
  return ranges;
}

/** The ranges of a format 12 subtable. */
function format12(view: DataView, offset: number): [number, number][] {
  const groups = view.getUint32(offset + 12);
  const ranges: [number, number][] = [];
  for (let group = 0; group < groups; group++) {
    const at = offset + 16 + group * 12;
    const from = view.getUint32(at);
    const to = view.getUint32(at + 4);
    const glyph = view.getUint32(at + 8);
    // A group that starts at the missing glyph maps its first code point to nothing.
    if (glyph === 0) {
      if (to > from) ranges.push([from + 1, to]);
    } else ranges.push([from, to]);
  }
  return ranges;
}

function merged(ranges: [number, number][]): Coverage {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = out.at(-1);
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}
