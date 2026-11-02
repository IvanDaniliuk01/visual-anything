import { Graphics, type CanvasTextOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { VIEW, usersAndOrders } from '../test/tables';
import { drawShapeBlocks, drawShapeOutlines, writeShapeLabels, type TextFactory } from './draw';
import { estimateWidth, monoWidth } from './fit';
import { ROBOTO_MONO } from './robotoFonts';
import { ROWS_FROM } from './rows';
import { LIGHT_ROWS, levelWithRows, rowsBlocks } from './rowsDraw';
import { buildScene, type ElementShape } from './scene';
import { shapeFollowsTheme } from './theme/paint';
import { Painter } from './theme/painter';
import { THEMES } from '../theme/themes';

const ROWS_BODY = LIGHT_ROWS.body;
const ROW_SEPARATOR = LIGHT_ROWS.separator;

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
    expect(
      fills((graphics) => drawShapeOutlines(graphics, [email])).some(
        (each) => each.kind === 'stroke',
      ),
    ).toBe(false);
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
    // Each row's column type, then its badges, in columns of their own (A5.1).
    expect(written.map((each) => each.text)).toEqual([
      'users',
      'id',
      'uuid',
      'PK',
      'email',
      'text',
    ]);
  });

  it('writes a row’s name on the left, its type and its badges in columns, small and on one line', () => {
    written.length = 0;
    writeShapeLabels([id], true, make);
    const [name, type, badges] = written;
    const columns = id.columns;
    expect(columns).toBeDefined();
    expect(name?.kind).toBe('detail');
    expect(name?.options.x).toBe(id.rect.x + 10);
    expect(name?.options.anchor).toEqual({ x: 0, y: 0.5 });
    expect(type?.options.x).toBe(id.rect.x + (columns?.typeX ?? 0));
    expect(type?.options.anchor).toEqual({ x: 0, y: 0.5 });
    // The badges' column ends at the row's right inset.
    expect(badges?.options.x).toBe(id.rect.x + (columns?.badgesX ?? 0));
    expect(name?.options.style).toMatchObject({ fontSize: 12, wordWrap: false });
    expect(type?.options.style).toMatchObject({ fontSize: 11, wordWrap: false });
    expect((type?.options.style as { fontFamily: string[] }).fontFamily[0]).toBe(ROBOTO_MONO);
    expect(badges?.options.style).toMatchObject({ fontSize: 11, wordWrap: false });
  });

  it('starts every row’s type at one x, its badges after, whatever the type’s length', () => {
    const rows = [id, email];
    expect(new Set(rows.map((row) => row.columns?.typeX)).size).toBe(1);
    expect(new Set(rows.map((row) => row.columns?.badgesX)).size).toBe(1);
    const typeX = id.columns?.typeX ?? 0;
    const badgesX = id.columns?.badgesX ?? 0;
    // The type column holds the longest type, "uuid", in Roboto Mono at 11; the badges after it.
    expect(badgesX - typeX).toBeGreaterThanOrEqual(monoWidth('uuid', 11));
    expect(badgesX + estimateWidth('PK', 11)).toBeCloseTo(id.rect.width - 10);
    expect(email.columns).toMatchObject({ name: 'email', type: 'text', badges: '' });
    expect(id.columns).toMatchObject({ name: 'id', type: 'uuid', badges: 'PK' });
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

describe('a table in the dark theme', () => {
  const dark = THEMES.dark.canvas;
  const painter = new Painter(dark);
  const drawn = (draw: (graphics: Graphics) => void) => fills(draw).map((each) => each.color);

  it('draws its body in the theme’s, and its header and border in the table’s dark shades', () => {
    const colors = drawn((graphics) => painter.shapeOutlines(graphics, [users]));
    expect(users.dark).toBeDefined();
    expect(colors.slice(0, 4)).toEqual([
      hex(dark.rowsBody),
      hex(users.dark?.fill ?? ''),
      hex(users.dark?.stroke ?? ''),
      hex(users.dark?.stroke ?? ''),
    ]);
  });

  it('draws each row in its column’s dark shade, with the theme’s separators', () => {
    expect(drawn((graphics) => painter.shapeOutlines(graphics, [email]))).toEqual([
      hex(email.dark?.fill ?? ''),
      hex(dark.rowSeparator),
    ]);
  });

  it('draws its body far out in the theme’s too', () => {
    const graphics = new Graphics();
    painter.shapeBlocks(graphics, [users]);
    const colors = graphics.context.instructions.map(
      (instruction) => (instruction.data as { style: { color: number } }).style.color,
    );
    expect(colors).toContain(hex(dark.rowsBody));
  });

  it('follows the theme, rows of stored colors included, so that a switch restyles them', () => {
    const stored = { ...email, dark: undefined };
    expect(shapeFollowsTheme(stored)).toBe(true);
    expect(shapeFollowsTheme(users)).toBe(true);
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
