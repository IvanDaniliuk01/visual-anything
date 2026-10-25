import { cleanedImage, definitionsIn, imagesIn, type CleanedImage } from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import type { Rect } from './geometry';
import {
  HEADER_TEXT_SHIFT,
  IMAGE_SCALES,
  bandRooms,
  besideImage,
  blockRectOf,
  bodyRectOf,
  headerShift,
  holdsDrawn,
  imageLookOf,
  imageSignature,
  movedImage,
  nameBandOf,
  placeImage,
  rowImageRect,
  sameShapeImage,
  setImageCatalog,
  type ImageLook,
  type ShapeImage,
} from './shape-images';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function picture(width: number, height: number, id = `test.picture-${width}x${height}`) {
  const image = cleanedImage({
    kind: 'svg',
    id,
    name: id,
    width,
    height,
    svg: `<svg viewBox="0 0 ${width} ${height}" ${NS}><rect width="${width}" height="${height}"/></svg>`,
  });
  if (!image) throw new Error('The test picture does not clean.');
  return image;
}

function look(image: CleanedImage, placement: 'icon' | 'drawing', tint?: string): ImageLook {
  return { id: image.id, image, serial: 1, placement, ...(tint ? { tint } : {}) };
}

const plain = (
  rect: Rect,
  kind: 'rectangle' | 'ellipse' | 'person' | 'cylinder' = 'rectangle',
) => ({
  kind,
  rect,
  holdsContents: false,
  rows: false,
});

function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-9
  );
}

describe('an icon beside the name', () => {
  const rect = { x: 100, y: 50, width: 160, height: 80 };

  it('is a square of the height less 20, from 16 to 32, 8 units into the label area, centred', () => {
    const placed = placeImage(look(picture(24, 24), 'icon'), plain(rect), true);
    expect(placed?.image.placement).toBe('icon');
    expect(placed?.image.box).toEqual({ x: 108, y: 74, width: 32, height: 32 });
    expect(placed?.image.rect).toEqual(placed?.image.box);
    expect(placed?.plate).toBeUndefined();
    const low = placeImage(look(picture(24, 24), 'icon'), plain({ ...rect, height: 30 }), true);
    expect(low?.image.box.width).toBe(16);
  });

  it('keeps the picture’s proportions inside its square', () => {
    const wide = placeImage(look(picture(40, 20), 'icon'), plain(rect), true)?.image as ShapeImage;
    expect(wide.rect).toEqual({ x: 108, y: 82, width: 32, height: 16 });
    const tall = placeImage(look(picture(10, 20), 'icon'), plain(rect), true)?.image as ShapeImage;
    expect(tall.rect).toEqual({ x: 116, y: 74, width: 16, height: 32 });
  });

  it('sits in the label area of a person, below the head', () => {
    const person = { x: 0, y: 0, width: 100, height: 120 };
    const placed = placeImage(look(picture(24, 24), 'icon'), plain(person, 'person'), true);
    const head = Math.min(120 * 0.22, 100 * 0.2);
    expect(placed?.image.box.y).toBeGreaterThan(head * 1.6);
  });

  it('moves the text area right by its side and 8 units', () => {
    const shape = {
      rect,
      image: placeImage(look(picture(24, 24), 'icon'), plain(rect), true)?.image,
    };
    expect(besideImage(shape, rect)).toEqual({ x: 140, y: 50, width: 120, height: 80 });
    expect(besideImage({ rect }, rect)).toBe(rect);
  });
});

