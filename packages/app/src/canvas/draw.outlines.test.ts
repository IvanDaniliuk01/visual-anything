/**
 * The tiles' drawings of shapes with their own outlines (M8b, ADR 0066, ADR 0067, ADR 0055's
 * clarification): plain blocks and silhouettes as the simplified outline, never the box; full
 * drawings as the outline with its holes cut, a collapsed container's sheet offset, in both themes;
 * names in the label area or not at all; icons in the label area; and marks along the outline.
 */
import { simplifyOutline } from '@visual-anything/core';
import { Container, Graphics, type GraphicsPath, type TextStyleOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { FRAME, TRIANGLE, beyondBoxes } from '../test/beyond';
import { APEX_DOWN, OVAL, outlinedShape } from '../test/outlined';
import { readableTextColors } from './colors';
import {
  drawShapeBlocks,
  drawShapeOutlines,
  fillOf,
  labelRooms,
  traceMark,
  writeShapeLabels,
  type TextFactory,
} from './draw';
import { SHEET, type Rect } from './geometry';
import { TAG_PADDING, nameTagOn } from './nameTags';
import { PART_NAME_LINE, labelAreaOn } from './outlined';
import { geometrySource, outlineIn, type ShapeOutline } from './outlines';
import { buildScene, type ElementShape } from './scene';
import { painterOf } from './theme/painter';
import { placeImage } from './shape-images';
import { BASE_DRAWING } from './drawing';
import { DETAIL_LINE_HEIGHT } from './textBlock';
import { readGeometry } from '@visual-anything/core';

const scene = buildScene(beyondBoxes('anatomy'), 'anatomy');
const shapeOf = (key: string) => scene.shapes.find((shape) => shape.key === key) as ElementShape;
/**
 * A shape as these tests draw it, without its name tag: its name left out, so that what is drawn is
 * its outline alone. The frame's and the ring's names do not fit inside them, so they hang tags,
 * which have tests of their own (`nameTags.test.ts`).
 */
const untagged = (shape: ElementShape): ElementShape => ({ ...shape, name: '' });
const framed = untagged(shapeOf('framed'));

type Instruction = Graphics['context']['instructions'][number];

/** Each fill and stroke a drawing makes: its color, its width, the points of each shape in its path, and whether it cuts a hole. */
function drawn(graphics: Graphics) {
  return graphics.context.instructions.map((each: Instruction) => {
    const data = each.data as {
      style: { color: number; width?: number; pixelLine?: boolean; alignment?: number };
      path: GraphicsPath;
      hole?: GraphicsPath;
    };
    return {
      action: each.action,
      color: `#${data.style.color.toString(16).padStart(6, '0').toUpperCase()}`,
      width: data.style.width,
      pixelLine: data.style.pixelLine === true,
      alignment: data.style.alignment,
      hole: data.hole !== undefined,
      shapes: data.path.shapePath.shapePrimitives.map(
        ({ shape }) => shape as unknown as Record<string, unknown>,
      ),
    };
  });
}

/** Whether a shape of a path is a rectangle, as boxes are drawn. */
const isRect = (shape: Record<string, unknown>) => shape.type === 'rectangle';

function pointsOf(shape: Record<string, unknown>): number[] {
  return (shape.points as number[] | undefined) ?? [];
}

function within(points: number[], rect: Rect, slack = 0.01): boolean {
  for (let at = 0; at < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    if (x < rect.x - slack || y < rect.y - slack) return false;
    if (x > rect.x + rect.width + slack || y > rect.y + rect.height + slack) return false;
  }
  return true;
}

describe('plain blocks and silhouettes', () => {
  it('draw a shape with free geometry as its simplified outline, filled without its holes, never as its box', () => {
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [framed]);
    const all = drawn(graphics);
    expect(all.flatMap((each) => each.shapes).some(isRect)).toBe(false);
    const fills = all.filter((each) => each.action === 'fill');
    expect(fills).toHaveLength(1);
    expect(fills[0]?.hole).toBe(false);
    // Its outer contour only: the hole is left out.
    expect(fills[0]?.shapes).toHaveLength(1);
    const points = pointsOf(fills[0]?.shapes[0] ?? {});
    expect(points.length / 2).toBeLessThanOrEqual(32);
    expect(within(points, framed.rect)).toBe(true);
    expect(points.slice(0, 2)).toEqual([framed.rect.x, framed.rect.y]);
  });

  it('keep a block’s outline as a rim inside the polygon, and the hairline a device pixel wide', () => {
    // A pale fill, which would not stand out from the light canvas, is outlined.
    const pale = {
      ...outlinedShape('pale', TRIANGLE, { x: 0, y: 0, width: 300, height: 80 }),
      fill: '#FAFAFA',
    };
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [pale]);
    const all = drawn(graphics);
    const rim = all.find((each) => each.action === 'stroke' && !each.pixelLine);
    // Four of the drawing's borders wide.
    expect(rim).toMatchObject({
      color: pale.stroke,
      width: 4 * BASE_DRAWING.shapes.borderWidth,
      alignment: 1,
    });
    const hairline = all.find((each) => each.pixelLine);
    expect(hairline?.color).toBe(pale.stroke);
    // Kept to the triangle, centred in the wide rectangle as its proportions are kept.
    expect(within(pointsOf(rim?.shapes[0] ?? {}), { x: 100, y: 0, width: 100, height: 80 })).toBe(
      true,
    );
  });

  it('draw shapes in order, each whole, beyond the bands', () => {
    const a = outlinedShape('a', TRIANGLE, { x: 0, y: 0, width: 100, height: 80 });
    const b = outlinedShape(
      'b',
      OVAL,
      { x: 50, y: 0, width: 100, height: 80 },
      { fill: '#123456' },
    );
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [a, b], true);
    const fills = drawn(graphics).filter((each) => each.action === 'fill');
    expect(fills.map((each) => each.color)).toEqual([a.fill, '#123456']);
  });

  it('draw an anchored part in its part’s main color', () => {
    const left = shapeOf('body/left');
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [left]);
    const fills = drawn(graphics).filter((each) => each.action === 'fill');
    expect(fills.map((each) => each.color)).toEqual(['#C0392B']);
    expect(fillOf(left)).toBe('#C0392B');
  });
});

