/**
 * Claude's tools for package code (ADR 0054): reading a package's code, writing it, and running one
 * of its hooks on an element. Writing code is one undoable action of Claude's, and runs nothing: the
 * code runs only once the person approves it by its hash, in the app, which Claude can never do.
 * Running a hook asks the program whether the code as it is now is approved, and runs it here, in
 * Claude's own process, in the same sandbox the app runs it in, never in the program.
 */
import { stripTypeScriptTypes } from 'node:module';
import {
  CODE_LIMITS,
  HOOK_NAMES,
  builtinPackage,
  checkAttributesAnswer,
  checkDrawAnswer,
  checkProblemsAnswer,
  codePackagesOn,
  codeStatusOf,
  hookInputOf,
  imagesIn,
  modelIndexOf,
  modelReaderOf,
  packageCodeOf,
  type CodeFailure,
  type HookName,
} from '@visual-anything/core';
import { loadNodeEngine } from '@visual-anything/app/src/code/engine-node';
import { CodeSandbox, warmedUp } from '@visual-anything/app/src/code/sandbox';
import { z } from 'zod';
import { READ, WRITE, act, fail, id, ok, tool } from './kit';
import type { Tool, ToolHints } from './tools';

/** The hooks run_package_code runs, one call each. */
const RUN_HOOKS = HOOK_NAMES.filter((each) => each !== 'simulate') as [
  Exclude<HookName, 'simulate'>,
  ...Exclude<HookName, 'simulate'>[],
];

/** Running a hook changes nothing, but runs code: it is not a read. */
const RUN: ToolHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const APPROVAL =
  'The person approves package code in the app, by its hash: in the inspector of one of its elements, or from the package in the Components tab. Claude cannot approve it.';

const readPackageCode = tool({
  name: 'read_package_code',
  title: 'Read a package’s code',
  description: `Reads the code one of the project's own packages holds (ADR 0054): one module of JavaScript that may export three hooks, each a pure function that gets a frozen copy of what it needs and returns plain data:
- attributes(element, context) returns computed attribute values, by name, shown with a mark and never saved: { "fahrenheit": 212 };
- check(element, context) returns problems, shown as warnings: ["Over 90 °C."];
- draw(element, context) returns what to draw inside the shape: { "width": 100, "height": 60, "items": [ … ] }, with items of kinds rectangle, rounded-rectangle, ellipse, line, arc, text and image.
context holds the element's component, its relations and their ends, its containers and contents, and for draw the view and its scale. With the capability "model:read", context.model reads the whole model: element(id), relation(id), elements(component?), relationsOn(id); with "time", Date.now() works.

The answer gives the code, its capabilities, its hash and whether the person approved the code as it is now.

Example: { "package": "gauges" }`,
  input: { package: id().describe('The id of one of the project’s own packages.') },
  hints: READ,
  run: async ({ package: pkg }, program) => {
    const project = await program.project();
    const file = project.packages.find((each) => each.id === pkg);
    if (!file) return fail(`The project uses no package of its own with the id "${pkg}".`);
    const code = packageCodeOf(file);
    if (!code) {
      return ok({
        package: pkg,
        code: null,
        note: 'It holds no code. write_package_code gives it some.',
      });
    }
    const approvals = (await program.codeApprovals?.()) ?? [];
    const status = codeStatusOf(code, approvals);
    return ok({
      package: pkg,
      code: code.text,
      lines: code.text.split('\n').length,
      capabilities: file.capabilities ?? [],
      hash: code.hash,
      approved: status.state === 'approved',
      ...(status.state === 'approved' ? { granted: status.granted } : {}),
      ...(status.state === 'too-large' ? { note: 'It is over 256 KiB, so it never runs.' } : {}),
      ...(status.state === 'unapproved' ? { note: APPROVAL } : {}),
    });
  },
});

const writePackageCode = tool({
  name: 'write_package_code',
  title: 'Write a package’s code',
  description: `Writes the code of one of the project's own packages, its capabilities, or both, as one undoable action of Claude's (ADR 0054). It runs nothing: the person approves the code in the app before it runs, by its hash, and any later change to the code or its capabilities asks them again. Write one module of JavaScript, or TypeScript with "typescript": true, whose types are stripped; it may import nothing, and may not wait at its top. Each hook gets 50 ms and its package 32 MiB; an answer that is not plain data within its cap is dropped. Built-in packages hold no code.

Capabilities: "model:read" (the whole model, read-only), "time" (the clock), "network:<origin>" (kept for live values; nothing fetches yet). Declare only what the code needs: the person grants each.

Example: { "package": "gauges", "code": "export function attributes(element) {\\n  const c = element.attributes.celsius;\\n  return typeof c === 'number' ? { fahrenheit: Math.round(c * 9 / 5 + 32) } : {};\\n}\\nexport function check(element) {\\n  return element.attributes.celsius > 90 ? ['Over 90 °C.'] : [];\\n}" }
Example: { "package": "gauges", "capabilities": ["model:read"] }
Example: { "package": "gauges", "code": null }`,
  input: {
    package: id().describe('The id of one of the project’s own packages.'),
    code: z
      .string()
      .max(CODE_LIMITS.codeText)
      .nullable()
      .optional()
      .describe('The whole module; null removes the code and its capabilities.'),
    typescript: z.boolean().optional().describe('Whether code is TypeScript, to strip its types.'),
    capabilities: z
      .array(z.string())
      .max(CODE_LIMITS.capabilities)
      .nullable()
      .optional()
      .describe('Replaces what the code may reach; null or [] removes them.'),
  },
  hints: WRITE,
  run: async ({ package: pkg, code, typescript, capabilities }, program) => {
    if (builtinPackage(pkg)) {
      return fail(`The package "${pkg}" is built in: it holds no code and cannot be changed.`);
    }
    let text = code;
    if (typeof text === 'string' && typescript === true) {
      try {
        text = stripTypeScriptTypes(text, { mode: 'strip' });
      } catch (error) {
        return fail(
          `The TypeScript could not be turned into JavaScript: ${error instanceof Error ? error.message : String(error)} Write plain JavaScript, or TypeScript with types only.`,
        );
      }
    }
    return act(
      program,
      {
        type: 'set-package-code',
        package: pkg,
        ...(text === undefined ? {} : { code: text }),
        ...(capabilities === undefined ? {} : { capabilities }),
      },
      () => ({ approval: APPROVAL }),
    );
  },
});

