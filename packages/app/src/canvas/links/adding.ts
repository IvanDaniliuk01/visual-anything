/**
 * Adding link cards and setting their previews (ADR 0098, stage 3): Link card… on the canvas toolbar
 * and text pasted on the canvas that is exactly one web address add a card at the middle of the view,
 * titled after its address's host; Fetch the preview sets what the page's preview found as one
 * undoable change.
 */
import {
  LINK_CARD_SIZE,
  checkLinkAddress,
  linkHost,
  linkPictureGrowth,
  type Command,
  type LinkPreview,
} from '@visual-anything/core';
import type { Id, LinkCard, MediaRef } from '@visual-anything/schema';
import type { Point } from '../geometry';

/**
 * The address a pasted text is, when it is exactly one `http:` or `https:` address and nothing else;
 * undefined for any other text, which is pasted as it would be.
 */
export function linkAddressIn(text: string): string | undefined {
  const given = text.trim();
  if (!/^https?:\/\/\S+$/i.test(given)) return undefined;
  const checked = checkLinkAddress(given);
  return checked.ok ? checked.url : undefined;
}

/** The command that adds a card for an address with its middle at a point, titled after its host. */
export function addLinkCardCommand(view: Id, url: string, at: Point): Command | undefined {
  const checked = checkLinkAddress(url);
  if (!checked.ok) return undefined;
  const { width, height } = LINK_CARD_SIZE;
  return {
    type: 'create-free-shape',
    view,
    shape: {
      kind: 'link',
      x: Math.round(at.x - width / 2),
      y: Math.round(at.y - height / 2),
      width,
      height,
      url: checked.url,
      title: linkHost(checked.url).slice(0, 300) || checked.url.slice(0, 300),
    },
  };
}

/**
 * How a card changes when it is given a picture: the picture, and, for a card that had none, a height
 * grown by the picture's height at its width, at most 240 units.
 */
export function pictureChanges(
  card: Pick<LinkCard, 'width' | 'height' | 'picture'>,
  picture: MediaRef,
): { picture: MediaRef; height?: number } {
  return card.picture === undefined
    ? { picture, height: card.height + linkPictureGrowth(card.width, picture) }
    : { picture };
}

/**
 * The command that sets what a page's preview found on its card, as one undoable change: its title
 * and description replace the card's, and its picture is set; undefined when it found nothing.
 */
export function previewCommand(
  view: Id,
  card: LinkCard,
  preview: LinkPreview,
): Command | undefined {
  const changes = {
    ...(preview.title === undefined ? {} : { title: preview.title }),
    ...(preview.description === undefined ? {} : { description: preview.description }),
    ...(preview.picture === undefined ? {} : pictureChanges(card, preview.picture)),
  };
  if (Object.keys(changes).length === 0) return undefined;
  return {
    type: 'batch',
    label: 'Fetch the preview of a link card',
    commands: [{ type: 'update-free-shape', view, id: card.id, changes }],
  };
}
