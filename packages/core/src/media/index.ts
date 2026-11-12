/**
 * Media files (ADR 0098): what pictures show, kept beside the project as `media/<hash>.<extension>`.
 * The readers that clean them, the GIF reader that plays them, the video reader, and the live
 * connection's messages.
 */
import type { MediaRef, Picture, ViewFile } from '@visual-anything/schema';
import { isVideoFormat } from './clean';

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

/** The hashes of the media files any picture of these views names, a video's poster included. */
export function mediaNamedBy(views: readonly Pick<ViewFile, 'freeShapes'>[]): Set<string> {
  const named = new Set<string>();
  for (const view of views) {
    for (const picture of picturesOf(view)) for (const ref of mediaOf(picture)) named.add(ref.hash);
  }
  return named;
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
