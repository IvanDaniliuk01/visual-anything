/**
 * Reading an npm tarball strictly (ADR 0107): a gzip stream holding a tar archive, read for its
 * regular files only. Nothing in it runs, and no install script either: the program only reads it.
 *
 * - **gzip:** the stream must start as one (`1f 8b`, deflate), and inflate within the cap; zlib checks
 *   each member's CRC and length.
 * - **tar:** ustar headers, each with its checksum; sizes in octal within what is left; regular files
 *   and folders, with pax and GNU long names for the next entry's path. A link of any kind, a device,
 *   a FIFO or any other entry refuses the whole tarball.
 * - **paths:** UTF-8, relative, with no `.`, `..` or empty part, no backslash and no NUL, each once;
 *   the first part, the tarball's own folder (`package/`), is taken off, so that every path lies
 *   inside the package.
 */
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

const inflate = promisify(gunzip);

/** How much a tarball may hold once inflated, and how many entries. */
export interface TarballCaps {
  inflatedBytes: number;
  entries: number;
}

export const TARBALL_CAPS: TarballCaps = { inflatedBytes: 128 * 1024 * 1024, entries: 20_000 };

/** Why a tarball cannot be read. */
export class TarballRefusal extends Error {
  override name = 'TarballRefusal';
}

const BLOCK = 512;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The regular files of a gzipped tarball, by their path inside the package. */
export async function readTarball(
  gzipped: Uint8Array,
  caps: TarballCaps = TARBALL_CAPS,
): Promise<Map<string, Buffer>> {
  if (gzipped.length < 18 || gzipped[0] !== 0x1f || gzipped[1] !== 0x8b || gzipped[2] !== 8) {
    throw new TarballRefusal('The tarball is not gzip.');
  }
  let tar: Buffer;
  try {
    tar = await inflate(gzipped, { maxOutputLength: caps.inflatedBytes });
  } catch (error) {
    throw new TarballRefusal(
      error instanceof RangeError
        ? `The tarball holds more than ${caps.inflatedBytes / (1024 * 1024)} MiB once inflated.`
        : 'The tarball’s gzip is damaged.',
    );
  }
  return readTar(tar, caps.entries);
}

/** The regular files of a tar archive, by their path inside the package. */
export function readTar(tar: Buffer, maxEntries = TARBALL_CAPS.entries): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const seen = new Set<string>();
  let at = 0;
  let entries = 0;
  /** The path a pax or GNU header gave the next entry. */
  let nextPath: string | undefined;
  let nextSize: number | undefined;
  while (true) {
    if (at + BLOCK > tar.length) {
      // An archive may end without its two blocks of zeros, but not inside a header.
      if (at === tar.length) break;
      throw new TarballRefusal('The tarball ends inside an entry.');
    }
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    entries += 1;
    if (entries > maxEntries)
      throw new TarballRefusal(`The tarball holds more than ${maxEntries} entries.`);
    checkSum(header);
    const type = String.fromCharCode(header[156] as number);
    const size = nextSize ?? octal(header.subarray(124, 136), 'size');
    nextSize = undefined;
    const start = at + BLOCK;
    const end = start + size;
    if (end > tar.length)
      throw new TarballRefusal('An entry of the tarball is larger than what is left.');
    const body = tar.subarray(start, end);
    at = start + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') {
      const pax = readPax(body);
      if (pax.linkpath !== undefined) throw new TarballRefusal('The tarball holds a link.');
      if (pax.path !== undefined) nextPath = pax.path;
      if (pax.size !== undefined) nextSize = pax.size;
      continue;
    }
    if (type === 'g') continue;
    if (type === 'L') {
      nextPath = text(body).replace(/\0+$/, '');
      continue;
    }
    const name = nextPath ?? headerPath(header);
    nextPath = undefined;
    if (type === '5') {
      insidePath(name.replace(/\/$/, ''), true);
      continue;
    }
    if (type !== '0' && type !== '\0' && type !== '7') {
      throw new TarballRefusal(
        type === '1' || type === '2' || type === 'K'
          ? 'The tarball holds a link.'
          : 'The tarball holds something other than files and folders.',
      );
    }
    const path = insidePath(name);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new TarballRefusal(`The tarball holds "${path}" twice.`);
    seen.add(key);
    files.set(path, body);
  }
  return files;
}

