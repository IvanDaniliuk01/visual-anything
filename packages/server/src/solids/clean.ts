/**
 * Cleaning a solid (ADR 0075): a glTF file, `.glb` or `.gltf` with its data inside, read and written
 * anew from an allow-list into the canonical form the core's reader takes.
 *
 * 1. `preflight.ts` reads the container, refuses every address and Draco, and takes out of the JSON
 *    what a solid keeps none of.
 * 2. `@gltf-transform/core` reads what is left, from JSON and bytes only: it is given no address it
 *    could resolve, and an address it asked for would be refused. Meshopt's compression is decoded
 *    with meshoptimizer.
 * 3. What a solid keeps is taken from what was read: the default scene's nodes, triangles, materials
 *    of the core model, PNG, JPEG and WebP textures rebuilt by the core's bitmap cleaner, and
 *    animations that move nodes. Units and the up axis go to meters with +Y up, node names follow
 *    the rule below, and the solid is simplified with meshoptimizer when asked.
 * 4. `canonical.ts` writes it, and the core's reader reads it back, which gives its description.
 *
 * This module, the reader and meshoptimizer load only in the cleaner's worker thread (`worker.ts`),
 * which the program starts when a solid is cleaned; the program's own thread never imports them.
 */
import {
  PlatformIO,
  Logger,
  type Accessor,
  type Document,
  type JSONDocument,
  type Material,
  type Mesh,
  type Node,
  type Primitive,
  type Texture,
  type TextureInfo,
} from '@gltf-transform/core';
import {
  EXTMeshoptCompression,
  EXTTextureWebP,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureTransform,
  type EmissiveStrength,
  type Transform as TextureTransform,
} from '@gltf-transform/extensions';
import {
  SOLID_ATTRIBUTES,
  SOLID_CAPS,
  SOLID_PART_NAME,
  SOLID_TEXTURE_CAPS,
  readBitmap,
  readImageHeader,
  readSolid,
  type Problem,
  type SolidDescription,
  type SolidImportOptions,
} from '@visual-anything/core';
import {
  writeCanonicalSolid,
  type CleanAnimation,
  type CleanChannel,
  type CleanMaterial,
  type CleanMesh,
  type CleanNode,
  type CleanPrimitive,
  type CleanSampler,
  type CleanSolid,
  type CleanTexture,
  type CleanTextureRef,
  type Interpolation,
  type Quat,
  type TextureMime,
  type Vec3,
} from './canonical';
import { CleaningRefusal, invalid, preflightSolid, tooLarge, type Preflighted } from './preflight';
import { SolidReport } from './report';

/** A solid cleaned: its canonical file, its hash, its description and the report. */
export type CleanedSolid =
  | {
      ok: true;
      bytes: Uint8Array;
      hash: string;
      description: SolidDescription;
      /** What cleaning dropped or changed, line by line, in the core's words. */
      report: string[];
      /** The file's copyright, offered as the solid's source. */
      source?: string;
    }
  | { ok: false; problems: Problem[] };

/** Meters in each unit a file may be written in. */
export const UNIT_METERS = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254 } as const;

const UNIT_NAMES = { m: 'meters', cm: 'centimetres', mm: 'millimetres', in: 'inches' } as const;

/** Turning +Z up into +Y up: −90° around X, as a quaternion. */
const Z_UP: Quat = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/** The glTF reader, given bytes only: it can resolve no address. */
class BytesOnlyIO extends PlatformIO {
  protected readURI(uri: string, type: 'view'): Promise<Uint8Array<ArrayBuffer>>;
  protected readURI(uri: string, type: 'text'): Promise<string>;
  protected readURI(): Promise<never> {
    return Promise.reject(new Error('Cleaning a solid reads no address.'));
  }
  protected resolve(_base: string, path: string): string {
    return path;
  }
  protected dirname(): string {
    return '';
  }
}

