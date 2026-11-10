/**
 * What a project's check only tells (ADR 0106): the texts that read as Math reach an app that
 * connects, and every app after a reload, as a notice of level info, apart from the warnings, which
 * still come as a warning; a project with none sends no such notice.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string;
let session: Session | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-notices-'));
});

afterEach(async () => {
  await session?.close();
  session = undefined;
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function open(project: ProjectSnapshot): Promise<Session> {
  await writeProjectFolder(folder, project);
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  session = result.session;
  return result.session;
}

/** The test project with Math in an element's description and in a note, one that fails. */
function withMath(): ProjectSnapshot {
  const project = testProject();
  project.model.elements[1] = { ...project.model.elements[1]!, description: 'Costs $O(n)$.' };
  const view = project.views[0]!;
  view.freeShapes = [
    { ...view.freeShapes[0]!, text: '$$\n\\color{red}{x}\n$$' },
  ] as typeof view.freeShapes;
  return project;
}

describe('the notices of a project', () => {
  it('reach an app that connects as info, after its warnings', async () => {
    const opened = await open(withMath());
    const client = new FakeClient();
    opened.connect(client);
    const notices = client.ofType('notice');
    expect(notices.map((each) => each.level)).toEqual(['warning', 'info']);
    expect(notices[0]?.message).toBe(
      'The project has 1 warning:\nviews/overview.vaview: Math in a note in the view "Overview" is drawn as its TeX, "\\color{red}{x}", since it cannot be typeset: Math does not take \\color: colors come from the theme.',
    );
    expect(notices[1]?.message).toBe(
      [
        'The project has 2 notices:',
        'model.vamodel /elements/1: Math is read in the description of the element "API": write \\$ for a dollar sign that is not Math.',
        'views/overview.vaview: Math is read in a note in the view "Overview": write \\$ for a dollar sign that is not Math.',
      ].join('\n'),
    );
    expect(opened.notices()).toHaveLength(2);
  });

  it('are not sent when there is nothing to tell', async () => {
    const opened = await open(testProject());
    const client = new FakeClient();
    opened.connect(client);
    expect(client.ofType('notice')).toEqual([]);
    expect(opened.notices()).toEqual([]);
  });

  it('follow the project as it changes', async () => {
    const opened = await open(testProject());
    await opened.execute(
      { type: 'update-element', id: 'db', changes: { description: 'Holds $\\mathbb{R}^n$' } },
      'claude',
    );
    expect(opened.notices().map((each) => each.message)).toEqual([
      'Math is read in the description of the element "DB": write \\$ for a dollar sign that is not Math.',
    ]);
  });
});
