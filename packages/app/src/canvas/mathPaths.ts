/**
 * The SVG pieces of a math drawing on the canvas (ADR 0106): surds, stretchy delimiters, braces, wide
 * accents, arrows and cancel strokes, each KaTeX's own path data fitted into its box as SVG's
 * `viewBox` and `preserveAspectRatio` say. Each distinct piece, at its size in ems and as far as it is
 * cut, is one `GraphicsContext`, built once and shared by every shape that draws it, so that a
 * thousand surds cost one tessellation; a piece is drawn by a `Graphics` placed and scaled to its
 * formula's size, white and tinted.
 *
 * KaTeX draws a stretchy piece with `slice`: its path is far wider than its box (a surd's bar is
 * 400,000 units long) and the browser clips it to the box. The canvas has no clip here that keeps
 * batching, so every point is held inside the box instead. That is exact for the straight bars that
 * reach past it, which is all KaTeX's pieces put there; a cut formula holds its pieces to the cut
 * the same way.
 */
import { GraphicsContext } from 'pixi.js';
import type { MathPath } from '@visual-anything/core';

/** Units a context is built in, for an em of its formula: fine enough for curves at any zoom. */
export const PATH_UNITS = 64;

/** One drawing command, its points absolute, in the path's own units. */
export type PathCommand =
  | { kind: 'move' | 'line'; x: number; y: number }
  | { kind: 'cubic'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { kind: 'quadratic'; x1: number; y1: number; x: number; y: number }
  | { kind: 'close' };

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
/** How many numbers each command takes. */
const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/**
 * Reads SVG path data into absolute commands: moves, lines, cubic and quadratic curves and closes,
 * the shorthand curves made whole. An arc, which KaTeX's pieces do not use, is a line to its end.
 * Whatever it cannot read ends the path there.
 */
export function readPath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  const tokens = [...d.matchAll(TOKEN)];
  let at = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  /** The last control point, for `S` and `T`. */
  let cubic: { x: number; y: number } | undefined;
  let quadratic: { x: number; y: number } | undefined;
  let command = '';
  while (at < tokens.length) {
    const token = tokens[at]!;
    if (token[1] !== undefined) {
      command = token[1];
      at += 1;
    } else if (command === '') return out;
    const lower = command.toLowerCase();
    const relative = command === lower;
    const arity = ARITY[lower] ?? 0;
    if (arity === 0) {
      out.push({ kind: 'close' });
      x = startX;
      y = startY;
      cubic = undefined;
      quadratic = undefined;
      // A close takes no numbers: the next token is a command.
      if (at < tokens.length && tokens[at]![1] === undefined) return out;
      continue;
    }
    const numbers: number[] = [];
    for (let each = 0; each < arity; each++) {
      const next = tokens[at + each];
      if (next === undefined || next[2] === undefined) return out;
      numbers.push(Number(next[2]));
    }
    at += arity;
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    const n = numbers as [number, number, number, number, number, number, number];
    switch (lower) {
      case 'm':
        x = ox + n[0];
        y = oy + n[1];
        startX = x;
        startY = y;
        out.push({ kind: 'move', x, y });
        // Pairs after a move are lines.
        command = relative ? 'l' : 'L';
        cubic = quadratic = undefined;
        break;
      case 'l':
      case 'h':
      case 'v':
      case 't':
      case 'a': {
        if (lower === 'h') x = ox + n[0];
        else if (lower === 'v') y = oy + n[0];
        else if (lower === 'a') {
          x = ox + n[5];
          y = oy + n[6];
        } else {
          const nx = ox + n[0];
          const ny = oy + n[1];
          if (lower === 't') {
            const control = quadratic
              ? { x: 2 * x - quadratic.x, y: 2 * y - quadratic.y }
              : { x, y };
            out.push({ kind: 'quadratic', x1: control.x, y1: control.y, x: nx, y: ny });
            quadratic = control;
            cubic = undefined;
            x = nx;
            y = ny;
            break;
          }
          x = nx;
          y = ny;
        }
        out.push({ kind: 'line', x, y });
        cubic = quadratic = undefined;
        break;
      }
      case 'c': {
        const command: PathCommand = {
          kind: 'cubic',
          x1: ox + n[0],
          y1: oy + n[1],
          x2: ox + n[2],
          y2: oy + n[3],
          x: ox + n[4],
          y: oy + n[5],
        };
        out.push(command);
        cubic = { x: command.x2, y: command.y2 };
        quadratic = undefined;
        x = command.x;
        y = command.y;
        break;
      }
      case 's': {
        const first = cubic ? { x: 2 * x - cubic.x, y: 2 * y - cubic.y } : { x, y };
        const command: PathCommand = {
          kind: 'cubic',
          x1: first.x,
          y1: first.y,
          x2: ox + n[0],
          y2: oy + n[1],
          x: ox + n[2],
          y: oy + n[3],
        };
        out.push(command);
        cubic = { x: command.x2, y: command.y2 };
        quadratic = undefined;
        x = command.x;
        y = command.y;
        break;
      }
      case 'q': {
        const command: PathCommand = {
          kind: 'quadratic',
          x1: ox + n[0],
          y1: oy + n[1],
          x: ox + n[2],
          y: oy + n[3],
        };
        out.push(command);
        quadratic = { x: command.x1, y: command.y1 };
        cubic = undefined;
        x = command.x;
        y = command.y;
        break;
      }
    }
  }
  return out;
}