/** Cleans a file into a solid's canonical file. Never throws on bytes. */
export async function cleanSolid(
  input: Uint8Array,
  options: SolidImportOptions = {},
): Promise<CleanedSolid> {
  const report = new SolidReport();
  try {
    const preflighted = preflightSolid(input, report);
    const document = await readDocument(preflighted);
    const solid = await keep(document, options, report);
    const bytes = writeCanonicalSolid(solid);
    if (bytes.length > SOLID_CAPS.fileBytes) {
      tooLarge(
        `Cleaned, it would be ${mebibytes(bytes.length)} MiB, past the 32 MiB of a solid's file: simplify it, or make its textures smaller.`,
      );
    }
    const read = readSolid(bytes);
    if (!read.ok) return { ok: false, problems: read.problems };
    return {
      ok: true,
      bytes,
      hash: read.hash,
      description: read.description,
      report: report.lines(),
      ...(preflighted.copyright === undefined ? {} : { source: preflighted.copyright }),
    };
  } catch (error) {
    if (error instanceof CleaningRefusal) return { ok: false, problems: [error.problem] };
    if (error instanceof RangeError && /alloc|memory|Invalid array length/i.test(error.message)) {
      return {
        ok: false,
        problems: [
          {
            code: 'solid-too-large',
            message: 'Cleaning the file needs more memory than it may use.',
          },
        ],
      };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      problems: [
        { code: 'invalid-solid', message: `The file could not be read as glTF: ${reason}` },
      ],
    };
  }
}

async function readDocument(preflighted: Preflighted): Promise<Document> {
  const io = new BytesOnlyIO()
    .setLogger(new Logger(Logger.Verbosity.SILENT))
    .registerExtensions([
      KHRMaterialsUnlit,
      KHRMaterialsEmissiveStrength,
      KHRTextureTransform,
      KHRMeshQuantization,
      EXTTextureWebP,
      EXTMeshoptCompression,
    ]);
  if (preflighted.meshopt) {
    const { MeshoptDecoder } = await import('meshoptimizer/decoder');
    await MeshoptDecoder.ready;
    io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  }
  return io.readJSON({
    json: preflighted.json as unknown as JSONDocument['json'],
    resources: preflighted.resources as Record<string, Uint8Array<ArrayBuffer>>,
  });
}

/** What a solid keeps of what was read, in meters with +Y up. */
async function keep(
  document: Document,
  options: SolidImportOptions,
  report: SolidReport,
): Promise<CleanSolid> {
  const meters = UNIT_METERS[options.units ?? 'm'];
  const zUp = options.up === 'z';
  if (options.units !== undefined && options.units !== 'm') {
    report.note(`It was scaled from ${UNIT_NAMES[options.units]} to meters.`);
  }
  if (zUp) report.note('It was turned so that +Y is up, where +Z was.');

  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const roots = scene
    ? scene.listChildren()
    : root.listNodes().filter((node) => node.getParentNode() === null);

  // Depth-first order, without recursion: a node, then what it holds, in order.
  const order: Node[] = [];
  const stack = [...roots].reverse();
  const seen = new Set<Node>();
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    if (seen.has(node)) invalid('A node has more than one holder, or holds itself.');
    seen.add(node);
    order.push(node);
    stack.push(...node.listChildren().reverse());
  }

  const textures = new Textures(report);
  const materials = new Map<Material, number>();
  const cleanMaterials: CleanMaterial[] = [];
  const materialOf = (material: Material | null): number | undefined => {
    if (material === null) return undefined;
    let at = materials.get(material);
    if (at === undefined) {
      at = cleanMaterials.length;
      materials.set(material, at);
      cleanMaterials.push(cleanMaterial(material, textures));
    }
    return at;
  };
  const converted = new Map<Mesh, CleanPrimitive[]>();
  const primitivesOf = (mesh: Mesh): CleanPrimitive[] => {
    let primitives = converted.get(mesh);
    if (primitives === undefined) {
      primitives = mesh.listPrimitives().flatMap((primitive) => {
        const kept = convertPrimitive(primitive, meters, report);
        if (kept === undefined) return [];
        const material = materialOf(primitive.getMaterial());
        return [material === undefined ? kept : { ...kept, material }];
      });
      converted.set(mesh, primitives);
    }
    return primitives;
  };

  // A node is kept when it draws something, or holds a node that does.
  const kept = new Set<Node>();
  for (let at = order.length - 1; at >= 0; at -= 1) {
    const node = order[at] as Node;
    const mesh = node.getMesh();
    const draws = mesh !== null && primitivesOf(mesh).length > 0;
    if (draws || node.listChildren().some((child) => kept.has(child))) kept.add(node);
  }
  report.add('node that draws nothing', 'nodes that draw nothing', order.length - kept.size);
  const keptOrder = order.filter((node) => kept.has(node));
  if (keptOrder.length === 0) invalid('The file draws no triangle a solid keeps.');

  const indexOf = new Map(keptOrder.map((node, at) => [node, at]));
  const rootSet = new Set(roots);
  const meshIndexes = new Map<Mesh, number>();
  const meshes: CleanMesh[] = [];
  const names = new Names(report);
  const nodes: CleanNode[] = keptOrder.map((node) => {
    const mesh = node.getMesh();
    let meshIndex: number | undefined;
    if (mesh !== null && primitivesOf(mesh).length > 0) {
      meshIndex = meshIndexes.get(mesh);
      if (meshIndex === undefined) {
        meshIndex = meshes.length;
        meshIndexes.set(mesh, meshIndex);
        meshes.push({ primitives: primitivesOf(mesh) });
      }
    }
    let translation = scaled(finiteOr(node.getTranslation(), [0, 0, 0]), meters);
    let rotation = finiteOr(node.getRotation(), [0, 0, 0, 1]) as unknown as Quat;
    if (zUp && rootSet.has(node)) {
      translation = turned(translation);
      rotation = multiply(Z_UP, rotation);
    }
    const name = names.take(node.getName());
    return {
      ...(name === undefined ? {} : { name }),
      children: node
        .listChildren()
        .filter((child) => kept.has(child))
        .map((child) => indexOf.get(child) as number),
      ...(meshIndex === undefined ? {} : { mesh: meshIndex }),
      translation,
      rotation,
      scale: finiteOr(node.getScale(), [1, 1, 1]) as unknown as Vec3,
    };
  });
  names.finish();

  const animations = keepAnimations(document, indexOf, rootSet, meters, zUp, report);
  const solid: CleanSolid = {
    nodes,
    roots: roots.filter((node) => kept.has(node)).map((node) => indexOf.get(node) as number),
    meshes,
    materials: cleanMaterials,
    textures: textures.list,
    animations,
  };
  await fitTriangles(solid, options.simplify === true, report);
  checkCaps(solid);
  return solid;
}

