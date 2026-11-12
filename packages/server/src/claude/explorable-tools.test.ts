/**
 * Claude's explorable tools (ADR 0107), the whole way from an MCP client through the bridge to the
 * program: write_explorable defines and writes an explorable as one undoable action of Claude's and
 * says whether it runs, never approving it; the person's approval continues over Claude's write;
 * get_item, read_view, list_explorables and read_explorable read explorables; tour steps set an
 * explorable's parameters; request_script_library asks the person through the app before anything
 * is fetched from a stand-in for the npm registry; and capture_explorable answers plainly while no app
 * takes stills of explorables.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  applyPreferenceChanges,
  approvalHashOf,
  explorableTextHash,
  explorablesIn,
  registryAddresses,
  type ExplorableApproval,
  type PreferenceChanges,
  type Preferences,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreferencesStore, SetPreferencesResult } from '../preferences';
import {
  startRegistryStub,
  tarball,
  versionDocument,
  type RegistryStub,
} from '../script-libraries/test/registry-stub';
import { SHOP, testProject, type LiveClient } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

const PAGE = `<!doctype html><html><head><style>svg{width:100%}</style></head><body><svg id="plot"></svg><script>va.on('change', () => va.ready());</script></body></html>`;
const CLAUDES = '<!doctype html><title>By Claude</title><p>A new text.</p>';

const PARAMETERS = [
  { name: 'a', kind: 'number', label: 'Leading coefficient', min: -5, max: 5, default: 1 },
  { name: 'b', kind: 'number', min: -10, max: 10, default: 0 },
  { name: 'c', kind: 'number', min: -10, max: 10, default: 0 },
];

let tools: ToolHarness | undefined;
let stub: RegistryStub | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
  await stub?.close();
  stub = undefined;
});

/** A store in memory, as the person's preferences file holds them. */
class Store implements PreferencesStore {
  preferences: Preferences;

  constructor(approvals: ExplorableApproval[] = []) {
    this.preferences = { ...DEFAULT_PREFERENCES, explorableApprovals: approvals };
  }

  current(): Preferences {
    return applyPreferenceChanges(this.preferences, {});
  }

