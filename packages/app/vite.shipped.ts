// What each production build of the app ships, for the notice of third-party code (ADR 0047's
// clarification of 2026-11-03): when `VISUAL_ANYTHING_SHIPPED_MODULES` names a folder, every build
// that holds this plugin, the app's, each of its workers', the read-only page's and its solid
// worker's, writes there the files its output was made from, as absolute paths, one JSON file per
// build. `pnpm notices` sets it, then maps the paths under `node_modules` to their packages. Without
// it, the plugin does nothing, so builds are as they were.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** The variable that names the folder the lists are written to. */
export const SHIPPED_MODULES = 'VISUAL_ANYTHING_SHIPPED_MODULES';

/** Lists the modules the build's chunks hold, under `label`, when {@link SHIPPED_MODULES} is set. */
export function shippedModules(label: string): Plugin {
  return {
    name: 'visual-anything:shipped-modules',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const folder = process.env[SHIPPED_MODULES];
      if (folder === undefined || folder === '') return;
      const modules = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const id of output.moduleIds) modules.add(id);
        } else {
          // An asset taken from a package, such as ELK's worker script, keeps its original path.
          for (const original of output.originalFileNames) modules.add(original);
        }
      }
      mkdirSync(folder, { recursive: true });
      const file = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`;
      writeFileSync(join(folder, file), `${JSON.stringify([...modules].sort(), null, 2)}\n`);
    },
  };
}
