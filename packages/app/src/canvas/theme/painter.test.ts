import { Color, Container, Graphics, Sprite, Texture, type GraphicsContext } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../theme/themes';
import { readableTextColors } from '../colors';
import type { TextFactory } from '../draw';
import { arrowheadAt } from '../geometry';
import { RelationLabel } from '../labels';
import type { ElementShape, NoteShape, RelationLine } from '../scene';
import { routePieces } from '../tiles';
import { CASING_EXTRA, Painter, buildGeometry, painterOf, type LabelPaint } from './painter';

const rect = { x: 0, y: 0, width: 160, height: 60 };
const system: ElementShape = {
  key: 'scheduling',
  element: 'scheduling',
  offset: { x: 0, y: 0 },
  positioned: 'stored',
  name: 'Scheduling',
  componentName: 'System',
  kind: 'rectangle',
  fill: '#F3F5F8',
  stroke: '#5B6675',
  dark: { fill: '#1C2027', stroke: '#8F9AA6' },
  rect,
  extent: rect,
  holdsContents: false,
};
const route = [
  { x: 0, y: 100 },
  { x: 300, y: 100 },
];
const line: RelationLine = {
  relation: 'r',
  label: 'HTTPS',
  route,
  from: route[0] as { x: number; y: number },
  to: route[1] as { x: number; y: number },
  middle: { x: 150, y: 100 },
  arrowhead: arrowheadAt({ x: 0, y: 100 }, { x: 300, y: 100 }, 2),
  stroke: '#3D4651',
  darkStroke: '#AEB8C4',
  width: 2,
  dash: 'dashed',
};
const note: NoteShape = { id: 'n', rect, text: 'Remember' };

const counting: TextFactory = (options) => {
  const label = new Container();
  label.label = String(options.text);
  return label;
};

/** What a drawing fills and strokes, in order: the action, its color and its width. */
function strokesOf(context: GraphicsContext): { action: string; color: string; width?: number }[] {
  return context.instructions.map((instruction) => {
    const style = (instruction.data as { style: { color: number; width?: number } }).style;
    return {
      action: instruction.action,
      color: `#${style.color.toString(16).padStart(6, '0').toUpperCase()}`,
      ...(instruction.action === 'stroke' ? { width: style.width } : {}),
    };
  });
}

const light = painterOf(THEMES.light.canvas);
const dark = painterOf(THEMES.dark.canvas);

describe('Painter', () => {
  it('is one for each of the app’s themes', () => {
    expect(painterOf(THEMES.dark.canvas)).toBe(dark);
    expect(painterOf({ ...THEMES.dark.canvas })).not.toBe(dark);
  });

  it('draws shapes and lines in the theme’s shades', () => {
    const graphics = new Graphics();
    dark.shapeOutlines(graphics, [system]);
    // The body's outline is drawn again a pixel wide, in the same shade, after the rest.
    expect(strokesOf(graphics.context).map((each) => each.color)).toEqual([
      '#1C2027',
      '#8F9AA6',
      '#8F9AA6',
    ]);
    const lines = new Graphics();
    dark.routePieces(lines, routePieces(line), [line]);
    expect(new Set(strokesOf(lines.context).map((each) => each.color))).toEqual(
      new Set(['#AEB8C4']),
    );
    const plain = new Graphics();
    light.pieceLines(plain, routePieces(line));
    expect(strokesOf(plain.context).map((each) => each.color)).toEqual(['#3D4651']);
  });

  it('draws casings solid, wider and in white, the same in every theme', () => {
    const casings = (painter: Painter) => {
      const graphics = new Graphics();
      painter.casings(graphics, routePieces(line), [line]);
      return strokesOf(graphics.context);
    };
    const drawn = casings(dark);
    expect(drawn).toEqual(casings(light));
    expect(new Set(drawn.map((each) => each.color))).toEqual(new Set(['#FFFFFF']));
    expect(drawn[0]).toMatchObject({ action: 'stroke', width: line.width + CASING_EXTRA });
  });

  it('draws notes and arrows in their own colors or the theme’s, with arrow casings under the arrows', () => {
    const graphics = new Graphics();
    const arrow = {
      id: 'a',
      from: { x: 0, y: 200 },
      to: { x: 200, y: 200 },
      arrowhead: arrowheadAt({ x: 0, y: 200 }, { x: 200, y: 200 }, 2),
    };
    dark.freeShapes(graphics, [note, { ...note, id: 'own', fill: '#DCEBFF' }], [arrow]);
    const colors = strokesOf(graphics.context).map((each) => each.color);
    const theme = THEMES.dark.canvas;
    expect(colors.slice(0, 4)).toEqual([
      theme.noteFill,
      theme.noteStroke,
      '#DCEBFF',
      theme.noteStroke,
    ]);
    // The casing in the canvas color, then the arrow in the theme's.
    expect(colors.slice(4)).toEqual([
      theme.background,
      theme.background,
      theme.background,
      theme.freeArrow,
      theme.freeArrow,
    ]);
  });

  it('records each label with what its tint follows, and tints them again for another theme', () => {
    const records: LabelPaint[] = [];
    const names = dark.shapeLabels([system], true, counting, records);
    const relations = dark.relationLabels([line], counting, records);
    const notes = dark.noteTexts([note], records);
    expect(names.map((label) => label.label)).toEqual(['Scheduling', 'System']);
    expect(records.map((record) => record.role)).toEqual(['name', 'detail', 'relation', 'note']);
    expect(notes[0]?.tint).toBe(new Color(THEMES.dark.canvas.noteText).toNumber());

    light.retint(records, { shape: () => system, note: () => note });
    const onFill = readableTextColors(system.fill);
    expect(names[0]?.tint).toBe(new Color(onFill.name).toNumber());
    expect(names[1]?.tint).toBe(new Color(onFill.detail).toNumber());
    expect(relations[0]?.tint).toBe(new Color(THEMES.light.canvas.relationLabelText).toNumber());
    expect(notes[0]?.tint).toBe(new Color(THEMES.light.canvas.noteText).toNumber());
  });

  it('tints a relation’s name and its back apart', () => {
    const back = new Sprite(Texture.WHITE);
    const text = new Container();
    const label = new RelationLabel(back, text);
    dark.retint([{ label, role: 'relation' }], { shape: () => undefined, note: () => undefined });
    expect(text.tint).toBe(new Color(THEMES.dark.canvas.relationLabelText).toNumber());
    expect(back.tint).toBe(new Color(THEMES.dark.canvas.relationLabelBack).toNumber());
  });
});

describe('buildGeometry', () => {
  it('builds a drawing’s geometry, and the buffers of one drawn on its own', () => {
    const calls: string[] = [];
    const builder = (isBatchable: boolean) => ({
      updateGpuContext: () => {
        calls.push('geometry');
        return { isBatchable };
      },
      getContextRenderData: () => calls.push('buffers'),
    });
    const { context } = new Graphics();
    buildGeometry(builder(true), context);
    expect(calls).toEqual(['geometry']);
    buildGeometry(builder(false), context);
    expect(calls).toEqual(['geometry', 'geometry', 'buffers']);
    expect(() => buildGeometry(undefined, context)).not.toThrow();
  });
});
