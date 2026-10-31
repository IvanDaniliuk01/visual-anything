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
import { encodeBase64, solidsIn, type ProjectSnapshot } from '@visual-anything/core';
import { buildScene, type ElementShape } from '../canvas/scene';
import { isAnchoredSolidPart } from '../canvas/solidMark';
import {
  SOLID_BUCKETS,
  solidBucketFor,
  type SolidBucket,
  type SolidPartBuffer,
} from '../solids/views';

/**
 * The name of the function by which the viewer starts the page's solid worker, which the page's own
 * script that holds the worker makes (`page.ts`); absent from a page that holds none.
 */
export const SOLID_WORKER_START = 'visualAnythingSolidWorker';

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
        shape.solid !== undefined &&
        shape.solid.placeholder !== true &&
        !isAnchoredSolidPart(shape),
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

// Physical space ---------------------------------------------------------------------------------------

/** Whether any element of the project has a pose (ADR 0076), even one its container no longer holds. */
export function holdsPoses(project: ProjectSnapshot): boolean {
  return project.model.elements.some((element) => element.pose !== undefined);
}

/**
 * What a page holds of its solids once its poses are counted (ADR 0076). The physical-space panel is
 * drawn by the solid worker, which draws markers for posed elements without a solid, so a page whose
 * elements have poses holds the worker even when it holds no solid's file: as files, of which there
 * are none. A page of pictures holds no worker, and so no panel, whatever its poses; a page with
 * neither solids nor poses holds nothing, and keeps its policy.
 */
export function withPoses(
  project: ProjectSnapshot,
  solids: PageSolids | undefined,
  form: PageSolids['form'] = 'files',
): PageSolids | undefined {
  if (solids !== undefined) return solids;
  return form === 'files' && holdsPoses(project) ? { form: 'files', files: {} } : undefined;
}

/**
 * Whether a page has the physical-space panel (ADR 0076): when it holds the solid worker's files and
 * some solid's file or some pose to draw. A page of pictures, or one with neither, has none.
 */
export function pageHasSpace(project: ProjectSnapshot, solids: PageSolids | undefined): boolean {
  if (solids?.form !== 'files') return false;
  return Object.keys(solids.files).length > 0 || holdsPoses(project);
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
    if (value === undefined || length === undefined || value > 0xffff || length < 1)
      return undefined;
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
        ...(parts === undefined ? {} : { parts }),
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

/** The bucket a page's picture of a shape is drawn at: two pixels a unit, as the SVG's. */
export function pagePictureBucket(shape: ElementShape, pixelsPerUnit: number): SolidBucket {
  const rect = shape.solid?.rect;
  return solidBucketFor(rect ? Math.max(rect.width, rect.height) * pixelsPerUnit : 0);
}
