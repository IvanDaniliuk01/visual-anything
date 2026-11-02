/**
 * A shape's own style (ADR 0088, A6.1): what the scene carries of each trait an appearance sets, that
 * the canvas and the SVG draw it, and that a view whose appearances set none draws as before.
 */
import {
  adaptedForDark,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Appearance } from '@visual-anything/schema';
import { FillGradient, Graphics, type GraphicsPath } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeSvg } from '../export/svg';
import { loadSample } from '../test/sample';
import { drawRoutePieces, drawShapeBlocks, drawShapeOutlines, gradientFill } from './draw';
import { BASE_DRAWING, SOFT_SHADOW } from './drawing';
import { buildScene, buildSceneAfresh, type ElementShape, type RelationLine } from './scene';
import { cornerRadiusOf, drawnKindOf, shapeStyleOf } from './shapeStyle';
import { paintedShape, shapeFollowsTheme } from './theme/paint';
import { routePieces } from './tiles';

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

function shapeIn(project: ProjectSnapshot, element = ELEMENT): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

function readSvg(text: string): Document {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

/** The SVG group of the element's shape, and its body: its first part that is no shadow. */
function svgBody(project: ProjectSnapshot): { group: Element; body: Element; svg: Document } {
  const svg = readSvg(writeSvg(project, VIEW).text);
  const key = shapeIn(project).key;
  const group = svg.querySelector(`[data-shape="${key}"]`);
  if (!group) throw new Error(`No group for ${key}`);
  const body = [...group.children].find(
    (each) =>
      ['rect', 'path', 'ellipse'].includes(each.tagName) && each.getAttribute('fill') !== '#000000',
  );
  if (!body) throw new Error('No body');
  return { group, body, svg };
}

interface Drawn {
  action: string;
  path?: GraphicsPath;
  style: { color: number; alpha: number; width?: number; texture?: unknown; fill?: unknown };
}

/** What the canvas draws of these shapes, instruction by instruction. */
function drawn(shapes: readonly ElementShape[], drawing = BASE_DRAWING): Drawn[] {
  const graphics = new Graphics();
  drawShapeOutlines(graphics, shapes, undefined, drawing);
  return graphics.context.instructions.map((each) => ({
    action: each.action,
    ...(each.data as { path?: GraphicsPath; style: Drawn['style'] }),
  }));
}

/** The kinds of path a drawing traces: rect, roundRect, ellipse… */
function pathKinds(instruction: Drawn): string[] {
  return instruction.path?.instructions.map((each) => each.action) ?? [];
}

describe('the scene', () => {
  it('carries no style on shapes whose appearances set none', () => {
    const scene = buildSceneAfresh(sample, VIEW);
    expect(scene.shapes.every((shape) => shape.style === undefined)).toBe(true);
    expect(scene.relations.every((line) => line.opacity === undefined)).toBe(true);
  });

  it('carries each trait an appearance sets, and leaves out those the drawing defaults draw', () => {
    const shape = shapeIn(
      styled({
        borderWidth: 0,
        dash: 'dotted',
        cornerRadius: 24,
        opacity: 0.5,
        shadow: 'soft',
        gradient: { to: '#3E63DD', direction: 'right' },
      }),
    );
    expect(shape.style).toEqual({
      borderWidth: 0,
      dash: 'dotted',
      cornerRadius: 24,
      opacity: 0.5,
      shadow: 'soft',
      gradient: { to: '#3E63DD', direction: 'right' },
    });
    // A solid dash and a whole opacity are what is drawn anyway.
    expect(shapeIn(styled({ dash: 'solid', opacity: 1 })).style).toBeUndefined();
  });

  it('takes a style from the component, and the element’s own first', () => {
    const project = applied(sample, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { borderWidth: 4, dash: 'dashed' },
    });
    expect(shapeIn(project).style).toEqual({ borderWidth: 4, dash: 'dashed' });
    expect(shapeIn(styled({ borderWidth: 1 }, project)).style).toEqual({
      borderWidth: 1,
      dash: 'dashed',
    });
  });

  it('keeps the same style object while the style is the same', () => {
    const project = styled({ opacity: 0.6 });
    const before = buildScene(project, VIEW);
    const renamed = applied(project, {
      type: 'update-element',
      id: ELEMENT,
      changes: { name: 'Booking' },
    });
    // The next build starts from the last one.
    const after = buildScene(renamed, VIEW);
    const was = before.shapes.find((each) => each.element === ELEMENT);
    const now = after.shapes.find((each) => each.element === ELEMENT);
    expect(now?.style).toBe(was?.style);
  });

  it('takes a gradient away with none, and runs it to its adapted color on the dark canvas when asked', () => {
    const project = applied(sample, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { gradient: { to: '#FFE8D6', direction: 'down' } },
    });
    expect(shapeIn(project).style?.gradient).toEqual({ to: '#FFE8D6', direction: 'down' });
    expect(shapeIn(styled({ gradient: 'none' }, project)).style).toBeUndefined();
    const adapted = applied(project, {
      type: 'set-drawing-defaults',
      drawing: { colors: { storedColorsInDark: 'adapted' } },
    });
    const shape = shapeIn(adapted);
    expect(shape.style?.gradient?.darkTo).toBe(adaptedForDark('#FFE8D6'));
    expect(shapeFollowsTheme(shape)).toBe(true);
    expect(paintedShape(shape, 'dark').style?.gradient?.to).toBe(adaptedForDark('#FFE8D6'));
    expect(paintedShape(shape, 'light')).toBe(shape);
  });

  it('gives a relation its opacity', () => {
    const first = buildScene(sample, VIEW).relations[0] as RelationLine;
    const project = applied(sample, {
      type: 'update-relation',
      id: first.relation,
      changes: { appearanceTraits: { opacity: 0.4 } },
    });
    const line = buildScene(project, VIEW).relations.find(
      (each) => each.relation === first.relation,
    );
    expect(line?.opacity).toBe(0.4);
  });
});

