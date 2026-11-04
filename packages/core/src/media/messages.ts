/**
 * The live connection's messages about media files (ADR 0098). Bytes travel over the connection, as
 * solids' do (ADR 0075), in pieces of at most 1 MiB in base64:
 *
 * - `media/put`, from an app: a file to keep, in pieces;
 * - `media/stored`, from the program: the file cleaned and written to `media/`, with the reference a
 *   picture names it by and what cleaning dropped;
 * - `media/get`, from an app: a file by its hash, to draw it;
 * - `media/piece`, from the program: one piece of that file;
 * - `media/refused`, from the program: why a file could not be kept or served;
 * - `media-files/list` and `media-files/remove`, from an app, answered by `media-files/listed`: the
 *   files of `media/` that no picture names, in any view, which only the person removes.
 *
 * Each reader checks a message strictly and answers it, or why it cannot be read.
 */
import type { MediaFormat, MediaRef } from '@visual-anything/schema';
import type { ProblemCode } from '../problems';
import { SOLID_PIECE_BYTES, readSolidPiece, type SolidPiece } from '../solids/messages';
import { MEDIA_CAPS } from './clean';

/** The most bytes of a file one piece carries: 1 MiB, as for solids. */
export const MEDIA_PIECE_BYTES = SOLID_PIECE_BYTES;

/** The most pieces a file to keep comes in: 32, for 32 MiB. */
export const MAX_MEDIA_PIECES = MEDIA_CAPS.bytes / MEDIA_PIECE_BYTES;

/** The most files one removal names. */
export const MAX_MEDIA_FILES_REMOVED = 1024;

/** One piece of a file, as both directions carry it. */
export type MediaPiece = SolidPiece;

export interface MediaPutMessage {
  type: 'media/put';
  requestId: string;
  /** The file's own name, without a folder: `front-desk.jpg`. */
  fileName: string;
  piece: MediaPiece;
}

export interface MediaStoredMessage {
  type: 'media/stored';
  requestId: string;
  media: MediaRef;
  /** What cleaning dropped, in the core's words. */
  removed: string[];
}

export interface MediaGetMessage {
  type: 'media/get';
  requestId: string;
  hash: string;
}

export interface MediaPieceMessage {
  type: 'media/piece';
  requestId: string;
  hash: string;
  piece: MediaPiece;
}

export interface MediaRefusedMessage {
  type: 'media/refused';
  requestId: string;
  code: ProblemCode;
  message: string;
}

export interface MediaFilesListMessage {
  type: 'media-files/list';
  requestId: string;
}

export interface MediaFilesRemoveMessage {
  type: 'media-files/remove';
  requestId: string;
  /** The files to remove, by their hashes: never a path. */
  hashes: string[];
}

/** A file of `media/` that no picture names. */
export interface UnnamedMediaFile {
  hash: string;
  format: MediaFormat;
  /** Its size, in bytes. */
  bytes: number;
}

/** A file a removal would not remove, and why. */
export interface KeptMediaFile {
  hash: string;
  message: string;
}

export interface MediaFilesListedMessage {
  type: 'media-files/listed';
  requestId: string;
  /** The files no picture names now, by hash, in order. */
  files: UnnamedMediaFile[];
  /** For a removal: the files it removed. */
  removed?: string[];
  /** For a removal: the files it would not remove, and why. */
  kept?: KeptMediaFile[];
}

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

const HASH = /^[0-9a-f]{64}$/;
const FORMATS: readonly string[] = ['png', 'jpeg', 'webp', 'gif', 'svg'];
const MAX_REQUEST_ID = 128;

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

function isHash(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown, least: number, most: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;
}

/** Reads a media reference as the program sends it, strictly. */
export function readMediaRef(value: unknown): MediaRef | undefined {
  if (!isRecord(value) || !onlyKeys(value, ['hash', 'format', 'width', 'height', 'bytes'])) {
    return undefined;
  }
  const { hash, format, width, height, bytes } = value;
  if (
    !isHash(hash) ||
    typeof format !== 'string' ||
    !FORMATS.includes(format) ||
    !isWhole(width, 1, MEDIA_CAPS.side) ||
    !isWhole(height, 1, MEDIA_CAPS.side) ||
    !isWhole(bytes, 1, MEDIA_CAPS.bytes)
  ) {
    return undefined;
  }
  return { hash, format: format as MediaFormat, width, height, bytes };
}

/** Reads `media/put`, from an app. */
export function readMediaPut(message: Record<string, unknown>): Read<MediaPutMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'fileName', 'piece'])) {
    return fail('media/put holds only its id, the file name and a piece.');
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
  const piece = readSolidPiece(message.piece, MAX_MEDIA_PIECES);
  if (!piece.ok) return piece;
  return { ok: true, value: { type: 'media/put', requestId, fileName, piece: piece.value } };
}

