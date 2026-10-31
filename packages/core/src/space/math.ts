/**
 * The maths of physical space (ADR 0076): unit quaternions, as glTF writes rotations, and 4×4 matrices
 * in column-major order, as glTF and three.js keep them. Meters, right-handed, +Y up.
 */
import type { Rotation, SpacePoint } from '@visual-anything/schema';

/** A column-major 4×4 matrix. */
export type Matrix = readonly number[];

/** No turn. */
export const NO_ROTATION: Rotation = { x: 0, y: 0, z: 0, w: 1 };

/** The matrix that changes nothing. */
export const IDENTITY: Matrix = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A rotation of unit length, or none when it has no length to keep. */
export function normalized(rotation: Rotation): Rotation {
  const length = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (!(length > 0) || !Number.isFinite(length)) return NO_ROTATION;
  return {
    x: rotation.x / length,
    y: rotation.y / length,
    z: rotation.z / length,
    w: rotation.w / length,
  };
}

/** `a` then `b` as one rotation: the product `a · b`, which turns by `b` first, then by `a`. */
export function multiplyRotations(a: Rotation, b: Rotation): Rotation {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** The turn back. */
export function inverseRotation(rotation: Rotation): Rotation {
  return { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
}

/**
 * A rotation from degrees about the fixed axes X, then Y, then Z, as the inspector and Claude's tools
 * take it (ADR 0076): `Rz · Ry · Rx`.
 */
export function rotationFromDegrees(x: number, y: number, z: number): Rotation {
  const about = (axis: 'x' | 'y' | 'z', degrees: number): Rotation => {
    const half = (degrees * Math.PI) / 180 / 2;
    const sin = Math.sin(half);
    return {
      x: axis === 'x' ? sin : 0,
      y: axis === 'y' ? sin : 0,
      z: axis === 'z' ? sin : 0,
      w: Math.cos(half),
    };
  };
  return normalized(
    multiplyRotations(about('z', z), multiplyRotations(about('y', y), about('x', x))),
  );
}

/** The degrees about X, then Y, then Z, about fixed axes, that a rotation turns by. */
export function degreesOfRotation(rotation: Rotation): { x: number; y: number; z: number } {
  const m = matrixOf({ x: 0, y: 0, z: 0 }, rotation);
  // R = Rz · Ry · Rx; m[2] is R[2][0] = −sin(y).
  const sinY = -(m[2] as number);
  const y = Math.asin(Math.max(-1, Math.min(1, sinY)));
  let x: number;
  let z: number;
  if (Math.abs(sinY) < 0.999_999) {
    x = Math.atan2(m[6] as number, m[10] as number);
    z = Math.atan2(m[1] as number, m[0] as number);
  } else {
    // Gimbal lock: X and Z turn about one axis; give it all to X.
    x = Math.atan2(-(m[9] as number), m[5] as number);
    z = 0;
  }
  const degrees = (radians: number) => (radians * 180) / Math.PI;
  return { x: degrees(x), y: degrees(y), z: degrees(z) };
}

/** The matrix of a place and a turn: turn first, then move. */
export function matrixOf(at: SpacePoint, rotation: Rotation = NO_ROTATION): Matrix {
  const { x, y, z, w } = normalized(rotation);
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    0,
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    0,
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
    0,
    at.x,
    at.y,
    at.z,
    1,
  ];
}

/** `a · b`: what `b` places, placed again by `a`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1)
        sum += (a[k * 4 + row] as number) * (b[column * 4 + k] as number);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** The inverse of a matrix made of turns and moves only. */
export function inverseRigid(m: Matrix): Matrix {
  // The transpose of the turn, and the move turned back.
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]] as number[];
  const t = [m[12], m[13], m[14]] as number[];
  const rt = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]] as number[];
  const moved = [
    -(
      (rt[0] as number) * (t[0] as number) +
      (rt[3] as number) * (t[1] as number) +
      (rt[6] as number) * (t[2] as number)
    ),
    -(
      (rt[1] as number) * (t[0] as number) +
      (rt[4] as number) * (t[1] as number) +
      (rt[7] as number) * (t[2] as number)
    ),
    -(
      (rt[2] as number) * (t[0] as number) +
      (rt[5] as number) * (t[1] as number) +
      (rt[8] as number) * (t[2] as number)
    ),
  ];
  return [
    rt[0] as number,
    rt[1] as number,
    rt[2] as number,
    0,
    rt[3] as number,
    rt[4] as number,
    rt[5] as number,
    0,
    rt[6] as number,
    rt[7] as number,
    rt[8] as number,
    0,
    moved[0] as number,
    moved[1] as number,
    moved[2] as number,
    1,
  ];
}

/** Where a matrix puts a point. */
export function transformPoint(m: Matrix, p: SpacePoint): SpacePoint {
  return {
    x: (m[0] as number) * p.x + (m[4] as number) * p.y + (m[8] as number) * p.z + (m[12] as number),
    y: (m[1] as number) * p.x + (m[5] as number) * p.y + (m[9] as number) * p.z + (m[13] as number),
    z:
      (m[2] as number) * p.x + (m[6] as number) * p.y + (m[10] as number) * p.z + (m[14] as number),
  };
}

/** The place and the turn a matrix made of turns and moves holds. */
export function decompose(m: Matrix): { at: SpacePoint; rotation: Rotation } {
  const m00 = m[0] as number,
    m10 = m[1] as number,
    m20 = m[2] as number;
  const m01 = m[4] as number,
    m11 = m[5] as number,
    m21 = m[6] as number;
  const m02 = m[8] as number,
    m12 = m[9] as number,
    m22 = m[10] as number;
  const trace = m00 + m11 + m22;
  let rotation: Rotation;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    rotation = { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    rotation = { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    rotation = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    rotation = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 };
  }
  return {
    at: { x: m[12] as number, y: m[13] as number, z: m[14] as number },
    rotation: normalized(rotation),
  };
}
