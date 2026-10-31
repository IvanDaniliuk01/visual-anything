/**
 * The solid worker's reader (ADR 0075): it builds three.js objects from a solid's canonical file,
 * read by the core's strict reader, and never by three.js's GLTFLoader, which resolves addresses and
 * fetches embedded images through addresses of its own. Nothing here fetches, and no address is ever
 * made: the file's bytes are checked against their hash and the canonical form, then its geometry,
 * materials, textures, nodes and animations are made from those bytes alone.
 *
 * - **Geometry** keeps its attributes as the file stores them, quantized ones included
 *   (`KHR_mesh_quantization`): three.js reads normalized integers natively. Each accessor becomes one
 *   attribute, shared by every primitive that names it.
 * - **Materials** are the core metallic-roughness model, `MeshStandardMaterial`, or
 *   `MeshBasicMaterial` for `KHR_materials_unlit`; each primitive also has a material of its base
 *   colors alone, which flat lighting draws.
 * - **Textures** are decoded by the image decoder handed in, `createImageBitmap` in the worker; one
 *   that fails to decode leaves its material its factors.
 * - **Parts** are the named nodes in depth-first order, as the core's description lists them; each
 *   piece of geometry belongs to the innermost named part holding its node.
 */
import { describeSolid, solidHash, type SolidDescription } from '@visual-anything/core';
import type { SpaceBounds } from '@visual-anything/schema';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  type ColorSpace,
  type Material,
  type MinificationTextureFilter,
  type Side,
  type Wrapping,
} from 'three';
// The core's reader of the canonical form, and its reading of an accessor's elements.
import {
  readCanonicalGlb,
  readElement,
  SolidRefusal,
  type SolidAccessor,
  type SolidDocument,
} from '@visual-anything/core';
import {
  interpolantFor,
  restAll,
  type RestPose,
  type SolidAnimationTrack,
  type SolidChannelPath,
  type SolidInterpolation,
} from './animation';

/** A decoded texture: an `ImageBitmap` in the worker, its like in tests. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** Decodes an image's bytes, PNG, JPEG or WebP, or answers none when it cannot. */
export type ImageDecoder = (
  bytes: Uint8Array,
  mimeType: string,
) => Promise<DecodedImage | undefined>;

/** Works out the SHA-256 of a file's bytes, in lowercase hexadecimal. */
export type Digest = (bytes: Uint8Array) => Promise<string> | string;

/** One piece of a solid's geometry: a primitive drawn by a node, with its materials. */
export interface SolidPiece {
  readonly mesh: Mesh;
  /** The node drawing it, by its index in the file. */
  readonly node: number;
  /** The innermost named part holding its node, by its index in the parts; -1 for none. */
  readonly part: number;
  /** What studio lighting draws it with. */
  readonly studio: Material;
  /** What flat lighting draws it with: its base colors alone, without light. */
  readonly flat: Material;
  readonly side: Side;
}

/** A solid built into three.js objects. */
export interface BuiltSolid {
  readonly hash: string;
  readonly description: SolidDescription;
  /** The scene's roots, held by one group at the solid's origin. */
  readonly root: Group;
  /** Each node's object, by its index in the file. */
  readonly nodes: readonly Object3D[];
  /** Each node's pose at rest. */
  readonly rest: readonly RestPose[];
  readonly pieces: readonly SolidPiece[];
  /** Each node's part: its own index among the parts when named, else its nearest named holder's. */
  readonly partOfNode: Int32Array;
  readonly animations: readonly SolidAnimationTrack[];
  /** The GPU memory its geometry and textures are estimated to take once drawn, in bytes. */
  readonly gpuBytes: number;
  /** Whether an animation posed its nodes away from their rest. */
  posed: boolean;
  /** The bounds of a part and every part it holds, at rest; computed once each, when first asked. */
  partBounds(part: number): SpaceBounds;
  /** Whether part `inner` is part `outer` or held by it, at any depth. */
  holds(outer: number, inner: number): boolean;
  /** Puts its nodes back at rest. */
  toRest(): void;
  /** Lets go of everything it holds: geometry, materials, textures and their bitmaps. */
  dispose(): void;
}

