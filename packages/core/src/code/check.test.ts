import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { TEST_PACKAGE, testProject } from '../test/fixtures';
import { CODE_LIMITS } from './limits';

function withCode(code: string[] | undefined, capabilities?: string[]) {
  const state = testProject();
  state.packages = [
    {
      ...TEST_PACKAGE,
      ...(code === undefined ? {} : { code }),
      ...(capabilities === undefined ? {} : { capabilities }),
    },
  ];
  return state;
}

describe("the check of a project's code", () => {
  it('opens a project with code, and says nothing of code that can run', () => {
    const checked = checkProject(withCode(['export const a = 1;'], ['time']));
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toEqual([]);
  });

  it('warns of code too large to run, of capabilities it cannot read and of capabilities without code', () => {
    const large = Array.from({ length: 30 }, () => 'x'.repeat(CODE_LIMITS.lineLength));
    expect(checkProject(withCode(large)).warnings).toEqual([
      {
        code: 'invalid-code',
        message: 'The code of the package "Test" is over 256 KiB, so it never runs.',
        subjects: ['test'],
      },
    ]);
    expect(
      checkProject(withCode(['export const a = 1;'], ['network:https://bad-.example.com']))
        .warnings,
    ).toEqual([
      {
        code: 'invalid-code',
        message:
          'The package "Test" declares "network:https://bad-.example.com", which is not a capability; its code never gets it.',
        subjects: ['test'],
      },
    ]);
    expect(checkProject(withCode(undefined, ['time'])).warnings).toEqual([
      {
        code: 'invalid-code',
        message: 'The package "Test" declares capabilities but holds no code; they have no effect.',
        subjects: ['test'],
      },
    ]);
  });
});
