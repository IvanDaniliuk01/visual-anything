/**
 * The viewer's bundle holds no live connection, no commands, no editors, no inspector controls, no
 * launch-address code and no package code (ADR 0041, ADR 0054): this builds it as `pnpm build` does,
 * in a process of its own, and reads which modules its script holds and what it says. It also builds
 * the solid worker as a page holds it (ADR 0075): three.js is in it and nowhere else, so that neither
 * the viewer nor a page without solids holds it, and a page with solids' files holds it as text its
 * policy lets it start, and nothing else. And it holds KaTeX's code and rules but none of its fonts,
 * which its build writes beside it: a page holds those its project's Math uses, as data, and its
 * policy does not change (ADR 0106).
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import {
  encodeBase64,
  solidHash,
  type MathFont,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { ARM_FILE, withSolids } from '../test/solids';
import { workcell } from '../test/space';
import { pageDataOf } from './data';
import { MATH_FAMILIES, mathFontFile } from './math-families';
import { SOLID_WORKER_ID, writePage } from './page';
import { withPoses } from './solids';

const APP = resolve(import.meta.dirname, '../..');

/** The variable `vite.viewer.config.ts` reads the file to list the script's modules in from. */
const MODULES_LIST = 'VISUAL_ANYTHING_VIEWER_MODULES';

/** Modules, by their path in the repository, that a page must never hold; a path ending in / is a folder. */
const NOT_IN_THE_PAGE = [
  // The live connection, the session token and joining another tab's session.
  'packages/app/src/live/connection.ts',
  'packages/app/src/live/LiveProvider.tsx',
  'packages/app/src/live/context.ts',
  'packages/app/src/live/session.ts',
  'packages/app/src/live/share.ts',
  'packages/app/src/main.tsx',
  'packages/app/src/App.tsx',
  // The app's shell, whose header holds undo, redo and the preferences the program keeps.
  'packages/app/src/shell/Shell.tsx',
  'packages/app/src/shell/Header.tsx',
  'packages/app/src/theme/usePreferences.ts',
  'packages/app/src/theme/store.ts',
  // The editors: the canvas's editing gestures, menus and dialogs, and the layout that stores positions.
  'packages/app/src/canvas/controller.ts',
  'packages/app/src/canvas/CanvasArea.tsx',
  'packages/app/src/canvas/CanvasToolbar.tsx',
  'packages/app/src/canvas/InlineEditor.tsx',
  'packages/app/src/canvas/ShapeMenu.tsx',
  'packages/app/src/canvas/RelationMenu.tsx',
  'packages/app/src/canvas/DeleteDialog.tsx',
  'packages/app/src/canvas/ContainerChooser.tsx',
  'packages/app/src/canvas/drop.ts',
  'packages/app/src/canvas/gestures.ts',
  'packages/app/src/canvas/rowCommands.ts',
  'packages/app/src/canvas/stacking.ts',
  'packages/app/src/canvas/routing/editor.ts',
  'packages/app/src/canvas/routing/commands.ts',
  'packages/app/src/canvas/layout/',
  'packages/app/src/scenarios/ScenarioPanel.tsx',
  'packages/app/src/scenarios/StepDetails.tsx',
  'packages/app/src/scenarios/commands.ts',
  'packages/app/src/scenarios/session.ts',
  'packages/app/src/scenarios/useCanvasRecording.ts',
  'packages/app/src/history/',
  'packages/app/src/export/ExportControl.tsx',
  'packages/app/src/view-state/CopyAddress.tsx',
  'packages/app/src/guidance/GuidanceLayer.tsx',
  'packages/app/src/guidance/useGuidedRequests.ts',
  // The inspector and its controls, and the component editor.
  'packages/app/src/shell/Inspector.tsx',
  'packages/app/src/shell/inspector/',
  'packages/app/src/shell/definitions/',
  // What edits a view's scope (ADR-0040): the inspector's scope editor and section, and the
  // outline's menu, with the app's outline that holds it; the page shows the outline's tree alone.
  'packages/app/src/shell/inspector/ScopeEditor.tsx',
  'packages/app/src/shell/inspector/ScopeSection.tsx',
  'packages/app/src/shell/OutlineMenu.tsx',
  'packages/app/src/shell/Outline.tsx',
  // The core's commands and history: nothing in the page changes the project.
  'packages/core/src/commands/index.ts',
  'packages/core/src/commands/code.ts',
  'packages/core/src/history.ts',
  // Package code (ADR 0054): its worker, its interpreter, its approvals and its sections. No package's
  // code runs in a page, and the page's data holds none.
  'packages/app/src/code/',
  'node_modules/quickjs-emscripten-core/',
  'node_modules/@jitl/',
  // Ajv, which compiles code; the page's validators are generated when it is built.
  'packages/schema/src/validate.ts',
  'node_modules/ajv/',
  // The app's own Trusted Types policy, which lets the app load its workers.
  'packages/app/src/trusted-types.ts',
  // What makes drawings of HTML (ADR 0068): only the local program's worker holds it, with its font.
  'packages/app/src/import/',
  'packages/server/',
  'node_modules/parse5/',
  'node_modules/satori/',
  'node_modules/harfbuzzjs/',
  // KaTeX's fonts and the glyphs' outlines (ADR 0106): a page holds the fonts its Math uses as data,
  // and only the exports draw outlines.
  'node_modules/katex/dist/fonts/',
  'packages/core/src/math/outlines.ts',
  'packages/core/src/math/outlines.json',
  'packages/app/src/export/math-svg.ts',
];

