/**
 * The solid files a session holds (ADR 0075):
 *
 * - **Preparing.** An app sends a file to import in pieces (`solid/prepare`); once they are all in,
 *   the program cleans it in its worker thread, one file at a time, and holds what it made in
 *   memory, at most two files for ten minutes, while the person reads the preview and the report
 *   (`solid/prepared`). The command line and Claude prepare a file the same way.
 * - **Keeping.** A solid kept from another project (ADR 0089's M14.6 clarification) comes as its
 *   cleaned file, with the hash it is named by there (`keep`): the program does not clean it again,
 *   it checks it with the core's strict reader in its worker, as a file of `solids/` is checked, and
 *   writes it to this project's `solids/` once it is canonical and its bytes hash to that name. It is
 *   held as a prepared file is, so that the package that names it can come in afterwards.
 * - **Holding.** The program takes `define-solid` only for a file it holds: one it prepared, which it
 *   then writes to `solids/`, or one in `solids/` it read and checked. Each definition then takes the
 *   description the program worked out, so that an app or Claude cannot define a solid it did not
 *   clean, nor say of it what its file does not hold.
 * - **Serving.** `solid/get` is answered from `solids/`: a file whose bytes are not its name's is never
 *   served; the first time a file is read, the core's strict reader checks it in the worker, and a
 *   file that is not canonical is never served either. Both warn `solid-not-clean`. A canonical file
 *   whose definition says another description is served as it is, and warns too.
 */
import { isDeepStrictEqual } from 'node:util';
import {
  MAX_SOLID_INPUT_BYTES,
  SOLID_CAPS,
  SOLID_PIECE_BYTES,
  decodeBase64,
  encodeBase64,
  type Command,
  type DefineSolidCommand,
  type Problem,
  type ProjectSnapshot,
  type ServerMessage,
  type SolidDescription,
  type SolidImportOptions,
  type SolidPrepareMessage,
  type SolidPreparedMessage,
} from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import type { WriteOptions } from '../writer';
import type { CleanedSolid } from './clean';
import { checkInWorker, cleanInWorker } from './cleaner';
import { definedSolids, hashOf, readSolidFile, solidFileName, writeSolidFile } from './files';
import type { CheckedSolid } from './worker';

/** How many files the program holds prepared, and for how long. */
export const PREPARED_SOLIDS = { most: 2, forMs: 10 * 60 * 1000 } as const;

/** How many files may be on their way in pieces at once, and how long one may take to arrive. */
export const ARRIVING_SOLIDS = { most: 2, forMs: 10 * 60 * 1000 } as const;

/** How many files may wait to be cleaned, the one being cleaned included. */
export const WAITING_SOLIDS = 3;

/** A file cleaned and held, for the dialog's preview and the action that defines it. */
export interface PreparedSolid {
  hash: string;
  bytes: Uint8Array;
  description: SolidDescription;
  report: string[];
  source?: string;
  fileName: string;
}

export interface SolidStoreOptions {
  /** How a file is cleaned; in the worker thread by default. */
  clean?: (bytes: Uint8Array, options: SolidImportOptions) => Promise<CleanedSolid>;
  /** How a solid's file is checked; in the worker thread by default. */
  check?: (bytes: Uint8Array) => Promise<CheckedSolid>;
  /** The time, in milliseconds since 1970; the computer's clock by default. */
  now?: () => number;
  /** How files are written. */
  writer?: WriteOptions;
  /** Hears the warnings a file found not clean gives, the first time it is found so. */
  notClean?: (warnings: Problem[]) => void;
}

/** The outcome of preparing a file: what the program holds, or why it holds nothing. */
export type Preparing = { ok: true; prepared: PreparedSolid } | { ok: false; problems: Problem[] };

/** A file arriving in pieces from one connection under one request. */
interface Arriving {
  owner: object;
  requestId: string;
  fileName: string;
  options: SolidImportOptions;
  count: number;
  pieces: (Uint8Array | undefined)[];
  received: number;
  started: number;
}

/** What a piece of `solid/prepare` comes to: wait for more, a file whole, or a refusal. */
export type PieceOutcome =
  | { kind: 'more' }
  | { kind: 'whole'; bytes: Uint8Array; fileName: string; options: SolidImportOptions }
  | { kind: 'refused'; problem: Problem };

