// @vitest-environment node
/**
 * The tables of looks a space's batches read on the GPU (ADR 0076), and the programs that read them:
 * checked without a renderer, on three.js's own shader sources.
 */
import {
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderLib,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { SPACE_MARK, type SpaceLook } from './layout';
import {
  LOOK_PASS,
  LOOK_VERTEX,
  LOOK_VERTEX_END,
  LOOK_WIDTH,
  LookTable,
  OffsetTable,
  seeThrough,
  withLooks,
} from './looks';
import { BITS_VERTEX } from './marks';

const plain: SpaceLook = { answers: 'a', faint: false, alpha: 1, marks: 0 };

describe('a table of looks', () => {
  it('holds each look of each instance, two texels a look, row after row', () => {
    const table = new LookTable(3, 2);
    expect(table.texture.image.width * table.texture.image.height).toBeGreaterThanOrEqual(12);
    table.set(1, 2, {
      answers: 'b',
      faint: true,
      alpha: DIMMED_ALPHA,
      marks: SPACE_MARK.selected | SPACE_MARK.highlighted,
      fill: '#FF0000',
    });
    table.set(0, 0, plain);
    table.set(0, 1, undefined);
    expect(table.look(1, 2)).toEqual({
      fill: [1, 0, 0],
      alpha: expect.closeTo(DIMMED_ALPHA, 6) as number,
      marks: 5,
      faint: true,
      hidden: false,
    });
    expect(table.look(0, 0)).toEqual({
      fill: undefined,
      alpha: 1,
      marks: 0,
      faint: false,
      hidden: false,
    });
    expect(table.look(0, 1).hidden).toBe(true);
    // A fill in linear components, as three.js's colors hold them.
    table.set(0, 0, { ...plain, fill: '#808080' });
    expect(table.look(0, 0).fill?.[0]).toBeCloseTo(new Color('#808080').r, 6);
  });

  it('wraps past a row of the texture, so that a solid of thousands of parts fits', () => {
    const table = new LookTable(4_097, 1);
    expect(table.texture.image.width).toBe(LOOK_WIDTH);
    expect(table.texture.image.height).toBe(Math.ceil((4_097 * 2) / LOOK_WIDTH));
    table.set(0, 4_096, { ...plain, marks: SPACE_MARK.hovered });
    expect(table.look(0, 4_096).marks).toBe(SPACE_MARK.hovered);
  });

  it('holds the exploded offsets of merged parts, each in its part’s column', () => {
    const offsets = new OffsetTable(3);
    offsets.write([new Vector3(1, 2, 3), new Vector3(-1, 0, 0)]);
    expect(offsets.offset(0)).toEqual([0, 0, 0]);
    expect(offsets.offset(1)).toEqual([1, 2, 3]);
    expect(offsets.offset(2)).toEqual([-1, 0, 0]);
  });

  it('draws a look see-through when its share, under the material’s own opacity, is below 1', () => {
    expect(seeThrough(plain, 1)).toBe(false);
    expect(seeThrough(plain, 0.5)).toBe(true);
    expect(seeThrough({ ...plain, alpha: DIMMED_ALPHA }, 1)).toBe(true);
  });
});

describe('the programs that read looks', () => {
  const compiled = (material: MeshStandardMaterial | MeshBasicMaterial, shader: string) => {
    const lib = ShaderLib[shader as 'standard' | 'basic'];
    const parameters = {
      vertexShader: lib.vertexShader,
      fragmentShader: lib.fragmentShader,
      uniforms: {},
    } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(parameters, undefined as never);
    return parameters;
  };

  it('read their looks in three.js’s own lit and unlit programs, and fill and fade by them', () => {
    const table = new LookTable(1, 1);
    for (const [material, shader] of [
      [new MeshStandardMaterial(), 'standard'],
      [new MeshBasicMaterial(), 'basic'],
    ] as const) {
      withLooks(material, { table, opacity: 1, part: 0 }, LOOK_PASS.seeThrough);
      expect(material.defines).toMatchObject({ LOOK_PASS: LOOK_PASS.seeThrough });
      const parameters = compiled(material, shader);
      expect(parameters.vertexShader).toContain(LOOK_VERTEX);
      expect(parameters.vertexShader.trimEnd().endsWith(`${LOOK_VERTEX_END}\n}`)).toBe(true);
      expect(parameters.fragmentShader).toContain('diffuseColor = vec4(vLookFill.rgb, opacity);');
      expect(parameters.fragmentShader).toContain('diffuseColor.a *= vLookAlpha;');
      expect(parameters.uniforms.lookTable?.value).toBe(table.texture);
      expect(parameters.uniforms.lookPart?.value).toBe(0);
    }
  });

  it('share one program text, whatever their batch, so that three.js compiles each pass once', () => {
    const one = withLooks(
      new MeshStandardMaterial(),
      {
        table: new LookTable(1, 1),
        opacity: 1,
        part: 0,
      },
      LOOK_PASS.whole,
    );
    const other = withLooks(
      new MeshStandardMaterial(),
      {
        table: new LookTable(5, 9),
        opacity: 0.5,
        offsets: new OffsetTable(5),
      },
      LOOK_PASS.whole,
    );
    expect(one.customProgramCacheKey()).toBe(other.customProgramCacheKey());
    expect(other.defines).toMatchObject({ LOOK_MERGED: '' });
    expect(one.defines).not.toHaveProperty('LOOK_MERGED');
  });

  it('move out of the frame, in the bits’ pass too, what their pass does not draw', () => {
    expect(BITS_VERTEX).toContain(LOOK_VERTEX);
    expect(BITS_VERTEX).toContain(LOOK_VERTEX_END);
  });
});
