import { Color, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { HANDLE_SIZE, drawShapeEditOverlay } from './shapeEditMarks';
import { handlesFor } from './resize';
import { painterOf } from './theme/painter';

/** What a drawing paints: each fill's and each stroke's color and width. */
function paints(graphics: Graphics): { action: string; color: number; width?: number }[] {
  return graphics.context.instructions.map((instruction) => {
    const style = (instruction.data as { style: { color: number; width?: number } }).style;
    return {
      action: instruction.action,
      color: style.color,
      ...(style.width === undefined ? {} : { width: style.width }),
    };
  });
}

const hex = (color: string) => new Color(color).toNumber();
const RECT = { x: 100, y: 100, width: 160, height: 80 };

describe('the marks of resizing and of the guides', () => {
  for (const name of ['light', 'dark'] as const) {
    const theme = THEMES[name].canvas;
    it(`are drawn in the ${name} theme’s selection color and handle fill`, () => {
      const graphics = new Graphics();
      drawShapeEditOverlay(
        graphics,
        {
          handles: { rect: RECT, names: handlesFor('both') },
          ghost: { ...RECT, width: 200 },
          guides: [{ axis: 'x', at: 300, from: 100, to: 180 }],
        },
        2,
        painterOf(theme),
      );
      const drawn = paints(graphics);
      expect(drawn.map((each) => each.action)).toEqual([
        'fill',
        'stroke',
        'stroke',
        'fill',
        'stroke',
      ]);
      // The ghost, the guides and the handles' rings in the selection color; the handles filled.
      for (const at of [1, 2, 4]) expect(drawn[at]?.color).toBe(hex(theme.selected));
      expect(drawn[0]?.color).toBe(hex(theme.selected));
      expect(drawn[3]?.color).toBe(hex(theme.handleFill));
      // At a scale of 2, a guide one pixel wide is half a unit.
      expect(drawn[2]?.width).toBe(0.5);
    });
  }

  it('keep the handles the same size on screen at any zoom', () => {
    const at = (scale: number) => {
      const graphics = new Graphics();
      drawShapeEditOverlay(
        graphics,
        { handles: { rect: RECT, names: ['nw'] } },
        scale,
        painterOf(THEMES.light.canvas),
      );
      return graphics.bounds.width;
    };
    // A stroke of 1.5 pixels rings each handle.
    expect(at(1)).toBeCloseTo(HANDLE_SIZE + 1.5, 5);
    expect(at(4)).toBeCloseTo((HANDLE_SIZE + 1.5) / 4, 5);
  });

  it('draw nothing without an overlay', () => {
    const graphics = new Graphics();
    drawShapeEditOverlay(graphics, undefined, 1, painterOf(THEMES.light.canvas));
    expect(graphics.context.instructions).toHaveLength(0);
  });
});
