/**
 * Solids' pictures for exports (ADR 0075): the PNG, the SVG and the PDF the app makes draw solids as
 * the canvas does, so the solid worker draws each picture at the export's scale, and its parts'
 * states are laid over it here, as the parts' shader lays them on the canvas.
 *
 * - **At the export's scale.** Each shape's picture is asked for at its longer side times the pixels
 *   the export gives a canvas unit, in the worker's buckets, at most 2,048 pixels. The SVG and the PDF
 *   take two pixels a unit, as a PNG at 2× does; the PNG its own.
 * - **Its parts' states.** A drawing with parts lays its overlays' fills and the veils of its faint
 *   parts over its picture, part by part through its part buffer, as `shadePixel` does; the marks of
 *   the selection, hover and highlights are left out, as every export leaves them out. A part a filter
 *   hides is drawn again without it, as on the canvas.
 * - **Without a GPU,** where nothing draws pictures, as for the command line and Claude's
 *   `export_view`, a solid is drawn as its placeholder, and the export says so.
 */
import type { ThemeName } from '@visual-anything/core';
import { solidsIn, type ProjectSnapshot } from '@visual-anything/core';
import type { Color, SolidPart } from '@visual-anything/schema';
import type { Scene, ElementShape } from '../canvas/scene';
import { overlayLookOfPart } from '../canvas/overlays/decorate';
import { withHiddenParts } from '../canvas/shape-solids';
import { isAnchoredSolidPart } from '../canvas/solidMark';
import { anchoredByIndex } from '../canvas/solids/pointing';
import {
  STATE_TABLE_WIDTH,
  entryOffset,
  partStatesOf,
  rgbOf,
  type PartElementState,
  type PartStates,
} from '../canvas/solids/states';
import { shapeColors } from '../canvas/theme/paint';
import { t, type PluralText } from '../i18n';
import { solidAskFor, type SolidClient, type SolidPictureAsk } from '../solids/solid-client';
import { LARGEST_SOLID_PICTURE, type SolidPartBuffer } from '../solids/protocol';

/** How many pixels the SVG and the PDF give a canvas unit of a solid's picture, as a PNG at 2×. */
export const SVG_SOLID_PIXELS = 2;

/** How long an export waits for every picture it asks for, before it draws placeholders for the rest. */
export const SOLID_PICTURES_WAIT = 30_000;

/** A picture's pixels: RGBA, not premultiplied, row by row from the top left. */
export interface SolidPixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** A picture drawn for an export, with the part buffer a drawing with parts comes with. */
export interface PaintedSolid extends SolidPixels {
  partBuffer?: SolidPartBuffer;
}

/** Where an export has solids' pictures drawn: the solid worker, through the app's client. */
export interface SolidPainter {
  /** Draws these pictures; none for each one that cannot be drawn. */
  paint(asks: readonly SolidPictureAsk[]): Promise<(PaintedSolid | undefined)[]>;
}

/** The pixels of a picture the worker drew, which the browser holds as an `ImageBitmap`. */
export function bitmapPixels(bitmap: ImageBitmap): SolidPixels {
  const { width, height } = bitmap;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) throw new Error('The browser has no canvas to read a solid’s picture on.');
  context.drawImage(bitmap, 0, 0);
  return { width, height, pixels: context.getImageData(0, 0, width, height).data };
}

/**
 * The painter of the app's solid client: it waits for each picture at most `wait` milliseconds, and
 * reads its pixels with `pixelsOf`, the browser's canvas by default.
 */