/** Why a file was not built. */
export interface BuildRefusal {
  ok: false;
  code: 'invalid-solid' | 'failed';
  message: string;
}

export type BuildResult = { ok: true; solid: BuiltSolid } | BuildRefusal;

/** What `buildSolid` takes. */
export interface BuildOptions {
  decodeImage: ImageDecoder;
  /** The core's synchronous `solidHash` unless another is given, as `crypto.subtle` in the worker. */
  digest?: Digest;
}

/** The names three.js gives glTF's vertex attributes. */
const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  POSITION: 'position',
  NORMAL: 'normal',
  TANGENT: 'tangent',
  TEXCOORD_0: 'uv',
  TEXCOORD_1: 'uv1',
  COLOR_0: 'color',
};

const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor;

const ARRAYS: Readonly<Record<number, TypedArrayConstructor>> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

const FILTERS: Readonly<Record<number, MinificationTextureFilter>> = {
  9728: NearestFilter,
  9729: LinearFilter,
  9984: NearestMipmapNearestFilter,
  9985: LinearMipmapNearestFilter,
  9986: NearestMipmapLinearFilter,
  9987: LinearMipmapLinearFilter,
};

const WRAPS: Readonly<Record<number, Wrapping>> = {
  33071: ClampToEdgeWrapping,
  33648: MirroredRepeatWrapping,
  10497: RepeatWrapping,
};

/** The bytes a texel takes on the GPU, decoded as RGBA. */
const TEXEL_BYTES = 4;

/**
 * Reads a solid's file, checks it against its hash and the canonical form, and builds it. Never
 * throws on bytes: a file that is not what its hash names, or not canonical, is refused.
 */
export async function buildSolid(
  bytes: Uint8Array,
  hash: string,
  options: BuildOptions,
): Promise<BuildResult> {
  const digest = options.digest ?? solidHash;
  let document: SolidDocument;
  let description: SolidDescription;
  try {
    if ((await digest(bytes)) !== hash) {
      return {
        ok: false,
        code: 'invalid-solid',
        message: 'The bytes are not the ones their hash names.',
      };
    }
    document = readCanonicalGlb(bytes);
    description = describeSolid(document);
  } catch (error) {
    const message =
      error instanceof SolidRefusal ? error.problem.message : 'The file could not be read.';
    return { ok: false, code: 'invalid-solid', message };
  }
  try {
    return { ok: true, solid: await assemble(bytes, hash, document, description, options) };
  } catch (error) {
    return {
      ok: false,
      code: 'failed',
      message: error instanceof Error ? error.message : 'The solid could not be built.',
    };
  }
}

// The JSON beyond what the core's reader keeps ---------------------------------------------------

type Json = Record<string, unknown>;

function objectOf(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numbersOf(value: unknown, length: number, fallback: readonly number[]): number[] {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((each) => typeof each === 'number' && Number.isFinite(each))
    ? (value as number[])
    : [...fallback];
}

function indexOf(value: unknown, length: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length
    ? value
    : undefined;
}

/** The JSON chunk of a GLB the core's reader has already taken. */
export function canonicalJson(bytes: Uint8Array): Json {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + length));
  return objectOf(JSON.parse(text.replace(/ +$/, '')));
}

// Building ----------------------------------------------------------------------------------------