/**
 * Modules in those folders that only read, which the physical-space panel (ADR 0076) brings into a
 * page: the ease a layout's move and the panel's camera share, which stores nothing; and how lengths
 * are written, which the panel's announcements say where things are in.
 */
const READ_ONLY_IN_THOSE = [
  'packages/app/src/canvas/layout/transition.ts',
  'packages/app/src/shell/inspector/lengths.ts',
];

/** What no page's script may say: the ways a page could reach a program, a session or the network. */
const NOT_SAID = [
  'WebSocket',
  'BroadcastChannel',
  'EventSource',
  'XMLHttpRequest',
  'sendBeacon',
  'RTCPeerConnection',
  'WebTransport',
  'new Worker',
  'importScripts',
  'sessionStorage',
  'visual-anything.session',
  'session/ask',
  'session/token',
  '/live?',
  'launch=',
  'new Function',
  'eval(',
  // An interpreter in WebAssembly, as package code runs in; the schema's own words may name it.
  'WebAssembly.',
];

let out = '';
let script = '';
let style = '';
let modules: string[] = [];
let workerOut = '';
let solidWorker = '';
/** KaTeX's fonts as the build writes them beside the viewer. */
let mathFonts: Partial<Record<MathFont, Uint8Array>> = {};

/** A formula with fractions, sums and hats, in a display block. */
const LOSS = '$$\\frac{1}{n}\\sum_i (y_i - \\hat y_i)^2$$';

/** The sample, its first element described with this text. */
function withFormula(project: ProjectSnapshot, description: string): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) =>
        at === 0 ? { ...element, description } : element,
      ),
    },
  };
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** What only three.js's own code says: the revision it registers itself under. */
const THREE_MARK = '__THREE__';

/** Runs a command, and resolves once it ends well. */
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((done, fail) => {
    execFile(command, args, { cwd: APP, env, maxBuffer: 16 * 1024 * 1024 }, (error, _out, err) => {
      if (error) fail(new Error(`${error.message}\n${err}`));
      else done();
    });
  });
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'visual-anything-viewer-'));
  const vite = join(
    dirname(createRequire(import.meta.url).resolve('vite/package.json')),
    'bin',
    'vite.js',
  );
  await run(
    process.execPath,
    [
      vite,
      'build',
      '--config',
      'vite.viewer.config.ts',
      '--outDir',
      out,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    { ...process.env, [MODULES_LIST]: join(out, 'modules.json') },
  );
  script = readFileSync(join(out, 'viewer.js'), 'utf8');
  style = readFileSync(join(out, 'viewer.css'), 'utf8');
  modules = JSON.parse(readFileSync(join(out, 'modules.json'), 'utf8')) as string[];
  mathFonts = Object.fromEntries(
    MATH_FAMILIES.map((font) => [
      font,
      new Uint8Array(readFileSync(join(out, mathFontFile(font)))),
    ]),
  );
  workerOut = mkdtempSync(join(tmpdir(), 'visual-anything-solid-worker-'));
  await run(
    process.execPath,
    [
      vite,
      'build',
      '--config',
      'vite.solid-worker.config.ts',
      '--outDir',
      workerOut,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    process.env,
  );
  solidWorker = readFileSync(join(workerOut, 'solid-worker.js'), 'utf8');
}, 300_000);

afterAll(() => {
  if (out !== '') rmSync(out, { recursive: true, force: true });
  if (workerOut !== '') rmSync(workerOut, { recursive: true, force: true });
});