export function solidPainterOf(
  client: SolidClient,
  pixelsOf: (bitmap: ImageBitmap) => SolidPixels = bitmapPixels,
  wait = SOLID_PICTURES_WAIT,
): SolidPainter {
  return {
    async paint(asks) {
      if (asks.length === 0) return [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<undefined[]>((resolve) => {
        timer = setTimeout(() => resolve(asks.map(() => undefined)), wait);
      });
      const drawn = await Promise.race([client.draw(asks), late]);
      clearTimeout(timer);
      return drawn.map((picture) => {
        if (!picture) return undefined;
        try {
          return {
            ...pixelsOf(picture.bitmap),
            ...(picture.partBuffer ? { partBuffer: picture.partBuffer } : {}),
          };
        } catch {
          return undefined;
        }
      });
    },
  };
}

/** What a scene's solids are drawn with in an export, by the key of the shape that shows each. */
export interface SolidShots {
  pictures: ReadonlyMap<string, PaintedSolid>;
  /** What the export lost of its solids, in the language the app reads in. */
  lost: string[];
}

/** How an export's solids are drawn. */
export interface SolidShotOptions {
  /** How many pixels a canvas unit takes. */
  pixelsPerUnit: number;
  theme: ThemeName;
  /** Only the shapes whose pictures meet this, in canvas units; every shape by default. */
  within?: { x: number; y: number; width: number; height: number };
  /** The shapes the export does not draw, as the emphasis hides them; none by default. */
  hidden?: ReadonlySet<string>;
  /**
   * The states of a drawing's parts as the export draws them; by default, as its overlays leave
   * them, with nothing faint or hidden.
   */
  statesOf?: (drawing: ElementShape) => PartStates | undefined;
}

const NOT_DRAWN: PluralText = {
  one: 'One solid could not be drawn, and is drawn as its placeholder.',
  other: '{count} solids could not be drawn, and are drawn as their placeholders.',
};

/** The words an export says of the solids it could not draw, which it draws as placeholders. */
export function solidsNotDrawn(count: number): string {
  return t(NOT_DRAWN, { count });
}

/** The words an export without a GPU says of the solids it draws as placeholders. */
export function solidsAsPlaceholders(): string {
  return t(
    'Solids are drawn as placeholders, their outline, name and a mark: only the app draws their pictures.',
  );
}

/** Whether a shape shows a solid's picture of its own, rather than as an anchored part of one. */
export function showsSolid(shape: ElementShape): boolean {
  return shape.solid !== undefined && !isAnchoredSolidPart(shape);
}

/**
 * The states of a drawing's parts as its overlays leave them: their fills, and the veils of their
 * opacity, with nothing faint, hidden or marked, as an export of the whole view draws them.
 */
export function overlayPartStates(
  scene: Scene,
  drawing: ElementShape,
  parts: readonly SolidPart[],
): PartStates {
  const anchored = anchoredByIndex(
    scene.shapes.filter(
      (shape) => isAnchoredSolidPart(shape) && shape.containerShape === drawing.key,
    ),
  );
  const elements = new Map<number, PartElementState>();
  for (const [index, shape] of anchored) {
    const look = overlayLookOfPart(shape);
    const state: PartElementState = {};
    if (look?.fill !== undefined) state.fill = look.fill;
    if (look?.opacity !== undefined && look.opacity < 1) state.opacity = look.opacity;
    elements.set(index, state);
  }
  return partStatesOf(parts, elements);
}

/**
 * Lays a drawing's part states over its picture, as the parts' shader does without its marks: each
 * part's overlay fill, then the veil of the drawing's fill, its alpha kept so that the drawing's plate
 * shows through where the picture draws nothing. A copy; the picture is not changed.
 */
export function shadeForExport(
  picture: SolidPixels,
  buffer: SolidPartBuffer,
  states: PartStates,
  backdrop: Color,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(picture.pixels);
  if (!states.any || buffer.width !== picture.width || buffer.height !== picture.height) return out;
  const table = states.table;
  const [br, bg, bb] = rgbOf(backdrop);
  const veilRow = STATE_TABLE_WIDTH * 4;
  for (let at = 0; at < buffer.data.length; at++) {
    const value = buffer.data[at] as number;
    if (value === 0) continue;
    const entry = entryOffset(value);
    const fillAlpha = (table[entry + 3] ?? 0) / 255;
    const veil = (table[entry + veilRow] ?? 0) / 255;
    if (fillAlpha === 0 && veil === 0) continue;
    const pixel = at * 4;
    let r = out[pixel] as number;
    let g = out[pixel + 1] as number;
    let b = out[pixel + 2] as number;
    if (fillAlpha > 0) {
      r += ((table[entry] as number) - r) * fillAlpha;
      g += ((table[entry + 1] as number) - g) * fillAlpha;
      b += ((table[entry + 2] as number) - b) * fillAlpha;
    }
    if (veil > 0) {
      r += (br - r) * veil;
      g += (bg - g) * veil;
      b += (bb - b) * veil;
    }
    out[pixel] = Math.round(r);
    out[pixel + 1] = Math.round(g);
    out[pixel + 2] = Math.round(b);
  }
  return out;
}

function meets(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/**
 * Has every solid a scene shows drawn for an export, by `painter`, at the export's scale, with its
 * parts' states laid over drawings with parts. Without a painter, every solid is its placeholder, and
 * the export says so; a picture that cannot be drawn is its placeholder too, counted in what it lost.
 */
export async function solidShotsOf(
  project: ProjectSnapshot,
  scene: Scene,
  painter: SolidPainter | undefined,
  options: SolidShotOptions,
): Promise<SolidShots> {
  const { within } = options;
  const shapes = scene.shapes.filter(
    (shape) =>
      showsSolid(shape) &&
      shape.solid !== undefined &&
      !options.hidden?.has(shape.key) &&
      (within === undefined || meets(shape.solid.rect, within)),
  );
  const pictures = new Map<string, PaintedSolid>();
  if (shapes.length === 0) return { pictures, lost: [] };
  if (!painter) return { pictures, lost: [solidsAsPlaceholders()] };
  const catalog = solidsIn(project);
  const statesOf =
    options.statesOf ??
    ((drawing: ElementShape) => {
      const parts = drawing.solid && catalog.solid(drawing.solid.id)?.definition.parts;
      return parts ? overlayPartStates(scene, drawing, parts) : undefined;
    });
  const wanted: { shape: ElementShape; ask: SolidPictureAsk; states: PartStates | undefined }[] =
    [];
  let failed = 0;
  for (const shape of shapes) {
    const solid = shape.solid;
    if (!solid) continue;
    if (solid.placeholder) {
      failed += 1;
      continue;
    }
    const states = solid.placement === 'parts' ? statesOf(shape) : undefined;
    const asked = states && states.hidden.length > 0 ? withHiddenParts(shape, states.hidden) : shape;
    const pixels = Math.min(
      LARGEST_SOLID_PICTURE,
      Math.max(solid.rect.width, solid.rect.height) * options.pixelsPerUnit,
    );
    const ask = solidAskFor(asked, pixels, 0);
    if (!ask) continue;
    wanted.push({ shape, ask, states });
  }
  const painted = await painter.paint(wanted.map((each) => each.ask));
  wanted.forEach(({ shape, states }, at) => {
    const picture = painted[at];
    if (!picture) {
      failed += 1;
      return;
    }
    const buffer = picture.partBuffer;
    const pixels =
      states && buffer
        ? shadeForExport(picture, buffer, states, shapeColors(shape, options.theme).fill)
        : picture.pixels;
    pictures.set(shape.key, { ...picture, pixels });
  });
  return { pictures, lost: failed > 0 ? [solidsNotDrawn(failed)] : [] };
}
