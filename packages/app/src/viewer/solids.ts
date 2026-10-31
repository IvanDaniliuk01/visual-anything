/**
 * Solids in a read-only page (ADR 0075, ADR 0041): what the page holds of the solids its views show,
 * as data the browser never runs, and the client its canvas draws them through.
 *
 * - **Their files** (`form: 'files'`), by default: each solid's cleaned file, by its hash, in base64.
 *   The page then also holds the solid worker with three.js, as text it starts from a `blob:` address
 *   (`page.ts`), and its canvas draws and turns solids as the app's does, the worker checking each
 *   file against its hash, as it does in the app.
 * - **Their pictures only** (`form: 'pictures'`), when the Export dialog asks: each picture the app
 *   drew, by the key its shape asks for it by, as a PNG, with the part buffer of a drawing with parts,
 *   its runs written as numbers. The page then holds neither three.js nor the worker, and its solids
 *   cannot be turned, nor drawn again without the parts a filter hides.
 *
 * Nothing is fetched: the files and pictures are read from the page's own data. A page whose views
 * show no solid holds no `solids` at all.
 */
import { decodeBase64, encodeBase64, solidsIn, type ProjectSnapshot } from '@visual-anything/core';
import { buildScene, type ElementShape } from '../canvas/scene';
import { isAnchoredSolidPart } from '../canvas/solidMark';
import { solidPictureSerial } from '../canvas/image-serials';
import type {
  SolidClient,
  SolidFiles,
  SolidPicture,
  SolidTurning,
  SolidWorkerPort,
} from '../solids/solid-client';
import { createSolidClientWith } from '../solids/solid-client';
import {
  SOLID_BUCKETS,
  solidBucketFor,
  type SolidBucket,
  type SolidPartBuffer,
} from '../solids/protocol';

/** A solid's picture as a page holds it. */
export interface PageSolidPicture {
  /** `solidPictureKey` of the shapes it is drawn on. */
  key: string;
  /** The bucket it was drawn at: its longer side, in pixels. */
  bucket: SolidBucket;
  width: number;
  height: number;
  /** The picture, as a PNG in base64. */
  png: string;
  /** The part buffer of a drawing with parts, as `writePartRuns` writes it, in base64. */
  parts?: string;
}

/** What a page holds of the solids its views show. */
export type PageSolids =
  | { form: 'files'; files: Record<string, string> }
  | { form: 'pictures'; pictures: PageSolidPicture[] };

/** The shapes of the project's views that show a solid's picture of their own, view by view. */
export function shapesShowingSolids(project: ProjectSnapshot): ElementShape[] {
  return project.views.flatMap((view) =>
    buildScene(project, view.id).shapes.filter(
      (shape) =>
        shape.solid !== undefined && shape.solid.placeholder !== true && !isAnchoredSolidPart(shape),
    ),
  );
}

/** The hashes of the files of every solid the project's views show, once each, in the views' order. */
export function solidHashesShown(project: ProjectSnapshot): string[] {
  const catalog = solidsIn(project);
  const hashes = new Set<string>();
  for (const shape of shapesShowingSolids(project)) {
    const hash = shape.solid && catalog.solid(shape.solid.id)?.definition.hash;
    if (hash !== undefined) hashes.add(hash);
  }
  return [...hashes];
}

// The part buffer's runs -----------------------------------------------------------------------------

/** Writes a number as LEB128: seven bits a byte, the lowest first, the high bit set but on the last. */
function writeVarint(out: number[], value: number): void {
  let left = value;
  while (left >= 0x80) {
    out.push((left & 0x7f) | 0x80);
    left = Math.floor(left / 0x80);
  }
  out.push(left);
}

/**
 * A part buffer as runs of equal numbers, row by row from the top left: each run its number and its
 * length, as LEB128, after the buffer's width and height. A picture's parts are a few large regions,
 * so their runs are far smaller than its pixels.
 */
export function writePartRuns(buffer: SolidPartBuffer): Uint8Array {
  const out: number[] = [];
  writeVarint(out, buffer.width);
  writeVarint(out, buffer.height);
  const { data } = buffer;
  let at = 0;
  while (at < data.length) {
    const value = data[at] as number;
    let end = at + 1;
    while (end < data.length && data[end] === value) end++;
    writeVarint(out, value);
    writeVarint(out, end - at);
    at = end;
  }
  return Uint8Array.from(out);
}

/** The most pixels a part buffer of a page holds: the largest picture's. */
const MOST_PART_PIXELS = 2048 * 2048;

