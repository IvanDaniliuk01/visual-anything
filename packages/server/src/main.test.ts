import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_USAGE } from './claude/mcp';
import { DEV_IN_EXECUTABLE } from './executable';
import { browserOpener, entryOf, MERGE_DRIVER_COMMAND, runMcp, runProgram } from './main';
import { MERGE_DRIVER_COMMAND as DRIVER_SUBCOMMAND } from './merge-driver';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Collects what the entry points print on stderr. */
function stderr(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return lines;
}

describe('entryOf', () => {
  it('runs the local program on a folder, or on the current one', () => {
    expect(entryOf(['examples/my-systems', '--no-open'])).toEqual({
      kind: 'program',
      argv: ['examples/my-systems', '--no-open'],
    });
    expect(entryOf([])).toEqual({ kind: 'program', argv: [] });
  });

  it('runs the MCP entry point for the mcp subcommand, with the arguments after it', () => {
    expect(entryOf(['mcp'])).toEqual({ kind: 'mcp', argv: [] });
    expect(entryOf(['mcp', 'C:/projects/shop'])).toEqual({
      kind: 'mcp',
      argv: ['C:/projects/shop'],
    });
  });

  it('runs the merge driver for the merge-driver subcommand, with every argument after it', () => {
    expect(
      entryOf(['merge-driver', '.merge_file_a', '.merge_file_b', '.merge_file_c', 'm.vamodel']),
    ).toEqual({
      kind: 'merge-driver',
      argv: ['.merge_file_a', '.merge_file_b', '.merge_file_c', 'm.vamodel'],
    });
    expect(entryOf(['merge-driver', '--install', '--global'])).toEqual({
      kind: 'merge-driver',
      argv: ['--install', '--global'],
    });
    expect(entryOf(['./merge-driver'])).toEqual({ kind: 'program', argv: ['./merge-driver'] });
  });

  it('runs the comparison for the compare subcommand, with every argument after it', () => {
    expect(entryOf(['compare', 'examples/my-systems', '--base', 'main', '--out', 'out'])).toEqual({
      kind: 'compare',
      argv: ['examples/my-systems', '--base', 'main', '--out', 'out'],
    });
    expect(entryOf(['./compare'])).toEqual({ kind: 'program', argv: ['./compare'] });
  });

  it('names the merge driver in its command as main dispatches it', () => {
    expect(MERGE_DRIVER_COMMAND).toBe(DRIVER_SUBCOMMAND);
  });

  it('opens a folder named mcp when it is written as a path', () => {
    expect(entryOf(['./mcp'])).toEqual({ kind: 'program', argv: ['./mcp'] });
    expect(entryOf(['--no-open', 'mcp'])).toEqual({ kind: 'program', argv: ['--no-open', 'mcp'] });
  });
});

describe('runProgram in the executable', () => {
  it('refuses --dev before opening anything, and says where it works', async () => {
    const err = stderr();
    expect(await runProgram(['examples/my-systems', '--dev'], true)).toBe(2);
    expect(err).toEqual([DEV_IN_EXECUTABLE]);
  });
});

describe('runMcp', () => {
  it('shows its usage under the name it was started by', async () => {
    const err = stderr();
    const usage = MCP_USAGE.replace('visual-anything-mcp', 'visual-anything mcp');
    expect(await runMcp(['--help'], { usage })).toBe(0);
    expect(err).toEqual([usage]);
  });

  it('refuses arguments it does not understand, with its usage', async () => {
    const err = stderr();
    expect(await runMcp(['a', 'b'])).toBe(2);
    expect(err).toEqual(['Give at most one project folder, not 2.', MCP_USAGE]);
  });

  it('refuses --dev in the executable', async () => {
    const err = stderr();
    expect(await runMcp(['--dev'], { executable: true })).toBe(2);
    expect(err).toEqual([DEV_IN_EXECUTABLE]);
  });
});

describe('browserOpener', () => {
  const missing = () =>
    Promise.reject(Object.assign(new Error('spawn xdg-open ENOENT'), { code: 'ENOENT' }));

  it('opens the browser at the address', async () => {
    const opened: string[] = [];
    const openBrowser = browserOpener((url) => {
      opened.push(url);
      return Promise.resolve();
    }, 'linux');
    await openBrowser('http://127.0.0.1:1234/#launch=c0de');
    expect(opened).toEqual(['http://127.0.0.1:1234/#launch=c0de']);
  });

  it('says what is missing when Linux has no xdg-open', async () => {
    await expect(browserOpener(missing, 'linux')('http://127.0.0.1:1/')).rejects.toThrow(
      'xdg-open, which opens the browser on Linux, is not installed; it comes with xdg-utils',
    );
  });

  it('lets other failures through as they are', async () => {
    await expect(browserOpener(missing, 'darwin')('http://127.0.0.1:1/')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
