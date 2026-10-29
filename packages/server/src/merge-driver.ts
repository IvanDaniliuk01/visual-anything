/**
 * The merge driver (ADR 0072), the program git runs to merge two edits of one project file by id:
 *
 *   visual-anything merge-driver <ancestor> <ours> <theirs> <path> [<ours' name> <theirs' name>]
 *   visual-anything merge-driver --install [--global] [--no-attributes]
 *   visual-anything merge-driver --uninstall [--global]
 *
 * Git runs the first as `merge-driver %O %A %B %P %X %Y` once the person's own configuration defines
 * it. It reads the three files git wrote as regular files within their kind's cap, takes the kind
 * from the path's extension and nothing else from the path, merges them in the core (`mergeFile`),
 * and writes the result over ours in the stable key order, atomically. It exits 0 when the file holds
 * no conflicts and 1 when it does, or when an input does not read, which leaves ours as it was. It
 * runs no program, opens no network and loads nothing from the repository.
 *
 * `--install` is the one thing that writes the person's git configuration, and only when they run it:
 * the two keys git needs, through `git config` with arguments, and the seven lines of `.gitattributes`
 * that name the driver for the seven kinds. `--uninstall` takes the two keys out again.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_PACKAGES, mergeFile } from '@visual-anything/core';
import {
  FILE_EXTENSIONS,
  FILE_KINDS,
  fileKindOf,
  type ConflictSides,
  type FileContentByKind,
  type FileKind,
  type Id,
} from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { parseFile, validateFile } from '@visual-anything/schema/validate';
import { errorReason } from './errors';
import { isExecutable } from './executable';
import { capOf, describeCap, readRegularFile } from './regular-files';
import { findGit, fixedOptions, gitEnvironment, type Spawn } from './versions/git';
import { writeFileAtomic } from './writer';

/** The subcommand that runs the merge driver, and that installs it. */
export const MERGE_DRIVER_COMMAND = 'merge-driver';

/** The driver's name in git's configuration and in `.gitattributes`: `merge=visual-anything`. */
export const DRIVER_NAME = 'visual-anything';

/** The two keys of git's configuration that define the driver, and the only ones `--install` writes. */
export const DRIVER_KEYS = {
  name: `merge.${DRIVER_NAME}.name`,
  driver: `merge.${DRIVER_NAME}.driver`,
} as const;

/** What `merge.visual-anything.name` says, which git shows in its messages. */
export const DRIVER_TITLE = 'Visual Anything: project files merged by id';

/**
 * What git puts after the program in the driver's command: the ancestor, ours and theirs (three
 * temporary files), the file's path, and the labels of ours and theirs (git 2.44 and later; an older
 * git passes `%X` and `%Y` as they are, which the driver takes as no names).
 */
export const DRIVER_PLACEHOLDERS = '%O %A %B %P %X %Y';

/** The seven lines of `.gitattributes` that name the driver for the seven kinds of project file. */
export const ATTRIBUTE_LINES: readonly string[] = FILE_KINDS.map(
  (kind) => `*${FILE_EXTENSIONS[kind]} merge=${DRIVER_NAME}`,
);

export const MERGE_DRIVER_USAGE = `Usage:
  visual-anything merge-driver <ancestor> <ours> <theirs> <path> [<ours' name> <theirs' name>]
  visual-anything merge-driver --install [--global] [--no-attributes]
  visual-anything merge-driver --uninstall [--global]

Git runs the first to merge two edits of a project file by id, once your git configuration defines
the driver; what clashes stays in the file as conflicts, which Visual Anything resolves.
--install defines it in this repository's git configuration, or in your own with --global, and adds
the lines that name it to the repository's .gitattributes, unless --no-attributes.
--uninstall takes the definition out again.`;

/** Where the merge driver runs and what it says. */
export interface MergeDriverIo {
  /** The folder git runs the driver in, which the input paths are relative to. */
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  /** For `--install` and `--uninstall` only. */
  install?: InstallOptions;
}

