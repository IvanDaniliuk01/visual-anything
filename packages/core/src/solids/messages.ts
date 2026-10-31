/**
 * The live connection's messages about solids (ADR 0075). Bytes travel over the connection, never
 * through an HTTP route, in pieces of at most 1 MiB in base64, within the connection's messages:
 *
 * - `solid/prepare`, from an app: a file to import, in pieces, its options in the first piece;
 * - `solid/prepared`, from the program: the file cleaned and held, with its description and the report
 *   of what cleaning dropped or changed, for the import dialog's preview;
 * - `solid/get`, from an app: a solid's file by its hash, for the solid worker;
 * - `solid/piece`, from the program: one piece of that file;
 * - `solid/refused`, from the program: why a file could not be prepared or served.
 *
 * Each reader checks a message strictly and answers it, or why it cannot be read.
 */
import type { SolidAnimation, SolidCounts, SolidPart, SpaceBounds } from '@visual-anything/schema';
import type { ProblemCode } from '../problems';
import { SOLID_CAPS } from './caps';

/** The most bytes of a file one piece carries: 1 MiB. */
export const SOLID_PIECE_BYTES = 1024 * 1024;

/** The longest base64 of one piece. */
export const MAX_SOLID_PIECE_TEXT = Math.ceil(SOLID_PIECE_BYTES / 3) * 4;

/** The largest file an app may send to be cleaned: 256 MiB, so at most 256 pieces. */
export const MAX_SOLID_INPUT_BYTES = 256 * 1024 * 1024;

/** The longest request id either side accepts. */
const MAX_REQUEST_ID = 128;

const HASH = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** One piece of a file, as both directions carry it. */
export interface SolidPiece {
  /** From 0. */
  index: number;
  /** How many pieces the file has. */
  count: number;
  /** The piece's bytes, in base64. */
  data: string;
}

/** How a file to import is read: its unit, its up axis, and whether to simplify it to fit. */
export interface SolidImportOptions {
  units?: 'm' | 'cm' | 'mm' | 'in';
  up?: 'y' | 'z';
  simplify?: boolean;
}

export interface SolidPrepareMessage {
  type: 'solid/prepare';
  requestId: string;
  /** The file's own name, for the dialog and the history: `arm.glb`. */
  fileName: string;
  piece: SolidPiece;
  /** In the first piece only. */
  options?: SolidImportOptions;
}

/** What the program answers once it cleaned a file and holds it, at most two at a time. */
export interface SolidPreparedMessage {
  type: 'solid/prepared';
  requestId: string;
  /** The file the program holds, which `define-solid` names by its hash. */
  hash: string;
  bytes: number;
  bounds: SpaceBounds;
  counts: SolidCounts;
  parts: SolidPart[];
  animations?: SolidAnimation[];
  /** What cleaning dropped or changed, in the core's words. */
  report: string[];
  /** A copyright the file held, offered as the solid's source and going nowhere else. */
  source?: string;
}

export interface SolidGetMessage {
  type: 'solid/get';
  requestId: string;
  hash: string;
}

export interface SolidPieceMessage {
  type: 'solid/piece';
  requestId: string;
  hash: string;
  piece: SolidPiece;
}

export interface SolidRefusedMessage {
  type: 'solid/refused';
  requestId: string;
  code: ProblemCode;
  message: string;
}

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function requestIdOf(message: Record<string, unknown>): string | undefined {
  const { requestId } = message;
  return typeof requestId === 'string' && requestId !== '' && requestId.length <= MAX_REQUEST_ID
    ? requestId
    : undefined;
}

function onlyKeys(message: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(message).every((key) => keys.includes(key));
}

/** A piece of a file of at most `mostPieces` pieces. */
export function readSolidPiece(value: unknown, mostPieces: number): Read<SolidPiece> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('A piece is its index, the count of pieces and its data.');
  }
  const piece = value as Record<string, unknown>;
  if (!onlyKeys(piece, ['index', 'count', 'data'])) return fail('A piece holds nothing else.');
  const { index, count, data } = piece;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > mostPieces) {
    return fail(`A file comes in 1 to ${mostPieces} pieces.`);
  }
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count) {
    return fail("A piece's index is within its count.");
  }
  if (
    typeof data !== 'string' ||
    data.length > MAX_SOLID_PIECE_TEXT ||
    data.length % 4 !== 0 ||
    !BASE64.test(data)
  ) {
    return fail(`A piece is base64 of at most ${SOLID_PIECE_BYTES} bytes.`);
  }
  return { ok: true, value: { index, count, data } };
}

