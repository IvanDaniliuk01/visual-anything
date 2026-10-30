/**
 * Labels drawn from bitmap fonts: each glyph is drawn once into a shared texture, so that showing
 * thousands of names costs little more than showing one. Every font is drawn in white and tinted: a
 * shape's labels to the color that reads on its fill, a relation's name to the theme's text over a
 * back tinted to the canvas, so that a new theme or a new fill only tints labels again.
 */
import { BitmapFont, BitmapText, Cache, Container, Sprite, Texture } from 'pixi.js';
import type { CanvasTextOptions, TextStyleOptions } from 'pixi.js';
import { parseEmphasis, type EmphasisRun } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { FONT_FAMILY, fitText, noteTextPlace, type LabelKind, type TextFactory } from './draw';
import { emphasisLabel, glyphMeasure, noteLabel } from './emphasisLabels';
import { robotoMeasure } from './textBlock';
import { RELATION_LABEL_HALO, RELATION_LABEL_TEXT } from './colors';

const FONTS: Record<LabelKind, string> = {
  name: 'visual-anything-name',
  detail: 'visual-anything-detail',
  relation: 'visual-anything-relation',
};

/**
 * Printable ASCII, the letters and signs Spanish and English text use most, and the × an aggregated
 * relation's count is written with; others are added when met.
 */
const CHARACTERS: (string | string[])[] = [[' ', '~'], 'áéíóúüñÁÉÍÓÚÜÑ¿¡…—–→·“”‘’×'];

/** The keys PixiJS keeps the installed fonts under in its cache. */
const CACHED = Object.values(FONTS).map((name) => `${name}-bitmap`);

/** How far a relation's name's back reaches past its text, across and down, in canvas units. */
const BACK_PADDING = { x: 3, y: 1 };

/**
 * Draws the glyphs of the label fonts, which takes a moment the first time; done ahead of need. Each
 * font is installed only while PixiJS's cache lacks it: a renderer started again finds the fonts an
 * earlier one installed, and so does this module loaded again by a hot reload, as PixiJS is not.
 */
export function installFonts(): void {
  if (CACHED.every((key) => Cache.has(key))) return;
  // Drawn at twice the screen's density or more, so that names stay sharp when zoomed in.
  const resolution = Math.min(4, Math.max(2, (globalThis.devicePixelRatio || 1) * 2));
  const common = { chars: CHARACTERS, resolution, padding: 4 };
  installOnce({
    name: FONTS.name,
    style: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '600', fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.detail,
    style: { fontFamily: FONT_FAMILY, fontSize: 11, fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.relation,
    style: { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#ffffff' },
    ...common,
  });
}

/** Installs a font unless PixiJS's cache already holds it. */
function installOnce(options: Parameters<typeof BitmapFont.install>[0] & { name: string }): void {
  if (Cache.has(`${options.name}-bitmap`)) return;
  BitmapFont.install(options);
}

/**
 * A relation's name: its text over a back that covers the line and whatever else is under it, both
 * white and tinted, so that a theme switch only tints them again.
 */
export class RelationLabel extends Container {
  constructor(
    readonly back: Sprite,
    readonly text: Container,
  ) {
    super({ children: [back, text] });
  }

  /** Tints the text and its back. */
  paint(text: Color, back: Color): void {
    this.text.tint = text;
    this.back.tint = back;
  }
}

/**
 * Makes a label from a bitmap font, laid out as `draw.ts` lays out its text, and fitted in the room
 * its shape gives it: shortened with "…" when too tall, or left out when even that does not fit. A
 * relation's name takes its fill as its text's tint, and its stroke's color as its back's.
 */
export const bitmapText: TextFactory = (options, kind, room, runs) => {
  installFonts();
  const style: TextStyleOptions = options.style ?? {};
  if (runs && kind === 'detail') return detailWithEmphasis(options, style, room, runs);
  const text = new BitmapText({
    text: options.text,
    ...(options.anchor === undefined ? {} : { anchor: options.anchor }),
    ...(options.x === undefined ? {} : { x: options.x }),
    ...(options.y === undefined ? {} : { y: options.y }),
    style: {
      fontFamily: FONTS[kind],
      ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
      ...(style.align === undefined ? {} : { align: style.align }),
      ...(style.wordWrap === undefined ? {} : { wordWrap: style.wordWrap }),
      ...(style.wordWrapWidth === undefined ? {} : { wordWrapWidth: style.wordWrapWidth }),
      ...(style.breakWords === undefined ? {} : { breakWords: style.breakWords }),
    },
  });
  if (kind !== 'relation') {
    if (typeof style.fill === 'string') text.tint = style.fill;
    return fitText(text, room);
  }
  return relationLabel(text, style);
};
bitmapText.measure = glyphMeasure;
bitmapText.measureName = nameMeasure;
bitmapText.note = (note, color) =>
  noteLabel(note.text, () => parseEmphasis(note.text, { blocks: true }), {
    ...noteTextPlace(note),
    fill: color,
  });

/** A detail with text emphasis (ADR 0082), laid out and placed as its bitmap text would be. */
function detailWithEmphasis(
  options: CanvasTextOptions,
  style: TextStyleOptions,
  room: number | undefined,
  runs: readonly EmphasisRun[],
): Container | undefined {
  const { anchor } = options;
  const at =
    anchor === undefined
      ? { x: 0, y: 0 }
      : typeof anchor === 'number'
        ? { x: anchor, y: anchor }
        : { x: anchor.x ?? 0, y: anchor.y ?? 0 };
  return emphasisLabel(runs, {
    x: options.x ?? 0,
    y: options.y ?? 0,
    anchor: at,
    size: typeof style.fontSize === 'number' ? style.fontSize : 11,
    width: style.wordWrapWidth ?? 100,
    align: style.align === 'center' ? 'center' : 'left',
    room,
    fill: typeof style.fill === 'string' ? style.fill : '#000000',
  });
}

/** How wide a name is in the name's own font, once installed; in Roboto's widths until then. */
function nameMeasure(text: string): number {
  const font = Cache.has(CACHED[0])
    ? Cache.get<{
        chars?: BitmapFont['chars'];
        fontMetrics?: { fontSize: number };
        ensureCharacters?: (chars: string) => void;
      }>(CACHED[0])
    : undefined;
  const chars = font?.chars;
  const drawn = font?.fontMetrics?.fontSize;
  if (!chars || !drawn) return robotoMeasure(text, 'bold', 14);
  font.ensureCharacters?.(text);
  let width = 0;
  for (const character of text) width += chars[character]?.xAdvance ?? 0;
  return (width * 14) / drawn;
}

/** A relation's name over its back, both centered where the text was placed. */
function relationLabel(text: BitmapText, style: TextStyleOptions): RelationLabel {
  const back = new Sprite(Texture.WHITE);
  const { x, y } = text.position;
  text.anchor.set(0.5);
  text.position.set(0, 0);
  back.anchor.set(0.5);
  back.width = text.width + 2 * BACK_PADDING.x;
  back.height = text.height + 2 * BACK_PADDING.y;
  const label = new RelationLabel(back, text);
  label.position.set(x, y);
  label.paint(
    typeof style.fill === 'string' ? style.fill : RELATION_LABEL_TEXT,
    strokeColorOf(style) ?? RELATION_LABEL_HALO,
  );
  return label;
}

function strokeColorOf(style: TextStyleOptions): string | undefined {
  const { stroke } = style;
  if (typeof stroke !== 'object' || stroke === null || !('color' in stroke)) return undefined;
  return typeof stroke.color === 'string' ? stroke.color : undefined;
}
