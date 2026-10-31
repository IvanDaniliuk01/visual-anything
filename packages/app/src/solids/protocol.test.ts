/**
 * The solid worker's protocol (ADR 0075): every message either way is read strictly, and the buckets
 * a picture is drawn at.
 */
import { describe, expect, it } from 'vitest';
import {
  readSolidCamera,
  readSolidWorkerReply,
  readSolidWorkerRequest,
  solidBucketFor,
  solidPictureSize,
  type SolidWorkerReply,
  type SolidWorkerRequest,
} from './protocol';

const HASH = '0'.repeat(64);
const CAMERA = { azimuth: 30, elevation: 20 };
const VIEW = {
  solid: HASH,
  size: { width: 256, height: 128 },
  camera: CAMERA,
  lighting: 'studio',
  hidden: [1, 4],
  parts: true,
} as const;

function reason(read: { ok: boolean; reason?: string }): string | undefined {
  return read.ok ? undefined : read.reason;
}

const bitmap = (width: number, height: number) => ({ width, height, close() {} });

describe('the buckets a picture is drawn at', () => {
  it('takes the smallest bucket at least as large, up to the largest the worker draws', () => {
    expect([1, 128, 129, 300, 600, 1500, 5000].map((pixels) => solidBucketFor(pixels))).toEqual([
      128, 128, 256, 512, 1024, 2048, 2048,
    ]);
    expect(solidBucketFor(5000, 1024)).toBe(1024);
    expect(solidBucketFor(5000, 100)).toBe(128);
  });

  it('gives the longer side the bucket and keeps the aspect', () => {
    expect(solidPictureSize(256, 2)).toEqual({ width: 256, height: 128 });
    expect(solidPictureSize(256, 0.5)).toEqual({ width: 128, height: 256 });
    expect(solidPictureSize(128, 1000)).toEqual({ width: 128, height: 1 });
    expect(solidPictureSize(128, Number.NaN)).toEqual({ width: 128, height: 128 });
  });
});

describe('what the app sends the worker', () => {
  it('reads each request', () => {
    const requests: SolidWorkerRequest[] = [
      { type: 'load', id: 1, hash: HASH, bytes: new ArrayBuffer(8) },
      { type: 'release', hash: HASH },
      { type: 'draw', id: 2, key: 'k@256', ...VIEW },
      { type: 'draw', id: 3, key: 'k@256', ...VIEW, only: 2 },
      { type: 'turn/start', turn: 1, ...VIEW, size: { width: 300, height: 211 } },
      { type: 'turn/camera', turn: 1, camera: { ...CAMERA, zoom: 2 } },
      { type: 'turn/camera', turn: 1, camera: CAMERA, size: { width: 10, height: 10 } },
      { type: 'turn/play', turn: 1, animation: 0 },
      { type: 'turn/play', turn: 1, animation: null },
      { type: 'turn/end', turn: 1 },
      {
        type: 'pick',
        id: 4,
        x: 10.5,
        y: 3,
        solid: HASH,
        size: { width: 256, height: 128 },
        camera: CAMERA,
        hidden: [],
      },
    ];
    for (const request of requests) {
      expect(readSolidWorkerRequest(request)).toEqual({ ok: true, value: request });
    }
  });

  it('refuses what does not fit the protocol', () => {
    const draw = { type: 'draw', id: 2, key: 'k', ...VIEW };
    const cases: [unknown, string][] = [
      [null, 'A message to the solid worker is an object.'],
      [{ type: 'run', code: 'x' }, 'The solid worker takes no message "run".'],
      [{ ...draw, url: 'https://example.com' }, 'draw holds no "url".'],
      [{ ...draw, solid: 'arm.glb' }, 'A solid is named by its SHA-256, in lowercase hexadecimal.'],
      [
        { ...draw, size: { width: 300, height: 100 } },
        "A picture's longer side is one of 128, 256, 512, 1024, 2048 pixels.",
      ],
      [
        { ...draw, size: { width: 4096, height: 4096 } },
        'A size is whole pixels, from 1 to 2048 a side.',
      ],
      [{ ...draw, hidden: [3, 1] }, 'The hidden parts are listed once each, in ascending order.'],
      [{ ...draw, hidden: [4096] }, "A hidden part is a part's index, from 0 to 4095."],
      [{ ...draw, lighting: 'neon' }, 'Lighting is "studio" or "flat".'],
      [
        { ...draw, camera: { azimuth: 200, elevation: 0 } },
        "A camera's azimuth is a number from -180 to 180.",
      ],
      [{ ...draw, id: 0 }, 'A draw’s id is a whole number from 1.'],
      [{ ...draw, key: '' }, "A picture's key is text of 1 to 2048 characters."],
      [
        { type: 'load', id: 1, hash: HASH, bytes: new Uint8Array(4) },
        'A load hands over the bytes.',
      ],
      [
        { type: 'turn/play', turn: 1, animation: 16 },
        'An animation is its index, from 0 to 15, or null.',
      ],
      [
        {
          type: 'pick',
          id: 1,
          x: 300,
          y: 0,
          solid: HASH,
          size: { width: 256, height: 128 },
          camera: CAMERA,
          hidden: [],
        },
        'A pixel picked lies within its view.',
      ],
    ];
    for (const [message, why] of cases) expect(reason(readSolidWorkerRequest(message))).toBe(why);
  });

  it('reads a camera within the schema’s ranges', () => {
    expect(
      readSolidCamera({
        azimuth: -180,
        elevation: 89,
        zoom: 16,
        target: { x: 0, y: 1, z: 2 },
        projection: 'orthographic',
      }).ok,
    ).toBe(true);
    expect(reason(readSolidCamera({ azimuth: 0, elevation: 90 }))).toBe(
      "A camera's elevation is a number from -89 to 89.",
    );
    expect(reason(readSolidCamera({ azimuth: 0, elevation: 0, zoom: 0.1 }))).toBe(
      "A camera's zoom is a number from 0.25 to 16.",
    );
  });
});

