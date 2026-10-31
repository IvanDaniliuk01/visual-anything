/**
 * A worker for the file guard's test: with the guard up, as the cleaner's worker has it, it tries
 * each way to a file, and answers with what each did and how many attempts the guard counted.
 */
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import { fileAttempts, guardFiles } from '../files-guard';

guardFiles();
const here = import.meta.filename;
const tries: [string, () => unknown][] = [
  ['readFileSync', () => fs.readFileSync(here)],
  ['readFile', () => fs.readFile(here, () => undefined)],
  ['fs/promises readFile', () => readFile(here)],
  ['fs.promises.open', () => fs.promises.open(here)],
  ['openSync', () => fs.openSync(here, 'r')],
  ['createReadStream', () => fs.createReadStream(here)],
  ['readdirSync', () => fs.readdirSync('.')],
  ['writeFileSync', () => fs.writeFileSync('never-written.txt', 'x')],
  ['statSync', () => fs.statSync(here)],
  ['openAsBlob', () => fs.openAsBlob(here)],
  ['glob', () => fs.glob('*', () => undefined)],
  ['globSync', () => fs.globSync('*')],
  ['fs.promises.glob', () => fs.promises.glob('*')],
  ['statfsSync', () => fs.statfsSync(here)],
  ['fs.promises.statfs', () => fs.promises.statfs(here)],
  ['mkdtempSync', () => fs.mkdtempSync('never-made-')],
  ['fs.promises.mkdtemp', () => fs.promises.mkdtemp('never-made-')],
  ['truncateSync', () => fs.truncateSync('never-written.txt')],
  ['fs.promises.truncate', () => fs.promises.truncate('never-written.txt')],
  ['chmodSync', () => fs.chmodSync(here, 0o644)],
  ['fs.promises.chmod', () => fs.promises.chmod(here, 0o644)],
  ['utimesSync', () => fs.utimesSync(here, 0, 0)],
  ['fs.promises.utimes', () => fs.promises.utimes(here, 0, 0)],
  // By a file descriptor: 0, the one every thread has.
  ['readSync', () => fs.readSync(0, new Uint8Array(1))],
  ['read', () => fs.read(0, new Uint8Array(1), 0, 1, null, () => undefined)],
  ['fstatSync', () => fs.fstatSync(0)],
  ['fstat', () => fs.fstat(0, () => undefined)],
  ['readvSync', () => fs.readvSync(0, [new Uint8Array(1)])],
  ['readv', () => fs.readv(0, [new Uint8Array(1)], () => undefined)],
];

const results: Record<string, string> = {};
for (const [name, attempt] of tries) {
  try {
    const value = attempt();
    results[name] = value instanceof Promise ? 'made a request' : 'reached a file';
  } catch (error) {
    results[name] = error instanceof Error ? error.message : String(error);
  }
}
parentPort?.postMessage({ results, attempts: fileAttempts() });
