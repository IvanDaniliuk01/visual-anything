/**
 * An explorable's card (ADR 0107, A10.3), drawn from its data alone until its shape has a still: its
 * name in bold, at most two lines; its description, at most three; the script libraries it uses, on
 * one line; and at its foot why it is not running, or how to explore it. Laid out as the exports lay
 * out text (`layOutText`), in Roboto's widths, so that a later export breaks its lines where the
 * canvas does. A card smaller than 240 by 160 units writes smaller, down to half.
 */
import { layOutText, type LaidOutText } from '../../export/text-layout';
import type { Rect } from '../geometry';

/** What a card says of an explorable. */
export interface ExplorableFace {
  name: string;
  description?: string;
  /** Its script libraries, each as its npm package and version, or its id while undefined. */
  libraries: readonly string[];
  /** Why it is not running, or how to explore it: its card's last line. */
  why?: string;
  /** Whether stills may be taken of it: it is approved as it is, and nothing stopped it. */
  runs: boolean;
}

/** One text of a card, laid out. */
export interface ExplorableCardText {
  role: 'name' | 'description' | 'libraries' | 'why';
  text: LaidOutText;
  x: number;
  size: number;
  bold: boolean;
}

export interface ExplorableCardLayout {
  radius: number;
  /** The band across its top that marks it as an explorable. */
  band: Rect;
  texts: ExplorableCardText[];
}

/** The colors a card is drawn in, by theme. */
export interface ExplorableCardColors {
  fill: number;
  border: number;
  band: number;
  name: number;
  description: number;
  why: number;
}

export const EXPLORABLE_CARD_COLORS: Readonly<Record<'light' | 'dark', ExplorableCardColors>> = {
  light: {
    fill: 0xffffff,
    border: 0xd4d4d8,
    band: 0x6d28d9,
    name: 0x18181b,
    description: 0x52525b,
    why: 0x6d28d9,
  },
  dark: {
    fill: 0x27272a,
    border: 0x52525b,
    band: 0xa78bfa,
    name: 0xfafafa,
    description: 0xa1a1aa,
    why: 0xc4b5fd,
  },
};

const SIZES = { pad: 12, name: 14, description: 12, small: 11, band: 4, radius: 8 } as const;

/** How a card is laid out in its rectangle. */
export function explorableCardLayout(rect: Rect, face: ExplorableFace): ExplorableCardLayout {
  const scale = Math.max(0.5, Math.min(1, rect.width / 240, rect.height / 160));
  const pad = SIZES.pad * scale;
  const inner = Math.max(1, rect.width - 2 * pad);
  const x = rect.x + pad;
  const band = { x: rect.x, y: rect.y, width: rect.width, height: SIZES.band * scale };
  const bottom = rect.y + rect.height - pad;
  const texts: ExplorableCardText[] = [];
  const smallSize = SIZES.small * scale;
  let foot = bottom;
  if (face.why !== undefined && face.why !== '') {
    const why = layOutText({
      text: face.why,
      size: smallSize,
      x,
      align: 'start',
      y: bottom,
      anchor: 'bottom',
      wrap: inner,
      room: Math.min(2 * smallSize * 1.25, rect.height - 2 * pad),
    });
    if (why.lines.length > 0) {
      texts.push({ role: 'why', text: why, x, size: smallSize, bold: false });
      foot = bottom - why.lines.length * why.lineHeight - 4 * scale;
    }
  }
  const top = band.y + band.height + pad;
  const nameSize = SIZES.name * scale;
  const name = layOutText({
    text: face.name,
    size: nameSize,
    bold: true,
    x,
    align: 'start',
    y: top,
    anchor: 'top',
    wrap: inner,
    room: Math.min(2 * nameSize * 1.25, foot - top),
  });
  texts.unshift({ role: 'name', text: name, x, size: nameSize, bold: true });
  let below = top + name.lines.length * name.lineHeight + 2 * scale;
  if (face.description !== undefined && face.description.trim() !== '') {
    const size = SIZES.description * scale;
    const description = layOutText({
      text: face.description,
      size,
      x,
      align: 'start',
      y: below,
      anchor: 'top',
      wrap: inner,
      room: Math.min(3 * size * 1.25, foot - below),
    });
    if (description.lines.length > 0) {
      texts.splice(1, 0, { role: 'description', text: description, x, size, bold: false });
      below += description.lines.length * description.lineHeight + 2 * scale;
    }
  }
  if (face.libraries.length > 0) {
    const libraries = layOutText({
      text: face.libraries.join(', '),
      size: smallSize,
      x,
      align: 'start',
      y: below,
      anchor: 'top',
      wrap: inner,
      room: Math.min(smallSize * 1.25, foot - below),
    });
    if (libraries.lines.length > 0) {
      const at = texts.findIndex((each) => each.role === 'why');
      texts.splice(at < 0 ? texts.length : at, 0, {
        role: 'libraries',
        text: libraries,
        x,
        size: smallSize,
        bold: false,
      });
    }
  }
  return {
    radius: Math.min(SIZES.radius * scale, rect.width / 4, rect.height / 4),
    band,
    texts,
  };
}
