/**
 * What a solid may hold (ADR 0075). Each cap is a named constant here, so that the local program's
 * cleaner, the core's reader, the solid worker and the tests read the same numbers. A file past one
 * is refused with `solid-too-large`, but for named parts: past 4,096, later named nodes lose their
 * names when cleaned, and the report and opening warn with `too-many-parts`.
 */
export const SOLID_CAPS = {
  /** The cleaned file, under the 100 MiB GitHub takes in one file: 32 MiB. */
  fileBytes: 32 * 1024 * 1024,
  /** Its JSON chunk: 8 MiB. */
  jsonBytes: 8 * 1024 * 1024,
  triangles: 1_000_000,
  vertices: 1_000_000,
  nodes: 8_192,
  /** Of the nodes, how many may be named parts. */
  parts: 4_096,
  meshes: 4_096,
  primitives: 8_192,
  materials: 256,
  textures: 32,
  /** Each texture's side, in pixels. */
  textureSide: 2_048,
  /** Each texture's pixels. */
  texturePixels: 16 * 1024 * 1024,
  /** Every texture's bytes together. */
  textureBytes: 16 * 1024 * 1024,
  animations: 16,
  /** Each animation's length, in seconds. */
  animationSeconds: 60,
  /** Every animation's channels together. */
  channels: 256,
  /** Every animation's keyframes together. */
  keyframes: 200_000,
  /** A solid's bounds, in meters: at most 100 km a side. */
  largestSide: 100_000,
  /** And at least a micrometre across. */
  smallestSpan: 0.000_001,
} as const;

/** The most solids a package defines, as `PackageFile.solids` caps them. */
export const MAX_PACKAGE_SOLIDS = 64;

/** The most bytes of solid files a package's solids name before the later ones draw placeholders. */
export const MAX_PACKAGE_SOLID_BYTES = 256 * 1024 * 1024;

/** From how many bytes of solid files a package's opening warns, with `large-solids`. */
export const LARGE_PACKAGE_SOLID_BYTES = 128 * 1024 * 1024;

/** The most bytes of solid files a project's packages name together. */
export const MAX_PROJECT_SOLID_BYTES = 512 * 1024 * 1024;

/** The extensions a canonical file may use: numbers, and nothing else (ADR 0075). */
export const SOLID_EXTENSIONS: readonly string[] = [
  'KHR_materials_unlit',
  'KHR_materials_emissive_strength',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
  'EXT_texture_webp',
];

/** The vertex attributes a canonical file keeps. */
export const SOLID_ATTRIBUTES: readonly string[] = [
  'POSITION',
  'NORMAL',
  'TANGENT',
  'TEXCOORD_0',
  'TEXCOORD_1',
  'COLOR_0',
];

/** A named part's name, the class ADR 0027 keeps for ids. */
export const SOLID_PART_NAME = /^[A-Za-z_][\w.-]{0,63}$/;
