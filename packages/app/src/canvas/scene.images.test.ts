/**
 * Images on the canvas, from the scene to the drawing: where each shape's picture goes, that the plate
 * of a drawing is what relations reach, the selection marks and pointing finds, and that a picture's
 * content, not its object, decides what its tiles draw.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { Appearance, ImageDefinition } from '@visual-anything/schema';
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { drawShapeBlocks, drawShapeOutlines, labelRooms, writeShapeLabels } from './draw';
import { HEADER_TEXT_SHIFT } from './shape-images';
import { BASE_DRAWING, textSideInset } from './drawing';
import { grow, type Point, type Rect } from './geometry';
import { hitAt, indexScene } from './hit';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';
import { shapeSignature } from './tiles';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const sample = loadSample();

const LOGO: ImageDefinition = {
  kind: 'svg',
  id: 'clinic.logo',
  name: 'Logo',
  width: 24,
  height: 24,
  svg: `<svg viewBox="0 0 24 24" ${NS}><circle cx="12" cy="12" r="10" fill="#25D366"/></svg>`,
};

/** The sample with the clinic package's images, and appearances showing them on elements. */
function withImages(
  shown: Record<string, Appearance['image']>,
  images: ImageDefinition[] = [LOGO],
  base: ProjectSnapshot = sample,
): ProjectSnapshot {
  return {
    ...base,
    packages: base.packages.map((file) => (file.id === 'clinic' ? { ...file, images } : file)),
    model: {
      ...base.model,
      elements: base.model.elements.map((element) =>
        Object.hasOwn(shown, element.id)
          ? { ...element, appearance: { ...element.appearance, image: shown[element.id] } }
          : element,
      ),
    },
  };
}

