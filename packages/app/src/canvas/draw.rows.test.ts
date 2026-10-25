import { Graphics, type CanvasTextOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { VIEW, usersAndOrders } from '../test/tables';
import { drawShapeBlocks, drawShapeOutlines, writeShapeLabels, type TextFactory } from './draw';
import { ROWS_FROM } from './rows';
import { ROWS_BODY, ROW_SEPARATOR, levelWithRows, rowsBlocks } from './rowsDraw';
import { buildScene, type ElementShape } from './scene';

const scene = buildScene(usersAndOrders(), VIEW);
const shape = (key: string) => scene.shapes.find((each) => each.key === key) as ElementShape;
const users = shape('users');
const id = shape('users/users-id');
const email = shape('users/users-email');

/** The colors a drawing fills, in order, and the rectangles it fills them in. */
function fills(draw: (graphics: Graphics) => void): { color: number; kind: string }[] {
  const graphics = new Graphics();
  draw(graphics);
  return graphics.context.instructions.map((instruction) => ({
    kind: instruction.action,
    color: (instruction.data as { style: { color: number } }).style.color,
  }));
}

const hex = (color: string) => Number.parseInt(color.slice(1), 16);

describe('drawing a table and its rows', () => {
  it('draws the table’s body, its header in its fill, the rule under it and its border', () => {
    const drawn = fills((graphics) => drawShapeOutlines(graphics, [users]));
    expect(drawn[0]).toEqual({ kind: 'fill', color: hex(ROWS_BODY) });
    expect(drawn[1]).toEqual({ kind: 'fill', color: hex(users.fill) });
    expect(drawn[2]).toEqual({ kind: 'fill', color: hex(users.stroke) });
    expect(drawn[3]).toEqual({ kind: 'stroke', color: hex(users.stroke) });
  });

  it('draws each row as a band in its own fill, with a separator above it after the first', () => {
    expect(fills((graphics) => drawShapeOutlines(graphics, [id]))).toEqual([
      { kind: 'fill', color: hex(id.fill) },
    ]);
    expect(fills((graphics) => drawShapeOutlines(graphics, [email]))).toEqual([
      { kind: 'fill', color: hex(email.fill) },
      { kind: 'fill', color: hex(ROW_SEPARATOR) },
    ]);
    // A row draws no border of its own.
    expect(fills((graphics) => drawShapeOutlines(graphics, [email])).some((each) => each.kind === 'stroke')).toBe(
      false,
    );
  });

  it('draws a table as its body and its header far out, and its rows as nothing', () => {
    const blocks = rowsBlocks(users, 6);
    expect(blocks?.outline?.color).toBe(users.stroke);
    expect(blocks?.fills.map((block) => block.color)).toEqual([users.fill, ROWS_BODY]);
    const [header, body] = blocks?.fills ?? [];
    // The two never overlap, so they can be drawn in any order.
    expect((header?.rect.y ?? 0) + (header?.rect.height ?? 0)).toBe(body?.rect.y);
    expect(rowsBlocks(id, 6)?.fills).toEqual([]);
    const drawn = new Graphics();
    drawShapeBlocks(drawn, [id, email]);
    expect(drawn.context.instructions).toHaveLength(0);
  });
});

describe('writing a table and its rows', () => {
  const written: { text: string; kind: string; options: CanvasTextOptions }[] = [];
  const make: TextFactory = (options, kind) => {
    written.push({ text: String(options.text), kind, options });
    return undefined;
  };

  it('writes the header’s name, and the rows only with details', () => {
    written.length = 0;
    writeShapeLabels([users, id, email], false, make);
    expect(written.map((each) => each.text)).toEqual(['users']);
    written.length = 0;
    writeShapeLabels([users, id, email], true, make);
    expect(written.map((each) => each.text)).toEqual(['users', 'id', 'uuid · PK', 'email', 'text']);
  });

  it('writes a row’s name on the left and its detail on the right, small and on one line', () => {
    written.length = 0;
    writeShapeLabels([id], true, make);
    const [name, detail] = written;
    expect(name?.kind).toBe('detail');
    expect(name?.options.x).toBe(id.rect.x + 10);
    expect(name?.options.anchor).toEqual({ x: 0, y: 0.5 });
    expect(detail?.options.x).toBe(id.rect.x + id.rect.width - 10);
    expect(detail?.options.anchor).toEqual({ x: 1, y: 0.5 });
    expect(name?.options.style).toMatchObject({ fontSize: 12, wordWrap: false });
    expect(detail?.options.style).toMatchObject({ fontSize: 11, wordWrap: false });
  });

  it('writes the header’s name centered on its band', () => {
    written.length = 0;
    writeShapeLabels([users], false, make);
    const [name] = written;
    expect(name?.kind).toBe('name');
    expect(name?.options.y).toBe(users.rect.y + 16);
    expect(name?.options.x).toBe(users.rect.x + 12);
  });
});

describe('levelWithRows', () => {
  it('writes rows with their details from ROWS_FROM on, and nothing of them below it', () => {
    expect(levelWithRows([id], 1, ROWS_FROM)).toBe(2);
    expect(levelWithRows([id], 2, ROWS_FROM - 0.1)).toBe(1);
    expect(levelWithRows([id], 0, 1)).toBe(0);
    expect(levelWithRows([users], 1, ROWS_FROM)).toBe(1);
  });
});
