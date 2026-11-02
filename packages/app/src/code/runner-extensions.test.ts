/**
 * The hooks that add to the app (ADR 0089) in the code runner, through the real QuickJS engine: an
 * action, an importer, an exporter and a panel, each called only for what the package declares and
 * only in approved code, with its input frozen; answers the core's checks drop, with the reason;
 * `act` stopped at 2 s and `panel` at 50 ms, counting towards turning the package off; and each call
 * run alone, ahead of the canvas's hooks, which answer again once it ends.
 */
import { CODE_LIMITS, codeHash } from '@visual-anything/core';
import type { Capability, PackageExtensions } from '@visual-anything/schema';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadNodeEngine } from './engine-node';
import type {
  CodeReply,
  CodeRequest,
  ElementAnswers,
  ExtensionCall,
  PackageRun,
  RunPackage,
} from './messages';
import { CodeRunner, type RunnerOptions } from './runner';
import { CodeSandbox, type SandboxOptions } from './sandbox';
import { codeProject } from './test/project';

/** Generous: a call of 2 s, and an engine slow under load. */
const LONG = 60_000;

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

const CODE = [
  'let acted = 0;',
  'export function attributes(element) { return { acted }; }',
  'export function act(input, context) {',
  '  acted += 1;',
  '  if (input.action === "slow") { for (;;) {} }',
  '  if (input.action === "junk") return { commands: 5 };',
  '  if (input.action === "frozen") {',
  '    const tried = [];',
  '    try { input.selection.push("x"); tried.push("selection"); } catch (error) {}',
  '    try { input.action = "other"; tried.push("action"); } catch (error) {}',
  '    try { context.extra = 1; tried.push("context"); } catch (error) {}',
  '    return { label: "Changed: " + (tried.join(", ") || "nothing"), commands: [] };',
  '  }',
  '  if (input.action === "deep") {',
  '    let value = 1;',
  '    for (let i = 0; i < 15; i += 1) value = [value];',
  '    return { commands: [{ type: "set-attribute", element: "oven", name: "deep", value }] };',
  '  }',
  '  const names = input.selection.map((id) => context.model ? context.model.element(id).name : id);',
  '  return {',
  '    label: "Name " + names.join(", "),',
  '    commands: names.map((name) => ({',
  '      type: "create-element",',
  '      element: { component: "essence", name: name + " twin" },',
  '    })),',
  '  };',
  '}',
  'export function importFile(input) {',
  '  return {',
  '    commands: input.text.split("\\n").filter((line) => line !== "").map((name) => ({',
  '      type: "create-element",',
  '      element: { component: "essence", name },',
  '    })),',
  '  };',
  '}',
  'export function exportFile(input, context) {',
  '  if (input.exporter === "number") return 5;',
  '  if (input.exporter === "breaks") return "\\n".repeat(2200000);',
  '  const ids = context.model ? context.model.elements("gauges.thermometer") : [];',
  '  return input.exporter + " of " + (input.view ?? "the model") + ": " + ids.join(" ");',
  '}',
  'export function panel(input) {',
  '  if (input.panel === "slow") { for (;;) {} }',
  '  return [',
  '    { kind: "heading", text: "Health of " + input.element },',
  '    { kind: "value", label: "Acted", value: acted },',
  '    { kind: "button", label: "Name it", action: "name-them" },',
  '  ];',
  '}',
];

const EXTENSIONS: PackageExtensions = {
  actions: [
    { id: 'name-them', label: 'Name them', where: ['selection'] },
    { id: 'slow', label: 'Think long', where: ['packages-menu'] },
    { id: 'junk', label: 'Answer junk', where: ['packages-menu'] },
    { id: 'frozen', label: 'Change the input', where: ['packages-menu'] },
    { id: 'deep', label: 'Nest deep', where: ['packages-menu'] },
  ],
  importers: [{ id: 'lines', label: 'Lines', extensions: ['.txt'] }],
  exporters: [
    { id: 'ids', label: 'Thermometers', extension: '.txt' },
    { id: 'number', label: 'A number', extension: '.txt' },
    { id: 'breaks', label: 'Line breaks', extension: '.txt' },
  ],
  panels: [
    { id: 'health', label: 'Health' },
    { id: 'slow', label: 'Slow health' },
  ],
};

