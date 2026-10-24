/**
 * Dashed and dotted lines, drawn with a texture that repeats along each straight piece of a route. A
 * piece then costs PixiJS one stroke however long it is; a stroke for each dash made a long route cost
 * hundreds, which stalled the frames that first showed a part of a large view.
 */
import { BufferImageSource, Matrix, Texture } from 'pixi.js';
import type { Dash, Point } from './geometry';

export type Pattern = Exclude<Dash, 'solid'>;

/** The length of a dash and the gap after it, in line widths. */
const PATTERNS: Record<Pattern, { on: number; period: number }> = {
  dashed: { on: 4, period: 7 },
  // As a dash one line width long with round caps reads: two widths on, one off.
  dotted: { on: 2, period: 3 },
};

/**
 * Texels along one period. A power of two, so that the texture repeats and has the smaller copies
 * the GPU reads when the line is shown small, which keep the dashes from flickering.
 */
const TEXELS = 64;
/** Samples across each texel, to work out how much of it a dash covers. */
const SAMPLES = 8;

const textures = new Map<Pattern, Texture>();

/** How much of each texel along one period a dash covers, from 0 to 1. */
export function patternCoverage(pattern: Pattern): number[] {
  const { on, period } = PATTERNS[pattern];
  const coverage: number[] = [];
  for (let texel = 0; texel < TEXELS; texel++) {
    let covered = 0;
    for (let sample = 0; sample < SAMPLES; sample++) {
      const along = ((texel + (sample + 0.5) / SAMPLES) / TEXELS) * period;
      if (along < on) covered += 1;
    }
    coverage.push(covered / SAMPLES);
  }
  return coverage;
}

/** The texture a pattern repeats: one period, white where a dash covers it, made the first time it is needed. */
export function patternTexture(pattern: Pattern): Texture {
  let texture = textures.get(pattern);
  if (!texture) {
    const data = new Uint8Array(TEXELS * 4);
    patternCoverage(pattern).forEach((covered, texel) => {
      // White with its alpha already applied, as the GPU blends it.
      data.fill(Math.round(covered * 255), texel * 4, texel * 4 + 4);
    });
    texture = new Texture({
      source: new BufferImageSource({
        resource: data,
        width: TEXELS,
        height: 1,
        alphaMode: 'premultiplied-alpha',
        autoGenerateMipmaps: true,
        addressModeU: 'repeat',
        addressModeV: 'clamp-to-edge',
        scaleMode: 'linear',
        mipmapFilter: 'linear',
      }),
    });
    textures.set(pattern, texture);
  }
  return texture;
}

/**
 * Where a pattern lies along a straight piece of a route: the transform from the texture's texels to
 * the scene. `travelled` is how far along the route the piece starts, so that the dashes go on round
 * corners where they left off.
 */
export function patternMatrix(
  pattern: Pattern,
  from: Point,
  direction: Point,
  travelled: number,
  width: number,
): Matrix {
  const along = (PATTERNS[pattern].period * width) / TEXELS;
  // The texture's one row spans the line's width, from one edge to the other.
  return new Matrix(
    direction.x * along,
    direction.y * along,
    -direction.y * width,
    direction.x * width,
    from.x - direction.x * travelled + (direction.y * width) / 2,
    from.y - direction.y * travelled - (direction.x * width) / 2,
  );
}