async function assemble(
  bytes: Uint8Array,
  hash: string,
  document: SolidDocument,
  description: SolidDescription,
  options: BuildOptions,
): Promise<BuiltSolid> {
  const json = canonicalJson(bytes);
  const disposables: { dispose(): void }[] = [];
  const bitmaps: DecodedImage[] = [];
  let gpuBytes = 0;

  // Attributes, one for each accessor, whichever primitives name it.
  const attributes = new Map<string, BufferAttribute>();
  const attributeOf = (accessorIndex: number, asIndex: boolean): BufferAttribute => {
    const key = `${accessorIndex}:${asIndex ? 'index' : 'vertex'}`;
    const known = attributes.get(key);
    if (known) return known;
    const accessor = document.accessors[accessorIndex] as SolidAccessor;
    let array = accessorArray(document, accessor);
    // An index of single bytes is widened, which every WebGL takes.
    if (asIndex && array instanceof Uint8Array) array = Uint16Array.from(array);
    const attribute = new BufferAttribute(
      array,
      COMPONENTS[accessor.type] as number,
      !asIndex && accessor.normalized,
    );
    attributes.set(key, attribute);
    gpuBytes += array.byteLength;
    return attribute;
  };

  // Textures: every image decoded once, each use a clone sharing its source.
  const jsonImages = listOf(json.images);
  const decoded = await Promise.all(
    document.images.map(async (image) => {
      const span = document.bufferViews[image.bufferView];
      if (!span) return undefined;
      const data = document.bin.slice(span.byteOffset, span.byteOffset + span.byteLength);
      try {
        const bitmap = await options.decodeImage(data, image.mimeType);
        if (bitmap) bitmaps.push(bitmap);
        return bitmap;
      } catch {
        return undefined;
      }
    }),
  );
  const jsonTextures = listOf(json.textures);
  const samplers = listOf(json.samplers);
  const baseTextures = new Map<number, Texture | null>();
  const counted = new Set<string>();
  const baseTexture = (textureIndex: number): Texture | null => {
    const known = baseTextures.get(textureIndex);
    if (known !== undefined) return known;
    const definition = objectOf(jsonTextures[textureIndex]);
    const webp = objectOf(objectOf(definition.extensions).EXT_texture_webp);
    const source = indexOf(webp.source ?? definition.source, jsonImages.length);
    const image = source === undefined ? undefined : decoded[source];
    if (!image) {
      baseTextures.set(textureIndex, null);
      return null;
    }
    const texture = new Texture(image as unknown as HTMLImageElement);
    texture.flipY = false;
    const sampler = objectOf(samplers[indexOf(definition.sampler, samplers.length) ?? -1]);
    texture.magFilter = sampler.magFilter === 9728 ? NearestFilter : LinearFilter;
    texture.minFilter = FILTERS[numberOf(sampler.minFilter, 9987)] ?? LinearMipmapLinearFilter;
    texture.wrapS = WRAPS[numberOf(sampler.wrapS, 10497)] ?? RepeatWrapping;
    texture.wrapT = WRAPS[numberOf(sampler.wrapT, 10497)] ?? RepeatWrapping;
    texture.generateMipmaps =
      texture.minFilter !== NearestFilter && texture.minFilter !== LinearFilter;
    texture.userData.source = source;
    texture.needsUpdate = true;
    baseTextures.set(textureIndex, texture);
    disposables.push(texture);
    return texture;
  };
  const textureUse = (info: unknown, colorSpace: ColorSpace): Texture | null => {
    const reference = objectOf(info);
    const index = indexOf(reference.index, jsonTextures.length);
    if (index === undefined) return null;
    const base = baseTexture(index);
    if (!base) return null;
    const texture = base.clone();
    texture.colorSpace = colorSpace;
    const transform = objectOf(objectOf(reference.extensions).KHR_texture_transform);
    texture.channel = numberOf(transform.texCoord ?? reference.texCoord, 0) === 1 ? 1 : 0;
    const offset = numbersOf(transform.offset, 2, [0, 0]);
    const scale = numbersOf(transform.scale, 2, [1, 1]);
    texture.offset.set(offset[0] as number, offset[1] as number);
    texture.repeat.set(scale[0] as number, scale[1] as number);
    texture.rotation = numberOf(transform.rotation, 0);
    texture.needsUpdate = true;
    disposables.push(texture);
    // Each image takes the GPU once for each color space it is drawn in.
    const key = `${String(base.userData.source)}:${colorSpace}`;
    if (!counted.has(key)) {
      counted.add(key);
      const image = base.image as DecodedImage;
      gpuBytes += Math.ceil(
        image.width * image.height * TEXEL_BYTES * (base.generateMipmaps ? 4 / 3 : 1),
      );
    }
    return texture;
  };

  // Materials, for each glTF material and each way a primitive changes it.
  const jsonMaterials = listOf(json.materials);
  const materials = new Map<string, { studio: Material; flat: Material; side: Side }>();
  const materialFor = (
    materialIndex: number | undefined,
    vertexColors: boolean,
    flatShading: boolean,
  ) => {
    const key = `${materialIndex ?? 'default'}:${vertexColors}:${flatShading}`;
    const known = materials.get(key);
    if (known) return known;
    const made = makeMaterials(
      materialIndex === undefined ? undefined : objectOf(jsonMaterials[materialIndex]),
      vertexColors,
      flatShading,
      textureUse,
    );
    disposables.push(made.studio, made.flat);
    materials.set(key, made);
    return made;
  };

  // Geometry, one for each primitive of each mesh, whichever nodes draw it.
  const jsonMeshes = listOf(json.meshes);
  const geometries = new Map<string, { geometry: BufferGeometry; material: number | undefined }>();
  const geometryOf = (meshIndex: number, primitiveIndex: number) => {
    const key = `${meshIndex}:${primitiveIndex}`;
    const known = geometries.get(key);
    if (known) return known;
    const primitive = objectOf(listOf(objectOf(jsonMeshes[meshIndex]).primitives)[primitiveIndex]);
    const geometry = new BufferGeometry();
    for (const [name, value] of Object.entries(objectOf(primitive.attributes))) {
      const threeName = ATTRIBUTE_NAMES[name];
      const accessor = indexOf(value, document.accessors.length);
      if (threeName === undefined || accessor === undefined) continue;
      geometry.setAttribute(threeName, attributeOf(accessor, false));
    }
    const indices = (document.meshes[meshIndex]?.primitives[primitiveIndex] as { indices: number })
      .indices;
    geometry.setIndex(attributeOf(indices, true));
    disposables.push(geometry);
    const made = {
      geometry,
      material: indexOf(primitive.material, jsonMaterials.length),
    };
    geometries.set(key, made);
    return made;
  };

  // Nodes, in the file's tree, and the part each belongs to.
  const nodes = document.nodes.map((node) => {
    const object = new Group();
    if (node.name !== undefined) object.name = node.name;
    object.position.set(...node.translation);
    object.quaternion.set(...node.rotation);
    object.scale.set(...node.scale);
    return object;
  });
  const rest: RestPose[] = document.nodes.map((node) => ({
    position: node.translation,
    quaternion: node.rotation,
    scale: node.scale,
  }));
  document.nodes.forEach((node, at) => {
    for (const child of node.children) (nodes[at] as Object3D).add(nodes[child] as Object3D);
  });
  const root = new Group();
  for (const at of document.roots) root.add(nodes[at] as Object3D);
  const partOfNode = partsOfNodes(document);
  const pieces: SolidPiece[] = [];
  document.nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const primitives = document.meshes[node.mesh]?.primitives ?? [];
    primitives.forEach((_, primitiveIndex) => {
      const { geometry, material } = geometryOf(node.mesh as number, primitiveIndex);
      const vertexColors = geometry.getAttribute('color') !== undefined;
      const flatShading = geometry.getAttribute('normal') === undefined;
      const made = materialFor(material, vertexColors, flatShading);
      const mesh = new Mesh(geometry, made.studio);
      (nodes[nodeIndex] as Object3D).add(mesh);
      pieces.push({
        mesh,
        node: nodeIndex,
        part: partOfNode[nodeIndex] as number,
        studio: made.studio,
        flat: made.flat,
        side: made.side,
      });
    });
  });
  root.updateMatrixWorld(true);

  const animations = readAnimations(document, json);
  const parents = description.parts.map((part) => part.parent);
  const bounds = new Map<number, SpaceBounds>();
  const holds = (outer: number, inner: number): boolean => {
    let at: number | undefined = inner;
    // A part's holder comes before it in depth-first order, so this ends.
    while (at !== undefined && at >= outer) {
      if (at === outer) return true;
      at = parents[at];
    }
    return false;
  };

  const solid: BuiltSolid = {
    hash,
    description,
    root,
    nodes,
    rest,
    pieces,
    partOfNode,
    animations,
    gpuBytes,
    posed: false,
    partBounds(part) {
      const known = bounds.get(part);
      if (known) return known;
      if (solid.posed) solid.toRest();
      const box = new Box3();
      for (const piece of pieces) {
        if (piece.part >= 0 && holds(part, piece.part)) box.expandByObject(piece.mesh, true);
      }
      const found: SpaceBounds = box.isEmpty()
        ? description.bounds
        : {
            min: { x: box.min.x, y: box.min.y, z: box.min.z },
            max: { x: box.max.x, y: box.max.y, z: box.max.z },
          };
      bounds.set(part, found);
      return found;
    },
    holds,
    toRest() {
      restAll(nodes, rest);
      root.updateMatrixWorld(true);
      solid.posed = false;
    },
    dispose() {
      for (const each of disposables) each.dispose();
      disposables.length = 0;
      for (const bitmap of bitmaps) bitmap.close();
      bitmaps.length = 0;
      for (const geometry of geometries.values()) delete geometry.geometry.boundsTree;
    },
  };
  return solid;
}

