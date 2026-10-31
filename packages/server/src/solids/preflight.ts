/**
 * The first step of cleaning a solid (ADR 0075): the file read by the program itself, before the glTF
 * reader sees anything of it.
 *
 * - The container: a GLB of version 2 whose chunks lie within the file, or glTF's JSON in UTF-8.
 * - Every address refused: a buffer or an image is either data the file holds, in its binary chunk or
 *   in a `data:` address in base64, or the file is refused, so that nothing it names is ever read or
 *   fetched. A file compressed with Draco is refused too.
 * - What a solid keeps none of taken out of the JSON, and counted for the report: `extras`, every
 *   extension but those the cleaner reads, cameras, skins, morph targets, and every name but nodes'.
 * - Every buffer view, accessor and image within the data it reads, every number of nodes, meshes,
 *   accessors, materials, textures and animations within what cleaning reads, the nodes one tree,
 *   and the data the reader would make within 512 MiB: so the reader neither reads past what the
 *   file holds nor is made to build more than the file could hold.
 *
 * What is left is handed to the reader as JSON and bytes only.
 */
import type { Problem } from '@visual-anything/core';
import { MAX_SOLID_INPUT_BYTES, SOLID_EXTENSIONS } from '@visual-anything/core';
import type { SolidReport } from './report';

/** The key the glTF reader finds a GLB's binary chunk under. */
export const GLB_BUFFER = '@glb.bin';

/** The extensions the cleaner reads: those a solid keeps, and meshopt's compression, decoded. */
export const READ_EXTENSIONS: readonly string[] = [...SOLID_EXTENSIONS, 'EXT_meshopt_compression'];

/** What cleaning reads of a file at most, before the caps on what it keeps. */
export const INPUT_CAPS = {
  nodes: 65_536,
  meshes: 32_768,
  primitives: 65_536,
  accessors: 262_144,
  materials: 4_096,
  textures: 1_024,
  animations: 256,
  channels: 4_096,
  /** The data the reader makes of accessors and decoded buffer views, in all: 512 MiB. */
  dataBytes: 512 * 1024 * 1024,
  /** How deep the JSON nests. */
  depth: 64,
} as const;

/** A file refused while cleaning, with why. */
export class CleaningRefusal extends Error {
  override name = 'CleaningRefusal';
  constructor(readonly problem: Problem) {
    super(problem.message);
  }
}

/** Refuses a file as not a glTF file that cleaning reads. */
export function invalid(message: string): never {
  throw new CleaningRefusal({ code: 'invalid-solid', message });
}

/** Refuses a file over a cap. */
export function tooLarge(message: string): never {
  throw new CleaningRefusal({ code: 'solid-too-large', message });
}

type Json = Record<string, unknown>;

/** The file as the reader is given it: its JSON, and the data its buffers and images hold, by key. */
export interface Preflighted {
  json: Json;
  resources: Record<string, Uint8Array>;
  /** The file's copyright, offered as the solid's source. */
  copyright?: string;
  /** Whether it uses meshopt's compression, so that the decoder is made ready. */
  meshopt: boolean;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};
const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/** The top-level collections whose items lose their names: every one but nodes. */
const NAMED = [
  'scenes',
  'meshes',
  'materials',
  'textures',
  'images',
  'samplers',
  'accessors',
  'bufferViews',
  'buffers',
  'animations',
];

/** Reads a file into what the glTF reader is given, refusing what cleaning never reads. */
export function preflightSolid(bytes: Uint8Array, report: SolidReport): Preflighted {
  if (bytes.length > MAX_SOLID_INPUT_BYTES) {
    tooLarge(
      `The file is over ${MAX_SOLID_INPUT_BYTES / 1024 / 1024} MiB, the most cleaning reads.`,
    );
  }
  const { json, bin } = isGlb(bytes)
    ? readGlb(bytes)
    : { json: readJsonText(bytes), bin: undefined };
  checkAsset(json);
  const copyright = takeAsset(json, report);
  refuseDraco(json);
  strip(json, report);
  dropUnkept(json, report);
  checkCounts(json);
  const resources: Record<string, Uint8Array> = {};
  const lengths = readBuffers(json, bin, resources);
  checkViews(json, lengths);
  checkAccessors(json);
  checkImages(json, resources);
  checkTextures(json, report);
  checkTree(json);
  const meshopt = (json.extensionsUsed as string[] | undefined)?.includes(
    'EXT_meshopt_compression',
  );
  return { json, resources, ...(copyright === undefined ? {} : { copyright }), meshopt: !!meshopt };
}

