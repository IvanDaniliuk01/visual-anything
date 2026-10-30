/**
 * The core's reader of a solid's canonical file (ADR 0075): exactly what the local program's cleaner
 * writes, and nothing more. It is pure TypeScript and needs no GPU, so the program, the solid worker
 * and the tests read a file the same way.
 *
 * The canonical form:
 * - a GLB of version 2 whose length is the file's, at most 32 MiB: a JSON chunk of at most 8 MiB,
 *   padded with spaces to four bytes, then a binary chunk padded with zeros, and no other chunk;
 * - its JSON holds only `asset` (`{ "version": "2.0" }`), `scene` (0), one scene, `nodes`, `meshes`,
 *   `accessors`, `bufferViews`, one buffer without an address, `materials`, `textures`, `images`,
 *   `samplers`, `animations`, `extensionsUsed` and `extensionsRequired`;
 * - no `extras`, no `uri`, no extension but {@link SOLID_EXTENSIONS}, no cameras, lights, skins,
 *   morph targets, sparse accessors, points or lines;
 * - nodes with only `name`, `children`, `mesh`, `translation`, `rotation` and `scale`, forming one
 *   tree under the scene's roots, every name unique and of the class {@link SOLID_PART_NAME};
 * - primitives that are indexed triangle lists, every accessor and buffer view within its chunk, and
 *   `POSITION`'s `min` and `max` those of its data;
 * - images that are PNG, JPEG or WebP in a buffer view, within their caps, as their headers say.
 */
import { problem, type Problem } from '../problems';
import { readImageHeader } from '../images/bitmap';
import { SOLID_ATTRIBUTES, SOLID_CAPS, SOLID_EXTENSIONS, SOLID_PART_NAME } from './caps';

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

/** The JSON of a canonical file, as far as the reader looks into it. */
export interface SolidDocument {
  readonly nodes: readonly SolidNode[];
  readonly roots: readonly number[];
  readonly meshes: readonly SolidMesh[];
  readonly accessors: readonly SolidAccessor[];
  readonly bufferViews: readonly SolidBufferView[];
  readonly textures: number;
  readonly images: readonly { readonly bufferView: number; readonly mimeType: string }[];
  readonly animations: readonly SolidAnimationData[];
  readonly materials: number;
  /** The binary chunk. */
  readonly bin: Uint8Array;
}

