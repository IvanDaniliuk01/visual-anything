/**
 * Pictures in tables (ADR 0023, ADR 0027): a row shows its image as a 16-unit icon 8 units in from its
 * left, whatever the placement asks, and writes its name after it; a table shows its own in its
 * header, and writes its name after it too.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { ImageDefinition, PackageFile } from '@visual-anything/schema';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { VIEW, usersAndOrders } from '../test/tables';
import { writeShapeLabels } from './draw';
import { ROW_ICON, ROW_INSET, fitRow } from './fit';
import { buildScene, type ElementShape, type Scene } from './scene';
import { HEADER_TEXT_SHIFT, placeImage, rowImageRect } from './shape-images';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

const KEY: ImageDefinition = {
  kind: 'svg',
  id: 'pictures.key',
  name: 'Key',
  width: 24,
  height: 12,
  svg: `<svg viewBox="0 0 24 12" ${NS}><rect width="24" height="12" fill="#1F4E8C"/></svg>`,
};

const PICTURES: PackageFile = {
  id: 'pictures',
  name: 'Pictures',
  components: [],
  relationTypes: [],
  images: [KEY],
};

/** Users and orders, with the key picture on users.id, as a drawing, and on the users table. */
function withPictures(): ProjectSnapshot {
  const project = usersAndOrders({ packages: [PICTURES] });
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element) =>
        element.id === 'users-id'
          ? { ...element, appearance: { image: { image: 'pictures.key', placement: 'drawing' } } }
          : element.id === 'users'
            ? { ...element, appearance: { image: { image: 'pictures.key' } } }
            : element,
      ),
    },
  };
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`No shape ${key}.`);
  return shape;
}

/** Where each text a shape writes starts, with details. */
function xsOf(shape: ElementShape): number[] {
  const xs: number[] = [];
  writeShapeLabels([shape], true, (options) => {
    xs.push(options.x ?? 0);
    return new Container();
  });
  return xs;
}

describe('a row’s picture', () => {
  it('is placed as an icon at the row’s left, whatever the placement asks', () => {
    const rect = { x: 0, y: 56, width: 240, height: 24 };
    const look = {
      id: 'pictures.key',
      image: { kind: 'svg', width: 24, height: 12 },
      serial: 1,
      placement: 'drawing',
    } as unknown as Parameters<typeof placeImage>[0];
    const placed = placeImage(look, {
      kind: 'rectangle',
      rect,
      holdsContents: false,
      rows: false,
      row: true,
    });
    expect(placed?.plate).toBeUndefined();
    expect(placed?.image.placement).toBe('icon');
    expect(placed?.image.box).toEqual(rowImageRect(rect));
    // Its proportions kept, inside its square.
    expect(placed?.image.rect).toEqual({ x: 8, y: 64, width: 16, height: 8 });
  });

  it('shows on the row the scene builds, with its name after it', () => {
    const scene = buildScene(withPictures(), VIEW);
    const id = shapeOf(scene, 'users/users-id');
    expect(id.image?.placement).toBe('icon');
    expect(id.image?.box).toEqual(rowImageRect(id.rect));
    const [name] = xsOf(id);
    expect(name).toBe(id.rect.x + ROW_INSET + ROW_ICON);
    // A row without a picture writes where it did.
    const email = shapeOf(scene, 'users/users-email');
    expect(email.image).toBeUndefined();
    expect(xsOf(email)[0]).toBe(email.rect.x + ROW_INSET);
  });

  it('leaves its name less room, so that it never runs under the picture', () => {
    const long = 'a_very_long_column_name_that_does_not_fit_beside_its_type';
    expect(fitRow(long, 'uuid', 240, { icon: true }).name.length).toBeLessThan(
      fitRow(long, 'uuid', 240).name.length,
    );
  });

  it('shows a table’s own picture in its header, with its name after it', () => {
    const scene = buildScene(withPictures(), VIEW);
    const users = shapeOf(scene, 'users');
    expect(users.image?.placement).toBe('header');
    const [name] = xsOf(users);
    expect(name).toBe(users.rect.x + 12 + HEADER_TEXT_SHIFT);
  });
});
