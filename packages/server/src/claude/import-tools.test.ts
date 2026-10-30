/**
 * Claude's import tools (ADR-0042): `preview_import` says what an import would do and changes nothing;
 * `import_file` imports the content Claude passes as one action of Claude's, and answers what it
 * created and what matched nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILES_ON_DISK, IMPORT_TOOLS } from './import-tools';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const FLOWCHART = 'flowchart LR\n  shop[Shop] --> db[(Orders)]\n  click shop "https://example.com"';

describe('a file on the person’s disk', () => {
  it('is never read by a path Claude names: the tools say to pass it, or to run the import command', () => {
    for (const each of IMPORT_TOOLS) {
      expect(each.description).toContain(FILES_ON_DISK);
      // Content, never a path: nothing the tools take names a file.
      expect(Object.keys(each.input).filter((key) => /path|file|url/i.test(key))).toEqual([]);
    }
    expect(FILES_ON_DISK).toContain('visual-anything import <folder> <file>');
    expect(FILES_ON_DISK).toMatch(/never reads a path you name/);
  });
});

describe('preview_import', () => {
  it('says what an import would do, with the kinds and the mapping, and changes nothing', async () => {
    const before = tools.session.snapshot;
    const result = await tools.value('preview_import', {
      name: 'checkout.mmd',
      content: FLOWCHART,
    });
    expect(result).toMatchObject({
      format: 'mermaid-flowchart',
      creates: { elements: 2, relations: 1, views: 1 },
      kinds: {
        elements: [
          { kind: 'rectangle', label: '[ ]', count: 1, mapsTo: 'systems.box' },
          { kind: 'cylinder', label: '[( )]', count: 1, mapsTo: 'systems.database' },
        ],
        relations: [{ kind: 'arrow', count: 1, mapsTo: 'systems.communicates-with' }],
      },
      matchedNothing: [
        {
          text: 'click shop "https://example.com"',
          why: 'Web addresses and callbacks are never followed.',
        },
      ],
    });
    expect(tools.session.snapshot).toBe(before);
  });

  it('refuses what cannot be read, or a kind the file does not have', async () => {
    expect(await tools.failure('preview_import', { content: 'Just words.' })).toMatch(
      /^It cannot be imported: Visual Anything cannot tell what this file is: name its format.$/,
    );
    expect(
      await tools.failure('preview_import', {
        name: 'a.mmd',
        content: FLOWCHART,
        map: { triangle: 'systems.box' },
      }),
    ).toMatch(/The file has no kind "triangle"/);
  });
});

describe('import_file', () => {
  it('imports as one action of Claude’s, with the mapping asked for', async () => {
    const result = await tools.value('import_file', {
      name: 'checkout.mmd',
      content: FLOWCHART,
      map: { cylinder: 'systems.object-storage' },
    });
    expect(result).toMatchObject({
      done: 'Import "checkout.mmd"',
      undo: 'The person can undo it in the app.',
      created: { elements: 2, relations: 1, views: 1 },
    });
    expect(tools.session.actions.at(-1)).toMatchObject({
      label: 'Import "checkout.mmd"',
      author: 'claude',
    });
    const orders = tools.session.snapshot.model.elements.find((each) => each.name === 'Orders');
    expect(orders?.component).toBe('systems.object-storage');
  });

  it('imports a spreadsheet again by its key, updating what it matched', async () => {
    await tools.value('import_file', {
      name: 'owners.csv',
      content: 'id,name,owner\napi,API,Team Z\n',
    });
    const api = tools.session.snapshot.model.elements.find((each) => each.id === 'api');
    expect(api?.attributes).toMatchObject({ owner: 'Team Z' });
  });
});
