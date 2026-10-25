/**
 * What the local program does differently when it runs as the single executable of its system
 * (ADR 0037), a Node.js single executable application: it serves the built app from the assets the
 * executable holds instead of from `packages/app/dist`, it has no dev mode, since the app's sources
 * are not in it, and Claude's MCP entry point starts the program by starting the executable itself.
 */
import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import * as sea from 'node:sea';
import type { StartProgram } from './claude/bridge';
import { RUNTIME_ENV } from './claude/discovery';
import { errorCode } from './errors';
import type { AppFiles } from './static';

/**
 * The executable holds each file of the built app as the asset of this prefix and the file's path
 * in the build, such as `app/index.html` or `app/assets/index-3f2a9c.js`.
 */
export const APP_ASSET_PREFIX = 'app/';

/** Why `--dev` is refused by the executable. */
export const DEV_IN_EXECUTABLE =
  '--dev serves the app from its sources, which only the repository holds: run `pnpm dev` there. This executable serves the app it was built with.';

/** Whether this process is the single executable, rather than Node.js running the sources. */
export function isExecutable(): boolean {
  return sea.isSea();
}

/** Reads an asset of the executable by its key, as `node:sea`'s `getRawAsset` does. */
export type AssetReader = (key: string) => ArrayBuffer;

/**
 * The files of the built app the executable holds. Each is read from the executable's memory without
 * a copy, and only by a path that {@link resolveAppPath} gave: nothing else of the executable is
 * served.
 */
export function embeddedAppFiles(readAsset: AssetReader = sea.getRawAsset): AppFiles {
  return {
    read: (path) => {
      try {
        return Promise.resolve(new Uint8Array(readAsset(`${APP_ASSET_PREFIX}${path}`)));
      } catch (error) {
        if (errorCode(error) === 'ERR_SINGLE_EXECUTABLE_APPLICATION_ASSET_NOT_FOUND') {
          return Promise.resolve(undefined);
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}

/**
 * How Claude's MCP entry point starts the program from the executable: the executable itself, in the
 * background, on the project folder, without opening the browser and stopping once idle. `prefix`
 * comes before those arguments, for tests that stand a script in for the executable.
 */
export function startProgramWith(
  runtime: string,
  executable: string = process.execPath,
  prefix: readonly string[] = [],
): StartProgram {
  return (folder, log) => {
    const out = openSync(log, 'a', 0o600);
    try {
      const child = spawn(executable, [...prefix, folder, '--no-open', '--stop-when-idle'], {
        detached: true,
        stdio: ['ignore', out, out],
        windowsHide: true,
        env: { ...process.env, [RUNTIME_ENV]: runtime },
      });
      const exited = new Promise<number | null>((resolve) => {
        child.once('exit', (code) => resolve(code));
        child.once('error', () => resolve(-1));
      });
      child.unref();
      return { exited };
    } finally {
      closeSync(out);
    }
  };
}
