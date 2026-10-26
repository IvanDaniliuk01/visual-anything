/**
 * What the canvas draws for anchored parts (ADR 0067). An anchored part is its drawing's picture,
 * which the drawing's tile draws whole, once; its own shape draws nothing in the tiles. This layer
 * draws, above the element shapes and under the relations, as package code's drawings are drawn:
 *
 * - **Where the picture shows**, what changes how a part looks, over its outline:
 *   - a part a filter hides is covered with its drawing's fill, opaque;
 *   - a part drawn faintly in a drawing at full strength gets a veil of the drawing's fill;
 *   - a part at full strength in a faint drawing is drawn with its own picture (`partPicture`),
 *     through the image store, filled in its main color until that picture is ready;
 *   - an overlay's fill fills the outline, its opacity lays a veil of the drawing's fill over it, and
 *     its stroke strokes the outline;
 *   - an overlay's badge is written at the part's label point, under its name when the part writes
 *     its name there, from the scale names are written at;
 *   - the name of a part an overlay fills or drawn with its own picture is written again over them,
 *     where the tiles write it under them, so that what changes how a part looks never hides its
 *     name.
 * - **At the middle levels**, where the drawing is drawn in full but its picture does not show (a
 *   level of detail without images, or names written below the scale pictures show from), each part
 *   is its outline filled in its main color, or in its overlay's fill, faint as it is, with its name
 *   written over it.
 * - **Far out**, where the drawing is a plain block, the tiles draw each part as its simplified outline
 *   in its main color (`draw.ts`), and this layer draws nothing.
 *
 * Anchored parts take their drawing's levels of detail (ADR 0055), so the drawing says where its
 * picture shows. Work is done when the scene, the emphasis or the theme changes, never each frame,
 * but for the parts' own pictures while they are made.
 */
