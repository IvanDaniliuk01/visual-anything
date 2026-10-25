import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { builtinPackage } from '@visual-anything/core';
import {
  formatProjectProblem,
  loadProject,
  locateProblems,
  readProjectFiles,
  reservedPackageIds,
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
const tourFile = (id: string, view = 'overview') => ({
  id,
  name: id,
  steps: [{ id: 'start', viewState: { view }, caption: { title: 'Start here' } }],
});
const commentFile = (id: string, element = 'world') => ({
  id,
  anchor: { kind: 'element', element },
  comments: [
    {
      id: 'first',
      author: { kind: 'person', name: 'Ana' },
      time: '2026-10-25T09:30:00.000Z',
      text: 'Why here?',
    },
  ],
});

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
    expect(project.tours.map((tour) => tour.id)).toEqual(['how-booking-works']);
    expect(project.comments.map((thread) => thread.id)).toEqual(['reminder-timing']);
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
      'tours/walk.vatour': tourFile('walk'),
      'comments/why.vacomment': commentFile('why'),
    });

    expect(snapshotOf(await loadProject(folder))).toEqual({
      project: projectFile(['shop']),
      model,
      packages: [packageFile('shop')],
      views: [viewFile('overview')],
      scenarios: [scenarioFile('request')],
      tours: [tourFile('walk')],
      comments: [commentFile('why')],
    });
  });

  it('treats a missing packages, views, scenarios, tours or comments folder as holding none', async () => {
    await write({ 'project.vaproject': projectFile(), 'model.vamodel': modelFile() });

    const project = snapshotOf(await loadProject(folder));
    expect(project.packages).toEqual([]);
    expect(project.views).toEqual([]);
    expect(project.scenarios).toEqual([]);
    expect(project.tours).toEqual([]);
    expect(project.comments).toEqual([]);
  });

  // Tours and threads of comments, each in a file of its own (ADR 0058, ADR 0059).
  describe('with tours and comments', () => {
    it('reads each tour and each thread from its folder, by file path, and where it lives', async () => {
      await write({
        'project.vaproject': projectFile(),
        'model.vamodel': modelFile(),
        'views/overview.vaview': viewFile('overview'),
        'tours/b.vatour': tourFile('second'),
        'tours/a.vatour': tourFile('first'),
        'tours/notes.txt': 'not a tour',
        'comments/z.vacomment': commentFile('later'),
        'comments/y.vacomment': commentFile('earlier'),
      });

      const loaded = loadedOf(await loadProject(folder));
      expect(loaded.project.tours.map((tour) => tour.id)).toEqual(['first', 'second']);
      expect(loaded.project.comments.map((thread) => thread.id)).toEqual(['earlier', 'later']);
      expect(loaded.files.tours).toEqual(
        new Map([
          ['first', 'tours/a.vatour'],
          ['second', 'tours/b.vatour'],
        ]),
      );
      expect(loaded.files.comments).toEqual(
        new Map([
          ['earlier', 'comments/y.vacomment'],
          ['later', 'comments/z.vacomment'],
        ]),
      );
      expect([...loaded.contents.keys()]).toEqual(
        expect.arrayContaining(['tours/a.vatour', 'comments/y.vacomment']),
      );
    });

    it('reports a tour or a thread that does not match its schema, at its pointer', async () => {
      await write({
        'project.vaproject': projectFile(),
        'model.vamodel': modelFile(),
        'tours/bad.vatour': {
          id: 'bad',
          name: 'Bad',
          steps: [{ id: 's', caption: { title: 'T' } }],
        },
        'comments/bad.vacomment': { ...commentFile('bad'), comments: [] },
      });

      expect(errorsOf(await loadProject(folder))).toEqual([
        {
          file: 'tours/bad.vatour',
          pointer: '/steps/0',
          message: 'must have the key "viewState"',
        },
        {
          file: 'comments/bad.vacomment',
          pointer: '/comments',
          message: 'must have at least 1 item',
        },
      ]);
    });

    it('reports two tours, or two threads, with one id', async () => {
      await write({
        'project.vaproject': projectFile(),
        'model.vamodel': modelFile(),
        'views/overview.vaview': viewFile('overview'),
        'tours/one.vatour': tourFile('walk'),
        'tours/two.vatour': tourFile('walk'),
        'comments/one.vacomment': commentFile('why'),
        'comments/two.vacomment': commentFile('why'),
      });

      expect(errorsOf(await loadProject(folder))).toEqual([
        {
          file: 'tours/two.vatour',
          pointer: '/id',
          message: 'The tour id "walk" is already used by tours/one.vatour.',
        },
        {
          file: 'comments/two.vacomment',
          pointer: '/id',
          message: 'The thread id "why" is already used by comments/one.vacomment.',
        },
      ]);
    });

    it('refuses a tours or comments name that is a file, not a folder', async () => {
      await write({
        'project.vaproject': projectFile(),
        'model.vamodel': modelFile(),
        tours: 'a file',
        comments: 'another file',
      });

      expect(errorsOf(await loadProject(folder))).toEqual([
        {
          file: 'tours',
          pointer: '',
          message: 'tours is not a folder; .vatour files go in tours/.',
        },
        {
          file: 'comments',
          pointer: '',
          message: 'comments is not a folder; .vacomment files go in comments/.',
        },
      ]);
    });

    it('reads tours and threads in readProjectFiles too', async () => {
      await write({
        'project.vaproject': projectFile(),
        'model.vamodel': modelFile(),
        'tours/walk.vatour': tourFile('walk'),
        'comments/why.vacomment': commentFile('why'),
      });

      expect([...(await readProjectFiles(folder)).keys()].sort()).toEqual([
        'comments/why.vacomment',
        'model.vamodel',
        'project.vaproject',
        'tours/walk.vatour',
      ]);
    });
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
        message:
          'packages/systems.vapackage takes the id "systems", which Visual Anything keeps for its built-in Systems package. Give it another id: change "id" in this file, the start of every component and relation type id in it, and every reference to them, and rename the file to match.',
      },
    ]);
  });

  it('warns about a package of the project whose id is kept for a built-in package to come', async () => {
    const reserved = reservedPackageIds().find((id) => builtinPackage(id) === undefined);
    if (reserved === undefined) return;
    await write({
      'project.vaproject': projectFile([reserved]),
      'model.vamodel': modelFile(),
      [`packages/${reserved}.vapackage`]: packageFile(reserved),
    });

    const { warnings } = loadedOf(await loadProject(folder));
    expect(warnings).toContainEqual({
      file: `packages/${reserved}.vapackage`,
      pointer: '/id',
      message: `packages/${reserved}.vapackage takes the id "${reserved}", which Visual Anything keeps for a built-in package to come. Rename it before that package ships: change "id" in this file, the start of every component and relation type id in it, and every reference to them, and rename the file to match.`,
    });
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

/** Makes a symbolic link or a junction, or says this user may not make one here. */
async function tryLink(target: string, path: string, type: 'file' | 'junction'): Promise<boolean> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await symlink(target, path, type);
    return true;
  } catch {
    return false;
  }
}

