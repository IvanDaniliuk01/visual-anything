/**
 * What package code's runs, the checks of its answers and of its files say, through the Spanish
 * templates (ADR 0038, ADR 0054): every message, with the parts the code wrote kept as written.
 */
import {
  CODE_LIMITS,
  callProblem,
  checkAttributesAnswer,
  checkChangesAnswer,
  checkDrawAnswer,
  checkExportAnswer,
  checkPanelAnswer,
  checkProblemsAnswer,
  checkProject,
  extensionProblem,
  fileTooLongProblem,
  undeclaredProblem,
  loadProblem,
  notApprovedProblem,
  offProblem,
  turnedOffProblem,
  stalledProblem,
  tooLargeProblem,
  hookInputOf,
  type CodeFailure,
  type HookInput,
  type HookName,
} from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from '../i18n/translate';
import { loadNodeEngine } from './engine-node';
import { NOT_AN_ERROR, REFUSED } from './prelude';
import { CodeSandbox, SANDBOX_REASONS, exportsNo, interpreterFailed } from './sandbox';
import { codeProject, gaugesPackage } from './test/project';

const pkg = { id: 'gauges', name: 'Gauges' };
const oven = { id: 'oven', name: 'Oven' };

/** Every reason the core's checks give for dropping an answer. */
function reasons(): string[] {
  const found: string[] = [];
  const keep = (checked: { ok: boolean; reason?: string }) => {
    if (!checked.ok && checked.reason) found.push(checked.reason);
  };
  for (const answer of [
    [1],
    { '': 1 },
    { a: Number.NaN },
    { a: 'x'.repeat(2000) },
    Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`a${i}`, i])),
    JSON.parse('{"__proto__": 1}') as unknown,
    { a: JSON.parse('{"__proto__": 1}') as unknown },
  ]) {
    keep(checkAttributesAnswer(answer));
  }
  let deep: unknown = 1;
  for (let i = 0; i < 20; i += 1) deep = [deep];
  keep(checkAttributesAnswer({ deep }));
  for (const answer of [{}, [1], ['x'.repeat(301)], Array.from({ length: 17 }, () => 'x')]) {
    keep(checkProblemsAnswer(answer));
  }
  const box = { width: 10, height: 10 };
  for (const answer of [
    [],
    { width: 0, height: 1, items: [] },
    { ...box, items: {} },
    {
      ...box,
      items: Array.from({ length: 257 }, () => ({
        kind: 'rectangle',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      })),
    },
    { ...box, items: [{ kind: 'script' }] },
    { ...box, items: [{ kind: 'rectangle', x: 0, y: 0, width: 1, height: 1, fill: 'red' }] },
    { ...box, items: [{ kind: 'rectangle', x: 1e9, y: 0, width: 1, height: 1 }] },
    { ...box, items: [{ kind: 'text', x: 0, y: 0, text: 'a', href: 'x' }] },
    { ...box, items: [{ kind: 'line', points: [{ x: 0, y: 0 }] }] },
    { ...box, items: [{ kind: 'text', x: 0, y: 0, text: 'x'.repeat(81) }] },
    { ...box, items: [{ kind: 'text', x: 0, y: 0, text: 'a\nb' }] },
    { ...box, items: [{ kind: 'image', image: 'nope', x: 0, y: 0, width: 1, height: 1 }] },
    { ...box, items: [{ kind: 'text', x: 0, y: 0, text: 'x'.repeat(70000) }] },
  ]) {
    keep(checkDrawAnswer(answer, () => false));
  }
  return found;
}

function messages(): string[] {
  const said: string[] = [];
  const failures: CodeFailure[] = [
    { kind: 'threw', message: 'TypeError: x is not a function' },
    { kind: 'threw', message: NOT_AN_ERROR },
    { kind: 'time' },
    { kind: 'memory' },
    ...reasons().map((reason) => ({ kind: 'answer' as const, reason })),
  ];
  for (const hook of ['attributes', 'check', 'draw'] as HookName[]) {
    for (const failure of failures) said.push(callProblem(pkg, hook, oven, failure).message);
  }
  for (const failure of failures.slice(0, 4)) said.push(loadProblem(pkg, failure).message);
  said.push(
    offProblem(pkg).message,
    notApprovedProblem(pkg).message,
    tooLargeProblem(pkg).message,
    stalledProblem(pkg).message,
    turnedOffProblem(pkg).message,
  );
  const files = codeProject(
    gaugesPackage(['export const a = 1;'], ['time', 'network:https://bad-.example.com']),
  );
  for (const warning of checkProject(files).warnings) said.push(warning.message);
  const noCode = codeProject({ ...gaugesPackage(), code: undefined, capabilities: ['time'] });
  for (const warning of checkProject(noCode).warnings) said.push(warning.message);
  return said;
}