/** The caps on what a solid holds that cleaning does not bring within them itself. */
function checkCaps(solid: CleanSolid): void {
  const over = (count: number, most: number, what: string) => {
    if (count > most) {
      tooLarge(
        `It keeps ${count.toLocaleString('en')} ${what}, past the ${most.toLocaleString('en')} a solid holds.`,
      );
    }
  };
  over(solid.nodes.length, SOLID_CAPS.nodes, 'nodes');
  over(solid.meshes.length, SOLID_CAPS.meshes, 'meshes');
  over(
    solid.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
    SOLID_CAPS.primitives,
    'primitives',
  );
  over(solid.materials.length, SOLID_CAPS.materials, 'materials');
  over(solid.animations.length, SOLID_CAPS.animations, 'animations');
  over(
    solid.animations.reduce((sum, each) => sum + each.channels.length, 0),
    SOLID_CAPS.channels,
    'animation channels',
  );
  over(
    solid.animations.reduce(
      (sum, each) =>
        sum + each.channels.reduce((inner, channel) => inner + channel.times.length, 0),
      0,
    ),
    SOLID_CAPS.keyframes,
    'keyframes',
  );
}

// --- Primitives ----------------------------------------------------------------------------------

const POINTS_OR_LINES = new Set([0, 1, 2, 3]);
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