describe('full drawings', () => {
  it('draw free geometry with its holes cut, its contours stroked and outlined a pixel wide', () => {
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [framed]);
    const all = drawn(graphics);
    expect(all.flatMap((each) => each.shapes).some(isRect)).toBe(false);
    const fills = all.filter((each) => each.action === 'fill');
    expect(fills).toHaveLength(1);
    expect(fills[0]?.hole).toBe(true);
    expect(all.filter((each) => each.action === 'stroke' && !each.pixelLine)).toHaveLength(2);
    const hairlines = all.filter((each) => each.pixelLine);
    expect(hairlines).toHaveLength(1);
    // Both contours, the outer one and the hole's.
    expect(hairlines[0]?.shapes).toHaveLength(2);
  });

  it('draw a collapsed container’s sheet as its outline offset behind it', () => {
    const rect = { x: 100, y: 100, width: 205, height: 105 };
    const read = readGeometry(FRAME);
    if (!read.ok) throw new Error('FRAME');
    const collapsed = outlinedShape('folded', FRAME, rect, {
      collapsed: { contents: 3 },
      // Fitted to its body, as the scene fits it: its rectangle without the sheet.
      outline: outlineIn(geometrySource(read.outline), 200, 100),
    });
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [collapsed]);
    const fills = drawn(graphics).filter((each) => each.action === 'fill' && each.hole);
    expect(fills).toHaveLength(2);
    expect(pointsOf(fills[0]?.shapes[0] ?? {}).slice(0, 2)).toEqual([100 + SHEET, 100 + SHEET]);
    expect(pointsOf(fills[1]?.shapes[0] ?? {}).slice(0, 2)).toEqual([100, 100]);
  });

  it('draw nothing of an anchored part’s own, which its drawing’s picture shows, and a part on its own in its main color', () => {
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shapeOf('body/left')]);
    expect(graphics.context.instructions).toHaveLength(0);
    drawShapeOutlines(graphics, [untagged(shapeOf('loose'))]);
    const fills = drawn(graphics).filter((each) => each.action === 'fill');
    expect(fills.map((each) => each.color)).toEqual(['#27AE60']);
    // The ring's hole is cut.
    expect(fills[0]?.hole).toBe(true);
  });

  it('draw in the dark theme’s shades of built-in colors', () => {
    expect(framed.dark).toBeDefined();
    const graphics = new Graphics();
    painterOf(THEMES.dark.canvas).shapeOutlines(graphics, [framed]);
    const fills = drawn(graphics).filter((each) => each.action === 'fill');
    expect(fills.map((each) => each.color)).toEqual([framed.dark?.fill]);
    const blocks = new Graphics();
    painterOf(THEMES.dark.canvas).shapeBlocks(blocks, [framed]);
    expect(drawn(blocks).find((each) => each.action === 'fill')?.color).toBe(framed.dark?.fill);
  });
});