/** How a path's view box maps into its box: a scale on each axis and a shift, in the box's ems. */
export interface Fit {
  scaleX: number;
  scaleY: number;
  shiftX: number;
  shiftY: number;
  /** Whether it is fitted with `slice`, and so reaches past its box. */
  slice: boolean;
}

/** Fits a path's view box into its box as `preserveAspectRatio` says, as SVG does. */
export function fitOf(
  path: Pick<MathPath, 'width' | 'height' | 'viewBox' | 'preserveAspectRatio'>,
): Fit {
  const { viewBox, width, height } = path;
  const vw = viewBox.width || 1;
  const vh = viewBox.height || 1;
  const [align = 'xMidYMid', mode = 'meet'] = path.preserveAspectRatio.trim().split(/\s+/);
  if (align === 'none') {
    return {
      scaleX: width / vw,
      scaleY: height / vh,
      shiftX: -viewBox.x * (width / vw),
      shiftY: -viewBox.y * (height / vh),
      slice: false,
    };
  }
  const slice = mode === 'slice';
  const scale = slice ? Math.max(width / vw, height / vh) : Math.min(width / vw, height / vh);
  const share = (part: string) => (part === 'Min' ? 0 : part === 'Max' ? 1 : 0.5);
  const xShare = share(align.slice(1, 4));
  const yShare = share(align.slice(5, 8));
  return {
    scaleX: scale,
    scaleY: scale,
    shiftX: (width - vw * scale) * xShare - viewBox.x * scale,
    shiftY: (height - vh * scale) * yShare - viewBox.y * scale,
    slice,
  };
}

/**
 * A piece's commands in its box's ems, from the box's top left: fitted, and held inside the box when
 * it is fitted with `slice`, and inside `clip` (a width from the box's left) when its formula was
 * cut there.
 */
export function fittedPath(
  path: Pick<MathPath, 'd' | 'width' | 'height' | 'viewBox' | 'preserveAspectRatio'>,
  clip?: number,
): PathCommand[] {
  const fit = fitOf(path);
  const right = Math.min(fit.slice ? path.width : Infinity, clip ?? Infinity);
  const left = fit.slice ? 0 : -Infinity;
  const top = fit.slice ? 0 : -Infinity;
  const bottom = fit.slice ? path.height : Infinity;
  const px = (value: number) => Math.min(right, Math.max(left, value * fit.scaleX + fit.shiftX));
  const py = (value: number) => Math.min(bottom, Math.max(top, value * fit.scaleY + fit.shiftY));
  return readPath(path.d).map((command): PathCommand => {
    switch (command.kind) {
      case 'close':
        return command;
      case 'move':
      case 'line':
        return { kind: command.kind, x: px(command.x), y: py(command.y) };
      case 'cubic':
        return {
          kind: 'cubic',
          x1: px(command.x1),
          y1: py(command.y1),
          x2: px(command.x2),
          y2: py(command.y2),
          x: px(command.x),
          y: py(command.y),
        };
      case 'quadratic':
        return {
          kind: 'quadratic',
          x1: px(command.x1),
          y1: py(command.y1),
          x: px(command.x),
          y: py(command.y),
        };
    }
  });
}

/** Contexts kept by piece, size and cut; a context is never destroyed while kept. */
const contexts = new Map<string, GraphicsContext>();
const keptContexts = new WeakSet<GraphicsContext>();
/** The most kept: past it, a piece's context is the drawing's own, not shared. */
const KEPT_CONTEXTS = 4_000;

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * The shared context that draws a piece, in `PATH_UNITS` an em, white, from its box's top left; cut at
 * `clip` ems from its formula's left, if it was. A `Graphics` draws it scaled by size / `PATH_UNITS`.
 */
export function mathPathContext(path: MathPath, clipFromFormula?: number): GraphicsContext {
  const clip = clipFromFormula === undefined ? undefined : round(clipFromFormula - path.x);
  const { viewBox } = path;
  const key = [
    path.preserveAspectRatio,
    viewBox.x,
    viewBox.y,
    viewBox.width,
    viewBox.height,
    round(path.width),
    round(path.height),
    clip ?? '',
    path.d,
  ].join(' ');
  const kept = contexts.get(key);
  if (kept && !kept.destroyed) return kept;
  const context = new GraphicsContext();
  let open = false;
  for (const command of fittedPath(path, clip)) {
    const u = PATH_UNITS;
    switch (command.kind) {
      case 'move':
        context.moveTo(command.x * u, command.y * u);
        open = true;
        break;
      case 'line':
        if (!open) context.moveTo(command.x * u, command.y * u);
        else context.lineTo(command.x * u, command.y * u);
        open = true;
        break;
      case 'cubic':
        context.bezierCurveTo(
          command.x1 * u,
          command.y1 * u,
          command.x2 * u,
          command.y2 * u,
          command.x * u,
          command.y * u,
        );
        break;
      case 'quadratic':
        context.quadraticCurveTo(command.x1 * u, command.y1 * u, command.x * u, command.y * u);
        break;
      case 'close':
        context.closePath();
        open = false;
        break;
    }
  }
  context.fill(0xffffff);
  if (contexts.size < KEPT_CONTEXTS) {
    contexts.set(key, context);
    keptContexts.add(context);
  }
  return context;
}

/** Whether a context is kept and shared, so that what draws it must not destroy it. */
export function sharedMathContext(context: GraphicsContext): boolean {
  return keptContexts.has(context);
}

/** How many contexts are kept, for tests and the benchmark. */
export function keptMathContexts(): number {
  return contexts.size;
}
