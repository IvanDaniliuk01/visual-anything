/**
 * Drawing faces on the canvas (ADR 0083, F2): a face drawing's boxes, bands and runs, as glyph quads,
 * in one drawing per shape among its tile's labels, in the colors its tokens take on the shape's fill
 * in the theme shown (`faces.ts` lays them out and keeps them).
 *
 * Its pictures (F5), `<icon/>` as the shape's own image and `<image ref="…"/>` as an image of its
 * component's package, are drawn in the same drawing, over its boxes and under its text, placed as
 * the exports place them (`facePictureRect`), with textures every face that shows a picture shares
 * (`FacePictures`, which the image drawings keep): nothing loads while the canvas pans or zooms, and a
 * face whose texture is not made yet is drawn again once it is.
 */
import {
  facePalette,
  resolveFaceColor,
  type FaceDrawing,
  type FaceImage,
  type FacePalette,
  type ThemeName,
} from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { Container, Graphics, type Texture } from 'pixi.js';
import { drawGlyphs } from './emphasisLabels';
import {
  faceBoxPieces,
  facePaints,
  facePictureRect,
  faceRect,
  shapeFaceDrawing,
  type FacePicture,
  type FaceShow,
} from './faces';
import type { Point, Rect } from './geometry';
import type { ElementShape } from './scene';
import type { ShapeSolid } from './shape-solids';

/** A picture a face draws: its image, and the tint of a silhouette. */
export type FacePictureSource = FacePicture & { tint?: Color };

/**
 * Where a face's pictures come from on the canvas: textures shared by every face that shows the same
 * picture at about the same size, made once and kept while the scene shows the picture.
 */
export interface FacePictures {
  /**
   * The texture to draw a picture with in a box `side` units across at most; none until it is made,
   * when `waiting` is painted again.
   */
  textureFor(picture: FacePictureSource, side: number, waiting: FaceLabel): Texture | undefined;
  /**
   * The texture to draw a shape's solid with by `<icon/>` (ADR 0075), with its picture's size; none
   * until it is made, when `waiting` is painted again.
   */
  solidTextureFor?(
    shape: { solid?: ShapeSolid },
    side: number,
    waiting: FaceLabel,
  ): { texture: Texture; width: number; height: number } | undefined;
}

/** A face's picture, ready to draw: its texture, its own size and its tint. */
export interface DrawnPicture {
  texture: Texture;
  width: number;
  height: number;
  tint?: Color;
}

/**
 * Draws a face drawing at `at`: its boxes, its pictures (with `picture`, which gives each one's
 * texture), its bands, then its runs, in this palette's colors.
 */
export function drawFaceDrawing(
  graphics: Graphics,
  drawing: FaceDrawing,
  at: Point,
  palette: FacePalette,
  picture?: (image: FaceImage, box: Rect) => DrawnPicture | undefined,
): void {
  const color = (each: string) => resolveFaceColor(each, palette);
  for (const box of drawing.boxes) {
    // The pieces the exports write too (`faceBoxPieces`): backgrounds, rings, sides and dashes.
    for (const piece of faceBoxPieces(box, at)) {
      const { x, y, width, height } = piece.rect;
      if (piece.radius > 0) graphics.roundRect(x, y, width, height, piece.radius);
      else graphics.rect(x, y, width, height);
      if (piece.kind === 'fill') graphics.fill(color(piece.color));
      else graphics.stroke({ color: color(piece.color), width: piece.width });
    }
  }
  if (picture) {
    for (const image of drawing.images) {
      const box = {
        x: at.x + image.x,
        y: at.y + image.y,
        width: image.width,
        height: image.height,
      };
      const drawn = picture(image, box);
      const placed = drawn && facePictureRect(box, drawn.width, drawn.height);
      if (!drawn || !placed) continue;
      graphics.texture(
        drawn.texture,
        drawn.tint ?? 0xffffff,
        placed.x,
        placed.y,
        placed.width,
        placed.height,
      );
    }
  }
  for (const band of drawing.bands) {
    if (band.width <= 0 || band.height <= 0) continue;
    graphics.rect(at.x + band.x, at.y + band.y, band.width, band.height).fill(color(band.color));
  }
  for (const run of drawing.runs) {
    drawGlyphs(
      graphics,
      run.text,
      run.variant,
      run.size,
      at.x + run.x,
      at.y + run.y,
      color(run.color),
    );
  }
}

