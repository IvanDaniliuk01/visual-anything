/**
 * The sample project whose package holds code (M7): it opens as any project does, with no warning,
 * and its code, once approved, converts, checks and draws as the spec says: a unit converter that
 * computes an attribute, a check, and a gauge drawn inside each thermometer's shape.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packageCodeOf, type ProjectSnapshot } from '@visual-anything/core';
import { formatFile } from '@visual-anything/schema/format';
import { loadNodeEngine } from '@visual-anything/app/src/code/engine-node';
import type { CodeReply, ElementAnswers } from '@visual-anything/app/src/code/messages';
import { CodeRunner } from '@visual-anything/app/src/code/runner';
import { CodeSandbox } from '@visual-anything/app/src/code/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';

const FOLDER = resolve(import.meta.dirname, '../../../examples/gauges');

let session: Session;

beforeAll(async () => {
  const opened = await openSession(FOLDER, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample with package code does not open.');
  session = opened.session;
});

afterAll(async () => {
  await session.close();
});

/** What the runner answers for the sample's approved code, by element. */
async function answers(project: ProjectSnapshot): Promise<Map<string, ElementAnswers>> {
  const engine = await loadNodeEngine();
  const replies: CodeReply[] = [];
  const runner = new CodeRunner({
    // A busy machine never stops a call here: the limit is the sandbox's own business.
    newSandbox: () => Promise.resolve(new CodeSandbox(engine, { callMs: 1000 })),
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
  });
  const file = project.packages.find((each) => each.id === 'plant');
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) throw new Error('The plant package holds no code.');
  runner.receive({ kind: 'project', project });
  runner.receive({
    kind: 'view',
    view: 'readings',
    scale: 1,
    shown: ['boiler', 'water-tank', 'freezer', 'spare'],
  });
  runner.receive({
    kind: 'packages',
    packages: [
      {
        package: 'plant',
        name: code.name,
        hash: code.hash,
        code: code.text,
        declared: code.declared,
        granted: [],
        stops: 0,
      },
    ],
  });
  await runner.settled();
  const found = new Map<string, ElementAnswers>();
  for (const reply of replies) {
    if (reply.kind !== 'answers') continue;
    for (const each of reply.elements) found.set(each.element, each);
    for (const each of reply.cleared) found.delete(each);
  }
  return found;
}

describe('the sample with package code', () => {
  it('opens with no warning, and its files are written as the program writes them', () => {
    expect(session.warnings()).toEqual([]);
    for (const [kind, path] of [
      ['project', 'project.vaproject'],
      ['model', 'model.vamodel'],
      ['package', 'packages/plant.vapackage'],
      ['view', 'views/readings.vaview'],
    ] as const) {
      const text = readFileSync(join(FOLDER, path), 'utf8');
      expect(formatFile(kind, JSON.parse(text) as never)).toBe(text);
    }
  });

  it('converts, checks and draws a gauge in each thermometer once approved', async () => {
    const found = await answers(session.snapshot);
    expect(found.get('boiler')?.attributes).toEqual([
      { name: 'fahrenheit', value: 205, package: 'plant' },
    ]);
    expect(found.get('freezer')?.attributes).toEqual([
      { name: 'fahrenheit', value: 0, package: 'plant' },
    ]);
    expect(found.get('boiler')?.problems.map((each) => each.message)).toEqual([
      '96 °C is over the 90 °C it is rated for.',
    ]);
    expect(found.get('spare')?.problems.map((each) => each.message)).toEqual([
      'It has no reading: set its celsius.',
    ]);
    expect(found.get('water-tank')?.problems).toEqual([]);
    for (const id of ['boiler', 'water-tank', 'freezer', 'spare']) {
      expect(found.get(id)?.drawing?.items.map((each) => each.kind)).toEqual([
        'arc',
        'arc',
        'line',
        'ellipse',
        'text',
      ]);
    }
    // The boiler room is a system, created from no component of the package: none of its code runs.
    expect(found.has('boiler-room')).toBe(false);
  });
});
