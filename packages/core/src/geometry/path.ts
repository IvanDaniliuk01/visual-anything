/**
 * A strict reader of SVG's path grammar (ADR 0066): path data in, absolute moves, lines and cubic
 * Bézier segments out. Quadratics are raised to cubics, an arc becomes at most four cubics, one for
 * each quarter turn, and every subpath is one contour, closed or open as it was written. It reads in
 * one pass, stops at the first thing outside the grammar, and counts the commands it reads, implicit
 * repeats included, so that a caller can stop at a cap before the work grows.
 */
import type { Point } from '@visual-anything/schema';

/** One piece of a contour, from the point the previous piece ended at. */
export type Segment =
  { kind: 'line'; to: Point } | { kind: 'cubic'; c1: Point; c2: Point; to: Point };

/** A subpath as it was read: where it starts, its pieces, and whether it was closed with `Z`. */
export interface Subpath {
  start: Point;
  segments: Segment[];
  closed: boolean;
}

/** What reading path data gives, or the first thing in it outside the grammar. */
export type PathRead =
  { ok: true; subpaths: Subpath[]; commands: number } | { ok: false; reason: string };

const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;
const ARGUMENTS: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/**
 * Reads path data. `maxCommands` stops the reading once more commands than that are read, so that
 * path data past a cap costs no more than the cap. With `upToError`, a path that leaves the grammar
 * reads as what comes before its first error, as SVG draws it, and a command that would end past every
 * finite number is dropped there; the cap still refuses it.
 */
