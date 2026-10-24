import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatProjectProblem,
  loadProject,
  locateProblems,
  readProjectFiles,
  type LoadProjectResult,
} from './project';

const SAMPLE = fileURLToPath(new URL('../../../examples/my-systems', import.meta.url));

const projectFile = (packages: string[] = []) => ({
  schemaVersion: 1,
  name: 'Test project',
  packages,
});
const modelFile = () => ({
  world: { id: 'world', component: 'essence', name: 'World' },
  elements: [],
  relations: [],
});
const packageFile = (id: string) => ({ id, name: id, components: [], relationTypes: [] });
const viewFile = (id: string) => ({
  id,
  name: id,
  perspective: { name: 'Data flow' },
  nestingRelationTypes: [],
  positions: [],
  freeShapes: [],
});
const scenarioFile = (id: string, view = 'overview') => ({ id, name: id, view, steps: [] });

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-project-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Writes files into the test folder: JSON values are serialized, strings and bytes written as they are. */
async function write(files: Record<string, unknown>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(folder, path);
    await mkdir(dirname(file), { recursive: true });
    const data =
      typeof content === 'string' || content instanceof Uint8Array
        ? content
        : JSON.stringify(content, null, 2);
    await writeFile(file, data);
  }
}

function errorsOf(result: LoadProjectResult) {
  if (result.ok) throw new Error('Expected the project to fail to load.');
  return result.errors;
}

function loadedOf(result: LoadProjectResult) {
  if (!result.ok) throw new Error(`Expected the project to load: ${JSON.stringify(result.errors)}`);
  return result;
}

function snapshotOf(result: LoadProjectResult) {
  return loadedOf(result).project;
}

