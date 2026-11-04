/**
 * Adding pictures (ADR 0098): the image files a drop, a paste or Picture… gives, sent to the program to
 * be cleaned and kept, then placed as pictures. A file is kept before any shape names it.
 */
import { MEDIA_CAPS, pictureSize, type Command } from '@visual-anything/core';
import type { Id, MediaRef } from '@visual-anything/schema';
import type { Point } from '../geometry';

/** The types a picture's file may have, as the browser names them. */
const PICTURE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const PICTURE_NAMES = /\.(png|jpe?g|webp|gif|svg)$/i;

/** The files of a drop, a paste or a choice that may be pictures, in order. */
export function pictureFilesIn(files: Iterable<File> | null | undefined): File[] {
  return [...(files ?? [])].filter(
    (file) => PICTURE_TYPES.has(file.type) || PICTURE_NAMES.test(file.name),
  );
}

/** Whether a drag carries files, so that the canvas takes the drop. */
export function carriesFiles(types: readonly string[] | DOMStringList | undefined): boolean {
  return types !== undefined && [...(types as Iterable<string>)].includes('Files');
}

/**
 * A picture's name from its file's: its name without the extension, so that screen readers and the
 * outline say something of it; none for a pasted picture, whose file the browser names "image.png".
 */
export function pictureNameOf(fileName: string, pasted: boolean): string | undefined {
  if (pasted) return undefined;
  const name = fileName
    .replace(/\.[^.]+$/, '')
    .trim()
    .slice(0, 200);
  return name === '' ? undefined : name;
}

/** Why a file cannot be sent, before it is read: past 32 MiB. */
export function tooLargeToSend(file: File): boolean {
  return file.size > MEDIA_CAPS.bytes;
}

/**
 * The command that places a picture of a kept file with its middle at a point: its own size scaled to
 * fit 480 units, and up to 32, rounded to whole units.
 */
export function addPictureCommand(
  view: Id,
  media: MediaRef,
  at: Point,
  name: string | undefined,
): Command {
  const { width, height } = pictureSize(media);
  return {
    type: 'create-free-shape',
    view,
    shape: {
      kind: 'picture',
      x: Math.round(at.x - width / 2),
      y: Math.round(at.y - height / 2),
      width,
      height,
      media,
      ...(name === undefined ? {} : { name }),
    },
  };
}