export interface SolidNode {
  readonly name?: string;
  readonly children: readonly number[];
  readonly mesh?: number;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface SolidMesh {
  readonly primitives: readonly { readonly position: number; readonly indices: number }[];
}

export interface SolidAccessor {
  readonly bufferView: number;
  readonly byteOffset: number;
  readonly componentType: number;
  readonly normalized: boolean;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

export interface SolidBufferView {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

export interface SolidAnimationData {
  /** The accessors of its samplers' inputs: their times, in seconds. */
  readonly inputs: readonly number[];
  readonly channels: number;
}

/** Thrown inside the reader to refuse a file; `readCanonicalGlb` turns it into problems. */
export class SolidRefusal extends Error {
  override name = 'SolidRefusal';
  constructor(readonly problem: Problem) {
    super(problem.message);
  }
}

/** Refuses a file as not the canonical form. */
export function notCanonical(message: string): never {
  throw new SolidRefusal(problem('invalid-solid', message));
}

/** Refuses a file over a cap. */
export function overCap(message: string): never {
  throw new SolidRefusal(problem('solid-too-large', message));
}

/** Bytes per component, by glTF's component type. */
const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

/** Components per element, by glTF's accessor type. */
const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const TOP_KEYS = new Set([
  'asset',
  'scene',
  'scenes',
  'nodes',
  'meshes',
  'accessors',
  'bufferViews',
  'buffers',
  'materials',
  'textures',
  'images',
  'samplers',
  'animations',
  'extensionsUsed',
  'extensionsRequired',
]);

const NODE_KEYS = new Set(['name', 'children', 'mesh', 'translation', 'rotation', 'scale']);

/**
 * Reads a canonical GLB's container and JSON, checking every structural rule and cap of the canonical
 * form. Throws a {@link SolidRefusal}; {@link readSolid} answers it as problems.
 */
export function readCanonicalGlb(bytes: Uint8Array): SolidDocument {
  if (!(bytes instanceof Uint8Array)) notCanonical('A solid is bytes.');
  if (bytes.length > SOLID_CAPS.fileBytes) {
    overCap(`The file is ${bytes.length} bytes, past ${SOLID_CAPS.fileBytes}.`);
  }
  if (bytes.length < 20) notCanonical('The file is too short to be a GLB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) notCanonical('The file is not a GLB.');
  if (view.getUint32(4, true) !== 2) notCanonical('The GLB is not of version 2.');
  if (view.getUint32(8, true) !== bytes.length) {
    notCanonical('The GLB says another length than the file has.');
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) notCanonical('The first chunk is not JSON.');
  if (jsonLength % 4 !== 0) notCanonical('The JSON chunk is not padded to four bytes.');
  if (jsonLength > SOLID_CAPS.jsonBytes) {
    overCap(`The JSON chunk is ${jsonLength} bytes, past ${SOLID_CAPS.jsonBytes}.`);
  }
  if (20 + jsonLength > bytes.length) notCanonical('The JSON chunk runs past the file.');
  const jsonBytes = bytes.subarray(20, 20 + jsonLength);
  let bin: Uint8Array = new Uint8Array(0);
  const at = 20 + jsonLength;
  if (at < bytes.length) {
    if (at + 8 > bytes.length) notCanonical('The binary chunk is cut short.');
    const binLength = view.getUint32(at, true);
    if (view.getUint32(at + 4, true) !== CHUNK_BIN) notCanonical('The second chunk is not binary.');
    if (binLength % 4 !== 0) notCanonical('The binary chunk is not padded to four bytes.');
    if (at + 8 + binLength !== bytes.length) {
      notCanonical('The file holds something after its binary chunk, or the chunk is cut short.');
    }
    bin = bytes.subarray(at + 8, at + 8 + binLength);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes);
  } catch {
    notCanonical('The JSON chunk is not UTF-8.');
  }
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/ +$/, ''));
  } catch {
    notCanonical('The JSON chunk is not JSON.');
  }
  return readDocument(json, bin);
}