describe('loadProject', () => {
  it('loads the sample project', async () => {
    const project = snapshotOf(await loadProject(SAMPLE));

    expect(project.project.name).toBe('My systems');
    expect(project.project.packages).toEqual(['systems', 'clinic']);
    expect(project.model.world.id).toBe('world');
    expect(project.model.elements).toHaveLength(8);
    expect(project.model.relations).toHaveLength(12);
    expect(project.packages.map((p) => p.id)).toEqual(['systems', 'clinic']);
    expect(project.views.map((view) => view.id)).toEqual(['system-overview']);
    expect(project.scenarios.map((scenario) => scenario.id)).toEqual(['patient-books-appointment']);
  });

  it('opens the sample without warnings', async () => {
    expect(loadedOf(await loadProject(SAMPLE)).warnings).toEqual([]);
  });

  it('holds each file exactly as written', async () => {
    const model = {
      ...modelFile(),
      elements: [{ id: 'api', component: 'essence', name: 'API', attributes: { latencyMs: 12 } }],
    };
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': model,
      'packages/shop.vapackage': packageFile('shop'),
      'views/overview.vaview': viewFile('overview'),
      'scenarios/request.vascenario': scenarioFile('request'),
    });

    expect(snapshotOf(await loadProject(folder))).toEqual({
      project: projectFile(['shop']),
      model,
      packages: [packageFile('shop')],
      views: [viewFile('overview')],
      scenarios: [scenarioFile('request')],
    });
  });

  it('treats a missing packages, views or scenarios folder as holding none', async () => {
    await write({ 'project.vaproject': projectFile(), 'model.vamodel': modelFile() });

    const project = snapshotOf(await loadProject(folder));
    expect(project.packages).toEqual([]);
    expect(project.views).toEqual([]);
    expect(project.scenarios).toEqual([]);
  });

  it('keeps the packages in the order the project lists them, and leaves out unlisted ones', async () => {
    await write({
      'project.vaproject': projectFile(['zeta', 'alpha']),
      'model.vamodel': modelFile(),
      'packages/a.vapackage': packageFile('alpha'),
      'packages/b.vapackage': packageFile('unlisted'),
      'packages/c.vapackage': packageFile('zeta'),
    });

    const project = snapshotOf(await loadProject(folder));
    expect(project.packages.map((p) => p.id)).toEqual(['zeta', 'alpha']);
  });

  it('sorts views and scenarios by file path', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': modelFile(),
      'views/b.vaview': viewFile('first-id'),
      'views/a.vaview': viewFile('second-id'),
      'scenarios/2-later.vascenario': scenarioFile('one', 'first-id'),
      'scenarios/1-earlier.vascenario': scenarioFile('two', 'first-id'),
    });

    const project = snapshotOf(await loadProject(folder));
    expect(project.views.map((view) => view.id)).toEqual(['second-id', 'first-id']);
    expect(project.scenarios.map((scenario) => scenario.id)).toEqual(['two', 'one']);
  });

  it('reads only the files of each kind in their own place', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': modelFile(),
      'README.md': '# Not a project file',
      'views/overview.vaview': viewFile('overview'),
      'views/notes.txt': 'not a view',
      'views/old/archived.vaview': viewFile('archived'),
      'views/folder.vaview/inner.vaview': viewFile('inner'),
      'views/overview.vaview.bak': '{',
      'views/.overview.vaview.0a1b2c3d4e5f.va-tmp': '{',
      'scenarios/request.vascenario': scenarioFile('request'),
      'stray.vaview': viewFile('stray'),
    });

    const project = snapshotOf(await loadProject(folder));
    expect(project.views.map((view) => view.id)).toEqual(['overview']);
    expect(project.scenarios.map((scenario) => scenario.id)).toEqual(['request']);
  });

  it('reads a file that starts with a byte order mark', async () => {
    await write({
      'project.vaproject': String.fromCharCode(0xfeff) + JSON.stringify(projectFile()),
      'model.vamodel': modelFile(),
    });

    expect(snapshotOf(await loadProject(folder)).project).toEqual(projectFile());
  });

  it('changes nothing in the folder', async () => {
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': modelFile(),
      'packages/shop.vapackage': packageFile('shop'),
      'views/overview.vaview': viewFile('overview'),
    });
    const before = await contentsOf(folder);

    await loadProject(folder);

    expect(await contentsOf(folder)).toEqual(before);
  });

  it('reports a folder without a .vaproject file', async () => {
    await write({ 'model.vamodel': modelFile() });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: '.',
        pointer: '',
        message: 'The folder has no .vaproject file; a project has exactly one.',
      },
    ]);
  });

  it('reports a folder without a .vamodel file', async () => {
    await write({ 'project.vaproject': projectFile() });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: '.',
        pointer: '',
        message: 'The folder has no .vamodel file; a project has exactly one.',
      },
    ]);
  });

  it('reports a folder with two .vamodel files', async () => {
    await write({
      'project.vaproject': projectFile(),
      'b.vamodel': modelFile(),
      'a.vamodel': modelFile(),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: '.',
        pointer: '',
        message:
          'The folder has 2 .vamodel files (a.vamodel, b.vamodel); a project has exactly one.',
      },
    ]);
  });

  it('reports a folder with two .vaproject files', async () => {
    await write({
      'one.vaproject': projectFile(),
      'two.vaproject': projectFile(),
      'model.vamodel': modelFile(),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: '.',
        pointer: '',
        message:
          'The folder has 2 .vaproject files (one.vaproject, two.vaproject); a project has exactly one.',
      },
    ]);
  });

  it('reports a JSON syntax error with the path of its file', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': modelFile(),
      'views/broken.vaview': '{ "id": "broken", ',
    });

    const errors = errorsOf(await loadProject(folder));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'views/broken.vaview', pointer: '' });
    expect(errors[0]?.message).toMatch(/^Not valid JSON: /);
  });

  it('reports a file that is not UTF-8', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': Uint8Array.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      { file: 'model.vamodel', pointer: '', message: 'The file is not valid UTF-8.' },
    ]);
  });

  it('reports a listed package that has no file', async () => {
    await write({
      'project.vaproject': projectFile(['shop', 'neuroscience']),
      'model.vamodel': modelFile(),
      'packages/shop.vapackage': packageFile('shop'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'project.vaproject',
        pointer: '/packages/1',
        message:
          'The package "neuroscience" is listed, but neither packages/ nor the built-in packages hold it.',
      },
    ]);
  });

  it('takes a listed package that packages/ does not hold from the built-in ones', async () => {
    await write({
      'project.vaproject': projectFile(['systems', 'shop']),
      'model.vamodel': modelFile(),
      'packages/shop.vapackage': packageFile('shop'),
    });

    const project = snapshotOf(await loadProject(folder));
    expect(project.packages.map((file) => file.id)).toEqual(['systems', 'shop']);
    expect(project.packages[0]?.components.map((component) => component.id)).toContain(
      'systems.service',
    );
  });

  it('refuses a package of the project that takes the id of a built-in one', async () => {
    await write({
      'project.vaproject': projectFile(['systems']),
      'model.vamodel': modelFile(),
      'packages/systems.vapackage': packageFile('systems'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'packages/systems.vapackage',
        pointer: '/id',
        message: 'The package "systems" is built into Visual Anything; give this one another id.',
      },
    ]);
  });

  it('reports a package listed twice', async () => {
    await write({
      'project.vaproject': projectFile(['shop', 'shop']),
      'model.vamodel': modelFile(),
      'packages/shop.vapackage': packageFile('shop'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'project.vaproject',
        pointer: '/packages',
        message: 'must not have duplicate items (items 0 and 1 are the same)',
      },
    ]);
  });

  it('reports duplicate view ids on every file after the first', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': modelFile(),
      'views/a.vaview': viewFile('overview'),
      'views/b.vaview': viewFile('overview'),
      'views/c.vaview': viewFile('overview'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'views/b.vaview',
        pointer: '/id',
        message: 'The view id "overview" is already used by views/a.vaview.',
      },
      {
        file: 'views/c.vaview',
        pointer: '/id',
        message: 'The view id "overview" is already used by views/a.vaview.',
      },
    ]);
  });

  it('reports duplicate package ids and duplicate scenario ids', async () => {
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': modelFile(),
      'packages/one.vapackage': packageFile('shop'),
      'packages/two.vapackage': packageFile('shop'),
      'scenarios/one.vascenario': scenarioFile('request'),
      'scenarios/two.vascenario': scenarioFile('request'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'packages/two.vapackage',
        pointer: '/id',
        message: 'The package id "shop" is already used by packages/one.vapackage.',
      },
      {
        file: 'scenarios/two.vascenario',
        pointer: '/id',
        message: 'The scenario id "request" is already used by scenarios/one.vascenario.',
      },
    ]);
  });

  it('collects every error before returning', async () => {
    await write({
      'project.vaproject': projectFile(['missing']),
      'model.vamodel': '[',
      'views/a.vaview': viewFile('overview'),
      'views/b.vaview': viewFile('overview'),
      'scenarios/broken.vascenario': '',
    });

    expect(errorsOf(await loadProject(folder)).map((error) => error.file)).toEqual([
      'project.vaproject',
      'model.vamodel',
      'views/b.vaview',
      'scenarios/broken.vascenario',
    ]);
  });

  it('reports a views entry that is not a folder', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': modelFile(),
      views: 'not a folder',
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      { file: 'views', pointer: '', message: 'views is not a folder; .vaview files go in views/.' },
    ]);
  });

  it('reports a folder that does not exist', async () => {
    const missing = join(folder, 'missing');

    const errors = errorsOf(await loadProject(missing));
    expect(errors).toEqual([
      {
        file: '.',
        pointer: '',
        message: `The folder ${missing.replaceAll('\\', '/')} does not exist.`,
      },
    ]);
  });

  it('reports a path that is a file rather than a folder', async () => {
    await write({ 'project.vaproject': projectFile() });
    const file = join(folder, 'project.vaproject');

    expect(errorsOf(await loadProject(file))).toEqual([
      { file: '.', pointer: '', message: `${file.replaceAll('\\', '/')} is not a folder.` },
    ]);
  });
});