/** A primitive as a solid keeps it, or nothing when it keeps none of it. */
function convertPrimitive(
  primitive: Primitive,
  meters: number,
  report: SolidReport,
): CleanPrimitive | undefined {
  const mode = primitive.getMode();
  if (POINTS_OR_LINES.has(mode)) {
    report.add('primitive of points or lines', 'primitives of points or lines');
    return undefined;
  }
  const position = primitive.getAttribute('POSITION');
  if (position === null || position.getType() !== 'VEC3') {
    report.add('primitive without positions', 'primitives without positions');
    return undefined;
  }
  const count = position.getCount();
  const positions = floats(position, 3);
  for (let at = 0; at < positions.length; at += 1) {
    const value = positions[at] as number;
    if (!Number.isFinite(value)) invalid('A position of the file is not a finite number.');
    positions[at] = value * meters;
  }
  const kept: Omit<CleanPrimitive, 'indices'> = { positions };
  const types: Record<string, string[]> = {
    NORMAL: ['VEC3'],
    TANGENT: ['VEC4'],
    TEXCOORD_0: ['VEC2'],
    TEXCOORD_1: ['VEC2'],
    COLOR_0: ['VEC3', 'VEC4'],
  };
  for (const semantic of primitive.listSemantics()) {
    if (semantic === 'POSITION') continue;
    const accessor = primitive.getAttribute(semantic) as Accessor;
    if (!SOLID_ATTRIBUTES.includes(semantic) || !types[semantic]?.includes(accessor.getType())) {
      report.add(
        'vertex attribute a solid keeps none of',
        'vertex attributes a solid keeps none of',
      );
      continue;
    }
    if (accessor.getCount() !== count) {
      invalid('The attributes of a primitive do not have as many vertices as its positions.');
    }
    if (semantic === 'NORMAL') kept.normals = floats(accessor, 3);
    else if (semantic === 'TANGENT') kept.tangents = floats(accessor, 4);
    else if (semantic === 'TEXCOORD_0') kept.texcoords0 = finite(floats(accessor, 2));
    else if (semantic === 'TEXCOORD_1') kept.texcoords1 = finite(floats(accessor, 2));
    else kept.colors = colors(accessor);
  }

  const given = primitive.getIndices();
  let indices: Uint32Array;
  if (given === null) {
    indices = new Uint32Array(count);
    for (let at = 0; at < count; at += 1) indices[at] = at;
  } else {
    if (given.getType() !== 'SCALAR') invalid("A primitive's indices are not whole numbers.");
    indices = new Uint32Array(given.getCount());
    const element: number[] = [];
    for (let at = 0; at < indices.length; at += 1) {
      const value = given.getElement(at, element)[0] as number;
      if (!Number.isInteger(value) || value < 0 || value >= count) {
        invalid('A triangle of the file names a vertex its primitive does not have.');
      }
      indices[at] = value;
    }
  }
  let triangles: Uint32Array;
  if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) {
    triangles = mode === TRIANGLE_STRIP ? fromStrip(indices) : fromFan(indices);
    report.add(
      'primitive of triangle strips or fans, made a list of triangles',
      'primitives of triangle strips or fans, made lists of triangles',
    );
  } else {
    triangles =
      indices.length % 3 === 0 ? indices : indices.slice(0, indices.length - (indices.length % 3));
  }
  if (triangles.length === 0) {
    report.add('primitive that draws no triangle', 'primitives that draw no triangle');
    return undefined;
  }
  return { ...kept, indices: triangles };
}

function fromStrip(strip: Uint32Array): Uint32Array {
  const out: number[] = [];
  for (let at = 0; at + 2 < strip.length; at += 1) {
    const a = strip[at] as number;
    const b = strip[at + 1] as number;
    const c = strip[at + 2] as number;
    if (a === b || b === c || a === c) continue;
    if (at % 2 === 0) out.push(a, b, c);
    else out.push(b, a, c);
  }
  return Uint32Array.from(out);
}

function fromFan(fan: Uint32Array): Uint32Array {
  const out: number[] = [];
  const a = fan[0] as number;
  for (let at = 1; at + 1 < fan.length; at += 1) {
    const b = fan[at] as number;
    const c = fan[at + 1] as number;
    if (a === b || b === c || a === c) continue;
    out.push(a, b, c);
  }
  return Uint32Array.from(out);
}

/** An accessor's elements as floats, normalized integers read as glTF reads them. */
function floats(accessor: Accessor, width: number): Float32Array {
  const count = accessor.getCount();
  const out = new Float32Array(count * width);
  const element: number[] = [];
  for (let at = 0; at < count; at += 1) {
    accessor.getElement(at, element);
    for (let c = 0; c < width; c += 1) out[at * width + c] = element[c] ?? 0;
  }
  return out;
}

function finite(values: Float32Array): Float32Array {
  for (let at = 0; at < values.length; at += 1) {
    if (!Number.isFinite(values[at])) values[at] = 0;
  }
  return values;
}

/** Colors as r, g, b and a from 0 to 1, a color of three numbers gaining an alpha of 1. */
function colors(accessor: Accessor): Float32Array {
  const width = accessor.getType() === 'VEC4' ? 4 : 3;
  const read = floats(accessor, width);
  const count = accessor.getCount();
  const out = new Float32Array(count * 4);
  for (let at = 0; at < count; at += 1) {
    for (let c = 0; c < 4; c += 1) {
      const value = c < width ? (read[at * width + c] as number) : 1;
      out[at * 4 + c] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    }
  }
  return out;
}

// --- Materials and textures ----------------------------------------------------------------------

