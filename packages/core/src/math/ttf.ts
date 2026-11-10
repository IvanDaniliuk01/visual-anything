/**
 * Reads what Math needs from one of KaTeX's TrueType fonts, given as bytes: each code point's advance
 * width (`cmap` and `hmtx`), the line metrics (`hhea`) and each glyph's outline (`glyf`). Only
 * `generate.ts` and its test use it, to write and check the committed tables; nothing reads a font
 * while a formula is laid out.
 */

/** One font's tables, in its own units. */
export interface TrueTypeFont {
  unitsPerEm: number;
  ascent: number;
  /** Below the baseline, positive. */
  descent: number;
  /** Code point to glyph index, ascending by code point. */
  glyphOf: Map<number, number>;
  advanceOf(glyph: number): number;
  /** The glyph's contours, as quadratic segments in font units with y up; empty for a blank glyph. */
  contoursOf(glyph: number): Contour[];
  /** The bounding box the glyph's header records, in font units with y up. */
  boundsOf(glyph: number): { xMin: number; yMin: number; xMax: number; yMax: number } | undefined;
}

/** One closed contour: its points, each on the curve or a quadratic control point. */
export type Contour = { x: number; y: number; onCurve: boolean }[];

export function readTrueType(bytes: Uint8Array): TrueTypeFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, number>();
  const tableCount = view.getUint16(4);
  for (let i = 0; i < tableCount; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    tables.set(tag, view.getUint32(record + 8));
  }
  const table = (tag: string): number => {
    const offset = tables.get(tag);
    if (offset === undefined) throw new Error(`The font has no ${tag} table.`);
    return offset;
  };
  const head = table('head');
  const hhea = table('hhea');
  const hmtx = table('hmtx');
  const maxp = table('maxp');
  const unitsPerEm = view.getUint16(head + 18);
  const longOffsets = view.getInt16(head + 50) !== 0;
  const glyphCount = view.getUint16(maxp + 4);
  const metricCount = view.getUint16(hhea + 34);

  const glyphOf = readCmap(view, table('cmap'));
  const loca = tables.get('loca');
  const glyf = tables.get('glyf');

  const glyphRange = (glyph: number): [number, number] | undefined => {
    if (loca === undefined || glyf === undefined || glyph >= glyphCount) return undefined;
    const start = longOffsets
      ? view.getUint32(loca + 4 * glyph)
      : view.getUint16(loca + 2 * glyph) * 2;
    const end = longOffsets
      ? view.getUint32(loca + 4 * glyph + 4)
      : view.getUint16(loca + 2 * glyph + 2) * 2;
    return end > start ? [glyf + start, glyf + end] : undefined;
  };

  return {
    unitsPerEm,
    ascent: view.getInt16(hhea + 4),
    descent: -view.getInt16(hhea + 6),
    glyphOf,
    advanceOf: (glyph) => view.getUint16(hmtx + 4 * Math.min(glyph, metricCount - 1)),
    contoursOf: (glyph) => {
      const range = glyphRange(glyph);
      return range === undefined ? [] : readSimpleGlyph(view, range[0]);
    },
    boundsOf: (glyph) => {
      const range = glyphRange(glyph);
      if (range === undefined) return undefined;
      const at = range[0];
      return {
        xMin: view.getInt16(at + 2),
        yMin: view.getInt16(at + 4),
        xMax: view.getInt16(at + 6),
        yMax: view.getInt16(at + 8),
      };
    },
  };
}

/** The code points of formats 4 and 12, ascending. */
function readCmap(view: DataView, cmap: number): Map<number, number> {
  const found = new Map<number, number>();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const offset = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(offset);
    if (format === 4) {
      const segX2 = view.getUint16(offset + 6);
      const ends = offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = view.getUint16(ends + 2 * s);
        const start = view.getUint16(starts + 2 * s);
        const delta = view.getInt16(deltas + 2 * s);
        const rangeOffset = view.getUint16(ranges + 2 * s);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (cp + delta) & 0xffff;
          else {
            glyph = view.getUint16(ranges + 2 * s + rangeOffset + 2 * (cp - start));
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) found.set(cp, glyph);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12);
      for (let k = 0; k < groups; k++) {
        const group = offset + 16 + k * 12;
        const start = view.getUint32(group);
        const end = view.getUint32(group + 4);
        const first = view.getUint32(group + 8);
        for (let cp = start; cp <= end; cp++) found.set(cp, first + cp - start);
      }
    }
  }
  return new Map([...found].sort((a, b) => a[0] - b[0]));
}

