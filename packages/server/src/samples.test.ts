import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  anchoredElements,
  checkProject,
  explorableTextHash,
  explorablesIn,
  findPart,
  imagesIn,
  tourStepProblems,
} from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from './project';
import { openSession } from './session';
import { solidFileWarnings } from './solids/files';
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

  it('are the C4, data-science, two machine learning, math, physical-ai, process, healthcare, finance and data modeling samples, each with its starter packages', () => {
    expect(samples().map(({ id, packages }) => ({ id, packages }))).toEqual([
      { id: 'c4-architecture', packages: ['c4'] },
      { id: 'data-science-pipeline', packages: ['data-science'] },
      { id: 'churn-classifier', packages: ['data-science', 'machine-learning'] },
      { id: 'spam-filter', packages: ['data-science', 'machine-learning'] },
      { id: 'quadratic-function', packages: ['quadratic'] },
      { id: 'robot-arm', packages: ['physical-ai', 'robot-arm'] },
      { id: 'order-process', packages: ['process'] },
      { id: 'clinic-claim', packages: ['healthcare'] },
      { id: 'workshop-books', packages: ['finance'] },
      { id: 'bookshop-database', packages: ['systems', 'data-modeling'] },
    ]);
    expect(SAMPLE_IDS).toEqual([
      'c4-architecture',
      'data-science-pipeline',
      'churn-classifier',
      'spam-filter',
      'quadratic-function',
      'robot-arm',
      'order-process',
      'clinic-claim',
      'workshop-books',
      'bookshop-database',
    ]);
    expect(sampleOf('my-systems')).toBeUndefined();
  });

  it.each(SAMPLE_IDS)(
    '%s opens with nothing to warn about, with views, a scenario that plays, and no file of its own packages but its solids’',
    async (id) => {
      const sample = sampleOf(id);
      if (sample === undefined) throw new Error(`No sample ${id}.`);
      const written = await writeNewProject(join(root, id), sample.files);
      expect(written.ok).toBe(true);
      const loaded = await loadProject(join(root, id));
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
      expect(loaded.warnings).toEqual([]);
      // A solid's file is there, as its bytes, as a session checks it on opening (ADR 0075).
      expect(solidFileWarnings(loaded.project, join(root, id))).toEqual([]);
      expect(loaded.project.views.length).toBeGreaterThanOrEqual(2);
      const [scenario] = loaded.project.scenarios;
      const relations = new Set(loaded.project.model.relations.map((each) => each.id));
      expect(scenario?.steps.length).toBeGreaterThan(3);
      for (const step of scenario?.steps ?? []) {
        for (const relation of step.relations) expect(relations.has(relation)).toBe(true);
      }
      // The robot arm's own package holds its solid, which no built-in package can name the file of
      // (M9, ADR 0075's clarification of 2026-10-31), and its workcell's components and the relation
      // types that pose things in it (M10, ADR 0076's clarification of 2026-10-31).
      const own = [...loaded.files.packages.keys()];
      if (id === 'robot-arm') {
        expect(own).toEqual(['robot-arm']);
        const arm = loaded.project.packages.find((file) => file.id === 'robot-arm');
        expect(arm?.components.map((each) => each.id)).toEqual([
          'robot-arm.workcell',
          'robot-arm.table',
          'robot-arm.bin',
          'robot-arm.workpiece',
        ]);
        expect(arm?.relationTypes.map((each) => [each.id, each.nests])).toEqual([
          ['robot-arm.is-in', true],
          ['robot-arm.is-mounted-on', true],
        ]);
        expect(arm?.solids?.map((each) => each.id)).toEqual([
          'robot-arm.six-axis-arm',
          'robot-arm.work-table',
          'robot-arm.parts-bin',
          'robot-arm.machined-block',
        ]);
      } else if (id === 'quadratic-function') {
        // Its own package defines the explorable its function shows (A10, ADR 0107).
        expect(own).toEqual(['quadratic']);
      } else {
        expect(own).toEqual([]);
      }
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

describe('the Spam filter sample', () => {
  it('explains its model in Math that typesets whole: descriptions, notes, a scenario and a tour (A9)', async () => {
    const sample = sampleOf('spam-filter');
    if (sample === undefined) throw new Error('No sample spam-filter.');
    expect((await writeNewProject(join(root, 'spam'), sample.files)).ok).toBe(true);
    const loaded = await loadProject(join(root, 'spam'));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    // Every piece of Math typesets: none is drawn as its TeX with math-error.
    const checked = checkProject(loaded.project);
    expect(checked.warnings).toEqual([]);
    const read = (checked.notices ?? []).map((each) => each.message);
    for (const where of [
      'the description of the project',
      'the description of the element "Log loss"',
      'the description of the element "Logistic function"',
      'the description of the element "Brier score"',
      'the description of the element "Gradient descent"',
      'a note in the view "The model"',
      'a note in the view "Training"',
      'the description of the scenario "Scoring a batch of emails"',
      'the caption of step 1 of the tour "The math of the filter"',
      'the speaker notes of step 3 of the tour "The math of the filter"',
    ]) {
      expect(read, where).toContain(
        `Math is read in ${where}: write \\$ for a dollar sign that is not Math.`,
      );
    }
    // A loss and a probability, as display Math of their own.
    const described = (id: string) =>
      loaded.project.model.elements.find((each) => each.id === id)?.description ?? '';
    expect(described('log-loss')).toContain('$$\nL(w, b) = -\\frac{1}{n}');
    expect(described('logistic-function')).toContain('$$\n\\sigma(z) = \\frac{1}{1 + e^{-z}}\n$$');
    expect(described('brier-score')).toContain('(\\hat p_i - y_i)^2');
  });
});

describe('the Quadratic function sample', () => {
  it('explains a quadratic function with an explorable that asks the first time, a tour that sets its parameters, and Math (A10)', async () => {
    const sample = sampleOf('quadratic-function');
    if (sample === undefined) throw new Error('No sample quadratic-function.');
    const folder = join(root, 'quadratic');
    expect((await writeNewProject(folder, sample.files)).ok).toBe(true);
    // Its explorable's file comes with it, as its text, and hashes to its definition.
    const text = await readFile(join(folder, 'explorables', 'quadratic.html'), 'utf8');
    expect(text).toBe(sample.files.get('explorables/quadratic.html'));
    const loaded = await loadProject(folder);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
    const parabola = explorablesIn(loaded.project).explorable('quadratic.parabola');
    expect(parabola?.definition).toMatchObject({
      file: 'quadratic.html',
      api: 1,
      hash: explorableTextHash(text),
      parameters: [
        { name: 'a', kind: 'number', min: -5, max: 5, default: 1 },
        { name: 'b', kind: 'number', min: -10, max: 10, default: 0 },
        { name: 'c', kind: 'number', min: -10, max: 10, default: 0 },
      ],
    });
    expect(parabola?.definition.scriptLibraries).toBeUndefined();
    // Plain JavaScript that reads its parameters, draws with the theme's variables and says ready.
    for (const said of ['va.data', "va.on('change'", 'va.ready()', 'va.select(', 'var(--va-text']) {
      expect(text, said).toContain(said);
    }
    expect(text).not.toMatch(/<script src|<link|fetch\(|eval\(|new Function/);
    // The function's component shows it, and so does a shape bound to the function.
    const component = loaded.project.packages
      .find((file) => file.id === 'quadratic')
      ?.components.find((each) => each.id === 'quadratic.function');
    expect(component?.appearance?.explorable).toEqual({ explorable: 'quadratic.parabola' });
    expect(
      loaded.project.views.flatMap((view) =>
        view.freeShapes.filter((shape) => shape.kind === 'explorable'),
      ),
    ).toMatchObject([{ explorable: 'quadratic.parabola', element: 'quadratic-function' }]);
    // A tour whose steps set different parameters, none of them broken.
    const [tour] = loaded.project.tours;
    const values = tour?.steps.map((step) => JSON.stringify(step.explorable?.parameters));
    expect(new Set(values).size).toBe(tour?.steps.length);
    for (const step of tour?.steps ?? []) {
      expect(tourStepProblems(loaded.project, step), step.id).toEqual([]);
    }
    // Its Math typesets whole.
    const checked = checkProject(loaded.project);
    expect(checked.warnings).toEqual([]);
    const read = (checked.notices ?? []).map((each) => each.message);
    for (const where of [
      'the description of the element "Quadratic function"',
      'the description of the element "Roots"',
      'the caption of step 3 of the tour "Playing with a, b and c"',
    ]) {
      expect(read, where).toContain(
        `Math is read in ${where}: write \\$ for a dollar sign that is not Math.`,
      );
    }
    // Opened, its file is the one its definition names: nothing is recorded, and it waits for the
    // person's approval the first time, as any explorable does.
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The sample does not open.');
    try {
      await opened.session.idle();
      expect(opened.session.actions).toEqual([]);
      expect(opened.session.snapshot.explorableTexts).toEqual([
        { id: 'quadratic.parabola', text, read: true },
      ]);
      expect(opened.session.isExplorableApproved('quadratic.parabola')).toBe(false);
    } finally {
      await opened.session.close();
    }
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