/** What installing needs to know beyond the command line; each defaults to this process's own. */
export interface InstallOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** How this program is started, which the driver's command names. */
  program?: ProgramCommand;
  spawn?: Spawn;
}

/** Runs `merge-driver` with the arguments after it, and resolves with the exit code. */
export async function runMergeDriver(argv: readonly string[], io: MergeDriverIo): Promise<number> {
  const [first] = argv;
  if (first === '--help' || first === '-h') {
    io.out(MERGE_DRIVER_USAGE);
    return 0;
  }
  if (first === '--install' || first === '--uninstall') {
    const options = parseInstall(argv);
    if (options === undefined) return usage(io);
    return first === '--install' ? install(options, io) : uninstall(options.global, io);
  }
  // Git's temporary files never start with "-": a first argument that does is a mistyped option.
  if (first === undefined || first.startsWith('-') || argv.length < 4 || argv.length > 6) {
    return usage(io);
  }
  const [ancestor, ours, theirs, path, oursName, theirsName] = argv as [
    string,
    string,
    string,
    string,
    string?,
    string?,
  ];
  const sides = sidesOf(oursName, theirsName);
  return mergeInputs({ ancestor, ours, theirs, path, ...(sides ? { sides } : {}) }, io);
}

function usage(io: MergeDriverIo): number {
  io.err(MERGE_DRIVER_USAGE);
  return 2;
}

// ——— Merging ———

/** The relation types of the built-in packages that nest, by which a model's merge finds cycles. */
export const BUILTIN_NESTING: ReadonlySet<Id> = new Set(
  BUILTIN_PACKAGES.flatMap((file) =>
    file.relationTypes.filter((type) => type.nests === true).map((type) => type.id),
  ),
);

/** The three files git gave, the file's path in the repository, and the names of the two sides. */
export interface DriverInputs {
  ancestor: string;
  ours: string;
  theirs: string;
  path: string;
  sides?: ConflictSides;
}

/** The most characters a side's name keeps, as the schema allows. */
const SIDE_NAME_LENGTH = 200;

/**
 * The names of the two sides as a conflict keeps them: each without control characters and cut to
 * 200 characters; a name git did not give, which is empty, or `%X` or `%Y` from a git older than
 * 2.44, is left out.
 */