import {
  CANVAS_BACKGROUNDS,
  fadedColor,
  flattenOutline,
  partPicture,
  simplifyOutline,
  type CleanedImage,
  type ThemeName,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { Container, Graphics, type Texture } from 'pixi.js';
import { DIMMED_ALPHA, readableTextColors } from './colors';
import { FONT_FAMILY, partNameText, type TextFactory } from './draw';
import type { Rect } from './geometry';
import type { ImageRequest, ImageStore } from './images';
import type { ImageView } from './images-draw';
import { levelDetail } from './levels';
import { PART_NAME_LINE, labelAreaOn, partNameLines } from './outlined';
import type { PlacedOutline } from './outlines';
import {
  BADGE_HALO,
  BADGE_SIZE,
  OVERLAY_STROKE,
  holesByFill,
  partMarksOf,
  type DrawingMarks,
  type PartMark,
} from './partMarks';
import type { ElementShape, Scene } from './scene';
import { IMAGE_SCALES } from './shape-images';
import { shapeColors } from './theme/paint';

// What is drawn over parts is worked out apart from PixiJS, so that the exports draw it too.
export { partMarksOf, type DrawingMarks, type PartMark } from './partMarks';

/** The name the image store knows the parts' own pictures by. */
export const PARTS_PICTURES = 'anchored-parts';

/** The scale badges are written from, as names are (`NAMES_FROM`). */
const BADGES_FROM = 0.45;

/**
 * How a drawing with parts is drawn at a scale, as its levels of detail say: as a plain block, far
 * out, where the tiles draw its parts; or in full, with its picture showing or not.
 */
export function pictureShows(
  drawing: ElementShape,
  scale: number,
  levelAt?: number,
): { shows: boolean; coarse: boolean; at?: number } {
  const { levels } = drawing;
  // The canvas's own steps: plain blocks below the scale pictures show from.
  if (levels === undefined || levels.length === 0) {
    const coarse = scale < IMAGE_SCALES.drawingsFrom;
    return { shows: !coarse, coarse };
  }
  const { at, detail } = levelDetail(levels, scale, levelAt, false);
  return {
    shows: detail.images && !detail.coarse && scale >= IMAGE_SCALES.drawingsFrom,
    coarse: detail.coarse,
    at,
  };
}

/** The colors veils and covers are drawn in: the drawing's fill, and what is behind the drawing. */
function backdropOf(marks: DrawingMarks, theme: ThemeName): { fill: Color; behind: Color } {
  return {
    fill: shapeColors(marks.drawing, theme).fill,
    behind: marks.holder ? shapeColors(marks.holder, theme).fill : CANVAS_BACKGROUNDS[theme],
  };
}

/**
 * Draws what changes how a drawing's parts look where its picture shows: covers, veils and an
 * overlay's fills and strokes, in its picture's order. The parts' own pictures go in `pictures`,
 * under these, drawn by `picture`, which says whether it drew one.
 */
export function drawPartMarks(
  graphics: Graphics,
  marks: DrawingMarks,
  theme: ThemeName,
  picture: (mark: PartMark) => boolean = () => false,
  pictures: Graphics = graphics,
): void {
  const { fill, behind } = backdropOf(marks, theme);
  // A faint drawing is its fill at the faint alpha over what is behind it.
  const coverColor = marks.faint ? fadedColor(fill, behind, DIMMED_ALPHA) : fill;
  for (const mark of marks.parts) {
    const { outline } = mark;
    if (mark.covered) {
      fillOutline(graphics, outline, coverColor, 1);
      continue;
    }
    if (mark.ownPicture && !picture(mark)) fillOutline(pictures, outline, mark.color, 1);
    if (mark.veiled) fillOutline(graphics, outline, fill, 1 - DIMMED_ALPHA);
    const alpha = mark.faint || marks.faint ? DIMMED_ALPHA : 1;
    if (mark.fill !== undefined) fillOutline(graphics, outline, mark.fill, alpha);
    if (mark.opacity !== undefined) fillOutline(graphics, outline, fill, 1 - mark.opacity);
    if (mark.stroke !== undefined) strokeOutline(graphics, outline, mark.stroke, alpha);
  }
}

/**
 * Draws a drawing's parts at the middle levels, where the drawing is drawn in full but its picture
 * does not show: each its outline, its holes cut, filled in its overlay's fill or its main color, faint
 * as the emphasis draws it, and stroked in an overlay's stroke; a part that only strokes is its lines.
 * A part a filter hides is not drawn. With `simplified`, each is its simplified outline instead.
 */
export function drawPartBlocks(graphics: Graphics, marks: DrawingMarks, simplified = false): void {
  for (const mark of marks.parts) {
    if (mark.covered) continue;
    const color = mark.fill ?? mark.color;
    const alpha = mark.faint ? DIMMED_ALPHA : 1;
    const { outline } = mark;
    if (!simplified) {
      fillOutline(graphics, outline, color, alpha);
      if (mark.stroke !== undefined) strokeOutline(graphics, outline, mark.stroke, alpha);
      continue;
    }
    for (const points of simplifyOutline(outline.fitted)) {
      if (points.length < 6) continue;
      graphics.poly(shifted(points, outline)).fill({ color, alpha });
    }
    strokeLines(graphics, outline, color, alpha);
  }
}

/**
 * Writes the badges overlays give a drawing's parts, each at its part's label point, under its name
 * when the part writes its name there, in the text that reads on its main color over a halo of it.
 */
export function writePartBadges(marks: DrawingMarks, make: TextFactory): Container[] {
  const texts: Container[] = [];
  for (const mark of marks.parts) {
    if (mark.covered || mark.badge === undefined || !mark.shape.outline) continue;
    const { shape } = mark;
    const area = labelAreaOn({ rect: shape.rect, outline: mark.shape.outline });
    const lines = partNameLines(shape.name, area);
    const colors = readableTextColors(mark.fill ?? mark.color);
    const text = make(
      {
        text: mark.badge,
        anchor: { x: 0.5, y: lines ? 0 : 0.5 },
        x: area.x + area.width / 2,
        y: area.y + area.height / 2 + (lines ? (lines.length * PART_NAME_LINE) / 2 + 2 : 0),
        style: {
          fontFamily: FONT_FAMILY,
          fontSize: BADGE_SIZE,
          fill: colors.detail,
          stroke: { color: mark.fill ?? mark.color, width: BADGE_HALO, join: 'round' },
        },
      },
      'detail',
    );
    if (!text) continue;
    if (mark.faint) text.alpha = DIMMED_ALPHA;
    texts.push(text);
  }
  return texts;
}

/**
 * Writes the names of a drawing's parts over what the layer draws over them, which would hide the
 * names the tiles write under it: where its picture shows, of the parts an overlay fills or drawn
 * with their own picture; with `all`, at the middle levels, of every part a filter does not hide. Each
 * is written as the tiles write it (`partNameText`), in the text that reads on its overlay's fill or
 * its main color, faint as the part is.
 */
export function writePartNames(marks: DrawingMarks, make: TextFactory, all: boolean): Container[] {
  const texts: Container[] = [];
  for (const mark of marks.parts) {
    const { shape } = mark;
    if (mark.covered || !shape.outline) continue;
    if (!all && mark.fill === undefined && !mark.ownPicture) continue;
    const name = partNameText(
      shape,
      shape.outline,
      readableTextColors(mark.fill ?? mark.color).name,
    );
    if (!name) continue;
    const text = make(name.options, 'name', name.room);
    if (!text) continue;
    if (mark.faint) text.alpha = DIMMED_ALPHA;
    texts.push(text);
  }
  return texts;
}

/** Fills an outline where it is placed, its holes cut, and its lines as bands of their width. */
export function fillOutline(
  graphics: Graphics,
  outline: PlacedOutline,
  color: Color,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const flat = flattenOutline(outline.fitted);
  const fills = flat.filter((contour) => contour.role === 'fill' && contour.points.length >= 6);
  const holesIn = holesByFill(flat, fills);
  for (const each of fills) {
    graphics.poly(shifted(each.points, outline)).fill({ color, alpha });
    for (const hole of holesIn.get(each) ?? []) graphics.poly(shifted(hole.points, outline)).cut();
  }
  strokeLines(graphics, outline, color, alpha);
}

/** Strokes an outline's closed contours, and its lines along their edges, in an overlay's stroke. */
function strokeOutline(graphics: Graphics, outline: PlacedOutline, color: Color, alpha: number) {
  for (const contour of flattenOutline(outline.fitted)) {
    if (contour.points.length < 4) continue;
    graphics
      .poly(shifted(contour.points, outline), contour.role !== 'line')
      .stroke({ color, alpha, width: OVERLAY_STROKE, join: 'round', cap: 'round' });
  }
}

/** Strokes an outline's lines at their own width, with round ends, as the part draws them. */
function strokeLines(graphics: Graphics, outline: PlacedOutline, color: Color, alpha: number) {
  const { contours } = outline.fitted;
  flattenOutline(outline.fitted).forEach((contour, at) => {
    if (contour.role !== 'line' || contour.points.length < 4) return;
    const width = Math.max(1, contours[at]?.width ?? 0);
    graphics
      .poly(shifted(contour.points, outline), false)
      .stroke({ color, alpha, width, cap: 'round', join: 'round' });
  });
}

function shifted(points: ArrayLike<number>, outline: PlacedOutline): number[] {
  const out = new Array<number>(points.length);
  for (let at = 0; at < points.length; at += 2) {
    out[at] = (points[at] as number) + outline.x;
    out[at + 1] = (points[at + 1] as number) + outline.y;
  }
  return out;
}

/** One drawing's part of the layer: its marks where its picture shows, and its blocks elsewhere. */
interface Drawn {
  marks: DrawingMarks;
  near: Container;
  pictures: Graphics;
  over: Graphics;
  /** Its parts at the middle levels, in their main colors. */
  middle: Graphics;
  /** The badges overlays write at its parts' label points. */
  badges: Container;
  /** The names written over what hides them: where its picture shows, and at the middle levels. */
  names: Container;
  middleNames: Container;
  /** The level of detail it showed last, which the next one goes on from. */
  levelAt?: number;
  /** Whether a part's own picture waits for a texture, and the keys of those it drew with. */
  waiting: boolean;
  keys: string[];
  /** Whether it asked the store since it was built, which takes a frame more to start. */
  asked: boolean;
}

/**
 * The layer the canvas draws anchored parts in, between the element shapes and the relations: what
 * `drawPartMarks` and `drawPartBlocks` draw, for each drawing with parts on screen as its scale
 * shows it, with the parts' own pictures from the canvas's image store.
 */
export class PartLayer<T extends Texture = Texture> {
  readonly container = new Container();
  private drawn: Drawn[] = [];
  private from: { scene: Scene | undefined; hidden: unknown; dimmed: unknown } = {
    scene: undefined,
    hidden: undefined,
    dimmed: undefined,
  };
  private theme: ThemeName = 'light';
  private scale = 1;

  constructor(
    private readonly store: ImageStore<T, unknown>,
    private readonly changed: () => void = () => {},
    private readonly make?: TextFactory,
  ) {}

  /** How many drawings with parts it draws over, for the tests. */
  get drawings(): number {
    return this.drawn.length;
  }

  /** Draws over the anchored parts of this scene, as the emphasis and a drag leave them. */
  setScene(scene: Scene | undefined, hidden: ReadonlySet<string>, dimmed: ReadonlySet<string>) {
    const from = this.from;
    if (from.scene === scene && from.hidden === hidden && from.dimmed === dimmed) return;
    this.from = { scene, hidden, dimmed };
    this.build(scene ? partMarksOf(scene, hidden, dimmed) : []);
  }

  /** Draws in a theme's colors from now on. */
  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.build(this.drawn.map((each) => each.marks));
  }

  /** Shows each drawing's marks where its picture shows at this scale, and its blocks elsewhere. */
  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    for (const each of this.drawn) {
      this.place(each);
      // Another zoom may want the parts' own pictures in another size.
      if (each.marks.parts.some((mark) => mark.ownPicture)) each.waiting = true;
    }
  }

  /**
   * Asks the store for the parts' own pictures that wait for one, and draws those that are ready;
   * says whether it asked for one it does not have for the first time, which starts in the next frame.
   */
  frame(view: ImageView): boolean {
    let more = false;
    const keys: string[] = [];
    for (const each of this.drawn) {
      if (each.waiting && each.near.visible) {
        this.paintPictures(each, view);
        if (each.waiting && !each.asked) more = true;
        each.asked = true;
      }
      keys.push(...each.keys);
    }
    if (keys.length > 0) this.store.use(PARTS_PICTURES, keys);
    return more;
  }

  /** Draws the parts' own pictures again from nothing, as after the store let every texture go. */
  reset(): void {
    this.build(this.drawn.map((each) => each.marks));
  }

  destroy(): void {
    this.store.release(PARTS_PICTURES);
    if (!this.container.destroyed) this.container.destroy({ children: true });
    this.drawn = [];
  }

  private build(all: readonly DrawingMarks[]): void {
    for (const each of this.drawn) {
      each.near.destroy({ children: true });
      each.middle.destroy();
      each.badges.destroy({ children: true });
      each.names.destroy({ children: true });
      each.middleNames.destroy({ children: true });
    }
    this.container.removeChildren();
    this.drawn = all.map((marks) => {
      const near = new Container();
      const pictures = new Graphics();
      const over = new Graphics();
      near.addChild(pictures, over);
      const middle = new Graphics();
      drawPartBlocks(middle, marks);
      const badges = new Container();
      const names = new Container();
      const middleNames = new Container();
      if (this.make) {
        const texts = writePartBadges(marks, this.make);
        if (texts.length > 0) badges.addChild(...texts);
        const over = writePartNames(marks, this.make, false);
        if (over.length > 0) names.addChild(...over);
        const all = writePartNames(marks, this.make, true);
        if (all.length > 0) middleNames.addChild(...all);
      }
      const drawn: Drawn = {
        marks,
        near,
        pictures,
        over,
        middle,
        badges,
        names,
        middleNames,
        waiting: false,
        keys: [],
        asked: false,
      };
      drawPartMarks(over, marks, this.theme, () => false, pictures);
      drawn.waiting = marks.parts.some((mark) => mark.ownPicture);
      this.container.addChild(near, names, middle, middleNames, badges);
      this.place(drawn);
      return drawn;
    });
    if (this.drawn.some((each) => each.waiting)) this.changed();
  }

  /**
   * Shows a drawing's marks where its picture shows at the scale, its parts in their main colors at
   * the middle levels, nothing far out, and its badges and the names over its marks from the scale
   * names are written at.
   */
  private place(drawn: Drawn): void {
    const { shows, coarse, at } = pictureShows(drawn.marks.drawing, this.scale, drawn.levelAt);
    if (at === undefined) delete drawn.levelAt;
    else drawn.levelAt = at;
    const middle = !shows && !coarse;
    const badges = !coarse && this.scale >= BADGES_FROM;
    const named = shows && badges;
    const middleNamed = middle && badges;
    if (drawn.near.visible !== shows) drawn.near.visible = shows;
    if (drawn.middle.visible !== middle) drawn.middle.visible = middle;
    if (drawn.badges.visible !== badges) drawn.badges.visible = badges;
    if (drawn.names.visible !== named) drawn.names.visible = named;
    if (drawn.middleNames.visible !== middleNamed) drawn.middleNames.visible = middleNamed;
  }

  /** Draws the own pictures of a drawing's parts with the textures the store has, the rest in their main color. */
  private paintPictures(drawn: Drawn, view: ImageView): void {
    const { marks } = drawn;
    const image = marks.drawing.image?.image;
    const middle = {
      x: view.shown.x + view.shown.width / 2,
      y: view.shown.y + view.shown.height / 2,
    };
    let waiting = false;
    const keys: string[] = [];
    drawn.pictures.clear();
    drawn.over.clear();
    drawPartMarks(
      drawn.over,
      marks,
      this.theme,
      (mark) => {
        const own = image && partPicture(image, mark.shape.part?.part ?? '');
        if (!own) return false;
        const made = this.store.texture(pictureRequest(own, mark.shape.rect, view, middle));
        if (!made?.exact) waiting = true;
        if (!made) return false;
        keys.push(made.key);
        const { x, y, width, height } = mark.shape.rect;
        drawn.pictures.texture(made.texture, undefined, x, y, width, height);
        return true;
      },
      drawn.pictures,
    );
    drawn.waiting = waiting;
    drawn.keys = keys;
  }
}

/** What the store is asked for a part's own picture, drawn over its place. */
function pictureRequest(
  image: CleanedImage,
  rect: Rect,
  view: ImageView,
  middle: { x: number; y: number },
): ImageRequest {
  return {
    image,
    devicePixels: Math.max(rect.width, rect.height) * view.scale * view.resolution,
    sharp: view.settled,
    silhouette: false,
    distance: Math.hypot(rect.x + rect.width / 2 - middle.x, rect.y + rect.height / 2 - middle.y),
    tile: PARTS_PICTURES,
    large: true,
  };
}