describe('shapeStyleOf', () => {
  it('rounds rectangles of either kind with an own corner radius, up to half the shorter side', () => {
    expect(drawnKindOf({ kind: 'rectangle', style: { cornerRadius: 8 } })).toBe(
      'rounded-rectangle',
    );
    expect(drawnKindOf({ kind: 'rounded-rectangle', style: { cornerRadius: 0 } })).toBe(
      'rectangle',
    );
    expect(drawnKindOf({ kind: 'ellipse', style: { cornerRadius: 8 } })).toBe('ellipse');
    expect(cornerRadiusOf({ style: { cornerRadius: 64 } }, BASE_DRAWING, 160, 60)).toBe(30);
    expect(cornerRadiusOf({}, BASE_DRAWING, 160, 60)).toBe(
      Math.min(BASE_DRAWING.shapes.cornerRadius, 40, 15),
    );
    expect(
      shapeStyleOf(
        { ...shapeIn(sample).style, dash: 'solid', opacity: 1, text: {} } as never,
        'as-stored',
      ),
    ).toBeUndefined();
  });
});

describe('the canvas', () => {
  const plain = shapeIn(sample);
  const fills = (shape: ElementShape) =>
    drawn([shape]).filter((each) => each.action === 'fill' && each.style.color !== 0);
  const strokes = (shape: ElementShape) =>
    drawn([shape]).filter((each) => each.action === 'stroke');
  const wide = (each: Drawn) => !(each.style as { pixelLine?: boolean }).pixelLine;

  it('draws a border at its own width, and none at 0', () => {
    expect(strokes(plain).filter(wide)[0]?.style.width).toBe(BASE_DRAWING.shapes.borderWidth);
    expect(strokes({ ...plain, style: { borderWidth: 6 } }).filter(wide)[0]?.style.width).toBe(6);
    const none = strokes({ ...plain, style: { borderWidth: 0 } });
    // Neither its border nor the line a pixel wide that outlines a solid border.
    expect(none).toEqual([]);
  });

  it('dashes a border with the lines’ pattern, piece by piece', () => {
    const dashed = strokes({ ...plain, style: { dash: 'dashed' } });
    expect(dashed.length).toBeGreaterThan(3);
    expect(dashed.every((each) => each.style.texture !== undefined)).toBe(true);
  });

  it('rounds a rectangle at its own corner radius', () => {
    const square = { ...plain, kind: 'rectangle' as const };
    expect(pathKinds(fills(square)[0] as Drawn)).toContain('rect');
    expect(pathKinds(fills({ ...square, style: { cornerRadius: 12 } })[0] as Drawn)).toContain(
      'roundRect',
    );
  });

  it('draws its body as opaque as it is', () => {
    const faded = drawn([{ ...plain, style: { opacity: 0.4 } }]);
    const body = faded.filter((each) => each.action !== 'texture');
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((each) => each.style.alpha === 0.4)).toBe(true);
    expect(fills(plain).every((each) => each.style.alpha === 1)).toBe(true);
  });

  it('lays its own shadow, and none where it says none', () => {
    const black = (shapes: ElementShape[], drawing = BASE_DRAWING) =>
      drawn(shapes, drawing).filter((each) => each.action === 'fill' && each.style.color === 0);
    expect(black([plain])).toHaveLength(0);
    const shadowed = black([{ ...plain, style: { shadow: 'soft' } }]);
    expect(shadowed).toHaveLength(SOFT_SHADOW.layers);
    const soft = { ...BASE_DRAWING, shapes: { ...BASE_DRAWING.shapes, shadow: 'soft' as const } };
    expect(black([plain], soft)).toHaveLength(SOFT_SHADOW.layers);
    expect(black([{ ...plain, style: { shadow: 'none' } }], soft)).toHaveLength(0);
  });

  it('fills a gradient where the page can draw one, and its fill where it cannot', () => {
    // jsdom has no 2D canvas: the shape is filled in its fill.
    expect(gradientFill('#010203', { to: '#040506', direction: 'down' })).toBeUndefined();
    const gradient = { to: '#3E63DD', direction: 'right' } as const;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          createLinearGradient: () => ({ addColorStop: () => undefined }),
          fillRect: () => undefined,
        }) as never,
    );
    const made = gradientFill(plain.fill, gradient);
    expect(made).toBeInstanceOf(FillGradient);
    expect(made?.colorStops.map((each) => each.offset)).toEqual([0, 1]);
    expect(gradientFill(plain.fill, gradient)).toBe(made);
    const filled = fills({ ...plain, style: { gradient } });
    expect(filled[0]?.style.fill).toBe(made);
  });

  it('draws opacity and gradients far out, and nothing else of the style', () => {
    const blocks = (shape: ElementShape) => {
      const graphics = new Graphics();
      drawShapeBlocks(graphics, [shape]);
      return graphics.context.instructions.map((each) => {
        const { style, path } = each.data as Drawn;
        return { action: each.action, style: { ...style }, path: path?.instructions };
      });
    };
    expect(
      blocks({ ...plain, style: { opacity: 0.5 } }).every((each) => each.style.alpha === 0.5),
    ).toBe(true);
    expect(blocks({ ...plain, style: { dash: 'dotted', borderWidth: 9 } })).toEqual(blocks(plain));
  });

  it('fades a relation’s line and arrowhead by its opacity', () => {
    const line: RelationLine = {
      relation: 'r',
      route: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      middle: { x: 50, y: 0 },
      stroke: '#3E4C59',
      width: 2,
      dash: 'solid',
      opacity: 0.3,
      arrowhead: { tip: { x: 100, y: 0 }, left: { x: 90, y: -4 }, right: { x: 90, y: 4 } },
    };
    const graphics = new Graphics();
    drawRoutePieces(graphics, routePieces(line, 1000), [line]);
    const styles = graphics.context.instructions.map(
      (each) => (each.data as { style: { alpha: number } }).style.alpha,
    );
    expect(styles.length).toBeGreaterThan(1);
    expect(styles.every((alpha) => alpha === 0.3)).toBe(true);
  });
});