function cleanMaterial(material: Material, textures: Textures): CleanMaterial {
  const base = material.getBaseColorFactor();
  const emissive = material.getEmissiveFactor();
  const strength = material
    .getExtension<EmissiveStrength>('KHR_materials_emissive_strength')
    ?.getEmissiveStrength();
  const normal = textures.ref(material.getNormalTexture(), material.getNormalTextureInfo());
  const occlusion = textures.ref(
    material.getOcclusionTexture(),
    material.getOcclusionTextureInfo(),
  );
  const baseColor = textures.ref(
    material.getBaseColorTexture(),
    material.getBaseColorTextureInfo(),
  );
  const metallicRoughness = textures.ref(
    material.getMetallicRoughnessTexture(),
    material.getMetallicRoughnessTextureInfo(),
  );
  const emissiveTexture = textures.ref(
    material.getEmissiveTexture(),
    material.getEmissiveTextureInfo(),
  );
  const alphaMode = material.getAlphaMode();
  return {
    baseColorFactor: [unit(base[0]), unit(base[1]), unit(base[2]), unit(base[3])],
    ...(baseColor === undefined ? {} : { baseColorTexture: baseColor }),
    metallicFactor: unit(material.getMetallicFactor()),
    roughnessFactor: unit(material.getRoughnessFactor()),
    ...(metallicRoughness === undefined ? {} : { metallicRoughnessTexture: metallicRoughness }),
    ...(normal === undefined
      ? {}
      : { normalTexture: { ...normal, scale: bounded(material.getNormalScale(), -100, 100, 1) } }),
    ...(occlusion === undefined
      ? {}
      : { occlusionTexture: { ...occlusion, strength: unit(material.getOcclusionStrength()) } }),
    ...(emissiveTexture === undefined ? {} : { emissiveTexture }),
    emissiveFactor: [unit(emissive[0]), unit(emissive[1]), unit(emissive[2])],
    ...(strength === undefined || strength === 1
      ? {}
      : { emissiveStrength: bounded(strength, 0, 10_000, 1) }),
    alphaMode: alphaMode === 'MASK' || alphaMode === 'BLEND' ? alphaMode : 'OPAQUE',
    alphaCutoff: bounded(material.getAlphaCutoff(), 0, 1, 0.5),
    doubleSided: material.getDoubleSided() === true,
    unlit: material.getExtension('KHR_materials_unlit') !== null,
  };
}

const MAG_FILTERS = new Set([9728, 9729]);
const MIN_FILTERS = new Set([9728, 9729, 9984, 9985, 9986, 9987]);
const WRAPS = new Set([33071, 33648, 10497]);

/** The textures a solid keeps: each picture cleaned once, within the caps on textures. */
class Textures {
  readonly list: CleanTexture[] = [];
  readonly #pictures = new Map<Texture, { bytes: Uint8Array; mimeType: TextureMime } | null>();
  readonly #indexes = new Map<string, number>();
  readonly #ids = new Map<Texture, number>();
  #bytes = 0;
  readonly #report: SolidReport;

  constructor(report: SolidReport) {
    this.#report = report;
  }

