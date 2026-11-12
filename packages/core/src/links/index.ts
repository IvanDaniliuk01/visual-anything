/**
 * Link cards (ADR 0098, stage 3): free shapes that hold a web address, a title, a description and an
 * optional picture. Their addresses, the reader of a page's preview, and the live connection's
 * messages about fetching one.
 */
import type { LinkCard, MediaRef, ViewFile } from '@visual-anything/schema';

export * from './address';
export * from './messages';
export * from './preview';

/** The size of a card added without a picture, and the most a picture makes it grow. */
export const LINK_CARD_SIZE = Object.freeze({ width: 320, height: 112, pictureMost: 240 });

/** The link cards of a view, in its order. */
export function linkCardsOf(view: Pick<ViewFile, 'freeShapes'>): LinkCard[] {
  return view.freeShapes.filter((shape): shape is LinkCard => shape.kind === 'link');
}

/**
 * How much taller a card grows to show a picture it did not have: the picture's height at the
 * card's width, at most 240 units.
 */
export function linkPictureGrowth(
  width: number,
  picture: Pick<MediaRef, 'width' | 'height'>,
): number {
  return Math.min(
    LINK_CARD_SIZE.pictureMost,
    Math.round((width * picture.height) / Math.max(1, picture.width)),
  );
}
