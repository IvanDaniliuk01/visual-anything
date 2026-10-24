import { Container, Graphics, type TextStyleOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  drawShapeBlocks,
  fitText,
  labelRooms,
  writeNoteTexts,
  writeRelationLabels,
  writeShapeLabels,
  type TextFactory,
} from './draw';
import type { Rect } from './geometry';
import { buildScene, type ElementShape } from './scene';

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
    const dark = { ...pale, key: 'dark', fill: '#1F2933', stroke: '#000000' };
    expect([...blocks([dark]).keys()]).toEqual(['#1F2933']);
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
