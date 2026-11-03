/**
 * `visual-anything setup-claude` and the app's "Connect Claude…" (ADR 0093, section 3): what they
 * write to Claude Desktop's configuration. Every test works in a folder of its own under the system's
 * temporary folder, never in Claude's real one.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLAUDE_CONFIG_FILE,
  claudeCodeCommand,
  claudeDesktopFolder,
  describeClaudeSetup,
  parseSetupClaudeCommandLine,
  setUpClaude,
  type ClaudeProgram,
} from './claude-setup';

const EXE = '/home/ada/bin/visual-anything-linux-x64';
const EXECUTABLE: ClaudeProgram = { executable: true, path: EXE };
const SOURCES: ClaudeProgram = {
  executable: false,
  entry: {
    command: '/usr/bin/node',
    args: ['/repo/node_modules/tsx/dist/cli.mjs', '/repo/packages/server/src/mcp-cli.ts'],
    env: { TSX_TSCONFIG_PATH: '/repo/packages/server/tsconfig.json' },
  },
};

let folder: string;
let config: string;

beforeEach(async () => {
  folder = join(await mkdtemp(join(tmpdir(), 'va-claude-setup-')), 'Claude');
  config = join(folder, CLAUDE_CONFIG_FILE);
});

afterEach(async () => {
  await rm(join(folder, '..'), { recursive: true, force: true, maxRetries: 10 });
});

/** Writes Claude's configuration as the test has it, as Claude Desktop or a person would have. */
async function writeConfig(text: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(config, text);
}

async function written(): Promise<unknown> {
  return JSON.parse(await readFile(config, 'utf8')) as unknown;
}

describe('setting Claude Desktop up', () => {
  it('creates the configuration, and its folder, when there is none', async () => {
    const setup = await setUpClaude({ folder, program: EXECUTABLE });
    expect(setup).toEqual({
      outcome: 'written',
      config,
      entry: { command: EXE, args: ['mcp'] },
      claudeCode: `claude mcp add visual-anything -- ${EXE} mcp`,
    });
    expect(await written()).toEqual({
      mcpServers: { 'visual-anything': { command: EXE, args: ['mcp'] } },
    });
    // Nothing was there to keep, and no temporary file is left behind.
    expect(await readdir(folder)).toEqual([CLAUDE_CONFIG_FILE]);
  });

  it('adds Visual Anything beside the other servers, changes no other key, and keeps a backup', async () => {
    const before = {
      globalShortcut: 'Ctrl+Space',
      mcpServers: {
        filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
      },
      preferences: { menuBarEnabled: false },
    };
    const text = `${JSON.stringify(before, null, 4)}\n`;
    await writeConfig(text);
    const setup = await setUpClaude({ folder, program: EXECUTABLE });
    expect(setup.outcome).toBe('written');
    expect(setup.backup).toBe(`${config}.bak`);
    expect(await readFile(`${config}.bak`, 'utf8')).toBe(text);
    const after = (await written()) as typeof before;
    expect(after).toEqual({
      ...before,
      mcpServers: {
        ...before.mcpServers,
        'visual-anything': { command: EXE, args: ['mcp'] },
      },
    });
    // The keys keep their order.
    expect(Object.keys(after)).toEqual(['globalShortcut', 'mcpServers', 'preferences']);
  });

  it('adds mcpServers to a configuration that has none', async () => {
    await writeConfig('{"theme":"dark"}');
    await setUpClaude({ folder, program: EXECUTABLE });
    expect(await written()).toEqual({
      theme: 'dark',
      mcpServers: { 'visual-anything': { command: EXE, args: ['mcp'] } },
    });
  });

  it('changes nothing when run again', async () => {
    await writeConfig('{"mcpServers":{"other":{"command":"x"}}}');
    expect((await setUpClaude({ folder, program: EXECUTABLE })).outcome).toBe('written');
    const once = await readFile(config, 'utf8');
    const backup = await readFile(`${config}.bak`, 'utf8');
    const again = await setUpClaude({ folder, program: EXECUTABLE });
    expect(again).toEqual({
      outcome: 'already',
      config,
      entry: { command: EXE, args: ['mcp'] },
      claudeCode: `claude mcp add visual-anything -- ${EXE} mcp`,
    });
    expect(await readFile(config, 'utf8')).toBe(once);
    // The backup still holds the file as it was before the first run.
    expect(await readFile(`${config}.bak`, 'utf8')).toBe(backup);
  });

  it('replaces an entry for Visual Anything that names another executable or project', async () => {
    await writeConfig(
      JSON.stringify({
        mcpServers: { 'visual-anything': { command: '/old/visual-anything', args: ['mcp', '/p'] } },
      }),
    );
    expect((await setUpClaude({ folder, program: EXECUTABLE })).outcome).toBe('written');
    expect(await written()).toEqual({
      mcpServers: { 'visual-anything': { command: EXE, args: ['mcp'] } },
    });
  });

  it('refuses a configuration that is not valid JSON, and changes nothing', async () => {
    const text = '{ "mcpServers": { , }';
    await writeConfig(text);
    const setup = await setUpClaude({ folder, program: EXECUTABLE });
    expect(setup.outcome).toBe('refused');
    expect(setup.why).toMatch(
      /^Claude Desktop’s configuration is not valid JSON, so nothing was changed: /,
    );
    expect(await readFile(config, 'utf8')).toBe(text);
    expect(await readdir(folder)).toEqual([CLAUDE_CONFIG_FILE]);
  });

  it('refuses JSON that is not an object, and mcpServers that is not one', async () => {
    for (const [text, why] of [
      ['[]', 'Claude Desktop’s configuration is not a JSON object, so nothing was changed.'],
      [
        '{"mcpServers":[]}',
        'The servers in Claude Desktop’s configuration, its "mcpServers", are not a JSON object, so nothing was changed.',
      ],
    ] as const) {
      await writeConfig(text);
      const setup = await setUpClaude({ folder, program: EXECUTABLE });
      expect(setup).toMatchObject({ outcome: 'refused', why });
      expect(await readFile(config, 'utf8')).toBe(text);
    }
  });

  it('writes nothing from the sources, and gives the entry and the command to use instead', async () => {
    const setup = await setUpClaude({ folder, program: SOURCES });
    expect(setup).toEqual({
      outcome: 'from-sources',
      config,
      entry: SOURCES.executable ? undefined : SOURCES.entry,
      claudeCode:
        'claude mcp add visual-anything -e TSX_TSCONFIG_PATH=/repo/packages/server/tsconfig.json -- /usr/bin/node /repo/node_modules/tsx/dist/cli.mjs /repo/packages/server/src/mcp-cli.ts',
    });
    await expect(readdir(folder)).rejects.toThrow();
  });

  it('refuses when this computer has no folder for the configuration', async () => {
    const setup = await setUpClaude({ folder: null, program: EXECUTABLE });
    expect(setup).toMatchObject({
      outcome: 'refused',
      why: 'There is no folder for Claude Desktop’s configuration on this computer.',
    });
    expect(setup.config).toBeUndefined();
  });
});

