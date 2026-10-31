/**
 * How a space's looks reach the GPU (ADR 0076) without making anything again: each batch of a space's
 * scene (`scene.ts`) reads, for each instance it draws and each look it holds, a fill, how much of it
 * is drawn, its marks and whether it is faint or hidden, from a table of looks in a float texture. A
 * change of states, of marks, of an overlay or of what is boxed writes the table and the instances'
 * places, and draws the same objects with the same materials.
 *
 * - **The table** holds two texels a look, row after row: the instance drawn, then the look's column
 *   in it (a piece's part plus one in a batch of merged pieces, 0 for what belongs to no part).
 * - **The passes**: one draws what is drawn whole (writing depth), one what is see-through (faint, or
 *   under an overlay's opacity), and the bits' pass what has marks or is not faint. Each draws every
 *   instance and moves out of the frame what is not its own, so that a batch is one draw a pass, and
 *   a pass with nothing of its own is not drawn.
 * - **The exploded view** of merged pieces moves each by its part's offset, read from a second texture.
 */
import {
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type Material,
  type Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { SpaceLook } from './layout';

/** How many texels a row of a table holds. */
export const LOOK_WIDTH = 1024;

/** The passes a look's batch is drawn in. */
export const LOOK_PASS = { whole: 0, seeThrough: 1, bits: 2 } as const;
export type LookPass = (typeof LOOK_PASS)[keyof typeof LOOK_PASS];

/** Below this share drawn, a look is see-through. */
const WHOLE = 0.9999;

/** A look as the table holds it, read back. */
export interface TabledLook {
  /** The fill, in linear components from 0 to 1, or none. */
  fill: [number, number, number] | undefined;
  alpha: number;
  marks: number;
  faint: boolean;
  hidden: boolean;
}

/** Whether a look is drawn see-through, under a material drawn at `opacity`. */
export function seeThrough(look: SpaceLook, opacity: number): boolean {
  return look.alpha * opacity < WHOLE;
}

const color = new Color();

/** A float texture of `texels` RGBA texels, `LOOK_WIDTH` a row. */
function floatTexture(texels: number): { texture: DataTexture; data: Float32Array } {
  const width = Math.min(LOOK_WIDTH, Math.max(1, texels));
  const height = Math.max(1, Math.ceil(texels / LOOK_WIDTH));
  const data = new Float32Array(width * height * 4);
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, data };
}

