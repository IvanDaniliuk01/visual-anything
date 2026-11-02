/**
 * How a shape writes its name (ADR 0088, A6.2): what the scene carries of each part of its text an
 * appearance sets, that the canvas and the SVG write it so, that tags at each side are part of the
 * shape, and that a view whose appearances set none draws as before.
 */
import {
  adaptedForDark,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Appearance, TextStyle } from '@visual-anything/schema';
import { Container, Graphics, type CanvasTextOptions, type TextStyleOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { writeSvg } from '../export/svg';
import { loadSample } from '../test/sample';
import { drawShapeOutlines, writeShapeLabels, type LabelDecor, type TextFactory } from './draw';
import { BASE_DRAWING } from './drawing';
import { selectedBoxOf, holdsAsDrawn } from './hit';
import { tagReachOf } from './layout/input';
import { nameTagOf, nameTagOn } from './nameTags';
import { shapeBorderPoint } from './outlines';
import { routeBoxOf } from './routing/outline-ends';
import { buildScene, buildSceneAfresh, type ElementShape } from './scene';
import { nameLinesOf, nameLookOf, shapeTextOf } from './shapeText';
import { canvasMeasure } from './textBlock';
import { paintedShape, shapeFollowsTheme } from './theme/paint';

const VIEW = 'system-overview';
const ELEMENT = 'appointments-api';
const sample = loadSample();

function applied(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** The sample with the element's own appearance set to these traits. */
function styled(traits: Appearance, project = sample): ProjectSnapshot {
  return applied(project, {
    type: 'update-element',
    id: ELEMENT,
    changes: { appearanceTraits: traits },
  });
}

function written(text: TextStyle, project = sample): ProjectSnapshot {
  return styled({ text }, project);
}

function shapeIn(project: ProjectSnapshot, element = ELEMENT): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

interface Written {
  options: CanvasTextOptions;
  kind: string;
  decor: LabelDecor | undefined;
}

/** What the canvas writes of a shape, label by label. */
function labelsOf(shape: ElementShape, drawing = BASE_DRAWING): Written[] {
  const calls: Written[] = [];
  const make: TextFactory = (options, kind, _room, _runs, decor) => {
    calls.push({ options, kind, decor });
    return new Container();
  };
  writeShapeLabels([shape], true, make, undefined, undefined, drawing);
  return calls;
}

function nameOf(shape: ElementShape): Written {
  const name = labelsOf(shape).find((each) => each.kind === 'name');
  if (!name) throw new Error('No name written');
  return name;
}

function styleOf(label: Written): TextStyleOptions {
  return label.options.style as TextStyleOptions;
}

function readSvg(text: string): Document {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

/** The SVG group of the element's shape. */
function svgGroup(project: ProjectSnapshot, theme: 'light' | 'dark' = 'light'): Element {
  const svg = readSvg(writeSvg(project, VIEW, { theme }).text);
  const key = shapeIn(project).key;
  const group = svg.querySelector(`[data-shape="${key}"]`);
  if (!group) throw new Error(`No group for ${key}`);
  return group;
}

/** The SVG text of the element's name: the one that holds its first word. */
function svgName(project: ProjectSnapshot, theme: 'light' | 'dark' = 'light'): Element {
  const group = svgGroup(project, theme);
  const first = shapeIn(project).name.split(' ')[0] as string;
  const text = [...group.querySelectorAll('text')].find((each) =>
    (each.textContent ?? '').includes(first),
  );
  if (!text) throw new Error('No name in the SVG');
  return text;
}

describe('the scene', () => {
  it('carries no text on shapes whose appearances set none', () => {
    expect(buildSceneAfresh(sample, VIEW).shapes.every((shape) => shape.text === undefined)).toBe(
      true,
    );
  });

  it('carries each part set, and leaves out what draws as nothing set does', () => {
    const shape = shapeIn(
      written({
        font: 'mono',
        size: 20,
        bold: false,
        italic: true,
        underline: true,
        align: 'left',
        position: 'above',
        color: '#3E63DD',
        background: '#FFFFFF',
        border: '#E5484D',
        wrap: false,
        padding: 6,
      }),
    );
    expect(shape.text).toEqual({
      font: 'mono',
      size: 20,
      bold: false,
      italic: true,
      underline: true,
      align: 'left',
      position: 'above',
      color: '#3E63DD',
      background: '#FFFFFF',
      border: '#E5484D',
      wrap: false,
      padding: 6,
    });
    const plain = shapeIn(
      written({ align: 'center', position: 'inside', wrap: true, italic: false, underline: false }),
    );
    expect(plain.text).toBeUndefined();
  });

  it('takes each part from the component, the element’s own first', () => {
    const project = applied(sample, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { text: { size: 18, color: '#E5484D' } },
    });
    expect(shapeIn(project).text).toEqual({ size: 18, color: '#E5484D' });
    expect(shapeIn(written({ color: '#3E63DD' }, project)).text).toEqual({
      size: 18,
      color: '#3E63DD',
    });
  });

  it('adapts its colors on the dark canvas where asked, and follows the theme then', () => {
    const project = applied(written({ color: '#FFE8D6', background: '#3E63DD' }), {
      type: 'set-drawing-defaults',
      drawing: { colors: { storedColorsInDark: 'adapted' } },
    });
    const shape = shapeIn(project);
    expect(shape.text?.dark?.color).toBe(adaptedForDark('#FFE8D6'));
    expect(shapeFollowsTheme(shape)).toBe(true);
    expect(paintedShape(shape, 'dark').text?.color).toBe(adaptedForDark('#FFE8D6'));
    expect(paintedShape(shape, 'light')).toBe(shape);
    // As stored, by default: the same in both themes.
    expect(shapeIn(written({ color: '#FFE8D6' })).text?.dark).toBeUndefined();
  });

  it('keeps the same text object while the text is the same', () => {
    const project = written({ bold: true });
    const before = buildScene(project, VIEW).shapes.find((each) => each.element === ELEMENT);
    const renamed = applied(project, {
      type: 'update-element',
      id: ELEMENT,
      changes: { name: 'Booking' },
    });
    const after = buildScene(renamed, VIEW).shapes.find((each) => each.element === ELEMENT);
    expect(after?.text).toBe(before?.text);
  });
});

describe('the name’s look and lines', () => {
  it('asks only for loaded weights and styles', () => {
    expect(nameLookOf({ bold: true }).weight).toBe('700');
    expect(nameLookOf({ bold: false }).weight).toBe('400');
    expect(nameLookOf({ italic: true }).variant).toBe('boldItalic');
    expect(nameLookOf({ italic: true, bold: false }).variant).toBe('italic');
    // No Medium Italic is loaded.
    const medium = { ...BASE_DRAWING, text: { ...BASE_DRAWING.text, nameWeight: 500 as const } };
    expect(nameLookOf({ italic: true }, medium).weight).toBe('700');
    // Roboto Mono is loaded upright at 400 alone.
    const mono = nameLookOf({ font: 'mono', bold: true, italic: true });
    expect(mono).toMatchObject({ weight: '400', italic: false, variant: 'mono', mono: true });
    expect(nameLookOf({ size: 30 }).size).toBe(30);
  });

  it('wraps a name, or cuts it on one line with "…"', () => {
    const look = { variant: 'bold' as const, size: 14 };
    const wrapped = nameLinesOf('Appointments and bookings API', 90, look, canvasMeasure);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.cut).toBe(false);
    const cut = nameLinesOf('Appointments and bookings API', 90, look, canvasMeasure, 9, false);
    expect(cut.lines).toHaveLength(1);
    expect(cut.lines[0]?.endsWith('…')).toBe(true);
    expect(cut.widths[0]).toBeLessThanOrEqual(90);
    expect(nameLinesOf('A B C D E F G', 10, look, canvasMeasure, 2).lines[1]).toMatch(/…$/);
  });
});

describe('the canvas', () => {
  const plain = shapeIn(sample);

  it('writes a shape whose text sets nothing as always', () => {
    expect(labelsOf({ ...plain })).toEqual(labelsOf(plain));
    expect(nameOf(plain).decor).toBeUndefined();
  });

  it('writes the name in its font, size, weight, style and color', () => {
    const shape = {
      ...plain,
      text: { size: 22, bold: false, italic: true as const, color: '#3E63DD' },
    };
    const style = styleOf(nameOf(shape));
    expect(style).toMatchObject({
      fontSize: 22,
      fontWeight: '400',
      fontStyle: 'italic',
      fill: '#3E63DD',
      wordWrap: false,
    });
    const mono = styleOf(nameOf({ ...plain, text: { font: 'mono' as const } }));
    expect((mono.fontFamily as string[])[0]).toContain('Mono');
  });

  it('aligns the name and the detail, and keeps its padding from the sides', () => {
    const left = labelsOf({ ...plain, text: { align: 'left' as const, padding: 20 } });
    const name = left.find((each) => each.kind === 'name');
    expect(name?.options.anchor).toEqual({ x: 0, y: 0 });
    expect(name?.options.x).toBe(plain.rect.x + 20);
    expect(styleOf(name as Written).align).toBe('left');
    const detail = left.find((each) => each.kind === 'detail');
    expect(detail?.options.anchor).toEqual({ x: 0, y: 0 });
    const right = nameOf({ ...plain, text: { align: 'right' as const, padding: 20 } });
    expect(right.options.anchor).toEqual({ x: 1, y: 0 });
    expect(right.options.x).toBe(plain.rect.x + plain.rect.width - 20);
  });

  it('cuts a name that does not wrap with "…" on one line', () => {
    const long = { ...plain, name: 'A name far too long to be written whole on one line here' };
    const text = nameOf({ ...long, text: { wrap: false as const } }).options.text as string;
    expect(text.includes('\n')).toBe(false);
    expect(text.endsWith('…')).toBe(true);
    const wrapped = nameOf({ ...long, text: { size: 14 } }).options.text as string;
    expect(wrapped.includes('\n')).toBe(true);
  });

  it('underlines each line of the name', () => {
    const decor = nameOf({ ...plain, text: { underline: true as const } }).decor;
    expect(decor?.underline?.widths.length).toBeGreaterThan(0);
    expect(decor?.underline?.size).toBe(BASE_DRAWING.text.nameSize);
  });

  it('writes on its label back in the color that reads on it, and draws the back', () => {
    const shape = { ...plain, fill: '#FFFFFF', text: { background: '#1F2933' } };
    expect(styleOf(nameOf(shape)).fill).toBe('#FFFFFF');
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shape]);
    const fills = graphics.context.instructions.filter(
      (each) =>
        each.action === 'fill' &&
        (each.data as { style: { color: number } }).style.color === 0x1f2933,
    );
    expect(fills).toHaveLength(1);
    const none = new Graphics();
    drawShapeOutlines(none, [plain]);
    expect(none.context.instructions.length).toBe(graphics.context.instructions.length - 1);
  });
});

