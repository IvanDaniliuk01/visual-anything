/**
 * The physical-space panel's messages to and from the solid worker (ADR 0076): each is read strictly,
 * whatever it carries, and read back as it was sent.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SPACE_NAME,
  readSolidWorkerReply,
  readSolidWorkerRequest,
  readSpaceCamera,
  type SolidWorkerReply,
  type SolidWorkerRequest,
  type SpaceDrawnEntry,
} from './protocol';

const HASH = 'a'.repeat(64);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const MOVED = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0.5, -1, 1];
const CAMERA = { target: { x: 0, y: 0.5, z: 0 }, azimuth: 30, elevation: 20, distance: 3 };
const SIZE = { width: 640, height: 480 };

const ENTRIES: SpaceDrawnEntry[] = [
  { element: 'arm', name: 'Arm', matrix: IDENTITY, solid: HASH, bounds: box(1) },
  { element: 'wrist', name: 'Wrist', matrix: MOVED, part: { of: 'arm', index: 3 } },
  { element: 'camera', name: 'Wrist camera', matrix: MOVED, marker: true },
];

function box(half: number) {
  return { min: { x: -half, y: -half, z: -half }, max: { x: half, y: half, z: half } };
}

function reason(read: { ok: boolean; reason?: string }): string | undefined {
  return read.ok ? undefined : read.reason;
}

const bitmap = (width: number, height: number) => ({ width, height, close() {} });

const show = (overrides: Record<string, unknown> = {}) => ({
  type: 'space/show',
  space: 1,
  size: SIZE,
  entries: ENTRIES,
  states: [],
  ...overrides,
});

describe('what the app sends the worker for a space', () => {
  it('reads each request as it was sent', () => {
    const requests: SolidWorkerRequest[] = [
      { type: 'space/show', space: 1, size: SIZE, entries: ENTRIES, states: [] },
      {
        type: 'space/show',
        space: 2,
        size: SIZE,
        entries: ENTRIES,
        states: [
          { element: 'arm', selected: true, fill: '#AA3300', opacity: 0.5 },
          { element: 'wrist', hidden: true, faint: true, highlighted: true, hovered: true },
        ],
        camera: CAMERA,
        cut: { axis: 'y', at: 0.25, keep: 'below' },
        explode: 1.5,
        names: true,
        lines: [
          {
            relation: 'r1',
            from: { x: 0, y: 0, z: 0 },
            to: { x: 1, y: 2, z: 3 },
            highlighted: true,
            markers: [0, 0.5, 1],
          },
          {
            relation: 'r2',
            from: { x: 0, y: 0, z: 0 },
            to: { x: 0.5, y: 1, z: 1.5 },
            ends: { from: 'wrist', to: 'r1' },
          },
        ],
      },
      { type: 'space/update', space: 1, camera: CAMERA },
      { type: 'space/update', space: 1, camera: null, cut: null },
      { type: 'space/update', space: 1, size: { width: 1, height: 1 }, entries: [], states: [] },
      { type: 'space/update', space: 1, explode: 0, names: false, lines: [] },
      {
        type: 'space/show',
        space: 3,
        size: SIZE,
        entries: [
          {
            element: 'heart',
            name: 'Heart',
            matrix: IDENTITY,
            solid: HASH,
            as: 'chest',
            fill: '#AA3300',
          },
          {
            element: 'pin',
            name: 'Pin',
            matrix: MOVED,
            marker: true,
            fill: '#0055FF',
            in: 'heart',
          },
        ],
        states: [],
        theme: 'dark',
        pixelRatio: 2,
        handles: {
          mode: 'rotate',
          at: { x: 1, y: 0, z: 0 },
          rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
          active: 'y',
        },
      },
      { type: 'space/update', space: 1, handles: { mode: 'move', at: { x: 0, y: 0, z: 0 } } },
      { type: 'space/update', space: 1, handles: null, theme: 'light', pixelRatio: 0.5 },
      { type: 'space/framing', space: 1, id: 7 },
      { type: 'space/framing', space: 1, id: 8, elements: ['arm', 'wrist'] },
      { type: 'space/pick', space: 1, id: 9, x: 12.5, y: 0 },
      { type: 'space/end', space: 1 },
    ];
    for (const request of requests) {
      expect(readSolidWorkerRequest(request)).toEqual({ ok: true, value: request });
    }
  });

  it('leaves out states and lines that are off', () => {
    const read = readSolidWorkerRequest(
      show({ states: [{ element: 'arm', selected: false, hidden: true }] }),
    );
    expect(read.ok && read.value.type === 'space/show' && read.value.states).toEqual([
      { element: 'arm', hidden: true },
    ]);
  });

  it('refuses what a space cannot hold', () => {
    const cases: [unknown, string][] = [
      [show({ space: 0 }), 'A space is a whole number from 1.'],
      [
        show({ entries: undefined }),
        'Showing a space gives its size, its entries and their states.',
      ],
      [show({ camera: null }), 'A space’s camera is an object.'],
      [show({ cut: null }), 'A cut is an object.'],
      [show({ extra: 1 }), 'space/show holds no "extra".'],
      [show({ entries: [ENTRIES[0], ENTRIES[0]] }), 'A space draws each element once.'],
      [
        show({ entries: [{ ...ENTRIES[0], element: 'not an id' }] }),
        'An entry’s element is an id.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], matrix: IDENTITY.slice(1) }] }),
        'A matrix is 16 numbers.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], matrix: [...IDENTITY.slice(1), Number.NaN] }] }),
        'A matrix’s number is a number from -1000000000 to 1000000000.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], name: 'x'.repeat(MAX_SPACE_NAME + 1) }] }),
        'An entry’s name is text of at most 200 characters.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], solid: 'nope' }] }),
        'A solid is named by its SHA-256, in lowercase hexadecimal.',
      ],
      [
        show({ entries: [{ element: 'a', name: 'A', matrix: IDENTITY, bounds: box(1) }] }),
        'Only an entry that draws a solid has its bounds.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], bounds: { min: box(1).max, max: box(1).min } }] }),
        'Bounds’ least corner is nowhere past their greatest.',
      ],
      [
        show({ entries: [{ ...ENTRIES[0], marker: true }] }),
        'An entry drawn as a marker draws no solid and is no part.',
      ],
      [
        show({ entries: [{ ...ENTRIES[1], part: { of: 'arm', index: -1 } }] }),
        "A part is a part's index, from 0 to 4095.",
      ],
      [show({ states: [{ element: 'arm', fill: 'red' }] }), 'A fill is a color, #RRGGBB.'],
      [show({ states: [{ element: 'arm', opacity: 2 }] }), 'An opacity is a number from 0 to 1.'],
      [
        show({ states: [{ element: 'arm', selected: 'yes' }] }),
        'Whether it is selected is true or false.',
      ],
      [show({ camera: { ...CAMERA, distance: 0 } }), 'A space’s camera looks from more than 0 m.'],
      [
        show({ camera: { ...CAMERA, elevation: 90 } }),
        'A space’s elevation is a number from -89 to 89.',
      ],
      [show({ cut: { axis: 'w', at: 0, keep: 'below' } }), 'A cut’s axis is x, y or z.'],
      [show({ explode: 3 }), 'An explosion is a number from 0 to 2.'],
      [
        show({ lines: [{ relation: 'r', from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0 } }] }),
        "Where a line ends's coordinate is a number from -100000000 to 100000000.",
      ],
      [
        show({
          lines: [
            { relation: 'r', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, markers: [2] },
          ],
        }),
        'A marker is a number from 0 to 1.',
      ],
      [
        show({
          lines: [
            {
              relation: 'r',
              from: { x: 0, y: 0, z: 0 },
              to: { x: 1, y: 0, z: 0 },
              ends: { from: 'arm' },
            },
          ],
        }),
        'What a line ends on is an id.',
      ],
      [
        show({
          lines: [
            {
              relation: 'r',
              from: { x: 0, y: 0, z: 0 },
              to: { x: 1, y: 0, z: 0 },
              ends: { from: 'arm', to: 'wrist', via: 'r' },
            },
          ],
        }),
        'A line’s ends holds no "via".',
      ],
      [
        { type: 'space/framing', space: 1, id: 1, elements: ['ok', ''] },
        'An element framed is an id.',
      ],
      [
        { type: 'space/pick', space: 1, id: 1, x: -1, y: 0 },
        'A pixel picked lies within the frames of its space.',
      ],
      [{ type: 'space/end', space: 1, id: 1 }, 'space/end holds no "id".'],
      [
        show({ entries: [{ ...ENTRIES[0], as: 'not an id' }] }),
        'The container an entry is drawn as is an id.',
      ],
      [show({ entries: [{ ...ENTRIES[2], fill: 'blue' }] }), 'A fill is a color, #RRGGBB.'],
      [
        show({ entries: [{ ...ENTRIES[2], in: 'not an id' }] }),
        'What an entry is posed in is an id.',
      ],
      [show({ entries: [{ ...ENTRIES[1], in: 'arm' }] }), 'An anchored part is posed in nothing.'],
      [show({ theme: 'sepia' }), 'A space’s theme is "light" or "dark".'],
      [show({ pixelRatio: 8 }), 'A space’s pixel ratio is a number from 0.5 to 4.'],
      [show({ handles: null }), 'Handles is an object.'],
      [
        show({ handles: { mode: 'scale', at: { x: 0, y: 0, z: 0 } } }),
        'Handles move or rotate: "move" or "rotate".',
      ],
      [
        show({ handles: { mode: 'move', at: { x: 0, y: 0, z: 0 }, active: 'w' } }),
        'The axis of the handles pointed at is x, y or z.',
      ],
      [
        show({
          handles: { mode: 'move', at: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 2 } },
        }),
        'A rotation’s w is a number from -1 to 1.',
      ],
      [
        show({
          handles: {
            mode: 'move',
            at: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0.5, w: 0.5 },
          },
        }),
        'A rotation is a quaternion of unit length.',
      ],
    ];
    for (const [message, why] of cases) {
      expect(reason(readSolidWorkerRequest(message)), JSON.stringify(message)).toBe(why);
    }
  });
});

describe('what the worker sends the app for a space', () => {
  it('reads each reply as it was sent', () => {
    const replies: SolidWorkerReply[] = [
      {
        type: 'space/frame',
        space: 1,
        serial: 1,
        camera: CAMERA,
        bitmap: bitmap(640, 480) as unknown as ImageBitmap,
        width: 640,
        height: 480,
      },
      {
        type: 'space/frame',
        space: 1,
        serial: 2,
        camera: CAMERA,
        bitmap: bitmap(640, 480) as unknown as ImageBitmap,
        width: 640,
        height: 480,
        shifts: [{ element: 'wrist', by: { x: 0, y: 0.1, z: -0.2 } }],
      },
      {
        type: 'space/frame',
        space: 1,
        serial: 3,
        camera: CAMERA,
        bitmap: bitmap(640, 480) as unknown as ImageBitmap,
        width: 640,
        height: 480,
        shifts: [],
      },
      { type: 'space/framed', space: 1, id: 7, camera: CAMERA },
      { type: 'space/picked', space: 1, id: 9, element: 'arm', point: { x: 0.1, y: 0.2, z: 0 } },
      { type: 'space/picked', space: 1, id: 9, element: null },
      {
        type: 'space/picked',
        space: 1,
        id: 9,
        element: null,
        relation: 'r1',
        point: { x: 0.5, y: 0, z: 0 },
      },
      {
        type: 'space/gesture-ended',
        space: 1,
        gesture: 'move',
        moved: [{ element: 'camera', matrix: MOVED }],
      },
      { type: 'refused', space: 1, code: 'unavailable', message: 'No WebGL.' },
    ];
    for (const reply of replies) {
      expect(readSolidWorkerReply(reply)).toEqual({ ok: true, value: reply });
    }
  });

  it('refuses what it cannot take', () => {
    const frame = {
      type: 'space/frame',
      space: 1,
      serial: 1,
      camera: CAMERA,
      bitmap: bitmap(640, 480),
      width: 640,
      height: 480,
    };
    const cases: [unknown, string][] = [
      [{ ...frame, bitmap: bitmap(1, 1) }, 'A picture is a bitmap of the size it says.'],
      [
        { ...frame, partBuffer: { width: 640, height: 480, data: new Uint16Array(640 * 480) } },
        'space/frame holds no "partBuffer".',
      ],
      [
        { ...frame, camera: { azimuth: 0, elevation: 0 } },
        'A space’s distance is a number from 0 to 100000000.',
      ],
      [{ ...frame, camera: { ...CAMERA, target: 1 } }, 'A space’s target is an object.'],
      [{ ...frame, shifts: {} }, 'A frame’s shifts is a list of at most 65536.'],
      [
        { ...frame, shifts: [{ element: 'arm', by: { x: 0, y: 0 } }] },
        "How far a shift moves's coordinate is a number from -100000000 to 100000000.",
      ],
      [
        { ...frame, shifts: [{ element: 'arm', by: { x: 0, y: 0, z: 0 }, part: 1 }] },
        'A shift holds no "part".',
      ],
      [
        { type: 'space/picked', space: 1, id: 1, element: 'not an id' },
        'The element picked is an id.',
      ],
      [
        { type: 'space/picked', space: 1, id: 1, element: 'arm', relation: 'r1' },
        'A pick answers an element or a relation, not both.',
      ],
      [
        { type: 'space/gesture-ended', space: 1, gesture: 'scale', moved: [] },
        'A gesture is "move" or "rotate".',
      ],
      [
        { type: 'space/gesture-ended', space: 1, gesture: 'move', moved: [] },
        'A gesture that ended moved something.',
      ],
      [
        {
          type: 'space/gesture-ended',
          space: 1,
          gesture: 'rotate',
          moved: [{ element: 'a', matrix: [] }],
        },
        'A matrix is 16 numbers.',
      ],
      [
        { type: 'refused', space: 0, code: 'failed', message: '' },
        'A space is a whole number from 1.',
      ],
    ];
    for (const [message, why] of cases) {
      expect(reason(readSolidWorkerReply(message)), JSON.stringify(message)).toBe(why);
    }
  });

  it('reads a camera alone', () => {
    expect(readSpaceCamera(CAMERA)).toEqual({ ok: true, value: CAMERA });
    expect(reason(readSpaceCamera({ ...CAMERA, azimuth: 181 }))).toBe(
      'A space’s azimuth is a number from -180 to 180.',
    );
  });
});
