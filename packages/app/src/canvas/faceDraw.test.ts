/**
 * Drawing faces on the canvas (ADR 0083, F2): a face drawing's boxes, bands and runs in one drawing,
 * in its tokens' colors on the shape's fill in each theme; written by the painter in place of the
 * shape's name and detail when its tile shows faces, and drawn again when the theme changes.
 */
import { facePalette, type FaceDrawing } from '@visual-anything/core';
import { BitmapFont, Cache, Container, Graphics, Texture } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { COLUMN_FACE, TABLE_FACE, withFaces } from '../test/faces';
import { VIEW, usersAndOrders } from '../test/tables';
import type { TextFactory } from './draw';
import { FaceLabel, drawFaceDrawing, faceLabel } from './faceDraw';
import { buildScene, type ElementShape } from './scene';
import { Painter, type LabelPaint } from './theme/painter';

const KEYS = ['text', 'text-bold', 'text-italic', 'text-bold-italic', 'text-mono'].map(
  (each) => `visual-anything-${each}-bitmap`,
);

/** A font drawn at 16 whose every glyph is a white square, so that each draws a quad. */
function fakeFont(): BitmapFont {
  const chars: Record<string, unknown> = {};
  for (let code = 32; code < 127; code++) {
    chars[String.fromCharCode(code)] = {
      id: code,
      xOffset: 0,
      yOffset: 0,
      xAdvance: 8,
      kerning: {},
      texture: code === 32 ? undefined : Texture.WHITE,
    };
  }
  return {
    chars,
    fontMetrics: { fontSize: 16, ascent: 12, descent: 4 },
    ensureCharacters: () => undefined,
  } as unknown as BitmapFont;
}

beforeAll(() => {
  for (const key of KEYS) Cache.set(key, fakeFont());
});
afterAll(() => {
  for (const key of KEYS) Cache.remove(key);
});

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

function tables(): ElementShape[] {
  const project = withFaces(usersAndOrders(), {
    'data-modeling.table': TABLE_FACE,
    'data-modeling.column': COLUMN_FACE,
  });
  return buildScene(project, VIEW).shapes;
}

/** What a drawing does, in order. */
function actions(graphics: Graphics): string[] {
  return graphics.context.instructions.map((each) => each.action);
}

describe('drawing a face (ADR 0083)', () => {
  const drawing: FaceDrawing = {
    width: 100,
    height: 40,
    cut: false,
    boxes: [
      {
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        radius: 0,
        background: 'fill',
        borders: { bottom: { width: 1, style: 'solid', color: 'stroke' } },
      },
    ],
    runs: [
      {
        text: 'ab',
        x: 4,
        y: 20,
        width: 12,
        size: 11,
        variant: 'regular',
        color: 'text',
        line: 0,
        paragraph: 0,
      },
    ],
    bands: [{ kind: 'back', x: 4, y: 10, width: 12, height: 14, color: '#FFEB99' }],
    images: [],
    regions: [],
  };

  it('draws boxes, then bands, then a quad for each glyph, in its palette’s colors', () => {
    const graphics = new Graphics();
    const palette = facePalette('light', '#FFFFFF', '#5B6675');
    drawFaceDrawing(graphics, drawing, { x: 10, y: 20 }, palette);
    expect(actions(graphics)).toEqual(['fill', 'fill', 'fill', 'texture', 'texture']);
    const [box, , band, glyph] = graphics.context.instructions;
    expect((box?.data as { style: { color: number } }).style.color).toBe(0xffffff);
    expect((band?.data as { style: { color: number } }).style.color).toBe(0xffeb99);
    // Placed at the shape's rectangle, in the text color that reads on the fill.
    expect((glyph?.data as { dx: number }).dx).toBeCloseTo(14);
    expect((glyph?.data as { style: number }).style).toBe(0x1f2933);
  });

  it('is drawn again in another theme’s colors', () => {
    const label = new FaceLabel(drawing, { x: 0, y: 0 });
    label.paint('light', '#FFFFFF', '#5B6675');
    const light = (label.graphics.context.instructions[0]?.data as { style: { color: number } })
      .style.color;
    label.paint('dark', '#1C2027', '#8F9AA6');
    const dark = (label.graphics.context.instructions[0]?.data as { style: { color: number } })
      .style.color;
    expect(light).toBe(0xffffff);
    expect(dark).toBe(0x1c2027);
    expect(label.graphics.context.instructions).toHaveLength(5);
  });

  it('makes a label of a shape with a face, and none of one without', () => {
    const shapes = tables();
    const users = shapes.find((shape) => shape.key === 'users') as ElementShape;
    expect(faceLabel(users, 'light')).toBeInstanceOf(FaceLabel);
    expect(faceLabel({ ...users, face: undefined }, 'light')).toBeUndefined();
  });
});

describe('the painter and faces (ADR 0083)', () => {
  const painter = new Painter(THEMES.light.canvas);

  it('writes a face in place of a shape’s name and detail when its tile shows faces', () => {
    const shapes = tables();
    const records: LabelPaint[] = [];
    const written = painter.shapeLabels(shapes, true, counting, records, undefined, {});
    const faces = written.filter((each) => each instanceof FaceLabel);
    // Two tables and their six columns, each its face.
    expect(faces).toHaveLength(8);
    expect(written.some((each) => each.label === 'users')).toBe(false);
    expect(records.filter((each) => each.role === 'face')).toHaveLength(8);
  });

  it('writes names and details as before where its tile’s level shows no face', () => {
    const shapes = tables();
    const written = painter.shapeLabels(shapes, true, counting, [], undefined, undefined);
    expect(written.some((each) => each instanceof FaceLabel)).toBe(false);
    expect(written.some((each) => each.label === 'users')).toBe(true);
  });

  it('draws a level’s variant of the face', () => {
    const users = tables().filter((shape) => shape.key === 'users');
    const [own] = painter.shapeLabels(users, true, counting, [], undefined, {});
    const [far] = painter.shapeLabels(users, true, counting, [], undefined, { variant: 'far' });
    expect((own as FaceLabel).drawing).not.toBe((far as FaceLabel).drawing);
    expect((far as FaceLabel).drawing.runs.map((run) => run.text).join('')).toBe('users');
  });

  it('draws a face again for the theme a switch shows', () => {
    const shapes = tables();
    const records: LabelPaint[] = [];
    painter.shapeLabels(shapes, true, counting, records, undefined, {});
    const record = records.find((each) => each.role === 'face') as LabelPaint & { role: 'face' };
    const before = record.label.graphics.context.instructions.length;
    const shape = shapes.find((each) => each.key === record.shape) as ElementShape;
    new Painter(THEMES.dark.canvas).retint(records, {
      shape: (key) => (key === shape.key ? shape : undefined),
      note: () => undefined,
    });
    expect(record.label.graphics.context.instructions).toHaveLength(before);
  });
});