describe('names in the label area', () => {
  const placed: TextFactory = (options, kind, room) => {
    const label = new Container();
    label.label = `${kind}:${String(options.text)}`;
    label.position.set(options.x ?? 0, options.y ?? 0);
    (label as Container & { room?: number; style?: TextStyleOptions }).room = room;
    (label as Container & { style?: TextStyleOptions }).style = options.style as TextStyleOptions;
    return label;
  };

  it('writes the name and the detail centred in the label area, in colors that read on the fill', () => {
    const shape = outlinedShape(
      'Heart',
      OVAL,
      { x: 0, y: 0, width: 300, height: 200 },
      { detail: 'Organ' },
    );
    const area = labelAreaOn(shape as ElementShape & { outline: ShapeOutline });
    expect(area.height).toBeGreaterThanOrEqual(40);
    const [name, detail] = writeShapeLabels([shape], true, placed);
    expect(name?.label).toBe('name:Heart');
    expect(detail?.label).toBe('detail:Organ');
    expect(name?.x).toBeCloseTo(area.x + area.width / 2);
    // The name's line and the detail's, centred together in the area as one block (ADR 0082).
    expect(name?.y).toBeCloseTo(
      area.y + (area.height - PART_NAME_LINE - 2 - DETAIL_LINE_HEIGHT) / 2,
    );
    expect(detail?.y).toBeCloseTo((name?.y ?? 0) + PART_NAME_LINE + 2);
    expect((name as Container & { style: TextStyleOptions }).style.fill).toBe(
      readableTextColors(shape.fill).name,
    );
    expect(labelRooms(shape)).toEqual({ name: area.height / 2, detail: area.height / 2 - 6 });
  });

  it('writes the name alone in the middle of a label area less than two lines tall', () => {
    const shape = outlinedShape(
      'Bean',
      OVAL,
      { x: 0, y: 0, width: 120, height: 36 },
      { detail: 'Organ' },
    );
    const area = labelAreaOn(shape as ElementShape & { outline: ShapeOutline });
    expect(area.height).toBeGreaterThanOrEqual(14);
    expect(area.height).toBeLessThan(40);
    const written = writeShapeLabels([shape], true, placed);
    expect(written.map((label) => label.label)).toEqual(['name:Bean']);
    expect((written[0]?.y ?? 0) + PART_NAME_LINE / 2).toBeCloseTo(area.y + area.height / 2);
    // The whole area, and a line at least, so that a name of the canvas's size fits.
    expect(labelRooms(shape)).toEqual({ name: Math.max(area.height, 20), detail: 0 });
    const flat = outlinedShape('Flat', OVAL, { x: 0, y: 0, width: 120, height: 24 });
    const low = labelAreaOn(flat as ElementShape & { outline: ShapeOutline });
    expect(low.height).toBeGreaterThanOrEqual(14);
    expect(low.height).toBeLessThan(20);
    expect(labelRooms(flat).name).toBe(20);
  });

  it('writes the name of a shape whose label area is less than 14 units tall in its name tag, under it', () => {
    const shape = outlinedShape('Tiny', TRIANGLE, { x: 0, y: 0, width: 30, height: 24 });
    const written = writeShapeLabels([shape], true, placed);
    expect(written.map((label) => label.label)).toEqual(['name:Tiny', 'detail:Organ']);
    const tag = nameTagOn(shape) as Rect;
    expect(written[0]?.x).toBeCloseTo(tag.x + tag.width / 2);
    expect(written[0]?.y).toBeCloseTo(tag.y + TAG_PADDING);
    expect(written[1]?.y).toBeCloseTo(tag.y + TAG_PADDING + PART_NAME_LINE + 1);
    // In colours that read on the tag's fill, which is the shape's, not on the canvas.
    expect((written[0] as Container & { style: TextStyleOptions }).style.fill).toBe(
      readableTextColors(shape.fill).name,
    );
    expect(labelRooms(shape)).toEqual({ name: 0, detail: 0 });
  });

  it('writes a name too long for the label area whole under the shape, never cut inside it', () => {
    const shape = outlinedShape(
      'Pulmonary artery',
      OVAL,
      { x: 0, y: 0, width: 90, height: 60 },
      { detail: 'Vessel' },
    );
    const written = writeShapeLabels([shape], true, placed).map((label) => label.label);
    expect(written).toEqual(['name:Pulmonary artery', 'detail:Vessel']);
  });

  it('writes a collapsed container’s count first, so that cutting the detail never cuts it', () => {
    const shape = outlinedShape(
      'Heart',
      OVAL,
      { x: 0, y: 0, width: 305, height: 205 },
      {
        detail: 'Organ',
        collapsed: { contents: 4 },
      },
    );
    const written = writeShapeLabels([shape], true, placed).map((label) => label.label);
    expect(written).toEqual(['name:Heart', 'detail:4 inside · Organ']);
  });

  it('writes an expanded container’s name in its header, along the stretch its outline holds', () => {
    const shape = outlinedShape(
      'Funnel',
      APEX_DOWN,
      { x: 0, y: 0, width: 300, height: 200 },
      {
        holdsContents: true,
      },
    );
    const [name] = writeShapeLabels([shape], false, placed);
    expect(name?.label).toBe('name:Funnel');
    expect(name?.y).toBe(8);
    expect(name?.x).toBeGreaterThan(6);
  });

  it('writes a part’s name in colors that read on its main color', () => {
    const loose = shapeOf('loose');
    const written = writeShapeLabels([loose], false, placed) as (Container & {
      style: TextStyleOptions;
    })[];
    for (const label of written) expect(label.style.fill).toBe(readableTextColors('#27AE60').name);
  });
});