/** Checks a header's checksum: the sum of its bytes with the checksum's own read as spaces. */
function checkSum(header: Buffer): void {
  const stored = octal(header.subarray(148, 156), 'checksum');
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (header[i] as number);
  if (sum !== stored) throw new TarballRefusal('A header of the tarball fails its checksum.');
}

/** A number written in octal, ended by NUL or spaces; base-256 numbers are refused. */
function octal(field: Buffer, what: string): number {
  if (((field[0] as number) & 0x80) !== 0) {
    throw new TarballRefusal(`The tarball writes a ${what} it cannot hold.`);
  }
  const written = field
    .toString('latin1')
    .replace(/[\0 ]+$/, '')
    .replace(/^ +/, '');
  if (!/^[0-7]{1,12}$/.test(written)) {
    throw new TarballRefusal(`The tarball writes a ${what} that is not a number.`);
  }
  const value = Number.parseInt(written, 8);
  if (!Number.isSafeInteger(value))
    throw new TarballRefusal(`The tarball writes a ${what} too large.`);
  return value;
}

function text(bytes: Uint8Array): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new TarballRefusal('A path in the tarball is not UTF-8.');
  }
}

/** An entry's path as its ustar header writes it: its prefix, then its name. */
function headerPath(header: Buffer): string {
  const field = (from: number, to: number) => {
    const bytes = header.subarray(from, to);
    const nul = bytes.indexOf(0);
    return text(nul === -1 ? bytes : bytes.subarray(0, nul));
  };
  const name = field(0, 100);
  const ustar = header.subarray(257, 262).toString('latin1') === 'ustar';
  const prefix = ustar ? field(345, 500) : '';
  return prefix === '' ? name : `${prefix}/${name}`;
}

/** A pax header's records: `<length> <key>=<value>\n`, each length counted. */
function readPax(body: Buffer): { path?: string; size?: number; linkpath?: string } {
  const read: { path?: string; size?: number; linkpath?: string } = {};
  let at = 0;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    if (space === -1) throw new TarballRefusal('A pax header of the tarball is damaged.');
    const length = Number(body.subarray(at, space).toString('latin1'));
    if (!Number.isInteger(length) || length <= space - at + 1 || at + length > body.length) {
      throw new TarballRefusal('A pax header of the tarball is damaged.');
    }
    const record = text(body.subarray(space + 1, at + length - 1));
    if (body[at + length - 1] !== 0x0a)
      throw new TarballRefusal('A pax header of the tarball is damaged.');
    const equals = record.indexOf('=');
    if (equals === -1) throw new TarballRefusal('A pax header of the tarball is damaged.');
    const key = record.slice(0, equals);
    const value = record.slice(equals + 1);
    if (key === 'path') read.path = value;
    else if (key === 'linkpath') read.linkpath = value;
    else if (key === 'size') {
      if (!/^\d{1,15}$/.test(value))
        throw new TarballRefusal('A pax header of the tarball is damaged.');
      read.size = Number(value);
    }
    at += length;
  }
  return read;
}

/** A path inside the package: the tarball's own folder taken off, every part checked. */
function insidePath(name: string, folder = false): string {
  if (name === '' || name.startsWith('/') || /[\\\0]/.test(name) || /^[A-Za-z]:/.test(name)) {
    throw new TarballRefusal(`The tarball holds a path outside the package: "${name}".`);
  }
  const parts = name.split('/');
  if (
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    parts.length < (folder ? 1 : 2)
  ) {
    throw new TarballRefusal(`The tarball holds a path outside the package: "${name}".`);
  }
  return parts.slice(1).join('/');
}