export function readPathData(
  d: string,
  maxCommands = Number.POSITIVE_INFINITY,
  options: { upToError?: boolean } = {},
): PathRead {
  const scanner = new Scanner(d);
  const subpaths: Subpath[] = [];
  let commands = 0;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let open: Subpath | undefined;
  // The control point a smooth curve reflects: the last cubic's or quadratic's second control point.
  let lastCubic: Point | undefined;
  let lastQuadratic: Point | undefined;
  let command: string | undefined;

  const begin = (at: Point) => {
    open = { start: at, segments: [], closed: false };
    subpaths.push(open);
  };
  const pieceFrom = (): Subpath => {
    // A command after `Z` that is not a move starts a new subpath where the closed one started.
    if (!open || open.closed) begin(current);
    return open as Subpath;
  };

  const fail = (reason: string): PathRead =>
    options.upToError ? { ok: true, subpaths, commands } : { ok: false, reason };

  scanner.skipSpace();
  if (scanner.done()) return fail('The path data is empty.');
  while (!scanner.done()) {
    const letter = scanner.peekCommand();
    if (letter !== undefined) {
      scanner.advance();
      command = letter;
    } else if (command === undefined) {
      return fail('Path data must start with a move, M or m.');
    } else if (command === 'Z' || command === 'z') {
      return fail(`${scanner.where()}: a close, Z, takes no numbers.`);
    }
    if (commands === 0 && command !== 'M' && command !== 'm') {
      return fail('Path data must start with a move, M or m.');
    }
    commands += 1;
    if (commands > maxCommands) return { ok: false, reason: 'too many commands' };
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const count = ARGUMENTS[upper] ?? 0;
    const numbers: number[] = [];
    for (let at = 0; at < count; at += 1) {
      scanner.skipSeparator(at > 0);
      const isFlag = upper === 'A' && (at === 3 || at === 4);
      const value = isFlag ? scanner.flag() : scanner.number();
      if (value === undefined) {
        commands -= 1;
        return fail(
          `${scanner.where()}: the command ${command} needs ${count} numbers${isFlag ? ', its flags each 0 or 1' : ''}.`,
        );
      }
      numbers.push(value);
    }
    // What this command adds, so that one ending past every finite number can be taken back.
    const mark = { subpaths: subpaths.length, open, segments: open?.segments.length ?? 0 };
    const x = (at: number) => (numbers[at] as number) + (relative ? current.x : 0);
    const y = (at: number) => (numbers[at] as number) + (relative ? current.y : 0);
    let nextCubic: Point | undefined;
    let nextQuadratic: Point | undefined;
    switch (upper) {
      case 'M': {
        current = { x: x(0), y: y(1) };
        start = current;
        begin(current);
        // Pairs after a move's first are lines, relative when the move was.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        current = { x: x(0), y: y(1) };
        pieceFrom().segments.push({ kind: 'line', to: current });
        break;
      case 'H':
        current = { x: x(0), y: current.y };
        pieceFrom().segments.push({ kind: 'line', to: current });
        break;
      case 'V':
        current = { x: current.x, y: (numbers[0] as number) + (relative ? current.y : 0) };
        pieceFrom().segments.push({ kind: 'line', to: current });
        break;
      case 'C': {
        const c1 = { x: x(0), y: y(1) };
        const c2 = { x: x(2), y: y(3) };
        const to = { x: x(4), y: y(5) };
        pieceFrom().segments.push({ kind: 'cubic', c1, c2, to });
        current = to;
        nextCubic = c2;
        break;
      }
      case 'S': {
        const c1 = lastCubic ? reflect(lastCubic, current) : current;
        const c2 = { x: x(0), y: y(1) };
        const to = { x: x(2), y: y(3) };
        pieceFrom().segments.push({ kind: 'cubic', c1, c2, to });
        current = to;
        nextCubic = c2;
        break;
      }
      case 'Q': {
        const q = { x: x(0), y: y(1) };
        const to = { x: x(2), y: y(3) };
        pieceFrom().segments.push(raised(current, q, to));
        current = to;
        nextQuadratic = q;
        break;
      }
      case 'T': {
        const q = lastQuadratic ? reflect(lastQuadratic, current) : current;
        const to = { x: x(0), y: y(1) };
        pieceFrom().segments.push(raised(current, q, to));
        current = to;
        nextQuadratic = q;
        break;
      }
      case 'A': {
        const to = { x: x(5), y: y(6) };
        const subpath = pieceFrom();
        for (const segment of arcSegments(
          current,
          numbers[0] as number,
          numbers[1] as number,
          numbers[2] as number,
          numbers[3] === 1,
          numbers[4] === 1,
          to,
        )) {
          subpath.segments.push(segment);
        }
        current = to;
        break;
      }
      case 'Z': {
        if (open && !open.closed) open.closed = true;
        current = start;
        break;
      }
    }
    lastCubic = nextCubic;
    lastQuadratic = nextQuadratic;
    if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) {
      subpaths.length = mark.subpaths;
      if (mark.open) mark.open.segments.length = mark.segments;
      commands -= 1;
      return fail(`${scanner.where()}: a number is not finite.`);
    }
    scanner.skipSpace();
    // A comma may part the numbers of a command repeated, never a command from what follows it.
    if (!scanner.done() && scanner.peekCommand() === undefined && scanner.skipComma()) {
      if (scanner.done() || scanner.peekCommand() !== undefined) {
        return fail(`${scanner.where()}: a comma is followed by no number.`);
      }
    }
  }
  return { ok: true, subpaths, commands };
}

/** The point a smooth curve's first control point is: the last control point mirrored through the current point. */
function reflect(control: Point, through: Point): Point {
  return { x: 2 * through.x - control.x, y: 2 * through.y - control.y };
}

/** A quadratic Bézier from `from` through `q` to `to`, raised to the cubic that draws the same curve. */
function raised(from: Point, q: Point, to: Point): Segment {
  return {
    kind: 'cubic',
    c1: { x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) },
    c2: { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
    to,
  };
}

/**
 * An elliptical arc as cubics, at most one for each quarter turn, as SVG's implementation notes
 * convert the endpoint form to the centre form: radii scaled up when too small, a line when one is
 * zero, and nothing when the arc starts where it ends.
 */
