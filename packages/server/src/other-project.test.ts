import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSnapshot, ViewState } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProgramUnavailableError } from './claude/bridge';
import {
  locateOtherProject,
  otherProjectOpener,
  projectDestinationWarnings,
  type AttachedProgram,
} from './other-project';
import { toForwardSlashes } from './paths';
import { testProject } from './test-support';

let root: string;
/** This project's folder, `<root>/projects/heart`. */
let heart: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-other-')));
  heart = join(root, 'projects', 'heart');
  for (const name of ['heart', 'billing', 'empty']) {
    await mkdir(join(root, 'projects', name), { recursive: true });
  }
  await mkdir(join(root, 'outside'), { recursive: true });
  for (const name of ['heart', 'billing']) {
    await writeFile(join(root, 'projects', name, 'project.vaproject'), '{}');
  }
  await writeFile(join(root, 'outside', 'project.vaproject'), '{}');
  await writeFile(join(root, 'projects', 'a-file'), 'x');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

describe('locateOtherProject', () => {
  it('finds a project beside this one, and this one', async () => {
    expect(await locateOtherProject(heart, '../billing')).toEqual({
      ok: true,
      folder: toForwardSlashes(join(root, 'projects', 'billing')),
    });
    expect(await locateOtherProject(heart, '.')).toEqual({
      ok: true,
      folder: toForwardSlashes(heart),
    });
  });

  it.each([
    ['a path out of the folder holding this project', '../../outside', 'invalid-destination'],
    ['an absolute path', '/etc', 'invalid-destination'],
    ['a path with backslashes', '..\\billing', 'invalid-destination'],
    ['a folder that is not there', '../nowhere', 'broken-destination'],
    ['a folder without a project', '../empty', 'broken-destination'],
    ['a file', '../a-file', 'broken-destination'],
  ])('refuses %s', async (_, path, code) => {
    const located = await locateOtherProject(heart, path);
    expect(located.ok).toBe(false);
    if (!located.ok) expect(located.problem.code).toBe(code);
  });

  it('refuses a link that leads out of the folder holding this project', async () => {
    try {
      await symlink(join(root, 'outside'), join(root, 'projects', 'link'), 'junction');
    } catch {
      return; // A system that makes no links has nothing to refuse here.
    }
    const located = await locateOtherProject(heart, '../link');
    expect(located).toMatchObject({ ok: false, problem: { code: 'invalid-destination' } });
  });
});

/** A program attached to a project, which notes what it was asked. */
function fakeProgram(
  name: string,
  opened: (ViewState | undefined)[],
  options: { fails?: boolean } = {},
): AttachedProgram & { closed: boolean } {
  const project: ProjectSnapshot = {
    ...testProject(),
    project: { schemaVersion: 1, name, packages: [] },
  };
  const fake = {
    closed: false,
    project: () =>
      options.fails
        ? Promise.reject(new ProgramUnavailableError('Visual Anything could not start there.'))
        : Promise.resolve(project),
    openApp: (state?: ViewState) => {
      opened.push(state);
      return Promise.resolve({ how: 'browser' as const });
    },
    close: () => {
      fake.closed = true;
    },
  };
  return fake;
}

describe('otherProjectOpener', () => {
  it('opens the other project in its own program, at the view asked for, and lets go of it', async () => {
    const opened: (ViewState | undefined)[] = [];
    const attached: string[] = [];
    let program: ReturnType<typeof fakeProgram> | undefined;
    const open = otherProjectOpener({
      runtime: join(root, 'runtime'),
      attach: (folder) => {
        attached.push(folder);
        program = fakeProgram('Billing', opened);
        return program;
      },
    });
    expect(await open(heart, { project: '../billing', view: 'overview' })).toEqual({
      ok: true,
      name: 'Billing',
    });
    expect(attached).toEqual([toForwardSlashes(join(root, 'projects', 'billing'))]);
    expect(opened).toEqual([{ view: 'overview' }]);
    expect(program?.closed).toBe(true);
  });

  it('opens where the project opens when the destination names no view', async () => {
    const opened: (ViewState | undefined)[] = [];
    const open = otherProjectOpener({
      runtime: join(root, 'runtime'),
      attach: () => fakeProgram('Billing', opened),
    });
    expect(await open(heart, { project: '../billing' })).toMatchObject({ ok: true });
    expect(opened).toEqual([undefined]);
  });

  it('refuses a view the other project does not have, and opens nothing', async () => {
    const opened: (ViewState | undefined)[] = [];
    const open = otherProjectOpener({
      runtime: join(root, 'runtime'),
      attach: () => fakeProgram('Billing', opened),
    });
    const outcome = await open(heart, { project: '../billing', view: 'invoices' });
    expect(outcome).toMatchObject({ ok: false, problems: [{ code: 'unknown-view' }] });
    expect(opened).toEqual([]);
  });

  it('refuses a path before it reaches any program', async () => {
    const attached: string[] = [];
    const open = otherProjectOpener({
      runtime: join(root, 'runtime'),
      attach: (folder) => {
        attached.push(folder);
        return fakeProgram('X', []);
      },
    });
    expect(await open(heart, { project: '../../outside' })).toMatchObject({ ok: false });
    expect(attached).toEqual([]);
  });

  it('says why when the other program cannot be reached', async () => {
    const open = otherProjectOpener({
      runtime: join(root, 'runtime'),
      attach: () => fakeProgram('Billing', [], { fails: true }),
    });
    expect(await open(heart, { project: '../billing' })).toEqual({
      ok: false,
      problems: [{ code: 'program-failed', message: 'Visual Anything could not start there.' }],
    });
  });

  it('opens nothing without a runtime folder', async () => {
    const open = otherProjectOpener({ runtime: null, attach: () => fakeProgram('X', []) });
    expect(await open(heart, { project: '../billing' })).toMatchObject({
      ok: false,
      problems: [{ code: 'program-failed' }],
    });
  });
});

describe('projectDestinationWarnings', () => {
  it('flags destinations to folders that hold no project, and keeps quiet about the others', () => {
    const state = testProject();
    const shop = state.packages.find((file) => file.id === 'shop');
    if (shop === undefined) throw new Error('no shop');
    const linked: ProjectSnapshot = {
      ...state,
      packages: state.packages.map((file) =>
        file.id === 'shop'
          ? {
              ...file,
              components: file.components.map((each) => ({
                ...each,
                attributes: [
                  ...(each.attributes ?? []),
                  { name: 'see', type: 'destination' as const },
                ],
              })),
            }
          : file,
      ),
      model: {
        ...state.model,
        elements: [
          ...state.model.elements.map((element) =>
            element.id === 'cart'
              ? { ...element, attributes: { see: { project: '../empty' } } }
              : element,
          ),
          {
            id: 'cart-2',
            component: 'shop.cart',
            name: 'Cart 2',
            attributes: { see: { project: '../billing' } },
          },
        ],
      },
    };
    const warnings = projectDestinationWarnings(linked, heart);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'broken-destination', subjects: ['cart'] }),
    ]);
  });
});
