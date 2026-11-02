/**
 * Physical space (ADR 0076): where an element is and which way it faces, kept in the model as its
 * pose, and how the physical-space panel beside the canvas reads it, kept in a view state. Meters,
 * right-handed, +Y up and +Z toward the front, as glTF writes, so that solids and poses agree.
 */
import type { Id } from './files';

/** Where a pose puts an element's origin, in meters, at most 1,000 km from its container's. */
export interface PosePoint {
  /**
   * @minimum -1000000
   * @maximum 1000000
   */
  x: number;
  /**
   * @minimum -1000000
   * @maximum 1000000
   */
  y: number;
  /**
   * @minimum -1000000
   * @maximum 1000000
   */
  z: number;
}

/** A point in the root's coordinates that the physical-space panel looks at, in meters. */
export interface SpaceTarget {
  /**
   * @minimum -100000000
   * @maximum 100000000
   */
  x: number;
  /**
   * @minimum -100000000
   * @maximum 100000000
   */
  y: number;
  /**
   * @minimum -100000000
   * @maximum 100000000
   */
  z: number;
}

/** A turn, as a unit quaternion, as glTF writes rotations. */
export interface Rotation {
  /**
   * @minimum -1
   * @maximum 1
   */
  x: number;
  /**
   * @minimum -1
   * @maximum 1
   */
  y: number;
  /**
   * @minimum -1
   * @maximum 1
   */
  z: number;
  /**
   * @minimum -1
   * @maximum 1
   */
  w: number;
}

/**
 * Where an element is in physical space and which way it faces, measured from one of its containers
 * or from World (ADR 0076).
 */
export interface Pose {
  /**
   * The container it is posed in, one of its containers under any nesting relation type; World when
   * left out.
   */
  in?: Id;
  /** Where its origin is, in meters, in that container's coordinates. */
  at: PosePoint;
  /** Which way it is turned; not turned when left out. */
  rotation?: Rotation;
}

/** Where the physical-space panel looks: around a point, from a direction, at a distance. */
export interface SpaceCamera {
  /** The point it turns around, in the root's coordinates, in meters. */
  target: SpaceTarget;
  /**
   * Degrees around +Y, 0 looking from +Z toward −Z.
   *
   * @minimum -180
   * @maximum 180
   */
  azimuth: number;
  /**
   * Degrees above the horizon, or below it when negative.
   *
   * @minimum -89
   * @maximum 89
   */
  elevation: number;
  /**
   * In meters.
   *
   * @exclusiveMinimum 0
   * @maximum 100000000
   */
  distance: number;
}

/** A cutting plane across one of the root's axes, keeping one side of it. */
export interface SpaceCut {
  axis: 'x' | 'y' | 'z';
  /**
   * Where the plane crosses the axis, in meters.
   *
   * @minimum -100000000
   * @maximum 100000000
   */
  at: number;
  /** The side kept: the one below the plane along its axis, or above. */
  keep: 'below' | 'above';
}

/**
 * The physical-space panel in a view state (ADR 0076); its presence means the panel is open.
 * Reading it changes nothing in the project.
 */
export interface SavedSpace {
  /** The panel's root: World when left out, or one element. */
  root?: Id;
  /** Where it looks; left out, it fits what it draws. */
  camera?: SpaceCamera;
  cut?: SpaceCut;
  /**
   * How far each part moves away from the middle of what holds it: 0, the default, to 2.
   *
   * @minimum 0
   * @maximum 2
   */
  explode?: number;
  /** Whether the selection's relations are drawn in space; left out, they are not. */
  relations?: boolean;
  /** Whether names are written for the parts nearest the camera; left out, they are not. */
  names?: boolean;
  /**
   * Joints' positions the panel shows, by joint, over their own (ADR 0090): degrees for a joint that
   * turns, meters for one that slides. A tour's step moves the chain to them, gliding from the step
   * before. Reading it changes nothing in the project.
   */
  joints?: JointPositions;
}

/**
 * Positions of joints by their ids.
 *
 * @maxProperties 200
 */
export interface JointPositions {
  [joint: string]: number;
}