const runPackageCode = tool({
  name: 'run_package_code',
  title: 'Run a package’s hook on an element',
  description: `Runs one hook of a package's code on one element and gives what it answered, checked as the app checks it, or why it failed (ADR 0054). It runs only code the person approved as it is now, with the capabilities they granted, in the same sandbox as the app: use it to test code after the person approved it. It changes nothing and shows nothing in the app. The package must define the element's component, or one it derives from.

Example: { "package": "gauges", "element": "oven", "hook": "attributes" }
Example: { "package": "gauges", "element": "oven", "hook": "draw", "view": "kitchen", "scale": 1 }`,
  input: {
    package: id(),
    element: id(),
    // simulate is run_simulation's: it works a run out tick by tick, not one call.
    hook: z.enum(RUN_HOOKS),
    view: id().optional().describe('For draw: the view it is drawn in; the first view by default.'),
    scale: z.number().positive().max(64).optional().describe('For draw: the zoom; 1 by default.'),
  },
  hints: RUN,
  run: async ({ package: pkg, element, hook, view, scale }, program) => {
    const project = await program.project();
    const file = project.packages.find((each) => each.id === pkg);
    const code = file ? packageCodeOf(file) : undefined;
    if (!file || !code) return fail(`The project has no package "${pkg}" that holds code.`);
    if (!modelIndexOf(project).element(element)) {
      return fail(`The project has no element "${element}".`);
    }
    if (!codePackagesOn(project, element).includes(pkg)) {
      return fail(
        `The code of "${pkg}" does not run on "${element}": the element's component, and those it derives from, come from other packages.`,
      );
    }
    // The approval is of this code, by this hash: the code run is the code whose hash was checked.
    const approvals = (await program.codeApprovals?.()) ?? [];
    const status = codeStatusOf(code, approvals);
    if (status.state === 'too-large') return fail('Its code is over 256 KiB, so it never runs.');
    if (status.state !== 'approved') {
      return fail(
        `The code of "${pkg}" as it is now is not approved, so it does not run. ${APPROVAL}`,
      );
    }
    const drawnIn = view ?? project.views[0]?.id;
    const input = hookInputOf(
      project,
      element,
      hook === 'draw' && drawnIn !== undefined ? { view: drawnIn, scale: scale ?? 1 } : undefined,
    );
    if (!input) return fail(`The project has no element "${element}".`);
    const sandbox = new CodeSandbox(await warmEngine());
    try {
      const loaded = sandbox.load({ package: pkg, code: code.text, granted: status.granted });
      if (!loaded.ok) return fail(`The code did not load: ${describeFailure(loaded.failure)}`);
      if (!loaded.hooks.includes(hook)) {
        return fail(
          `The code exports no ${hook}; it exports ${loaded.hooks.length === 0 ? 'no hook' : loaded.hooks.join(', ')}.`,
        );
      }
      const outcome = sandbox.call(
        pkg,
        hook,
        input,
        status.granted.includes('model:read') ? modelReaderOf(project) : undefined,
      );
      if (!outcome.ok) return fail(`The ${hook} hook failed: ${describeFailure(outcome.failure)}`);
      const catalog = imagesIn(project);
      const checked =
        hook === 'attributes'
          ? checkAttributesAnswer(outcome.answer)
          : hook === 'check'
            ? checkProblemsAnswer(outcome.answer)
            : checkDrawAnswer(outcome.answer, (image) => catalog.image(image) !== undefined);
      if (!checked.ok) return fail(`The app would drop its answer: ${checked.reason}.`);
      return ok({ hook, element, answer: checked.value ?? null, ms: Math.round(outcome.ms) });
    } finally {
      sandbox.dispose();
      // An interpreter that failed is not used again.
      if (sandbox.crashed) engine = undefined;
    }
  },
});

/** A QuickJS module, as the app's engine loads one. */
type QuickJSWASMModule = Awaited<ReturnType<typeof loadNodeEngine>>;

/** The interpreter Claude's process runs package code in, kept between calls. */
let engine: Promise<QuickJSWASMModule> | undefined;

/**
 * The interpreter, made once and warmed up on code of its own, so that the first hook it runs is not
 * timed while its WebAssembly is still being compiled.
 */
export function warmEngine(): Promise<QuickJSWASMModule> {
  engine ??= loadNodeEngine().then(warmedUp);
  return engine;
}

/** Lets go of an interpreter that failed, so that the next run makes a new one. */
export function forgetEngine(): void {
  engine = undefined;
}

export function describeFailure(failure: CodeFailure): string {
  switch (failure.kind) {
    case 'threw':
      return failure.message;
    case 'time':
      return `it ran past ${CODE_LIMITS.callMs} ms.`;
    case 'memory':
      return `it took more than ${CODE_LIMITS.memoryBytes / 1024 / 1024} MiB.`;
    case 'answer':
      return `its answer is dropped: ${failure.reason}.`;
  }
}

/** The tools for package code, in the order Claude reads them. */
export const CODE_TOOLS: readonly Tool[] = [readPackageCode, writePackageCode, runPackageCode];