/** A part buffer read back from its runs; none when they are not a buffer's whole runs. */
export function readPartRuns(bytes: Uint8Array): SolidPartBuffer | undefined {
  let at = 0;
  const read = (): number | undefined => {
    let value = 0;
    let scale = 1;
    for (let count = 0; count < 5; count++) {
      if (at >= bytes.length) return undefined;
      const byte = bytes[at++] as number;
      value += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) return value;
      scale *= 0x80;
    }
    return undefined;
  };
  const width = read();
  const height = read();
  if (width === undefined || height === undefined || width < 1 || height < 1) return undefined;
  if (width * height > MOST_PART_PIXELS) return undefined;
  const data = new Uint16Array(width * height);
  let filled = 0;
  while (at < bytes.length) {
    const value = read();
    const length = read();
    if (value === undefined || length === undefined || value > 0xffff || length < 1) return undefined;
    if (filled + length > data.length) return undefined;
    data.fill(value, filled, filled + length);
    filled += length;
  }
  return filled === data.length ? { width, height, data } : undefined;
}

// Reading a page's solids ------------------------------------------------------------------------------

const HASH = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads what a page holds of its solids, strictly: every file named by a hash in lowercase
 * hexadecimal and written in base64, every picture with a key, a bucket, a size within it, a PNG and
 * its part buffer's runs in base64, and nothing else. Answers why not, in English, as the page's other
 * checks do.
 */
export function readPageSolids(
  value: unknown,
): { ok: true; solids: PageSolids } | { ok: false; problem: string } {
  const refused = (problem: string) => ({ ok: false as const, problem });
  if (!isRecord(value)) return refused('The page’s solids are not an object.');
  if (value.form === 'files') {
    if (Object.keys(value).some((key) => key !== 'form' && key !== 'files')) {
      return refused('The page’s solids hold more than their form and files.');
    }
    const { files } = value;
    if (!isRecord(files)) return refused('The page’s solid files are not an object.');
    const read: Record<string, string> = {};
    for (const [hash, data] of Object.entries(files)) {
      if (!HASH.test(hash)) return refused(`The page names a solid file "${hash}" by no hash.`);
      if (typeof data !== 'string' || !BASE64.test(data)) {
        return refused(`The page’s solid file "${hash}" is not written in base64.`);
      }
      read[hash] = data;
    }
    return { ok: true, solids: { form: 'files', files: read } };
  }
  if (value.form === 'pictures') {
    if (Object.keys(value).some((key) => key !== 'form' && key !== 'pictures')) {
      return refused('The page’s solids hold more than their form and pictures.');
    }
    if (!Array.isArray(value.pictures)) return refused('The page’s solid pictures are not a list.');
    const pictures: PageSolidPicture[] = [];
    for (const picture of value.pictures as unknown[]) {
      if (!isRecord(picture)) return refused('A solid picture of the page is not an object.');
      const { key, bucket, width, height, png, parts } = picture;
      const allowed = new Set(['key', 'bucket', 'width', 'height', 'png', 'parts']);
      if (Object.keys(picture).some((each) => !allowed.has(each))) {
        return refused('A solid picture of the page holds more than its key, size and data.');
      }
      if (
        typeof key !== 'string' ||
        key.length > 1024 ||
        !(SOLID_BUCKETS as readonly unknown[]).includes(bucket) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        (width as number) < 1 ||
        (height as number) < 1 ||
        Math.max(width as number, height as number) !== bucket ||
        typeof png !== 'string' ||
        !BASE64.test(png) ||
        (parts !== undefined && (typeof parts !== 'string' || !BASE64.test(parts)))
      ) {
        return refused('A solid picture of the page is not a picture of a bucket’s size.');
      }
      pictures.push({
        key,
        bucket: bucket as SolidBucket,
        width: width as number,
        height: height as number,
        png,
        ...(parts === undefined ? {} : { parts: parts as string }),
      });
    }
    return { ok: true, solids: { form: 'pictures', pictures } };
  }
  return refused('The page’s solids are neither files nor pictures.');
}

/** A picture's PNG and part buffer, as a page holds them. */
export function pagePictureOf(
  key: string,
  bucket: SolidBucket,
  picture: { width: number; height: number; png: Uint8Array; partBuffer?: SolidPartBuffer },
): PageSolidPicture {
  return {
    key,
    bucket,
    width: picture.width,
    height: picture.height,
    png: encodeBase64(picture.png),
    ...(picture.partBuffer ? { parts: encodeBase64(writePartRuns(picture.partBuffer)) } : {}),
  };
}

// The page's client ------------------------------------------------------------------------------------