/** An accessor's elements as a tightly packed typed array of its component type, copied. */
export function accessorArray(
  document: SolidDocument,
  accessor: SolidAccessor,
): Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array {
  const Array_ = ARRAYS[accessor.componentType] as TypedArrayConstructor;
  const components = COMPONENTS[accessor.type] as number;
  const element = Array_.BYTES_PER_ELEMENT * components;
  const view = document.bufferViews[accessor.bufferView] as {
    byteOffset: number;
    byteStride?: number;
  };
  const stride = view.byteStride ?? element;
  const start = view.byteOffset + accessor.byteOffset;
  const raw = new Uint8Array(accessor.count * element);
  if (stride === element) {
    raw.set(document.bin.subarray(start, start + raw.length));
  } else {
    for (let at = 0; at < accessor.count; at += 1) {
      const from = start + at * stride;
      raw.set(document.bin.subarray(from, from + element), at * element);
    }
  }
  return new Array_(raw.buffer);
}

/** Each node's part, as the core's description numbers them: depth-first from the scene's roots. */
export function partsOfNodes(document: SolidDocument): Int32Array {
  const partOf = new Int32Array(document.nodes.length).fill(-1);
  let parts = 0;
  const stack: { node: number; holder: number }[] = [...document.roots]
    .reverse()
    .map((node) => ({ node, holder: -1 }));
  while (stack.length > 0) {
    const { node, holder } = stack.pop() as { node: number; holder: number };
    const data = document.nodes[node];
    if (!data) continue;
    const part = data.name === undefined ? holder : parts++;
    partOf[node] = part;
    for (let at = data.children.length - 1; at >= 0; at -= 1) {
      stack.push({ node: data.children[at] as number, holder: part });
    }
  }
  return partOf;
}