function runPackage(granted: Capability[] = [], extra: Partial<RunPackage> = {}): RunPackage {
  return {
    package: 'gauges',
    name: 'Gauges',
    hash: codeHash(CODE, [], EXTENSIONS),
    code: CODE.join('\n'),
    declared: [],
    granted,
    stops: 0,
    extensions: EXTENSIONS,
    ...extra,
  };
}

/** A runner over the node engine, with what it said gathered: answers by call, and the rest. */
function harness(
  sandboxOptions: SandboxOptions = { callMs: 250 },
  options: Partial<RunnerOptions> = {},
) {
  const replies: CodeReply[] = [];
  const runner = new CodeRunner({
    newSandbox: () => Promise.resolve(new CodeSandbox(engine, sandboxOptions)),
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
    ...options,
  });
  const elements = new Map<string, ElementAnswers>();
  const packages = new Map<string, PackageRun>();
  let calls = 0;
  return {
    runner,
    replies,
    elements,
    packages,
    async run(...requests: CodeRequest[]) {
      for (const request of requests) runner.receive(request);
      await runner.settled();
      for (const reply of replies) {
        if (reply.kind !== 'answers') continue;
        for (const each of reply.elements) elements.set(each.element, each);
        for (const each of reply.cleared) elements.delete(each);
        for (const each of reply.packages) packages.set(each.package, each);
      }
    },
    /** Asks for one call and answers what came back for it, and whether its code started. */
    async call(call: ExtensionCall, pkg = 'gauges') {
      calls += 1;
      const number = calls;
      await this.run({ kind: 'extension/call', call: number, package: pkg, ...call });
      const started = replies.some(
        (reply) => reply.kind === 'extension/running' && reply.call === number,
      );
      const answered = replies.find(
        (reply) => reply.kind === 'extension/answer' && reply.call === number,
      );
      if (answered?.kind !== 'extension/answer') throw new Error(`No answer to call ${number}`);
      return { answer: answered.answer, started };
    },
  };
}

async function started(granted: Capability[] = [], sandboxOptions?: SandboxOptions) {
  const it = harness(sandboxOptions);
  await it.run(
    { kind: 'project', project: codeProject() },
    { kind: 'packages', packages: [runPackage(granted)] },
  );
  return it;
}

