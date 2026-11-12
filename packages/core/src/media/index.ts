/**
 * Media files (ADR 0098): what pictures show, kept beside the project as `media/<hash>.<extension>`.
 * The readers that clean them, the GIF reader that plays them, the video reader, and the live
 * connection's messages.
 */
import type { FreeShape, MediaRef, Picture, ViewFile } from '@visual-anything/schema';
import { MEDIA_CAPS, isVideoFormat } from './clean';

export * from './clean';
export * from './gif';
export * from './messages';
export * from './video';

/** The pictures of a view, in its order. */
export function picturesOf(view: Pick<ViewFile, 'freeShapes'>): Picture[] {
  return view.freeShapes.filter((shape): shape is Picture => shape.kind === 'picture');
}

/** The media files a picture names: its own, and a video's poster. */
export function mediaOf(picture: Pick<Picture, 'media' | 'poster'>): MediaRef[] {
  return picture.poster === undefined ? [picture.media] : [picture.media, picture.poster];
}

/**
 * The media files a free shape names: a picture's own and a video's poster, and a link card's
 * picture (ADR 0098, stage 3); none for any other.
 */
export function mediaOfFreeShape(shape: FreeShape): MediaRef[] {
  if (shape.kind === 'picture') return mediaOf(shape);
  if (shape.kind === 'link') return shape.picture === undefined ? [] : [shape.picture];
  return [];
}

/**
 * The hashes of the media files any free shape of these views names: pictures, a video's poster
 * included, and link cards' pictures.
 */
export function mediaNamedBy(views: readonly Pick<ViewFile, 'freeShapes'>[]): Set<string> {
  const named = new Set<string>();
  for (const view of views) {
    for (const shape of view.freeShapes) {
      for (const ref of mediaOfFreeShape(shape)) named.add(ref.hash);
    }
  }
  return named;
}

/** The most bytes of one media file a read-only page holds: 32 MiB (ADR 0098, stage 2). */
export const PAGE_MEDIA_BYTES = MEDIA_CAPS.bytes;

/**
 * The media files a read-only page of these views holds, by hash, in order: every image and poster,
 * link cards' pictures among them, and a video's file when it is at most 32 MiB; and the videos it leaves to their posters, which the
 * export says.
 */
export function pageMediaOf(views: readonly Pick<ViewFile, 'freeShapes'>[]): {
  hashes: string[];
  videosLeftOut: string[];
} {
  const held = new Set<string>();
  const left = new Set<string>();
  for (const view of views) {
    for (const shape of view.freeShapes) {
      for (const ref of mediaOfFreeShape(shape)) {
        if (isVideoFormat(ref.format) && ref.bytes > PAGE_MEDIA_BYTES) left.add(ref.hash);
        else held.add(ref.hash);
      }
    }
  }
  return {
    hashes: [...held].sort(),
    videosLeftOut: [...left].filter((hash) => !held.has(hash)).sort(),
  };
}

/** Whether a picture is a video: its file an MP4 or a WebM (ADR 0098, stage 2). */
export function isVideo(picture: Pick<Picture, 'media'>): boolean {
  return isVideoFormat(picture.media.format);
}

/**
 * The image a picture shows while still: its own file, or a video's poster; none for a video without
 * a poster, which is drawn as a dark box with a play mark.
 */
export function pictureStill(picture: Pick<Picture, 'media' | 'poster'>): MediaRef | undefined {
  return isVideoFormat(picture.media.format) ? picture.poster : picture.media;
}

/** What a picture is called: its name, or "Picture", or "Video" for a video. */
export function pictureName(
  picture: Pick<Picture, 'name'> & Partial<Pick<Picture, 'media'>>,
): string {
  return (
    picture.name ?? (picture.media && isVideoFormat(picture.media.format) ? 'Video' : 'Picture')
  );
}
