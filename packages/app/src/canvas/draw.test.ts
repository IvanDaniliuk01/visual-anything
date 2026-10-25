import { Container, Graphics, Texture, type GraphicsPath, type TextStyleOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  detailOf,
  drawPieceLines,
  drawRoutePieces,
  drawShapeBlocks,
  drawShapeOutlines,
  fitText,
  labelRooms,
  writeNoteTexts,
  writeRelationLabels,
  writeShapeLabels,
  type TextFactory,
} from './draw';
import { arrowheadAt, toggleRect, type Point, type Rect } from './geometry';
import { midpointOf } from './route';
import { buildScene, type ElementShape, type RelationLine } from './scene';
import { routePieces } from './tiles';

const scene = buildScene(loadSample(), 'system-overview');
const textOf = (label: unknown) => (label as { text: string }).text;

describe('writeShapeLabels', () => {
  it('writes each element’s name and, with details, its component’s name', () => {
    const written = writeShapeLabels(scene.shapes, true).map(textOf);
    for (const shape of scene.shapes) {
      expect(written).toContain(shape.name);
      expect(written).toContain(shape.componentName);
    }
    expect(written.filter((text) => text === 'Service')).toHaveLength(2);
  });

  it('writes only the names without details', () => {
    const written = writeShapeLabels(scene.shapes, false).map(textOf);
    expect(written).toHaveLength(scene.shapes.length);
    expect(written).not.toContain('Service');
  });
});

describe('drawRoutePieces', () => {
  const line = (route: Point[], dash: RelationLine['dash']): RelationLine => ({
    relation: 'r',
    route,
    from: route[0] as Point,
    to: route.at(-1) as Point,
    middle: midpointOf(route),
    stroke: '#3E4C59',
    width: 4,
    dash,
  });
  /** What each tile's drawing strokes: the points of each path, and the pattern's origin. */
  const strokes = (pieces: ReturnType<typeof routePieces>) =>
    pieces.map((piece) => {
      const graphics = new Graphics();
      drawRoutePieces(graphics, [piece], []);
      return graphics.context.instructions.map((instruction) => {
        const data = instruction.data as {
          path: GraphicsPath;
          style: { matrix?: { tx: number; ty: number } };
        };
        return {
          points: data.path.instructions.map((each) => each.data.slice(0, 2) as number[]),
          origin: data.style.matrix && { x: data.style.matrix.tx, y: data.style.matrix.ty },
        };
      });
    });

  it('goes on with the dashes where a relation passes from one tile to the next', () => {
    const pieces = routePieces(
      line(
        [
          { x: 100, y: 100 },
          { x: 2500, y: 100 },
        ],
        'dashed',
      ),
    );
    expect(pieces).toHaveLength(3);
    // Every piece lays the pattern from the start of the route, as the whole route would.
    const origins = strokes(pieces).flatMap((drawn) => drawn.map((each) => each.origin));
    for (const origin of origins) {
      expect(origin?.x).toBeCloseTo(100);
      expect(origin?.y).toBeCloseTo(100 - 2);
    }
  });

  it('draws a directed relation far out as a plain line all the way to its tip', () => {
    const route = [
      { x: 100, y: 100 },
      { x: 600, y: 100 },
    ];
    const directed = {
      ...line(route, 'dashed'),
      arrowhead: arrowheadAt(route[0] as Point, route[1] as Point, 4),
    };
    const graphics = new Graphics();
    drawPieceLines(graphics, routePieces(directed));
    const [stroke] = graphics.context.instructions;
    const path = (stroke?.data as { path: GraphicsPath }).path.instructions;
    // Straight on from the start to the tip, through the arrowhead's base.
    const points = path.map((each) => each.data.slice(0, 2) as number[]);
    expect(points[0]).toEqual([100, 100]);
    expect(points.at(-1)).toEqual([600, 100]);
    expect(points.every(([, y]) => y === 100)).toBe(true);
    expect((stroke?.data as { style: { texture: unknown } }).style.texture).toBe(Texture.WHITE);
  });

  it('fills the corner of a bend between two tiles from both sides', () => {
    const pieces = routePieces(
      line(
        [
          { x: 100, y: 100 },
          { x: 1024, y: 100 },
          { x: 1024, y: 900 },
        ],
        'solid',
      ),
    );
    const [first, second] = strokes(pieces).map((drawn) => drawn[0]?.points);
    // Half the width past the bend, each along its own segment.
    expect(first).toEqual([
      [100, 100],
      [1026, 100],
    ]);
    expect(second).toEqual([
      [1024, 98],
      [1024, 900],
    ]);
  });
});

