/**
 * Labels drawn from bitmap fonts: each glyph is drawn once into a shared texture, so that showing
 * thousands of names costs little more than showing one. The fonts are drawn in Roboto once it is
 * loaded from the app's own bytes (`robotoFonts.ts`, ADR 0083), and texts are measured in the core's
 * tables of it. Every font is drawn in white and tinted: a
 * shape's labels to the color that reads on its fill, a relation's name to the theme's text over a
 * back tinted to the canvas, so that a new theme or a new fill only tints labels again.
 *
 * Each kind of label has its font, drawn once at one size and scaled to the size a label asks for.
 * Names are drawn in Roboto Bold (700), the weight the drawing defaults name unless they say
 * otherwise; a label in another weight the canvas loads (400 or 500), or in the system's fonts alone,
 * takes a font of its own, installed the first time one is written (ADR 0086). No weight that is not
 * loaded is ever asked for.
 */
import { BitmapFont, BitmapText, Cache, Container, Sprite, Texture } from 'pixi.js';
import type { CanvasTextOptions, TextStyleOptions } from 'pixi.js';
import { parseEmphasis, type EmphasisRun } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { FONT_FAMILY, fitText, noteTextPlace, type LabelKind, type TextFactory } from './draw';
import { ROBOTO, ROBOTO_MONO } from './robotoFonts';
import { RELATION_LABEL_BACK } from './drawing';
import { emphasisLabel, noteLabel } from './emphasisLabels';
import { canvasMeasure } from './textBlock';
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

/** The weight each kind's own font is drawn in. */
const WEIGHTS: Record<LabelKind, '400' | '700'> = { name: '700', detail: '400', relation: '400' };
/** The size each kind's own font is drawn at. */
const SIZES: Record<LabelKind, number> = { name: 14, detail: 11, relation: 12 };

/** How far a relation's name's back reaches past its text, across and down, in canvas units. */
const BACK_PADDING = RELATION_LABEL_BACK;

/**
 * Draws the glyphs of the label fonts, which takes a moment the first time; done ahead of need. Each
 * font is installed only while PixiJS's cache lacks it: a renderer started again finds the fonts an
 * earlier one installed, and so does this module loaded again by a hot reload, as PixiJS is not.
 */
export function installFonts(): void {
  if (CACHED.every((key) => Cache.has(key))) return;
  const common = commonOptions();
  installOnce({
    name: FONTS.name,
    style: { fontFamily: FONT_FAMILY, fontSize: SIZES.name, fontWeight: '700', fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.detail,
    style: { fontFamily: FONT_FAMILY, fontSize: SIZES.detail, fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.relation,
    style: { fontFamily: FONT_FAMILY, fontSize: SIZES.relation, fill: '#ffffff' },
    ...common,
  });
}

/**
 * The resolution and glyphs every label font is drawn with: at twice the screen's density or more,
 * so that names stay sharp when zoomed in.
 */
function commonOptions() {
  const resolution = Math.min(4, Math.max(2, (globalThis.devicePixelRatio || 1) * 2));
  return { chars: CHARACTERS, resolution, padding: 4 };
}

/**
 * The font a label of this kind is written in, for the weight and the fonts its style asks for: the
 * kind's own, or one installed for them the first time it is asked for. A weight the canvas does not
 * load is drawn as the nearest it does, as the browser would: 600 and above as 700, 500 as 500, below
 * as 400; a style that names none, or the normal weight, takes the kind's own font.
 */
export function labelFontOf(kind: LabelKind, style: TextStyleOptions): string {
  const weight = loadedWeight(style.fontWeight, WEIGHTS[kind]);
  const families = Array.isArray(style.fontFamily) ? style.fontFamily : [style.fontFamily];
  const first = families[0];
  const other = first !== undefined && first !== ROBOTO;
  if (weight === WEIGHTS[kind] && !other) return FONTS[kind];
  // Roboto Mono, as a table's rows write a column's type in (A5.1), or the system's fonts alone.
  const family = !other ? '' : first === ROBOTO_MONO ? '-mono' : '-system';
  const name = `${FONTS[kind]}-${weight}${family}`;
  installOnce({
    name,
    style: {
      fontFamily: other ? (families as string[]) : FONT_FAMILY,
      fontSize: SIZES[kind],
      fontWeight: weight,
      fill: '#ffffff',
    },
    ...commonOptions(),
  });
  return name;
}

/** One of the weights the canvas loads, for the weight a style asks for. */
function loadedWeight(
  asked: TextStyleOptions['fontWeight'],
  fallback: '400' | '700',
): '400' | '500' | '700' {
  // A label that names no weight of its own, or the normal one, is its kind's.
  if (asked === undefined || asked === 'normal') return fallback;
  if (asked === 'bold' || asked === 'bolder') return '700';
  if (asked === 'lighter') return '400';
  const weight = Number(asked);
  if (!Number.isFinite(weight)) return fallback;
  return weight >= 600 ? '700' : weight >= 500 ? '500' : '400';
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
      fontFamily: labelFontOf(kind, style),
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
// Measured in Roboto's widths in the core, the fonts the labels are drawn in (ADR 0083); a name
// in the weight and at the size the drawing defaults write it (`textBlock.ts`).
bitmapText.measure = canvasMeasure;
bitmapText.note = (note, color, drawing) =>
  noteLabel(note.text, () => parseEmphasis(note.text, { blocks: true }), {
    ...noteTextPlace(note, drawing),
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
