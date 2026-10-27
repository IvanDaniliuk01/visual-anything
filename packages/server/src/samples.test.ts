import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anchoredElements, findPart, imagesIn } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from './project';
import {
  SAMPLE_IDS,
  emptyProjectFiles,
  folderState,
  sampleOf,
  samples,
  writeNewProject,
} from './samples';
import { samplesText } from './samples-source';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-new-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the sample projects the program holds', () => {
  it('are those in examples/, as scripts/samples.ts embeds them', async () => {
    const committed = await readFile(new URL('./samples/samples.json', import.meta.url), 'utf8');
    expect(
      committed,
      'A sample changed: run `pnpm --filter @visual-anything/server samples` and commit src/samples/samples.json.',
    ).toBe(samplesText());
  });

  it('are the C4, data-science, machine learning and physical-ai samples, each with its starter packages', () => {
    expect(samples().map(({ id, packages }) => ({ id, packages }))).toEqual([
      { id: 'c4-architecture', packages: ['c4'] },
      { id: 'data-science-pipeline', packages: ['data-science'] },
      { id: 'churn-classifier', packages: ['data-science', 'machine-learning'] },
      { id: 'robot-arm', packages: ['physical-ai'] },
    ]);
    expect(SAMPLE_IDS).toEqual([
      'c4-architecture',
      'data-science-pipeline',
      'churn-classifier',
      'robot-arm',
    ]);
    expect(sampleOf('my-systems')).toBeUndefined();
  });

  it.each(SAMPLE_IDS)(
    '%s opens with nothing to warn about, with views, a scenario that plays, and no file of its own packages',
    async (id) => {
      const sample = sampleOf(id);
      if (sample === undefined) throw new Error(`No sample ${id}.`);
      const written = await writeNewProject(join(root, id), sample.files);
      expect(written.ok).toBe(true);
      const loaded = await loadProject(join(root, id));
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
      expect(loaded.warnings).toEqual([]);
      expect(loaded.project.views.length).toBeGreaterThanOrEqual(2);
      const [scenario] = loaded.project.scenarios;
      const relations = new Set(loaded.project.model.relations.map((each) => each.id));
      expect(scenario?.steps.length).toBeGreaterThan(3);
      for (const step of scenario?.steps ?? []) {
        for (const relation of step.relations) expect(relations.has(relation)).toBe(true);
      }
      expect(loaded.files.packages.size).toBe(0);
    },
  );

  it('draws the Churn classifier’s layers as the parts of its Transformer block (P1 W62)', async () => {
    const sample = sampleOf('churn-classifier');
    if (sample === undefined) throw new Error('No sample churn-classifier.');
    expect((await writeNewProject(join(root, 'churn'), sample.files)).ok).toBe(true);
    const loaded = await loadProject(join(root, 'churn'));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    const anchored = anchoredElements(loaded.project);
    expect(anchored.map((each) => [each.element.id, each.part.part, each.images])).toEqual(
      [
        ['event-embedding', 'input-embedding'],
        ['positional-encoding', 'positional-encoding'],
        ['self-attention', 'multi-head-attention'],
        ['add-norm-1', 'add-norm-1'],
        ['feed-forward', 'feed-forward'],
        ['add-norm-2', 'add-norm-2'],
        ['encoded-events', 'output'],
      ].map(([element, part]) => [element, part, ['machine-learning.transformer-block-drawing']]),
    );
    const catalog = imagesIn(loaded.project);
    for (const each of anchored) {
      expect(findPart(each.part, catalog, each.images[0]), each.element.id).toBeDefined();
    }
    const architecture = loaded.project.views.find((view) => view.id === 'architecture');
    expect(architecture?.nestingRelationTypes).toEqual(['machine-learning.is-part-of']);
    const ids = new Set(anchored.map((each) => each.element.id));
    expect(architecture?.positions.filter((each) => ids.has(each.element))).toEqual([]);
    expect(loaded.project.scenarios.map((each) => [each.id, each.view])).toEqual([
      ['forward-pass', 'architecture'],
    ]);
  });
});

describe('a new project', () => {
  it('goes into a folder that does not exist yet, or holds only dot entries', async () => {
    expect(await folderState(join(root, 'missing'))).toBe('missing');
    await mkdir(join(root, 'git', '.git'), { recursive: true });
    await writeFile(join(root, 'git', '.DS_Store'), '');
    expect(await folderState(join(root, 'git'))).toBe('empty');
    await writeFile(join(root, 'git', 'notes.txt'), 'mine');
    expect(await folderState(join(root, 'git'))).toBe('taken');
    expect(await folderState(join(root, 'git', 'notes.txt'))).toBe('taken');
  });

  it('is never written into a folder that holds files, which is left as it was', async () => {
    const folder = join(root, 'taken');
    await mkdir(folder);
    await writeFile(join(folder, 'notes.txt'), 'mine');
    const written = await writeNewProject(folder, emptyProjectFiles(folder));
    expect(written).toEqual({
      ok: false,
      message: expect.stringContaining('already holds files') as string,
    });
    expect(await readdir(folder)).toEqual(['notes.txt']);
  });

  it('starts empty, using Systems, named after its folder, with one view', async () => {
    const folder = join(root, 'shop-systems');
    expect((await writeNewProject(folder, emptyProjectFiles(folder))).ok).toBe(true);
    const loaded = await loadProject(folder);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    expect(loaded.project.project).toEqual({
      schemaVersion: 1,
      name: 'shop-systems',
      packages: ['systems'],
    });
    expect(loaded.project.views.map((view) => view.name)).toEqual(['Overview']);
    expect(loaded.warnings).toEqual([]);
  });

  it('takes the names the app gives it, in the language it reads in', () => {
    const files = emptyProjectFiles(join(root, 'x'), {
      project: 'Mi tienda',
      view: 'Vista general',
    });
    expect(JSON.parse(files.get('project.vaproject') ?? '')).toMatchObject({ name: 'Mi tienda' });
    expect(JSON.parse(files.get('views/overview.vaview') ?? '')).toMatchObject({
      name: 'Vista general',
      perspective: { name: 'Vista general' },
    });
  });
});