describe('Claude Desktop’s folder', () => {
  it('is in the roaming application data on Windows, Application Support on macOS, and .config elsewhere', () => {
    expect(
      claudeDesktopFolder(
        'win32',
        { APPDATA: 'C:\\Users\\ada\\AppData\\Roaming' },
        'C:\\Users\\ada',
      ),
    ).toBe('C:\\Users\\ada\\AppData\\Roaming\\Claude');
    expect(claudeDesktopFolder('win32', {}, 'C:\\Users\\ada')).toBe(
      'C:\\Users\\ada\\AppData\\Roaming\\Claude',
    );
    expect(claudeDesktopFolder('darwin', {}, '/Users/ada')).toBe(
      '/Users/ada/Library/Application Support/Claude',
    );
    expect(claudeDesktopFolder('linux', {}, '/home/ada')).toBe('/home/ada/.config/Claude');
    expect(claudeDesktopFolder('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/ada')).toBe(
      '/cfg/Claude',
    );
    // A relative variable is passed over, and no home leaves no folder.
    expect(claudeDesktopFolder('linux', { XDG_CONFIG_HOME: 'cfg' }, '/home/ada')).toBe(
      '/home/ada/.config/Claude',
    );
    expect(claudeDesktopFolder('linux', {}, '')).toBeNull();
  });
});

describe('the command for Claude Code', () => {
  it('quotes what a shell would split, and writes Windows paths with forward slashes', () => {
    expect(
      claudeCodeCommand(
        { command: 'C:\\Program Files\\Visual Anything\\visual-anything.exe', args: ['mcp'] },
        'win32',
      ),
    ).toBe(
      'claude mcp add visual-anything -- "C:/Program Files/Visual Anything/visual-anything.exe" mcp',
    );
  });
});

describe('setup-claude on the command line', () => {
  it('reads --help, and refuses anything else', () => {
    expect(parseSetupClaudeCommandLine([])).toEqual({ ok: true, help: false });
    expect(parseSetupClaudeCommandLine(['--help'])).toEqual({ ok: true, help: true });
    expect(parseSetupClaudeCommandLine(['/some/folder'])).toMatchObject({ ok: false });
  });

  it('says what it did, tells the person to restart Claude Desktop, and gives the Claude Code command', async () => {
    const lines = describeClaudeSetup(await setUpClaude({ folder, program: EXECUTABLE }));
    const text = lines.join('\n');
    expect(text).toContain(config);
    expect(text).toContain('Restart Claude Desktop');
    expect(text).toContain(`claude mcp add visual-anything -- ${EXE} mcp`);
  });

  it('from the sources, prints the entry to add by hand', async () => {
    const text = describeClaudeSetup(await setUpClaude({ folder, program: SOURCES })).join('\n');
    expect(text).toContain('nothing was written');
    expect(text).toContain('"TSX_TSCONFIG_PATH": "/repo/packages/server/tsconfig.json"');
    expect(text).toContain('"visual-anything": {');
  });
});