  set(changes: PreferenceChanges): Promise<SetPreferencesResult> {
    this.preferences = applyPreferenceChanges(this.preferences, changes);
    return Promise.resolve({ preferences: this.current(), saved: true });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function approvalOf(text: string): string {
  return approvalHashOf(explorableTextHash(text), []);
}

/** The test project with the explorable "Quadratic" in its own package, its file holding PAGE. */
function withExplorable(): ProjectSnapshot {
  const project = testProject();
  const shop: PackageFile = {
    ...SHOP,
    explorables: [
      {
        id: 'shop.quadratic',
        name: 'Quadratic',
        description: 'The parabola $y = ax^2 + bx + c$.',
        file: 'quadratic.html',
        parameters: PARAMETERS as never,
        api: 1,
        hash: explorableTextHash(PAGE),
      },
    ],
  };
  return {
    ...project,
    packages: project.packages.map((each) => (each.id === 'shop' ? shop : each)),
    explorableTexts: [{ id: 'shop.quadratic', text: PAGE }],
  };
}

async function harness(
  project: ProjectSnapshot = testProject(),
  store: Store = new Store(),
): Promise<ToolHarness> {
  tools = await startToolHarness(project, { preferences: store });
  return tools;
}

describe('write_explorable', () => {
  it('defines a new explorable as one undoable action of Claude’s, writes its file, and says it waits for the person', async () => {
    const tools = await harness();
    const answer = await tools.value('write_explorable', {
      package: 'shop',
      name: 'Quadratic',
      description: 'The parabola $y = ax^2 + bx + c$.',
      parameters: PARAMETERS,
      text: PAGE,
    });
    expect(answer).toMatchObject({
      done: 'Add the explorable "Quadratic"',
      undo: 'The person can undo it in the app.',
      explorable: expect.stringMatching(/^shop\.quadratic-[0-9a-z]{6}$/) as string,
      file: 'explorables/quadratic.html',
      approved: false,
    });
    expect(String(answer.approval)).toMatch(/^not-approved: .*You cannot approve it/);
    expect(String(answer.shown)).toMatch(/^Nothing shows it yet\. Show it with set_appearance/);
    expect(tools.session.history.undo).toEqual({
      label: 'Add the explorable "Quadratic"',
      author: 'claude',
    });
    await tools.session.idle();
    expect(
      await readFile(join(tools.session.folder, 'explorables', 'quadratic.html'), 'utf8'),
    ).toBe(PAGE);
    const defined = explorablesIn(tools.session.snapshot).explorable(answer.explorable as string);
    expect(defined?.definition).toMatchObject({ api: 1, hash: explorableTextHash(PAGE) });
  });

  it('replaces the text and what it declares of one that exists, as one action', async () => {
    const tools = await harness(withExplorable());
    const answer = await tools.value('write_explorable', {
      id: 'shop.quadratic',
      parameters: [...PARAMETERS, { name: 'grid', kind: 'boolean', default: true }],
      text: CLAUDES,
    });
    expect(answer.done).toBe('Write the explorable "Quadratic"');
    expect(tools.session.actions).toHaveLength(1);
    const defined = explorablesIn(tools.session.snapshot).explorable('shop.quadratic');
    expect(defined?.definition.parameters).toHaveLength(4);
    expect(defined?.definition.hash).toBe(explorableTextHash(CLAUDES));
  });

  it('continues the person’s approval when it writes over an approved text, and never approves a new one', async () => {
    const store = new Store([
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    const tools = await harness(withExplorable(), store);
    expect(await tools.value('read_explorable', { id: 'shop.quadratic' })).toMatchObject({
      approved: true,
      content: PAGE,
    });
    const rewritten = await tools.value('write_explorable', {
      id: 'shop.quadratic',
      text: CLAUDES,
    });
    expect(rewritten).toMatchObject({ approved: true });
    expect(store.current().explorableApprovals[0]).toEqual({
      hash: approvalOf(CLAUDES),
      explorable: 'shop.quadratic',
      by: 'claude',
    });

    // A new explorable asks the first time; approvals go by the hash of what runs, so a new one
    // with a text approved already runs, as it would in any project.
    const added = await tools.value('write_explorable', {
      id: 'shop.sine',
      package: 'shop',
      name: 'Sine',
      file: 'sine.html',
      text: '<!doctype html><title>Sine</title>',
    });
    expect(added).toMatchObject({ explorable: 'shop.sine', approved: false });
  });

  it('refuses a text past 512 KiB, a built-in package, a new one without its text, and another file', async () => {
    const tools = await harness(withExplorable());
    expect(
      await tools.failure('write_explorable', {
        package: 'shop',
        name: 'Huge',
        text: 'x'.repeat(512 * 1024 + 1),
      }),
    ).toMatch(/^Not written: the text takes 524289 bytes, past 512 KiB/);
    expect(
      await tools.failure('write_explorable', { package: 'systems', name: 'X', text: PAGE }),
    ).toMatch(/built-in package/);
    expect(await tools.failure('write_explorable', { package: 'shop', name: 'X' })).toBe(
      'Not written: a new explorable needs its text.',
    );
    expect(
      await tools.failure('write_explorable', { id: 'shop.quadratic', file: 'other.html' }),
    ).toBe('Not written: "Quadratic" keeps its file, explorables/quadratic.html.');
    expect(await tools.failure('write_explorable', { id: 'shop.quadratic' })).toMatch(
      /^Not written: give what to write/,
    );
    expect(tools.session.actions).toEqual([]);
  });

  it('teaches the va API, the theme’s variables, one file, no network or eval, script libraries, Math and approval', async () => {
    const { TOOLS } = await import('./tools');
    const description = TOOLS.find((each) => each.name === 'write_explorable')?.description ?? '';
    for (const said of [
      "va.on('change', data => …)",
      'va.ready()',
      'va.select(id)',
      'va.onStill',
      '--va-text',
      'One self-contained HTML file',
      'data: addresses',
      'No eval and no new Function',
      'd3.csvParseRows',
      'function-plot given formulas as strings',
      'JSXGraph',
      'UMD or IIFE',
      'three.js',
      'KaTeX',
      'you never approve one',
    ]) {
      expect(description, said).toContain(said);
    }
  });
});

describe('reading explorables', () => {
  it('get_item reads the explorable an element shows, its parameters and whether it runs; read_view lists explorable shapes', async () => {
    const tools = await harness(withExplorable());
    await tools.value('set_appearance', {
      component: 'shop.cart',
      appearanceTraits: { explorable: { explorable: 'shop.quadratic' } },
    });
    const placed = await tools.value('add_explorable_shape', {
      view: 'overview',
      explorable: 'shop.quadratic',
      x: 600,
      y: 40,
      element: 'cart',
    });
    const item = await tools.value('get_item', { id: 'cart' });
    expect(item.explorable).toMatchObject({
      id: 'shop.quadratic',
      name: 'Quadratic',
      from: 'component',
      file: 'explorables/quadratic.html',
      api: 1,
      parameters: [
        { name: 'a', kind: 'number', label: 'Leading coefficient', min: -5, max: 5, default: 1 },
        { name: 'b', kind: 'number', min: -10, max: 10, default: 0 },
        { name: 'c', kind: 'number', min: -10, max: 10, default: 0 },
      ],
      approved: false,
    });
    expect(item.explorableShapes).toEqual([
      { view: 'overview', shape: placed.shape, explorable: 'shop.quadratic' },
    ]);
    const view = await tools.value('read_view', { view: 'overview' });
    expect(view.explorables).toEqual([
      {
        id: placed.shape,
        explorable: 'shop.quadratic',
        name: 'Quadratic',
        x: 600,
        y: 40,
        width: 480,
        height: 320,
        element: 'cart',
        elementName: 'Cart',
      },
    ]);
    const listed = await tools.value('list_explorables');
    expect(listed.explorables).toMatchObject([
      {
        id: 'shop.quadratic',
        package: 'shop',
        text: `${Buffer.byteLength(PAGE)} bytes`,
        shownBy: [
          { kind: 'component', id: 'shop.cart' },
          { kind: 'shape', id: placed.shape, view: 'overview' },
        ],
        approved: false,
      },
    ]);
  });
});

describe('a tour step’s explorable', () => {
  it('sets an explorable’s parameters, reads back, refuses a value out of range, and goes with null', async () => {
    const tools = await harness(withExplorable());
    const created = await tools.value('create_tour', {
      name: 'Playing with a, b and c',
      steps: [
        {
          viewState: { view: 'overview' },
          title: 'Opening down',
          explorable: { id: 'shop.quadratic', parameters: { a: -1, c: 4 } },
        },
      ],
    });
    const tour = created.tour as string;
    const steps = () => tools.session.snapshot.tours.find((each) => each.id === tour)?.steps ?? [];
    expect(steps()[0]?.explorable).toEqual({
      id: 'shop.quadratic',
      parameters: { a: -1, c: 4 },
    });
    await tools.value('add_tour_step', {
      tour,
      viewState: { view: 'overview' },
      title: 'Simplest',
      explorable: { id: 'shop.quadratic' },
    });
    expect(steps()[1]?.explorable).toEqual({ id: 'shop.quadratic' });
    expect(await tools.value('get_item', { id: 'cart' })).not.toHaveProperty('explorable');
    const listed = await tools.value('read_explorable', { id: 'shop.quadratic' });
    expect(listed.tourSteps).toEqual([
      { tour, step: steps()[0]?.id, number: 1, parameters: { a: -1, c: 4 } },
      { tour, step: steps()[1]?.id, number: 2, parameters: {} },
    ]);
    expect(
      await tools.failure('update_tour_step', {
        tour,
        step: 1,
        explorable: { id: 'shop.quadratic', parameters: { a: 50 } },
      }),
    ).toMatch(/^Refused, so nothing changed: /);
    await tools.value('update_tour_step', { tour, step: 1, explorable: null });
    expect(steps()[0]).not.toHaveProperty('explorable');
  });
});

describe('request_script_library', () => {
  const D3 = `(function (global, factory) { factory(global.d3 = global.d3 || {}); })(this, function (exports) { exports.version = "7.9.0"; });`;

  async function withRegistry(files: Record<string, string>, fields: Record<string, unknown>) {
    const bytes = tarball(files);
    const { document, tarball: tarballUrl } = registryAddresses('d3', '7.9.0');
    stub = await startRegistryStub(
      new Map([
        [new URL(document).pathname, { body: versionDocument('d3', '7.9.0', bytes, fields) }],
        [new URL(tarballUrl).pathname, { body: bytes }],
      ]),
    );
    tools = await startToolHarness(testProject(), {
      preferences: new Store(),
      registry: { request: stub.request, resolve: stub.resolve },
    });
    return tools;
  }

  /** Answers the first consent the app is asked for. */
  async function consent(app: LiveClient, approved: boolean): Promise<void> {
    await vi.waitFor(() =>
      expect(app.messages.some((message) => message.type === 'script-library/consent')).toBe(true),
    );
    const asked = app.messages.find((message) => message.type === 'script-library/consent');
    if (asked?.type !== 'script-library/consent') throw new Error('No consent asked.');
    expect(asked).toMatchObject({ asker: 'claude', npm: 'd3', version: '7.9.0' });
    app.send({ type: 'script-library/consented', requestId: asked.requestId, approved });
  }

  const ASK = { package: 'shop', npm: 'd3', version: '7.9.0', path: 'dist/d3.min.js' };

  it('asks the person through the app, then keeps it as an action of Claude’s', async () => {
    const tools = await withRegistry(
      { 'package.json': '{"name":"d3"}', 'dist/d3.min.js': D3 },
      { license: 'ISC' },
    );
    const app = await tools.openApp();
    const asking = tools.value('request_script_library', ASK);
    await consent(app, true);
    expect(await asking).toMatchObject({
      kept: 'shop.d3',
      npm: 'd3',
      version: '7.9.0',
      global: 'd3',
      license: 'ISC',
      next: 'Name "shop.d3" in write_explorable\'s scriptLibraries; its page then reads the global d3.',
    });
    expect(tools.session.history.undo).toMatchObject({ author: 'claude' });
  });

  it('fetches nothing when the person refuses, or when no app is open to ask', async () => {
    const tools = await withRegistry({ 'dist/d3.min.js': D3 }, {});
    expect(await tools.failure('request_script_library', ASK)).toMatch(
      /^Not kept: The script library "d3" 7.9.0 is not fetched: no app is open to ask you first\. \(fetch-refused\)$/,
    );
    const app = await tools.openApp();
    const asking = tools.failure('request_script_library', ASK);
    await consent(app, false);
    expect(await asking).toMatch(/you did not approve it/);
    expect(stub?.asked).toEqual([]);
    expect(await tools.failure('request_script_library', { ...ASK, package: 'systems' })).toMatch(
      /^Not asked: "systems" is a built-in package/,
    );
  });

  it('refuses an ES module, as three.js is, saying what version 1 takes', async () => {
    const tools = await withRegistry(
      { 'package.json': '{"name":"d3","type":"module"}', 'dist/d3.min.js': 'export const x = 1;' },
      { type: 'module' },
    );
    const app = await tools.openApp();
    const asking = tools.failure('request_script_library', ASK);
    await consent(app, true);
    expect(await asking).toMatch(
      /ES module, which the frame cannot load.*\(invalid-script-library\) Version 1 takes only one file that sets a global, a UMD or IIFE build/,
    );
  });
});

describe('capture_explorable', () => {
  it('answers that one not approved does not run, and that no app is open to take its still', async () => {
    const tools = await harness(withExplorable());
    expect(await tools.failure('capture_explorable', { explorable: 'shop.quadratic' })).toMatch(
      /^"Quadratic" is not approved, so it does not run and has no still: .*Only the person can approve it/,
    );
    await tools.close();
    const approved = new Store([
      { hash: approvalOf(PAGE), explorable: 'shop.quadratic', by: 'person' },
    ]);
    const again = await harness(withExplorable(), approved);
    expect(
      await again.failure('capture_explorable', {
        explorable: 'shop.quadratic',
        parameters: { a: -1 },
        width: 1024,
      }),
    ).toMatch(/^No app has the project open, so there is no still/);
    expect(await again.failure('capture_explorable', { explorable: 'shop.nothing' })).toBe(
      'No package in use defines the explorable "shop.nothing". list_explorables lists them.',
    );
  });
});
