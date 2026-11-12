/**
 * Adding pictures (ADR 0098): the image and video files a drop, a paste or Picture… gives, sent to the
 * program to be cleaned and kept, then placed as pictures. A file is kept before any shape names it,
 * and a video's poster too (stage 2).
 */
import {
  MEDIA_CAPS,
  VIDEO_CAPS,
  pictureSize,
  type Command,
  type MediaStoredMessage,
} from '@visual-anything/core';
import type { Id, MediaRef } from '@visual-anything/schema';
import type { LiveResult } from '../../live/connection';
import type { Point } from '../geometry';
import { makePoster, posterFileName } from './poster';

/** The types a picture's file may have, as the browser names them. */
const PICTURE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const PICTURE_NAMES = /\.(png|jpe?g|webp|gif|svg)$/i;

/** The types and names a video's file may have (ADR 0098, stage 2). */
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const VIDEO_NAMES = /\.(mp4|m4v|webm)$/i;

/** Whether a file is a video's, by its type or its name. */
export function isVideoFile(file: Pick<File, 'type' | 'name'>): boolean {
  return VIDEO_TYPES.has(file.type) || VIDEO_NAMES.test(file.name);
}

/** The files of a drop, a paste or a choice that may be pictures or videos, in order. */
export function pictureFilesIn(files: Iterable<File> | null | undefined): File[] {
  return [...(files ?? [])].filter(
    (file) => PICTURE_TYPES.has(file.type) || PICTURE_NAMES.test(file.name) || isVideoFile(file),
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

/** Why a file cannot be sent, before it is read: an image past 32 MiB, a video past 50 MiB. */
export function tooLargeToSend(file: Pick<File, 'type' | 'name' | 'size'>): boolean {
  return file.size > (isVideoFile(file) ? VIDEO_CAPS.bytes : MEDIA_CAPS.bytes);
}

/** Whether a video is large enough to say that it joins the project's git history: past 25 MiB. */
export function largeVideo(file: Pick<File, 'type' | 'name' | 'size'>): boolean {
  return isVideoFile(file) && file.size > VIDEO_CAPS.warning;
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
  poster?: MediaRef,
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
      ...(poster === undefined ? {} : { poster }),
      ...(name === undefined ? {} : { name }),
    },
  };
}

/**
 * Makes a video's poster from its file and has the program keep it (ADR 0098, stage 2): its
 * reference, or `undefined` when the browser shows no frame of it or the program refuses the poster.
 */
export async function keepPoster(
  video: File,
  put: (fileName: string, bytes: Uint8Array) => Promise<LiveResult<MediaStoredMessage>>,
  make: (video: Blob) => Promise<Uint8Array | undefined> = makePoster,
): Promise<MediaRef | undefined> {
  const bytes = await make(video);
  if (bytes === undefined) return undefined;
  const kept = await put(posterFileName(video.name), bytes);
  return kept.ok ? kept.answer.media : undefined;
}