/** The files a page holds, as the solid client gets them. */
export function pageSolidFiles(files: Readonly<Record<string, string>>): SolidFiles {
  return {
    get(hash) {
      const data = Object.hasOwn(files, hash) ? files[hash] : undefined;
      const bytes = data === undefined ? undefined : decodeBase64(data);
      return Promise.resolve(
        bytes
          ? { ok: true, bytes }
          : {
              ok: false,
              code: 'solid-file-missing',
              message: `This page does not hold the solid file "${hash}".`,
            },
      );
    },
  };
}

/** Starts the solid worker a page holds; none in a page that holds none (`page.ts`). */
export type PageWorkerStart = () => SolidWorkerPort;

/**
 * The name of the function by which the viewer starts the page's solid worker, which the page's own
 * script that holds the worker makes (`page.ts`); absent from a page that holds none.
 */
export const SOLID_WORKER_START = 'visualAnythingSolidWorker';

/** The function a page that holds the solid worker starts it with, if this page holds one. */
export function pageWorkerStart(host: object): PageWorkerStart | undefined {
  const start = (host as Record<string, unknown>)[SOLID_WORKER_START];
  return typeof start === 'function' ? (start as PageWorkerStart) : undefined;
}

/** A turning that never draws: a page of pictures turns nothing. */
const STILL: SolidTurning = {
  turn: 0,
  frame: undefined,
  camera: () => {},
  play: () => {},
  end: () => {},
};

/**
 * The client of a page of pictures: it draws nothing, and gives each picture the page holds, decoded
 * once its key is first asked for, whatever size is asked: it is the only one there is.
 */
export function picturesClient(
  pictures: readonly PageSolidPicture[],
  decode: (png: Uint8Array) => Promise<ImageBitmap> = (png) =>
    createImageBitmap(new Blob([png.slice()], { type: 'image/png' })),
): SolidClient {
  const byKey = new Map(pictures.map((picture) => [picture.key, picture]));
  const kept = new Map<string, SolidPicture>();
  const decoding = new Set<string>();
  const listeners = new Set<(picture: SolidPicture) => void>();
  let disposed = false;
  const decodeOne = (key: string): Promise<SolidPicture | undefined> => {
    const held = byKey.get(key);
    const known = kept.get(key);
    if (known || !held || disposed || decoding.has(key)) return Promise.resolve(known);
    const png = decodeBase64(held.png);
    if (!png) return Promise.resolve(undefined);
    decoding.add(key);
    return decode(png).then(
      (bitmap) => {
        decoding.delete(key);
        if (disposed) {
          bitmap.close();
          return undefined;
        }
        const runs = held.parts === undefined ? undefined : decodeBase64(held.parts);
        const partBuffer = runs && readPartRuns(runs);
        const picture: SolidPicture = {
          key,
          bucket: held.bucket,
          serial: solidPictureSerial(`${key}@${held.bucket}`),
          bitmap,
          width: held.width,
          height: held.height,
          ...(partBuffer ? { partBuffer } : {}),
        };
        kept.set(key, picture);
        for (const listener of [...listeners]) listener(picture);
        return picture;
      },
      () => {
        decoding.delete(key);
        return undefined;
      },
    );
  };
  return {
    started: false,
    limits: undefined,
    contextLost: false,
    unavailable: false,
    picture: (key) => {
      const picture = kept.get(key);
      return picture && { picture, exact: true };
    },
    problem: () => undefined,
    ask: (asks) => {
      for (const ask of asks) void decodeOne(ask.key);
    },
    draw: (asks) => Promise.all(asks.map((ask) => decodeOne(ask.key))),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    turn: () => STILL,
    pick: () => Promise.resolve(undefined),
    release: () => {},
    dispose: () => {
      disposed = true;
      for (const picture of kept.values()) picture.bitmap.close();
      kept.clear();
    },
  };
}

/**
 * The solid client of a page: through the worker it holds, from the files it holds; through the
 * pictures it holds; or none, for a page that holds no solids, or files without a worker to draw them,
 * where every solid draws its placeholder.
 */
export function pageSolidClient(
  solids: PageSolids | undefined,
  start: PageWorkerStart | undefined,
): SolidClient | undefined {
  if (!solids) return undefined;
  if (solids.form === 'pictures') return picturesClient(solids.pictures);
  return start ? createSolidClientWith(pageSolidFiles(solids.files), start) : undefined;
}

/** The bucket a page's picture of a shape is drawn at: two pixels a unit, as the SVG's. */
export function pagePictureBucket(shape: ElementShape, pixelsPerUnit: number): SolidBucket {
  const rect = shape.solid?.rect;
  return solidBucketFor(rect ? Math.max(rect.width, rect.height) * pixelsPerUnit : 0);
}