export function sidesOf(
  ours: string | undefined,
  theirs: string | undefined,
): ConflictSides | undefined {
  const clean = (name: string | undefined, placeholder: string) => {
    if (name === undefined || name === placeholder) return undefined;
    // eslint-disable-next-line no-control-regex -- control characters are what it drops
    const kept = [...name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')]
      .slice(0, SIDE_NAME_LENGTH)
      .join('');
    return kept.trim() === '' ? undefined : kept;
  };
  const sides: ConflictSides = {};
  const mine = clean(ours, '%X');
  const yours = clean(theirs, '%Y');
  if (mine !== undefined) sides.ours = mine;
  if (yours !== undefined) sides.theirs = yours;
  return mine === undefined && yours === undefined ? undefined : sides;
}

/**
 * A path as the driver shows it: control characters, and the characters that turn the direction of
 * text, escaped as `\u{1b}`, so that a path cannot write to the terminal or hide what it says.
 */
export function shownPath(path: string): string {
  return path.replace(UNSHOWN, (each) => `\\u{${each.codePointAt(0)!.toString(16)}}`);
}

/** Control characters, and those that turn the direction of text. */
const UNSHOWN =
  // eslint-disable-next-line no-control-regex -- control characters are what it escapes
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/** A path as a word of the shell, for a command the person can copy. */
function shellWordOf(path: string): string {
  return /^[\w./@:+-]+$/.test(path) && !path.startsWith('-') ? path : shellQuote(path);
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

type Read<K extends FileKind> =
  { ok: true; value: FileContentByKind[K] | undefined } | { ok: false; why: string };

/** Reads one of the three inputs as a valid file of its kind; the ancestor may be empty. */
async function readInput<K extends FileKind>(
  kind: K,
  which: 'the common ancestor' | 'ours' | 'theirs',
  file: string,
  cwd: string,
): Promise<Read<K>> {
  // Git writes the three in the folder it runs the driver in, by names relative to it.
  const read = await readRegularFile(resolve(cwd, file), capOf(kind), { inside: cwd });
  const named = `${which} (${shownPath(file)})`;
  if (!read.ok) {
    switch (read.reason) {
      case 'missing':
        return { ok: false, why: `${named} does not exist.` };
      case 'link':
        return {
          ok: false,
          why: `${named} is a link, or lies outside the folder git runs the driver in; the merge driver reads only regular files there.`,
        };
      case 'not-regular':
        return { ok: false, why: `${named} is not a regular file.` };
      case 'too-large':
        return {
          ok: false,
          why: `${named} holds more than ${describeCap(capOf(kind))}, the most a ${FILE_EXTENSIONS[kind]} file may hold.`,
        };
      case 'changed':
        return { ok: false, why: `${named} changed while it was being read.` };
      case 'unreadable':
        return { ok: false, why: `${named} could not be read: ${read.message}` };
    }
  }
  // Git gives an empty ancestor for a file both sides added.
  if (which === 'the common ancestor' && read.bytes.length === 0)
    return { ok: true, value: undefined };
  let text: string;
  try {
    text = UTF8.decode(read.bytes);
  } catch {
    return { ok: false, why: `${named} is not valid UTF-8.` };
  }
  const parsed = parseFile(kind, text);
  if (!parsed.ok) {
    const shown = parsed.errors.slice(0, 3).map((error) => `${error.path || '/'} ${error.message}`);
    const more = parsed.errors.length > 3 ? `; and ${parsed.errors.length - 3} more` : '';
    return {
      ok: false,
      why: `${named} is not a valid ${FILE_EXTENSIONS[kind]} file: ${shown.join('; ')}${more}.`,
    };
  }
  return { ok: true, value: parsed.value };
}

/**
 * Merges the three inputs into ours and resolves with the exit code: 0 when the merged file holds no
 * conflicts, 1 when it does or when nothing was merged, which leaves ours as it was.
 */
export async function mergeInputs(inputs: DriverInputs, io: MergeDriverIo): Promise<number> {
  const shown = shownPath(inputs.path);
  const notMerged = (why: string) => {
    io.err(`Visual Anything did not merge ${shown}: ${why}`);
    io.err(
      `Ours is kept as it was. To take theirs instead: git checkout --theirs -- ${shellWordOf(shown)}`,
    );
    return 1;
  };
  const kind = fileKindOf(inputs.path);
  if (kind === undefined) {
    const extensions = FILE_KINDS.map((each) => FILE_EXTENSIONS[each]).join(', ');
    return notMerged(`${shown} is not a project file: its name ends in none of ${extensions}.`);
  }
  let cwd: string;
  try {
    cwd = await realpath(io.cwd);
  } catch (error) {
    return notMerged(`the folder git runs the driver in does not read: ${errorReason(error)}`);
  }
  const base = await readInput(kind, 'the common ancestor', inputs.ancestor, cwd);
  if (!base.ok) return notMerged(base.why);
  const ours = await readInput(kind, 'ours', inputs.ours, cwd);
  if (!ours.ok) return notMerged(ours.why);
  const theirs = await readInput(kind, 'theirs', inputs.theirs, cwd);
  if (!theirs.ok) return notMerged(theirs.why);

  let text: string;
  let conflicts: number;
  try {
    const merged = mergeFile(kind, base.value, ours.value!, theirs.value!, {
      ...(inputs.sides ? { sides: inputs.sides } : {}),
      nesting: BUILTIN_NESTING,
    });
    const checked = validateFile(kind, merged.file);
    if (!checked.ok) {
      return notMerged(
        `the merged file did not validate, which is a fault of Visual Anything's: ${checked.errors
          .slice(0, 3)
          .map((error) => `${error.path || '/'} ${error.message}`)
          .join('; ')}.`,
      );
    }
    conflicts = (merged.file as { conflicts?: unknown[] }).conflicts?.length ?? 0;
    text = formatFile(kind, merged.file);
  } catch (error) {
    return notMerged(
      `the merge failed, which is a fault of Visual Anything's: ${errorReason(error)}`,
    );
  }
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > capOf(kind)) {
    return notMerged(
      `the merged file would hold more than ${describeCap(capOf(kind))}, the most a ${FILE_EXTENSIONS[kind]} file may hold.`,
    );
  }
  const target = resolve(cwd, inputs.ours);
  try {
    await writeFileAtomic(target, bytes, {
      regularOnly: true,
      inside: await realpath(dirname(target)),
    });
  } catch (error) {
    return notMerged(`ours could not be written: ${errorReason(error)}`);
  }
  if (conflicts === 0) return 0;
  io.err(
    `Visual Anything merged ${shown} by id, and ${conflicts === 1 ? '1 conflict remains' : `${conflicts} conflicts remain`} in it, kept as data: open the project to resolve ${conflicts === 1 ? 'it' : 'them'} in the Changes tab, then add the file with git add.`,
  );
  return 1;
}

// ——— Installing ———

interface ParsedInstall {
  global: boolean;
  attributes: boolean;
}

function parseInstall(argv: readonly string[]): ParsedInstall | undefined {
  const [command, ...rest] = argv;
  const allowed = command === '--install' ? ['--global', '--no-attributes'] : ['--global'];
  if (rest.some((each) => !allowed.includes(each)) || new Set(rest).size !== rest.length) {
    return undefined;
  }
  return { global: rest.includes('--global'), attributes: !rest.includes('--no-attributes') };
}

/** How this program is started: the variables set for it, then the program and its arguments. */
export interface ProgramCommand {
  env: Record<string, string>;
  argv: string[];
}

/** The entry of the program's sources, which Node runs with the loaders it was started with. */
export const CLI_ENTRY = fileURLToPath(new URL('./cli.ts', import.meta.url));

/**
 * The TypeScript configuration of the program's own sources. The loader that runs them reads the one
 * of the current folder otherwise, which is the repository's: its paths could send an import of the
 * program into a file of the repository.
 */
export const OWN_TSCONFIG = fileURLToPath(new URL('../tsconfig.json', import.meta.url));

/** The variable that names the configuration the TypeScript loader reads. */
export const TSCONFIG_ENV = 'TSX_TSCONFIG_PATH';

/** The options of Node that load code before the entry, which the driver's command keeps. */
const LOADER_FLAGS = new Set(['--require', '-r', '--import', '--loader', '--experimental-loader']);

/** How this program was started, for naming it in the driver's command. */
export interface ThisProgram {
  executable: boolean;
  execPath: string;
  execArgv: readonly string[];
  entry: string;
  tsconfig: string;
  platform: NodeJS.Platform;
}

/**
 * This very program by its absolute path, as the driver's command names it (ADR 0072): the single
 * executable alone; or Node with the loaders it was started with and the absolute path of its entry,
 * as Claude's entry point starts the program, with the loader told to read the program's own
 * TypeScript configuration. A loader named other than by its absolute path is refused, since git
 * would look it up from the repository it merges.
 */
export function thisProgram(
  options: ThisProgram = {
    executable: isExecutable(),
    execPath: process.execPath,
    execArgv: process.execArgv,
    entry: CLI_ENTRY,
    tsconfig: OWN_TSCONFIG,
    platform: process.platform,
  },
): { ok: true; program: ProgramCommand } | { ok: false; why: string } {
  const path = (each: string) => (options.platform === 'win32' ? each.replaceAll('\\', '/') : each);
  if (options.executable) return { ok: true, program: { env: {}, argv: [path(options.execPath)] } };
  const loaders: string[] = [];
  for (let i = 0; i < options.execArgv.length; i++) {
    const each = options.execArgv[i]!;
    const equals = each.indexOf('=');
    const flag = equals > 0 ? each.slice(0, equals) : each;
    if (!LOADER_FLAGS.has(flag)) continue;
    const value = equals > 0 ? each.slice(equals + 1) : options.execArgv[++i];
    if (value === undefined) continue;
    if (!value.startsWith('file:') && !isAbsoluteOn(value, options.platform)) {
      return {
        ok: false,
        why: `Node was started with ${flag} ${value}, which is not an absolute path: git would look it up from the repository it merges. Start it with absolute paths, as pnpm exec tsx does, or install the driver from the single executable.`,
      };
    }
    loaders.push(flag, value.startsWith('file:') ? value : path(value));
  }
  return {
    ok: true,
    program: {
      env: { [TSCONFIG_ENV]: path(options.tsconfig) },
      argv: [path(options.execPath), ...loaders, path(options.entry)],
    },
  };
}

function isAbsoluteOn(path: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(path) : isAbsolute(path);
}

/** A word quoted for the POSIX shell git runs a merge driver through. */
export function shellQuote(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * The driver's command, as `merge.visual-anything.driver` holds it: this program, quoted for git's
 * shell, then `merge-driver` and git's placeholders. A word that holds a control character or a `%`,
 * which git would read as a placeholder, is refused.
 */
export function driverCommand(
  program: ProgramCommand,
): { ok: true; command: string } | { ok: false; why: string } {
  const words = [...Object.values(program.env), ...program.argv];
  // eslint-disable-next-line no-control-regex -- control characters are what it refuses
  const odd = words.find((each) => /[\u0000-\u001f\u007f%]/.test(each));
  if (odd !== undefined) {
    return {
      ok: false,
      why: `The path ${shownPath(odd)} holds a control character or a %, which git's command line cannot hold as it is: move Visual Anything to a folder whose path has neither.`,
    };
  }
  const env = Object.entries(program.env).map(([name, value]) => `${name}=${shellQuote(value)}`);
  return {
    ok: true,
    command: [
      ...env,
      ...program.argv.map(shellQuote),
      MERGE_DRIVER_COMMAND,
      DRIVER_PLACEHOLDERS,
    ].join(' '),
  };
}

/**
 * Why a call of git is not one that installing makes, or `undefined` when it is: `rev-parse
 * --show-toplevel`, which reads, and `git config` on the driver's two keys alone, in the
 * repository's configuration or the person's global one, to set or unset them.
 */
export function refusedInstallCall(args: readonly string[]): string | undefined {
  const [subcommand, scope, ...rest] = args;
  if (subcommand === 'rev-parse' && scope === '--show-toplevel' && rest.length === 0)
    return undefined;
  const keys: readonly string[] = Object.values(DRIVER_KEYS);
  if (subcommand === 'config' && (scope === '--local' || scope === '--global')) {
    if (rest.length === 2 && rest[0] === '--unset' && keys.includes(rest[1]!)) return undefined;
    if (rest.length === 2 && keys.includes(rest[0]!) && !rest[1]!.startsWith('-')) return undefined;
  }
  return `git ${args.map((each) => JSON.stringify(each)).join(' ')} is not a call that installing the merge driver makes.`;
}

/**
 * The environment of installing's calls: the git runner's (ADR 0071), with where the person's git
 * finds its configuration besides, so that `--global` writes where their git reads it.
 */
export function installEnvironment(
  inherited: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env = gitEnvironment(inherited, platform);
  for (const name of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) {
    const value = inherited[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

interface Called {
  code: number;
  stdout: string;
  stderr: string;
}

/** The time one of installing's calls may take. */
const INSTALL_CALL_MS = 30_000;

/** Runs one of installing's calls, by git's absolute path, with arguments and never a shell. */
function runInstallCall(
  git: string,
  args: readonly string[],
  context: { cwd: string; env: Record<string, string>; spawn: Spawn },
): Promise<Called> {
  const refused = refusedInstallCall(args);
  if (refused !== undefined) return Promise.reject(new Error(refused));
  return new Promise((resolvePromise, reject) => {
    const child = context.spawn(git, [...fixedOptions(false), ...args], {
      cwd: context.cwd,
      env: context.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `git ${args[0]} took longer than ${INSTALL_CALL_MS / 1000} s, so it was stopped.`,
        ),
      );
    }, INSTALL_CALL_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 64 * 1024) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

interface InstallContext {
  call: (args: readonly string[]) => Promise<Called>;
  /** The top of the repository the current folder is in, if it is in one. */
  top: string | undefined;
}

/** Finds git and the repository, or says why installing cannot go on. */
async function installContext(
  io: MergeDriverIo,
): Promise<{ ok: true; context: InstallContext } | { ok: false; why: string }> {
  const env = io.install?.env ?? process.env;
  const platform = io.install?.platform ?? process.platform;
  const cwd = await realpath(io.cwd);
  const found = await findGit({ projectFolder: cwd, startedIn: cwd, env, platform });
  if (!found.ok) {
    return {
      ok: false,
      why: 'Installing the merge driver needs git, and none was found: install git, or name it with VISUAL_ANYTHING_GIT.',
    };
  }
  const context = {
    cwd,
    env: installEnvironment(env, platform),
    spawn: io.install?.spawn ?? nodeSpawn,
  };
  const call = (args: readonly string[]) => runInstallCall(found.path, args, context);
  const top = await call(['rev-parse', '--show-toplevel']);
  const line = top.stdout.trim();
  return {
    ok: true,
    context: {
      call,
      top: top.code === 0 && line !== '' ? resolve(line) : undefined,
    },
  };
}

/** Where the driver is defined, in words. */
function whereDefined(global: boolean): string {
  return global ? 'your global git configuration' : "this repository's git configuration";
}

async function install(options: ParsedInstall, io: MergeDriverIo): Promise<number> {
  const self = io.install?.program
    ? { ok: true as const, program: io.install.program }
    : thisProgram();
  if (!self.ok) {
    io.err(self.why);
    return 1;
  }
  const command = driverCommand(self.program);
  if (!command.ok) {
    io.err(command.why);
    return 1;
  }
  let found;
  try {
    found = await installContext(io);
  } catch (error) {
    io.err(`The merge driver was not installed: ${errorReason(error)}`);
    return 1;
  }
  if (!found.ok) {
    io.err(found.why);
    return 1;
  }
  const { call, top } = found.context;
  if (!options.global && top === undefined) {
    io.err(
      'This folder is in no git repository, so the merge driver was not installed: run it inside one, or with --global to install it for every repository.',
    );
    return 1;
  }
  const scope = options.global ? '--global' : '--local';
  try {
    for (const [key, value] of [
      [DRIVER_KEYS.name, DRIVER_TITLE],
      [DRIVER_KEYS.driver, command.command],
    ] as const) {
      const done = await call(['config', scope, key, value]);
      if (done.code !== 0) throw new Error(done.stderr.trim() || `git config ${key} failed.`);
    }
  } catch (error) {
    io.err(`The merge driver was not installed: ${errorReason(error)}`);
    return 1;
  }
  io.out(
    `The merge driver is defined in ${whereDefined(options.global)}, as ${DRIVER_KEYS.driver}:`,
  );
  io.out(`  ${command.command}`);
  if (!options.attributes) return 0;
  if (top === undefined) {
    io.out(
      `No .gitattributes was changed, since this folder is in no git repository. Each repository names the driver in its own .gitattributes:\n${ATTRIBUTE_LINES.map((each) => `  ${each}`).join('\n')}`,
    );
    return 0;
  }
  const attributes = join(top, '.gitattributes');
  try {
    const added = await addAttributes(attributes);
    io.out(
      added === 0
        ? `${shownPath(attributes)} already names the driver for the seven kinds of project file.`
        : `Added ${added === 1 ? '1 line' : `${added} lines`} to ${shownPath(attributes)}, naming the driver for the project files: commit it, so that everyone who installs the driver merges them by id.`,
    );
  } catch (error) {
    io.err(`${shownPath(attributes)} was not changed: ${errorReason(error)}`);
    return 1;
  }
  return 0;
}

async function uninstall(global: boolean, io: MergeDriverIo): Promise<number> {
  let found;
  try {
    found = await installContext(io);
  } catch (error) {
    io.err(`The merge driver was not uninstalled: ${errorReason(error)}`);
    return 1;
  }
  if (!found.ok) {
    io.err(found.why);
    return 1;
  }
  if (!global && found.context.top === undefined) {
    io.err('This folder is in no git repository: run it inside one, or with --global.');
    return 1;
  }
  const scope = global ? '--global' : '--local';
  try {
    for (const key of [DRIVER_KEYS.driver, DRIVER_KEYS.name]) {
      const done = await found.context.call(['config', scope, '--unset', key]);
      // 5: the key was not set, which is what uninstalling wants.
      if (done.code !== 0 && done.code !== 5) {
        throw new Error(done.stderr.trim() || `git config --unset ${key} failed.`);
      }
    }
  } catch (error) {
    io.err(`The merge driver was not uninstalled: ${errorReason(error)}`);
    return 1;
  }
  io.out(
    `The merge driver is no longer defined in ${whereDefined(global)}. The lines of .gitattributes that name it stay, and do nothing without it.`,
  );
  return 0;
}

/** The most bytes of `.gitattributes` that installing reads. */
const ATTRIBUTES_CAP = 1024 * 1024;

/**
 * The text of `.gitattributes` with the lines of {@link ATTRIBUTE_LINES} it lacks added at its end,
 * after a comment, in the line endings it uses; and how many were added.
 */
export function withAttributes(text: string): { text: string; added: number } {
  const lines = text.split(/\r?\n/);
  const names = (line: string, extension: string) => {
    const [pattern, ...attributes] = line.trim().split(/\s+/);
    return pattern === `*${extension}` && attributes.includes(`merge=${DRIVER_NAME}`);
  };
  const missing = FILE_KINDS.filter(
    (kind) => !lines.some((line) => names(line, FILE_EXTENSIONS[kind])),
  ).map((kind) => `*${FILE_EXTENSIONS[kind]} merge=${DRIVER_NAME}`);
  if (missing.length === 0) return { text, added: 0 };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const before = text === '' ? '' : text.endsWith('\n') ? `${text}${eol}` : `${text}${eol}${eol}`;
  const block = [
    '# Project files merge by id, once each person runs `visual-anything merge-driver --install` (ADR 0072).',
    ...missing,
  ];
  return { text: `${before}${block.join(eol)}${eol}`, added: missing.length };
}

/** Adds the lines `.gitattributes` lacks, writing it atomically as a regular file; how many. */
async function addAttributes(path: string): Promise<number> {
  const read = await readRegularFile(path, ATTRIBUTES_CAP);
  if (!read.ok && read.reason !== 'missing') throw new Error(read.message);
  const text = read.ok ? UTF8.decode(read.bytes) : '';
  const next = withAttributes(text);
  if (next.added === 0) return 0;
  await writeFileAtomic(path, Buffer.from(next.text, 'utf8'), {
    regularOnly: true,
    inside: await realpath(dirname(path)),
  });
  return next.added;
}
