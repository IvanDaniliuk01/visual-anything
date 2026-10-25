import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPORT_USAGE, parseExportCommandLine, runExport } from './export-command';
import { entryOf } from './main';
import { filesIn, testProject, writeProjectFolder, writeText } from './test-support';

let folder: string;
let project: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-export-'));
  project = join(folder, 'shop');
  await writeProjectFolder(project, testProject());
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs the export command in the test folder, and gives what it wrote and said. */
async function exportWith(argv: readonly string[], options: { terminal?: boolean } = {}) {
  const out: (string | Uint8Array)[] = [];
  const err: string[] = [];
  const code = await runExport(argv, {
    cwd: folder,
    stdout: (data) => out.push(data),
    stdoutIsTerminal: options.terminal ?? false,
    err: (line) => err.push(line),
  });
  return { code, out, err };
}

describe('parseExportCommandLine', () => {
  it('reads the folder, the view, the format, the theme and the file', () => {
    expect(
      parseExportCommandLine([
        'shop',
        '--view',
        'overview',
        '--format',
        'pdf',
        '--theme',
        'dark',
        '--out',
        'a.pdf',
      ]),
    ).toEqual({
      ok: true,
      help: false,
      value: { folder: 'shop', view: 'overview', format: 'pdf', theme: 'dark', out: 'a.pdf' },
    });
    expect(parseExportCommandLine(['shop', '--view', 'v', '--format', 'md'])).toMatchObject({
      value: { theme: 'light' },
    });
    expect(parseExportCommandLine(['--help'])).toEqual({ ok: true, help: true });
  });

  it('says what is missing or wrong', () => {
    const message = (argv: string[]) => {
      const parsed = parseExportCommandLine(argv);
      return parsed.ok ? '' : parsed.message;
    };
    expect(message(['--view', 'v', '--format', 'svg'])).toMatch(/project folder/);
    expect(message(['a', 'b', '--view', 'v', '--format', 'svg'])).toMatch(/one project folder/);
    expect(message(['shop', '--format', 'svg'])).toMatch(/--view/);
    expect(message(['shop', '--view', 'v'])).toMatch(
      /--format: svg, pdf, md, mermaid, structurizr/,
    );
    expect(message(['shop', '--view', 'v', '--format', 'png'])).toMatch(/"png" is no format/);
    expect(message(['shop', '--view', 'v', '--format', 'svg', '--theme', 'blue'])).toMatch(
      /no theme/,
    );
    expect(message(['shop', '--view', 'v', '--format', 'svg', '--colour'])).toMatch(/--colour/);
  });
});

describe('entryOf', () => {
  it('runs the export for the export subcommand, and opens a folder named export written as a path', () => {
    expect(entryOf(['export', 'shop', '--view', 'v'])).toEqual({
      kind: 'export',
      argv: ['shop', '--view', 'v'],
    });
    expect(entryOf(['./export'])).toEqual({ kind: 'program', argv: ['./export'] });
  });
});