describe('The viewer’s bundle', () => {
  it('is one script and one stylesheet, with KaTeX’s fonts beside them', () => {
    expect(readdirSync(out).sort()).toEqual(['fonts', 'modules.json', 'viewer.css', 'viewer.js']);
    expect(readdirSync(join(out, 'fonts')).sort()).toEqual(
      MATH_FAMILIES.map((font) => mathFontFile(font).slice('fonts/'.length)).sort(),
    );
    expect(script.length).toBeGreaterThan(0);
    expect(style.length).toBeGreaterThan(0);
  });

  it('holds KaTeX and its rules, but none of its fonts and no glyph outlines (ADR 0106)', () => {
    expect(modules.some((path) => path.includes('node_modules/katex/'))).toBe(true);
    expect(style).toContain('.katex');
    expect(style).not.toMatch(/@font-face[^}]*KaTeX/);
    for (const font of MATH_FAMILIES) {
      // A font written into the script would hold its first bytes in base64.
      const head = encodeBase64(mathFonts[font]!.subarray(0, 48));
      expect(script.includes(head), font).toBe(false);
    }
    // What the script and the stylesheet weigh, and what KaTeX's fonts would add to them.
    const total = Object.values(mathFonts).reduce((sum, bytes) => sum + bytes.length, 0);
    console.info(
      `viewer.js ${kB(Buffer.byteLength(script))}, viewer.css ${kB(Buffer.byteLength(style))}; KaTeX's 20 fonts ${kB(total)}, ${kB(Math.ceil(total / 3) * 4)} in base64`,
    );
  });

  it('makes a page whose Math holds the families it uses alone, and keeps its policy', async () => {
    const plain = await writePage({
      assets: { script, style, mathFonts },
      data: pageDataOf(loadSample()),
      title: 'My systems',
    });
    expect(plain.html).not.toContain('"mathFonts"');
    const math = await writePage({
      assets: { script, style, mathFonts },
      data: pageDataOf(withFormula(loadSample(), LOSS)),
      title: 'My systems',
    });
    const held = /"mathFonts":(\{[^}]*\})/.exec(math.html);
    const families = Object.keys(JSON.parse(held?.[1] ?? '{}') as object);
    expect(families).toEqual(['Main-Regular', 'Math-Italic', 'Size2-Regular']);
    // Its policy names no font source: the viewer installs the fonts from their bytes.
    const shape = (policy: string) => policy.replace(/'sha256-[^']+'/g, 'HASH');
    expect(shape(math.policy)).toBe(shape(plain.policy));
    expect(math.policy).not.toContain('font-src');
    expect(math.policy).toContain("default-src 'none'");
    const added = math.bytes - plain.bytes;
    const fonts = families.reduce(
      (sum, font) => sum + Math.ceil(mathFonts[font as MathFont]!.length / 3) * 4,
      0,
    );
    expect(added).toBeGreaterThanOrEqual(fonts);
    expect(added).toBeLessThan(fonts + 1_000);
    console.info(
      `A page of the sample: ${kB(plain.bytes)}; with ${LOSS}, ${kB(math.bytes)}: its ${families.length} fonts add ${kB(added)}`,
    );
  });

  it('holds the viewer and the renderer, with the page’s Trusted Types policy installed first', () => {
    expect(modules).toContain('packages/app/src/viewer/main.tsx');
    expect(modules).toContain('packages/app/src/canvas/renderer.ts');
    const policy = modules.indexOf('packages/app/src/viewer/install-trusted-types.ts');
    const first = modules.findIndex(
      (path) => path.includes('node_modules/') || path.startsWith('packages/core/'),
    );
    expect(policy).toBeGreaterThanOrEqual(0);
    expect(policy).toBeLessThan(first);
  });

  it('holds no live connection, commands, editors, inspector controls, launch-address code or package code', () => {
    const held = modules.filter(
      (path) =>
        !READ_ONLY_IN_THOSE.includes(path) &&
        NOT_IN_THE_PAGE.some((left) =>
          left.endsWith('/') ? path.includes(left) : path === left || path.endsWith(`/${left}`),
        ),
    );
    expect(held).toEqual([]);
  });

  it('says nothing that would reach a program, a session or the network', () => {
    expect(NOT_SAID.filter((text) => script.includes(text))).toEqual([]);
  });

  it('makes a page that loads nothing, whose policy names its scripts', async () => {
    const page = await writePage({
      assets: { script, style },
      data: pageDataOf(loadSample()),
      title: 'My systems',
    });
    // The markup around the scripts and the stylesheet names nothing to load, nor does the stylesheet.
    const markup = page.html.replace(
      /(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi,
      (_whole, open: string, _tag: string, close: string) => `${open}${close}`,
    );
    expect(markup.match(/\b(src|href|action|srcset)\s*=|<link\b|<iframe\b|<object\b/gi)).toBeNull();
    expect(style.match(/@import|url\((?!\s*['"]?data:)/gi)).toBeNull();
    expect(page.policy).toContain("connect-src 'none'");
    expect(page.large).toBe(false);
  });

  it('holds neither three.js nor the solid worker, which only a page with solids’ files holds', () => {
    expect(modules.filter((path) => /node_modules\/(three|three-mesh-bvh)\//.test(path))).toEqual(
      [],
    );
    expect(modules.filter((path) => path.includes('packages/app/src/solids/worker/'))).toEqual([]);
    expect(modules).not.toContain('packages/app/src/solids/client.ts');
    expect(script).not.toContain(THREE_MARK);
  });

  it('builds the solid worker as one classic script with three.js and its licenses, loading nothing', () => {
    expect(readdirSync(workerOut)).toEqual(['solid-worker.js']);
    expect(solidWorker).toContain(THREE_MARK);
    expect(solidWorker).toMatch(/^\/\*! Visual Anything’s solid worker\. three\.js .*MIT License/);
    for (const forbidden of [
      /\bfetch\(/,
      /new XMLHttpRequest\b/,
      /new WebSocket\b/,
      /\bimportScripts\(/,
      /\bimport\(/,
      /new Worker\b/,
      /\beval\(/,
      /new Function\b/,
    ]) {
      expect(solidWorker).not.toMatch(forbidden);
    }
  });

  it('makes a page without solids, or with their pictures, that holds no three.js and keeps its policy', async () => {
    for (const solids of [undefined, { form: 'pictures' as const, pictures: [] }]) {
      const page = await writePage({
        assets: { script, style, solidWorker },
        data: pageDataOf(withSolids(), solids ? { solids } : {}),
        title: 'Robot',
      });
      expect(page.html).not.toContain(THREE_MARK);
      expect(page.html).not.toContain(SOLID_WORKER_ID);
      expect(page.policy).toContain("worker-src 'none'");
      expect(page.policy).toMatch(/trusted-types default$/);
    }
    const plain = await writePage({
      assets: { script, style, solidWorker },
      data: pageDataOf(loadSample()),
      title: 'My systems',
    });
    expect(plain.html).not.toContain(THREE_MARK);
    // A page of pictures keeps its policy, poses or not: it has no physical-space panel (ADR 0076).
    const posedPictures = await writePage({
      assets: { script, style, solidWorker },
      data: pageDataOf(workcell(), {
        solids: withPoses(workcell(), { form: 'pictures', pictures: [] }, 'pictures'),
      }),
      title: 'Workcell',
    });
    expect(posedPictures.html).not.toContain(THREE_MARK);
    expect(posedPictures.policy).toContain("worker-src 'none'");
    expect(posedPictures.policy).toMatch(/trusted-types default$/);
  });

  it('makes a page with poses alone that holds the worker for its panel, and loads nothing', async () => {
    const page = await writePage({
      assets: { script, style, solidWorker },
      data: pageDataOf(workcell(), { solids: withPoses(workcell(), undefined) }),
      title: 'Workcell',
    });
    const held = [...page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(
      held
        .filter(([, , body]) => (body ?? '').includes(THREE_MARK))
        .map(([, attributes]) => (attributes ?? '').trim()),
    ).toEqual([`type="text/plain" id="${SOLID_WORKER_ID}"`]);
    expect(page.policy).toContain('worker-src blob:');
    expect(page.policy).toContain("connect-src 'none'");
    expect(page.solidBytes).toBeGreaterThan(solidWorker.length);
  });

  it('makes a page with solids’ files that holds three.js only as its worker’s text, and loads nothing', async () => {
    const page = await writePage({
      assets: { script, style, solidWorker },
      data: pageDataOf(withSolids(), {
        solids: { form: 'files', files: { [solidHash(ARM_FILE)]: encodeBase64(ARM_FILE) } },
      }),
      title: 'Robot',
    });
    const held = [...page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const withThree = held.filter(([, , body]) => (body ?? '').includes(THREE_MARK));
    expect(withThree.map(([, attributes]) => (attributes ?? '').trim())).toEqual([
      `type="text/plain" id="${SOLID_WORKER_ID}"`,
    ]);
    expect(page.policy).toContain('worker-src blob:');
    expect(page.policy).toContain("connect-src 'none'");
    expect(page.policy).toContain("default-src 'none'");
    // It has the physical-space panel, whose script holds no three.js either (ADR 0076).
    expect(modules).toContain('packages/app/src/space/SpacePanel.tsx');
    const markup = page.html.replace(
      /(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi,
      (_whole, open: string, _tag: string, close: string) => `${open}${close}`,
    );
    expect(markup.match(/\b(src|href|action|srcset)\s*=|<link\b|<iframe\b|<object\b/gi)).toBeNull();
    expect(NOT_SAID.filter((each) => script.includes(each))).toEqual([]);
  });
});