/** The studio and flat materials of a glTF material, or of glTF's default one. */
function makeMaterials(
  definition: Json | undefined,
  vertexColors: boolean,
  flatShading: boolean,
  textureUse: (info: unknown, colorSpace: ColorSpace) => Texture | null,
): { studio: Material; flat: Material; side: Side } {
  const material = definition ?? {};
  const pbr = objectOf(material.pbrMetallicRoughness);
  const extensions = objectOf(material.extensions);
  const base = numbersOf(pbr.baseColorFactor, 4, [1, 1, 1, 1]);
  const color = new Color().setRGB(
    base[0] as number,
    base[1] as number,
    base[2] as number,
    LinearSRGBColorSpace,
  );
  const opacity = base[3] as number;
  const map = textureUse(pbr.baseColorTexture, SRGBColorSpace);
  const side: Side = material.doubleSided === true ? DoubleSide : FrontSide;
  const alphaMode = material.alphaMode;
  const transparent = alphaMode === 'BLEND';
  const alphaTest = alphaMode === 'MASK' ? numberOf(material.alphaCutoff, 0.5) : 0;
  const common = {
    color,
    opacity: alphaMode === 'BLEND' || alphaMode === 'MASK' ? opacity : 1,
    map,
    transparent,
    depthWrite: !transparent,
    alphaTest,
    side,
    vertexColors,
  };
  const flat = new MeshBasicMaterial({ ...common, color: color.clone(), toneMapped: false });
  if ('KHR_materials_unlit' in extensions) {
    return { studio: new MeshBasicMaterial({ ...common }), flat, side };
  }
  const metallicRoughness = textureUse(pbr.metallicRoughnessTexture, NoColorSpace);
  const normal = objectOf(material.normalTexture);
  const normalMap = textureUse(material.normalTexture, NoColorSpace);
  const normalScale = numberOf(normal.scale, 1);
  const occlusion = objectOf(material.occlusionTexture);
  const aoMap = textureUse(material.occlusionTexture, NoColorSpace);
  const emissive = numbersOf(material.emissiveFactor, 3, [0, 0, 0]);
  const strength = numberOf(
    objectOf(extensions.KHR_materials_emissive_strength).emissiveStrength,
    1,
  );
  const studio = new MeshStandardMaterial({
    ...common,
    metalness: numberOf(pbr.metallicFactor, 1),
    roughness: numberOf(pbr.roughnessFactor, 1),
    metalnessMap: metallicRoughness,
    roughnessMap: metallicRoughness,
    normalMap,
    normalScale: new Vector2(normalScale, normalScale),
    aoMap,
    aoMapIntensity: numberOf(occlusion.strength, 1),
    emissive: new Color().setRGB(
      emissive[0] as number,
      emissive[1] as number,
      emissive[2] as number,
      LinearSRGBColorSpace,
    ),
    emissiveMap: textureUse(material.emissiveTexture, SRGBColorSpace),
    emissiveIntensity: strength,
    flatShading,
  });
  return { studio, flat, side };
}

