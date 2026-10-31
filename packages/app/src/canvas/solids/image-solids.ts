/**
 * Solids in a PNG of the canvas (ADR 0075): the pictures the solid worker drew for the image at its
 * scale, with their parts' states laid over them (`export/solid-pictures.ts`), drawn where the canvas
 * draws solids, above the element shapes and under the relations, each over a plate of its shape's
 * fill that covers the placeholder the tiles draw until a picture comes: a drawing's box, or the
 * picture's place. A shape the emphasis draws faintly is drawn faintly here too.
 */
import type { ThemeName } from '@visual-anything/core';
import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { PaintedSolid } from '../../export/solid-pictures';
import { DIMMED_ALPHA } from '../colors';
import type { Scene } from '../scene';
import { shapeColors } from '../theme/paint';

/** How round a drawing's plate is, as the tiles draw it. */
const PLATE_RADIUS = 6;

/** What an image draws of its solids, and how to let it go once the image is drawn. */
export interface ImageSolids {
  container: Container;
  destroy(): void;
}

/** A picture's pixels as a texture of their own, premultiplied as PixiJS draws them. */
function textureOf(picture: PaintedSolid): Texture {
  return new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array(
        picture.pixels.buffer,
        picture.pixels.byteOffset,
        picture.pixels.length,
      ),
      width: picture.width,
      height: picture.height,
      format: 'rgba8unorm',
      autoGenerateMipmaps: false,
      alphaMode: 'premultiply-alpha-on-upload',
    }),
  });
}

/** The solids an image draws, from the pictures drawn for it by the key of the shape each shows on. */
export function imageSolidsOf(
  scene: Scene,
  pictures: ReadonlyMap<string, PaintedSolid>,
  theme: ThemeName,
  dimmed: ReadonlySet<string>,
): ImageSolids {
  const container = new Container();
  const textures: Texture[] = [];
  const order = scene.drawing ?? scene.shapes.map((_shape, at) => at);
  for (const at of order) {
    const shape = scene.shapes[at];
    const solid = shape?.solid;
    const picture = shape && pictures.get(shape.key);
    if (!shape || !solid || !picture) continue;
    const plate = solid.placement === 'drawing' ? solid.box : solid.rect;
    const radius =
      solid.placement === 'drawing' ? Math.min(PLATE_RADIUS, plate.width / 4, plate.height / 4) : 0;
    const group = new Container();
    group.addChild(
      new Graphics()
        .roundRect(plate.x, plate.y, plate.width, plate.height, radius)
        .fill(shapeColors(shape, theme).fill),
    );
    const texture = textureOf(picture);
    textures.push(texture);
    const sprite = new Sprite(texture);
    sprite.position.set(solid.rect.x, solid.rect.y);
    sprite.width = solid.rect.width;
    sprite.height = solid.rect.height;
    group.addChild(sprite);
    // A drawing with parts draws its faint parts by their veils; any other shape faintly, whole.
    if (solid.placement !== 'parts' && dimmed.has(shape.key)) group.alpha = DIMMED_ALPHA;
    container.addChild(group);
  }
  return {
    container,
    destroy() {
      if (!container.destroyed) container.destroy({ children: true });
      for (const texture of textures) texture.destroy(true);
    },
  };
}