describe('what the worker sends the app', () => {
  it('reads each reply', () => {
    const picture = bitmap(256, 128);
    const replies: SolidWorkerReply[] = [
      { type: 'ready', limits: { largestPicture: 2048, memoryBytes: 768 * 1024 * 1024 } },
      { type: 'loaded', id: 1, hash: HASH, parts: 3, animations: 1 },
      {
        type: 'picture',
        id: 2,
        key: 'k@256',
        bitmap: picture as unknown as ImageBitmap,
        width: 256,
        height: 128,
        partBuffer: { width: 256, height: 128, data: new Uint16Array(256 * 128) },
      },
      {
        type: 'frame',
        turn: 1,
        serial: 3,
        camera: CAMERA,
        bitmap: picture as unknown as ImageBitmap,
        width: 256,
        height: 128,
        time: 1.5,
      },
      { type: 'picked', id: 4, part: 2, point: { x: 0, y: 0.5, z: 0 } },
      { type: 'picked', id: 5, part: null },
      { type: 'refused', id: 6, code: 'not-loaded', message: 'Load it first.' },
      { type: 'refused', turn: 1, code: 'context-lost', message: 'Lost.' },
      { type: 'let-go', hashes: [HASH] },
      { type: 'context-lost' },
      { type: 'context-restored' },
    ];
    for (const reply of replies) {
      expect(readSolidWorkerReply(reply)).toEqual({ ok: true, value: reply });
    }
  });

  it('refuses a picture whose bitmap or part buffer is not its size, and unknown codes', () => {
    const picture = {
      type: 'picture',
      id: 2,
      key: 'k',
      bitmap: bitmap(256, 128),
      width: 256,
      height: 128,
    };
    expect(reason(readSolidWorkerReply({ ...picture, bitmap: bitmap(128, 128) }))).toBe(
      'A picture is a bitmap of the size it says.',
    );
    expect(reason(readSolidWorkerReply({ ...picture, bitmap: { width: 256, height: 128 } }))).toBe(
      'A picture is a bitmap of the size it says.',
    );
    expect(
      reason(
        readSolidWorkerReply({
          ...picture,
          partBuffer: { width: 256, height: 128, data: new Uint8Array(256 * 128) },
        }),
      ),
    ).toBe('A part buffer holds a number for each pixel of its picture.');
    expect(
      reason(
        readSolidWorkerReply({
          ...picture,
          partBuffer: { width: 256, height: 128, data: new Uint16Array(10) },
        }),
      ),
    ).toBe('A part buffer holds a number for each pixel of its picture.');
    expect(
      reason(readSolidWorkerReply({ type: 'refused', id: 1, code: 'oops', message: '' })),
    ).toBe(
      "A refusal's code is one of not-loaded, invalid-solid, too-large, context-lost, unavailable, failed.",
    );
    expect(reason(readSolidWorkerReply({ type: 'picked', id: 1, part: 4096 }))).toBe(
      "The part picked is a part's index, from 0 to 4095.",
    );
    expect(
      reason(
        readSolidWorkerReply({ type: 'ready', limits: { largestPicture: 4096, memoryBytes: 1 } }),
      ),
    ).toBe('The largest picture is from 128 to 2048 pixels.');
  });
});
