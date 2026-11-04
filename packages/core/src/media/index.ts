/**
 * Media files (ADR 0098): what pictures show, kept beside the project as `media/<hash>.<extension>`.
 * The readers that clean them, the GIF reader that plays them, and the live connection's messages.
 */
import type { Picture, ViewFile } from '@visual-anything/schema';

export * from './clean';
export * from './gif';
export * from './messages';

/** The pictures of a view, in its order. */
export function picturesOf(view: Pick<ViewFile, 'freeShapes'>): Picture[] {
  return view.freeShapes.filter((shape): shape is Picture => shape.kind === 'picture');
}

/** The hashes of the media files any picture of these views names. */
export function mediaNamedBy(views: readonly Pick<ViewFile, 'freeShapes'>[]): Set<string> {
  const named = new Set<string>();
  for (const view of views) for (const picture of picturesOf(view)) named.add(picture.media.hash);
  return named;
}

/** What a picture is called: its name, or "Picture". */
export function pictureName(picture: Pick<Picture, 'name'>): string {
  return picture.name ?? 'Picture';
}