function readDocument(json: unknown, bin: Uint8Array): SolidDocument {
  const top = record(json, 'The JSON chunk');
  for (const key of Object.keys(top)) {
    if (!TOP_KEYS.has(key)) notCanonical(`The file holds "${key}", which a solid keeps none of.`);
  }
  forbidAnywhere(top);
  const asset = record(top.asset, '"asset"');
  if (Object.keys(asset).length !== 1 || asset.version !== '2.0') {
    notCanonical('"asset" holds only its version, "2.0".');
  }
  const extensions = [
    ...stringList(top.extensionsUsed, '"extensionsUsed"'),
    ...stringList(top.extensionsRequired, '"extensionsRequired"'),
  ];
  for (const name of extensions) {
    if (!SOLID_EXTENSIONS.includes(name)) notCanonical(`The extension "${name}" is not kept.`);
  }

  const bufferViews = list(top.bufferViews, '"bufferViews"').map((each, index) =>
    readBufferView(each, index, bin),
  );
  const buffers = list(top.buffers, '"buffers"');
  if (bufferViews.length > 0 || buffers.length > 0) {
    if (buffers.length !== 1) notCanonical('A solid with data has exactly one buffer.');
    const buffer = record(buffers[0], 'The buffer');
    if (Object.keys(buffer).some((key) => key !== 'byteLength')) {
      notCanonical('The buffer holds only its length: no address.');
    }
    const length = integer(buffer.byteLength, "The buffer's length", 0);
    if (length > bin.length || bin.length - length > 3) {
      notCanonical("The buffer's length is not the binary chunk's.");
    }
  }
  const accessors = list(top.accessors, '"accessors"').map((each, index) =>
    readAccessor(each, index, bufferViews),
  );

  const meshes = list(top.meshes, '"meshes"');
  if (meshes.length > SOLID_CAPS.meshes) overCap(`It has ${meshes.length} meshes.`);
  const materials = list(top.materials, '"materials"').length;
  if (materials > SOLID_CAPS.materials) overCap(`It has ${materials} materials.`);
  let primitives = 0;
  let triangles = 0;
  let vertices = 0;
  const readMeshes = meshes.map((each, meshIndex) => {
    const mesh = record(each, `Mesh ${meshIndex}`);
    if ('weights' in mesh) notCanonical('Morph targets are not kept.');
    return {
      primitives: list(mesh.primitives, `Mesh ${meshIndex}'s primitives`).map((item) => {
        primitives += 1;
        const primitive = record(item, `A primitive of mesh ${meshIndex}`);
        if ('targets' in primitive) notCanonical('Morph targets are not kept.');
        if (primitive.mode !== undefined && primitive.mode !== 4) {
          notCanonical('Every primitive is a list of triangles.');
        }
        if (primitive.material !== undefined) {
          index(primitive.material, materials, "A primitive's material");
        }
        const attributes = record(primitive.attributes, "A primitive's attributes");
        for (const name of Object.keys(attributes)) {
          if (!SOLID_ATTRIBUTES.includes(name)) {
            notCanonical(`The vertex attribute "${name}" is not kept.`);
          }
          index(attributes[name], accessors.length, `The attribute ${name}`);
        }
        if (attributes.POSITION === undefined) notCanonical('Every primitive has its positions.');
        const position = attributes.POSITION as number;
        const positions = accessors[position] as SolidAccessor;
        if (positions.type !== 'VEC3') notCanonical('Positions are three numbers each.');
        if (primitive.indices === undefined) notCanonical('Every primitive is indexed.');
        const indices = index(primitive.indices, accessors.length, "A primitive's indices");
        const indexAccessor = accessors[indices] as SolidAccessor;
        if (
          indexAccessor.type !== 'SCALAR' ||
          ![5121, 5123, 5125].includes(indexAccessor.componentType) ||
          indexAccessor.count % 3 !== 0
        ) {
          notCanonical("A primitive's indices are whole numbers, three to a triangle.");
        }
        triangles += indexAccessor.count / 3;
        vertices += positions.count;
        return { position, indices };
      }),
    };
  });
  if (primitives > SOLID_CAPS.primitives) overCap(`It has ${primitives} primitives.`);
  if (triangles > SOLID_CAPS.triangles) overCap(`It has ${triangles} triangles.`);
  if (vertices > SOLID_CAPS.vertices) overCap(`It has ${vertices} vertices.`);

  const nodes = list(top.nodes, '"nodes"');
  if (nodes.length > SOLID_CAPS.nodes) overCap(`It has ${nodes.length} nodes.`);
  const names = new Set<string>();
  const readNodes = nodes.map((each, nodeIndex) => {
    const node = record(each, `Node ${nodeIndex}`);
    for (const key of Object.keys(node)) {
      if (!NODE_KEYS.has(key))
        notCanonical(`Node ${nodeIndex} holds "${key}", which nodes keep none of.`);
    }
    let name: string | undefined;
    if (node.name !== undefined) {
      if (typeof node.name !== 'string' || !SOLID_PART_NAME.test(node.name)) {
        notCanonical(`Node ${nodeIndex}'s name is not one cleaning keeps.`);
      }
      if (names.has(node.name)) notCanonical(`Two nodes are named "${node.name}".`);
      names.add(node.name);
      name = node.name;
    }
    return {
      ...(name === undefined ? {} : { name }),
      children:
        node.children === undefined
          ? []
          : indexList(node.children, nodes.length, `Node ${nodeIndex}'s children`),
      ...(node.mesh === undefined
        ? {}
        : { mesh: index(node.mesh, meshes.length, `Node ${nodeIndex}'s mesh`) }),
      translation: numbers(node.translation, 3, [0, 0, 0], `Node ${nodeIndex}'s translation`) as [
        number,
        number,
        number,
      ],
      rotation: numbers(node.rotation, 4, [0, 0, 0, 1], `Node ${nodeIndex}'s rotation`) as [
        number,
        number,
        number,
        number,
      ],
      scale: numbers(node.scale, 3, [1, 1, 1], `Node ${nodeIndex}'s scale`) as [
        number,
        number,
        number,
      ],
    };
  });
  if (names.size > SOLID_CAPS.parts) overCap(`It has ${names.size} named parts.`);

  const scenes = list(top.scenes, '"scenes"');
  if (nodes.length > 0 && scenes.length !== 1) notCanonical('A solid has exactly one scene.');
  if (scenes.length > 0 && top.scene !== 0) notCanonical('The scene is the first.');
  const roots =
    scenes.length === 0
      ? []
      : indexList(record(scenes[0], 'The scene').nodes ?? [], nodes.length, "The scene's nodes");
  if (
    scenes.length > 0 &&
    Object.keys(record(scenes[0], 'The scene')).some((key) => key !== 'nodes')
  ) {
    notCanonical('The scene holds only its nodes.');
  }
  // One tree: every node has one holder, reached from the roots, and none holds itself.
  const reached = new Uint8Array(nodes.length);
  const stack = [...roots];
  for (const root of roots) {
    if (reached[root]) notCanonical('A node is a root twice.');
    reached[root] = 1;
  }
  while (stack.length > 0) {
    const at = stack.pop() as number;
    for (const child of (readNodes[at] as SolidNode).children) {
      if (reached[child]) notCanonical('A node has more than one holder, or holds itself.');
      reached[child] = 1;
      stack.push(child);
    }
  }
  if (reached.some((each) => each === 0)) notCanonical('Every node is in the scene.');

  const images = list(top.images, '"images"').map((each, imageIndex) => {
    const image = record(each, `Image ${imageIndex}`);
    if (Object.keys(image).some((key) => key !== 'bufferView' && key !== 'mimeType')) {
      notCanonical(`Image ${imageIndex} holds only its data and its type.`);
    }
    const bufferView = index(image.bufferView, bufferViews.length, `Image ${imageIndex}'s data`);
    const mimeType = image.mimeType;
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
      notCanonical(`Image ${imageIndex} is not PNG, JPEG or WebP.`);
    }
    return { bufferView, mimeType };
  });
  let textureBytes = 0;
  for (const image of images) {
    const span = bufferViews[image.bufferView] as SolidBufferView;
    const data = bin.subarray(span.byteOffset, span.byteOffset + span.byteLength);
    const header = readImageHeader(data);
    const format = image.mimeType.slice('image/'.length);
    if (header === undefined || header.format !== format) {
      notCanonical("An image's data is not of its type.");
    }
    if (
      header.width > SOLID_CAPS.textureSide ||
      header.height > SOLID_CAPS.textureSide ||
      header.width * header.height > SOLID_CAPS.texturePixels
    ) {
      overCap(`An image is ${header.width} by ${header.height} pixels.`);
    }
    textureBytes += data.length;
  }
  if (textureBytes > SOLID_CAPS.textureBytes) overCap(`Its textures hold ${textureBytes} bytes.`);
  const textures = list(top.textures, '"textures"').length;
  if (textures > SOLID_CAPS.textures) overCap(`It has ${textures} textures.`);

  const animations = list(top.animations, '"animations"');
  if (animations.length > SOLID_CAPS.animations) overCap(`It has ${animations.length} animations.`);
  let channels = 0;
  let keyframes = 0;
  const readAnimations = animations.map((each, animationIndex) => {
    const animation = record(each, `Animation ${animationIndex}`);
    const samplers = list(animation.samplers, `Animation ${animationIndex}'s samplers`).map(
      (item) => {
        const sampler = record(item, 'A sampler');
        const input = index(sampler.input, accessors.length, "A sampler's times");
        index(sampler.output, accessors.length, "A sampler's values");
        if (
          sampler.interpolation !== undefined &&
          !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(sampler.interpolation as string)
        ) {
          notCanonical('A sampler interpolates linearly, by steps or by cubic splines.');
        }
        keyframes += (accessors[input] as SolidAccessor).count;
        return input;
      },
    );
    const animationChannels = list(animation.channels, `Animation ${animationIndex}'s channels`);
    for (const item of animationChannels) {
      const channel = record(item, 'A channel');
      index(channel.sampler, samplers.length, "A channel's sampler");
      const target = record(channel.target, "A channel's target");
      index(target.node, nodes.length, "A channel's node");
      if (!['translation', 'rotation', 'scale'].includes(target.path as string)) {
        notCanonical('A channel moves a node by translation, rotation or scale.');
      }
    }
    channels += animationChannels.length;
    return { inputs: samplers, channels: animationChannels.length };
  });
  if (channels > SOLID_CAPS.channels) overCap(`Its animations have ${channels} channels.`);
  if (keyframes > SOLID_CAPS.keyframes) overCap(`Its animations have ${keyframes} keyframes.`);

  return {
    nodes: readNodes,
    roots,
    meshes: readMeshes,
    accessors,
    bufferViews,
    textures,
    images,
    animations: readAnimations,
    materials,
    bin,
  };
}

