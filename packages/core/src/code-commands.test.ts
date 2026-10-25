/**
 * Writing a package's code and its capabilities (ADR 0054): one undoable action, its text kept one
 * line per item, checked before it is stored. Storing code runs nothing.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { codeHash } from './code/hash';
import { CODE_LIMITS } from './code/limits';
import { packageCodeOf } from './code/packages';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state?: ProjectSnapshot): [ProblemCode, string][] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => [each.code, each.message]);
}

const test = (state: ProjectSnapshot) => state.packages.find((each) => each.id === 'test');

const MODULE = 'export function attributes(element) {\n  return { doubled: 2 };\n}\n';

describe('set-package-code', () => {
  it('stores the code one line per item, without its last line ending, and runs nothing', () => {
    const outcome = ok({ type: 'set-package-code', package: 'test', code: MODULE });
    expect(test(outcome.state)?.code).toEqual([
      'export function attributes(element) {',
      '  return { doubled: 2 };',
      '}',
    ]);
    expect(outcome.label).toBe('Add code to the package "Test"');
    expect(outcome.warnings).toEqual([]);
  });

  it('takes the lines as a list too, and any line ending', () => {
    const lines = ok({ type: 'set-package-code', package: 'test', code: ['a();', 'b();'] });
    const text = ok({ type: 'set-package-code', package: 'test', code: 'a();\r\nb();\r' });
    expect(test(lines.state)?.code).toEqual(['a();', 'b();']);
    expect(test(text.state)?.code).toEqual(['a();', 'b();']);
  });

  it('changes the code, then its capabilities, sorted, each as one action', () => {
    const first = ok({ type: 'set-package-code', package: 'test', code: MODULE });
    const changed = ok(
      { type: 'set-package-code', package: 'test', code: 'export const a = 1;' },
      first.state,
    );
    expect(changed.label).toBe('Change the code of the package "Test"');
    const reaching = ok(
      { type: 'set-package-code', package: 'test', capabilities: ['time', 'model:read'] },
      changed.state,
    );
    expect(test(reaching.state)?.capabilities).toEqual(['model:read', 'time']);
    expect(test(reaching.state)?.code).toEqual(['export const a = 1;']);
    expect(reaching.label).toBe('Change what the code of the package "Test" may reach');
    // The hash covers both, so the person is asked again after either change.
    const hashes = [first, changed, reaching].map((each) => packageCodeOf(test(each.state)!)?.hash);
    expect(new Set(hashes).size).toBe(3);
    expect(hashes[2]).toBe(codeHash(['export const a = 1;'], ['model:read', 'time']));
  });

  it('removes the code with its capabilities', () => {
    const first = ok({
      type: 'set-package-code',
      package: 'test',
      code: MODULE,
      capabilities: ['time'],
    });
    const removed = ok({ type: 'set-package-code', package: 'test', code: null }, first.state);
    expect(test(removed.state)).not.toHaveProperty('code');
    expect(test(removed.state)).not.toHaveProperty('capabilities');
    expect(removed.label).toBe('Remove the code of the package "Test"');
  });

  it('changes nothing when the code and the capabilities are as they were', () => {
    const first = ok({
      type: 'set-package-code',
      package: 'test',
      code: MODULE,
      capabilities: ['time'],
    });
    const again = ok(
      { type: 'set-package-code', package: 'test', code: MODULE, capabilities: ['time'] },
      first.state,
    );
    expect(again.operations).toEqual([]);
  });

  it.each<[string, Command, ProblemCode, string]>([
    [
      'a built-in package',
      { type: 'set-package-code', package: 'systems', code: MODULE },
      'built-in-package',
      'The package "systems" is built in and cannot be changed.',
    ],
    [
      'code that is not text',
      { type: 'set-package-code', package: 'test', code: 42 as never },
      'invalid-code',
      "A package's code is JavaScript text, or its lines as a list of texts.",
    ],
    [
      'empty code',
      { type: 'set-package-code', package: 'test', code: ' \n ' },
      'invalid-code',
      'The code has nothing in it; to remove it, set it to null.',
    ],
    [
      'code over its size',
      { type: 'set-package-code', package: 'test', code: 'x'.repeat(CODE_LIMITS.codeText + 1) },
      'invalid-code',
      'The code of the package "Test" would be over 256 KiB; keep it under that.',
    ],
    [
      'a line over its length',
      { type: 'set-package-code', package: 'test', code: ['x'.repeat(CODE_LIMITS.lineLength + 1)] },
      'invalid-code',
      'Line 1 of the code is over 10000 characters.',
    ],
    [
      'a listed line that holds a line break',
      { type: 'set-package-code', package: 'test', code: ['a();\nb();'] },
      'invalid-code',
      'Line 1 of the code holds a line break; give each line as its own text.',
    ],
    [
      'a capability that is not one',
      { type: 'set-package-code', package: 'test', code: MODULE, capabilities: ['files:read'] },
      'invalid-command',
      '"files:read" is not a capability: package code may have "model:read", "time" and "network:" with one web origin.',
    ],
    [
      'too many capabilities',
      {
        type: 'set-package-code',
        package: 'test',
        code: MODULE,
        capabilities: Array.from({ length: 17 }, (_, i) => `network:https://h${i}.example.com`),
      },
      'invalid-command',
      'Package code declares at most 16 capabilities.',
    ],
    [
      'capabilities without code',
      { type: 'set-package-code', package: 'test', capabilities: ['time'] },
      'invalid-code',
      'The package "Test" has no code to give capabilities to.',
    ],
    [
      'nothing to change',
      { type: 'set-package-code', package: 'test' },
      'invalid-command',
      'set-package-code needs the code, the capabilities, or both.',
    ],
  ])('refuses %s', (_, command, code, message) => {
    expect(refused(command)).toEqual([[code, message]]);
  });

  it('undoes exactly, whatever code and capabilities it is given', () => {
    const capability = fc.constantFrom('model:read', 'time', 'network:https://status.example.com');
    fc.assert(
      fc.property(
        fc.option(
          fc.array(
            fc.string({ maxLength: 40 }).filter((line) => !/[\r\n]/.test(line)),
            { minLength: 1, maxLength: 8 },
          ),
          { nil: undefined },
        ),
        fc.option(fc.uniqueArray(capability, { maxLength: 3 }), { nil: undefined }),
        (code, capabilities) => {
          const state = testProject();
          const outcome = run(
            {
              type: 'set-package-code',
              package: 'test',
              ...(code === undefined ? { code: 'export const a = 1;' } : { code }),
              ...(capabilities === undefined ? {} : { capabilities }),
            },
            state,
          );
          if (!outcome.ok) return;
          expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
        },
      ),
    );
  });
});
