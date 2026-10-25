import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DEV_IN_EXECUTABLE, embeddedAppFiles, isExecutable } from './executable';
import type { AppSource } from './server';

/** The folder of the app package, found through the local program's dependency on it. */
export function appPackageDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('@visual-anything/app/package.json'));
}

/**
 * Where the local program takes the app from. The single executable serves the build it holds, and
 * has no dev mode. Otherwise it is the build in the app package's `dist/` folder, or in dev mode its
 * sources, served through Vite with the app's own `vite.config.ts`.
 */
export function resolveAppSource(dev: boolean, executable: boolean = isExecutable()): AppSource {
  if (executable) {
    if (dev) throw new Error(DEV_IN_EXECUTABLE);
    return { mode: 'embedded', files: embeddedAppFiles() };
  }
  const dir = appPackageDir();
  return dev
    ? { mode: 'dev', root: dir, configFile: join(dir, 'vite.config.ts') }
    : { mode: 'static', dir: join(dir, 'dist') };
}