describe('loadProject with the rules of the core', () => {
  it('refuses a project that breaks them, reporting each error against its file', async () => {
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': {
        ...modelFile(),
        elements: [
          { id: 'api', component: 'shop.service', name: 'API' },
          { id: 'ghost', component: 'shop.missing', name: 'Ghost' },
        ],
        relations: [{ id: 'calls', relationType: 'relates-to', from: 'api', to: 'nowhere' }],
      },
      'packages/shop.vapackage': {
        ...packageFile('shop'),
        components: [
          { id: 'shop.service', name: 'Service', derivesFrom: 'essence' },
          { id: 'shop.stray', name: 'Stray', derivesFrom: 'shop.unknown' },
        ],
      },
      'views/overview.vaview': viewFile('overview'),
      'scenarios/request.vascenario': scenarioFile('request', 'elsewhere'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'model.vamodel',
        pointer: '/elements/1',
        message:
          'The element "Ghost" is created from "shop.missing", which no package in use defines.',
      },
      {
        file: 'model.vamodel',
        pointer: '/relations/0',
        message:
          'The relation "calls" ends on "nowhere", which is no element or relation of the model.',
      },
      {
        file: 'packages/shop.vapackage',
        pointer: '/components/1',
        message:
          'The component "shop.stray" derives from "shop.unknown", which no package in use defines.',
      },
      {
        file: 'scenarios/request.vascenario',
        pointer: '',
        message: 'The scenario "request" plays over "elsewhere", which is no view of the project.',
      },
    ]);
  });

  it('reports a containment cycle once, against the whole model file', async () => {
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': {
        ...modelFile(),
        elements: [
          { id: 'a', component: 'essence', name: 'A' },
          { id: 'b', component: 'essence', name: 'B' },
        ],
        relations: [
          { id: 'a-in-b', relationType: 'shop.inside', from: 'a', to: 'b' },
          { id: 'b-in-a', relationType: 'shop.inside', from: 'b', to: 'a' },
        ],
      },
      'packages/shop.vapackage': {
        ...packageFile('shop'),
        relationTypes: [
          { id: 'shop.inside', name: 'is inside', derivesFrom: 'relates-to', nests: true },
        ],
      },
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'model.vamodel',
        pointer: '',
        message: 'Containment forms a cycle: "A" inside "B".',
      },
    ]);
  });

  it('reports a problem that spans packages against each of their files', async () => {
    await write({
      'project.vaproject': projectFile(['one', 'two']),
      'model.vamodel': modelFile(),
      'packages/one.vapackage': {
        ...packageFile('one'),
        components: [{ id: 'one.x', name: 'X', derivesFrom: 'two.y' }],
      },
      'packages/two.vapackage': {
        ...packageFile('two'),
        components: [{ id: 'two.y', name: 'Y', derivesFrom: 'one.x' }],
      },
    });

    const message = 'The components "one.x", "two.y" derive from each other in a cycle.';
    expect(errorsOf(await loadProject(folder))).toEqual([
      { file: 'packages/one.vapackage', pointer: '/components/0', message },
      { file: 'packages/two.vapackage', pointer: '/components/0', message },
    ]);
  });

  it('places a problem about a definition in its package, even when an element shares its id', async () => {
    await write({
      'project.vaproject': projectFile(['shop']),
      'model.vamodel': {
        ...modelFile(),
        elements: [{ id: 'shop.box', component: 'essence', name: 'A box' }],
      },
      'packages/shop.vapackage': {
        ...packageFile('shop'),
        components: [{ id: 'shop.box', name: 'Box', derivesFrom: 'shop.nothing' }],
      },
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'packages/shop.vapackage',
        pointer: '/components/0',
        message:
          'The component "shop.box" derives from "shop.nothing", which no package in use defines.',
      },
    ]);
  });

  it('opens a project that only earns warnings, and reports each against its file', async () => {
    await write({
      'project.vaproject': projectFile(['systems', 'shop']),
      'model.vamodel': {
        ...modelFile(),
        elements: [
          { id: 'patient', component: 'systems.person', name: 'Patient' },
          { id: 'api', component: 'systems.service', name: 'API' },
        ],
        relations: [
          {
            id: 'api-reads-patient',
            relationType: 'systems.reads-from',
            from: 'api',
            to: 'patient',
          },
        ],
      },
      'packages/shop.vapackage': {
        ...packageFile('shop'),
        components: [{ id: 'other.thing', name: 'Thing', derivesFrom: 'essence' }],
      },
      'views/overview.vaview': {
        ...viewFile('overview'),
        nestingRelationTypes: ['systems.communicates-with'],
        positions: [{ element: 'ghost', x: 0, y: 0 }],
      },
    });

    const loaded = loadedOf(await loadProject(folder));
    expect(loaded.warnings).toEqual([
      {
        file: 'model.vamodel',
        pointer: '/elements/0',
        message:
          '"reads from" expects its to end to be "Database" or "Object storage", but "Patient" is not.',
      },
      {
        file: 'packages/shop.vapackage',
        pointer: '/components/0',
        message: 'The component "other.thing" of package "shop" should start with "shop.".',
      },
      {
        file: 'views/overview.vaview',
        pointer: '',
        message: 'The view "overview" is arranged by "communicates with", which does not nest.',
      },
      {
        file: 'views/overview.vaview',
        pointer: '',
        message:
          'The view "overview" keeps a position for "ghost", but the model has no element "ghost"; it is ignored.',
      },
    ]);
  });
});