export function arcSegments(
  from: Point,
  rxIn: number,
  ryIn: number,
  rotation: number,
  large: boolean,
  sweep: boolean,
  to: Point,
): Segment[] {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ kind: 'line', to }];
  const phi = ((rotation % 360) * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (large === sweep) factor = -factor;
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return turn;
  };
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const pieces = Math.max(1, Math.min(4, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9)));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number) => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const tangent = (t: number) => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });
  const segments: Segment[] = [];
  let t0 = theta;
  let p0 = from;
  for (let piece = 0; piece < pieces; piece += 1) {
    const t1 = t0 + step;
    const p1 = piece === pieces - 1 ? to : at(t1);
    const d0 = tangent(t0);
    const d1 = tangent(t1);
    segments.push({
      kind: 'cubic',
      c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y },
      to: p1,
    });
    t0 = t1;
    p0 = p1;
  }
  return segments;
}

/**
 * Reads a polygon's points as SVG writes them: x,y pairs apart by spaces or commas. With `upToError`,
 * points that leave the grammar read as the pairs before the first error, as SVG draws them; the cap
 * still refuses them.
 */
export function readPolygonPoints(
  text: string,
  maxPoints = Number.POSITIVE_INFINITY,
  upToError = false,
): { ok: true; points: Point[] } | { ok: false; reason: string } {
  const scanner = new Scanner(text);
  const points: Point[] = [];
  scanner.skipSpace();
  while (!scanner.done()) {
    if (points.length > 0) scanner.skipSeparator(true);
    const x = scanner.number();
    scanner.skipSeparator(true);
    const y = scanner.number();
    if (x === undefined || y === undefined) {
      if (upToError) return { ok: true, points };
      return {
        ok: false,
        reason: `${scanner.where()}: a polygon's points are x,y pairs of numbers.`,
      };
    }
    points.push({ x, y });
    if (points.length > maxPoints) return { ok: false, reason: 'too many points' };
    scanner.skipSpace();
  }
  return { ok: true, points };
}

/** Walks text once, by the number grammar SVG shares with CSS: no exponent without digits, no hex, no units. */
class Scanner {
  #at = 0;
  constructor(private readonly text: string) {}

  done(): boolean {
    return this.#at >= this.text.length;
  }

  where(): string {
    return `At character ${this.#at + 1}`;
  }

  advance(): void {
    this.#at += 1;
  }

  peekCommand(): string | undefined {
    const char = this.text[this.#at];
    return char !== undefined && COMMAND.test(char) ? char : undefined;
  }

  skipSpace(): void {
    while (!this.done() && isSpace(this.text.charCodeAt(this.#at))) this.#at += 1;
  }

  /** Skips a comma and the spaces after it, and says whether there was one. */
  skipComma(): boolean {
    if (this.text[this.#at] !== ',') return false;
    this.#at += 1;
    this.skipSpace();
    return true;
  }

  /** Spaces, and one comma among them when `comma` allows it. */
  skipSeparator(comma: boolean): void {
    this.skipSpace();
    if (comma && this.text[this.#at] === ',') {
      this.#at += 1;
      this.skipSpace();
    }
  }

  /** An arc's flag: one character, 0 or 1, which needs no separator after it. */
  flag(): number | undefined {
    const char = this.text[this.#at];
    if (char !== '0' && char !== '1') return undefined;
    this.#at += 1;
    return char === '1' ? 1 : 0;
  }

  number(): number | undefined {
    const text = this.text;
    const begin = this.#at;
    let at = begin;
    if (text[at] === '+' || text[at] === '-') at += 1;
    let digits = 0;
    while (isDigit(text.charCodeAt(at))) {
      at += 1;
      digits += 1;
    }
    if (text[at] === '.') {
      at += 1;
      while (isDigit(text.charCodeAt(at))) {
        at += 1;
        digits += 1;
      }
    }
    if (digits === 0) return undefined;
    if (text[at] === 'e' || text[at] === 'E') {
      let exponent = at + 1;
      if (text[exponent] === '+' || text[exponent] === '-') exponent += 1;
      let exponentDigits = 0;
      while (isDigit(text.charCodeAt(exponent))) {
        exponent += 1;
        exponentDigits += 1;
      }
      if (exponentDigits > 0) at = exponent;
    }
    const value = Number(text.slice(begin, at));
    if (!Number.isFinite(value)) return undefined;
    this.#at = at;
    return value;
  }
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}