describe('writeRelationLabels and writeNoteTexts', () => {
  it('labels the relations that have a name, and writes the notes', () => {
    expect(writeRelationLabels(scene.relations).map(textOf)).toContain('HTTPS');
    expect(writeNoteTexts(scene.notes).map(textOf)).toEqual(scene.notes.map((note) => note.text));
  });
});

/** A label measured by its characters: 7 units each, wrapped at its width, 17 units a line. */
class Measured extends Container {
  constructor(
    public text: string,
    private readonly wrap: number,
  ) {
    super();
  }

  override get height(): number {
    return Math.ceil((this.text.length * 7) / this.wrap) * 17;
  }

  override set height(_: number) {
    // Measured, never set.
  }
}

const measured: TextFactory = (options, _kind, room) =>
  fitText(
    new Measured(String(options.text), (options.style as TextStyleOptions).wordWrapWidth ?? 100),
    room,
  );

function shapeOf(element: string): ElementShape {
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(element);
  return shape;
}

describe('labelRooms', () => {
  it('gives a container’s name one line in its header, and its component’s name the line below', () => {
    const clinic = shapeOf('clinic-booking');
    expect(labelRooms(clinic)).toEqual({ name: 20, detail: 16 });
    const low = (height: number) => ({ ...clinic, rect: { ...clinic.rect, height } });
    expect(labelRooms(low(40))).toEqual({ name: 20, detail: 8 });
    expect(labelRooms(low(30)).detail).toBeLessThanOrEqual(0);
  });

  it('gives a content’s name the upper half of its label area, and its component’s name the lower', () => {
    expect(labelRooms(shapeOf('whatsapp'))).toEqual({ name: 36, detail: 30 });
    // A cylinder's label area leaves out its caps: 80 - 3 × 12.
    expect(labelRooms(shapeOf('appointments-db'))).toEqual({ name: 22, detail: 16 });
    const patient = labelRooms(shapeOf('patient'));
    expect(patient.name).toBeCloseTo((80 - 0.22 * 80 * 1.6) / 2);
    const ellipse = { ...shapeOf('whatsapp'), kind: 'ellipse' as const };
    expect(labelRooms(ellipse).name).toBeCloseTo((72 * 0.7) / 2);
  });

  it('leaves out a component’s name a container has no room for', () => {
    const clinic = shapeOf('clinic-booking');
    const written = writeShapeLabels(
      [{ ...clinic, rect: { ...clinic.rect, height: 30 } }],
      true,
      measured,
    ).map(textOf);
    expect(written).toEqual(['Clinic booking']);
  });
});

describe('fitText', () => {
  it('cuts a long name with “…” so that it fits its shape, and leaves short names alone', () => {
    const service = shapeOf('whatsapp');
    const long = { ...service, name: 'A very long name for a channel that patients write to' };
    const [name] = writeShapeLabels([long], false, measured) as Measured[];
    expect(name?.text.endsWith('…')).toBe(true);
    expect(name?.height).toBeLessThanOrEqual(labelRooms(long).name);
    expect(long.name.startsWith(name?.text.slice(0, -1) ?? '-')).toBe(true);

    const [short] = writeShapeLabels([service], false, measured) as Measured[];
    expect(short?.text).toBe(service.name);
  });

  it('leaves a label out when even its first letters do not fit', () => {
    const label = new Measured('Name', 100);
    expect(fitText(label, 5)).toBeUndefined();
    expect(fitText(new Measured('Name', 100), undefined)?.text).toBe('Name');
  });
});