function isGlb(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC
  );
}

function readGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array | undefined } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20) invalid('The GLB is cut short.');
  if (view.getUint32(4, true) !== 2) invalid('The file is not glTF 2.0.');
  const length = view.getUint32(8, true);
  if (length > bytes.length) invalid('The GLB says it is longer than the file is.');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) invalid('The GLB does not start with its JSON.');
  if (20 + jsonLength > length) invalid('The JSON of the GLB runs past its end.');
  const json = parse(bytes.subarray(20, 20 + jsonLength));
  let bin: Uint8Array | undefined;
  // The chunks after the JSON: the first binary one is the file's data; others are passed over.
  let at = 20 + Math.ceil(jsonLength / 4) * 4;
  while (at + 8 <= length) {
    const chunkLength = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    if (at + 8 + chunkLength > length) invalid('A chunk of the GLB runs past its end.');
    if (type === CHUNK_BIN && bin === undefined) {
      bin = bytes.subarray(at + 8, at + 8 + chunkLength);
    }
    at += 8 + Math.ceil(chunkLength / 4) * 4;
  }
  return { json, bin };
}

function readJsonText(bytes: Uint8Array): Json {
  let at = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) at = 3;
  while (at < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[at] as number)) at += 1;
  if (bytes[at] !== 0x7b) invalid('The file is neither a GLB nor glTF in JSON.');
  return parse(bytes.subarray(at));
}

function parse(bytes: Uint8Array): Json {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    invalid('The JSON of the file is not UTF-8.');
  }
  let json: unknown;
  try {
    // A GLB pads its JSON with spaces, and some writers with zeros.
    // eslint-disable-next-line no-control-regex
    json = JSON.parse(text.replace(/[\u0000 ]+$/, ''));
  } catch {
    invalid('The JSON of the file cannot be read.');
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    invalid('The JSON of the file is not an object.');
  }
  return json as Json;
}

function checkAsset(json: Json): void {
  const asset = json.asset as Json | undefined;
  const version = asset?.version;
  if (typeof asset !== 'object' || asset === null || typeof version !== 'string') {
    invalid('The file is not glTF 2.0.');
  }
  const minVersion = asset.minVersion;
  if (!/^2\.\d+$/.test(version) || (minVersion !== undefined && minVersion !== '2.0')) {
    invalid('The file is not glTF 2.0.');
  }
}

/** Takes the asset's copyright and generator out, and gives back the copyright. */
function takeAsset(json: Json, report: SolidReport): string | undefined {
  const asset = json.asset as Json;
  let copyright: string | undefined;
  if (typeof asset.copyright === 'string') {
    // eslint-disable-next-line no-control-regex
    const text = asset.copyright.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (text !== '') {
      copyright = text.slice(0, 500);
      report.note('Its copyright was taken out of the file, and is offered as its source.');
    }
  }
  if (asset.generator !== undefined) {
    report.note('The name of the program that wrote it was taken out.');
  }
  json.asset = { version: '2.0' };
  return copyright;
}

function refuseDraco(json: Json): void {
  const names = [...list(json.extensionsUsed), ...list(json.extensionsRequired)];
  const draco = names.includes('KHR_draco_mesh_compression');
  const inMeshes = list(json.meshes).some((mesh) =>
    list((mesh as Json | null)?.primitives).some((primitive) => {
      const extensions = (primitive as Json | null)?.extensions as Json | undefined;
      return (
        typeof extensions === 'object' &&
        extensions !== null &&
        'KHR_draco_mesh_compression' in extensions
      );
    }),
  );
  if (draco || inMeshes) {
    invalid(
      'The file is compressed with Draco, which cleaning does not read: export it without compression.',
    );
  }
}