/** What a face's pictures are drawn from: the textures, the shape's own image and its package's. */
export interface FaceLabelPictures {
  pictures: FacePictures;
  /** The shape's own image, which `<icon/>` draws. */
  icon?: FacePictureSource;
  /** The shape's solid, which `<icon/>` draws in place of an image (ADR 0075). */
  solid?: { solid: ShapeSolid };
  /** The images its `<image ref="…"/>` name, by `ref`. */
  images?: Readonly<Record<string, FacePicture>>;
}

/**
 * A shape's face, drawn among its tile's labels: drawn again in place for another theme or fill
 * (`paint`), since its colors are its tokens' on the shape's fill, and once a picture's texture it
 * waited for is made (`repaint`).
 */
export class FaceLabel extends Container {
  readonly graphics = new Graphics();
  #painted: [ThemeName, string, string] | undefined;

  constructor(
    readonly drawing: FaceDrawing,
    readonly at: Point,
    readonly sources?: FaceLabelPictures,
  ) {
    super();
    this.addChild(this.graphics);
  }

  /** Draws it in the colors of a shape of this fill and stroke, in a theme. */
  paint(theme: ThemeName, fill: string, stroke: string): void {
    this.#painted = [theme, fill, stroke];
    this.graphics.clear();
    drawFaceDrawing(
      this.graphics,
      this.drawing,
      this.at,
      facePalette(theme, fill, stroke),
      this.sources && this.#picture,
    );
  }

  /** Draws it again as it was last painted: a texture it waited for is made. */
  repaint(): void {
    if (this.#painted && !this.destroyed) this.paint(...this.#painted);
  }

  readonly #picture = (image: FaceImage, box: Rect): DrawnPicture | undefined => {
    const sources = this.sources as FaceLabelPictures;
    if (image.kind === 'icon' && sources.solid) {
      return sources.pictures.solidTextureFor?.(
        sources.solid,
        Math.max(box.width, box.height),
        this,
      );
    }
    const source: FacePictureSource | undefined =
      image.kind === 'icon' ? sources.icon : sources.images?.[image.ref];
    if (!source) return undefined;
    const texture = sources.pictures.textureFor(source, Math.max(box.width, box.height), this);
    if (!texture) return undefined;
    return {
      texture,
      width: source.image.width,
      height: source.image.height,
      ...(source.tint === undefined ? {} : { tint: source.tint }),
    };
  };
}

/**
 * A shape's face as a label, in a theme, for a shape already painted in it (`paintedShape`); none
 * when it has no face or its face draws nothing. With `pictures`, it draws its pictures too.
 */
export function faceLabel(
  shape: ElementShape,
  theme: ThemeName,
  show: FaceShow = {},
  fill: string = shape.fill,
  pictures?: FacePictures,
): FaceLabel | undefined {
  const drawing = shapeFaceDrawing(shape, show);
  if (!drawing || !facePaints(drawing)) return undefined;
  const rect = faceRect(shape);
  const sources: FaceLabelPictures | undefined =
    pictures && drawing.images.length > 0
      ? {
          pictures,
          ...(shape.solid && shape.solid.placeholder !== true ? { solid: { solid: shape.solid } } : {}),
          ...(shape.image
            ? {
                icon: {
                  image: shape.image.image,
                  serial: shape.image.serial,
                  ...(shape.image.tint === undefined ? {} : { tint: shape.image.tint }),
                },
              }
            : {}),
          ...(shape.face?.pictures ? { images: shape.face.pictures } : {}),
        }
      : undefined;
  const label = new FaceLabel(drawing, { x: rect.x, y: rect.y }, sources);
  label.paint(theme, fill, shape.stroke);
  return label;
}
