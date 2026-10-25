/**
 * The code worker's work (ADR 0054), run here without a worker: the approved packages' hooks on the
 * elements created from their components, again only when their input changed, their answers
 * checked, and a package turned off after three stops in a row.
 */
import { codeHash, type ProjectSnapshot } from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadNodeEngine } from './engine-node';
import type { CodeReply, ElementAnswers, PackageRun, RunPackage } from './messages';
import { CodeRunner } from './runner';
import { CodeSandbox } from './sandbox';
import { GAUGES_CODE, codeProject, gaugesPackage } from './test/project';

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

function runPackage(code: string[] = GAUGES_CODE, extra: Partial<RunPackage> = {}): RunPackage {
  return {
    package: 'gauges',
    name: 'Gauges',
    hash: codeHash(code, []),
    code: code.join('\n'),
    granted: [],
    stops: 0,
    ...extra,
  };
}

/** A runner over the node engine, and what it said, gathered. */
function harness(options: { callMs?: number } = {}) {
  const replies: CodeReply[] = [];
  let sandboxes = 0;
  const runner = new CodeRunner({
    newSandbox: () => {
      sandboxes += 1;
      return Promise.resolve(new CodeSandbox(engine, { callMs: options.callMs ?? 250 }));
    },
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
  });
  const elements = new Map<string, ElementAnswers>();
  const packages = new Map<string, PackageRun>();
  const absorb = () => {
    for (const reply of replies.splice(0)) {
      if (reply.kind !== 'answers') continue;
      for (const each of reply.elements) elements.set(each.element, each);
      for (const each of reply.cleared) elements.delete(each);
      for (const each of reply.packages) packages.set(each.package, each);
    }
  };
  return {
    runner,
    elements,
    packages,
    replies,
    sandboxes: () => sandboxes,
    async run(...requests: Parameters<CodeRunner['receive']>[0][]) {
      for (const request of requests) runner.receive(request);
      await runner.settled();
      absorb();
    },
  };
}

describe('the code runner', () => {
  it('computes, checks and draws on the elements of the package’s components', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: codeProject() },
      { kind: 'view', view: 'kitchen', scale: 1, shown: ['oven', 'kitchen'] },
      { kind: 'packages', packages: [runPackage()] },
    );
    expect(it.packages.get('gauges')).toEqual({
      package: 'gauges',
      state: 'running',
      hooks: ['attributes', 'check', 'draw'],
      stops: 0,
    });
    const oven = it.elements.get('oven');
    expect(oven?.attributes).toEqual([{ name: 'fahrenheit', value: 212, package: 'gauges' }]);
    expect(oven?.problems).toEqual([
      { code: 'code-check', message: 'Over 90 °C.', subjects: ['gauges', 'oven'] },
    ]);
    expect(oven?.drawing?.items.map((each) => each.kind)).toEqual(['arc', 'text']);
    // The fridge is not shown in the view: computed and checked, never drawn.
    expect(it.elements.get('fridge')).toEqual({
      element: 'fridge',
      attributes: [{ name: 'fahrenheit', value: 39, package: 'gauges' }],
      problems: [],
    });
    // Elements of other components run none of its code.
    expect(it.elements.has('kitchen')).toBe(false);
    expect(it.elements.has('db')).toBe(false);
  });

  it('calls again only for an element whose input changed', async () => {
    const it = harness();
    const project = codeProject();
    await it.run(
      { kind: 'project', project },
      {
        kind: 'packages',
        packages: [
          runPackage([
            'let calls = 0;',
            'export function attributes() { calls += 1; return { calls }; }',
          ]),
        ],
      },
    );
    expect(it.elements.get('oven')?.attributes[0]?.value).toBe(1);
    expect(it.elements.get('fridge')?.attributes[0]?.value).toBe(2);
    const next: ProjectSnapshot = JSON.parse(JSON.stringify(project)) as ProjectSnapshot;
    next.model.elements[2] = { ...next.model.elements[2]!, name: 'Freezer' };
    await it.run({ kind: 'project', project: next });
    expect(it.elements.get('oven')?.attributes[0]?.value).toBe(1);
    expect(it.elements.get('fridge')?.attributes[0]?.value).toBe(4);
  });

  it('drops an answer that is not plain data within its cap, with a warning on the element', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: codeProject() },
      {
        kind: 'packages',
        packages: [runPackage(['export function attributes() { return { "": 1 }; }'])],
      },
    );
    expect(it.elements.get('oven')).toEqual({
      element: 'oven',
      attributes: [],
      problems: [
        {
          code: 'code-answer-dropped',
          message:
            'The answer of attributes from the package "Gauges" on "Oven" was dropped: "" is not a name a computed attribute may have.',
          subjects: ['gauges', 'oven'],
        },
      ],
    });
  });

  it('turns a package off after its calls stop three times in a row, until it is asked again', async () => {
    const it = harness({ callMs: 20 });
    await it.run(
      { kind: 'project', project: codeProject() },
      {
        kind: 'packages',
        packages: [runPackage(['export function attributes() { for (;;) {} }'])],
      },
    );
    expect(it.packages.get('gauges')).toMatchObject({
      state: 'off',
      stops: 3,
      problem: {
        code: 'code-off',
        message:
          'The code of the package "Gauges" is off until the project opens again: its calls stopped 3 times in a row.',
      },
    });
    // Its answers go with it, the warnings on its elements too.
    expect(it.elements.size).toBe(0);
  });

  it('starts off a package the app says stopped three times already', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: codeProject() },
      { kind: 'packages', packages: [runPackage(GAUGES_CODE, { stops: 3 })] },
    );
    expect(it.packages.get('gauges')?.state).toBe('off');
    expect(it.elements.size).toBe(0);
  });

  it('says a module that does not load failed, on the package', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: codeProject() },
      { kind: 'packages', packages: [runPackage(['export function attributes( {'])] },
    );
    expect(it.packages.get('gauges')).toMatchObject({
      state: 'failed',
      problem: { code: 'code-failed' },
    });
  });

  it('forgets the answers of a package no longer asked for', async () => {
    const it = harness();
    await it.run(
      { kind: 'project', project: codeProject() },
      { kind: 'packages', packages: [runPackage()] },
    );
    expect(it.elements.size).toBeGreaterThan(0);
    await it.run({ kind: 'packages', packages: [] });
    expect(it.elements.size).toBe(0);
  });

  it('reads the model with model:read, and calls again when the model changes', async () => {
    const it = harness();
    const code = [
      'export function attributes(element, context) {',
      '  return { all: context.model.elements("gauges.thermometer").length };',
      '}',
    ];
    const project = codeProject(gaugesPackage(code, ['model:read']));
    await it.run(
      { kind: 'project', project },
      {
        kind: 'packages',
        packages: [
          runPackage(code, { granted: ['model:read'], hash: codeHash(code, ['model:read']) }),
        ],
      },
    );
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'all', value: 3, package: 'gauges' },
    ]);
    const next = JSON.parse(JSON.stringify(project)) as ProjectSnapshot;
    next.model.elements.push({ id: 'freezer', component: 'gauges.thermometer', name: 'Freezer' });
    await it.run({ kind: 'project', project: next });
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'all', value: 4, package: 'gauges' },
    ]);
  });

  it('tells the app which package it runs while it works, and when it is done', async () => {
    const it = harness();
    it.runner.receive({ kind: 'project', project: codeProject() });
    it.runner.receive({ kind: 'packages', packages: [runPackage()] });
    await it.runner.settled();
    expect(it.replies.at(-1)).toEqual({ kind: 'idle' });
    expect(it.sandboxes()).toBe(1);
  });
});
