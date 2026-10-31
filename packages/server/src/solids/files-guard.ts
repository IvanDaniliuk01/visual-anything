/**
 * The cleaner's worker reads no file (ADR 0075): it is handed the file's bytes and gives back the
 * cleaned ones. Beside the network guard the drawing's worker has (`drawings/network.ts`), this takes
 * away every way Node.js opens, reads, writes or lists files, once the worker's own code is loaded.
 * Each attempt is refused and counted, and the worker answers with the count, which the tests check
 * is 0.
 */
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

let attempts = 0;

function refuse(): never {
  attempts += 1;
  throw new Error('Cleaning a solid reads no file.');
}

/** How many times something tried to reach a file since the guard went up. */
export function fileAttempts(): number {
  return attempts;
}

const SYNC_AND_CALLBACK = [
  'open',
  'openSync',
  'readFile',
  'readFileSync',
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createReadStream',
  'createWriteStream',
  'readdir',
  'readdirSync',
  'opendir',
  'opendirSync',
  'stat',
  'statSync',
  'lstat',
  'lstatSync',
  'realpath',
  'realpathSync',
  'readlink',
  'readlinkSync',
  'symlink',
  'symlinkSync',
  'link',
  'linkSync',
  'unlink',
  'unlinkSync',
  'rename',
  'renameSync',
  'mkdir',
  'mkdirSync',
  'rm',
  'rmSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'access',
  'accessSync',
  'exists',
  'existsSync',
  'watch',
  'watchFile',
  'openAsBlob',
  'glob',
  'globSync',
  'statfs',
  'statfsSync',
  'mkdtemp',
  'mkdtempSync',
  'truncate',
  'truncateSync',
  'chmod',
  'chmodSync',
  'utimes',
  'utimesSync',
  // By a file descriptor, such as one the thread was given.
  'read',
  'readSync',
  'fstat',
  'fstatSync',
  'readv',
  'readvSync',
] as const;

const PROMISES = [
  'open',
  'readFile',
  'writeFile',
  'appendFile',
  'readdir',
  'opendir',
  'stat',
  'lstat',
  'realpath',
  'readlink',
  'symlink',
  'link',
  'unlink',
  'rename',
  'mkdir',
  'rm',
  'copyFile',
  'cp',
  'access',
  'watch',
  'glob',
  'statfs',
  'mkdtemp',
  'truncate',
  'chmod',
  'utimes',
] as const;

let guarded = false;

/** Takes every way to the file system away from this thread. */
export function guardFiles(): void {
  if (guarded) return;
  guarded = true;
  const replace = (owner: object, names: readonly string[]) => {
    for (const name of names) {
      if (!(name in owner)) continue;
      Object.defineProperty(owner, name, {
        value: refuse,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }
  };
  replace(fs, SYNC_AND_CALLBACK);
  replace(fsPromises, PROMISES);
  replace(fs.promises, PROMISES);
  syncBuiltinESMExports();
}