/** Reads `solid/prepare`, from an app. */
export function readSolidPrepare(message: Record<string, unknown>): Read<SolidPrepareMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'fileName', 'piece', 'options'])) {
    return fail('solid/prepare holds only its id, the file name, a piece and options.');
  }
  const { fileName } = message;
  if (
    typeof fileName !== 'string' ||
    fileName === '' ||
    fileName.length > 255 ||
    /[\\/\0]/.test(fileName)
  ) {
    return fail("A file's name is its own name, without a folder.");
  }
  const piece = readSolidPiece(message.piece, MAX_SOLID_INPUT_BYTES / SOLID_PIECE_BYTES);
  if (!piece.ok) return piece;
  let options: SolidImportOptions | undefined;
  if (message.options !== undefined) {
    if (piece.value.index !== 0) return fail('Options come with the first piece only.');
    const given = message.options as Record<string, unknown> | null;
    if (
      typeof given !== 'object' ||
      given === null ||
      !onlyKeys(given, ['units', 'up', 'simplify'])
    ) {
      return fail('Options are units, up and simplify.');
    }
    if (given.units !== undefined && !['m', 'cm', 'mm', 'in'].includes(given.units as string)) {
      return fail('Units are m, cm, mm or in.');
    }
    if (given.up !== undefined && given.up !== 'y' && given.up !== 'z')
      return fail('Up is y or z.');
    if (given.simplify !== undefined && typeof given.simplify !== 'boolean') {
      return fail('Simplify is true or false.');
    }
    options = given;
  }
  return {
    ok: true,
    value: {
      type: 'solid/prepare',
      requestId,
      fileName,
      piece: piece.value,
      ...(options === undefined ? {} : { options }),
    },
  };
}

/** Reads `solid/get`, from an app. */
export function readSolidGet(message: Record<string, unknown>): Read<SolidGetMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hash']))
    return fail('solid/get holds only its id and a hash.');
  if (typeof message.hash !== 'string' || !HASH.test(message.hash)) {
    return fail('A solid file is asked for by its SHA-256, in lowercase hexadecimal.');
  }
  return { ok: true, value: { type: 'solid/get', requestId, hash: message.hash } };
}

/** Reads `solid/piece`, from the program: a piece of a canonical file, at most 32 MiB. */
export function readSolidPieceMessage(message: Record<string, unknown>): Read<SolidPieceMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hash', 'piece']))
    return fail('solid/piece holds nothing else.');
  if (typeof message.hash !== 'string' || !HASH.test(message.hash))
    return fail('A piece names its file by its hash.');
  const piece = readSolidPiece(message.piece, SOLID_CAPS.fileBytes / SOLID_PIECE_BYTES);
  if (!piece.ok) return piece;
  return {
    ok: true,
    value: { type: 'solid/piece', requestId, hash: message.hash, piece: piece.value },
  };
}

/** Reads `solid/refused`, from the program. */
export function readSolidRefused(message: Record<string, unknown>): Read<SolidRefusedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  const { code, message: text } = message;
  if (typeof code !== 'string' || typeof text !== 'string' || text.length > 2000) {
    return fail('A refusal says its code and why.');
  }
  return {
    ok: true,
    value: { type: 'solid/refused', requestId, code: code as ProblemCode, message: text },
  };
}

/**
 * Reads `solid/prepared`, from the program. The description is the program's, from the core's
 * reader; the app only shows it, and `define-solid` checks it again.
 */
export function readSolidPrepared(message: Record<string, unknown>): Read<SolidPreparedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  const { hash, bytes, bounds, counts, parts, animations, report, source } = message;
  if (typeof hash !== 'string' || !HASH.test(hash))
    return fail('A prepared file names itself by its hash.');
  if (
    typeof bytes !== 'number' ||
    !Number.isInteger(bytes) ||
    bytes < 1 ||
    bytes > SOLID_CAPS.fileBytes
  ) {
    return fail("A prepared file's size is within the cap.");
  }
  if (
    typeof bounds !== 'object' ||
    bounds === null ||
    typeof counts !== 'object' ||
    counts === null
  ) {
    return fail('A prepared file says its bounds and counts.');
  }
  if (!Array.isArray(parts) || parts.length > SOLID_CAPS.parts)
    return fail('A prepared file lists its parts.');
  if (
    animations !== undefined &&
    (!Array.isArray(animations) || animations.length > SOLID_CAPS.animations)
  ) {
    return fail('A prepared file lists its animations.');
  }
  if (
    !Array.isArray(report) ||
    report.length > 100 ||
    report.some((line) => typeof line !== 'string')
  ) {
    return fail('A prepared file says what cleaning did, line by line.');
  }
  if (source !== undefined && (typeof source !== 'string' || source.length > 500)) {
    return fail("A file's copyright is offered as text of at most 500 characters.");
  }
  return {
    ok: true,
    value: {
      type: 'solid/prepared',
      requestId,
      hash,
      bytes,
      bounds: bounds as SpaceBounds,
      counts: counts as SolidCounts,
      parts: parts as SolidPart[],
      ...(animations === undefined ? {} : { animations: animations as SolidAnimation[] }),
      report: report as string[],
      ...(source === undefined ? {} : { source }),
    },
  };
}