describe('drawShapeBlocks', () => {
  /** The rectangles filled with each colour, with no strokes at all. */
  function blocks(shapes: ElementShape[]): Map<string, Rect[]> {
    const graphics = new Graphics();
    drawShapeBlocks(graphics, shapes);
    const byColor = new Map<string, Rect[]>();
    for (const each of graphics.context.instructions) {
      expect(each.action).toBe('fill');
      if (each.action !== 'fill') continue;
      const color = `#${each.data.style.color.toString(16).padStart(6, '0').toUpperCase()}`;
      const rects = each.data.path.shapePath.shapePrimitives.map(
        ({ shape }) => shape as unknown as Rect,
      );
      byColor.set(color, [...(byColor.get(color) ?? []), ...rects]);
    }
    return byColor;
  }

  it('outlines containers, and plain blocks whose fill would not stand out from the canvas', () => {
    const pale = shapeOf('whatsapp');
    // A mid gray stands out from both canvases; a near black would vanish on the dark one.
    const gray = { ...pale, key: 'gray', fill: '#808080', stroke: '#000000' };
    expect([...blocks([gray]).keys()]).toEqual(['#808080']);
    const dark = { ...pale, key: 'dark', fill: '#1F2933', stroke: '#9AA5B1' };
    expect(blocks([dark]).get('#9AA5B1')).toMatchObject([dark.rect]);
    const outlined = blocks([pale]);
    expect(outlined.get(pale.stroke)).toMatchObject([pale.rect]);
    // The fill sits inside the outline, so that nothing is drawn beyond the shape.
    expect(outlined.get(pale.fill)).toMatchObject([
      {
        x: pale.rect.x + 6,
        y: pale.rect.y + 6,
        width: pale.rect.width - 12,
        height: pale.rect.height - 12,
      },
    ]);
    const clinic = shapeOf('clinic-booking');
    const all = blocks([clinic, dark, pale]);
    expect(all.get(clinic.stroke)).toHaveLength(clinic.stroke === pale.stroke ? 2 : 1);
  });
});

describe('containers, collapsed or not', () => {
  const container = scene.shapes.find((shape) => shape.key === 'clinic-booking') as ElementShape;
  const collapsed: ElementShape = {
    ...container,
    rect: { ...container.rect, width: 180, height: 72 },
    holdsContents: false,
    collapsed: { contents: 3 },
  };

  it('writes how many shapes a collapsed container holds in its detail, at its top', () => {
    expect(detailOf(collapsed)).toBe('System · 3 inside');
    expect(detailOf(container)).toBe('System');
    const written = writeShapeLabels([collapsed], true, (options) => {
      const label = new Container();
      label.label = String(options.text);
      label.position.set(options.x ?? 0, options.y ?? 0);
      return label;
    });
    expect(written.map((label) => label.label)).toEqual(['Clinic booking', 'System · 3 inside']);
    // At the top left of its body, as a container's name is, not in its middle.
    expect(written[0]?.y).toBe(collapsed.rect.y + 8);
    expect(labelRooms(collapsed)).toEqual({ name: 20, detail: 16 });
  });

  it('draws the toggle on every container, with + on a collapsed one, and a sheet behind it', () => {
    const strokes = (shape: ElementShape) => {
      const graphics = new Graphics();
      drawShapeOutlines(graphics, [shape]);
      return graphics.context.instructions.filter((each) => each.action === 'stroke').length;
    };
    const leaf = scene.shapes.find(
      (shape) => !shape.holdsContents && shape.kind === 'rounded-rectangle',
    ) as ElementShape;
    // A body; a container adds its toggle's face and sign, and a collapsed one the sheet behind it.
    expect(strokes(leaf)).toBe(1);
    expect(strokes(container)).toBe(3);
    expect(strokes(collapsed)).toBe(4);
    expect(toggleRect(leaf)).toBeUndefined();
    const toggle = toggleRect(collapsed) as Rect;
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(collapsed.rect.x + collapsed.rect.width);
    expect(toggle.y).toBeGreaterThan(collapsed.rect.y);
  });

  it('outlines a collapsed container drawn as a plain block, as any container', () => {
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [{ ...collapsed, fill: '#1D4F91' }]);
    expect(graphics.context.instructions.filter((each) => each.action === 'fill')).toHaveLength(2);
  });
});
