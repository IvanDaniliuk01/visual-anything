/**
 * Opening a link card's address (ADR 0098, stage 3): in a new tab of the browser, `noopener` and
 * `noreferrer`, after its address is checked again, so that a card never opens anything but an
 * `https:` or `http:` page, and the page it opens can reach neither the app nor its address. Nothing
 * of the page is embedded.
 */
import { checkLinkAddress } from '@visual-anything/core';
import type { Point } from '../geometry';
import type { PictureShape } from '../scene';
import { cardLayout, onAddressLine } from './card';

/** Opens an address in a new tab; false, opening nothing, when it is not one a card may hold. */
export function openLinkAddress(
  url: string,
  open: (url: string, target: string, features: string) => unknown = (...args) =>
    window.open(...args),
): boolean {
  const checked = checkLinkAddress(url);
  if (!checked.ok) return false;
  open(checked.url, '_blank', 'noopener,noreferrer');
  return true;
}

/** The address of a link card whose address line is at a point of the canvas; none elsewhere. */
export function addressAt(
  picture: Pick<PictureShape, 'rect' | 'link' | 'media'>,
  point: Point,
): string | undefined {
  if (picture.link === undefined) return undefined;
  const layout = cardLayout(picture.rect, picture.link, picture.media);
  return onAddressLine(layout, point.x, point.y) ? picture.link.url : undefined;
}
