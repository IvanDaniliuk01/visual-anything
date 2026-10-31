/**
 * A solid's animations in the solid worker (ADR 0075): channels that move nodes by translation,
 * rotation and scale, with linear, step or cubic-spline keyframes, as the canonical form keeps them.
 * They are sampled by three.js's interpolants, a cubic spline by one of our own, and posed onto the
 * nodes directly: no `AnimationMixer`, no names to bind by. Pictures and picks see a solid at rest; a
 * turning's frame poses it, draws it, and puts it back.
 */
import {
  DiscreteInterpolant,
  Interpolant,
  LinearInterpolant,
  Quaternion,
  QuaternionLinearInterpolant,
  type Object3D,
  type TypedArray,
} from 'three';

/** How a channel moves its node. */
export type SolidChannelPath = 'translation' | 'rotation' | 'scale';

/** How a sampler goes from one keyframe to the next. */
export type SolidInterpolation = 'LINEAR' | 'STEP' | 'CUBICSPLINE';

/** One channel: which node it moves, how, and the interpolant that samples it. */
export interface SolidChannel {
  node: number;
  path: SolidChannelPath;
  interpolant: Interpolant;
}

/** One animation: its length in seconds, the latest keyframe of its channels, and its channels. */
export interface SolidAnimationTrack {
  duration: number;
  channels: SolidChannel[];
}

/** A node's pose at rest, as its file gives it. */
export interface RestPose {
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  scale: readonly [number, number, number];
}

/**
 * glTF's cubic-spline interpolation: each keyframe holds an in-tangent, a value and an out-tangent,
 * as three.js's GLTFLoader reads them (MIT), a rotation's result normalized.
 */
export class CubicSplineInterpolant extends Interpolant {
  constructor(
    times: TypedArray,
    values: TypedArray,
    size: number,
    result: TypedArray,
    private readonly rotation: boolean,
  ) {
    super(times, values, size, result);
  }

  override copySampleValue_(index: number): TypedArray {
    const result = this.resultBuffer;
    const size = this.valueSize;
    const offset = index * size * 3 + size;
    for (let i = 0; i < size; i += 1) result[i] = this.sampleValues[offset + i] as number;
    return result;
  }

  override interpolate_(i1: number, t0: number, t: number, t1: number): TypedArray {
    const result = this.resultBuffer;
    const values = this.sampleValues;
    const stride = this.valueSize;
    const td = t1 - t0;
    const p = (t - t0) / td;
    const pp = p * p;
    const ppp = pp * p;
    const offset1 = i1 * stride * 3;
    const offset0 = offset1 - stride * 3;
    const s2 = -2 * ppp + 3 * pp;
    const s3 = ppp - pp;
    const s0 = 1 - s2;
    const s1 = s3 - pp + p;
    for (let i = 0; i < stride; i += 1) {
      const p0 = values[offset0 + i + stride] as number;
      const m0 = (values[offset0 + i + stride * 2] as number) * td;
      const p1 = values[offset1 + i + stride] as number;
      const m1 = (values[offset1 + i] as number) * td;
      result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
    }
    if (this.rotation) {
      const quaternion = new Quaternion(result[0], result[1], result[2], result[3]).normalize();
      result[0] = quaternion.x;
      result[1] = quaternion.y;
      result[2] = quaternion.z;
      result[3] = quaternion.w;
    }
    return result;
  }
}

/** The interpolant of one sampler, its times in seconds and its values, already dequantized. */
export function interpolantFor(
  times: Float32Array,
  values: Float32Array,
  path: SolidChannelPath,
  interpolation: SolidInterpolation,
): Interpolant {
  const size = path === 'rotation' ? 4 : 3;
  const result = new Float32Array(size);
  switch (interpolation) {
    case 'STEP':
      return new DiscreteInterpolant(times, values, size, result);
    case 'CUBICSPLINE':
      return new CubicSplineInterpolant(times, values, size, result, path === 'rotation');
    default:
      return path === 'rotation'
        ? new QuaternionLinearInterpolant(times, values, size, result)
        : new LinearInterpolant(times, values, size, result);
  }
}

/** The time an animation shows `elapsed` seconds after it started playing, looping. */
export function loopedTime(elapsed: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(elapsed)) return 0;
  const time = elapsed % duration;
  return time < 0 ? time + duration : time;
}

/** Poses the nodes as an animation has them at `time`, from their rest. */
export function poseAt(
  nodes: readonly Object3D[],
  rest: readonly RestPose[],
  animation: SolidAnimationTrack,
  time: number,
): void {
  restAll(nodes, rest);
  for (const channel of animation.channels) {
    const node = nodes[channel.node];
    if (!node) continue;
    const value = channel.interpolant.evaluate(time);
    switch (channel.path) {
      case 'translation':
        node.position.set(value[0] as number, value[1] as number, value[2]);
        break;
      case 'rotation':
        node.quaternion.set(
          value[0] as number,
          value[1] as number,
          value[2] as number,
          value[3] as number,
        );
        break;
      case 'scale':
        node.scale.set(value[0] as number, value[1] as number, value[2]);
        break;
    }
  }
}

/** Puts every node back at rest. */
export function restAll(nodes: readonly Object3D[], rest: readonly RestPose[]): void {
  nodes.forEach((node, at) => {
    const pose = rest[at];
    if (!pose) return;
    node.position.set(...pose.position);
    node.quaternion.set(...pose.quaternion);
    node.scale.set(...pose.scale);
  });
}
