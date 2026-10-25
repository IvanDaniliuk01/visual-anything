/**
 * The viewer's bundle holds no live connection, no commands, no editors, no inspector controls, no
 * launch-address code and no package code (ADR 0041, ADR 0054): this builds it as `pnpm build` does,
 * in a process of its own, and reads which modules its script holds and what it says.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { pageDataOf } from './data';
import { writePage } from './page';

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
}, 300_000);

afterAll(() => {
  if (out !== '') rmSync(out, { recursive: true, force: true });
});

describe('The viewer’s bundle', () => {
  it('is one script and one stylesheet', () => {
    expect(readdirSync(out).sort()).toEqual(['modules.json', 'viewer.css', 'viewer.js']);
    expect(script.length).toBeGreaterThan(0);
    expect(style.length).toBeGreaterThan(0);
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
    const held = modules.filter((path) =>
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
});
