import { typesetMath } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import {
  PATH_UNITS,
  fitOf,
  fittedPath,
  keptMathContexts,
  mathPathContext,
  readPath,
  sharedMathContext,
} from './mathPaths';

const pathsOf = (tex: string) => {
  const typeset = typesetMath(tex, { display: false });
  if (!typeset.ok) throw new Error(typeset.error);
  return typeset.drawing.paths;
};

/** Every point a command list reaches, its control points too. */
const points = (commands: ReturnType<typeof readPath>) =>
  commands.flatMap((command) => {
    switch (command.kind) {
      case 'close':
        return [];
      case 'move':
      case 'line':
        return [{ x: command.x, y: command.y }];
      case 'cubic':
        return [
          { x: command.x1, y: command.y1 },
          { x: command.x2, y: command.y2 },
          { x: command.x, y: command.y },
        ];
      case 'quadratic':
        return [
          { x: command.x1, y: command.y1 },
          { x: command.x, y: command.y },
        ];
    }
  });

describe('a math drawing’s paths on the canvas (ADR 0106)', () => {
  it('reads SVG path data into absolute commands, shorthands made whole', () => {
    expect(readPath('M10 20h5v-5l1,1H0V0c1 1 2 2 3 3s4 4 5 5q1 1 2 2t3 3z')).toEqual([
      { kind: 'move', x: 10, y: 20 },
      { kind: 'line', x: 15, y: 20 },
      { kind: 'line', x: 15, y: 15 },
      { kind: 'line', x: 16, y: 16 },
      { kind: 'line', x: 0, y: 16 },
      { kind: 'line', x: 0, y: 0 },
      { kind: 'cubic', x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 },
      { kind: 'cubic', x1: 4, y1: 4, x2: 7, y2: 7, x: 8, y: 8 },
      { kind: 'quadratic', x1: 9, y1: 9, x: 10, y: 10 },
      { kind: 'quadratic', x1: 11, y1: 11, x: 13, y: 13 },
      { kind: 'close' },
    ]);
  });

  it('reads numbers run together as KaTeX writes them, and pairs after a move as lines', () => {
    expect(readPath('m1.5-2.5.5.5-1-1')).toEqual([
      { kind: 'move', x: 1.5, y: -2.5 },
      { kind: 'line', x: 2, y: -2 },
      { kind: 'line', x: 1, y: -3 },
    ]);
    // What it cannot read ends the path there.
    expect(readPath('M1 2 L3')).toEqual([{ kind: 'move', x: 1, y: 2 }]);
  });

  it('fits a view box as preserveAspectRatio says', () => {
    const box = { width: 2, height: 1, viewBox: { x: 0, y: 0, width: 400, height: 100 } };
    expect(fitOf({ ...box, preserveAspectRatio: 'none' })).toMatchObject({
      scaleX: 2 / 400,
      scaleY: 1 / 100,
    });
    const slice = fitOf({ ...box, preserveAspectRatio: 'xMinYMin slice' });
    expect(slice.scaleX).toBeCloseTo(1 / 100);
    expect(slice.shiftX).toBeCloseTo(0);
    expect(slice.slice).toBe(true);
    const end = fitOf({ ...box, preserveAspectRatio: 'xMaxYMin slice' });
    expect(end.shiftX).toBeCloseTo(2 - 4);
    const meet = fitOf({ ...box, preserveAspectRatio: 'xMidYMid meet' });
    expect(meet.scaleX).toBeCloseTo(2 / 400);
    expect(meet.shiftY).toBeCloseTo((1 - 100 * (2 / 400)) / 2);
  });

  it('holds a surd’s long bar inside its box, as the browser clips it', () => {
    const [surd] = pathsOf('\\sqrt{x}');
    expect(surd?.preserveAspectRatio).toContain('slice');
    for (const point of points(fittedPath(surd!))) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(surd!.width + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(surd!.height + 1e-9);
    }
    // And inside the cut of a formula cut, from the piece's own left.
    for (const point of points(fittedPath(surd!, 0.5))) expect(point.x).toBeLessThanOrEqual(0.5);
  });

  it('leaves a piece fitted without slice as it is', () => {
    const [cancel] = pathsOf('\\cancel{x}');
    expect(cancel?.preserveAspectRatio).toBe('none');
    const xs = points(fittedPath(cancel!)).map((point) => point.x);
    expect(Math.min(...xs)).toBeLessThan(0);
  });

  it('builds one context for each distinct piece, size and cut, shared by every shape', () => {
    const [surd] = pathsOf('\\sqrt{x}');
    const before = keptMathContexts();
    const context = mathPathContext(surd!);
    expect(mathPathContext({ ...surd! })).toBe(context);
    expect(sharedMathContext(context)).toBe(true);
    expect(mathPathContext(surd!, surd!.x + 0.3)).not.toBe(context);
    expect(mathPathContext({ ...surd!, height: surd!.height * 2 })).not.toBe(context);
    expect(keptMathContexts()).toBe(before + 3);
    // Drawn in its units an em, white.
    const bounds = context.bounds;
    expect(bounds.maxX).toBeLessThanOrEqual(surd!.width * PATH_UNITS + 1e-6);
    expect(context.instructions.at(-1)?.action).toBe('fill');
  });
});
