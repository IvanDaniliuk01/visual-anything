import { describe, expect, it } from 'vitest';
import { folderKindOf, isProjectPath, newFilePath } from './layout';

describe('isProjectPath', () => {
  it.each([
    'project.vaproject',
    'model.vamodel',
    'other.vamodel',
    'packages/clinic.vapackage',
    'views/system-overview.vaview',
    'scenarios/patient-books-appointment.vascenario',
    'packages',
    'views',
    'scenarios',
    'Views',
    'Views/overview.vaview',
    '',
    '.',
  ])('takes %j for a project file or one of its folders', (path) => {
    expect(isProjectPath(path)).toBe(true);
  });

  it.each([
    'README.md',
    'stray.vaview',
    'model.vamodel.bak',
    '.model.vamodel.0a1b2c3d4e5f.va-tmp',
    'views/.overview.vaview.0a1b2c3d4e5f.va-tmp',
    'views/notes.txt',
    'views/model.vamodel',
    'packages/overview.vaview',
    'views/old/archived.vaview',
    'views/old',
    '.git',
    '.git/HEAD',
    '.git/views/a.vaview',
    'node_modules/x/model.vamodel',
  ])('leaves out %j, which opening a project never reads', (path) => {
    expect(isProjectPath(path)).toBe(false);
  });
});

describe('folderKindOf', () => {
  it('names the kind of file each folder holds, whatever the case of its name', () => {
    expect(folderKindOf('packages')).toBe('package');
    expect(folderKindOf('VIEWS')).toBe('view');
    expect(folderKindOf('scenarios')).toBe('scenario');
    expect(folderKindOf('docs')).toBeUndefined();
  });
});

describe('newFilePath', () => {
  const free = () => false;

  it('names the file after the id, in the folder of its kind', () => {
    expect(newFilePath('view', 'overview', free)).toBe('views/overview.vaview');
    expect(newFilePath('scenario', 'request', free)).toBe('scenarios/request.vascenario');
    expect(newFilePath('package', 'shop', free)).toBe('packages/shop.vapackage');
  });

  it('adds the smallest free numeric suffix when the name is taken', () => {
    const taken = new Set(['views/overview.vaview', 'views/overview-2.vaview']);
    expect(newFilePath('view', 'overview', (path) => taken.has(path))).toBe(
      'views/overview-3.vaview',
    );
  });

  it('keeps ids with dots whole', () => {
    expect(newFilePath('package', 'acme.tools', free)).toBe('packages/acme.tools.vapackage');
  });

  it.each(['con', 'PRN', 'aux', 'nul', 'com1', 'LPT9', 'aux.tools'])(
    'avoids %j, which Windows reserves for a device',
    (id) => {
      const path = newFilePath('package', id, free);
      expect(path).toBe(`packages/_${id}.vapackage`);
    },
  );

  it('asks about each candidate it considers', () => {
    const asked: string[] = [];
    newFilePath('view', 'a', (path) => {
      asked.push(path);
      return asked.length < 3;
    });
    expect(asked).toEqual(['views/a.vaview', 'views/a-2.vaview', 'views/a-3.vaview']);
  });
});
