/**
 * What cleaning a solid and the program's solid files say to the person, in Spanish (ADR 0038, ADR
 * 0075): every line of the report, every refusal, and the warnings and answers about solid files,
 * read through the app's catalog, whose templates keep what each message holds as it was.
 */
import { translateMessage, untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { describe, expect, it } from 'vitest';
import { cleanSolid } from './clean';
import { box, grid, inputGlb, png, type InputSolid } from './test/gltf';

type Json = Record<string, unknown>;

const BOX: InputSolid = { nodes: [{ name: 'part', mesh: 0 }], meshes: [box()] };
const edited = (edit: (json: Json) => void, solid: InputSolid = BOX) =>
  inputGlb({ ...solid, edit });
const square = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];

/** Files that make cleaning say each thing it says, once and more than once. */
const FILES: [Uint8Array, { units?: 'cm' | 'mm' | 'in'; up?: 'z'; simplify?: boolean }][] = [
  [
    inputGlb({
      nodes: [
        { name: 'part', mesh: 0, children: [1, 2] },
        { name: 'part', mesh: 1 },
        { name: '3 more', mesh: 2 },
        { name: 'eye' },
        { name: 'lamp', children: [5] },
        { name: 'bulb' },
      ],
      meshes: [
        [
          { ...box(), texcoords: new Array(16).fill(0), material: 0 },
          { positions: square, mode: 0 },
          { positions: square, mode: 1, indices: [0, 1] },
          { positions: square, indices: [0, 1, 2, 3], mode: 5 },
          { positions: square, indices: [0, 1, 2], mode: 6 },
          { positions: square, indices: [0, 0, 0] },
        ],
        { ...box(), material: 1 },
        [
          { ...box(), material: 2 },
          { positions: square, indices: [0, 1, 2, 3], mode: 5 },
          { positions: square, indices: [0, 1, 2, 3], mode: 6 },
          { positions: square, indices: [0, 0, 0] },
          { positions: square, mode: 3, indices: [0, 1] },
        ],
      ],
      materials: [
        { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } },
        { pbrMetallicRoughness: { baseColorTexture: { index: 2, texCoord: 3 } } },
        {
          pbrMetallicRoughness: { baseColorTexture: { index: 3 } },
          emissiveTexture: { index: 4, texCoord: 2 },
        },
      ],
      images: [
        { bytes: png(2, 2), mimeType: 'image/png' },
        { bytes: png(4096, 1, ''), mimeType: 'image/png' },
        { bytes: png(2, 2), mimeType: 'image/png' },
        {
          bytes: new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0,
            0, 0, 2, 0, 0, 0, 2,
          ]),
          mimeType: 'image/png',
        },
        {
          bytes: new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000'),
          mimeType: 'image/gif',
        },
      ],
      animations: [
        [
          { node: 0, path: 'translation', times: [0, 1], values: [0, 0, 0, 1, 0, 0] },
          { node: 0, path: 'weights', times: [0, 1], values: [0, 0, 0, 1, 1, 1] },
        ],
        [{ node: 3, path: 'weights', times: [0, 1], values: [0, 0, 0, 1, 1, 1] }],
        [
          { node: 3, path: 'pointer', times: [0, 1], values: [0, 0, 0, 1, 1, 1] },
          { node: 4, path: 'weights', times: [0, 1], values: [0, 0, 0, 1, 1, 1] },
        ],
      ],
      edit: (json) => {
        json.asset = { version: '2.0', generator: 'x', copyright: '© Someone' };
        json.cameras = [{}, {}];
        json.skins = [{ joints: [0] }, { joints: [0] }];
        json.extras = { a: 1 };
        (json.meshes as Json[])[0] = {
          ...((json.meshes as Json[])[0] as Json),
          name: 'm',
          extras: {},
        };
        json.extensionsUsed = ['KHR_lights_punctual', 'KHR_interactivity'];
        json.extensions = { KHR_lights_punctual: { lights: [{}, {}] } };
        const primitives = ((json.meshes as Json[])[0] as Json).primitives as Json[];
        (primitives[0] as Json).targets = [{ POSITION: 0 }, { POSITION: 0 }];
        ((primitives[0] as Json).attributes as Json).JOINTS_0 = 0;
        ((primitives[0] as Json).attributes as Json).WEIGHTS_0 = 0;
        const more = ((json.meshes as Json[])[1] as Json).primitives as Json[];
        (more[0] as Json).targets = [{ POSITION: 0 }];
        ((more[0] as Json).attributes as Json).JOINTS_0 = 0;
        json.textures = [...(json.textures as Json[]), { extensions: {} }, { extensions: {} }];
        json.materials = [
          ...(json.materials as Json[]),
          { emissiveTexture: { index: 5 } },
          { emissiveTexture: { index: 6 } },
        ];
      },
    }),
    { units: 'cm', up: 'z' },
  ],
  [
    inputGlb({
      ...BOX,
      nodes: [{ name: 'one', mesh: 0, children: [1] }, { name: 'empty' }],
      edit: (json) => {
        json.cameras = [{}];
        json.skins = [{ joints: [0] }];
        json.extras = {};
        json.extensions = { KHR_lights_punctual: { lights: [{}] } };
        ((json.accessors as Json[])[0] as Json).name = 'a';
        const primitive = (((json.meshes as Json[])[0] as Json).primitives as Json[])[0] as Json;
        primitive.targets = [{ POSITION: 0 }];
      },
    }),
    { units: 'mm' },
  ],
  [
    inputGlb({
      ...BOX,
      nodes: Array.from({ length: 20 }, (_, at) => ({
        name: 'same',
        mesh: 0,
        translation: [at, 0, 0],
      })),
    }),
    { units: 'in' },
  ],
  [
    inputGlb({
      nodes: Array.from({ length: 6 }, (_, at) => ({ mesh: 0, translation: [at, 0, 0] })),
      meshes: [grid(300)],
    }),
    { simplify: true },
  ],
];

