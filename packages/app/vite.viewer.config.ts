// The read-only page's viewer (ADR 0041), built apart from the app: one module script and one
// stylesheet, `dist/viewer/viewer.js` and `dist/viewer/viewer.css`, which the export writes into a page
// with the project. Everything is in the script: no chunk, worker, picture or font is loaded, since the
// page loads nothing. The project files' schemas are compiled here, at build time, into validators
// that need no `eval`, which the page's policy forbids.
//
// `pnpm build` builds it after the app, so that the program serves it beside the app and the single
// executable holds it; paths are the app package's.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** The module the viewer imports its validators from. */
export const VALIDATORS_MODULE = 'virtual:visual-anything/validators';

/** The kinds of project file, and the name each one's validator is exported under. */
const VALIDATED = {
  project: 'projectFile',
  model: 'modelFile',
  package: 'packageFile',
  view: 'viewFile',
  scenario: 'scenarioFile',
} as const;

/**
 * Where the build lists the modules its script holds, when this names a file: the test that checks
 * the viewer holds no live connection, commands or editors reads it (`src/viewer/bundle.test.ts`).
 */
export const MODULES_LIST = 'VISUAL_ANYTHING_VIEWER_MODULES';

export default defineConfig({
  plugins: [react(), validators(), scriptAndStyleOnly(), listModules(process.env[MODULES_LIST])],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/viewer',
    emptyOutDir: true,
    // Pictures and fonts, if any came, are written into the script and the stylesheet.
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    // One script is the point: the page loads nothing else.
    chunkSizeWarningLimit: 8192,
    rolldownOptions: {
      input: 'viewer.html',
      output: {
        entryFileNames: 'viewer.js',
        assetFileNames: 'viewer[extname]',
        codeSplitting: false,
      },
    },
  },
});

/**
 * The validators of the five kinds of project file, generated from the published schemas by Ajv's
 * standalone code: the checks opening a project makes, as plain functions. The page's benchmark
 * (`vite.bench.config.ts`) builds with them too.
 */
export function validators(): Plugin {
  const resolved = `\0${VALIDATORS_MODULE}`;
  return {
    name: 'visual-anything:validators',
    resolveId: (id) => (id === VALIDATORS_MODULE ? resolved : undefined),
    load: (id) => (id === resolved ? standaloneValidators() : undefined),
  };
}

function standaloneValidators(): string {
  // Ajv and the schemas are the schema package's; they are reached through it.
  const app = createRequire(import.meta.url);
  const fromSchema = createRequire(
    app.resolve('@visual-anything/schema/schemas/model.schema.json'),
  );
  type Compiler = {
    addSchema(schema: object, key: string): unknown;
  };
  const { Ajv } = fromSchema('ajv') as {
    Ajv: new (options: object) => Compiler;
  };
  const standalone = (
    fromSchema('ajv/dist/standalone') as { default: (ajv: Compiler, refs: object) => string }
  ).default;
  const ajv = new Ajv({ strict: true, allErrors: true, code: { source: true, esm: true } });
  const refs: Record<string, string> = {};
  for (const [kind, name] of Object.entries(VALIDATED)) {
    ajv.addSchema(fromSchema(`./${kind}.schema.json`) as object, kind);
    refs[name] = kind;
  }
  const code = standalone(ajv, refs)
    .replaceAll('require("ajv/dist/runtime/ucs2length").default', '__ucs2length')
    .replaceAll('require("ajv/dist/runtime/equal").default', '__equal');
  if (/\brequire\s*\(/.test(code)) {
    throw new Error('The schemas compiled to validators that need a runtime of Ajv’s own.');
  }
  return `${RUNTIME}\n${code}`;
}

/** What Ajv's generated validators call, as Ajv's runtime does it. */
const RUNTIME = `
function __ucs2length(text) {
  let length = 0;
  for (const _ of text) length += 1;
  return length;
}
function __equal(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return a !== a && b !== b;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let at = 0; at < a.length; at += 1) if (!__equal(a[at], b[at])) return false;
    return true;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !__equal(a[key], b[key])) return false;
  }
  return true;
}
`;

/** Writes the modules the script holds to a file, as paths relative to the repository. */
function listModules(file: string | undefined): Plugin {
  return {
    name: 'visual-anything:list-modules',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (file === undefined || file === '') return;
      const repository = fileURLToPath(new URL('../..', import.meta.url));
      const modules = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk'
          ? output.moduleIds.map((id) => relative(repository, id).replaceAll('\\', '/'))
          : [],
      );
      writeFileSync(file, `${JSON.stringify(modules, null, 2)}\n`);
    },
  };
}

/** Leaves only the script and the stylesheet: the page that served as the build's entry is no output. */
function scriptAndStyleOnly(): Plugin {
  return {
    name: 'visual-anything:script-and-style-only',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (name !== 'viewer.js' && name !== 'viewer.css') delete bundle[name];
      }
    },
  };
}