function readBufferView(value: unknown, at: number, bin: Uint8Array): SolidBufferView {
  const view = record(value, `Buffer view ${at}`);
  for (const key of Object.keys(view)) {
    if (!['buffer', 'byteOffset', 'byteLength', 'byteStride', 'target'].includes(key)) {
      notCanonical(`Buffer view ${at} holds "${key}".`);
    }
  }
  if (view.buffer !== 0) notCanonical(`Buffer view ${at} is not of the one buffer.`);
  const byteOffset = view.byteOffset === undefined ? 0 : integer(view.byteOffset, 'An offset', 0);
  const byteLength = integer(view.byteLength, 'A length', 1);
  if (byteOffset + byteLength > bin.length) notCanonical(`Buffer view ${at} runs past the data.`);
  if (view.byteStride !== undefined) {
    const stride = integer(view.byteStride, 'A stride', 4);
    if (stride > 252 || stride % 4 !== 0) notCanonical(`Buffer view ${at}'s stride is not glTF's.`);
    return { byteOffset, byteLength, byteStride: stride };
  }
  return { byteOffset, byteLength };
}

function readAccessor(
  value: unknown,
  at: number,
  bufferViews: readonly SolidBufferView[],
): SolidAccessor {
  const accessor = record(value, `Accessor ${at}`);
  if ('sparse' in accessor) notCanonical('Sparse accessors are not kept.');
  const bufferView = index(accessor.bufferView, bufferViews.length, `Accessor ${at}'s data`);
  const byteOffset =
    accessor.byteOffset === undefined ? 0 : integer(accessor.byteOffset, 'An offset', 0);
  const componentType = accessor.componentType as number;
  const componentBytes = COMPONENT_BYTES[componentType];
  if (componentBytes === undefined) notCanonical(`Accessor ${at} is of a type glTF lacks.`);
  const type = accessor.type as string;
  const components = TYPE_COMPONENTS[type];
  if (components === undefined) notCanonical(`Accessor ${at} is of a kind a solid keeps none of.`);
  const count = integer(accessor.count, `Accessor ${at}'s count`, 1);
  const span = bufferViews[bufferView] as SolidBufferView;
  const element = componentBytes * components;
  const stride = span.byteStride ?? element;
  if (byteOffset % componentBytes !== 0) notCanonical(`Accessor ${at} is not aligned.`);
  if (byteOffset + stride * (count - 1) + element > span.byteLength) {
    notCanonical(`Accessor ${at} runs past its buffer view.`);
  }
  const normalized = accessor.normalized === true;
  return {
    bufferView,
    byteOffset,
    componentType,
    normalized,
    count,
    type,
    ...(accessor.min === undefined
      ? {}
      : { min: numbers(accessor.min, components, [], 'A minimum') }),
    ...(accessor.max === undefined
      ? {}
      : { max: numbers(accessor.max, components, [], 'A maximum') }),
  };
}

