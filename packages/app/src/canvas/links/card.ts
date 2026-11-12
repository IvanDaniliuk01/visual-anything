/**
 * How a link card is drawn (ADR 0098, stage 3), from its data alone, alike on the canvas, in the SVG
 * and the PDF: a card in the theme's card colors; its picture, when it has one, in a band across its
 * top, whole and centered, at most as tall as the card leaves after 72 units for its text; then its
 * title in bold, at most two lines; its description, at most three; and on its last line its
 * address's host in the link color, where a click opens it.
 *
 * Its lines are laid out as the exports lay out text (`layOutText`), in Roboto's widths, so that the
 * canvas and the exports break them in the same places. A card smaller than it was added draws its
 * text smaller, down to half.
 */
import type { MediaRef } from '@visual-anything/schema';
import { layOutText, type LaidOutText } from '../../export/text-layout';
import type { Rect } from '../geometry';
import type { LinkFace } from '../scene';

/** One text of a card, laid out. */
export interface CardText {
  role: 'title' | 'description' | 'host';
  text: LaidOutText;
  /** Its left edge. */
  x: number;
  size: number;
  bold: boolean;
}

/** A card laid out: its corners' radius, its picture's place, its texts, and its address line. */
export interface CardLayout {
  radius: number;
  /** Where its picture is drawn, whole, inside `band`; absent when it has none or no room for it. */
  picture?: Rect;
  /** The band across its top the picture sits in. */
  band?: Rect;
  texts: CardText[];
  /** Its last line, where its host is written: a click there opens the address. */
  address: Rect;
}

/** The colors a card is drawn in, by theme. */
export interface CardColors {
  fill: string;
  border: string;
  band: string;
  title: string;
  description: string;
  link: string;
}

export const CARD_COLORS: Readonly<Record<'light' | 'dark', CardColors>> = {
  light: {
    fill: '#ffffff',
    border: '#d4d4d8',
    band: '#f4f4f5',
    title: '#18181b',
    description: '#52525b',
    link: '#1d4ed8',
  },
  dark: {
    fill: '#27272a',
    border: '#52525b',
    band: '#18181b',
    title: '#fafafa',
    description: '#a1a1aa',
    link: '#93c5fd',
  },
};

/** The sizes a card is drawn at, at its full size. */
const SIZES = { pad: 12, title: 14, description: 12, host: 11, textRoom: 72, radius: 8 } as const;

/** The most lines its title and its description take. */
const TITLE_LINES = 2;
const DESCRIPTION_LINES = 3;

/** How a card is laid out in its rectangle. */
export function cardLayout(
  rect: Rect,
  link: LinkFace,
  picture: Pick<MediaRef, 'width' | 'height'> | undefined,
): CardLayout {
  const scale = Math.max(0.5, Math.min(1, rect.width / 240, rect.height / 112));
  const pad = SIZES.pad * scale;
  const inner = Math.max(1, rect.width - 2 * pad);
  let band: Rect | undefined;
  let shown: Rect | undefined;
  if (picture !== undefined) {
    const height = Math.min(
      rect.height - SIZES.textRoom * scale,
      (rect.width * picture.height) / Math.max(1, picture.width),
    );
    if (height >= 16) {
      band = { x: rect.x, y: rect.y, width: rect.width, height };
      const fit = Math.min(rect.width / picture.width, height / picture.height);
      const width = picture.width * fit;
      const tall = picture.height * fit;
      shown = {
        x: rect.x + (rect.width - width) / 2,
        y: rect.y + (height - tall) / 2,
        width,
        height: tall,
      };
    }
  }
  const x = rect.x + pad;
  const hostSize = SIZES.host * scale;
  const bottom = rect.y + rect.height - pad;
  const host = layOutText({
    text: link.host,
    size: hostSize,
    x,
    align: 'start',
    y: bottom,
    anchor: 'bottom',
    wrap: inner,
    room: hostSize * 1.25,
  });
  const hostTop = bottom - host.lines.length * host.lineHeight;
  const titleSize = SIZES.title * scale;
  const top = rect.y + (band?.height ?? 0) + pad;
  const title = layOutText({
    text: link.title,
    size: titleSize,
    bold: true,
    x,
    align: 'start',
    y: top,
    anchor: 'top',
    wrap: inner,
    room: Math.min(TITLE_LINES * titleSize * 1.25, hostTop - top - 2 * scale),
  });
  const texts: CardText[] = [{ role: 'title', text: title, x, size: titleSize, bold: true }];
  if (link.description !== undefined) {
    const size = SIZES.description * scale;
    const below = top + title.lines.length * title.lineHeight + 2 * scale;
    const description = layOutText({
      text: link.description,
      size,
      x,
      align: 'start',
      y: below,
      anchor: 'top',
      wrap: inner,
      room: Math.min(DESCRIPTION_LINES * size * 1.25, hostTop - below - 2 * scale),
    });
    if (description.lines.length > 0) {
      texts.push({ role: 'description', text: description, x, size, bold: false });
    }
  }
  texts.push({ role: 'host', text: host, x, size: hostSize, bold: false });
  const addressTop = Math.max(rect.y, hostTop - pad / 2);
  return {
    radius: Math.min(SIZES.radius * scale, rect.width / 4, rect.height / 4),
    ...(band === undefined ? {} : { band }),
    ...(shown === undefined ? {} : { picture: shown }),
    texts,
    address: {
      x: rect.x,
      y: addressTop,
      width: rect.width,
      height: rect.y + rect.height - addressTop,
    },
  };
}

/** Whether a point on the canvas is on a card's address line, where a click opens it. */
export function onAddressLine(layout: Pick<CardLayout, 'address'>, x: number, y: number): boolean {
  const { address } = layout;
  return (
    x >= address.x &&
    x <= address.x + address.width &&
    y >= address.y &&
    y <= address.y + address.height
  );
}