describe('the SVG', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws a view whose appearances set no style as one whose own appearances are empty', () => {
    expect(writeSvg(styled({}), VIEW).text).toBe(writeSvg(sample, VIEW).text);
  });

  it('draws a border at its own width, dashed, or none', () => {
    expect(svgBody(styled({ borderWidth: 5 })).body.getAttribute('stroke-width')).toBe('5');
    const dashed = svgBody(styled({ borderWidth: 2, dash: 'dashed' })).body;
    expect(dashed.getAttribute('stroke-dasharray')).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?$/);
    expect(svgBody(styled({ borderWidth: 0 })).body.getAttribute('stroke')).toBe('none');
  });

  it('rounds a rectangle at its own corner radius', () => {
    const body = svgBody(styled({ shape: 'rectangle', cornerRadius: 14 })).body;
    expect(body.tagName).toBe('rect');
    expect(body.getAttribute('rx')).toBe('14');
    expect(svgBody(styled({ shape: 'rectangle' })).body.getAttribute('rx')).toBeNull();
  });

  it('draws its body as opaque as it is, its text whole', () => {
    const { group, body } = svgBody(styled({ opacity: 0.5 }));
    expect(body.getAttribute('opacity')).toBe('0.5');
    expect([...group.querySelectorAll('text')].every((each) => !each.closest('[opacity]'))).toBe(
      true,
    );
  });

  it('lays its own shadow', () => {
    const { group } = svgBody(styled({ shadow: 'soft' }));
    expect(group.querySelectorAll('[fill="#000000"]')).toHaveLength(SOFT_SHADOW.layers);
  });

  it('fills a gradient from a linearGradient whose id names its colors and direction', () => {
    const { body, svg } = svgBody(
      styled({ fill: '#FFFFFF', gradient: { to: '#3E63DD', direction: 'right' } }),
    );
    expect(body.getAttribute('fill')).toBe('url(#va-gradient-ffffff-3e63dd-right)');
    const gradient = svg.getElementById('va-gradient-ffffff-3e63dd-right');
    expect(gradient?.tagName).toBe('linearGradient');
    expect(gradient?.getAttribute('x2')).toBe('1');
    expect(
      [...(gradient?.querySelectorAll('stop') ?? [])].map((each) =>
        each.getAttribute('stop-color'),
      ),
    ).toEqual(['#FFFFFF', '#3E63DD']);
    // Two shapes with the same gradient share it; ids stay unique in the drawing.
    const ids = [...svg.querySelectorAll('[id]')].map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs a gradient to its adapted color in the dark theme, when asked', () => {
    const project = applied(
      styled({ fill: '#FFFFFF', gradient: { to: '#FFE8D6', direction: 'down' } }),
      { type: 'set-drawing-defaults', drawing: { colors: { storedColorsInDark: 'adapted' } } },
    );
    const text = writeSvg(project, VIEW, { theme: 'dark' }).text;
    expect(text).toContain(adaptedForDark('#FFE8D6').slice(1).toLowerCase());
  });

  it('fades a relation’s line and arrowhead, not its label', () => {
    const first = buildScene(sample, VIEW).relations[0] as RelationLine;
    const project = applied(sample, {
      type: 'update-relation',
      id: first.relation,
      changes: { appearanceTraits: { opacity: 0.4 } },
    });
    const svg = readSvg(writeSvg(project, VIEW).text);
    const faded = svg.querySelectorAll('g[opacity="0.4"]');
    expect(faded).toHaveLength(1);
    expect(faded[0]?.querySelector('path')).not.toBeNull();
    expect(faded[0]?.querySelector('text')).toBeNull();
  });
});
