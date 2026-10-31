/**
 * The canonical writer of a solid's file (ADR 0075): what the cleaner kept, written as the one form
 * the core's reader (`readSolid`) takes, documented at the top of `core/src/solids/glb.ts`.
 *
 * - One GLB: a JSON chunk padded with spaces, then one binary chunk padded with zeros.
 * - The JSON's keys in a fixed order, every array in the order the cleaner gives, and each value
 *   written only from the numbers and names below: nothing of the file read reaches it otherwise.
 * - The binary chunk's buffer views in a fixed order: each mesh's primitives, attribute by attribute
 *   then their indices, then the images, then the animations' times and values.
 * - Positions as 32-bit floats with their exact bounds; normals and tangents as 8-bit normalized
 *   integers under `KHR_mesh_quantization`; texture coordinates as 32-bit floats; colors as 16-bit
 *   normalized integers; indices as 16-bit integers when a primitive has at most 65,535 vertices.
 *
 * So the same solid always gives the same bytes, and the same hash.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** A node of the cleaned tree, in depth-first order from the scene's roots. */
export interface CleanNode {
  name?: string;
  children: number[];
  mesh?: number;
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/** A primitive: an indexed list of triangles, its attributes as floats, one element after another. */
export interface CleanPrimitive {
  /** x, y and z of each vertex, in meters. */
  positions: Float32Array;
  normals?: Float32Array;
  /** x, y, z and w of each vertex. */
  tangents?: Float32Array;
  texcoords0?: Float32Array;
  texcoords1?: Float32Array;
  /** r, g, b and a of each vertex, from 0 to 1. */
  colors?: Float32Array;
  /** Three a triangle. */
  indices: Uint32Array;
  material?: number;
}

export interface CleanMesh {
  primitives: CleanPrimitive[];
}

/** Where a material reads a texture. */
export interface CleanTextureRef {
  texture: number;
  texCoord: number;
  /** `KHR_texture_transform`. */
  transform?: {
    offset: readonly [number, number];
    rotation: number;
    scale: readonly [number, number];
    texCoord?: number;
  };
}

export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';

/** A material of the core metallic-roughness model. */
export interface CleanMaterial {
  baseColorFactor: readonly [number, number, number, number];
  baseColorTexture?: CleanTextureRef;
  metallicFactor: number;
  roughnessFactor: number;
  metallicRoughnessTexture?: CleanTextureRef;
  normalTexture?: CleanTextureRef & { scale: number };
  occlusionTexture?: CleanTextureRef & { strength: number };
  emissiveTexture?: CleanTextureRef;
  emissiveFactor: Vec3;
  /** `KHR_materials_emissive_strength`, when it is not 1. */
  emissiveStrength?: number;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  /** `KHR_materials_unlit`. */
  unlit: boolean;
}

export type TextureMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface CleanSampler {
  magFilter?: number;
  minFilter?: number;
  wrapS: number;
  wrapT: number;
}

/** A texture: a cleaned bitmap and how it is sampled. Textures with the same bytes share an image. */
export interface CleanTexture {
  image: Uint8Array;
  mimeType: TextureMime;
  sampler: CleanSampler;
}

export type ChannelPath = 'translation' | 'rotation' | 'scale';
export type Interpolation = 'LINEAR' | 'STEP' | 'CUBICSPLINE';

export interface CleanChannel {
  node: number;
  path: ChannelPath;
  /** Its keyframes' times, in seconds; a channel that shares them with another shares the array. */
  times: Float32Array;
  /** Three or four numbers a keyframe, three times as many for cubic splines. */
  values: Float32Array;
  interpolation: Interpolation;
}

export interface CleanAnimation {
  channels: CleanChannel[];
}

/** Everything a cleaned solid holds, in the order it is written. */
export interface CleanSolid {
  nodes: CleanNode[];
  roots: number[];
  meshes: CleanMesh[];
  materials: CleanMaterial[];
  textures: CleanTexture[];
  animations: CleanAnimation[];
}

const FLOAT = 5126;
const BYTE = 5120;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const REPEAT = 10497;

type Json = Record<string, unknown>;

/** Writes a cleaned solid as its canonical GLB. */
export function writeCanonicalSolid(solid: CleanSolid): Uint8Array {
  const bin = new BinaryChunk();
  const accessors: Json[] = [];
  const extensionsUsed = new Set<string>();
  const extensionsRequired = new Set<string>();

  const floats = (
    data: Float32Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    bounds = false,
  ) => {
    const components = COMPONENTS[type];
    const accessor: Json = {
      bufferView: bin.add(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      componentType: FLOAT,
      count: data.length / components,
      type,
    };
    if (bounds) {
      const [min, max] = boundsOf(data, components);
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const bytes = (data: Float32Array, components: 3 | 4) => {
    // Normalized signed bytes, each vertex on four bytes, as glTF aligns vertex attributes.
    const count = data.length / components;
    const out = new Int8Array(count * 4);
    for (let at = 0; at < count; at += 1) {
      for (let c = 0; c < components; c += 1) {
        out[at * 4 + c] = snorm8(data[at * components + c] as number);
      }
    }
    accessors.push({
      bufferView: bin.add(new Uint8Array(out.buffer), components === 3 ? 4 : undefined),
      componentType: BYTE,
      normalized: true,
      count,
      type: components === 3 ? 'VEC3' : 'VEC4',
    });
    extensionsUsed.add('KHR_mesh_quantization');
    extensionsRequired.add('KHR_mesh_quantization');
    return accessors.length - 1;
  };
  const shorts = (data: Float32Array) => {
    const out = new Uint16Array(data.length);
    for (let at = 0; at < data.length; at += 1) out[at] = unorm16(data[at] as number);
    accessors.push({
      bufferView: bin.add(new Uint8Array(out.buffer)),
      componentType: UNSIGNED_SHORT,
      normalized: true,
      count: data.length / 4,
      type: 'VEC4',
    });
    extensionsUsed.add('KHR_mesh_quantization');
    extensionsRequired.add('KHR_mesh_quantization');
    return accessors.length - 1;
  };
  const indices = (data: Uint32Array, vertices: number) => {
    const narrow = vertices <= 65_535;
    const out = narrow ? Uint16Array.from(data) : data;
    accessors.push({
      bufferView: bin.add(new Uint8Array(out.buffer, out.byteOffset, out.byteLength)),
      componentType: narrow ? UNSIGNED_SHORT : UNSIGNED_INT,
      count: data.length,
      type: 'SCALAR',
    });
    return accessors.length - 1;
  };

  const meshes = solid.meshes.map((mesh) => ({
    primitives: mesh.primitives.map((primitive) => {
      const vertices = primitive.positions.length / 3;
      const attributes: Json = { POSITION: floats(primitive.positions, 'VEC3', true) };
      if (primitive.normals) attributes.NORMAL = bytes(primitive.normals, 3);
      if (primitive.tangents) attributes.TANGENT = bytes(primitive.tangents, 4);
      if (primitive.texcoords0) attributes.TEXCOORD_0 = floats(primitive.texcoords0, 'VEC2');
      if (primitive.texcoords1) attributes.TEXCOORD_1 = floats(primitive.texcoords1, 'VEC2');
      if (primitive.colors) attributes.COLOR_0 = shorts(primitive.colors);
      return {
        attributes,
        indices: indices(primitive.indices, vertices),
        ...(primitive.material === undefined ? {} : { material: primitive.material }),
      };
    }),
  }));

  const samplers: Json[] = [];
  const samplerKeys = new Map<string, number>();
  const images: Json[] = [];
  // Textures that sample one picture differently share its image.
  const imageIndexes = new Map<Uint8Array, number>();
  const textures = solid.textures.map((texture) => {
    let source = imageIndexes.get(texture.image);
    if (source === undefined) {
      source = images.length;
      images.push({ bufferView: bin.add(texture.image), mimeType: texture.mimeType });
      imageIndexes.set(texture.image, source);
    }
    const sampler: Json = {};
    if (texture.sampler.magFilter !== undefined) sampler.magFilter = texture.sampler.magFilter;
    if (texture.sampler.minFilter !== undefined) sampler.minFilter = texture.sampler.minFilter;
    if (texture.sampler.wrapS !== REPEAT) sampler.wrapS = texture.sampler.wrapS;
    if (texture.sampler.wrapT !== REPEAT) sampler.wrapT = texture.sampler.wrapT;
    const key = JSON.stringify(sampler);
    let index = samplerKeys.get(key);
    if (index === undefined) {
      index = samplers.length;
      samplers.push(sampler);
      samplerKeys.set(key, index);
    }
    if (texture.mimeType === 'image/webp') {
      extensionsUsed.add('EXT_texture_webp');
      extensionsRequired.add('EXT_texture_webp');
      return { sampler: index, extensions: { EXT_texture_webp: { source } } };
    }
    return { sampler: index, source };
  });

  const textureInfo = (ref: CleanTextureRef, more: Json = {}): Json => {
    const info: Json = { index: ref.texture };
    if (ref.texCoord !== 0) info.texCoord = ref.texCoord;
    Object.assign(info, more);
    if (ref.transform !== undefined) {
      extensionsUsed.add('KHR_texture_transform');
      const transform: Json = {
        offset: [...ref.transform.offset],
        rotation: ref.transform.rotation,
        scale: [...ref.transform.scale],
      };
      if (ref.transform.texCoord !== undefined) transform.texCoord = ref.transform.texCoord;
      info.extensions = { KHR_texture_transform: transform };
    }
    return info;
  };
  const materials = solid.materials.map((material) => {
    const pbr: Json = {
      baseColorFactor: [...material.baseColorFactor],
      metallicFactor: material.metallicFactor,
      roughnessFactor: material.roughnessFactor,
    };
    if (material.baseColorTexture) pbr.baseColorTexture = textureInfo(material.baseColorTexture);
    if (material.metallicRoughnessTexture) {
      pbr.metallicRoughnessTexture = textureInfo(material.metallicRoughnessTexture);
    }
    const json: Json = { pbrMetallicRoughness: pbr };
    if (material.normalTexture) {
      json.normalTexture = textureInfo(material.normalTexture, {
        scale: material.normalTexture.scale,
      });
    }
    if (material.occlusionTexture) {
      json.occlusionTexture = textureInfo(material.occlusionTexture, {
        strength: material.occlusionTexture.strength,
      });
    }
    if (material.emissiveTexture) json.emissiveTexture = textureInfo(material.emissiveTexture);
    json.emissiveFactor = [...material.emissiveFactor];
    json.alphaMode = material.alphaMode;
    if (material.alphaMode === 'MASK') json.alphaCutoff = material.alphaCutoff;
    json.doubleSided = material.doubleSided;
    const extensions: Json = {};
    if (material.emissiveStrength !== undefined) {
      extensionsUsed.add('KHR_materials_emissive_strength');
      extensions.KHR_materials_emissive_strength = { emissiveStrength: material.emissiveStrength };
    }
    if (material.unlit) {
      extensionsUsed.add('KHR_materials_unlit');
      extensions.KHR_materials_unlit = {};
    }
    if (Object.keys(extensions).length > 0) json.extensions = extensions;
    return json;
  });

  const timeAccessors = new Map<Float32Array, number>();
  const animations = solid.animations.map((animation) => {
    const samplerList: Json[] = [];
    const channels = animation.channels.map((channel, at) => {
      let input = timeAccessors.get(channel.times);
      if (input === undefined) {
        input = floats(channel.times, 'SCALAR', true);
        timeAccessors.set(channel.times, input);
      }
      const output = floats(channel.values, channel.path === 'rotation' ? 'VEC4' : 'VEC3');
      samplerList.push({ input, interpolation: channel.interpolation, output });
      return { sampler: at, target: { node: channel.node, path: channel.path } };
    });
    return { channels, samplers: samplerList };
  });

  const nodes = solid.nodes.map((node) => {
    const json: Json = {};
    if (node.name !== undefined) json.name = node.name;
    if (node.children.length > 0) json.children = [...node.children];
    if (node.mesh !== undefined) json.mesh = node.mesh;
    if (!same(node.translation, [0, 0, 0])) json.translation = [...node.translation];
    if (!same(node.rotation, [0, 0, 0, 1])) json.rotation = [...node.rotation];
    if (!same(node.scale, [1, 1, 1])) json.scale = [...node.scale];
    return json;
  });

  const data = bin.bytes();
  const json: Json = { asset: { version: '2.0' } };
  if (nodes.length > 0) {
    json.scene = 0;
    json.scenes = [{ nodes: [...solid.roots] }];
    json.nodes = nodes;
  }
  if (meshes.length > 0) json.meshes = meshes;
  if (materials.length > 0) json.materials = materials;
  if (textures.length > 0) {
    json.textures = textures;
    json.images = images;
    json.samplers = samplers;
  }
  if (accessors.length > 0) json.accessors = accessors;
  if (bin.views.length > 0) {
    json.bufferViews = bin.views;
    json.buffers = [{ byteLength: data.length }];
  }
  if (animations.length > 0) json.animations = animations;
  if (extensionsUsed.size > 0) json.extensionsUsed = [...extensionsUsed].sort();
  if (extensionsRequired.size > 0) json.extensionsRequired = [...extensionsRequired].sort();
  return glb(json, data);
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;

/** The binary chunk, built view by view, each view starting on four bytes. */
class BinaryChunk {
  readonly views: Json[] = [];
  readonly #parts: Uint8Array[] = [];
  #length = 0;

  add(bytes: Uint8Array, byteStride?: number): number {
    const pad = (4 - (this.#length % 4)) % 4;
    if (pad > 0) {
      this.#parts.push(new Uint8Array(pad));
      this.#length += pad;
    }
    const view: Json = { buffer: 0, byteOffset: this.#length, byteLength: bytes.length };
    if (byteStride !== undefined) view.byteStride = byteStride;
    this.views.push(view);
    this.#parts.push(bytes);
    this.#length += bytes.length;
    return this.views.length - 1;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.#length);
    let at = 0;
    for (const part of this.#parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** A GLB of a JSON document and its binary data, each chunk padded to four bytes. */
function glb(json: Json, bin: Uint8Array): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 20 + jsonLength + (bin.length > 0 ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(encoded, 20);
  out.fill(0x20, 20 + encoded.length, 20 + jsonLength);
  if (bin.length > 0) {
    const at = 20 + jsonLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}

/** The least and greatest of each component, as the 32-bit floats hold them. */
function boundsOf(data: Float32Array, components: number): [number[], number[]] {
  const min = new Array<number>(components).fill(Infinity);
  const max = new Array<number>(components).fill(-Infinity);
  for (let at = 0; at < data.length; at += 1) {
    const c = at % components;
    const value = data[at] as number;
    if (value < (min[c] as number)) min[c] = value;
    if (value > (max[c] as number)) max[c] = value;
  }
  return [min.map(plain), max.map(plain)];
}

/** −0 written as 0, so that equal bounds read alike. */
function plain(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function snorm8(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(-1, value)) * 127);
}

function unorm16(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 65_535);
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.every((each, at) => each === b[at]);
}