/**
 * The files in `solids/` that no package names (ADR 0075), which the Components tab lists and only the
 * person removes:
 *
 * - `solid-files/list`, from an app, asks for them;
 * - `solid-files/remove`, from an app, removes some of them by their hashes, which cannot be undone;
 * - `solid-files/listed`, from the program, answers either with the files no package names now, each
 *   with its size, and for a removal the hashes removed and those it would not remove, with why.
 */
export interface SolidFilesListMessage {
  type: 'solid-files/list';
  requestId: string;
}

/** The most files one removal names. */
export const MAX_SOLID_FILES_REMOVED = 1024;

export interface SolidFilesRemoveMessage {
  type: 'solid-files/remove';
  requestId: string;
  /** The files to remove, by their hashes, which name them `solids/<hash>.glb`. */
  hashes: string[];
}

/** A file in `solids/` that no package names. */
export interface UnnamedSolidFile {
  hash: string;
  /** Its size, in bytes. */
  bytes: number;
}

/** A file a removal would not remove, and why. */
export interface KeptSolidFile {
  hash: string;
  message: string;
}

export interface SolidFilesListedMessage {
  type: 'solid-files/listed';
  requestId: string;
  /** The files no package names now, by hash, in order. */
  files: UnnamedSolidFile[];
  /** For a removal: the files it removed. */
  removed?: string[];
  /** For a removal: the files it would not remove, and why. */
  kept?: KeptSolidFile[];
}

/** Reads `solid-files/list`, from an app. */
export function readSolidFilesList(message: Record<string, unknown>): Read<SolidFilesListMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId'])) return fail('solid-files/list holds only its id.');
  return { ok: true, value: { type: 'solid-files/list', requestId } };
}

/**
 * Reads `solid-files/remove`, from an app: hashes only, never a path, so that nothing it names can lie
 * outside `solids/`.
 */
export function readSolidFilesRemove(
  message: Record<string, unknown>,
): Read<SolidFilesRemoveMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hashes'])) {
    return fail('solid-files/remove holds only its id and the hashes of the files to remove.');
  }
  const { hashes } = message;
  if (
    !Array.isArray(hashes) ||
    hashes.length === 0 ||
    hashes.length > MAX_SOLID_FILES_REMOVED ||
    !hashes.every(isHash)
  ) {
    return fail(
      `A removal names 1 to ${MAX_SOLID_FILES_REMOVED} solid files by their SHA-256, in lowercase hexadecimal.`,
    );
  }
  return {
    ok: true,
    value: { type: 'solid-files/remove', requestId, hashes: [...new Set(hashes)] },
  };
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads `solid-files/listed`, from the program. */
export function readSolidFilesListed(
  message: Record<string, unknown>,
): Read<SolidFilesListedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'files', 'removed', 'kept'])) {
    return fail('solid-files/listed holds nothing else.');
  }
  const { files, removed, kept } = message;
  const isFile = (file: unknown): file is UnnamedSolidFile =>
    isRecord(file) &&
    isHash(file.hash) &&
    typeof file.bytes === 'number' &&
    Number.isInteger(file.bytes) &&
    file.bytes >= 0;
  if (!Array.isArray(files) || !files.every(isFile)) {
    return fail('The files are listed by their hashes and sizes.');
  }
  if (removed !== undefined && (!Array.isArray(removed) || !removed.every(isHash))) {
    return fail('The files removed are listed by their hashes.');
  }
  const isKept = (each: unknown): each is KeptSolidFile =>
    isRecord(each) &&
    isHash(each.hash) &&
    typeof each.message === 'string' &&
    each.message.length <= 2000;
  if (kept !== undefined && (!Array.isArray(kept) || !kept.every(isKept))) {
    return fail('The files kept are listed by their hashes, each with why.');
  }
  return {
    ok: true,
    value: {
      type: 'solid-files/listed',
      requestId,
      files: files.map(({ hash, bytes }) => ({ hash, bytes })),
      ...(removed === undefined ? {} : { removed: [...removed] }),
      ...(kept === undefined
        ? {}
        : { kept: kept.map(({ hash, message: why }) => ({ hash, message: why })) }),
    },
  };
}
