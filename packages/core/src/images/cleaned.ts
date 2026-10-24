/**
 * The cleaned view of a stored image: the one view that every reader uses, from the canvas and layout
 * to previews and Claude's tools. An image read from disk with a description, comments or metadata
 * therefore never reaches anyone as stored, and one that cleaning refuses is absent everywhere.
 */
import type { BitmapImage, ImageDefinition } from '@visual-anything/schema';
import { decodeBase64, encodeBase64 } from './base64';
import { readBitmap } from './bitmap';
import { cleanSvg } from './svg';

declare const CLEANED: unique symbol;

/**
 * An image as cleaning gives it: its SVG text rebuilt, or its bitmap without metadata, with the size
 * its view box or its header gives. Only the core makes one, so a reader cannot be handed a stored
 * image by mistake.
 */
export type CleanedImage = ImageDefinition & { readonly [CLEANED]: true };

/** What cleaning gives for an image's content, whatever its id and name. */
interface Content {
  text: string;
  width: number;
  height: number;
}

/** Cleaned content by SVG text, and by bitmap format and data; `null` where cleaning refuses it. */
const svgCache = new Map<string, Content | null>();
const bitmapCache = new Map<BitmapImage['format'], Map<string, Content | null>>();
/** The cleaned view of each image object, so that a reader gets the same object each time. */
const byImage = new WeakMap<ImageDefinition, CleanedImage | null>();

/** The cleaned view of a stored image; `undefined` when cleaning refuses it. */
export function cleanedImage(image: ImageDefinition): CleanedImage | undefined {
  const known = byImage.get(image);
  if (known !== undefined) return known ?? undefined;
  const content =
    image.kind === 'svg' ? svgContent(image.svg) : bitmapContent(image.format, image.data);
  const cleaned =
    content === null
      ? null
      : ((image.kind === 'svg'
          ? { ...image, svg: content.text, width: content.width, height: content.height }
          : {
              ...image,
              data: content.text,
              width: content.width,
              height: content.height,
            }) as CleanedImage);
  byImage.set(image, cleaned);
  return cleaned ?? undefined;
}

/** Whether a stored image is exactly what cleaning gives for it. */
export function isClean(image: ImageDefinition): boolean {
  const cleaned = cleanedImage(image);
  if (!cleaned) return false;
  return cleaned.kind === 'svg' && image.kind === 'svg'
    ? cleaned.svg === image.svg && cleaned.width === image.width && cleaned.height === image.height
    : cleaned.kind === 'bitmap' && image.kind === 'bitmap'
      ? cleaned.data === image.data &&
        cleaned.width === image.width &&
        cleaned.height === image.height
      : false;
}

/** The text an image keeps its content in: its SVG text, or its bitmap's base64. */
export function imageText(image: ImageDefinition): string {
  return image.kind === 'svg' ? image.svg : image.data;
}

/**
 * Keeps in the cache only what the given images clean to, so that it holds what the open project
 * holds; a reload with equal content still finds it.
 */
export function pruneCleanedImages(images: Iterable<ImageDefinition>): void {
  const svgs = new Set<string>();
  const bitmaps = new Map<BitmapImage['format'], Set<string>>();
  for (const image of images) {
    if (image.kind === 'svg') svgs.add(image.svg);
    else {
      const set = bitmaps.get(image.format) ?? new Set<string>();
      set.add(image.data);
      bitmaps.set(image.format, set);
    }
  }
  for (const key of svgCache.keys()) if (!svgs.has(key)) svgCache.delete(key);
  for (const [format, cache] of bitmapCache) {
    const present = bitmaps.get(format);
    for (const key of cache.keys()) if (!present?.has(key)) cache.delete(key);
  }
}

/** How many contents the cache holds, for tests. */
export function cachedImageCount(): number {
  let count = svgCache.size;
  for (const cache of bitmapCache.values()) count += cache.size;
  return count;
}

function svgContent(text: string): Content | null {
  let content = svgCache.get(text);
  if (content === undefined) {
    const result = cleanSvg(text);
    content = result.ok
      ? { text: result.value.svg, width: result.value.width, height: result.value.height }
      : null;
    svgCache.set(text, content);
  }
  return content;
}

function bitmapContent(format: BitmapImage['format'], data: string): Content | null {
  let cache = bitmapCache.get(format);
  if (!cache) {
    cache = new Map();
    bitmapCache.set(format, cache);
  }
  let content = cache.get(data);
  if (content === undefined) {
    const bytes = decodeBase64(data);
    const result = bytes === undefined ? undefined : readBitmap(bytes, format);
    // Encoded again even when nothing was removed: a WebP file's flags and size may still be fixed.
    content = result?.ok
      ? {
          text: encodeBase64(result.value.bytes),
          width: result.value.width,
          height: result.value.height,
        }
      : null;
    cache.set(data, content);
  }
  return content;
}