/** The looks of a batch's instances, `columns` each, for up to `rows` instances. */
export class LookTable {
  readonly texture: DataTexture;
  private readonly data: Float32Array;

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    ({ texture: this.texture, data: this.data } = floatTexture(Math.max(1, rows * columns * 2)));
  }

  /** Writes the look of an instance's column; none, hidden. */
  set(row: number, column: number, look: SpaceLook | undefined): void {
    const at = (row * this.columns + column) * 8;
    const data = this.data;
    if (!look) {
      data.fill(0, at, at + 7);
      data[at + 7] = 1;
      return;
    }
    if (look.fill === undefined) {
      data[at] = data[at + 1] = data[at + 2] = data[at + 3] = 0;
    } else {
      color.set(look.fill);
      data[at] = color.r;
      data[at + 1] = color.g;
      data[at + 2] = color.b;
      data[at + 3] = 1;
    }
    data[at + 4] = look.alpha;
    data[at + 5] = look.marks;
    data[at + 6] = look.faint ? 1 : 0;
    data[at + 7] = 0;
  }

  /** Marks the table to go to the GPU again. */
  written(): void {
    this.texture.needsUpdate = true;
  }

  /** The look of an instance's column, read back. */
  look(row: number, column: number): TabledLook {
    const at = (row * this.columns + column) * 8;
    const d = this.data;
    return {
      fill: (d[at + 3] ?? 0) > 0.5 ? [d[at] ?? 0, d[at + 1] ?? 0, d[at + 2] ?? 0] : undefined,
      alpha: d[at + 4] ?? 0,
      marks: d[at + 5] ?? 0,
      faint: (d[at + 6] ?? 0) > 0.5,
      hidden: (d[at + 7] ?? 0) > 0.5,
    };
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** How far the exploded view moves each part of merged pieces, by column. */
export class OffsetTable {
  readonly texture: DataTexture;
  private readonly data: Float32Array;

  constructor(readonly columns: number) {
    ({ texture: this.texture, data: this.data } = floatTexture(columns));
  }

  /** Writes each part's offset, the part at index `k` in column `k + 1`. */
  write(offsets: readonly Vector3[]): void {
    this.data.fill(0);
    offsets.forEach((offset, part) => {
      const at = (part + 1) * 4;
      if (at + 2 >= this.data.length) return;
      this.data[at] = offset.x;
      this.data[at + 1] = offset.y;
      this.data[at + 2] = offset.z;
    });
    this.texture.needsUpdate = true;
  }

  /** The offset of a column, read back. */
  offset(column: number): [number, number, number] {
    const at = column * 4;
    return [this.data[at] ?? 0, this.data[at + 1] ?? 0, this.data[at + 2] ?? 0];
  }

  dispose(): void {
    this.texture.dispose();
  }
}

// The GLSL ------------------------------------------------------------------------------------------

/** What every pass's vertex program declares to read its looks. */
export const LOOK_VERTEX_PARS = /* glsl */ `
uniform highp sampler2D lookTable;
uniform float lookColumns;
uniform float lookOpacity;
#ifdef LOOK_MERGED
  attribute float lookPart;
  uniform highp sampler2D lookOffsets;
#else
  uniform float lookPart;
#endif
varying vec4 vLookFill;
varying float vLookAlpha;
varying float vLookMarks;
vec4 lookTexel(highp sampler2D table, int index) {
  return texelFetch(table, ivec2(index % ${LOOK_WIDTH}, index / ${LOOK_WIDTH}), 0);
}`;

/**
 * What every pass's vertex program does once `transformed` holds the vertex: moves merged pieces by
 * their part's offset, reads the look, and works out whether this pass draws it (`lookDrawn`).
 */
export const LOOK_VERTEX = /* glsl */ `
  int lookColumn = int(lookPart + 0.5);
  int lookIndex = (gl_InstanceID * int(lookColumns + 0.5) + lookColumn) * 2;
  vec4 lookFill = lookTexel(lookTable, lookIndex);
  vec4 lookState = lookTexel(lookTable, lookIndex + 1);
  #ifdef LOOK_MERGED
    transformed += lookTexel(lookOffsets, lookColumn).xyz;
  #endif
  bool lookDrawn = lookState.w < 0.5;
  #if LOOK_PASS == ${LOOK_PASS.whole}
    lookDrawn = lookDrawn && lookState.x * lookOpacity >= ${WHOLE};
  #elif LOOK_PASS == ${LOOK_PASS.seeThrough}
    lookDrawn = lookDrawn && lookState.x * lookOpacity < ${WHOLE};
  #else
    lookDrawn = lookDrawn && (lookState.z < 0.5 || lookState.y > 0.5);
  #endif
  vLookFill = lookFill;
  vLookAlpha = lookState.x;
  vLookMarks = lookState.y;`;

/** What every pass's vertex program does last: what it does not draw is moved out of the frame. */
export const LOOK_VERTEX_END = /* glsl */ `
  if (!lookDrawn) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`;

/** The uniforms a pass reads its looks from. */
export interface LookUniforms {
  table: LookTable;
  /** The column of a batch's single piece; none for merged pieces, whose vertices name theirs. */
  part?: number;
  offsets?: OffsetTable;
  /** How much of the material is drawn before its look's share: its own opacity when see-through. */
  opacity: number;
}

/** The uniforms of {@link LookUniforms}, as three.js takes them. */
export function lookUniforms(looks: LookUniforms): Record<string, { value: unknown }> {
  return {
    lookTable: { value: looks.table.texture },
    lookColumns: { value: looks.table.columns },
    lookOpacity: { value: looks.opacity },
    ...(looks.offsets ? { lookOffsets: { value: looks.offsets.texture } } : {}),
    ...(looks.part === undefined ? {} : { lookPart: { value: looks.part } }),
  };
}

/** The defines of a pass. */
export function lookDefines(looks: LookUniforms, pass: LookPass): Record<string, string | number> {
  return { LOOK_PASS: pass, ...(looks.offsets ? { LOOK_MERGED: '' } : {}) };
}

/**
 * The same `onBeforeCompile` for every material drawn with looks, so that three.js shares their
 * programs; each material's own uniforms are kept on it.
 */
function compileWithLooks(this: Material, shader: WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, this.userData.lookUniforms as Record<string, { value: unknown }>);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${LOOK_VERTEX_PARS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LOOK_VERTEX}`)
    .replace(/}\s*$/, `${LOOK_VERTEX_END}\n}`);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec4 vLookFill;\nvarying float vLookAlpha;\nvarying float vLookMarks;',
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  if (vLookFill.w > 0.5) diffuseColor = vec4(vLookFill.rgb, opacity);
  diffuseColor.a *= vLookAlpha;`,
    );
}

/** Makes a material of three.js's own draw with looks, in a pass. */
export function withLooks<T extends Material>(material: T, looks: LookUniforms, pass: LookPass): T {
  material.userData = { ...material.userData, lookUniforms: lookUniforms(looks), lookPass: pass };
  material.defines = { ...(material.defines ?? {}), ...lookDefines(looks, pass) };
  material.onBeforeCompile = compileWithLooks;
  material.needsUpdate = true;
  return material;
}