describe('where each file lives', () => {
  beforeEach(async () => {
    await write({
      'project.vaproject': projectFile(['systems', 'shop', 'tools']),
      'model.vamodel': modelFile(),
      'packages/a.vapackage': packageFile('shop'),
      'packages/tools.vapackage': packageFile('tools'),
      'packages/old.vapackage': packageFile('old'),
      'views/first.vaview': viewFile('overview'),
      'scenarios/s.vascenario': scenarioFile('request'),
      'README.md': 'not a project file',
    });
  });

  it('gives the path of every project file, by id, leaving out built-in packages', async () => {
    expect(loadedOf(await loadProject(folder)).files).toEqual({
      project: 'project.vaproject',
      model: 'model.vamodel',
      packages: new Map([
        ['shop', 'packages/a.vapackage'],
        ['tools', 'packages/tools.vapackage'],
      ]),
      views: new Map([['overview', 'views/first.vaview']]),
      scenarios: new Map([['request', 'scenarios/s.vascenario']]),
      unlistedPackages: new Map([['old', 'packages/old.vapackage']]),
    });
  });

  it('gives the bytes of every project file as read', async () => {
    const { contents } = loadedOf(await loadProject(folder));

    expect([...contents.keys()].sort()).toEqual([
      'model.vamodel',
      'packages/a.vapackage',
      'packages/old.vapackage',
      'packages/tools.vapackage',
      'project.vaproject',
      'scenarios/s.vascenario',
      'views/first.vaview',
    ]);
    for (const [path, bytes] of contents) {
      expect(Buffer.compare(bytes, await readFile(join(folder, path)))).toBe(0);
    }
  });

  it('reads the same files as opening, without opening the project', async () => {
    const { contents } = loadedOf(await loadProject(folder));

    expect(await readProjectFiles(folder)).toEqual(contents);
  });

  it('reads every candidate file, even of a project that does not open', async () => {
    await write({ 'other.vamodel': '{', 'views/broken.vaview': '' });

    expect([...(await readProjectFiles(folder)).keys()].sort()).toEqual([
      'model.vamodel',
      'other.vamodel',
      'packages/a.vapackage',
      'packages/old.vapackage',
      'packages/tools.vapackage',
      'project.vaproject',
      'scenarios/s.vascenario',
      'views/broken.vaview',
      'views/first.vaview',
    ]);
  });

  it('reads nothing from a folder that does not exist', async () => {
    expect(await readProjectFiles(join(folder, 'missing'))).toEqual(new Map());
  });
});