/** Files that cleaning refuses, each for a reason of its own. */
const REFUSED: Uint8Array[] = [
  new TextEncoder().encode('{"asset":{"version":"1.0"}}'),
  new TextEncoder().encode('nothing'),
  new TextEncoder().encode('{"asset":'),
  new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]),
  edited((json) => (json.extensionsUsed = ['KHR_draco_mesh_compression'])),
  edited(
    (json) => ((json.buffers as Json[])[0] = { byteLength: 4, uri: 'https://example.com/a.bin' }),
  ),
  edited((json) => (json.images = [{ uri: 'data:image/png;base64,AAA' }])),
  edited((json) => (json.nodes = Array.from({ length: 70_000 }, () => ({})))),
  edited((json) => {
    json.nodes = Array.from({ length: 9_000 }, () => ({ mesh: 0 }));
    json.scenes = [{ nodes: Array.from({ length: 9_000 }, (_, at) => at) }];
  }),
  edited((json) => (((json.accessors as Json[])[0] as Json).count = 1e9)),
  edited((json) => (((json.accessors as Json[])[0] as Json).byteOffset = 2)),
  edited((json) => (((json.bufferViews as Json[])[0] as Json).byteLength = 1 << 30)),
  edited((json) => (((json.bufferViews as Json[])[0] as Json).byteStride = 3)),
  edited((json) => (((json.accessors as Json[])[0] as Json).componentType = 1)),
  edited((json) => (((json.nodes as Json[])[0] as Json).children = [0])),
  edited((json) => (((json.nodes as Json[])[0] as Json).translation = ['x'])),
  edited((json) => (json.scenes = [{ nodes: [0, 0] }])),
  edited((json) => (json.buffers = [{ byteLength: 4 }, { byteLength: 4 }])),
  edited((json) => {
    for (let at = 0; at < 64; at += 1) {
      (json.accessors as Json[]).push({ componentType: 5126, count: 8_000_000, type: 'VEC4' });
    }
  }),
  inputGlb({
    ...BOX,
    animations: [[{ node: 0, path: 'translation', times: [0, 3600], values: [0, 0, 0, 1, 0, 0] }]],
  }),
  inputGlb({
    nodes: Array.from({ length: 6 }, (_, at) => ({ mesh: 0, translation: [at, 0, 0] })),
    meshes: [grid(300)],
  }),
  inputGlb({ nodes: [{ mesh: 0 }], meshes: [{ positions: square, mode: 0 }] }),
  inputGlb({ nodes: [{ mesh: 0 }], meshes: [box([0, 0, 0], [1e6, 1, 1])] }),
];