function readSimpleGlyph(view: DataView, at: number): Contour[] {
  const contourCount = view.getInt16(at);
  if (contourCount < 0) throw new Error('Composite glyphs are not read: KaTeX’s fonts have none.');
  const endPoints: number[] = [];
  for (let i = 0; i < contourCount; i++) endPoints.push(view.getUint16(at + 10 + 2 * i));
  const pointCount = contourCount === 0 ? 0 : (endPoints[contourCount - 1] ?? -1) + 1;
  let p = at + 10 + 2 * contourCount;
  p += 2 + view.getUint16(p); // instructions
  const flags: number[] = [];
  while (flags.length < pointCount) {
    const flag = view.getUint8(p++);
    flags.push(flag);
    if (flag & 8) {
      const repeat = view.getUint8(p++);
      for (let r = 0; r < repeat; r++) flags.push(flag);
    }
  }
  const readAxis = (short: number, same: number): number[] => {
    const values: number[] = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) {
        const delta = view.getUint8(p++);
        value += flag & same ? delta : -delta;
      } else if (!(flag & same)) {
        value += view.getInt16(p);
        p += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = readAxis(2, 16);
  const ys = readAxis(4, 32);
  const contours: Contour[] = [];
  let first = 0;
  for (const last of endPoints) {
    const contour: Contour = [];
    for (let i = first; i <= last; i++) {
      contour.push({ x: xs[i] ?? 0, y: ys[i] ?? 0, onCurve: ((flags[i] ?? 0) & 1) === 1 });
    }
    contours.push(contour);
    first = last + 1;
  }
  return contours;
}

/**
 * A glyph's outline as SVG path data in ems, y down from the baseline, pen at 0: absolute moves, then
 * relative lines and quadratic curves (`t` where a curve continues smoothly), numbers to a thousandth
 * of an em without leading zeros.
 */
export function outlinePath(contours: readonly Contour[], unitsPerEm: number): string {
  const scale = (v: number) => Math.round((v / unitsPerEm) * 1000);
  let out = '';
  // Positions in thousandths of an em, so that relative steps add up exactly.
  let penX = 0;
  let penY = 0;
  // The last curve's control point, absolute, for `t`.
  let lastControl: { x: number; y: number } | undefined;
  const pair = (command: string, x: number, y: number) => {
    const first = number(x - penX, command);
    return first + number(y - penY, command + first);
  };
  const curve = (control: { x: number; y: number }, x: number, y: number) => {
    if (
      lastControl &&
      control.x === 2 * penX - lastControl.x &&
      control.y === 2 * penY - lastControl.y
    ) {
      out += `t${pair('t', x, y)}`;
    } else {
      const first = pair('q', control.x, control.y);
      out += `q${first}${pair(`q${first}`, x, y)}`;
    }
    lastControl = control;
    [penX, penY] = [x, y];
  };
  const line = (x: number, y: number) => {
    lastControl = undefined;
    if (x === penX && y === penY) return; // a repeated point draws nothing
    if (y === penY) out += `h${number(x - penX, 'h')}`;
    else if (x === penX) out += `v${number(y - penY, 'v')}`;
    else out += `l${pair('l', x, y)}`;
    [penX, penY] = [x, y];
  };
  for (const contour of contours) {
    if (contour.length === 0) continue;
    const points = contour.map((point) => ({
      x: scale(point.x),
      y: -scale(point.y),
      onCurve: point.onCurve,
    }));
    // Start on a point on the curve, or between two control points.
    const startIndex = points.findIndex((point) => point.onCurve);
    let start: { x: number; y: number };
    let ordered: typeof points;
    if (startIndex >= 0) {
      ordered = [...points.slice(startIndex + 1), ...points.slice(0, startIndex + 1)];
      start = points[startIndex] ?? { x: 0, y: 0 };
    } else {
      const a = points[0] ?? { x: 0, y: 0 };
      const b = points[points.length - 1] ?? a;
      start = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
      ordered = [...points, { ...start, onCurve: true }];
    }
    const moveX = number(start.x, 'M');
    out += `M${moveX}${number(start.y, `M${moveX}`)}`;
    [penX, penY] = [start.x, start.y];
    lastControl = undefined;
    let control: { x: number; y: number } | undefined;
    for (const point of ordered) {
      if (point.onCurve) {
        if (control) curve(control, point.x, point.y);
        else line(point.x, point.y);
        control = undefined;
      } else if (control) {
        // Two control points in a row imply a point on the curve halfway between them.
        curve(
          control,
          Math.round((control.x + point.x) / 2),
          Math.round((control.y + point.y) / 2),
        );
        control = point;
      } else control = point;
    }
    if (control) curve(control, start.x, start.y);
    out += 'Z';
  }
  return out;
}

/** A number of thousandths as ems: `.5`, `-.012`, `1.25`, after a space only where one is needed. */
function number(thousandths: number, before: string): string {
  let text = (thousandths / 1000).toFixed(3).replace(/\.?0+$/, '');
  if (text === '' || text === '-' || text === '-0') text = '0';
  text = text.replace(/^(-?)0\.(?=\d)/, '$1.');
  const previous = before[before.length - 1] ?? '';
  return /[0-9.]/.test(previous) && !text.startsWith('-') ? ` ${text}` : text;
}
