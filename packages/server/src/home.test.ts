/** Home's folders (ADR 0093): the projects folder, the projects in it, and the folders an app names. */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkHomeFolder,
  describeProject,
  folderNameFor,
  listProjects,
  projectsFolder,
  samePath,
  worldOf,
} from './home';
import { testProject, writeProjectFolder } from './test-support';

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-home-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('projectsFolder', () => {
  it('is Visual Anything in the Documents folder of the profile on Windows', () => {
    const folders = new Set(['C:\\Users\\ana\\Documents']);
    expect(projectsFolder('win32', {}, 'C:\\Users\\ana', (path) => folders.has(path))).toBe(
      'C:\\Users\\ana\\Documents\\Visual Anything',
    );
  });

  it('takes the Documents folder OneDrive keeps when the profile has none', () => {
    const folders = new Set(['C:\\Users\\ana\\OneDrive\\Documents']);
    expect(projectsFolder('win32', {}, 'C:\\Users\\ana', (path) => folders.has(path))).toBe(
      'C:\\Users\\ana\\OneDrive\\Documents\\Visual Anything',
    );
  });

  it('falls back to the home folder when there is no Documents folder', () => {
    expect(projectsFolder('darwin', {}, '/Users/ana', () => false)).toBe(
      '/Users/ana/Visual Anything',
    );
  });

  it('takes an absolute XDG_DOCUMENTS_DIR on Linux, and an absolute override anywhere', () => {
    expect(
      projectsFolder('linux', { XDG_DOCUMENTS_DIR: '/home/ana/Docs' }, '/home/ana', () => true),
    ).toBe('/home/ana/Docs/Visual Anything');
    expect(
      projectsFolder('linux', { VISUAL_ANYTHING_PROJECTS: '/media/usb/va' }, '/home/ana'),
    ).toBe('/media/usb/va');
    expect(
      projectsFolder('linux', { VISUAL_ANYTHING_PROJECTS: 'relative' }, '/home/ana', () => true),
    ).toBe('/home/ana/Documents/Visual Anything');
  });
});

describe('worldOf', () => {
  it('is the first built-in package besides Systems', () => {
    expect(worldOf(['systems', 'data-modeling'])).toBe('data-modeling');
    expect(worldOf(['shop', 'healthcare', 'finance'])).toBe('healthcare');
    expect(worldOf(['systems'])).toBeUndefined();
    expect(worldOf('c4')).toBeUndefined();
  });
});

describe('folderNameFor', () => {
  it('keeps a name every system takes as a folder', () => {
    expect(folderNameFor('Auditoría médica')).toBe('Auditoría médica');
    expect(folderNameFor('a/b\\c:d*e?"f<g>h|')).toBe('a b c d e f g h');
    expect(folderNameFor('  ..trailing dots.. ')).toBe('trailing dots');
    expect(folderNameFor('CON')).toBe('CON project');
    expect(folderNameFor('...')).toBe('Project');
    expect([...folderNameFor('x'.repeat(300))]).toHaveLength(80);
  });
});

describe('listProjects and describeProject', () => {
  it('lists the subfolders that hold a project, with name, world and when they changed', async () => {
    const shop = join(root, 'shop');
    await writeProjectFolder(shop, testProject());
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'notes', 'todo.txt'), 'nothing');
    await mkdir(join(root, '.hidden'));
    const listed = await listProjects(root);
    expect(listed).toEqual([
      { path: shop, name: testProject().project.name, changed: expect.any(Number) },
    ]);
    expect(await describeProject(join(root, 'notes'))).toBeUndefined();
    expect(await listProjects(join(root, 'missing'))).toEqual([]);
  });

  it('names a project by its folder when its project file has no name it can read', async () => {
    const odd = join(root, 'odd');
    await mkdir(odd);
    await writeFile(join(odd, 'p.vaproject'), '{ not json');
    expect(await describeProject(odd)).toMatchObject({ name: 'odd' });
  });

  it('does not follow a link to a folder', async () => {
    const shop = join(root, 'shop');
    await writeProjectFolder(shop, testProject());
    const link = join(root, 'link');
    try {
      await symlink(shop, link, 'junction');
    } catch {
      return; // No links here.
    }
    expect(await describeProject(link)).toBeUndefined();
  });
});

describe('checkHomeFolder', () => {
  it('opens a folder that holds a project, or nothing yet', async () => {
    const shop = join(root, 'shop');
    await writeProjectFolder(shop, testProject());
    expect(await checkHomeFolder(shop)).toEqual({ ok: true, folder: shop, holds: 'project' });
    const empty = join(root, 'empty');
    await mkdir(join(empty, '.git'), { recursive: true });
    expect(await checkHomeFolder(empty)).toEqual({ ok: true, folder: empty, holds: 'nothing' });
  });

  it('refuses a relative path, a network path, a file, a missing folder and other folders', async () => {
    await writeFile(join(root, 'file.txt'), 'x');
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'notes', 'a.txt'), 'x');
    const refused = async (path: string, platform: NodeJS.Platform = process.platform) => {
      const checked = await checkHomeFolder(path, platform);
      expect(checked.ok, path).toBe(false);
      return checked.ok ? '' : checked.message;
    };
    expect(await refused('shop')).toMatch(/whole path/);
    expect(await refused('\\\\server\\share\\shop', 'win32')).toMatch(/not on the network/);
    expect(await refused(join(root, 'file.txt'))).toMatch(/is a file/);
    expect(await refused(join(root, 'missing'))).toMatch(/There is no folder/);
    expect(await refused(join(root, 'notes'))).toMatch(/holds no project/);
    expect(await refused(`${root}\0x`)).toMatch(/not the path/);
  });
});

describe('samePath', () => {
  it('tells paths apart by case only where the system does', () => {
    expect(samePath('C:\\A\\b', 'c:/a/B/', 'win32')).toBe(true);
    expect(samePath('/a/b', '/a/B', 'linux')).toBe(false);
  });
});