/** The program's answers about solid files, as it writes them. */
const HASH = 'a'.repeat(64);
const PROGRAM = [
  'Cleaning the file took over 30 seconds, so it was stopped.',
  'Checking the solid file took over 30 seconds, so it was stopped.',
  'Cleaning the file needed over 1,024 MiB of memory, so it was stopped.',
  'Checking the solid file needed over 1,024 MiB of memory, so it was stopped.',
  'Cleaning the file failed: its worker stopped (1).',
  'Checking the solid file failed: its worker stopped (1).',
  'Cleaning the file tried to reach the network or a file, which it never may, so nothing was kept.',
  'Checking the solid file tried to reach the network or a file, which it never may, so nothing was kept.',
  'The file could not be cleaned.',
  'The solid file could not be checked.',
  'Visual Anything is receiving two solids already: import this one once they are prepared.',
  'Visual Anything is cleaning solids already: import this one once they are prepared.',
  'The pieces of the file to import do not fit together.',
  'The file is over 256 MiB, the most cleaning reads.',
  `Visual Anything holds no cleaned file "solids/${HASH}.glb": import the file, and the program cleans it first.`,
  `Visual Anything holds no prepared file "solids/${HASH}.glb": prepare it again, as it holds one for ten minutes.`,
  `The solid file "solids/${HASH}.glb" is not one Visual Anything cleaned: its hash is not its name`,
  `The solid file "solids/${HASH}.glb" is not one Visual Anything cleaned: The GLB is cut short.`,
  `The solid "Arm" says another description than its file "solids/${HASH}.glb" holds; it is drawn as its file is.`,
  `The solid "Arm" is drawn as its placeholder. The bytes of the solid file "solids/${HASH}.glb" are not the ones its name says.`,
  `The solid "Arm" names the file "solids/${HASH}.glb", which the project does not have; it is drawn as its placeholder.`,
  `The solid "Arm" names "solids/${HASH}.glb", which is not a regular file; it is drawn as its placeholder.`,
  `The solid "Arm" names the file "solids/${HASH}.glb" of 412816 bytes, but it holds 3; it is drawn as its placeholder.`,
  'This Visual Anything cleans no solids.',
  'The file could not be read as glTF: The file names a part of itself that it does not hold.',
];

describe('what cleaning a solid says, in Spanish (ADR 0038, ADR 0075)', () => {
  it('reads every line of the report, every refusal and every answer in Spanish', async () => {
    const lines: string[] = [];
    for (const [bytes, options] of FILES) {
      const cleaned = await cleanSolid(bytes, options);
      expect(cleaned.ok, JSON.stringify(cleaned.ok ? '' : cleaned.problems)).toBe(true);
      if (cleaned.ok) lines.push(...cleaned.report);
    }
    const refusals: string[] = [];
    for (const bytes of REFUSED) {
      const cleaned = await cleanSolid(bytes);
      expect(cleaned.ok, String(REFUSED.indexOf(bytes))).toBe(false);
      if (!cleaned.ok) refusals.push(...cleaned.problems.map((each) => each.message));
    }
    // Every kind of thing the report counts, said once and more than once, and every sentence.
    expect(lines.length).toBeGreaterThan(40);
    expect(new Set(refusals).size).toBe(REFUSED.length);
    for (const message of [...lines, ...refusals, ...PROGRAM]) {
      expect(untranslatedParts('es', message), message).toEqual([]);
    }
    expect(translateMessage('es', 'The node "3 more" is named "_3_more".')).toBe(
      'El nodo glTF "3 more" se llama "_3_more".',
    );
  }, 60_000);
});
