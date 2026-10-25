/**
 * `visual-anything new <folder> [--from <sample>]` (ADR 0051): writes a new project into a folder that
 * does not exist yet or holds nothing, from one of the sample projects the program holds or empty, and
 * opens it as `visual-anything <folder>` would, with the options given after it.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CommandEnvironment } from './command';
import { runCommand } from './command';
import { toForwardSlashes } from './paths';
import { SAMPLE_IDS, emptyProjectFiles, sampleOf, writeNewProject } from './samples';

export const NEW_USAGE = `Usage: visual-anything new <folder> [--from <sample>] [--port <n>] [--no-open] [--dev]

Starts a new project in folder, which must not exist yet or hold nothing, then opens it as
visual-anything <folder> does. Without --from, the project is empty and uses the built-in Systems
package.

  --from <sample>  Start from a sample project: ${SAMPLE_IDS.join(' or ')}.
  --port <n>       Listen on port n, from 0 to 65535 (default 0: any free port).
  --no-open        Print an address that works once, instead of opening the browser.
  --dev            Serve the app from its sources through Vite, with hot reload.
  -h, --help       Show this help.`;

/** What `new` asks for. */
export interface NewCommandLine {
  folder: string;
  /** The sample to start from; absent for an empty project. */
  from?: string;
  /** What opening the new project gets: the options `visual-anything <folder>` takes. */
  open: string[];
  help: boolean;
}

export type ParsedNewCommandLine =
  { ok: true; value: NewCommandLine } | { ok: false; message: string };

/** Reads the arguments of `new`: one folder, `--from` and the options of opening it. */
export function parseNewCommandLine(argv: readonly string[]): ParsedNewCommandLine {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        from: { type: 'string' },
        port: { type: 'string' },
        'no-open': { type: 'boolean' },
        dev: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { ok: true, value: { folder: '', open: [], help: true } };
  if (positionals.length !== 1) {
    return {
      ok: false,
      message:
        positionals.length === 0
          ? 'Give the folder to start the new project in.'
          : `Give one folder, not ${positionals.length}: ${positionals.join(' ')}.`,
    };
  }
  if (values.from !== undefined && !(SAMPLE_IDS as readonly string[]).includes(values.from)) {
    return {
      ok: false,
      message: `There is no sample "${values.from}"; the samples are ${SAMPLE_IDS.join(' and ')}.`,
    };
  }
  const folder = positionals[0] as string;
  const open = [
    folder,
    ...(values.port === undefined ? [] : ['--port', values.port]),
    ...(values['no-open'] === true ? ['--no-open'] : []),
    ...(values.dev === true ? ['--dev'] : []),
  ];
  return {
    ok: true,
    value: {
      folder,
      ...(values.from === undefined ? {} : { from: values.from }),
      open,
      help: false,
    },
  };
}

/**
 * Runs `new`: resolves with 2 for arguments it does not understand, 1 when the project cannot be
 * written, and otherwise with what opening it gives. `open` opens it; the program's own command by
 * default.
 */
export async function runNewCommand(
  argv: readonly string[],
  environment: CommandEnvironment,
  open: (argv: readonly string[], environment: CommandEnvironment) => Promise<number> = runCommand,
): Promise<number> {
  const parsed = parseNewCommandLine(argv);
  if (!parsed.ok) {
    environment.err(parsed.message);
    environment.err(NEW_USAGE);
    return 2;
  }
  if (parsed.value.help) {
    environment.out(NEW_USAGE);
    return 0;
  }
  const { from, open: openArgs } = parsed.value;
  const folder = resolve(environment.cwd, parsed.value.folder);
  const sample = from === undefined ? undefined : sampleOf(from);
  const written = await writeNewProject(folder, sample?.files ?? emptyProjectFiles(folder));
  if (!written.ok) {
    environment.err(written.message);
    return 1;
  }
  environment.out(
    sample === undefined
      ? `Started an empty project in ${toForwardSlashes(written.folder)}.`
      : `Started "${sample.name}" in ${toForwardSlashes(written.folder)}, from the sample ${sample.id}.`,
  );
  return open(openArgs, environment);
}
