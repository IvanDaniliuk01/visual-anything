/**
 * Hostile glTF files, cleaned (ADR 0075): behavior extensions, every address, cameras, lights,
 * extras, skins, morph targets, points and lines are dropped or refused; nothing is fetched and
 * nothing runs; malformed chunks, accessors that leave their buffers, and bombs of nodes, triangles,
 * textures and keyframes are refused or kept within the caps; names that try to be something else
 * become names of the class a solid keeps. Every file is made here, and small.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { SOLID_PART_NAME, readSolid, type Problem } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanSolid, type CleanedSolid } from './clean';
import { cleanInWorker } from './cleaner';
import { box, chunk, glbOf, gltfParts, grid, inputGlb, png, type InputSolid } from './test/gltf';

type Json = Record<string, unknown>;

const BOX: InputSolid = { nodes: [{ name: 'part', mesh: 0 }], meshes: [box()] };

/** The input solid with its JSON changed. */
function edited(edit: (json: Json) => void, solid: InputSolid = BOX): Uint8Array {
  return inputGlb({ ...solid, edit });
}

function refusedWith(result: CleanedSolid): Problem {
  expect(result.ok, 'it was cleaned').toBe(false);
  if (result.ok) throw new Error('It was cleaned.');
  return result.problems[0] as Problem;
}