export class SolidStore {
  readonly #folder: string;
  readonly #options: SolidStoreOptions;
  readonly #prepared: (PreparedSolid & { at: number })[] = [];
  readonly #arriving: Arriving[] = [];
  /** The files in `solids/` read and checked, by hash, with their descriptions. */
  readonly #checked = new Map<string, SolidDescription>();
  /** The files found not clean, by hash, with why. */
  readonly #notClean = new Map<string, string>();
  /** The definitions found to say another description than their file holds, by id. */
  readonly #described = new Map<string, string>();
  #cleaning: Promise<unknown> = Promise.resolve();
  #waiting = 0;

  constructor(folder: string, options: SolidStoreOptions = {}) {
    this.#folder = folder;
    this.#options = options;
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  // --- Pieces ------------------------------------------------------------------------------------

  /** Takes one piece of a file to import; the whole file once its last piece is in. */
  receive(owner: object, message: SolidPrepareMessage): PieceOutcome {
    const now = this.#now();
    for (let at = this.#arriving.length - 1; at >= 0; at -= 1) {
      if (now - (this.#arriving[at] as Arriving).started > ARRIVING_SOLIDS.forMs) {
        this.#arriving.splice(at, 1);
      }
    }
    const { piece } = message;
    let arriving = this.#arriving.find(
      (each) => each.owner === owner && each.requestId === message.requestId,
    );
    if (arriving === undefined) {
      if (this.#arriving.length >= ARRIVING_SOLIDS.most) {
        return refusal(
          'program-failed',
          'Visual Anything is receiving two solids already: import this one once they are prepared.',
        );
      }
      arriving = {
        owner,
        requestId: message.requestId,
        fileName: message.fileName,
        options: message.options ?? {},
        count: piece.count,
        pieces: new Array<Uint8Array | undefined>(piece.count),
        received: 0,
        started: now,
      };
      this.#arriving.push(arriving);
    }
    // The options come with the first piece, whenever it arrives.
    if (message.options !== undefined) arriving.options = message.options;
    const drop = (problem: Problem): PieceOutcome => {
      this.#arriving.splice(this.#arriving.indexOf(arriving), 1);
      return { kind: 'refused', problem };
    };
    if (piece.count !== arriving.count || message.fileName !== arriving.fileName) {
      return drop(pieceProblem());
    }
    if (arriving.pieces[piece.index] !== undefined) return drop(pieceProblem());
    const bytes = decodeBase64(piece.data);
    const last = piece.index === piece.count - 1;
    if (
      bytes === undefined ||
      (last
        ? bytes.length < 1 || bytes.length > SOLID_PIECE_BYTES
        : bytes.length !== SOLID_PIECE_BYTES)
    ) {
      return drop(pieceProblem());
    }
    arriving.pieces[piece.index] = bytes;
    arriving.received += 1;
    if (arriving.received < arriving.count) return { kind: 'more' };
    this.#arriving.splice(this.#arriving.indexOf(arriving), 1);
    const total = arriving.pieces.reduce((sum, each) => sum + (each as Uint8Array).length, 0);
    if (total > MAX_SOLID_INPUT_BYTES) {
      return {
        kind: 'refused',
        problem: {
          code: 'solid-too-large',
          message: 'The file is over 256 MiB, the most cleaning reads.',
        },
      };
    }
    const whole = new Uint8Array(total);
    let offset = 0;
    for (const each of arriving.pieces as Uint8Array[]) {
      whole.set(each, offset);
      offset += each.length;
    }
    return { kind: 'whole', bytes: whole, fileName: arriving.fileName, options: arriving.options };
  }

  /** Lets go of the pieces a connection that closed was sending. */
  forget(owner: object): void {
    for (let at = this.#arriving.length - 1; at >= 0; at -= 1) {
      if ((this.#arriving[at] as Arriving).owner === owner) this.#arriving.splice(at, 1);
    }
  }

  // --- Preparing ---------------------------------------------------------------------------------

  /**
   * Cleans a file to import, after those asked for before it, and holds what it made: the newest two,
   * each for ten minutes. The bytes are handed to the cleaner, and are no longer the caller's.
   */
  prepare(
    bytes: Uint8Array,
    fileName: string,
    options: SolidImportOptions = {},
  ): Promise<Preparing> {
    if (this.#waiting >= WAITING_SOLIDS) {
      return Promise.resolve({
        ok: false,
        problems: [
          {
            code: 'program-failed',
            message:
              'Visual Anything is cleaning solids already: import this one once they are prepared.',
          },
        ],
      });
    }
    this.#waiting += 1;
    const clean = this.#options.clean ?? ((given, chosen) => cleanInWorker(given, chosen));
    const kept = options.keep;
    const turn = this.#cleaning
      .then(() => (kept === undefined ? clean(bytes, options) : this.#keep(bytes, kept)))
      .then((cleaned): Preparing => {
        if (!cleaned.ok) return cleaned;
        const prepared: PreparedSolid = {
          hash: cleaned.hash,
          bytes: cleaned.bytes,
          description: cleaned.description,
          report: cleaned.report,
          ...(cleaned.source === undefined ? {} : { source: cleaned.source }),
          fileName,
        };
        this.#hold(prepared);
        return { ok: true, prepared };
      })
      .catch((error: unknown): Preparing => ({
        ok: false,
        problems: [
          {
            code: 'program-failed',
            message: `The file could not be cleaned: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }))
      .finally(() => {
        this.#waiting -= 1;
      });
    this.#cleaning = turn;
    return turn;
  }

  /**
   * A file kept from another project, checked rather than cleaned: canonical, within the cleaned
   * file's caps, and its bytes those of its name, then written to `solids/`; or why it is refused.
   */
  async #keep(bytes: Uint8Array, hash: string): Promise<CleanedSolid> {
    const name = solidFileName(hash);
    if (bytes.length > SOLID_CAPS.fileBytes) {
      return {
        ok: false,
        problems: [
          {
            code: 'solid-too-large',
            message: `The solid file "${name}" is over ${SOLID_CAPS.fileBytes} bytes, the most a cleaned file holds.`,
          },
        ],
      };
    }
    if (bytes.length === 0 || hashOf(bytes) !== hash) {
      return {
        ok: false,
        problems: [
          {
            code: 'solid-not-clean',
            message: `The bytes of the solid file "${name}" are not the ones its name says.`,
          },
        ],
      };
    }
    const check = this.#options.check ?? ((given) => checkInWorker(given));
    const checked = await check(bytes);
    if (!checked.ok || checked.hash !== hash) {
      const why = checked.ok ? 'its hash is not its name' : (checked.problems[0]?.message ?? '');
      return {
        ok: false,
        problems: [
          {
            code: 'solid-not-clean',
            message: `The solid file "${name}" is not one Visual Anything cleaned: ${why}`,
          },
        ],
      };
    }
    await writeSolidFile(this.#folder, hash, bytes, this.#options.writer);
    this.#checked.set(hash, checked.description);
    this.#notClean.delete(hash);
    return { ok: true, hash, bytes, description: checked.description, report: [] };
  }

  #hold(prepared: PreparedSolid): void {
    this.#expire();
    const known = this.#prepared.findIndex((each) => each.hash === prepared.hash);
    if (known >= 0) this.#prepared.splice(known, 1);
    this.#prepared.push({ ...prepared, at: this.#now() });
    while (this.#prepared.length > PREPARED_SOLIDS.most) this.#prepared.shift();
  }

  #expire(): void {
    const now = this.#now();
    for (let at = this.#prepared.length - 1; at >= 0; at -= 1) {
      if (now - (this.#prepared[at] as { at: number }).at > PREPARED_SOLIDS.forMs) {
        this.#prepared.splice(at, 1);
      }
    }
  }

  /** A file the program holds prepared, by its hash. */
  prepared(hash: string): PreparedSolid | undefined {
    this.#expire();
    return this.#prepared.find((each) => each.hash === hash);
  }

  // --- Holding -----------------------------------------------------------------------------------

  /**
   * The description of a file the program holds, writing it to `solids/` first when it was only
   * prepared; or why the program holds no such file.
   */
  async hold(
    hash: string,
  ): Promise<
    { ok: true; description: SolidDescription; bytes: number } | { ok: false; problems: Problem[] }
  > {
    const prepared = this.prepared(hash);
    if (prepared !== undefined) {
      try {
        await writeSolidFile(this.#folder, hash, prepared.bytes, this.#options.writer);
      } catch (error) {
        return {
          ok: false,
          problems: [
            {
              code: 'program-failed',
              message: `The solid file "${solidFileName(hash)}" could not be written: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
      this.#checked.set(hash, prepared.description);
      this.#notClean.delete(hash);
      return { ok: true, description: prepared.description, bytes: prepared.bytes.length };
    }
    const read = await this.#read(hash);
    if (!read.ok) {
      return {
        ok: false,
        problems: [
          {
            code: 'invalid-solid',
            message: `Visual Anything holds no cleaned file "${solidFileName(hash)}": import the file, and the program cleans it first.`,
          },
        ],
      };
    }
    return { ok: true, description: read.description, bytes: read.bytes.length };
  }

  /**
   * A command with every `define-solid` in it taken only for a file the program holds, and given the
   * description the program worked out; or why it cannot be taken.
   */
  async admit(
    command: Command,
  ): Promise<{ ok: true; command: Command } | { ok: false; problems: Problem[] }> {
    if (command.type === 'batch') {
      if (!Array.isArray(command.commands)) return { ok: true, command };
      const commands: Command[] = [];
      for (const inner of command.commands) {
        const admitted = await this.admit(inner);
        if (!admitted.ok) return admitted;
        commands.push(admitted.command);
      }
      return { ok: true, command: { ...command, commands } };
    }
    if (command.type !== 'define-solid') return { ok: true, command };
    const solid = command.solid as Partial<SolidDefinition> | null | undefined;
    // A definition that is no object, or names no file, is refused by the core as it is.
    if (typeof solid !== 'object' || solid === null || typeof solid.hash !== 'string') {
      return { ok: true, command };
    }
    if (!/^[0-9a-f]{64}$/.test(solid.hash)) return { ok: true, command };
    const held = await this.hold(solid.hash);
    if (!held.ok) return held;
    const { description } = held;
    const defined: DefineSolidCommand = {
      ...command,
      solid: {
        ...(solid as SolidDefinition),
        bytes: held.bytes,
        bounds: description.bounds,
        counts: description.counts,
        parts: description.parts,
      },
    };
    if (description.animations.length > 0) defined.solid.animations = description.animations;
    else delete defined.solid.animations;
    return { ok: true, command: defined };
  }

  // --- Serving -----------------------------------------------------------------------------------

  /**
   * Reads a file of `solids/`: its bytes and description when they are its name's and canonical, the
   * first time checked by the core's strict reader in the worker. A file found not clean warns.
   */
  async #read(
    hash: string,
  ): Promise<
    | { ok: true; bytes: Uint8Array; description: SolidDescription }
    | { ok: false; code: 'solid-file-missing' | 'solid-not-clean'; message: string }
  > {
    const read = await readSolidFile(this.#folder, hash);
    const name = solidFileName(hash);
    if (!read.ok) {
      return {
        ok: false,
        code: 'solid-file-missing',
        message:
          read.reason === 'missing'
            ? `The project has no solid file "${name}".`
            : `The solid file "${name}" cannot be read: ${read.message}`,
      };
    }
    const { bytes } = read;
    if (bytes.length === 0 || hashOf(bytes) !== hash) {
      const message = `The bytes of the solid file "${name}" are not the ones its name says.`;
      this.#flag(hash, message);
      return { ok: false, code: 'solid-not-clean', message };
    }
    let description = this.#checked.get(hash);
    if (description === undefined) {
      const check = this.#options.check ?? ((given) => checkInWorker(given));
      const checked = await check(bytes);
      if (!checked.ok || checked.hash !== hash) {
        const why = checked.ok ? 'its hash is not its name' : (checked.problems[0]?.message ?? '');
        const message = `The solid file "${name}" is not one Visual Anything cleaned: ${why}`;
        this.#flag(hash, message);
        return { ok: false, code: 'solid-not-clean', message };
      }
      description = checked.description;
      this.#checked.set(hash, description);
      this.#notClean.delete(hash);
    }
    return { ok: true, bytes, description };
  }

  /**
   * The messages that answer `solid/get`: the file's pieces, in order, or one refusal. A file the
   * program holds prepared and has not written yet is served from what it holds, which its cleaner
   * wrote, so that the import dialog's preview can draw it before it is defined (ADR 0075's
   * clarification of 2026-10-31, the editors).
   */
  async serve(requestId: string, hash: string, state: ProjectSnapshot): Promise<ServerMessage[]> {
    const prepared = this.prepared(hash);
    let bytes: Uint8Array;
    if (prepared !== undefined) {
      bytes = prepared.bytes;
    } else {
      const read = await this.#read(hash);
      if (!read.ok)
        return [{ type: 'solid/refused', requestId, code: read.code, message: read.message }];
      this.#compare(hash, read.description, state);
      bytes = read.bytes;
    }
    const count = Math.ceil(bytes.length / SOLID_PIECE_BYTES);
    const pieces: ServerMessage[] = [];
    for (let index = 0; index < count; index++) {
      const start = index * SOLID_PIECE_BYTES;
      pieces.push({
        type: 'solid/piece',
        requestId,
        hash,
        piece: {
          index,
          count,
          data: encodeBase64(bytes.subarray(start, start + SOLID_PIECE_BYTES)),
        },
      });
    }
    return pieces;
  }

  /** Warns, once each, of the definitions naming a file whose description is not theirs. */
  #compare(hash: string, description: SolidDescription, state: ProjectSnapshot): void {
    const found: Problem[] = [];
    for (const { definition } of definedSolids(state)) {
      if (definition.hash !== hash || this.#described.has(definition.id)) continue;
      const theirs = {
        bounds: definition.bounds,
        counts: definition.counts,
        parts: definition.parts,
        animations: definition.animations ?? [],
      };
      if (isDeepStrictEqual(theirs, { ...description })) continue;
      const message = `The solid "${definition.name}" says another description than its file "${solidFileName(hash)}" holds; it is drawn as its file is.`;
      this.#described.set(definition.id, message);
      found.push({ code: 'solid-not-clean', message, subjects: [definition.id] });
    }
    if (found.length > 0) this.#options.notClean?.(found);
  }

  #flag(hash: string, message: string): void {
    if (this.#notClean.get(hash) === message) return;
    this.#notClean.set(hash, message);
    this.#checked.delete(hash);
    this.#options.notClean?.([{ code: 'solid-not-clean', message }]);
  }

  /** The warnings of the files found not clean, against the solids that name them. */
  warnings(state: ProjectSnapshot): Problem[] {
    const warnings: Problem[] = [];
    for (const { definition } of definedSolids(state)) {
      const why = this.#notClean.get(definition.hash);
      if (why !== undefined) {
        warnings.push({
          code: 'solid-not-clean',
          message: `The solid "${definition.name}" is drawn as its placeholder. ${why}`,
          subjects: [definition.id],
        });
      }
      const described = this.#described.get(definition.id);
      if (described !== undefined && definition.hash !== undefined) {
        warnings.push({ code: 'solid-not-clean', message: described, subjects: [definition.id] });
      }
    }
    return warnings;
  }
}

/** The answer that tells an app its file is prepared. */
export function preparedMessage(requestId: string, prepared: PreparedSolid): SolidPreparedMessage {
  const { description } = prepared;
  return {
    type: 'solid/prepared',
    requestId,
    hash: prepared.hash,
    bytes: prepared.bytes.length,
    bounds: description.bounds,
    counts: description.counts,
    parts: description.parts,
    ...(description.animations.length === 0 ? {} : { animations: description.animations }),
    report: prepared.report,
    ...(prepared.source === undefined ? {} : { source: prepared.source }),
  };
}

function pieceProblem(): Problem {
  return {
    code: 'invalid-solid',
    message: 'The pieces of the file to import do not fit together.',
  };
}

function refusal(code: Problem['code'], message: string): PieceOutcome {
  return { kind: 'refused', problem: { code, message } };
}
