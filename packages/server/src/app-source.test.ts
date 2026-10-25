import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appPackageDir, resolveAppSource } from './app-source';

const APP_PACKAGE = fileURLToPath(new URL('../../app', import.meta.url));

describe('appPackageDir', () => {
  it('finds the app package through the dependency on it', async () => {
    const dir = appPackageDir();
    expect(dir).toBe(await realpath(APP_PACKAGE));
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as unknown;
    expect(manifest).toMatchObject({ name: '@visual-anything/app' });
  });
});

describe('resolveAppSource', () => {
  it("serves the build from the app package's dist folder", () => {
    expect(resolveAppSource(false)).toEqual({ mode: 'static', dir: join(appPackageDir(), 'dist') });
  });

  it("serves the app's sources through Vite with its own config in dev mode", () => {
    expect(resolveAppSource(true)).toEqual({
      mode: 'dev',
      root: appPackageDir(),
      configFile: join(appPackageDir(), 'vite.config.ts'),
    });
  });

  it('serves the build the single executable holds', () => {
    expect(resolveAppSource(false, true).mode).toBe('embedded');
  });

  it('has no dev mode in the single executable, which holds no sources', () => {
    expect(() => resolveAppSource(true, true)).toThrow(/run `pnpm dev` there/);
  });
});