/** Reads `media/stored`, from the program. */
export function readMediaStored(message: Record<string, unknown>): Read<MediaStoredMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'media', 'removed'])) {
    return fail('media/stored holds nothing else.');
  }
  const media = readMediaRef(message.media);
  if (media === undefined) return fail('A stored file is named by its hash, format and sizes.');
  const { removed } = message;
  if (
    !Array.isArray(removed) ||
    removed.length > 100 ||
    !removed.every((line) => typeof line === 'string' && line.length <= 500)
  ) {
    return fail('A stored file says what cleaning dropped, line by line.');
  }
  return {
    ok: true,
    value: { type: 'media/stored', requestId, media, removed: [...(removed as string[])] },
  };
}

/** Reads `media/get`, from an app. */
export function readMediaGet(message: Record<string, unknown>): Read<MediaGetMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hash'])) {
    return fail('media/get holds only its id and a hash.');
  }
  if (!isHash(message.hash)) {
    return fail('A media file is asked for by its SHA-256, in lowercase hexadecimal.');
  }
  return { ok: true, value: { type: 'media/get', requestId, hash: message.hash } };
}

/** Reads `media/piece`, from the program: a piece of a file of at most 32 MiB. */
export function readMediaPieceMessage(message: Record<string, unknown>): Read<MediaPieceMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hash', 'piece'])) {
    return fail('media/piece holds nothing else.');
  }
  if (!isHash(message.hash)) return fail('A piece names its file by its hash.');
  const piece = readSolidPiece(message.piece, MAX_MEDIA_PIECES);
  if (!piece.ok) return piece;
  return {
    ok: true,
    value: { type: 'media/piece', requestId, hash: message.hash, piece: piece.value },
  };
}

/** Reads `media/refused`, from the program. */
export function readMediaRefused(message: Record<string, unknown>): Read<MediaRefusedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'code', 'message'])) {
    return fail('media/refused holds nothing else.');
  }
  const { code, message: text } = message;
  if (
    typeof code !== 'string' ||
    code.length > 64 ||
    typeof text !== 'string' ||
    text.length > 2000
  ) {
    return fail('A refusal says its code and why.');
  }
  return {
    ok: true,
    value: { type: 'media/refused', requestId, code: code as ProblemCode, message: text },
  };
}

/** Reads `media-files/list`, from an app. */
export function readMediaFilesList(message: Record<string, unknown>): Read<MediaFilesListMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId'])) return fail('media-files/list holds only its id.');
  return { ok: true, value: { type: 'media-files/list', requestId } };
}

/** Reads `media-files/remove`, from an app: hashes only, so nothing it names lies outside `media/`. */
export function readMediaFilesRemove(
  message: Record<string, unknown>,
): Read<MediaFilesRemoveMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The request has no valid id.');
  if (!onlyKeys(message, ['type', 'requestId', 'hashes'])) {
    return fail('media-files/remove holds only its id and the hashes of the files to remove.');
  }
  const { hashes } = message;
  if (
    !Array.isArray(hashes) ||
    hashes.length === 0 ||
    hashes.length > MAX_MEDIA_FILES_REMOVED ||
    !hashes.every(isHash)
  ) {
    return fail(
      `A removal names 1 to ${MAX_MEDIA_FILES_REMOVED} media files by their SHA-256, in lowercase hexadecimal.`,
    );
  }
  return {
    ok: true,
    value: { type: 'media-files/remove', requestId, hashes: [...new Set(hashes)] },
  };
}

/** Reads `media-files/listed`, from the program. */
export function readMediaFilesListed(
  message: Record<string, unknown>,
): Read<MediaFilesListedMessage> {
  const requestId = requestIdOf(message);
  if (requestId === undefined) return fail('The answer has no valid request id.');
  if (!onlyKeys(message, ['type', 'requestId', 'files', 'removed', 'kept'])) {
    return fail('media-files/listed holds nothing else.');
  }
  const { files, removed, kept } = message;
  const isFile = (file: unknown): file is UnnamedMediaFile =>
    isRecord(file) &&
    isHash(file.hash) &&
    typeof file.format === 'string' &&
    FORMATS.includes(file.format) &&
    isWhole(file.bytes, 0, Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(files) || files.length > 100_000 || !files.every(isFile)) {
    return fail('The files are listed by their hashes, formats and sizes.');
  }
  if (removed !== undefined && (!Array.isArray(removed) || !removed.every(isHash))) {
    return fail('The files removed are listed by their hashes.');
  }
  const isKept = (each: unknown): each is KeptMediaFile =>
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
      type: 'media-files/listed',
      requestId,
      files: files.map(({ hash, format, bytes }) => ({ hash, format, bytes })),
      ...(removed === undefined ? {} : { removed: [...removed] }),
      ...(kept === undefined
        ? {}
        : { kept: kept.map(({ hash, message: why }) => ({ hash, message: why })) }),
    },
  };
}