describe('icons', () => {
  it('shows a shape’s image as an icon in its label area, whatever its placement asks', () => {
    const shape = outlinedShape('Heart', OVAL, { x: 0, y: 0, width: 300, height: 200 });
    const outline = shape.outline as ShapeOutline;
    const image = {
      id: 'i',
      image: { width: 40, height: 40 } as never,
      serial: 1,
      placement: 'drawing' as const,
    };
    const placedImage = placeImage(image, {
      kind: 'rectangle',
      rect: shape.rect,
      holdsContents: false,
      rows: false,
      outline,
    });
    const area = labelAreaOn({ rect: shape.rect, outline });
    expect(placedImage?.plate).toBeUndefined();
    expect(placedImage?.image.placement).toBe('icon');
    const box = placedImage?.image.box as Rect;
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it('shows none in a label area too small for it', () => {
    const shape = outlinedShape('Tiny', TRIANGLE, { x: 0, y: 0, width: 12, height: 10 });
    const image = {
      id: 'i',
      image: { width: 40, height: 40 } as never,
      serial: 1,
      placement: 'icon' as const,
    };
    expect(
      placeImage(image, {
        kind: 'rectangle',
        rect: shape.rect,
        holdsContents: false,
        rows: false,
        ...(shape.outline ? { outline: shape.outline } : {}),
      }),
    ).toBeUndefined();
    expect(shape.outline).toBeDefined();
  });
});

describe('traceMark', () => {
  it('traces a mark along a shape’s own outline, and a box around any other', () => {
    const graphics = new Graphics();
    traceMark(graphics, framed, 3);
    graphics.stroke({ color: 0xffffff, width: 1 });
    const [stroke] = drawn(graphics);
    expect(stroke?.shapes).toHaveLength(2);
    expect(stroke?.shapes.some(isRect)).toBe(false);
    const box = new Graphics();
    traceMark(box, { x: 0, y: 0, width: 10, height: 10 }, 3);
    box.stroke({ color: 0xffffff, width: 1 });
    expect(drawn(box)[0]?.shapes[0]).toMatchObject({ x: -3, y: -3, width: 16, height: 16 });
  });

  it('places the mark where the shape is, outside it by the gap', () => {
    const graphics = new Graphics();
    traceMark(graphics, framed, 2);
    graphics.stroke({ color: 0xffffff, width: 1 });
    const outer = pointsOf(drawn(graphics)[0]?.shapes[0] ?? {});
    expect(
      within(outer, { x: framed.rect.x - 2, y: framed.rect.y - 2, width: 204, height: 104 }),
    ).toBe(true);
    expect(simplifyOutline((framed.outline as ShapeOutline).fitted)).toHaveLength(1);
  });
});