/**
 * Takes `extras`, and every extension but those cleaning reads, out of the whole JSON, counting what
 * it takes; refuses JSON that nests too deep. It walks without recursion, so that no depth stalls it.
 */
function strip(json: Json, report: SolidReport): void {
  const dropped = new Set<string>();
  const lights = (((json.extensions as Json | undefined)?.KHR_lights_punctual as Json | undefined)
    ?.lights ?? []) as unknown[];
  if (Array.isArray(lights)) report.add('light', 'lights', lights.length);
  const stack: { value: unknown; depth: number }[] = [{ value: json, depth: 0 }];
  while (stack.length > 0) {
    const { value, depth } = stack.pop() as { value: unknown; depth: number };
    if (depth > INPUT_CAPS.depth) invalid('The JSON of the file nests too deep.');
    if (Array.isArray(value)) {
      for (const each of value) {
        if (typeof each === 'object' && each !== null)
          stack.push({ value: each, depth: depth + 1 });
      }
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;
    const object = value as Json;
    if ('extras' in object) {
      delete object.extras;
      report.add('set of extras', 'sets of extras');
    }
    if ('extensions' in object) {
      const extensions = object.extensions;
      if (typeof extensions !== 'object' || extensions === null || Array.isArray(extensions)) {
        delete object.extensions;
      } else {
        for (const name of Object.keys(extensions)) {
          if (!READ_EXTENSIONS.includes(name)) {
            delete (extensions as Json)[name];
            dropped.add(name);
          }
        }
        if (Object.keys(extensions).length === 0) delete object.extensions;
      }
    }
    for (const inner of Object.values(object)) {
      if (typeof inner === 'object' && inner !== null)
        stack.push({ value: inner, depth: depth + 1 });
    }
  }
  for (const key of ['extensionsUsed', 'extensionsRequired'] as const) {
    if (json[key] === undefined) continue;
    const names = list(json[key]).filter((name): name is string => typeof name === 'string');
    for (const name of names) if (!READ_EXTENSIONS.includes(name)) dropped.add(name);
    const kept = names.filter((name) => READ_EXTENSIONS.includes(name));
    if (kept.length > 0) json[key] = [...new Set(kept)];
    else delete json[key];
  }
  for (const name of [...dropped].sort()) {
    report.note(`The extension ${clip(name)} was dropped: a solid keeps none of it.`);
  }
}

/** Takes cameras, skins, morph targets and every name but nodes' out, counting them. */
function dropUnkept(json: Json, report: SolidReport): void {
  report.add('camera', 'cameras', list(json.cameras).length);
  delete json.cameras;
  report.add('skin', 'skins', list(json.skins).length);
  delete json.skins;
  for (const node of list(json.nodes)) {
    if (typeof node !== 'object' || node === null) continue;
    delete (node as Json).camera;
    delete (node as Json).skin;
    delete (node as Json).weights;
  }
  let targets = 0;
  for (const mesh of list(json.meshes)) {
    if (typeof mesh !== 'object' || mesh === null) continue;
    delete (mesh as Json).weights;
    for (const primitive of list((mesh as Json).primitives)) {
      if (typeof primitive !== 'object' || primitive === null) continue;
      targets += list((primitive as Json).targets).length;
      delete (primitive as Json).targets;
    }
  }
  report.add('morph target', 'morph targets', targets);
  let names = 0;
  for (const key of NAMED) {
    for (const item of list(json[key])) {
      if (typeof item === 'object' && item !== null && 'name' in item) {
        delete (item as Json).name;
        names += 1;
      }
    }
  }
  report.add('name of something other than a node', 'names of things other than nodes', names);
}

function checkCounts(json: Json): void {
  const over = (count: number, most: number, what: string) => {
    if (count > most) {
      tooLarge(
        `The file holds ${count.toLocaleString('en')} ${what}, more than the ${most.toLocaleString('en')} cleaning reads.`,
      );
    }
  };
  over(list(json.nodes).length, INPUT_CAPS.nodes, 'nodes');
  over(list(json.meshes).length, INPUT_CAPS.meshes, 'meshes');
  over(
    list(json.meshes).reduce<number>(
      (sum, mesh) => sum + list((mesh as Json | null)?.primitives).length,
      0,
    ),
    INPUT_CAPS.primitives,
    'primitives',
  );
  over(list(json.accessors).length, INPUT_CAPS.accessors, 'accessors');
  over(list(json.materials).length, INPUT_CAPS.materials, 'materials');
  over(list(json.images).length, INPUT_CAPS.textures, 'images');
  over(list(json.textures).length, INPUT_CAPS.textures, 'textures');
  over(list(json.animations).length, INPUT_CAPS.animations, 'animations');
  over(
    list(json.animations).reduce<number>(
      (sum, each) => sum + list((each as Json | null)?.channels).length,
      0,
    ),
    INPUT_CAPS.channels,
    'animation channels',
  );
}

/** A `data:` address in base64. */
const DATA_ADDRESS =
  /^data:[\w.+-]*\/?[\w.+-]*(?:;[\w.+-]+=[\w.+-]+)*;base64,([A-Za-z0-9+/]*={0,2})$/;

/** The data an address holds in itself, or the refusal of an address that names anything else. */
function dataOf(uri: unknown): Uint8Array {
  if (typeof uri !== 'string')
    invalid('The file names its data with something other than an address.');
  const match = DATA_ADDRESS.exec(uri);
  if (match === null) {
    invalid(
      `The file names "${clip(uri)}" outside itself, which cleaning never reads: bundle it as .glb, with every buffer and image inside.`,
    );
  }
  const text = match[1] as string;
  if (text.length % 4 !== 0) invalid('The file holds data in base64 that is cut short.');
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/**
 * Reads every buffer's data, from the GLB's binary chunk or from its own `data:` address, into the
 * resources the reader is given; gives back each buffer's length. A buffer without data is only
 * meshopt's fallback, which its compressed views fill.
 */
function readBuffers(
  json: Json,
  bin: Uint8Array | undefined,
  resources: Record<string, Uint8Array>,
): number[] {
  return list(json.buffers).map((each, at) => {
    const buffer = record(each);
    const byteLength = whole(buffer.byteLength);
    if (buffer.uri === undefined) {
      const fallback =
        ((buffer.extensions as Json | undefined)?.EXT_meshopt_compression as Json | undefined)
          ?.fallback === true;
      if (at === 0 && bin !== undefined && !fallback) {
        if (bin.length < byteLength)
          invalid('The binary chunk of the GLB is shorter than its buffer says.');
        resources[GLB_BUFFER] = bin;
        return byteLength;
      }
      if (!fallback) invalid('A buffer of the file holds no data.');
      return -1;
    }
    const data = dataOf(buffer.uri);
    if (data.length < byteLength) invalid('A buffer of the file is shorter than it says.');
    const key = `buffer-${at}`;
    resources[key] = data;
    buffer.uri = key;
    return byteLength;
  });
}

/** Every buffer view within its buffer; meshopt's compressed views within theirs, decoded within the caps. */
function checkViews(json: Json, lengths: readonly number[]): void {
  let decoded = 0;
  for (const each of list(json.bufferViews)) {
    const view = record(each);
    const buffer = index(view.buffer, lengths.length);
    const byteOffset = view.byteOffset === undefined ? 0 : whole(view.byteOffset);
    const byteLength = whole(view.byteLength);
    if (view.byteStride !== undefined) {
      const stride = whole(view.byteStride);
      if (stride < 4 || stride > 252 || stride % 4 !== 0)
        invalid('A buffer view of the file has a stride glTF does not have.');
    }
    const meshopt = (view.extensions as Json | undefined)?.EXT_meshopt_compression as
      Json | undefined;
    if (meshopt !== undefined) {
      const source = index(meshopt.buffer, lengths.length);
      const sourceLength = lengths[source] as number;
      const offset = meshopt.byteOffset === undefined ? 0 : whole(meshopt.byteOffset);
      const length = whole(meshopt.byteLength);
      const count = whole(meshopt.count);
      const stride = whole(meshopt.byteStride);
      if (sourceLength < 0 || offset + length > sourceLength) {
        invalid('Compressed data of the file runs past its buffer.');
      }
      if (!['ATTRIBUTES', 'TRIANGLES', 'INDICES'].includes(meshopt.mode as string)) {
        invalid('Data of the file is compressed in a way meshopt does not have.');
      }
      if (stride < 1 || stride > 256 || count * stride !== byteLength) {
        invalid('Compressed data of the file does not decode to its length.');
      }
      decoded += count * stride;
      if (decoded > INPUT_CAPS.dataBytes)
        tooLarge('The compressed data of the file decodes to over 512 MiB.');
      continue;
    }
    const bufferLength = lengths[buffer] as number;
    if (bufferLength < 0) invalid('A buffer view of the file reads a buffer that holds no data.');
    if (byteOffset + byteLength > bufferLength)
      invalid('A buffer view of the file runs past its buffer.');
  }
}

/** Every accessor within its buffer view, of a type glTF has, and the data they make within 512 MiB. */
function checkAccessors(json: Json): void {
  const views = list(json.bufferViews) as Json[];
  let total = 0;
  const within = (
    view: unknown,
    offset: unknown,
    count: number,
    element: number,
    align: number,
  ) => {
    const at = index(view, views.length);
    const span = views[at] as Json;
    const byteOffset = offset === undefined ? 0 : whole(offset);
    if (byteOffset % align !== 0) invalid('An accessor of the file is not aligned.');
    const stride = span.byteStride === undefined ? element : (span.byteStride as number);
    if (byteOffset + stride * (count - 1) + element > (span.byteLength as number)) {
      invalid('An accessor of the file runs past its buffer view.');
    }
  };
  for (const each of list(json.accessors)) {
    const accessor = record(each);
    const componentBytes = COMPONENT_BYTES[accessor.componentType as number];
    const components = TYPE_COMPONENTS[accessor.type as string];
    if (componentBytes === undefined || components === undefined) {
      invalid('An accessor of the file is of a type glTF does not have.');
    }
    const count = whole(accessor.count);
    if (count < 1) invalid('An accessor of the file holds nothing.');
    const element = componentBytes * components;
    if (accessor.bufferView !== undefined) {
      within(accessor.bufferView, accessor.byteOffset, count, element, componentBytes);
    }
    total += count * element;
    if (total > INPUT_CAPS.dataBytes)
      tooLarge("The file's accessors would make over 512 MiB of data.");
    if (accessor.sparse !== undefined) {
      const sparse = record(accessor.sparse);
      const sparseCount = whole(sparse.count);
      if (sparseCount < 1 || sparseCount > count)
        invalid('The sparse values of an accessor do not fit it.');
      const indices = record(sparse.indices);
      const indexBytes = COMPONENT_BYTES[indices.componentType as number];
      if (
        ![5121, 5123, 5125].includes(indices.componentType as number) ||
        indexBytes === undefined
      ) {
        invalid('The sparse values of an accessor do not fit it.');
      }
      within(indices.bufferView, indices.byteOffset, sparseCount, indexBytes, indexBytes);
      const values = record(sparse.values);
      within(values.bufferView, values.byteOffset, sparseCount, element, componentBytes);
      total += sparseCount * (element + indexBytes);
    }
  }
}

/** Every image is data the file holds: a buffer view, or a `data:` address in base64. */
function checkImages(json: Json, resources: Record<string, Uint8Array>): void {
  const views = list(json.bufferViews).length;
  list(json.images).forEach((each, at) => {
    const image = record(each);
    if (image.uri !== undefined) {
      const key = `image-${at}`;
      resources[key] = dataOf(image.uri);
      image.uri = key;
      delete image.bufferView;
      return;
    }
    index(image.bufferView, views);
  });
}

/** Where a material reads its textures. */
const TEXTURE_KEYS = [
  'baseColorTexture',
  'metallicRoughnessTexture',
  'normalTexture',
  'occlusionTexture',
  'emissiveTexture',
] as const;

/**
 * Every texture names a picture the file holds, or names none that cleaning reads, as a KTX2 texture
 * does once its extension is dropped: a material lets go of such a texture and keeps its factors.
 */
function checkTextures(json: Json, report: SolidReport): void {
  const images = list(json.images).length;
  const samplers = list(json.samplers).length;
  const textures = list(json.textures);
  const unread = new Set<number>();
  textures.forEach((each, at) => {
    const texture = record(each);
    const webp = (texture.extensions as Json | undefined)?.EXT_texture_webp as Json | undefined;
    const source = webp?.source ?? texture.source;
    if (source === undefined) unread.add(at);
    else index(source, images);
    if (texture.sampler !== undefined) index(texture.sampler, samplers);
  });
  for (const each of list(json.materials)) {
    const material = record(each);
    const holders = [material, material.pbrMetallicRoughness];
    for (const holder of holders) {
      if (holder === undefined) continue;
      const read = record(holder);
      for (const key of TEXTURE_KEYS) {
        if (read[key] === undefined) continue;
        const texture = index(record(read[key]).index, textures.length);
        if (unread.has(texture)) delete read[key];
      }
    }
  }
  report.add('texture in another format', 'textures in other formats', unread.size);
}

/** The nodes form trees: each node held at most once, none holding itself, and the scenes' roots unheld. */
function checkTree(json: Json): void {
  const nodes = list(json.nodes);
  const held = new Uint8Array(nodes.length);
  nodes.forEach((each, at) => {
    const node = record(each);
    for (const key of ['translation', 'rotation', 'scale', 'matrix'] as const) {
      const value = node[key];
      if (
        value !== undefined &&
        (!Array.isArray(value) || value.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
      ) {
        invalid('A node of the file is placed with something other than numbers.');
      }
    }
    if (node.mesh !== undefined) index(node.mesh, list(json.meshes).length);
    for (const child of list(node.children)) {
      const inner = index(child, nodes.length);
      if (held[inner] || inner === at) invalid('A node has more than one holder, or holds itself.');
      held[inner] = 1;
    }
  });
  // No cycle: walking from the nodes nobody holds reaches every node that is held.
  const reached = new Uint8Array(nodes.length);
  const stack: number[] = [];
  nodes.forEach((_, at) => {
    if (!held[at]) {
      reached[at] = 1;
      stack.push(at);
    }
  });
  while (stack.length > 0) {
    const at = stack.pop() as number;
    for (const child of list((nodes[at] as Json).children) as number[]) {
      if (reached[child]) invalid('A node has more than one holder, or holds itself.');
      reached[child] = 1;
      stack.push(child);
    }
  }
  if (reached.some((each) => each === 0))
    invalid('A node has more than one holder, or holds itself.');
  const scenes = list(json.scenes);
  for (const each of scenes) {
    const scene = record(each);
    const roots = new Set<number>();
    for (const root of list(scene.nodes)) {
      const node = index(root, nodes.length);
      if (held[node]) invalid('A scene holds a node that another node holds.');
      if (roots.has(node)) invalid('A scene holds a node twice.');
      roots.add(node);
    }
  }
  if (json.scene !== undefined) index(json.scene, scenes.length);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Json {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('The file holds something that is not in the form glTF gives it.');
  }
  return value as Json;
}

function whole(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid('The file holds a count, an offset or a length that is not a whole number.');
  }
  return value;
}

function index(value: unknown, length: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= length) {
    invalid('The file names a part of itself that it does not hold.');
  }
  return value;
}

/** Text from the file as a message quotes it: at most 100 characters, on one line. */
function clip(text: string): string {
  // eslint-disable-next-line no-control-regex
  const line = text.replace(/[\u0000-\u001f\u007f"\\]/g, '_');
  return line.length > 100 ? `${line.slice(0, 100)}…` : line;
}