/** A solid's animations, each sampler's times and values read and dequantized as glTF says. */
function readAnimations(document: SolidDocument, json: Json): SolidAnimationTrack[] {
  const element: number[] = [];
  const floats = (accessorIndex: number): Float32Array => {
    const accessor = document.accessors[accessorIndex] as SolidAccessor;
    const components = COMPONENTS[accessor.type] as number;
    const out = new Float32Array(accessor.count * components);
    for (let at = 0; at < accessor.count; at += 1) {
      readElement(document, accessor, at, element);
      for (let c = 0; c < components; c += 1) out[at * components + c] = element[c] as number;
    }
    return out;
  };
  return listOf(json.animations).map((each) => {
    const animation = objectOf(each);
    const samplers = listOf(animation.samplers).map((item) => objectOf(item));
    let duration = 0;
    const channels = listOf(animation.channels).flatMap((item) => {
      const channel = objectOf(item);
      const target = objectOf(channel.target);
      const node = indexOf(target.node, document.nodes.length);
      const path = target.path as SolidChannelPath;
      const sampler = samplers[indexOf(channel.sampler, samplers.length) ?? -1];
      if (node === undefined || sampler === undefined) return [];
      if (path !== 'translation' && path !== 'rotation' && path !== 'scale') return [];
      const input = indexOf(sampler.input, document.accessors.length);
      const output = indexOf(sampler.output, document.accessors.length);
      if (input === undefined || output === undefined) return [];
      const times = floats(input);
      const values = floats(output);
      const interpolation = (
        ['LINEAR', 'STEP', 'CUBICSPLINE'].includes(sampler.interpolation as string)
          ? sampler.interpolation
          : 'LINEAR'
      ) as SolidInterpolation;
      const size = path === 'rotation' ? 4 : 3;
      const expected = times.length * size * (interpolation === 'CUBICSPLINE' ? 3 : 1);
      if (times.length === 0 || values.length !== expected) return [];
      duration = Math.max(duration, times[times.length - 1] as number);
      return [{ node, path, interpolant: interpolantFor(times, values, path, interpolation) }];
    });
    return { duration, channels };
  });
}
