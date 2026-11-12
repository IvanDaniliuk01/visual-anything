/**
 * An explorable's card, laid out in a rectangle (ADR 0107): one layout from its data alone
 * (`explorableCard` in the core), which the canvas, the read-only page's canvas, the SVG, the PDF
 * and the command line's exports all draw, so that every place draws the same card. A band in the
 * explorable color across its top; its name in bold, at most two lines; what it explains, at most
 * three, its Math typeset and its emphasis drawn as a note's are (ADR 0106, ADR 0082); the script
 * libraries it asks for, at most two; and at its foot why it is not running, or how to explore it.
 * A card smaller than 240 by 160 units writes smaller, down to half.
 *
 * Its lines are laid out as the exports lay out text (`layOutText`, and `layOutRuns` in Roboto's
 * widths for a description that draws differently), so that every place breaks them alike.
 */
import {
  EXPLORABLE_CARD_LIBRARIES,
  emphasisRuns,
  type ExplorableCard,
} from '@visual-anything/core';
import { robotoMeasure } from '../canvas/textBlock';
import { layOutText, type LaidOutText } from '../export/text-layout';
import type { Translator } from '../i18n';
import { drawsDifferently } from '../text/drawn';
import { layOutRuns, type LaidText } from '../text/layout';
import { reasonText } from './reasons';

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
  /** What it explains, as written: its emphasis and Math are drawn. */
  description?: string;
  /** Its script libraries, as one text: none when it asks for none. */
  libraries?: string;
  /** Why it is not running, or how to explore it: its last line. */
  why?: string;
}

/**
 * What the canvas draws of an explorable: its card's texts, whether stills of it may be taken (it is
 * approved as it is, and nothing stopped it), and the approval hash they are taken under.
 */
export interface ExplorableFace extends ExplorableCardTexts {
  runs: boolean;
  hash?: string;
}

/** One text of a card, laid out. */
export interface ExplorableCardText {
  role: 'name' | 'description' | 'libraries' | 'why';
  /** Its lines; none for a description drawn from `rich`. */
  text: LaidOutText;
  /** Its left edge. */
  x: number;
  size: number;
  bold: boolean;
  /**
   * A description with emphasis or Math, laid out as a detail is (`layOutRuns`), drawn in place of
   * `text`'s lines with its first line's top at `y`.
   */
  rich?: { laid: LaidText; y: number };
}

/** A card laid out: its corners' radius, its band, and its texts in order down the card. */
export interface ExplorableCardLayout {
  radius: number;
  /** The band across its top that marks it as an explorable. */
  band: CardRect;
  texts: ExplorableCardText[];
}

/** The colors a card is drawn in, by theme, as numbers, which the canvas tints with. */
export interface ExplorableCardColors {
  fill: number;
  border: number;
  band: number;
  name: number;
  /** Its description and its script libraries. */
  text: number;
  why: number;
}

export const EXPLORABLE_CARD_COLORS: Readonly<Record<'light' | 'dark', ExplorableCardColors>> = {
  light: {
    fill: 0xffffff,
    border: 0xd4d4d8,
    band: 0x6d28d9,
    name: 0x18181b,
    text: 0x52525b,
    why: 0x6d28d9,
  },
  dark: {
    fill: 0x27272a,
    border: 0x52525b,
    band: 0xa78bfa,
    name: 0xfafafa,
    text: 0xa1a1aa,
    why: 0xc4b5fd,
  },
};

/** A card's color as CSS writes it, for the SVG. */
export function cardColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** The color a text of a card is drawn in. */
export function cardTextColor(
  colors: ExplorableCardColors,
  role: ExplorableCardText['role'],
): number {
  return role === 'name' ? colors.name : role === 'why' ? colors.why : colors.text;
}

/** What a card says, from its data, in the language read in. */
export function explorableCardTexts(t: Translator, card: ExplorableCard): ExplorableCardTexts {
  return {
    name: card.name,
    ...(card.description === undefined ? {} : { description: card.description }),
    ...(card.libraries.length === 0
      ? {}
      : { libraries: t(EXPLORABLE_CARD_LIBRARIES, { names: card.libraries.join(', ') }) }),
    why: reasonText(t, card.reason, card.library),
  };
}

/** The sizes a card is drawn at, at its full size. */
const SIZES = { pad: 12, band: 4, name: 14, description: 12, small: 11, radius: 8 } as const;
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
  const scale = Math.max(0.5, Math.min(1, rect.width / 240, rect.height / 160));
  const pad = SIZES.pad * scale;
  const inner = Math.max(1, rect.width - 2 * pad);
  const x = rect.x + pad;
  const band = { x: rect.x, y: rect.y, width: rect.width, height: SIZES.band * scale };
  const bottom = rect.y + rect.height - pad;
  const small = SIZES.small * scale;
  const laid: ExplorableCardText[] = [];
  // Why it is not running sits at its foot; what is above it stops short of it.
  let foot = bottom;
  let why: ExplorableCardText | undefined;
  if (texts.why !== undefined && texts.why !== '') {
    const block = layOutText({
      text: texts.why,
      size: small,
      x,
      align: 'start',
      y: bottom,
      anchor: 'bottom',
      wrap: inner,
      room: Math.min(WHY_LINES * small * LINE, rect.height - 2 * pad),
    });
    if (block.lines.length > 0) {
      why = { role: 'why', text: block, x, size: small, bold: false };
      foot = bottom - block.lines.length * block.lineHeight - 4 * scale;
    }
  }
  let top = band.y + band.height + pad;
  const add = (
    role: ExplorableCardText['role'],
    text: string,
    size: number,
    lines: number,
    bold = false,
  ) => {
    const room = Math.min(lines * size * LINE, foot - top);
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
    top += block.lines.length * block.lineHeight + 2 * scale;
  };
  add('name', texts.name, SIZES.name * scale, NAME_LINES, true);
  const description = texts.description;
  if (description !== undefined && description.trim() !== '') {
    const size = SIZES.description * scale;
    if (drawsDifferently(description, false)) {
      // Its Math typeset and its emphasis drawn, as a shape's detail is (ADR 0106).
      const room = foot - top;
      const rich =
        room > 0
          ? layOutRuns(emphasisRuns(description), {
              measure: robotoMeasure,
              size,
              width: inner,
              align: 'left',
              maxLines: DESCRIPTION_LINES,
              maxHeight: room,
            })
          : undefined;
      if (rich && rich.lines.length > 0) {
        laid.push({
          role: 'description',
          text: { lines: [], lineHeight: size * LINE },
          x,
          size,
          bold: false,
          rich: { laid: rich, y: top },
        });
        top += rich.height + 2 * scale;
      }
    } else {
      add('description', description, size, DESCRIPTION_LINES);
    }
  }
  if (texts.libraries !== undefined) add('libraries', texts.libraries, small, LIBRARY_LINES);
  if (why) laid.push(why);
  return {
    radius: Math.min(SIZES.radius * scale, rect.width / 4, rect.height / 4),
    band,
    texts: laid,
  };
}