function cleanedOf(result: CleanedSolid): Extract<CleanedSolid, { ok: true }> {
  if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.problems)}`);
  expect(readSolid(result.bytes).ok).toBe(true);
  return result;
}

/** The JSON chunk of a canonical file, as text. */
function jsonOf(bytes: Uint8Array): string {
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  return new TextDecoder().decode(bytes.subarray(20, 20 + length));
}

let attempts: string[] = [];

beforeEach(() => {
  attempts = [];
  const refuse = (name: string) => () => {
    attempts.push(name);
    throw new Error('no network');
  };
  vi.stubGlobal('fetch', refuse('fetch'));
  vi.spyOn(http, 'request').mockImplementation(refuse('http.request'));
  vi.spyOn(http, 'get').mockImplementation(refuse('http.get'));
  vi.spyOn(https, 'request').mockImplementation(refuse('https.request'));
  vi.spyOn(https, 'get').mockImplementation(refuse('https.get'));
  vi.spyOn(net, 'connect').mockImplementation(refuse('net.connect'));
  vi.spyOn(dns, 'lookup').mockImplementation(refuse('dns.lookup'));
  delete (globalThis as { __ran?: boolean }).__ran;
});

afterEach(() => {
  // Nothing was fetched, and nothing in a file ran.
  expect(attempts).toEqual([]);
  expect((globalThis as { __ran?: boolean }).__ran).toBeUndefined();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('behavior and what a solid keeps none of', () => {
  it('drops KHR_interactivity, KHR_animation_pointer and every other extension', async () => {
    const bytes = edited((json) => {
      json.extensionsUsed = ['KHR_interactivity', 'KHR_animation_pointer', 'VA_runs_code'];
      json.extensionsRequired = ['KHR_interactivity', 'VA_runs_code'];
      json.extensions = {
        KHR_interactivity: { graphs: [{ nodes: [{ type: 'event/onStart' }] }] },
        VA_runs_code: { source: 'globalThis.__ran = true' },
      };
      json.animations = [
        {
          channels: [
            {
              sampler: 0,
              target: {
                path: 'pointer',
                extensions: { KHR_animation_pointer: { pointer: '/materials/0/alphaCutoff' } },
              },
            },
          ],
          samplers: [{ input: 0, output: 0 }],
        },
      ];
    });
    const result = cleanedOf(await cleanSolid(bytes));
    const text = jsonOf(result.bytes);
    expect(text).not.toMatch(/interactivity|animation_pointer|VA_runs_code|pointer|__ran/);
    expect(result.report).toEqual(
      expect.arrayContaining([
        'The extension KHR_animation_pointer was dropped: a solid keeps none of it.',
        'The extension KHR_interactivity was dropped: a solid keeps none of it.',
        'The extension VA_runs_code was dropped: a solid keeps none of it.',
        '1 animation channel that moves nothing a solid keeps',
        '1 animation that moves nothing a solid keeps',
      ]),
    );
  });

  it('drops cameras, lights, extras, skins, morph targets, points and lines', async () => {
    const square = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const bytes = inputGlb({
      nodes: [{ name: 'part', mesh: 0 }, { name: 'eye' }, { name: 'lamp' }],
      meshes: [
        [
          box(),
          { positions: square, mode: 0 },
          { positions: square, indices: [0, 1, 1, 2], mode: 1 },
        ],
      ],
      edit: (json) => {
        json.cameras = [{ type: 'perspective', perspective: { yfov: 1, znear: 0.1 } }];
        json.extensionsUsed = ['KHR_lights_punctual'];
        json.extensions = {
          KHR_lights_punctual: { lights: [{ type: 'point' }, { type: 'spot' }] },
        };
        const nodes = json.nodes as Json[];
        (nodes[1] as Json).camera = 0;
        (nodes[2] as Json).extensions = { KHR_lights_punctual: { light: 0 } };
        (nodes[0] as Json).skin = 0;
        (nodes[0] as Json).weights = [0.5];
        (nodes[0] as Json).extras = { note: 'globalThis.__ran = true' };
        json.skins = [{ joints: [0] }];
        json.extras = { author: 'someone' };
        const mesh = (json.meshes as Json[])[0] as Json;
        mesh.weights = [0.5];
        const primitive = (mesh.primitives as Json[])[0] as Json;
        primitive.targets = [{ POSITION: 0 }, { POSITION: 0 }];
        (primitive.attributes as Json).JOINTS_0 = 0;
        (primitive.attributes as Json).WEIGHTS_0 = 0;
        primitive.extras = { x: 1 };
      },
    });
    const result = cleanedOf(await cleanSolid(bytes));
    const text = jsonOf(result.bytes);
    for (const word of [
      'camera',
      'skin',
      'extras',
      'KHR_lights',
      'targets',
      'weights',
      'JOINTS',
      'WEIGHTS',
      'mode',
    ]) {
      expect(text).not.toContain(word);
    }
    expect(result.report).toEqual(
      expect.arrayContaining([
        '1 camera',
        '2 lights',
        '1 skin',
        '2 morph targets',
        '2 primitives of points or lines',
        '2 vertex attributes a solid keeps none of',
        '3 sets of extras',
        '2 nodes that draw nothing',
        'The extension KHR_lights_punctual was dropped: a solid keeps none of it.',
      ]),
    );
  });

  it('drops textures in other formats, KTX2 included, keeping their materials’ factors', async () => {
    const bytes = inputGlb({
      ...BOX,
      meshes: [{ ...box(), texcoords: new Array(16).fill(0), material: 0 }],
      materials: [
        {
          pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], baseColorTexture: { index: 0 } },
          emissiveTexture: { index: 1 },
        },
      ],
      images: [
        {
          bytes: new TextEncoder().encode('GIF89a\u0001\u0000\u0001\u0000'),
          mimeType: 'image/gif',
        },
      ],
      edit: (json) => {
        json.extensionsUsed = ['KHR_texture_basisu'];
        json.extensionsRequired = ['KHR_texture_basisu'];
        (json.textures as Json[]).push({ extensions: { KHR_texture_basisu: { source: 0 } } });
      },
    });
    const result = cleanedOf(await cleanSolid(bytes));
    expect(result.description.counts.textures).toBe(0);
    expect(jsonOf(result.bytes)).toContain('"baseColorFactor":[1,0,0,1]');
    expect(result.report).toEqual(expect.arrayContaining(['2 textures in other formats']));
  });
});

describe('addresses', () => {
  const ADDRESSES = [
    'https://example.com/arm.bin',
    'http://127.0.0.1:47700/token',
    'file:///etc/passwd',
    'arm.bin',
    '../../secrets/arm.bin',
    '//example.com/arm.bin',
    'javascript:globalThis.__ran=true',
    'blob:https://example.com/0',
    'data:text/html,<script>globalThis.__ran=true</script>',
  ];

  it.each(ADDRESSES)('refuses a buffer at %s before anything reads it', async (uri) => {
    const bytes = edited((json) => {
      (json.buffers as Json[]).push({ byteLength: 4, uri });
    });
    const problem = refusedWith(await cleanSolid(bytes));
    expect(problem.code).toBe('invalid-solid');
    expect(problem.message).toMatch(
      /outside itself, which cleaning never reads: bundle it as \.glb/,
    );
  });

  it.each(ADDRESSES)('refuses an image at %s before anything reads it', async (uri) => {
    const bytes = edited((json) => {
      json.images = [{ uri }];
    });
    expect(refusedWith(await cleanSolid(bytes)).code).toBe('invalid-solid');
  });

  it('drops an address in what it drops, and reads it never', async () => {
    const bytes = edited((json) => {
      json.extras = { uri: 'https://example.com/tracker.png' };
      json.extensionsUsed = ['VA_remote'];
      json.extensions = { VA_remote: { uri: 'https://example.com/x.bin' } };
    });
    const result = cleanedOf(await cleanSolid(bytes));
    expect(jsonOf(result.bytes)).not.toContain('example.com');
  });

  it('reads the data a .gltf holds in data: addresses, and nothing else', async () => {
    const { json, bin } = gltfParts(BOX);
    (json.buffers as Json[])[0] = {
      byteLength: bin.length,
      uri: `data:application/gltf-buffer;base64,${Buffer.from(bin).toString('base64')}`,
    };
    const result = cleanedOf(await cleanSolid(new TextEncoder().encode(JSON.stringify(json))));
    expect(result.description.counts.triangles).toBe(12);
  });

  it('refuses a file compressed with Draco, saying to export it without compression', async () => {
    const bytes = edited((json) => {
      json.extensionsUsed = ['KHR_draco_mesh_compression'];
    });
    expect(refusedWith(await cleanSolid(bytes))).toEqual({
      code: 'invalid-solid',
      message:
        'The file is compressed with Draco, which cleaning does not read: export it without compression.',
    });
  });
});

describe('malformed files', () => {
  const { json, bin } = gltfParts(BOX);
  const good = glbOf(json, bin);
  const withLength = (bytes: Uint8Array, at: number, value: number) => {
    const copy = bytes.slice();
    new DataView(copy.buffer).setUint32(at, value, true);
    return copy;
  };
  const CASES: [string, Uint8Array][] = [
    ['a file cut short', good.subarray(0, 16)],
    ['a GLB longer than its file', withLength(good, 8, good.length + 100)],
    ['a JSON chunk past its end', withLength(good, 12, good.length)],
    ['a GLB of version 1', withLength(good, 4, 1)],
    [
      'a binary chunk past its end',
      glbOf(json, new Uint8Array(0), [withLength(chunk(bin, 0x004e4942), 0, bin.length * 10)]),
    ],
    [
      'JSON that is not UTF-8',
      glbOf({}, new Uint8Array(0)).map((byte, at) => (at === 20 ? 0xff : byte)),
    ],
    ['JSON that is not JSON', new TextEncoder().encode('{"asset": {"version": "2.0"')],
    ['nothing glTF', new TextEncoder().encode('<html><script>globalThis.__ran=true</script>')],
    [
      'JSON nested past what is read',
      new TextEncoder().encode(
        `{"asset":{"version":"2.0"},"extras":${'['.repeat(200_000)}${']'.repeat(200_000)}}`,
      ),
    ],
    ['glTF 1.0', new TextEncoder().encode('{"asset":{"version":"1.0"}}')],
  ];

  it.each(CASES)('refuses %s as invalid-solid, never throwing', async (_name, bytes) => {
    expect(refusedWith(await cleanSolid(bytes)).code).toBe('invalid-solid');
  });

  const ACCESSORS: [string, (json: Json) => void][] = [
    [
      'an accessor past its buffer view',
      (json) => (((json.accessors as Json[])[0] as Json).count = 1_000_000_000),
    ],
    [
      'a buffer view past its buffer',
      (json) => (((json.bufferViews as Json[])[0] as Json).byteLength = 1 << 30),
    ],
    ['an accessor not aligned', (json) => (((json.accessors as Json[])[0] as Json).byteOffset = 2)],
    [
      'an accessor of a type glTF lacks',
      (json) => (((json.accessors as Json[])[0] as Json).componentType = 5130),
    ],
    [
      'a buffer view of another buffer',
      (json) => (((json.bufferViews as Json[])[0] as Json).buffer = 7),
    ],
    [
      'sparse values past their buffer view',
      (json) =>
        (((json.accessors as Json[])[0] as Json).sparse = {
          count: 2,
          indices: { bufferView: 0, byteOffset: 1 << 20, componentType: 5125 },
          values: { bufferView: 0 },
        }),
    ],
    [
      'a triangle naming a vertex its primitive lacks',
      (json) => {
        // The indices' buffer view, read from offset 0, now names positions' floats as indices.
        ((json.accessors as Json[])[1] as Json).bufferView = 0;
        ((json.accessors as Json[])[1] as Json).componentType = 5125;
      },
    ],
    ['a node holding itself', (json) => (((json.nodes as Json[])[0] as Json).children = [0])],
    [
      'two nodes holding each other',
      (json) => {
        json.nodes = [{ children: [1] }, { children: [0], mesh: 0 }];
        json.scenes = [{ nodes: [] }];
      },
    ],
    [
      'a node placed with words',
      (json) => (((json.nodes as Json[])[0] as Json).translation = ['1', 0, 0]),
    ],
  ];

  it.each(ACCESSORS)('refuses %s', async (_name, edit) => {
    expect(refusedWith(await cleanSolid(edited(edit))).code).toBe('invalid-solid');
  });
});

describe('bombs', () => {
  it('refuses a bomb of nodes past what cleaning reads, and past what a solid keeps', async () => {
    const many = edited((json) => {
      json.nodes = Array.from({ length: 70_000 }, () => ({}));
      json.scenes = [{ nodes: [] }];
    });
    expect(refusedWith(await cleanSolid(many))).toEqual({
      code: 'solid-too-large',
      message: 'The file holds 70,000 nodes, more than the 65,536 cleaning reads.',
    });
    const drawn = edited((json) => {
      json.nodes = Array.from({ length: 9_000 }, () => ({ mesh: 0 }));
      json.scenes = [{ nodes: Array.from({ length: 9_000 }, (_, at) => at) }];
    });
    expect(refusedWith(await cleanSolid(drawn))).toEqual({
      code: 'solid-too-large',
      message: 'It keeps 9,000 nodes, past the 8,192 a solid holds.',
    });
  });

  it('refuses a bomb of triangles a mesh draws again and again', async () => {
    const bytes = inputGlb({
      nodes: Array.from({ length: 6 }, (_, at) => ({ mesh: 0, translation: [at, 0, 0] })),
      meshes: [grid(300)],
    });
    expect(refusedWith(await cleanSolid(bytes))).toEqual({
      code: 'solid-too-large',
      message:
        'It draws 1,080,000 triangles, past the 1,000,000 a solid holds: simplify it to fit.',
    });
  });

  it('refuses accessors that would make more data than the file could hold', async () => {
    const bytes = edited((json) => {
      const accessors = json.accessors as Json[];
      // Accessors without data are zeros the reader would make: a bomb of 2 GiB.
      for (let at = 0; at < 64; at += 1) {
        accessors.push({ componentType: 5126, count: 8_000_000, type: 'VEC4' });
      }
    });
    expect(refusedWith(await cleanSolid(bytes))).toEqual({
      code: 'solid-too-large',
      message: "The file's accessors would make over 512 MiB of data.",
    });
  });

  it('keeps 32 textures, lets go of the rest, and never decodes a picture past its caps', async () => {
    // A PNG whose header says 100,000 pixels a side: its few bytes would decode to 30 GB.
    const huge = png(1, 1, '');
    new DataView(huge.buffer, huge.byteOffset).setUint32(16, 100_000);
    new DataView(huge.buffer, huge.byteOffset).setUint32(20, 100_000);
    const images = [
      { bytes: huge, mimeType: 'image/png' },
      ...Array.from({ length: 40 }, () => ({ bytes: png(2, 2), mimeType: 'image/png' })),
    ];
    const nodes = images.map((_, at) => ({ mesh: at, translation: [at * 2, 0, 0] }));
    const bytes = inputGlb({
      nodes,
      meshes: images.map((_, at) => ({ ...box(), texcoords: new Array(16).fill(0), material: at })),
      materials: images.map((_, at) => ({
        pbrMetallicRoughness: { baseColorTexture: { index: at } },
      })),
      images,
    });
    const started = performance.now();
    const result = cleanedOf(await cleanSolid(bytes));
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(result.description.counts.textures).toBe(32);
    expect(result.report).toContain('9 textures past their caps');
  });

  it('refuses a bomb of keyframes, and an animation past 60 s', async () => {
    const times = Array.from({ length: 210_000 }, (_, at) => at / 10_000);
    const keyframes = inputGlb({
      ...BOX,
      animations: [
        [{ node: 0, path: 'translation', times, values: times.flatMap((t) => [t, 0, 0]) }],
      ],
    });
    expect(refusedWith(await cleanSolid(keyframes))).toEqual({
      code: 'solid-too-large',
      message: 'It keeps 210,000 keyframes, past the 200,000 a solid holds.',
    });
    const long = inputGlb({
      ...BOX,
      animations: [
        [{ node: 0, path: 'translation', times: [0, 3600], values: [0, 0, 0, 1, 0, 0] }],
      ],
    });
    expect(refusedWith(await cleanSolid(long))).toEqual({
      code: 'solid-too-large',
      message: 'An animation of the file lasts 3600 s, past the 60 s a solid keeps.',
    });
  });

  it('refuses meshopt data that would decode past what the file could hold', async () => {
    const bytes = edited((json) => {
      json.extensionsUsed = ['EXT_meshopt_compression'];
      (json.buffers as Json[]).push({
        byteLength: 1 << 30,
        extensions: { EXT_meshopt_compression: { fallback: true } },
      });
      (json.bufferViews as Json[]).push({
        buffer: 1,
        byteLength: 256 * 4_000_000,
        byteStride: 252,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteLength: 16,
            count: 4_000_000,
            byteStride: 256,
            mode: 'ATTRIBUTES',
          },
        },
      });
    });
    expect(refusedWith(await cleanSolid(bytes)).code).toMatch(/invalid-solid|solid-too-large/);
  });
});

describe('names that try to be something else', () => {
  it('become names of the class a solid keeps, quoted on one line in the report', async () => {
    const names = [
      '<script>globalThis.__ran = true</script>',
      '../../etc/passwd',
      'line\nbreak "quoted"',
      'x'.repeat(10_000),
      '${globalThis.__ran = true}',
      'drop table; --',
    ];
    const bytes = inputGlb({
      nodes: names.map((name, at) => ({ name, mesh: 0, translation: [at * 2, 0, 0] })),
      meshes: [box()],
    });
    const result = cleanedOf(await cleanSolid(bytes));
    for (const part of result.description.parts) expect(part.name).toMatch(SOLID_PART_NAME);
    expect(result.description.parts.map((part) => part.name).slice(0, 3)).toEqual([
      '_script_globalThis.__ran___true__script_',
      '_.._.._etc_passwd',
      'line_break__quoted_',
    ]);
    for (const line of result.report) expect(line).not.toMatch(/[\n\r]/);
    expect(result.report.every((line) => line.length < 300)).toBe(true);
  });
});

describe('hostile files in the worker', () => {
  it('cleans or refuses them there, never reaching the network or a file', async () => {
    const files = [
      edited((json) => {
        json.extensionsUsed = ['KHR_interactivity'];
        json.extensions = { KHR_interactivity: { graphs: [] } };
      }),
      edited((json) => {
        json.images = [{ uri: 'https://example.com/x.png' }];
      }),
      edited((json) => {
        ((json.accessors as Json[])[0] as Json).count = 1_000_000_000;
      }),
    ];
    const answers = [];
    for (const file of files) answers.push(await cleanInWorker(file));
    expect(answers.map((each) => (each.ok ? 'cleaned' : each.problems[0]?.code))).toEqual([
      'cleaned',
      'invalid-solid',
      'invalid-solid',
    ]);
  }, 60_000);
});