describe('runExport', () => {
  it('writes the view to the file it is given, and only that file', async () => {
    const before = await filesIn(project);
    const { code, err } = await exportWith([
      'shop',
      '--view',
      'overview',
      '--format',
      'svg',
      '--out',
      'overview.svg',
    ]);
    expect(code).toBe(0);
    const svg = await readFile(join(folder, 'overview.svg'), 'utf8');
    expect(svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg /);
    expect(svg).toContain('<title id="va-title">Overview</title>');
    expect(svg).toContain('data-element="api"');
    expect(err.at(-1)).toMatch(/^Wrote .*overview\.svg \(\d+(\.\d)? KB\)\.$/);
    expect((await readdir(folder)).sort()).toEqual(['overview.svg', 'shop']);
    expect(await filesIn(project)).toEqual(before);
  });

  it('writes a PDF in the theme asked for, with its fonts', async () => {
    const { code } = await exportWith([
      'shop',
      '--view',
      'overview',
      '--format',
      'pdf',
      '--theme',
      'dark',
      '--out',
      'overview.pdf',
    ]);
    expect(code).toBe(0);
    const pdf = await readFile(join(folder, 'overview.pdf'), 'latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toMatch(/\/FontFile2/);
  }, 60_000);

  it.each([
    ['md', /^# Overview\n/],
    ['mermaid', /\nflowchart /],
    ['structurizr', /\nworkspace "Shop" /],
  ] as const)(
    'writes %s to standard output without --out, and what it lost to standard error',
    async (format, start) => {
      const { code, out, err } = await exportWith([
        'shop',
        '--view',
        'overview',
        '--format',
        format,
      ]);
      expect(code).toBe(0);
      expect(out).toHaveLength(1);
      expect(typeof out[0]).toBe('string');
      expect(out[0]).toMatch(start);
      expect(err.every((line) => line.startsWith('Lost: '))).toBe(true);
      expect(err.length).toBeGreaterThan(0);
      expect((await readdir(folder)).sort()).toEqual(['shop']);
    },
  );

  it('writes a PDF to standard output only when it is not a terminal', async () => {
    const piped = await exportWith(['shop', '--view', 'overview', '--format', 'pdf']);
    expect(piped.code).toBe(0);
    expect(piped.out[0]).toBeInstanceOf(Uint8Array);
    const terminal = await exportWith(['shop', '--view', 'overview', '--format', 'pdf'], {
      terminal: true,
    });
    expect(terminal.code).toBe(2);
    expect(terminal.err[0]).toMatch(/not written to a terminal/);
  }, 60_000);

  it('names the views a project has when the one asked for is not there', async () => {
    const { code, err } = await exportWith(['shop', '--view', 'nowhere', '--format', 'svg']);
    expect(code).toBe(1);
    expect(err).toEqual(['The project has no view "nowhere". Its views: overview.']);
  });

  it('says why a project does not open, and writes nothing', async () => {
    await writeText(project, 'model.vamodel', '{ "world": ');
    const { code, err } = await exportWith([
      'shop',
      '--view',
      'overview',
      '--format',
      'svg',
      '--out',
      'a.svg',
    ]);
    expect(code).toBe(1);
    expect(err[0]).toMatch(/does not open:$/);
    expect(err[1]).toMatch(/^ {2}model\.vamodel/);
    expect((await readdir(folder)).sort()).toEqual(['shop']);
  });

  it('never replaces a project file, a folder or a link, nor makes a folder', async () => {
    const view = await readFile(join(project, 'views', 'overview.vaview'), 'utf8');
    const into = async (out: string) =>
      exportWith(['shop', '--view', 'overview', '--format', 'svg', '--out', out]);
    const asProject = await into('shop/views/overview.vaview');
    expect(asProject.code).toBe(1);
    expect(asProject.err[0]).toMatch(/project file/);
    expect(await readFile(join(project, 'views', 'overview.vaview'), 'utf8')).toBe(view);
    expect((await into('shop')).err[0]).toMatch(/a folder/);
    expect((await into('missing/a.svg')).err[0]).toMatch(/does not exist/);
    await mkdir(join(folder, 'real'));
    await writeFile(join(folder, 'real', 'target.svg'), 'kept');
    let linked = true;
    try {
      await symlink(join(folder, 'real', 'target.svg'), join(folder, 'link.svg'));
    } catch {
      // Windows may refuse links to whoever is not an administrator.
      linked = false;
    }
    if (linked) {
      expect((await into('link.svg')).err[0]).toMatch(/a link/);
      expect(await readFile(join(folder, 'real', 'target.svg'), 'utf8')).toBe('kept');
    }
  });

  it('shows its usage for --help, and for a command line it does not understand', async () => {
    expect(await exportWith(['--help'])).toMatchObject({ code: 0, err: [EXPORT_USAGE] });
    const wrong = await exportWith(['shop']);
    expect(wrong.code).toBe(2);
    expect(wrong.err).toEqual(['Give the view to export with --view <id>.', EXPORT_USAGE]);
  });
});
