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
