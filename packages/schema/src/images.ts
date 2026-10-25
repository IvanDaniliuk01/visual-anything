/**
 * The images a package defines and the appearances that show them. An image is data only: the core
 * cleans it before a command stores it, so nothing in it runs or refers to anything outside it.
 */
import type { Color, Id, LicenseId } from './files';

/**
 * A picture a package defines, kept as the core cleaned it.
 *
 * @discriminator kind
 */
export type ImageDefinition = SvgImage | BitmapImage;

/** A picture drawn from SVG: shapes, paths, gradients, clipping and masks only. */
export interface SvgImage {
  kind: 'svg';
  /** Starts with its package's id, as in `clinic.whatsapp-logo-k3f9q2`. */
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Where it comes from, such as "Simple Icons" or "Drawn for Visual Anything".
   *
   * @maxLength 500
   */
  source?: string;
  /**
   * The license it is shared under, by its SPDX identifier (ADR 0047). Every image of a built-in
   * package says, with one of the licenses ADR 0047 allows.
   */
  license?: LicenseId;
  /**
   * The width of its view box, which with its height gives its proportions.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  width: number;
  /**
   * The height of its view box.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  height: number;
  /**
   * Its SVG text as the core cleans it: one `svg` element with a `viewBox`, elements and attributes
   * from an allow-list only, and references only to its own parts.
   *
   * @minLength 1
   * @maxLength 65536
   * @pattern ^<svg[ >]
   */
  svg: string;
}

/** A picture kept as the bytes of a PNG, JPEG or WebP file, without its metadata. */
export interface BitmapImage {
  kind: 'bitmap';
  /** Starts with its package's id, as in `clinic.front-desk-4fj2ka`. */
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * Where it comes from.
   *
   * @maxLength 500
   */
  source?: string;
  /** The license it is shared under, by its SPDX identifier (ADR 0047). */
  license?: LicenseId;
  format: 'png' | 'jpeg' | 'webp';
  /**
   * Its width in pixels, as its header gives it.
   *
   * @minimum 1
   * @maximum 1024
   */
  width: number;
  /**
   * Its height in pixels, as its header gives it.
   *
   * @minimum 1
   * @maximum 1024
   */
  height: number;
  /**
   * Its bytes in base64.
   *
   * @minLength 4
   * @maxLength 262144
   * @pattern ^[A-Za-z0-9+/]*={0,2}$
   */
  data: string;
}

/** A picture an appearance shows. */
export interface AppearanceImage {
  /** The id of an image that a package in use defines. */
  image: Id;
  /**
   * `icon`, the default: small, beside the name, inside the shape. `drawing`: on a plate in place of
   * the shape, with the name under it. Shapes that hold other shapes or draw rows always show it as an
   * icon in their header, and rows as a small icon before their name.
   */
  placement?: 'icon' | 'drawing';
  /** When set, the picture is drawn as a silhouette of this colour: its shape kept, its colours replaced. */
  tint?: Color;
}