  /** Where a material reads a texture, or nothing when the solid keeps none of it. */
  ref(texture: Texture | null, info: TextureInfo | null): CleanTextureRef | undefined {
    if (texture === null || info === null) return undefined;
    const texCoord = info.getTexCoord();
    const transform = info.getExtension<TextureTransform>('KHR_texture_transform');
    const transformCoord = transform?.getTexCoord() ?? null;
    if (texCoord > 1 || (transformCoord !== null && transformCoord > 1)) {
      this.#report.add(
        'texture that reads coordinates a solid drops',
        'textures that read coordinates a solid drops',
      );
      return undefined;
    }
    const picture = this.#picture(texture);
    if (picture === null) return undefined;
    const sampler: CleanSampler = {
      ...(MAG_FILTERS.has(info.getMagFilter() ?? 0)
        ? { magFilter: info.getMagFilter() as number }
        : {}),
      ...(MIN_FILTERS.has(info.getMinFilter() ?? 0)
        ? { minFilter: info.getMinFilter() as number }
        : {}),
      wrapS: WRAPS.has(info.getWrapS()) ? info.getWrapS() : 10497,
      wrapT: WRAPS.has(info.getWrapT()) ? info.getWrapT() : 10497,
    };
    let id = this.#ids.get(texture);
    if (id === undefined) {
      id = this.#ids.size;
      this.#ids.set(texture, id);
    }
    const key = `${id}|${JSON.stringify(sampler)}`;
    let index = this.#indexes.get(key);
    if (index === undefined) {
      if (this.list.length >= SOLID_CAPS.textures) {
        this.#report.add('texture past its caps', 'textures past their caps');
        return undefined;
      }
      index = this.list.length;
      this.list.push({ image: picture.bytes, mimeType: picture.mimeType, sampler });
      this.#indexes.set(key, index);
    }
    return {
      texture: index,
      texCoord,
      ...(transform === null
        ? {}
        : {
            transform: {
              offset: [num(transform.getOffset()[0]), num(transform.getOffset()[1])],
              rotation: num(transform.getRotation()),
              scale: [num(transform.getScale()[0], 1), num(transform.getScale()[1], 1)],
              ...(transformCoord === null ? {} : { texCoord: transformCoord }),
            },
          }),
    };
  }

  /** A texture's picture cleaned by the core's bitmap cleaner, or null when it is not kept. */
  #picture(texture: Texture): { bytes: Uint8Array; mimeType: TextureMime } | null {
    const known = this.#pictures.get(texture);
    if (known !== undefined) return known;
    const picture = this.#clean(texture);
    this.#pictures.set(texture, picture);
    return picture;
  }

  #clean(texture: Texture): { bytes: Uint8Array; mimeType: TextureMime } | null {
    const bytes = texture.getImage();
    const header = bytes === null ? undefined : readImageHeader(bytes);
    if (
      bytes === null ||
      header === undefined ||
      (header.format !== 'png' && header.format !== 'jpeg' && header.format !== 'webp')
    ) {
      this.#report.add('texture in another format', 'textures in other formats');
      return null;
    }
    if (
      header.width > SOLID_CAPS.textureSide ||
      header.height > SOLID_CAPS.textureSide ||
      header.width * header.height > SOLID_CAPS.texturePixels
    ) {
      this.#report.add('texture past its caps', 'textures past their caps');
      return null;
    }
    const cleaned = readBitmap(bytes, header.format, SOLID_TEXTURE_CAPS);
    if (!cleaned.ok) {
      if (cleaned.problem.code === 'image-too-large') {
        this.#report.add('texture past its caps', 'textures past their caps');
      } else this.#report.add('texture that could not be read', 'textures that could not be read');
      return null;
    }
    if (this.#bytes + cleaned.value.bytes.length > SOLID_CAPS.textureBytes) {
      this.#report.add('texture past its caps', 'textures past their caps');
      return null;
    }
    this.#bytes += cleaned.value.bytes.length;
    if (cleaned.removed.length > 0) {
      this.#report.note(
        'Its textures were rebuilt without their text, positions, profiles and times.',
      );
    }
    return { bytes: cleaned.value.bytes, mimeType: `image/${header.format}` };
  }
}

// --- Names ---------------------------------------------------------------------------------------

/**
 * Node names, in depth-first order (ADR 0075): a name of the class `[A-Za-z_][\w.-]{0,63}` that no
 * earlier node has is kept; any other has each character outside `[\w.-]` made `_`, gains a leading
 * `_` when it does not start with a letter or `_`, is cut to 64 characters, and gains `-2`, `-3` and
 * so on when it is taken. Past 4,096 named nodes, later ones lose their names.
 */
class Names {
  readonly #taken = new Set<string>();
  #past = 0;
  readonly #report: SolidReport;

  constructor(report: SolidReport) {
    this.#report = report;
  }

  take(given: string): string | undefined {
    if (given === '') return undefined;
    if (this.#taken.size >= SOLID_CAPS.parts) {
      this.#past += 1;
      return undefined;
    }
    let name = given;
    if (!SOLID_PART_NAME.test(name) || this.#taken.has(name)) {
      let base = given.replace(/[^\w.-]/g, '_');
      if (!/^[A-Za-z_]/.test(base)) base = `_${base}`;
      base = base.slice(0, 64);
      name = base;
      for (let n = 2; this.#taken.has(name); n += 1) {
        const suffix = `-${n}`;
        name = `${base.slice(0, 64 - suffix.length)}${suffix}`;
      }
      this.#report.renamed(given, name);
    }
    this.#taken.add(name);
    return name;
  }

  finish(): void {
    if (this.#past > 0) {
      this.#report.add(
        'named node past the 4,096 a solid names, drawn as part of the part holding it',
        'named nodes past the 4,096 a solid names, drawn as part of the parts holding them',
        this.#past,
      );
    }
  }
}

// --- Animations ----------------------------------------------------------------------------------