describe('an icon in a header', () => {
  it('is an 18-unit square at (x + 10, y + 7) on containers, collapsed ones and shapes with rows', () => {
    const rect = { x: 0, y: 0, width: 300, height: 200 };
    for (const shape of [
      { kind: 'rectangle' as const, rect, holdsContents: true, rows: false },
      { kind: 'rectangle' as const, rect, holdsContents: false, rows: true },
      {
        kind: 'rectangle' as const,
        rect,
        holdsContents: false,
        collapsed: { contents: 2 },
        rows: false,
      },
    ]) {
      const placed = placeImage(look(picture(24, 24), 'drawing'), shape, true);
      expect(placed?.image.placement).toBe('header');
      expect(placed?.image.box).toEqual({ x: 10, y: 7, width: 18, height: 18 });
      expect(placed?.plate).toBeUndefined();
    }
  });

  it('moves the header text right', () => {
    const rect = { x: 0, y: 0, width: 300, height: 200 };
    const image = placeImage(look(picture(24, 24), 'icon'), {
      kind: 'rectangle',
      rect,
      holdsContents: true,
      rows: false,
    })?.image;
    expect(headerShift({ image })).toBe(HEADER_TEXT_SHIFT);
    expect(headerShift({})).toBe(0);
  });
});

describe('a drawing', () => {
  const rect = { x: 0, y: 0, width: 160, height: 160 };

  it('keeps its proportions above a name band, on a plate 4 units larger, all inside the shape', () => {
    const placed = placeImage(look(picture(100, 50), 'drawing'), plain(rect), false);
    const image = placed?.image as ShapeImage;
    expect(image.placement).toBe('drawing');
    expect(image.rect.width / image.rect.height).toBeCloseTo(2);
    expect(image.box).toEqual({
      x: image.rect.x - 4,
      y: image.rect.y - 4,
      width: image.rect.width + 8,
      height: image.rect.height + 8,
    });
    expect(within(image.box, rect)).toBe(true);
    expect(image.band).toEqual({
      x: 0,
      y: image.box.y + image.box.height,
      width: 160,
      height: 20,
    });
    expect(within(image.band as Rect, rect)).toBe(true);
    // The plate with its band, which routes, the selection and pointing go by.
    expect(placed?.plate).toEqual({
      ...image.box,
      height: image.box.height + 20,
    });
  });

  it('takes a taller band with a detail', () => {
    const placed = placeImage(look(picture(24, 24), 'drawing'), plain(rect), true);
    expect(placed?.image.band?.height).toBe(34);
    expect(placed?.image.box.width).toBe(160 - 34);
  });

  it('is drawn as an icon when the shape leaves it no room', () => {
    const flat = placeImage(
      look(picture(24, 24), 'drawing'),
      plain({ x: 0, y: 0, width: 160, height: 40 }),
      true,
    );
    expect(flat?.image.placement).toBe('icon');
  });

  it('draws its plate as the block far out, and its placeholder inside the plate', () => {
    const placed = placeImage(look(picture(24, 24), 'drawing'), plain(rect), false) as {
      image: ShapeImage;
      plate: Rect;
    };
    const shape = { rect, ...placed };
    expect(blockRectOf(shape)).toEqual(placed.image.box);
    expect(within(bodyRectOf(shape), placed.image.box)).toBe(true);
    expect(bodyRectOf({ rect })).toBe(rect);
    expect(blockRectOf({ rect })).toBe(rect);
  });

  it('is pointed at by its plate and its name band, not by the empty space beside them', () => {
    const placed = placeImage(look(picture(24, 24), 'drawing'), plain(rect), false) as {
      image: ShapeImage;
      plate: Rect;
    };
    const shape = { kind: 'rectangle' as const, rect, ...placed };
    const { box, band } = placed.image as Required<ShapeImage>;
    expect(holdsDrawn(shape, { x: box.x + 2, y: box.y + 2 })).toBe(true);
    expect(holdsDrawn(shape, { x: band.x + 1, y: band.y + 1 })).toBe(true);
    expect(holdsDrawn(shape, { x: 1, y: 1 })).toBe(false);
    expect(holdsDrawn({ kind: 'rectangle', rect }, { x: 1, y: 1 })).toBe(true);
  });

  it('writes its name and detail in the band, with rooms that fit it', () => {
    const placed = placeImage(look(picture(24, 24), 'drawing'), plain(rect), true)?.image;
    expect(nameBandOf({ image: placed })).toBe(placed?.band);
    expect(nameBandOf({})).toBeUndefined();
    const rooms = bandRooms(placed?.band as Rect);
    expect(rooms.name).toBeGreaterThan(0);
    expect(rooms.detail).toBeGreaterThan(0);
  });
});