describe('the hooks that add to the app, in the code runner', () => {
  it(
    'runs an action on the selection, reading the model with model:read, and answers its changes',
    async () => {
      const it = await started(['model:read']);
      const { answer, started: ran } = await it.call({
        hook: 'act',
        input: { action: 'name-them', selection: ['oven', 'fridge'], view: 'kitchen' },
      });
      expect(ran).toBe(true);
      expect(answer).toEqual({
        ok: true,
        value: {
          label: 'Name Oven, Fridge',
          commands: [
            { type: 'create-element', element: { component: 'essence', name: 'Oven twin' } },
            { type: 'create-element', element: { component: 'essence', name: 'Fridge twin' } },
          ],
        },
      });
      // Without model:read, the code reads no model: only the ids it was given.
      const plain = await started();
      expect(
        (await plain.call({ hook: 'act', input: { action: 'name-them', selection: ['oven'] } }))
          .answer,
      ).toMatchObject({ ok: true, value: { label: 'Name oven' } });
    },
    LONG,
  );

  it(
    'reads a file with an importer, writes one with an exporter, and answers a panel',
    async () => {
      const it = await started(['model:read']);
      expect(
        (
          await it.call({
            hook: 'importFile',
            input: { importer: 'lines', name: 'rooms.txt', text: 'Hall\n\nAttic\n' },
          })
        ).answer,
      ).toEqual({
        ok: true,
        value: {
          // With no label of its own, the importer's.
          label: 'Lines',
          commands: [
            { type: 'create-element', element: { component: 'essence', name: 'Hall' } },
            { type: 'create-element', element: { component: 'essence', name: 'Attic' } },
          ],
        },
      });
      expect(
        (await it.call({ hook: 'exportFile', input: { exporter: 'ids', view: 'kitchen' } })).answer,
      ).toEqual({ ok: true, value: 'ids of kitchen: oven fridge loose' });
      // A text within the cap, though longer than it as JSON, where each line break takes two.
      const breaks = await it.call({ hook: 'exportFile', input: { exporter: 'breaks' } });
      expect(breaks.answer.ok && breaks.answer.value).toHaveLength(2_200_000);
      expect(
        (await it.call({ hook: 'panel', input: { panel: 'health', element: 'oven' } })).answer,
      ).toEqual({
        ok: true,
        value: [
          { kind: 'heading', text: 'Health of oven' },
          { kind: 'value', label: 'Acted', value: 0 },
          { kind: 'button', label: 'Name it', action: 'name-them' },
        ],
      });
    },
    LONG,
  );

  it(
    'hands the code its input frozen, and takes changes that nest as deep as the core does',
    async () => {
      const it = await started();
      expect(
        (await it.call({ hook: 'act', input: { action: 'frozen', selection: ['oven'] } })).answer,
      ).toMatchObject({ ok: true, value: { label: 'Changed: nothing' } });
      // Nested 18 levels in all: past the 16 the canvas's hooks may answer, within the core's 20.
      expect(
        (await it.call({ hook: 'act', input: { action: 'deep', selection: [] } })).answer,
      ).toMatchObject({ ok: true, value: { commands: [{ type: 'set-attribute' }] } });
    },
    LONG,
  );

  it(
    'drops an answer the core’s checks refuse, naming the package, the hook and the reason',
    async () => {
      const it = await started();
      expect(
        (await it.call({ hook: 'act', input: { action: 'junk', selection: [] } })).answer,
      ).toEqual({
        ok: false,
        problem: {
          code: 'code-answer-dropped',
          message:
            'The answer of act from the package "Gauges" for "Answer junk" was dropped: its commands are not a list.',
          subjects: ['gauges'],
        },
      });
      expect(
        (await it.call({ hook: 'exportFile', input: { exporter: 'number' } })).answer,
      ).toMatchObject({
        ok: false,
        problem: {
          message:
            'The answer of exportFile from the package "Gauges" for "A number" was dropped: it is not a text.',
        },
      });
      // An answer dropped is not a call that stopped.
      expect(it.packages.get('gauges')).toMatchObject({ state: 'running', stops: 0 });
    },
    LONG,
  );

  it(
    'refuses what the package does not declare, and a file too long, without calling its code',
    async () => {
      const it = await started();
      const undeclared = await it.call({ hook: 'act', input: { action: 'nope', selection: [] } });
      expect(undeclared).toEqual({
        started: false,
        answer: {
          ok: false,
          problem: {
            code: 'code-failed',
            message: 'The package "Gauges" declares no action "nope", so its code was not called.',
            subjects: ['gauges'],
          },
        },
      });
      for (const call of [
        { hook: 'importFile', input: { importer: 'csv', name: 'a.csv', text: '' } },
        { hook: 'exportFile', input: { exporter: 'csv' } },
        { hook: 'panel', input: { panel: 'nope', element: 'oven' } },
      ] as ExtensionCall[]) {
        const refused = await it.call(call);
        expect(refused.started).toBe(false);
        expect(refused.answer).toMatchObject({ ok: false, problem: { code: 'code-failed' } });
      }
      const long = await it.call({
        hook: 'importFile',
        input: {
          importer: 'lines',
          name: 'huge.txt',
          text: 'x'.repeat(CODE_LIMITS.importText + 1),
        },
      });
      expect(long.started).toBe(false);
      expect(long.answer).toMatchObject({
        ok: false,
        problem: {
          message: `"huge.txt" is over ${CODE_LIMITS.importText} characters, so the importer "Lines" of the package "Gauges" did not read it.`,
        },
      });
      // No call reached the code: `act` counts each one it gets.
      expect(it.elements.get('oven')?.attributes).toEqual([
        { name: 'acted', value: 0, package: 'gauges' },
      ]);
    },
    LONG,
  );

  it(
    'never runs code that is not approved, nor a package the app does not run',
    async () => {
      const it = harness();
      await it.run(
        { kind: 'project', project: codeProject() },
        // Its hash is of other code: the code it holds now was never approved.
        { kind: 'packages', packages: [runPackage([], { hash: codeHash(['x'], [], EXTENSIONS) })] },
      );
      const unapproved = await it.call({
        hook: 'act',
        input: { action: 'name-them', selection: ['oven'] },
      });
      expect(unapproved.started).toBe(false);
      expect(unapproved.answer).toMatchObject({
        ok: false,
        problem: {
          code: 'code-not-approved',
          message:
            'The code of the package "Gauges" is not approved: the person approves it in the app before it runs.',
        },
      });
      const other = await it.call(
        { hook: 'panel', input: { panel: 'health', element: 'oven' } },
        'clinic',
      );
      expect(other.started).toBe(false);
      expect(other.answer).toMatchObject({ ok: false, problem: { code: 'code-not-approved' } });
    },
    LONG,
  );

  it(
    'stops an action at 2 s, and counts it as a call that stopped',
    async () => {
      const it = await started([], {});
      const started_ = performance.now();
      const { answer, started: ran } = await it.call({
        hook: 'act',
        input: { action: 'slow', selection: [] },
      });
      const took = performance.now() - started_;
      expect(ran).toBe(true);
      expect(took).toBeGreaterThanOrEqual(CODE_LIMITS.extensionCallMs);
      expect(answer).toEqual({
        ok: false,
        problem: {
          code: 'code-stopped',
          message:
            'The code of the package "Gauges" was stopped in act for "Think long": it ran past 2000 ms.',
          subjects: ['gauges'],
        },
      });
      expect(it.packages.get('gauges')).toMatchObject({
        state: 'running',
        stops: 1,
        problem: { code: 'code-stopped' },
      });
    },
    LONG,
  );

  it(
    'stops a panel at 50 ms',
    async () => {
      const it = await started([], {});
      const { answer } = await it.call({
        hook: 'panel',
        input: { panel: 'slow', element: 'oven' },
      });
      expect(answer).toMatchObject({
        ok: false,
        problem: {
          code: 'code-stopped',
          message:
            'The code of the package "Gauges" was stopped in panel for "Slow health": it ran past 50 ms.',
        },
      });
      expect(it.packages.get('gauges')?.stops).toBe(1);
    },
    LONG,
  );

  it(
    'turns the package off after three calls in a row stop, and takes back what it answered',
    async () => {
      const it = await started([], { callMs: 250, extensionCallMs: 100 });
      expect(it.elements.get('oven')?.attributes).toHaveLength(1);
      for (let i = 0; i < 3; i += 1) {
        await it.call({ hook: 'act', input: { action: 'slow', selection: [] } });
      }
      expect(it.packages.get('gauges')).toMatchObject({
        state: 'off',
        stops: 3,
        problem: { code: 'code-off' },
      });
      expect(it.elements.has('oven')).toBe(false);
      const after = await it.call({ hook: 'panel', input: { panel: 'health', element: 'oven' } });
      expect(after.started).toBe(false);
      expect(after.answer).toMatchObject({ ok: false, problem: { code: 'code-off' } });
    },
    LONG,
  );

  it(
    'runs a call alone, ahead of the canvas’s hooks, which answer again once it ends',
    async () => {
      // A slice after each hook's call, and the call asked for in the first pause: the round of
      // the canvas's hooks is under way when it comes.
      let asked = false;
      const it = harness(
        { callMs: 250, extensionCallMs: 300 },
        {
          sliceMs: -1,
          pause: () => {
            if (!asked) {
              asked = true;
              it.runner.receive({
                kind: 'extension/call',
                call: 1,
                package: 'gauges',
                hook: 'act',
                input: { action: 'slow', selection: [] },
              });
            }
            return Promise.resolve();
          },
        },
      );
      await it.run(
        { kind: 'project', project: codeProject() },
        { kind: 'packages', packages: [runPackage()] },
      );
      const kinds = it.replies.map((reply) =>
        reply.kind === 'answers'
          ? `answers:${reply.elements.map((e) => e.element).join(',')}`
          : reply.kind,
      );
      const running = kinds.indexOf('extension/running');
      const answered = kinds.indexOf('extension/answer');
      // The worker says the call starts, then nothing else until it answers.
      expect(running).toBeGreaterThan(0);
      expect(answered).toBe(running + 1);
      // Some of the round's answers came before it, the rest after: the round went on.
      const before = kinds.slice(0, running).filter((kind) => kind.startsWith('answers:oven'));
      const after = kinds
        .slice(answered)
        .filter((kind) => kind.startsWith('answers:') && kind !== 'answers:');
      expect(before.length).toBeGreaterThan(0);
      expect(after.length).toBeGreaterThan(0);
      expect(kinds.at(-1)).toBe('idle');
      expect(it.elements.get('fridge')?.attributes).toEqual([
        { name: 'acted', value: 1, package: 'gauges' },
      ]);
    },
    LONG,
  );
});