function keepAnimations(
  document: Document,
  indexOf: ReadonlyMap<Node, number>,
  roots: ReadonlySet<Node>,
  meters: number,
  zUp: boolean,
  report: SolidReport,
): CleanAnimation[] {
  const times = new Map<Accessor, Float32Array | null>();
  const timesOf = (input: Accessor): Float32Array | null => {
    let known = times.get(input);
    if (known === undefined) {
      known = input.getType() === 'SCALAR' ? floats(input, 1) : null;
      if (known !== null && known.some((time) => !(time >= 0) || !Number.isFinite(time))) {
        known = null;
      }
      times.set(input, known);
    }
    return known;
  };
  const animations: CleanAnimation[] = [];
  for (const animation of document.getRoot().listAnimations()) {
    const channels: CleanChannel[] = [];
    let dropped = 0;
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      const path = channel.getTargetPath();
      const sampler = channel.getSampler();
      const target = node === null ? undefined : indexOf.get(node);
      const input = sampler?.getInput() ?? null;
      const output = sampler?.getOutput() ?? null;
      if (
        target === undefined ||
        (path !== 'translation' && path !== 'rotation' && path !== 'scale') ||
        input === null ||
        output === null
      ) {
        dropped += 1;
        continue;
      }
      const keyTimes = timesOf(input);
      const interpolation: Interpolation = sampler?.getInterpolation() ?? 'LINEAR';
      const width = path === 'rotation' ? 4 : 3;
      const expected = (keyTimes?.length ?? 0) * (interpolation === 'CUBICSPLINE' ? 3 : 1);
      if (
        keyTimes === null ||
        !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation) ||
        output.getCount() !== expected ||
        output.getElementSize() !== width
      ) {
        dropped += 1;
        continue;
      }
      const values = floats(output, width);
      if (values.some((value) => !Number.isFinite(value))) {
        dropped += 1;
        continue;
      }
      const isRoot = node !== null && roots.has(node);
      for (let at = 0; at < values.length; at += width) {
        if (path === 'translation') {
          let point: Vec3 = [
            (values[at] as number) * meters,
            (values[at + 1] as number) * meters,
            (values[at + 2] as number) * meters,
          ];
          if (zUp && isRoot) point = turned(point);
          values.set(point, at);
        } else if (path === 'rotation' && zUp && isRoot) {
          const turnedRotation = multiply(Z_UP, [
            values[at] as number,
            values[at + 1] as number,
            values[at + 2] as number,
            values[at + 3] as number,
          ]);
          values.set(turnedRotation, at);
        }
      }
      const duration = keyTimes.reduce((most, time) => Math.max(most, time), 0);
      if (duration > SOLID_CAPS.animationSeconds) {
        tooLarge(
          `An animation of the file lasts ${Math.round(duration)} s, past the 60 s a solid keeps.`,
        );
      }
      channels.push({ node: target, path, times: keyTimes, values, interpolation });
    }
    report.add(
      'animation channel that moves nothing a solid keeps',
      'animation channels that move nothing a solid keeps',
      dropped,
    );
    if (channels.length === 0) {
      report.add(
        'animation that moves nothing a solid keeps',
        'animations that move nothing a solid keeps',
      );
      continue;
    }
    animations.push({ channels });
  }
  return animations;
}

// --- Simplifying ---------------------------------------------------------------------------------

/** The triangles and vertices the solid's nodes draw, a mesh counted once for each node drawing it. */
function drawn(solid: CleanSolid): { triangles: number; vertices: number } {
  let triangles = 0;
  let vertices = 0;
  for (const node of solid.nodes) {
    if (node.mesh === undefined) continue;
    for (const primitive of (solid.meshes[node.mesh] as CleanMesh).primitives) {
      triangles += primitive.indices.length / 3;
      vertices += primitive.positions.length / 3;
    }
  }
  return { triangles, vertices };
}

/**
 * Brings the triangles and vertices within the caps: with meshoptimizer's simplifier when asked,
 * each primitive on its own so that each node keeps its own geometry; otherwise the file is refused.
 */
