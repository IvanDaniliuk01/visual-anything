/**
 * How an explorable's card is drawn in a rectangle (ADR 0107), from its data alone (`explorableCard`
 * in the core), alike in the SVG, the PDF and the command line's exports, and meant for the canvas's
 * card too: a card in the theme's card colors with a band of the accent down its left edge; its name
 * in bold, at most two lines; what it explains, at most three; the script libraries it asks for, at
 * most two; and at its foot, why it is not running. A card smaller than 240 by 140 units draws its
 * text smaller, down to half.
 *
 * Its lines are laid out as the exports lay out text (`layOutText`), in Roboto's widths, so that every
 * place that draws a card breaks its lines in the same places.
 */
import {
  EXPLORABLE_CARD_LIBRARIES,
  EXPLORABLE_CARD_WHY,
  type ExplorableCard,
} from '@visual-anything/core';
import { layOutText, type LaidOutText } from '../export/text-layout';
import type { Translator } from '../i18n';

/** A rectangle, in canvas units. */
export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a card says, in the language read in. */
export interface ExplorableCardTexts {
  name: string;
  description?: string;
  /** Its script libraries, as one line: none when it asks for none. */
  libraries?: string;
  why: string;
}

/** One text of a card, laid out. */
export interface ExplorableCardText {
  role: 'name' | 'description' | 'libraries' | 'why';
  text: LaidOutText;
  /** Its left edge. */
  x: number;
  size: number;
  bold: boolean;
}

/** A card laid out: its corners' radius, its accent band, and its texts. */
export interface ExplorableCardLayout {
  radius: number;
  band: CardRect;
  texts: ExplorableCardText[];
}

/** The colors a card is drawn in, by theme. */
export interface ExplorableCardColors {
  fill: string;
  border: string;
  band: string;
  name: string;
  text: string;
  why: string;
}

export const EXPLORABLE_CARD_COLORS: Readonly<Record<'light' | 'dark', ExplorableCardColors>> = {
  light: {
    fill: '#ffffff',
    border: '#d4d4d8',
    band: '#2f5fb3',
    name: '#18181b',
    text: '#52525b',
    why: '#3f3f46',
  },
  dark: {
    fill: '#27272a',
    border: '#52525b',
    band: '#8ab4f8',
    name: '#fafafa',
    text: '#a1a1aa',
    why: '#e4e4e7',
  },
};

/** What a card says, from its data, in the language read in. */
export function explorableCardTexts(t: Translator, card: ExplorableCard): ExplorableCardTexts {
  return {
    name: card.name,
    ...(card.description === undefined ? {} : { description: card.description }),
    ...(card.libraries.length === 0
      ? {}
      : { libraries: t(EXPLORABLE_CARD_LIBRARIES, { names: card.libraries.join(', ') }) }),
    why: t(EXPLORABLE_CARD_WHY[card.reason], { id: card.library ?? '' }),
  };
}

/** The sizes a card is drawn at, at its full size. */
const SIZES = { pad: 12, band: 4, name: 14, text: 12, small: 11, radius: 8 } as const;
const NAME_LINES = 2;
const DESCRIPTION_LINES = 3;
const LIBRARY_LINES = 2;
const WHY_LINES = 2;
const LINE = 1.25;

/** How a card is laid out in its rectangle. */
export function explorableCardLayout(
  rect: CardRect,
  texts: ExplorableCardTexts,
): ExplorableCardLayout {
  const scale = Math.max(0.5, Math.min(1, rect.width / 240, rect.height / 140));
  const pad = SIZES.pad * scale;
  const bandWidth = SIZES.band * scale;
  const x = rect.x + bandWidth + pad;
  const inner = Math.max(1, rect.x + rect.width - pad - x);
  const bottom = rect.y + rect.height - pad;
  const small = SIZES.small * scale;
  // Why it is not running sits at its foot, as the canvas's card says it.
  const why = layOutText({
    text: texts.why,
    size: small,
    x,
    align: 'start',
    y: bottom,
    anchor: 'bottom',
    wrap: inner,
    room: Math.min(WHY_LINES * small * LINE, rect.height - 2 * pad),
  });
  const whyTop = bottom - why.lines.length * why.lineHeight;
  const laid: ExplorableCardText[] = [];
  let top = rect.y + pad;
  const add = (
    role: ExplorableCardText['role'],
    text: string,
    size: number,
    lines: number,
    bold = false,
  ) => {
    const room = Math.min(lines * size * LINE, whyTop - top - 2 * scale);
    if (room <= 0) return;
    const block = layOutText({
      text,
      size,
      bold,
      x,
      align: 'start',
      y: top,
      anchor: 'top',
      wrap: inner,
      room,
    });
    if (block.lines.length === 0) return;
    laid.push({ role, text: block, x, size, bold });
    top += block.lines.length * block.lineHeight + 4 * scale;
  };
  add('name', texts.name, SIZES.name * scale, NAME_LINES, true);
  if (texts.description !== undefined) {
    add('description', texts.description, SIZES.text * scale, DESCRIPTION_LINES);
  }
  if (texts.libraries !== undefined) add('libraries', texts.libraries, small, LIBRARY_LINES);
  if (why.lines.length > 0) laid.push({ role: 'why', text: why, x, size: small, bold: false });
  const radius = Math.min(SIZES.radius * scale, rect.width / 4, rect.height / 4);
  return {
    radius,
    band: { x: rect.x, y: rect.y, width: Math.min(bandWidth, rect.width), height: rect.height },
    texts: laid,
  };
}
