/**
 * How the solid worker sets up a space before it draws it (ADR 0076), without the GPU, so that tests
 * can check it in Node. Everything is drawn relative to the point the camera turns around, so that
 * places far from the origin keep their precision on the GPU: the camera sits at its eye less its
 * target, and each entry's matrix moves by the target the other way.
 */
import type { SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { SPACE_FIELD_OF_VIEW, spaceEye } from '../../../space/camera';

/** The nearest the camera draws, as a share of its distance, and the farthest, as a multiple of it. */
const NEAR_SHARE = 1e-3;
const FAR_TIMES = 1e3;

/** three.js's camera for the panel's camera, relative to its target, for frames of this aspect. */
export function spaceThreeCamera(camera: SpaceCamera, aspect: number): PerspectiveCamera {
  const { target, distance } = camera;
  const eye = spaceEye(camera);
  const near = Math.max(distance * NEAR_SHARE, 1e-6);
  const three = new PerspectiveCamera(
    SPACE_FIELD_OF_VIEW,
    Number.isFinite(aspect) && aspect > 0 ? aspect : 1,
    near,
    Math.max(distance * FAR_TIMES, near * 2),
  );
  three.position.set(eye.x - target.x, eye.y - target.y, eye.z - target.z);
  three.up.set(0, 1, 0);
  three.lookAt(0, 0, 0);
  three.updateProjectionMatrix();
  three.updateMatrixWorld(true);
  return three;
}

/** An entry's matrix, column by column, moved so that the camera's target is the origin. */
export function relativeMatrix(matrix: readonly number[], target: SpacePoint): Matrix4 {
  const relative = new Matrix4().fromArray(matrix);
  const e = relative.elements;
  e[12] -= target.x;
  e[13] -= target.y;
  e[14] -= target.z;
  return relative;
}

/**
 * Where studio lighting's key light stands for a space: above the camera's left and a little toward
 * it, as for a solid's picture, as far from the target as the camera is.
 */
export function spaceKeyLight(camera: PerspectiveCamera): Vector3 {
  const distance = Math.max(camera.position.length(), 1e-6);
  return new Vector3(-1, 1.5, 1)
    .normalize()
    .multiplyScalar(distance)
    .applyQuaternion(camera.quaternion);
}
