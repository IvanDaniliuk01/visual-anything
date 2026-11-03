import {
  codeStatusOf,
  executeCommand,
  packagesWithCode,
  withApproval,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { codeProject, gaugesPackage } from '../code/test/project';
import type { ChosenFile } from '../shell/definitions/sharedPackages';
import { changedPartOf, codeChangeOf, packageFilesIn, packagePlanOf } from './packageFiles';

/** A package of its own, for a project that does not have it yet. */
const METERS: PackageFile = {
  id: 'meters',
  name: 'Meters',
  version: '1.0.0',
  components: [{ id: 'meters.meter', name: 'Meter', derivesFrom: 'essence' }],
  relationTypes: [],
  code: ['export function act() { return { commands: [] }; }'],
  capabilities: ['model:read'],
  extensions: {
    actions: [{ id: 'tidy', label: 'Tidy the meters', where: ['packages-menu'] }],
  },
};

function applied(project: ProjectSnapshot, plan: ReturnType<typeof packagePlanOf>) {
  if (!plan.ok) throw new Error(plan.message);
  const outcome = executeCommand(project, plan.command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('packagePlanOf', () => {
  it('adds a package a file holds, with its code, capabilities and what the code adds', () => {
    const project = codeProject();
    const plan = packagePlanOf(project, METERS);
    expect(plan).toMatchObject({ ok: true, kind: 'add' });
    const after = applied(project, plan);
    const added = after.packages.find((each) => each.id === 'meters');
    expect(added).toMatchObject({
      name: 'Meters',
      version: '1.0.0',
      code: METERS.code,
      capabilities: ['model:read'],
      extensions: METERS.extensions,
    });
    expect(after.project.packages).toContain('meters');
    // Its code waits for the person's approval: nothing approves it.
    const code = packagesWithCode(after).find((each) => each.package === 'meters');
    expect(code && codeStatusOf(code, []).state).toBe('unapproved');
  });

  it('adds a package without code as add-package alone', () => {
    const plain = { ...METERS, code: undefined, capabilities: undefined, extensions: undefined };
    const plan = packagePlanOf(codeProject(), plain);
    expect(plan).toMatchObject({ ok: true, command: { type: 'add-package' } });
    expect(applied(codeProject(), plan).packages.at(-1)?.code).toBeUndefined();
  });

  it('updates the project’s own package of the same id, asking approval again when its code changed', () => {
    const project = codeProject();
    const before = packagesWithCode(project)[0]!;
    const approvals = withApproval([], { hash: before.hash, package: 'gauges', capabilities: [] });
    expect(codeStatusOf(before, approvals).state).toBe('approved');

    const newer = {
      ...gaugesPackage(['export function check() { return []; }']),
      version: '2.0.0',
    };
    const plan = packagePlanOf(project, newer);
    expect(plan).toMatchObject({ ok: true, kind: 'update', code: 'changed' });
    const after = applied(project, plan);
    const code = packagesWithCode(after)[0]!;
    expect(code.hash).not.toBe(before.hash);
    expect(codeStatusOf(code, approvals).state).toBe('unapproved');
    expect(after.packages[0]).toMatchObject({ version: '2.0.0', code: newer.code });
  });

  it('asks again when only what the code adds changed, and keeps the approval when nothing did', () => {
    const project = codeProject();
    const before = packagesWithCode(project)[0]!;
    const approvals = withApproval([], { hash: before.hash, package: 'gauges', capabilities: [] });

    const adding: PackageFile = {
      ...gaugesPackage(),
      extensions: { exporters: [{ id: 'csv', label: 'Gauges as CSV', extension: '.csv' }] },
    };
    const plan = packagePlanOf(project, adding);
    expect(plan).toMatchObject({ kind: 'update', code: 'changed' });
    expect(codeStatusOf(packagesWithCode(applied(project, plan))[0]!, approvals).state).toBe(
      'unapproved',
    );

    const same = packagePlanOf(project, { ...gaugesPackage(), description: 'Dials.' });
    expect(same).toMatchObject({ kind: 'update', code: 'same' });
    const kept = applied(project, same);
    expect(kept.packages[0]).toMatchObject({ description: 'Dials.', code: gaugesPackage().code });
    expect(codeStatusOf(packagesWithCode(kept)[0]!, approvals).state).toBe('approved');
  });

  it('removes the code when the newer file holds none', () => {
    const project = codeProject();
    const plan = packagePlanOf(project, { ...gaugesPackage(), code: undefined });
    expect(plan).toMatchObject({ kind: 'update', code: 'removed' });
    expect(applied(project, plan).packages[0]?.code).toBeUndefined();
  });

  it('adds, never updates, a package with a built-in id, which the core refuses', () => {
    const plan = packagePlanOf(codeProject(), { ...METERS, id: 'systems' });
    expect(plan).toMatchObject({ ok: true, kind: 'add' });
    if (!plan.ok) return;
    expect(executeCommand(codeProject(), plan.command)).toMatchObject({ ok: false });
  });

  it('sends one command, which keeps the whole file', () => {
    const project = codeProject();
    expect(packagePlanOf(project, METERS)).toMatchObject({
      command: { type: 'add-package', package: METERS },
    });
    expect(packagePlanOf(project, gaugesPackage())).toMatchObject({
      command: { type: 'replace-package', package: gaugesPackage() },
    });
  });

  it('adds and updates crosswalks, which the commands now carry', () => {
    const project = codeProject();
    const crosswalks = [{ from: 'uberon', to: 'fma', entries: { 'UBERON:1': 'FMA:1' } }];
    const after = applied(project, packagePlanOf(project, { ...METERS, crosswalks }));
    expect(after.packages.find((each) => each.id === 'meters')?.crosswalks).toEqual(crosswalks);
  });

  it('refuses a file with solids or conflicts, naming the package', () => {
    const project = codeProject();
    expect(packagePlanOf(project, { ...METERS, solids: [] })).toEqual({
      ok: false,
      message:
        'The package "Meters" holds solids, whose files a package file does not carry: add it from its project’s folder instead.',
    });
    expect(packagePlanOf(project, { ...METERS, conflicts: [] })).toEqual({
      ok: false,
      message:
        'The package "Meters" holds conflicts from a merge: resolve them in its own project first.',
    });
  });
});

describe('packageFilesIn', () => {
  const file = (path: string): ChosenFile => ({ path, size: 1, text: () => Promise.resolve('') });

  it('offers the package files at the folder’s top and in its packages folder, sorted', () => {
    const found = packageFilesIn([
      file('shared/z.vapackage'),
      file('shared/packages/a.vapackage'),
      file('shared/project.vaproject'),
      file('shared/deep/inside/b.vapackage'),
      file('shared/views/c.vapackage'),
      file('shared/B.VAPACKAGE'),
    ]);
    expect(found.map((each) => each.path)).toEqual([
      'shared/B.VAPACKAGE',
      'shared/packages/a.vapackage',
      'shared/z.vapackage',
    ]);
  });

  it('offers at most 32', () => {
    const many = Array.from({ length: 40 }, (_, n) =>
      file(`f/p${String(n).padStart(2, '0')}.vapackage`),
    );
    expect(packageFilesIn(many)).toHaveLength(32);
  });
});

describe('what an update does to the code (ADR 0089’s M14.6 clarification)', () => {
  it('says whether its text, what it may reach or what it adds changed', () => {
    expect(codeChangeOf(METERS, METERS)).toBe('same');
    expect(changedPartOf(METERS, METERS)).toBeUndefined();
    expect(changedPartOf(METERS, { ...METERS, code: ['// other'] })).toBe('code');
    expect(changedPartOf(METERS, { ...METERS, capabilities: ['model:read', 'time'] })).toBe(
      'capabilities',
    );
    const more: PackageFile = {
      ...METERS,
      extensions: {
        ...METERS.extensions,
        exporters: [{ id: 'csv', label: 'CSV', extension: '.csv' }],
      },
    };
    expect(codeChangeOf(METERS, more)).toBe('changed');
    expect(changedPartOf(METERS, more)).toBe('extensions');
    const none: PackageFile = { ...METERS };
    delete none.code;
    delete none.capabilities;
    delete none.extensions;
    expect(codeChangeOf(none, METERS)).toBe('added');
    expect(codeChangeOf(METERS, none)).toBe('removed');
    expect(codeChangeOf(none, none)).toBe('none');
  });
});
