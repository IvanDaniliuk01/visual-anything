import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatProjectError, loadProject, type LoadProjectResult } from './project';

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
const scenarioFile = (id: string) => ({ id, name: id, view: 'overview', steps: [] });

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

function snapshotOf(result: LoadProjectResult) {
  if (!result.ok) throw new Error(`Expected the project to load: ${JSON.stringify(result.errors)}`);
  return result.project;
}

describe('loadProject', () => {
  it('loads the sample project', async () => {
    const project = snapshotOf(await loadProject(SAMPLE));

    expect(project.project.name).toBe('My systems');
    expect(project.project.packages).toEqual(['systems']);
    expect(project.model.world.id).toBe('world');
    expect(project.model.elements).toHaveLength(8);
    expect(project.model.relations).toHaveLength(12);
    expect(project.packages.map((p) => p.id)).toEqual(['systems']);
    expect(project.views.map((view) => view.id)).toEqual(['system-overview']);
    expect(project.scenarios.map((scenario) => scenario.id)).toEqual(['patient-books-appointment']);
  });

  it('holds each file exactly as written', async () => {
    const model = {
      ...modelFile(),
      elements: [{ id: 'api', component: 'essence', name: 'API', attributes: { latencyMs: 12 } }],
    };
    await write({
      'project.vaproject': projectFile(['systems']),
      'model.vamodel': model,
      'packages/systems.vapackage': packageFile('systems'),
      'views/overview.vaview': viewFile('overview'),
      'scenarios/request.vascenario': scenarioFile('request'),
    });

    expect(snapshotOf(await loadProject(folder))).toEqual({
      project: projectFile(['systems']),
      model,
      packages: [packageFile('systems')],
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
      'scenarios/2-later.vascenario': scenarioFile('one'),
      'scenarios/1-earlier.vascenario': scenarioFile('two'),
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
      'project.vaproject': projectFile(['systems']),
      'model.vamodel': modelFile(),
      'packages/systems.vapackage': packageFile('systems'),
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
      'project.vaproject': projectFile(['systems', 'neuroscience']),
      'model.vamodel': modelFile(),
      'packages/systems.vapackage': packageFile('systems'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'project.vaproject',
        pointer: '/packages/1',
        message: 'The package "neuroscience" is listed, but no file in packages/ holds it.',
      },
    ]);
  });

  it('reports a package listed twice', async () => {
    await write({
      'project.vaproject': projectFile(['systems', 'systems']),
      'model.vamodel': modelFile(),
      'packages/systems.vapackage': packageFile('systems'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'project.vaproject',
        pointer: '/packages/1',
        message: 'The package "systems" is listed more than once.',
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
      'project.vaproject': projectFile(['systems']),
      'model.vamodel': modelFile(),
      'packages/one.vapackage': packageFile('systems'),
      'packages/two.vapackage': packageFile('systems'),
      'scenarios/one.vascenario': scenarioFile('request'),
      'scenarios/two.vascenario': scenarioFile('request'),
    });

    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'packages/two.vapackage',
        pointer: '/id',
        message: 'The package id "systems" is already used by packages/one.vapackage.',
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

describe('formatProjectError', () => {
  it('writes the file, the pointer and the message', () => {
    expect(
      formatProjectError({ file: 'model.vamodel', pointer: '/elements/0/name', message: 'bad' }),
    ).toBe('model.vamodel /elements/0/name: bad');
  });

  it('leaves the pointer out when the error concerns the whole file', () => {
    expect(formatProjectError({ file: 'views/a.vaview', pointer: '', message: 'bad' })).toBe(
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