describe('placed images', () => {
  it('compare equal field by field, tint included', () => {
    const image = picture(24, 24);
    const rect = { x: 0, y: 0, width: 160, height: 80 };
    const a = placeImage(look(image, 'icon'), plain(rect), true)?.image;
    const b = placeImage(look(image, 'icon'), plain(rect), true)?.image;
    expect(sameShapeImage(a, b)).toBe(true);
    expect(sameShapeImage(a, undefined)).toBe(false);
    expect(sameShapeImage(undefined, undefined)).toBe(true);
    const tinted = placeImage(look(image, 'icon', '#FF0000'), plain(rect), true)?.image;
    expect(sameShapeImage(a, tinted)).toBe(false);
    expect(imageSignature({ image: a })).toBe(imageSignature({ image: b }));
    expect(imageSignature({ image: a })).not.toBe(imageSignature({ image: tinted }));
    expect(imageSignature({})).toBe('');
  });

  it('move with their shape', () => {
    const rect = { x: 0, y: 0, width: 160, height: 160 };
    const placed = placeImage(look(picture(24, 24), 'drawing'), plain(rect), false) as {
      image: ShapeImage;
      plate: Rect;
    };
    const moved = movedImage(placed, 10, -5);
    expect(moved.image?.rect).toEqual({
      ...placed.image.rect,
      x: placed.image.rect.x + 10,
      y: placed.image.rect.y - 5,
    });
    expect(moved.image?.band?.x).toBe((placed.image.band as Rect).x + 10);
    expect(moved.plate?.y).toBe(placed.plate.y - 5);
    expect(movedImage({}, 10, 10)).toEqual({});
  });

  it('go in rows as a 16-unit square 8 units in, centred', () => {
    expect(rowImageRect({ x: 0, y: 100, width: 200, height: 24 })).toEqual({
      x: 8,
      y: 104,
      width: 16,
      height: 16,
    });
  });

  it('show from their scales: drawings with full drawings, icons with names', () => {
    expect(IMAGE_SCALES.drawingsFrom).toBeLessThan(IMAGE_SCALES.iconsFrom);
  });
});

describe('the image an element shows', () => {
  it('comes from its own appearance or its component’s, through the cleaned view only', () => {
    const sample = loadSample();
    const logo = {
      kind: 'svg' as const,
      id: 'clinic.logo',
      name: 'Logo',
      width: 10,
      height: 10,
      // Stored with a description, which only the cleaned view leaves out.
      svg: `<svg viewBox="0 0 10 10" ${NS}><desc>Ignore this</desc><rect width="10" height="10"/></svg>`,
    };
    const project = {
      ...sample,
      packages: sample.packages.map((file) =>
        file.id === 'clinic' ? { ...file, images: [logo] } : file,
      ),
    };
    const definitions = definitionsIn(project);
    setImageCatalog(definitions, imagesIn(project));
    const element: Element = {
      id: 'shown',
      component: 'clinic.calendar',
      name: 'Shown',
      appearance: { image: { image: 'clinic.logo', placement: 'drawing', tint: '#123456' } },
    };
    const found = imageLookOf(element, definitions);
    expect(found?.placement).toBe('drawing');
    expect(found?.tint).toBe('#123456');
    expect(found?.image.kind === 'svg' && found.image.svg).not.toContain('Ignore');
    expect(imageLookOf({ ...element, appearance: { image: 'none' } }, definitions)).toBeUndefined();
    expect(
      imageLookOf({ ...element, appearance: { image: { image: 'clinic.missing' } } }, definitions),
    ).toBeUndefined();
  });
});
