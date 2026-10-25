/**
 * What package code's runs, the checks of its answers and of its files say, through the Spanish
 * templates (ADR 0038, ADR 0054): every message, with the parts the code wrote kept as written.
 */
import {
  callProblem,
  checkAttributesAnswer,
  checkDrawAnswer,
  checkProblemsAnswer,
  checkProject,
  loadProblem,
  notApprovedProblem,
  offProblem,
  stalledProblem,
  tooLargeProblem,
  type CodeFailure,
  type HookName,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from '../i18n/translate';
import { NOT_AN_ERROR } from './prelude';
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
