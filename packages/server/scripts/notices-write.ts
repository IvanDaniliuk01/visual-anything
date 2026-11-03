/**
 * Writes `THIRD-PARTY-NOTICES.md` at the repository's root (ADR 0047's clarification of 2026-11-03):
 * builds the app, the read-only page and its solid worker for production with Vite, each build listing
 * the modules it ships (`app/vite.shipped.ts`), bundles the single executable's server, drawing worker
 * and solid cleaner with esbuild into a temporary folder, and names every npm package they hold.
 *
 *   pnpm notices           writes the file
 *   pnpm notices --check   fails, writing nothing, when the file differs from what the builds ship
 *
 * Run it after adding, removing or upgrading a dependency that ships, and commit the file. The test
 * `third-party.test.ts` fails when a dependency that ships is missing from it or named at another
 * version than the one installed, without building anything.
 */
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { SHIPPED_MODULES } from '../../app/vite.shipped';
import { packageFolders } from './notices';
import {
  REPOSITORY,
  bundleDrawingWorkerBeside,
  bundleServer,
  bundleSolidWorkerBeside,
} from './sea';
import { THIRD_PARTY_FILE, packageFoldersOfPaths, thirdPartyNotice } from './third-party';

const { values } = parseArgs({ options: { check: { type: 'boolean' } } });
const say = (line: string) => console.log(`[notices] ${line}`);
const APP = join(REPOSITORY, 'packages', 'app');

const temporary = await mkdtemp(join(tmpdir(), 'visual-anything-notices-'));
try {
  const lists = join(temporary, 'lists');
  process.env[SHIPPED_MODULES] = lists;
  for (const config of ['vite.config.ts', 'vite.viewer.config.ts', 'vite.solid-worker.config.ts']) {
    say(`Building ${config} for production`);
    await build({ configFile: join(APP, config), root: APP, logLevel: 'warn', mode: 'production' });
  }
  delete process.env[SHIPPED_MODULES];

  const foldersByPart: Record<string, string[]> = {};
  const add = (part: string, folders: readonly string[]) => {
    foldersByPart[part] = [...new Set([...(foldersByPart[part] ?? []), ...folders])].sort();
  };
  for (const file of (await readdir(lists)).sort()) {
    const part = file.split('-').slice(0, -2).join('-');
    const modules = JSON.parse(await readFile(join(lists, file), 'utf8')) as string[];
    add(part, packageFoldersOfPaths(modules, APP));
  }

  say('Bundling the single executable’s server, drawing worker and solid cleaner');
  const main = join(temporary, 'exe', 'visual-anything.cjs');
  const server = await bundleServer(main);
  const drawing = await bundleDrawingWorkerBeside(main);
  const solid = await bundleSolidWorkerBeside(main);
  add('server', packageFolders([server], process.cwd()));
  add('drawing-worker', packageFolders([drawing.metafile], process.cwd()));
  add('solid-cleaner', packageFolders([solid.metafile], process.cwd()));
  for (const folders of Object.values(foldersByPart)) {
    const missing = folders.filter((folder) => !existsSync(join(folder, 'package.json')));
    if (missing.length > 0) throw new Error(`No package.json in ${missing.join(', ')}`);
  }

  const text = await thirdPartyNotice(
    foldersByPart,
    join(APP, 'src', 'export', 'fonts', 'LICENSE-roboto.txt'),
  );
  const target = join(REPOSITORY, THIRD_PARTY_FILE);
  if (values.check === true) {
    const committed = existsSync(target) ? await readFile(target, 'utf8') : '';
    if (committed.replace(/\r\n/g, '\n') !== text) {
      throw new Error(`${THIRD_PARTY_FILE} differs from what ships: run pnpm notices.`);
    }
    say(`${THIRD_PARTY_FILE} names what ships.`);
  } else {
    await writeFile(target, text);
    say(`Wrote ${THIRD_PARTY_FILE}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
