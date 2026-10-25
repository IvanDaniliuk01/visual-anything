/**
 * The serials of images' contents, apart from the texture store so that the scene, which the layout
 * worker loads too, can name a picture without loading PixiJS. Equal content has one serial across
 * reloads that bring new image objects, so that its textures and tiles are kept; changed content gets
 * a new one. Nothing hashes image text: a serial is looked up once per image object.
 */
import type { CleanedImage } from '@visual-anything/core';

const serialsByContent = new Map<string, number>();
const serialsByImage = new WeakMap<CleanedImage, number>();
let lastSerial = 0;

function contentKey(image: CleanedImage): string {
  return image.kind === 'svg' ? `svg:${image.svg}` : `${image.format}:${image.data}`;
}

/**
 * The serial of a cleaned image's content: equal content has one serial, across reloads that bring new
 * image objects, and changed content gets a new one. It is looked up once per image object.
 */
export function imageSerial(image: CleanedImage): number {
  let serial = serialsByImage.get(image);
  if (serial === undefined) {
    const key = contentKey(image);
    serial = serialsByContent.get(key);
    if (serial === undefined) {
      serial = ++lastSerial;
      serialsByContent.set(key, serial);
    }
    serialsByImage.set(image, serial);
  }
  return serial;
}

/** Forgets the serials of content the project no longer holds, as after a reload. */
export function pruneImageSerials(images: Iterable<CleanedImage>): void {
  const present = new Set<string>();
  for (const image of images) present.add(contentKey(image));
  for (const key of serialsByContent.keys()) if (!present.has(key)) serialsByContent.delete(key);
}
