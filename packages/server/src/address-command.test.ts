import { describe, expect, it } from 'vitest';
import { runAddress, type AddressEnvironment } from './address-command';
import { NoProgramRunningError, OtherBuildError } from './claude/bridge';

function environment(
  answer: () => Promise<string>,
  asked: (string | undefined)[] = [],
): AddressEnvironment & { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  return {
    cwd: '/work',
    out: (line) => lines.push(line),
    err: (line) => problems.push(line),
    runtimeFolder: '/run',
    attach: (folder) => {
      asked.push(folder);
      return { launchAddress: answer, close: () => {} };
    },
    lines,
    problems,
  };
}

describe('visual-anything address', () => {
  it('prints a new launch address of the program running, never a token', async () => {
    const asked: (string | undefined)[] = [];
    const env = environment(
      () => Promise.resolve('http://127.0.0.1:47700/#launch=abc&theme=dark'),
      asked,
    );
    expect(await runAddress([], env)).toBe(0);
    expect(asked).toEqual([undefined]);
    expect(env.lines).toEqual([
      'Open Visual Anything at this address, which works once, within two minutes: http://127.0.0.1:47700/#launch=abc&theme=dark',
    ]);
  });

  it('asks the program of a folder, resolved from the working folder', async () => {
    const asked: (string | undefined)[] = [];
    const env = environment(() => Promise.resolve('http://127.0.0.1:1/#launch=a'), asked);
    expect(await runAddress(['shop'], env)).toBe(0);
    expect(asked[0]?.replaceAll('\\', '/')).toMatch(/\/work\/shop$/);
  });

  it('says so when nothing runs, or another build does', async () => {
    const none = environment(() =>
      Promise.reject(new NoProgramRunningError('Visual Anything is not running on this project.')),
    );
    expect(await runAddress([], none)).toBe(1);
    expect(none.problems).toEqual([
      'No address was made: Visual Anything is not running on this project.',
    ]);
    const other = environment(() => Promise.reject(new OtherBuildError('Another build runs.')));
    expect(await runAddress([], other)).toBe(1);
    expect(other.problems).toEqual(['Another build runs.']);
  });

  it('shows its help, and refuses what it does not understand', async () => {
    const env = environment(() => Promise.resolve(''));
    expect(await runAddress(['--help'], env)).toBe(0);
    expect(env.lines[0]).toMatch(/^Usage: visual-anything address \[folder\]/);
    expect(await runAddress(['a', 'b'], env)).toBe(2);
    expect(await runAddress(['--nope'], env)).toBe(2);
  });
});