describe('what package code says, in Spanish', () => {
  const said = messages();

  it('says it all', () => {
    expect(said.length).toBeGreaterThan(80);
  });

  it('has a Spanish template for every message', () => {
    const missing = said.flatMap((message) => untranslatedParts('es', message));
    expect(missing).toEqual([]);
  });

  it('keeps what the code wrote as it wrote it', () => {
    expect(
      translateMessage(
        'es',
        callProblem(pkg, 'check', oven, {
          kind: 'threw',
          message: 'TypeError: x is not a function',
        }).message,
      ),
    ).toBe(
      'El código del paquete "Gauges" falló en check sobre "Oven": TypeError: x is not a function',
    );
    expect(
      translateMessage(
        'es',
        callProblem(pkg, 'draw', oven, {
          kind: 'answer',
          reason: 'item 3 has a number out of range',
        }).message,
      ),
    ).toBe(
      'Se descartó la respuesta de draw del paquete "Gauges" sobre "Oven": la parte 3 tiene un número fuera de rango.',
    );
  });
});

/** Every reason the core gives for dropping what an action, an importer, an exporter or a panel answered. */
function extensionReasons(): string[] {
  const found: string[] = [];
  const keep = (checked: { ok: boolean; reason?: string }) => {
    if (!checked.ok && checked.reason) found.push(checked.reason);
  };
  let deep: unknown = 1;
  for (let i = 0; i < 24; i += 1) deep = [deep];
  for (const answer of [
    5,
    { x: 1 },
    { label: 5, commands: [] },
    { commands: 5 },
    { commands: Array.from({ length: 501 }, () => ({ type: 'create-element' })) },
    { commands: [{}] },
    { commands: [{ type: 'add-comment' }] },
    { commands: [{ type: 'batch', commands: [5] }] },
    { commands: [{ type: 'create-element', name: 'x'.repeat(1_100_000) }] },
    { commands: [{ type: 'create-element', deep }] },
  ]) {
    keep(checkChangesAnswer(answer, 'Sort'));
  }
  keep(checkExportAnswer(5));
  keep(checkExportAnswer('x'.repeat(CODE_LIMITS.exportText + 1)));
  for (const answer of [
    {},
    Array.from({ length: 65 }, () => ({ kind: 'text', text: 'a' })),
    [5],
    [{ kind: 'heading', text: 'x'.repeat(121) }],
    [{ kind: 'text', text: 5 }],
    [{ kind: 'value', label: 'a' }],
    [{ kind: 'table', columns: [] }],
    [{ kind: 'table', columns: ['a'], rows: [[1, 2]] }],
    [{ kind: 'chart', chart: 'pie' }],
    [{ kind: 'chart', chart: 'bar', labels: [] }],
    [{ kind: 'chart', chart: 'bar', labels: ['a'], series: [] }],
    [{ kind: 'button', label: 5 }],
    [{ kind: 'button', label: 'a', action: 'nope' }],
    [{ kind: 'script' }],
  ]) {
    keep(checkPanelAnswer(answer, ['sort']));
  }
  return found;
}

function extensionMessages(): string[] {
  const sort = { id: 'sort', name: 'Sort by heat' };
  const failures: CodeFailure[] = [
    { kind: 'threw', message: 'TypeError: x is not a function' },
    { kind: 'threw', message: NOT_AN_ERROR },
    { kind: 'time' },
    { kind: 'memory' },
    { kind: 'answer', reason: REFUSED[1]?.(1) ?? '' },
    { kind: 'answer', reason: REFUSED[2]?.(1, CODE_LIMITS.depth + 4) ?? '' },
    { kind: 'answer', reason: REFUSED[3]?.(CODE_LIMITS.changesText) ?? '' },
    { kind: 'answer', reason: REFUSED[4]?.(1) ?? '' },
    ...[
      exportsNo('act'),
      SANDBOX_REASONS.imports,
      SANDBOX_REASONS.stopped,
      SANDBOX_REASONS.silent,
      interpreterFailed('memory access out of bounds'),
      '',
    ].map((message) => ({ kind: 'threw' as const, message })),
    ...extensionReasons().map((reason) => ({ kind: 'answer' as const, reason })),
  ];
  const said: string[] = [];
  for (const hook of ['act', 'importFile', 'exportFile', 'panel'] as const) {
    for (const failure of failures) said.push(extensionProblem(pkg, hook, sort, failure).message);
    said.push(undeclaredProblem(pkg, hook, 'nope').message);
  }
  said.push(fileTooLongProblem(pkg, { id: 'lines', name: 'Lines' }, 'big rooms.txt').message);
  return said;
}

