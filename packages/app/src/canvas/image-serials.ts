/**
 * The serials of images' contents, apart from the texture store so that the scene, which the layout
 * worker loads too, can name a picture without loading PixiJS. Equal content has one serial across
 * reloads that bring new image objects, so that its textures and tiles are kept; changed content gets
 * a new one. Nothing hashes image text but once for each new image object. Solids' pictures, which the
 * solid worker draws, take serials from the same count (ADR 0075).
 */
import type { CleanedImage } from '@visual-anything/core';

const serialsByContent = new Map<string, number>();
const contentOfSerial = new Map<number, string>();
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
      contentOfSerial.set(serial, key);
    }
    serialsByImage.set(image, serial);
  }
  return serial;
}

const serialsOfSolidPictures = new Map<string, number>();

/**
 * The serial of a solid's picture in the image store (ADR 0075), by the key it is kept by: its
 * shape's `solidPictureKey` and its bucket. The same key has one serial for the session, as the
 * picture is kept for it, and no serial of a solid's picture is an image's.
 */
export function solidPictureSerial(kept: string): number {
  let serial = serialsOfSolidPictures.get(kept);
  if (serial === undefined) {
    serial = ++lastSerial;
    serialsOfSolidPictures.set(kept, serial);
  }
  return serial;
}

/** Forgets the serials of content the project no longer holds, as after a reload. */
export function pruneImageSerials(images: Iterable<CleanedImage>): void {
  const present = new Set<number>();
  for (const image of images) present.add(imageSerial(image));
  for (const [serial, key] of contentOfSerial) {
    if (present.has(serial)) continue;
    contentOfSerial.delete(serial);
    serialsByContent.delete(key);
  }
}