async function fitTriangles(
  solid: CleanSolid,
  simplify: boolean,
  report: SolidReport,
): Promise<void> {
  const before = drawn(solid);
  if (before.triangles <= SOLID_CAPS.triangles && before.vertices <= SOLID_CAPS.vertices) return;
  if (!simplify) {
    if (before.triangles > SOLID_CAPS.triangles) {
      tooLarge(
        `It draws ${before.triangles.toLocaleString('en')} triangles, past the 1,000,000 a solid holds: simplify it to fit.`,
      );
    }
    tooLarge(
      `It draws ${before.vertices.toLocaleString('en')} vertices, past the 1,000,000 a solid holds: simplify it to fit.`,
    );
  }
  const { MeshoptSimplifier } = await import('meshoptimizer/simplifier');
  await MeshoptSimplifier.ready;
  for (const mesh of solid.meshes) mesh.primitives = mesh.primitives.map(weld);
  let now = drawn(solid);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (now.triangles <= SOLID_CAPS.triangles && now.vertices <= SOLID_CAPS.vertices) break;
    const ratio =
      Math.min(SOLID_CAPS.triangles / now.triangles, SOLID_CAPS.vertices / now.vertices) *
      (0.97 - attempt * 0.1);
    for (const mesh of solid.meshes) {
      mesh.primitives = mesh.primitives.map((primitive) => {
        const target = Math.max(3, Math.floor((primitive.indices.length * ratio) / 3) * 3);
        if (target >= primitive.indices.length) return primitive;
        const [indices] = MeshoptSimplifier.simplify(
          primitive.indices,
          primitive.positions,
          3,
          target,
          1,
          [],
        );
        return compact(primitive, indices);
      });
    }
    now = drawn(solid);
  }
  if (now.triangles > SOLID_CAPS.triangles || now.vertices > SOLID_CAPS.vertices) {
    tooLarge(
      `Simplified as far as it goes, it still draws ${now.triangles.toLocaleString('en')} triangles and ${now.vertices.toLocaleString('en')} vertices, past the 1,000,000 of each a solid holds.`,
    );
  }
  report.note(
    `It was simplified from ${before.triangles.toLocaleString('en')} to ${now.triangles.toLocaleString('en')} triangles, to fit.`,
  );
}

const ATTRIBUTES = [
  ['positions', 3],
  ['normals', 3],
  ['tangents', 4],
  ['texcoords0', 2],
  ['texcoords1', 2],
  ['colors', 4],
] as const;

/** A primitive with the vertices that are equal in every attribute made one, so that it can simplify. */
function weld(primitive: CleanPrimitive): CleanPrimitive {
  const count = primitive.positions.length / 3;
  const present = ATTRIBUTES.filter(([key]) => primitive[key] !== undefined);
  const keys = new Map<string, number>();
  const remap = new Uint32Array(count);
  const parts: number[] = [];
  for (let at = 0; at < count; at += 1) {
    parts.length = 0;
    for (const [key, width] of present) {
      const data = primitive[key] as Float32Array;
      for (let c = 0; c < width; c += 1) parts.push(data[at * width + c] as number);
    }
    const key = parts.join(',');
    let first = keys.get(key);
    if (first === undefined) {
      first = at;
      keys.set(key, at);
    }
    remap[at] = first;
  }
  const indices = primitive.indices.map((index) => remap[index] as number);
  return compact(primitive, indices);
}

/** A primitive with only the vertices its triangles use, in the order they first use them. */
function compact(primitive: CleanPrimitive, indices: Uint32Array): CleanPrimitive {
  const count = primitive.positions.length / 3;
  const next = new Int32Array(count).fill(-1);
  const order: number[] = [];
  const out = new Uint32Array(indices.length);
  for (let at = 0; at < indices.length; at += 1) {
    const index = indices[at] as number;
    if ((next[index] as number) < 0) {
      next[index] = order.length;
      order.push(index);
    }
    out[at] = next[index] as number;
  }
  const result: CleanPrimitive = {
    positions: new Float32Array(0),
    indices: out,
    ...(primitive.material === undefined ? {} : { material: primitive.material }),
  };
  for (const [key, width] of ATTRIBUTES) {
    const data = primitive[key];
    if (data === undefined) continue;
    const kept = new Float32Array(order.length * width);
    order.forEach((index, at) => {
      for (let c = 0; c < width; c += 1) kept[at * width + c] = data[index * width + c] as number;
    });
    result[key] = kept;
  }
  return result;
}

// --- Numbers -------------------------------------------------------------------------------------

function scaled(value: readonly number[], by: number): Vec3 {
  return [(value[0] ?? 0) * by, (value[1] ?? 0) * by, (value[2] ?? 0) * by];
}

/** A point turned from +Z up to +Y up: (x, y, z) becomes (x, z, −y). */
function turned([x, y, z]: Vec3): Vec3 {
  return [x, z, y === 0 ? 0 : -y];
}

/** The Hamilton product a ⊗ b of two quaternions, x, y, z and w. */
function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** A node's numbers, or the default when splitting its matrix gave anything but finite numbers. */
function finiteOr(value: readonly number[], fallback: readonly number[]): number[] {
  return value.length === fallback.length && value.every((each) => Number.isFinite(each))
    ? [...value]
    : [...fallback];
}

function unit(value: number | undefined): number {
  return bounded(value, 0, 1, 0);
}

function bounded(value: number | undefined, least: number, most: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(most, Math.max(least, value));
}

function num(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mebibytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
