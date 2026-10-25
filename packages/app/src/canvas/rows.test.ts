import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHEET, toggleRect } from './geometry';
import {
  MAX_LANE,
  ROWS_FOOT,
  ROWS_HEADER,
  ROWS_MIN_WIDTH,
  ROW_HEIGHT,
  collapsedRowsHeight,
  headerMiddle,
  laneX,
  measureRows,
  rowMiddle,
  rowRect,
  rowsShapeKind,
  rowsWidth,
} from './rows';

describe('measureRows', () => {
  it('stacks the rows under the header, with room at the foot', () => {
    expect(measureRows(240, 3)).toEqual({
      width: 240,
      height: ROWS_HEADER + 3 * ROW_HEIGHT + ROWS_FOOT,
    });
  });

  it('keeps one empty row in an empty shape, so that it can take a drop', () => {
    expect(measureRows(240, 0).height).toBe(measureRows(240, 1).height);
  });

  it('is never narrower than the narrowest such shape', () => {
    expect(measureRows(40, 2).width).toBe(ROWS_MIN_WIDTH);
  });

  it('grows by one row height for each row', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), (rows) => {
        expect(measureRows(240, rows + 1).height - measureRows(240, rows).height).toBe(ROW_HEIGHT);
      }),
    );
  });
});

describe('rowRect', () => {
  const rect = { x: 100, y: 50, width: 240, height: 200 };

  it('places each row under the one before it, as wide as the shape', () => {
    expect(rowRect(rect, 0)).toEqual({ x: 100, y: 50 + ROWS_HEADER, width: 240, height: 24 });
    expect(rowRect(rect, 2)).toEqual({
      x: 100,
      y: 50 + ROWS_HEADER + 2 * ROW_HEIGHT,
      width: 240,
      height: ROW_HEIGHT,
    });
  });

  it('gives rows that touch and never overlap', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (index) => {
        const one = rowRect(rect, index);
        const next = rowRect(rect, index + 1);
        expect(one.y + one.height).toBe(next.y);
      }),
    );
  });

  it('says where relations attach beside a row and beside the header', () => {
    expect(rowMiddle(rect, 1)).toBe(50 + ROWS_HEADER + ROW_HEIGHT + ROW_HEIGHT / 2);
    expect(headerMiddle(rect)).toBe(50 + ROWS_HEADER / 2);
  });
});

describe('the size and kind of a shape that draws rows', () => {
  it('takes the stored width, else its appearance’s, never below the narrowest', () => {
    expect(rowsWidth(300, 240)).toBe(300);
    expect(rowsWidth(undefined, 240)).toBe(240);
    expect(rowsWidth(20, 240)).toBe(ROWS_MIN_WIDTH);
  });

  it('keeps only its header when collapsed, on the sheet behind it, with room for its toggle', () => {
    const height = collapsedRowsHeight();
    expect(height).toBe(ROWS_HEADER + ROWS_FOOT + SHEET);
    const collapsed = { rect: { x: 0, y: 0, width: ROWS_MIN_WIDTH, height }, holdsContents: false };
    expect(toggleRect({ ...collapsed, collapsed: true })).toBeDefined();
  });

  it('draws rows only in a rectangle or a rounded rectangle', () => {
    expect(rowsShapeKind('rounded-rectangle')).toBe('rounded-rectangle');
    for (const kind of ['rectangle', 'ellipse', 'cylinder', 'person'] as const) {
      expect(rowsShapeKind(kind)).toBe('rectangle');
    }
  });
});

describe('laneX', () => {
  it('runs each lane further out, on the side it leaves from', () => {
    const container = { x: 100, y: 0, width: 200, height: 100 };
    expect(laneX(container, 'right', 0)).toBeGreaterThan(300);
    expect(laneX(container, 'right', 1)).toBeGreaterThan(laneX(container, 'right', 0));
    expect(laneX(container, 'left', 0)).toBeLessThan(100);
    expect(laneX(container, 'left', 1)).toBeLessThan(laneX(container, 'left', 0));
  });

  it('shares the last lane from the seventh row on, inside the stand-in gap', () => {
    const container = { x: 0, y: 0, width: 200, height: 100 };
    expect(laneX(container, 'right', MAX_LANE + 4)).toBe(laneX(container, 'right', MAX_LANE));
    expect(laneX(container, 'right', MAX_LANE) - 200).toBeLessThan(40);
  });
});
