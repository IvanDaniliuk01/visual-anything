/**
 * The solids a package defines and the appearances that show them (ADR 0075). A solid is the form of
 * something in three dimensions: a glTF 2.0 file that the local program cleaned into a canonical GLB,
 * kept beside the project as `solids/<hash>.glb`. The package keeps its definition, which is JSON
 * like the rest of it: who made it, its file's hash and size, and its description, which the core
 * reads from the file. Nothing in a solid runs or refers to anything outside it.
 */
import type { Id, LicenseId } from './files';

/** A point in a solid's space, in meters, +Y up, rounded to a tenth of a millimetre. */
export interface SpacePoint {
  /**
   * @minimum -100000
   * @maximum 100000
   */
  x: number;
  /**
   * @minimum -100000
   * @maximum 100000
   */
  y: number;
  /**
   * @minimum -100000
   * @maximum 100000
   */
  z: number;
}

/** The smallest box, along the axes, that holds every vertex of a solid or a part. */
export interface SpaceBounds {
  min: SpacePoint;
  max: SpacePoint;
}

/**
 * A named part of a solid: one of its named nodes, holding the node's own geometry and everything below
 * it that is not a named part of its own (ADR 0075). Its name is its id.
 */
export interface SolidPart {
  /**
   * The node's name, as cleaning keeps or makes it.
   *
   * @pattern ^[A-Za-z_][\w.-]{0,63}$
   */
  name: string;
  /**
   * The index, in the solid's `parts`, of the part that holds it; left out for a part held by none.
   *
   * @minimum 0
   * @maximum 4095
   * @asType integer
   */
  parent?: number;
  /**
   * The vertex of its own geometry nearest the middle of its bounds: where relations end and its name
   * is written. Left out for a part that draws nothing of its own.
   */
  point?: SpacePoint;
  /**
   * Where the node's origin is at rest, in the solid's coordinates: what a joint anchored to it turns
   * about (ADR 0090). Left out in a definition written before it was kept, where its point stands in.
   */
  origin?: SpacePoint;
}

/** How a solid is looked at: from a direction, fitted to its bounds (ADR 0075). */
export interface SolidCamera {
  /**
   * Degrees around +Y, 0 looking from +Z, glTF's front, toward −Z.
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
   * 1 fits the solid's bounds with a margin of 4%; left out, 1.
   *
   * @minimum 0.25
   * @maximum 16
   */
  zoom?: number;
  /** The point it turns around; left out, the middle of the bounds. */
  target?: SpacePoint;
  /** `perspective`, with a vertical field of view of 30°, when left out; or `orthographic`. */
  projection?: 'perspective' | 'orthographic';
}

/** What a solid's file holds, counted as the core reads it. */
export interface SolidCounts {
  /**
   * @minimum 0
   * @asType integer
   */
  triangles: number;
  /**
   * @minimum 0
   * @asType integer
   */
  vertices: number;
  /**
   * @minimum 0
   * @asType integer
   */
  nodes: number;
  /**
   * @minimum 0
   * @asType integer
   */
  textures: number;
}

/** One animation of a solid: keyframes that move its nodes. */
export interface SolidAnimation {
  /**
   * In seconds.
   *
   * @minimum 0
   * @maximum 60
   */
  duration: number;
}

/** A solid a package defines, kept as the local program cleaned it (ADR 0075). */
export interface SolidDefinition {
  /** Starts with its package's id, as in `robotics.arm-k3f9q2`. */
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Its text alternative, which the outline, the inspector and announcements give with its shapes.
   *
   * @maxLength 1000
   */
  description?: string;
  /**
   * Where it comes from, such as "Drawn for Visual Anything".
   *
   * @maxLength 500
   */
  source?: string;
  /** The license it is shared under, by its SPDX identifier (ADR 0047). */
  license?: LicenseId;
  /**
   * The SHA-256 of its cleaned file, in lowercase hexadecimal, which names the file
   * `solids/<hash>.glb`.
   *
   * @pattern ^[0-9a-f]{64}$
   */
  hash: string;
  /**
   * The size of its file, in bytes.
   *
   * @minimum 1
   * @maximum 33554432
   * @asType integer
   */
  bytes: number;
  bounds: SpaceBounds;
  counts: SolidCounts;
  /**
   * Its named parts, in depth-first order.
   *
   * @maxItems 4096
   */
  parts: SolidPart[];
  /** The camera its pictures are drawn from, unless an appearance gives its own. */
  camera: SolidCamera;
  /**
   * Its animations, in its file's order; left out when there are none.
   *
   * @minItems 1
   * @maxItems 16
   */
  animations?: SolidAnimation[];
}

/** A solid an appearance shows (ADR 0075). */
export interface AppearanceSolid {
  /** The solid, by its id. */
  solid: Id;
  /**
   * `icon` beside the name, `drawing`, the default, on a plate above a name band, or `parts`, under
   * the header of a drawing with parts.
   */
  placement?: 'icon' | 'drawing' | 'parts';
  /** In place of the solid's own camera. */
  camera?: SolidCamera;
  /** `studio`, the default, or `flat`: base colors without light. */
  lighting?: 'studio' | 'flat';
}
