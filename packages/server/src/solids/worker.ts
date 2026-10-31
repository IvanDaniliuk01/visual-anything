/**
 * The worker thread solids are cleaned and checked in (ADR 0075), limited in memory and time by the
 * program that starts it (`cleaner.ts`). It takes the file's bytes as its data, does one piece of
 * work, answers with what it made and how many times anything tried to reach the network or a file,
 * and ends:
 *
 * - `clean`: a file to import, cleaned into its canonical file, with its description and report;
 * - `check`: a solid's file from `solids/`, read by the core's strict reader, with its hash and its
 *   description. Checking loads neither the glTF reader nor meshoptimizer: only cleaning does.
 */
import { parentPort, workerData } from 'node:worker_threads';
import {
  readSolid,
  type Problem,
  type SolidDescription,
  type SolidImportOptions,
} from '@visual-anything/core';
import { guardNetwork, networkAttempts } from '../drawings/network';
import type { CleanedSolid } from './clean';
import { fileAttempts, guardFiles } from './files-guard';

/** What the worker is given. */
export type SolidWork =
  | { kind: 'clean'; bytes: Uint8Array; options: SolidImportOptions }
  | { kind: 'check'; bytes: Uint8Array };

/** What a check answers: the file's hash and description, or why it is not canonical. */
export type CheckedSolid =
  { ok: true; hash: string; description: SolidDescription } | { ok: false; problems: Problem[] };

/** What the worker answers, with the attempts to reach the network or a file. */
export type SolidWorkAnswer = (CleanedSolid | CheckedSolid | { ok: false; failed: string }) & {
  attempts: number;
};

guardNetwork();
const port = parentPort;
if (port !== null) {
  const work = workerData as SolidWork;
  const attempts = () => networkAttempts() + fileAttempts();
  const answer = async (): Promise<CleanedSolid | CheckedSolid> => {
    if (work.kind === 'check') {
      guardFiles();
      const read = readSolid(work.bytes);
      return read.ok
        ? { ok: true, hash: read.hash, description: read.description }
        : { ok: false, problems: read.problems };
    }
    // The glTF reader and meshoptimizer load here, and only here.
    const { cleanSolid } = await import('./clean');
    guardFiles();
    return cleanSolid(work.bytes, work.options);
  };
  void answer().then(
    (outcome) => {
      const transfer =
        outcome.ok && 'bytes' in outcome ? [outcome.bytes.buffer as ArrayBuffer] : [];
      port.postMessage({ ...outcome, attempts: attempts() } satisfies SolidWorkAnswer, transfer);
    },
    (error: unknown) =>
      port.postMessage({
        ok: false,
        failed: error instanceof Error ? error.message : String(error),
        attempts: attempts(),
      } satisfies SolidWorkAnswer),
  );
}
