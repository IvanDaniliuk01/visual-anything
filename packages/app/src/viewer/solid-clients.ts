/**
 * The clients a read-only page draws its solids through (ADR 0075): the solid worker it holds, from
 * the files it holds, or the pictures it holds. Neither fetches anything.
 */
import { decodeBase64 } from '@visual-anything/core';
import { solidPictureSerial } from '../canvas/image-serials';
import {
  createSolidClientWith,
  type SolidClient,
  type SolidFiles,
  type SolidPicture,
  type SolidTurning,
  type SolidWorkerPort,
  type SpaceDrawing,
} from '../solids/solid-client';
import { SOLID_WORKER_START, readPartRuns, type PageSolidPicture, type PageSolids } from './solids';

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
 * A page of pictures holds no worker, so it has no physical-space panel (ADR 0076), and a space asked
 * of it anyway says so and does nothing. A page that holds the worker draws spaces through it, as the
 * app does: its client is the worker's (`pageSolidClient`).
 */
const NO_SPACE: SpaceDrawing = {
  space: 0,
  frame: undefined,
  problem: { code: 'unavailable', message: 'A page of pictures draws no physical space.' },
  update: () => {},
  fit: () => Promise.resolve(undefined),
  pick: () => Promise.resolve(undefined),
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
    showSpace: (_shown, listeners) => {
      if (NO_SPACE.problem) listeners?.onProblem?.(NO_SPACE.problem);
      return NO_SPACE;
    },
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