describe('what the hooks that add to the app say, in Spanish', () => {
  it('drops answers for every reason the core has', () => {
    expect(extensionReasons()).toHaveLength(26);
    expect(new Set(extensionReasons()).size).toBe(26);
  });

  it('has a Spanish template for every message', () => {
    const said = extensionMessages();
    expect(said.length).toBeGreaterThan(150);
    expect(said.flatMap((message) => untranslatedParts('es', message))).toEqual([]);
  });

  it('keeps what the code and the person wrote as they wrote them', () => {
    const sort = { id: 'sort', name: 'Sort by heat' };
    expect(
      translateMessage(
        'es',
        extensionProblem(pkg, 'act', sort, { kind: 'threw', message: 'TypeError: no' }).message,
      ),
    ).toBe('El código del paquete "Gauges" falló en act para "Sort by heat": TypeError: no');
    expect(
      translateMessage('es', extensionProblem(pkg, 'act', sort, { kind: 'time' }).message),
    ).toBe('El código del paquete "Gauges" se detuvo en act para "Sort by heat": pasó de 2000 ms.');
    expect(
      translateMessage(
        'es',
        extensionProblem(pkg, 'panel', sort, {
          kind: 'answer',
          reason: 'block 2 is a button that runs no action the package declares',
        }).message,
      ),
    ).toBe(
      'Se descartó la respuesta de panel del paquete "Gauges" para "Sort by heat": el bloque 2 es un botón que no ejecuta ninguna acción que declare el paquete.',
    );
    expect(translateMessage('es', undeclaredProblem(pkg, 'importFile', 'csv').message)).toBe(
      'El paquete "Gauges" no declara ningún importador "csv", así que su código no se llamó.',
    );
    expect(
      translateMessage(
        'es',
        fileTooLongProblem(pkg, { id: 'lines', name: 'Lines' }, 'big rooms.txt').message,
      ),
    ).toBe(
      `"big rooms.txt" pasa de ${CODE_LIMITS.importText} caracteres, así que el importador "Lines" del paquete "Gauges" no lo leyó.`,
    );
  });
});

describe('why the sandbox itself could not run package code, in Spanish', () => {
  let engine: QuickJSWASMModule;
  beforeAll(async () => {
    engine = await loadNodeEngine();
  });

  /** How a module fails to load, or how its hook fails when it is called, in the real sandbox. */
  function failureOf(code: string, hook: HookName = 'attributes'): CodeFailure | undefined {
    const sandbox = new CodeSandbox(engine, { callMs: 250 });
    const loaded = sandbox.load({ package: 'gauges', code, granted: [] });
    if (!loaded.ok) return loaded.failure;
    const called = sandbox.call('gauges', hook, hookInputOf(codeProject(), 'oven') as HookInput);
    sandbox.dispose();
    return called.ok ? undefined : called.failure;
  }

  function ownReasons(): string[] {
    const loading = [
      'import x from "./other.js";\nexport const a = x;',
      'await 1;\nexport const a = 1;',
      'throw "";',
    ].map((code) => failureOf(code));
    const calling = [
      failureOf('export function attributes() { return import("./x.js"); }'),
      failureOf('export function check() { return []; }', 'draw'),
      failureOf('export function attributes() { throw ""; }'),
    ];
    // What is said once the interpreter itself failed, which keeps only the engine's words as they
    // are, and of an error that says nothing.
    const crashed: CodeFailure[] = [
      SANDBOX_REASONS.stopped,
      interpreterFailed('memory access out of bounds'),
      '',
    ].map((message) => ({ kind: 'threw', message }));
    return [
      ...[...loading, ...crashed].map(
        (failure) => loadProblem(pkg, failure as CodeFailure).message,
      ),
      ...[...calling, ...crashed].map(
        (failure) => callProblem(pkg, 'attributes', oven, failure as CodeFailure).message,
      ),
    ];
  }

  it('says each reason in its own words, not as an error the code threw', () => {
    const said = ownReasons();
    expect(said).toHaveLength(12);
    expect(
      said.filter((message) => /Package code|The interpreter|The package exports/.test(message)),
    ).toEqual([]);
  });

  it('has a Spanish template for every reason, keeping only the engine’s words as they are', () => {
    expect(ownReasons().flatMap((message) => untranslatedParts('es', message))).toEqual([]);
    expect(
      translateMessage(
        'es',
        loadProblem(pkg, { kind: 'threw', message: SANDBOX_REASONS.waits }).message,
      ),
    ).toBe(
      'El código del paquete "Gauges" no se cargó: espera en el nivel superior de su módulo, y el código de un paquete no puede hacerlo',
    );
    expect(
      translateMessage(
        'es',
        callProblem(pkg, 'check', oven, {
          kind: 'threw',
          message: interpreterFailed('memory access out of bounds'),
        }).message,
      ),
    ).toBe(
      'El código del paquete "Gauges" falló en check sobre "Oven": falló el intérprete: memory access out of bounds',
    );
  });
});
