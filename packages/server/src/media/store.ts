/**
 * The media files a session keeps and serves (ADR 0098):
 *
 * - **Keeping.** An app sends a file in pieces (`media/put`); once they are all in, the program cleans
 *   it in the cleaner's worker, one file at a time, writes it to `media/` atomically and answers with
 *   the reference a picture names it by (`media/stored`). Claude's `add_picture` keeps a file of the
 *   project folder the same way. A file is written before any shape names it.
 * - **Admitting.** A command that adds or changes a picture or a link card is taken only when the file
 *   it names, a video's poster and a card's picture, are in `media/`, of the format and size they say, so that a picture never names
 *   a file the program has not kept.
 * - **Serving.** `media/get` is answered from `media/`, in pieces. The first time a file is served in
 *   a session, the worker checks that its bytes are its name's and exactly what cleaning writes; a
 *   file that fails is never served, and the picture is drawn as a missing one.
 */
import {
  MEDIA_PIECE_BYTES,
  MAX_MEDIA_PIECES,
  decodeBase64,
  encodeBase64,
  type Command,
  type MediaPutMessage,
  type Problem,
  type ServerMessage,
} from '@visual-anything/core';
import type { MediaFormat, MediaRef } from '@visual-anything/schema';

/** The formats a media file may have: images, and videos (ADR 0098, stage 2). */
const MEDIA_FORMATS: readonly MediaFormat[] = ['png', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm'];
import { checkMediaInWorker, cleanMediaInWorker } from '../solids/cleaner';
import type { CheckedMedia, CleanedMedia } from '../solids/worker';
import type { WriteOptions } from '../writer';
import { findMediaFile, mediaFileLabel, readMediaFile, writeMediaFile } from './files';
import { lstat } from 'node:fs/promises';
import { mediaFilePath } from './files';

/** How many files may be on their way in pieces at once, and how long one may take to arrive. */
export const ARRIVING_MEDIA = { most: 4, forMs: 10 * 60 * 1000 } as const;

/** How many files may wait to be cleaned, the one being cleaned included. */
export const WAITING_MEDIA = 8;

export interface MediaStoreOptions {
  /** How a file is cleaned; in the worker thread by default. */
  clean?: (bytes: Uint8Array) => Promise<CleanedMedia>;
  /** How a file of `media/` is checked; in the worker thread by default. */
  check?: (bytes: Uint8Array, hash: string, format: MediaFormat) => Promise<CheckedMedia>;
  now?: () => number;
  writer?: WriteOptions;
}

/** What keeping a file comes to: its reference and what cleaning dropped, or why it was refused. */
export type Keeping =
  { ok: true; media: MediaRef; removed: string[] } | { ok: false; problem: Problem };

interface Arriving {
  owner: object;
  requestId: string;
  fileName: string;
  count: number;
  pieces: (Uint8Array | undefined)[];
  received: number;
  started: number;
}

export type MediaPieceOutcome =
  | { kind: 'more' }
  | { kind: 'whole'; bytes: Uint8Array; fileName: string }
  | { kind: 'refused'; problem: Problem };

export class MediaStore {
  readonly #folder: string;
  readonly #options: MediaStoreOptions;
  readonly #arriving: Arriving[] = [];
  /** The files of `media/` checked this session, by hash, with their format. */
  readonly #checked = new Map<string, MediaFormat>();
  #cleaning: Promise<unknown> = Promise.resolve();
  #waiting = 0;

  constructor(folder: string, options: MediaStoreOptions = {}) {
    this.#folder = folder;
    this.#options = options;
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  /** Takes one piece of a file to keep; the whole file once its last piece is in. */
  receive(owner: object, message: MediaPutMessage): MediaPieceOutcome {
    const now = this.#now();
    for (let at = this.#arriving.length - 1; at >= 0; at -= 1) {
      if (now - (this.#arriving[at] as Arriving).started > ARRIVING_MEDIA.forMs) {
        this.#arriving.splice(at, 1);
      }
    }
    const { piece } = message;
    let arriving = this.#arriving.find(
      (each) => each.owner === owner && each.requestId === message.requestId,
    );
    if (arriving === undefined) {
      if (this.#arriving.length >= ARRIVING_MEDIA.most) {
        return refusal(
          'program-failed',
          'Visual Anything is receiving several pictures already: add this one once they are in.',
        );
      }
      arriving = {
        owner,
        requestId: message.requestId,
        fileName: message.fileName,
        count: piece.count,
        pieces: new Array<Uint8Array | undefined>(piece.count),
        received: 0,
        started: now,
      };
      this.#arriving.push(arriving);
    }
    const drop = (): MediaPieceOutcome => {
      this.#arriving.splice(this.#arriving.indexOf(arriving), 1);
      return refusal('invalid-image', 'The pieces of the picture do not fit together.');
    };
    if (piece.count !== arriving.count || message.fileName !== arriving.fileName) return drop();
    if (piece.count > MAX_MEDIA_PIECES) return drop();
    if (arriving.pieces[piece.index] !== undefined) return drop();
    const bytes = decodeBase64(piece.data);
    const last = piece.index === piece.count - 1;
    if (
      bytes === undefined ||
      (last
        ? bytes.length < 1 || bytes.length > MEDIA_PIECE_BYTES
        : bytes.length !== MEDIA_PIECE_BYTES)
    ) {
      return drop();
    }
    arriving.pieces[piece.index] = bytes;
    arriving.received += 1;
    if (arriving.received < arriving.count) return { kind: 'more' };
    this.#arriving.splice(this.#arriving.indexOf(arriving), 1);
    const total = arriving.pieces.reduce((sum, each) => sum + (each as Uint8Array).length, 0);
    const whole = new Uint8Array(total);
    let offset = 0;
    for (const each of arriving.pieces as Uint8Array[]) {
      whole.set(each, offset);
      offset += each.length;
    }
    return { kind: 'whole', bytes: whole, fileName: arriving.fileName };
  }

  /** Lets go of the pieces a connection that closed was sending. */
  forget(owner: object): void {
    for (let at = this.#arriving.length - 1; at >= 0; at -= 1) {
      if ((this.#arriving[at] as Arriving).owner === owner) this.#arriving.splice(at, 1);
    }
  }

  /**
   * Cleans a file, after those asked for before it, and writes it to `media/`. The bytes are handed
   * to the cleaner, and are no longer the caller's.
   */
  keep(bytes: Uint8Array): Promise<Keeping> {
    if (this.#waiting >= WAITING_MEDIA) {
      return Promise.resolve({
        ok: false,
        problem: {
          code: 'program-failed',
          message:
            'Visual Anything is cleaning several pictures already: add this one once they are in.',
        },
      });
    }
    this.#waiting += 1;
    const clean = this.#options.clean ?? ((given) => cleanMediaInWorker(given));
    const turn = this.#cleaning
      .then(() => clean(bytes))
      .then(async (cleaned): Promise<Keeping> => {
        if (!cleaned.ok) {
          return {
            ok: false,
            problem: cleaned.problems[0] ?? { code: 'invalid-image', message: 'Not a picture.' },
          };
        }
        const { media } = cleaned;
        await writeMediaFile(
          this.#folder,
          media.hash,
          media.format,
          cleaned.bytes,
          this.#options.writer,
        );
        this.#checked.set(media.hash, media.format);
        return { ok: true, media, removed: cleaned.removed };
      })
      .catch((error: unknown): Keeping => ({
        ok: false,
        problem: {
          code: 'program-failed',
          message: `The picture could not be kept: ${error instanceof Error ? error.message : String(error)}`,
        },
      }))
      .finally(() => {
        this.#waiting -= 1;
      });
    this.#cleaning = turn;
    return turn;
  }

  /**
   * The messages that answer `media/get`: the file's pieces, in order, or one refusal. A file is served
   * only once checked, this session, to be its name's and exactly what cleaning writes.
   */
  async serve(requestId: string, hash: string): Promise<ServerMessage[]> {
    const read = await this.read(hash);
    if (!read.ok) {
      return [
        {
          type: 'media/refused',
          requestId,
          code: read.problem.code,
          message: read.problem.message,
        },
      ];
    }
    const { bytes } = read;
    const count = Math.ceil(bytes.length / MEDIA_PIECE_BYTES);
    const pieces: ServerMessage[] = [];
    for (let index = 0; index < count; index++) {
      const start = index * MEDIA_PIECE_BYTES;
      pieces.push({
        type: 'media/piece',
        requestId,
        hash,
        piece: {
          index,
          count,
          data: encodeBase64(bytes.subarray(start, start + MEDIA_PIECE_BYTES)),
        },
      });
    }
    return pieces;
  }

  /**
   * A file of `media/`, by its hash: its bytes and format once checked, or why it cannot be served.
   * Every way a media file's bytes leave the program goes through here.
   */
  async read(
    hash: string,
  ): Promise<
    { ok: true; bytes: Uint8Array; format: MediaFormat } | { ok: false; problem: Problem }
  > {
    const format = await findMediaFile(this.#folder, hash);
    if (format === undefined) {
      return {
        ok: false,
        problem: {
          code: 'media-file-missing',
          message: `The project has no media file ${hash.slice(0, 12)}….`,
        },
      };
    }
    const label = mediaFileLabel(hash, format);
    const read = await readMediaFile(this.#folder, hash, format);
    if (!read.ok) {
      return {
        ok: false,
        problem: {
          code: 'media-file-missing',
          message: `The media file "${label}" cannot be read: ${read.reason === 'missing' ? 'it is gone' : read.message}`,
        },
      };
    }
    if (this.#checked.get(hash) !== format) {
      const check =
        this.#options.check ?? ((given, name, kind) => checkMediaInWorker(given, name, kind));
      const checked = await check(read.bytes, hash, format);
      if (!checked.ok) {
        return {
          ok: false,
          problem: checked.problems[0] ?? {
            code: 'media-not-clean',
            message: `The media file "${label}" is not one Visual Anything cleaned.`,
          },
        };
      }
      this.#checked.set(hash, format);
    }
    return { ok: true, bytes: read.bytes, format };
  }

  /**
   * A command with every picture it adds or changes naming a file of `media/` of the format and size
   * it says; or why it cannot be taken (ADR 0098).
   */
  async admit(command: Command): Promise<{ ok: true } | { ok: false; problems: Problem[] }> {
    if (command.type === 'batch') {
      if (!Array.isArray(command.commands)) return { ok: true };
      for (const inner of command.commands) {
        const admitted = await this.admit(inner);
        if (!admitted.ok) return admitted;
      }
      return { ok: true };
    }
    if (command.type !== 'create-free-shape' && command.type !== 'update-free-shape') {
      return { ok: true };
    }
    type Named = {
      kind?: unknown;
      media?: Partial<MediaRef>;
      poster?: Partial<MediaRef> | null;
      picture?: Partial<MediaRef> | null;
    };
    const shape = command.shape as Named | undefined;
    // A picture or a link card changed part by part names its file, a video's poster or a card's
    // picture in its changes (ADR 0104); only those take them there, so the core refuses them for
    // any other shape.
    const changes =
      command.type === 'update-free-shape' ? (command.changes as Named | undefined) : undefined;
    const named = shape?.kind === 'picture' || shape?.kind === 'link' ? shape : changes;
    for (const media of [named?.media, named?.poster, named?.picture]) {
      const admitted = await this.#admitFile(media);
      if (!admitted.ok) return admitted;
    }
    return { ok: true };
  }

  async #admitFile(
    media: Partial<MediaRef> | null | undefined,
  ): Promise<{ ok: true } | { ok: false; problems: Problem[] }> {
    if (typeof media !== 'object' || media === null) return { ok: true };
    const { hash, format, bytes } = media;
    // A reference the core would refuse is left for the core to refuse, with its own words.
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || typeof format !== 'string') {
      return { ok: true };
    }
    if (!(MEDIA_FORMATS as readonly string[]).includes(format)) return { ok: true };
    const info = await lstat(mediaFilePath(this.#folder, hash, format)).catch(() => undefined);
    if (info?.isFile() && info.size === bytes) return { ok: true };
    return {
      ok: false,
      problems: [
        {
          code: 'media-file-missing',
          message: `A picture names the media file "${mediaFileLabel(hash, format)}", which the project does not have: add the picture from its file, and the program keeps it first.`,
        },
      ],
    };
  }
}

function refusal(code: Problem['code'], message: string): MediaPieceOutcome {
  return { kind: 'refused', problem: { code, message } };
}