const ONLY_REGULAR = 'Visual Anything opens only regular files inside the project folder.';

describe('loadProject reads only regular files within their caps', () => {
  beforeEach(async () => {
    await write({ 'project.vaproject': projectFile(), 'model.vamodel': modelFile() });
  });

  it('refuses a view that is a link to a file outside the folder, as a problem of that file', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      await writeFile(join(outside, 'secret.vaview'), JSON.stringify(viewFile('secret')));
      if (
        !(await tryLink(join(outside, 'secret.vaview'), join(folder, 'views/a.vaview'), 'file'))
      ) {
        context.skip(
          'This user may not make symbolic links here: Windows lets only Developer Mode or an administrator make them.',
        );
      }
      expect(errorsOf(await loadProject(folder))).toEqual([
        { file: 'views/a.vaview', pointer: '', message: `The file is a link; ${ONLY_REGULAR}` },
      ]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a project file that is a junction, as a problem of that file', async (context) => {
    await mkdir(join(folder, 'elsewhere'));
    if (!(await tryLink(join(folder, 'elsewhere'), join(folder, 'views/a.vaview'), 'junction'))) {
      context.skip('This user may not make a link to a folder here.');
    }
    expect(errorsOf(await loadProject(folder))).toEqual([
      { file: 'views/a.vaview', pointer: '', message: `The file is a link; ${ONLY_REGULAR}` },
    ]);
  });

  it('refuses a views folder that is a link, without reading what it points to', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      await writeFile(join(outside, 'secret.vaview'), JSON.stringify(viewFile('secret')));
      if (!(await tryLink(outside, join(folder, 'views'), 'junction')))
        context.skip('This user may not make a link to a folder here.');
      expect(errorsOf(await loadProject(folder))).toEqual([
        {
          file: 'views',
          pointer: '',
          message: `views is a link; Visual Anything opens only real folders and regular files inside the project folder.`,
        },
      ]);
      expect([...(await readProjectFiles(folder)).keys()].sort()).toEqual([
        'model.vamodel',
        'project.vaproject',
      ]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a file that holds more than its kind may', async () => {
    await write({
      'project.vaproject': `${JSON.stringify(projectFile())}${' '.repeat(1024 * 1024)}`,
    });
    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'project.vaproject',
        pointer: '',
        message: 'The file holds more than 1 MiB, the most a file of this kind may hold.',
      },
    ]);
  });

  it('refuses a tour over 8 MiB and a thread over 1 MiB, unread', async () => {
    await write({
      'tours/big.vatour': `${JSON.stringify(tourFile('big'))}${' '.repeat(8 * 1024 * 1024)}`,
      'comments/big.vacomment': `${JSON.stringify(commentFile('big'))}${' '.repeat(1024 * 1024)}`,
    });
    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'tours/big.vatour',
        pointer: '',
        message: 'The file holds more than 8 MiB, the most a file of this kind may hold.',
      },
      {
        file: 'comments/big.vacomment',
        pointer: '',
        message: 'The file holds more than 1 MiB, the most a file of this kind may hold.',
      },
    ]);
  });

  it('refuses a comments folder that is a link, without reading what it points to', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      await writeFile(join(outside, 'secret.vacomment'), JSON.stringify(commentFile('secret')));
      if (!(await tryLink(outside, join(folder, 'comments'), 'junction')))
        context.skip('This user may not make a link to a folder here.');
      expect(errorsOf(await loadProject(folder))).toEqual([
        {
          file: 'comments',
          pointer: '',
          message: `comments is a link; Visual Anything opens only real folders and regular files inside the project folder.`,
        },
      ]);
      expect([...(await readProjectFiles(folder)).keys()].sort()).toEqual([
        'model.vamodel',
        'project.vaproject',
      ]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a tour that is a link to a file outside the folder', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      await writeFile(join(outside, 'secret.vatour'), JSON.stringify(tourFile('secret')));
      if (
        !(await tryLink(join(outside, 'secret.vatour'), join(folder, 'tours/a.vatour'), 'file'))
      ) {
        context.skip(
          'This user may not make symbolic links here: Windows lets only Developer Mode or an administrator make them.',
        );
      }
      expect(errorsOf(await loadProject(folder))).toEqual([
        { file: 'tours/a.vatour', pointer: '', message: `The file is a link; ${ONLY_REGULAR}` },
      ]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a FIFO among the views without waiting on it', async (context) => {
    context.skip(
      process.platform === 'win32',
      'Windows has no FIFOs: its named pipes are not files in a folder.',
    );
    await mkdir(join(folder, 'views'));
    execFileSync('mkfifo', [join(folder, 'views/pipe.vaview')]);
    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'views/pipe.vaview',
        pointer: '',
        message: `The file is not a regular file; ${ONLY_REGULAR}`,
      },
    ]);
  });

  it('refuses a package linked to /dev/zero', async (context) => {
    context.skip(
      process.platform === 'win32',
      'Windows has no /dev/zero, nor devices among the files of a folder.',
    );
    await mkdir(join(folder, 'packages'));
    await symlink('/dev/zero', join(folder, 'packages/zero.vapackage'));
    expect(errorsOf(await loadProject(folder))).toEqual([
      {
        file: 'packages/zero.vapackage',
        pointer: '',
        message: `The file is a link; ${ONLY_REGULAR}`,
      },
    ]);
  });

  it('leaves links out of the files it reads to look for changes', async (context) => {
    await mkdir(join(folder, 'elsewhere'));
    if (!(await tryLink(join(folder, 'elsewhere'), join(folder, 'views/a.vaview'), 'junction'))) {
      context.skip('This user may not make a link to a folder here.');
    }
    expect([...(await readProjectFiles(folder)).keys()].sort()).toEqual([
      'model.vamodel',
      'project.vaproject',
    ]);
  });

  it('opens a project through a link to its folder', async (context) => {
    const link = `${folder}-link`;
    if (!(await tryLink(folder, link, 'junction')))
      context.skip('This user may not make a link to a folder here.');
    try {
      expect(snapshotOf(await loadProject(link)).project).toEqual(projectFile());
    } finally {
      await rm(link, { force: true, recursive: false }).catch(() => {});
    }
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

  it('warns about a stacking order that names what is not there, against its view file', async () => {
    await write({
      'project.vaproject': projectFile(),
      'model.vamodel': {
        ...modelFile(),
        elements: [{ id: 'box', component: 'essence', name: 'Box' }],
      },
      'views/overview.vaview': {
        ...viewFile('overview'),
        stackingOrder: { world: ['box', 'gone'], missing: ['box'] },
      },
    });

    const loaded = loadedOf(await loadProject(folder));
    // One for the id that is gone, one for the list kept for what is no element.
    expect(loaded.warnings).toHaveLength(2);
    const messages = loaded.warnings.map((warning) => warning.message).join(' ');
    expect(messages).toContain('"gone"');
    expect(messages).toContain('"missing"');
    expect(new Set(loaded.warnings.map((warning) => warning.file))).toEqual(
      new Set(['views/overview.vaview']),
    );
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
      tours: new Map(),
      comments: new Map(),
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