/** `extras`, an address or an extension the canonical form keeps none of, anywhere in the JSON. */
function forbidAnywhere(value: unknown, depth = 0): void {
  if (depth > 32) notCanonical('The JSON nests too deep.');
  if (Array.isArray(value)) {
    for (const each of value) forbidAnywhere(each, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'extras') notCanonical('The file holds "extras", which cleaning drops.');
    if (key === 'uri') notCanonical('The file names an address, which a solid never does.');
    if (key === 'extensions') {
      for (const name of Object.keys(record(inner, '"extensions"'))) {
        if (!SOLID_EXTENSIONS.includes(name)) notCanonical(`The extension "${name}" is not kept.`);
      }
    }
    if (key === 'cameras' || key === 'skins' || key === 'camera' || key === 'skin') {
      notCanonical(`The file holds "${key}", which cleaning drops.`);
    }
    forbidAnywhere(inner, depth + 1);
  }
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    notCanonical(`${what} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, what: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) notCanonical(`${what} is not a list.`);
  return value;
}

function stringList(value: unknown, what: string): string[] {
  return list(value, what).map((each) => {
    if (typeof each !== 'string') notCanonical(`${what} lists something that is not a name.`);
    return each;
  });
}

function integer(value: unknown, what: string, least: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < least) {
    notCanonical(`${what} is not a whole number from ${least}.`);
  }
  return value;
}

function index(value: unknown, length: number, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= length) {
    notCanonical(`${what} names nothing the file holds.`);
  }
  return value;
}

function indexList(value: unknown, length: number, what: string): number[] {
  return list(value, what).map((each) => index(each, length, what));
}

function numbers(
  value: unknown,
  length: number,
  fallback: readonly number[],
  what: string,
): number[] {
  if (value === undefined) return [...fallback];
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((each) => typeof each !== 'number' || !Number.isFinite(each))
  ) {
    notCanonical(`${what} is not ${length} numbers.`);
  }
  return value as number[];
}

/** Reads element `at` of an accessor as numbers, dequantized as glTF says for normalized integers. */
export function readElement(
  document: SolidDocument,
  accessor: SolidAccessor,
  at: number,
  into: number[],
): number[] {
  const view = document.bufferViews[accessor.bufferView] as SolidBufferView;
  const components = TYPE_COMPONENTS[accessor.type] as number;
  const componentBytes = COMPONENT_BYTES[accessor.componentType] as number;
  const stride = view.byteStride ?? components * componentBytes;
  const data = new DataView(
    document.bin.buffer,
    document.bin.byteOffset + view.byteOffset,
    view.byteLength,
  );
  const start = accessor.byteOffset + at * stride;
  for (let c = 0; c < components; c += 1) {
    const offset = start + c * componentBytes;
    into[c] = component(data, offset, accessor.componentType, accessor.normalized);
  }
  into.length = components;
  return into;
}

function component(data: DataView, offset: number, type: number, normalized: boolean): number {
  switch (type) {
    case 5120: {
      const value = data.getInt8(offset);
      return normalized ? Math.max(value / 127, -1) : value;
    }
    case 5121: {
      const value = data.getUint8(offset);
      return normalized ? value / 255 : value;
    }
    case 5122: {
      const value = data.getInt16(offset, true);
      return normalized ? Math.max(value / 32767, -1) : value;
    }
    case 5123: {
      const value = data.getUint16(offset, true);
      return normalized ? value / 65535 : value;
    }
    case 5125:
      return data.getUint32(offset, true);
    default:
      return data.getFloat32(offset, true);
  }
}