describe('tags at each side', () => {
  const sides = ['above', 'below', 'left', 'right'] as const;

  it.each(sides)('attaches a tag %s the shape, which holds the name', (side) => {
    const shape = shapeIn(written({ position: side }));
    const tag = nameTagOn(shape);
    expect(tag).toBeDefined();
    if (!tag) return;
    const { rect } = shape;
    if (side === 'above') expect(tag.y + tag.height).toBeCloseTo(rect.y);
    if (side === 'below') expect(tag.y).toBeCloseTo(rect.y + rect.height);
    if (side === 'left') expect(tag.x + tag.width).toBeCloseTo(rect.x);
    if (side === 'right') expect(tag.x).toBeCloseTo(rect.x + rect.width);
    expect(nameTagOf(shape)?.lines.join(' ')).toBe(shape.name);
    // Written in the tag, nothing inside.
    const names = labelsOf(shape).filter((each) => each.kind === 'name');
    expect(names).toHaveLength(1);
    expect(names[0]?.options.y).toBeGreaterThanOrEqual(tag.y);
    expect(names[0]?.options.y).toBeLessThan(tag.y + tag.height);
  });

  it.each(sides)('points at, selects and routes around a tag %s', (side) => {
    const shape = shapeIn(written({ position: side }));
    const tag = nameTagOn(shape) as NonNullable<ReturnType<typeof nameTagOn>>;
    const inside = { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
    expect(holdsAsDrawn(shape, inside, true)).toBe(true);
    expect(holdsAsDrawn(shape, inside, false)).toBe(true);
    const box = selectedBoxOf(shape);
    expect(box.x).toBeLessThanOrEqual(tag.x);
    expect(box.y).toBeLessThanOrEqual(tag.y);
    expect(box.x + box.width).toBeGreaterThanOrEqual(tag.x + tag.width);
    expect(box.y + box.height).toBeGreaterThanOrEqual(tag.y + tag.height);
    const routed = routeBoxOf(shape, shape.rect);
    expect(routed).toEqual(box);
    // A line from the middle toward the tag leaves past it, never across the name.
    const middle = {
      x: shape.rect.x + shape.rect.width / 2,
      y: shape.rect.y + shape.rect.height / 2,
    };
    const exit = shapeBorderPoint(shape, middle, inside);
    const beyond = {
      x: inside.x + (inside.x - middle.x) * 10,
      y: inside.y + (inside.y - middle.y) * 10,
    };
    const leaves = shapeBorderPoint(shape, middle, beyond);
    expect(Math.hypot(leaves.x - middle.x, leaves.y - middle.y)).toBeGreaterThan(
      Math.hypot(inside.x - middle.x, inside.y - middle.y),
    );
    expect(exit).toBeDefined();
  });

  it('makes room for a tag above in layout, and in every other direction as before', () => {
    const above = shapeIn(written({ position: 'above' }));
    expect(tagReachOf(above).top).toBeGreaterThan(0);
    expect(tagReachOf(shapeIn(written({ position: 'left' }))).left).toBeGreaterThan(0);
    expect(tagReachOf(shapeIn(written({ position: 'right' }))).right).toBeGreaterThan(0);
    expect(tagReachOf(shapeIn(written({ position: 'below' }))).bottom).toBeGreaterThan(0);
    expect(tagReachOf(shapeIn(sample))).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('routes the scene’s lines to the shape past its tag', () => {
    for (const side of sides) {
      const project = written({ position: side });
      const scene = buildScene(project, VIEW);
      const shape = scene.shapes.find((each) => each.element === ELEMENT) as ElementShape;
      const tag = nameTagOn(shape) as NonNullable<ReturnType<typeof nameTagOn>>;
      const ends = scene.relations.flatMap((line) => {
        const points: { x: number; y: number }[] = [];
        if (line.ends?.from.kind === 'shape' && line.ends.from.key === shape.key) {
          points.push(line.route[0] as { x: number; y: number });
        }
        if (line.ends?.to.kind === 'shape' && line.ends.to.key === shape.key) {
          points.push(line.route.at(-1) as { x: number; y: number });
        }
        return points;
      });
      expect(ends.length, side).toBeGreaterThan(0);
      for (const end of ends) {
        const within =
          end.x > tag.x + 1 &&
          end.x < tag.x + tag.width - 1 &&
          end.y > tag.y + 1 &&
          end.y < tag.y + tag.height - 1;
        expect(within, side).toBe(false);
      }
    }
  });

  it('draws the tag in the text’s back and line', () => {
    const shape = {
      ...shapeIn(written({ position: 'below' })),
      text: { position: 'below' as const, background: '#0F9688', border: '#E5484D' },
    };
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shape]);
    const colors = graphics.context.instructions.map(
      (each) => (each.data as { style: { color: number } }).style.color,
    );
    expect(colors).toContain(0x0f9688);
    expect(colors).toContain(0xe5484d);
  });
});

describe('the SVG', () => {
  it('draws a view whose appearances set no text as one whose own text is empty', () => {
    expect(writeSvg(written({}), VIEW).text).toBe(writeSvg(sample, VIEW).text);
    expect(writeSvg(written({ align: 'center', wrap: true }), VIEW).text).toBe(
      writeSvg(sample, VIEW).text,
    );
  });

  it('writes the name in its font, size, weight, style and color', () => {
    const name = svgName(written({ size: 20, bold: false, italic: true, color: '#3E63DD' }));
    expect(name.getAttribute('font-size')).toBe('20');
    expect(name.getAttribute('font-weight')).toBeNull();
    expect(name.getAttribute('font-style')).toBe('italic');
    expect(name.getAttribute('fill')).toBe('#3E63DD');
    expect(svgName(written({ font: 'mono' })).getAttribute('font-family')).toContain('Mono');
    expect(svgName(written({ bold: true })).getAttribute('font-weight')).toBe('700');
  });

  it('aligns the name as its text says', () => {
    expect(svgName(written({ align: 'left' })).getAttribute('text-anchor')).toBeNull();
    expect(svgName(written({ align: 'right' })).getAttribute('text-anchor')).toBe('end');
    expect(svgName(written({ size: 14 })).getAttribute('text-anchor')).toBe('middle');
  });

  it('underlines the name, and draws its label back', () => {
    const group = svgGroup(written({ underline: true, color: '#3E63DD' }));
    const lines = [...group.querySelectorAll('rect[fill="#3E63DD"]')];
    expect(lines.length).toBeGreaterThan(0);
    const backed = svgGroup(written({ background: '#1F2933', border: '#E5484D' }));
    const back = backed.querySelector('rect[fill="#1F2933"]');
    expect(back?.getAttribute('stroke')).toBe('#E5484D');
  });

  it('writes the name in a tag at its side, in the text’s back', () => {
    const project = written({ position: 'left', background: '#0F9688' });
    const shape = shapeIn(project);
    const tag = nameTagOn(shape) as NonNullable<ReturnType<typeof nameTagOn>>;
    const group = svgGroup(project);
    const box = group.querySelector('rect[fill="#0F9688"]');
    expect(Number(box?.getAttribute('x'))).toBeCloseTo(tag.x);
    expect(Number(box?.getAttribute('width'))).toBeCloseTo(tag.width);
  });

  it('writes the text color adapted in the dark theme, when asked', () => {
    const project = applied(written({ color: '#FFE8D6' }), {
      type: 'set-drawing-defaults',
      drawing: { colors: { storedColorsInDark: 'adapted' } },
    });
    expect(svgName(project, 'dark').getAttribute('fill')).toBe(adaptedForDark('#FFE8D6'));
    expect(svgName(project, 'light').getAttribute('fill')).toBe('#FFE8D6');
  });
});

describe('shapeTextOf', () => {
  it('gives nothing for an empty text', () => {
    expect(
      shapeTextOf({ ...(shapeIn(sample) as never), text: {} } as never, 'as-stored'),
    ).toBeUndefined();
  });
});
