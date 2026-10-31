/**
 * The app's side of the solid worker (ADR 0075): the client of `solid-client.ts`, which starts the
 * solid worker by its address, so that Vite bundles the worker as a script of its own. Only the app
 * imports this module; the read-only page makes its client from `solid-client.ts` with the worker it
 * holds, so that a page without solids holds no worker at all.
 */
import {
  createSolidClientWith,
  type SolidClient,
  type SolidClientOptions,
  type SolidWorkerPort,
} from './solid-client';

export * from './solid-client';

/** Starts the solid worker. Vite bundles the worker from this exact expression. */
export function startSolidWorker(): SolidWorkerPort {
  return new Worker(new URL('./worker/solid.worker.ts', import.meta.url), {
    type: 'module',
    name: 'solids',
  });
}

/** Makes the app's side of the solid worker; nothing starts until a picture is asked for. */
export function createSolidClient(options: SolidClientOptions): SolidClient {
  return createSolidClientWith(options.files, options.start ?? startSolidWorker);
}