function shapeOf(scene: Scene, element: string): ElementShape {
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape of ${element}.`);
  return shape;
}

function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-9
  );
}

function onBorder(point: Point, rect: Rect): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const inside =
    point.x >= rect.x - 1e-6 &&
    point.x <= rect.x + rect.width + 1e-6 &&
    point.y >= rect.y - 1e-6 &&
    point.y <= rect.y + rect.height + 1e-6;
  return (
    inside &&
    (near(point.x, rect.x) ||
      near(point.x, rect.x + rect.width) ||
      near(point.y, rect.y) ||
      near(point.y, rect.y + rect.height))
  );
}

describe('the scene places each shape’s picture', () => {
  const project = withImages({
    whatsapp: { image: 'clinic.logo', placement: 'drawing' },
    'appointments-api': { image: 'clinic.logo' },
    scheduling: { image: 'clinic.logo', placement: 'drawing' },
  });
  const scene = buildScene(project, 'system-overview');

  it('as a drawing on a plate, an icon beside the name, or an icon in a container’s header', () => {
    const whatsapp = shapeOf(scene, 'whatsapp');
    expect(whatsapp.image?.placement).toBe('drawing');
    expect(whatsapp.plate).toBeDefined();
    expect(within(whatsapp.plate as Rect, whatsapp.rect)).toBe(true);
    expect(shapeOf(scene, 'appointments-api').image?.placement).toBe('icon');
    expect(shapeOf(scene, 'appointments-api').plate).toBeUndefined();
    const scheduling = shapeOf(scene, 'scheduling');
    expect(scheduling.image?.placement).toBe('header');
    expect(scheduling.image?.box).toMatchObject({
      x: scheduling.rect.x + 10,
      y: scheduling.rect.y + 7,
      width: 18,
    });
    expect(shapeOf(scene, 'patient').image).toBeUndefined();
  });

  it('draws relations to a drawing’s plate, not to the empty space around it', () => {
    const whatsapp = shapeOf(scene, 'whatsapp');
    const line = scene.relations.find((each) => each.relation === 'patient-to-whatsapp');
    expect(line && onBorder(line.to, whatsapp.plate as Rect)).toBe(true);
    expect(line && onBorder(line.to, whatsapp.rect)).toBe(false);
  });

  it('is equal, field by field, to a scene built from nothing, after a container moves', () => {
    const outcome = executeCommand(project, {
      type: 'set-positions',
      view: 'system-overview',
      positions: [{ element: 'clinic-booking', x: 300, y: 80, width: 980, height: 480 }],
    });
    if (!outcome.ok) throw new Error('refused');
    const moved = buildScene(outcome.state, 'system-overview');
    expect(moved).toEqual(buildSceneAfresh(outcome.state, 'system-overview'));
    const before = shapeOf(scene, 'whatsapp');
    const after = shapeOf(moved, 'whatsapp');
    expect(after.image?.rect.x).toBe((before.image?.rect.x ?? 0) + 60);
    expect(after.plate?.y).toBe((before.plate?.y ?? 0) + 40);
  });

  it('shows no picture where an element says none, or names one no package defines', () => {
    const none = buildScene(
      withImages({ whatsapp: 'none', 'appointments-api': { image: 'clinic.unknown' } }),
      'system-overview',
    );
    expect(shapeOf(none, 'whatsapp').image).toBeUndefined();
    expect(shapeOf(none, 'appointments-api').image).toBeUndefined();
  });

  it('keeps a picture’s serial, and its tiles, across a reload with equal content', () => {
    const reloaded = withImages(
      { whatsapp: { image: 'clinic.logo', placement: 'drawing' } },
      [{ ...LOGO }],
      structuredClone(sample),
    );
    const first = shapeOf(
      buildScene(
        withImages({ whatsapp: { image: 'clinic.logo', placement: 'drawing' } }),
        'system-overview',
      ),
      'whatsapp',
    );
    const again = shapeOf(buildScene(reloaded, 'system-overview'), 'whatsapp');
    expect(again.image?.serial).toBe(first.image?.serial);
    expect(shapeSignature(again)).toBe(shapeSignature(first));
    const changed = shapeOf(
      buildScene(
        withImages({ whatsapp: { image: 'clinic.logo', placement: 'drawing' } }, [
          { ...LOGO, svg: LOGO.svg.replace('r="10"', 'r="9"') },
        ]),
        'system-overview',
      ),
      'whatsapp',
    );
    expect(changed.image?.serial).not.toBe(first.image?.serial);
    expect(shapeSignature(changed)).not.toBe(shapeSignature(first));
  });
});

describe('the drawing of a shape with a picture', () => {
  const scene = buildScene(
    withImages({
      whatsapp: { image: 'clinic.logo', placement: 'drawing' },
      'appointments-api': { image: 'clinic.logo' },
      scheduling: { image: 'clinic.logo' },
    }),
    'system-overview',
  );
  const whatsapp = shapeOf(scene, 'whatsapp');

  it('is a block of its plate far out, and its own outline inside the plate close in', () => {
    const blocks = new Graphics();
    drawShapeBlocks(blocks, [whatsapp]);
    const filled = blocks.context.instructions.flatMap((each) =>
      each.action === 'fill'
        ? each.data.path.shapePath.shapePrimitives.map(({ shape }) => shape as unknown as Rect)
        : [],
    );
    for (const rect of filled) expect(within(rect, whatsapp.image?.box as Rect)).toBe(true);
    const outline = new Graphics();
    drawShapeOutlines(outline, [whatsapp]);
    const bounds = outline.context.bounds;
    expect(
      within(
        { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height },
        grow(whatsapp.image?.box as Rect, 1),
      ),
    ).toBe(true);
  });

  it('writes the name under the picture, in colours read on what the shape sits on', () => {
    const written: { text: string; y: number; fill: unknown }[] = [];
    writeShapeLabels(
      [whatsapp],
      true,
      (options) => {
        written.push({
          text: String(options.text),
          y: options.y ?? 0,
          fill: (options.style as { fill?: unknown } | undefined)?.fill,
        });
        return new Container();
      },
      () => '#000000',
    );
    const band = whatsapp.image?.band as Rect;
    expect(written.map((each) => each.text)).toEqual(['WhatsApp channel', 'Chat channel']);
    for (const each of written) {
      expect(each.y).toBeGreaterThanOrEqual(band.y);
      expect(each.y).toBeLessThan(band.y + band.height);
    }
    // On black, the name is written in white, whatever the fill of the plate.
    expect(written[0]?.fill).toBe('#FFFFFF');
    expect(labelRooms(whatsapp).name).toBeGreaterThan(0);
  });

  it('writes beside an icon, and after a header’s icon', () => {
    const at = (shape: ElementShape) => {
      const xs: number[] = [];
      writeShapeLabels([shape], false, (options) => {
        xs.push(options.x ?? 0);
        return new Container();
      });
      return xs[0] as number;
    };
    const api = shapeOf(scene, 'appointments-api');
    const plain = { ...api };
    delete plain.image;
    expect(at(api)).toBeGreaterThan(at(plain));
    const scheduling = shapeOf(scene, 'scheduling');
    const bare = { ...scheduling };
    delete bare.image;
    // A region writes after its header's picture, which takes its kind's icon's place (ADR 0086).
    expect(at(scheduling) - scheduling.rect.x).toBe(
      textSideInset(BASE_DRAWING) + HEADER_TEXT_SHIFT,
    );
    expect(at(bare) - bare.rect.x).toBe(
      textSideInset(BASE_DRAWING) + BASE_DRAWING.text.containerNameSize + 6,
    );
  });
});

describe('pointing at a drawing', () => {
  it('finds it by its plate and its name, and what holds it beside them', () => {
    const scene = buildScene(
      withImages({ whatsapp: { image: 'clinic.logo', placement: 'drawing' } }),
      'system-overview',
    );
    const indexed = indexScene(scene);
    const whatsapp = shapeOf(scene, 'whatsapp');
    const box = whatsapp.image?.box as Rect;
    const onPlate = hitAt(indexed, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 1);
    expect(onPlate?.kind === 'shape' && onPlate.shape.element).toBe('whatsapp');
    const band = whatsapp.image?.band as Rect;
    const onName = hitAt(indexed, { x: band.x + 4, y: band.y + band.height / 2 }, 1);
    expect(onName?.kind === 'shape' && onName.shape.element).toBe('whatsapp');
    const beside = hitAt(indexed, { x: whatsapp.rect.x + 1, y: whatsapp.rect.y + 1 }, 0.1);
    expect(beside?.kind === 'shape' && beside.shape.element).toBe('clinic-booking');
  });
});