describe('locateProblems', () => {
  it('reports a problem about nothing in particular against the folder', async () => {
    await write({ 'project.vaproject': projectFile(), 'model.vamodel': modelFile() });
    const { project, files } = loadedOf(await loadProject(folder));

    expect(
      locateProblems([{ code: 'invalid-command', message: 'Something.' }], project, files),
    ).toEqual([{ file: '.', pointer: '', message: 'Something.' }]);
  });

  it('reports a problem about something the project lacks against the folder', async () => {
    await write({ 'project.vaproject': projectFile(), 'model.vamodel': modelFile() });
    const { project, files } = loadedOf(await loadProject(folder));

    expect(
      locateProblems(
        [{ code: 'unknown-element', message: 'Gone.', subjects: ['ghost'] }],
        project,
        files,
      ),
    ).toEqual([{ file: '.', pointer: '', message: 'Gone.' }]);
  });
});

describe('formatProjectProblem', () => {
  it('writes the file, the pointer and the message', () => {
    expect(
      formatProjectProblem({ file: 'model.vamodel', pointer: '/elements/0/name', message: 'bad' }),
    ).toBe('model.vamodel /elements/0/name: bad');
  });

  it('leaves the pointer out when the problem concerns the whole file', () => {
    expect(formatProjectProblem({ file: 'views/a.vaview', pointer: '', message: 'bad' })).toBe(
      'views/a.vaview: bad',
    );
  });
});

/** Every file under a folder with its contents, to compare before and after. */
async function contentsOf(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const contents: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    contents[file] = await readFile(file, 'utf8');
  }
  return contents;
}
