/**
 * HTML imported as an explorable (ADR 0107), when the person picks "As an explorable" rather than
 * "As a drawing" (ADR 0068) in Import…, for a file or pasted text: the one action that defines it,
 * with its text, in one of the project's own packages, through the normal command path, as the person
 * defines it. Nothing runs here, and nothing approves it: like any explorable from outside, it asks
 * the person before it runs.
 *
 * - its name is the page's `<title>`, else the file's name without its ending;
 * - it goes in the package asked for, else the first of the project's own packages, else a new
 *   package named after the project, made in the same action;
 * - its text is at most 512 KiB of UTF-8;
 * - all of it is one batch, `Import "roots.html" as an explorable`, which one undo takes back.
 */
import { builtinPackage } from '../builtin';
import { executeCommand } from '../commands';
import type { BatchCommand, Command } from '../commands/types';
import { utf8Length } from '../explorables/frame';
import { MAX_EXPLORABLE_BYTES } from '../explorables/types';
import { randomIds, type IdGenerator } from '../ids';
import type { ProjectSnapshot } from '../snapshot';
import type { Id } from '@visual-anything/schema';
import { DRAWING_EXTENSIONS, createOwnPackage, ownPackagesOf } from './drawing';

/** The longest name an explorable has (the schema's cap). */
const MAX_NAME = 200;

/** How the history names the action: `Import "roots.html" as an explorable`. */
export function explorableImportLabel(name: string): string {
  return `Import "${name}" as an explorable`;
}

/**
 * The name an imported explorable takes: the page's first `<title>`, its entities read and its
 * spaces collapsed, else the file's name without its ending, else "Explorable"; at most 200
 * characters.
 */
export function explorableImportName(fileName: string, html: string): string {
  const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(html.slice(0, 64 * 1024))?.[1];
  const fromTitle = title === undefined ? '' : collapsed(decodeEntities(title));
  if (fromTitle !== '') return fromTitle.slice(0, MAX_NAME);
  const lower = fileName.toLowerCase();
  const ending = DRAWING_EXTENSIONS.find((each) => lower.endsWith(each));
  const base = collapsed(ending === undefined ? fileName : fileName.slice(0, -ending.length));
  return base === '' ? 'Explorable' : base.slice(0, MAX_NAME);
}

/** HTML to import as an explorable. */
export interface ExplorableImport {
  /** The file's name, or what the person named pasted text: it names the action. */
  name: string;
  /** The page. */
  text: string;
  /** The explorable's name; the page's title or the file's name when left out. */
  explorableName?: string;
  /** One of the project's own packages; the first of them when left out. */
  package?: Id;
}

/** The action that defines an imported explorable, or why it cannot be done. */
export type PreparedExplorable =
  | {
      ok: true;
      command: BatchCommand;
      /** The explorable it defines. */
      explorable: Id;
      /** The package it is defined in, made by the action when the project had none of its own. */
      package: Id;
      /** Its name. */
      name: string;
    }
  | { ok: false; problems: string[] };

/** Prepares the one action that defines HTML as an explorable, checked as it would run. */
export function prepareExplorableImport(
  state: ProjectSnapshot,
  request: ExplorableImport,
  generate: IdGenerator = randomIds(),
): PreparedExplorable {
  const bytes = utf8Length(request.text);
  if (bytes > MAX_EXPLORABLE_BYTES) {
    return refused(
      `An explorable takes at most 512 KiB, and "${request.name}" takes ${Math.ceil(bytes / 1024)} KiB.`,
    );
  }
  const name =
    request.explorableName === undefined || request.explorableName.trim() === ''
      ? explorableImportName(request.name, request.text)
      : collapsed(request.explorableName).slice(0, MAX_NAME);
  const commands: Command[] = [];
  let current = state;
  let packageId = request.package;
  if (packageId !== undefined) {
    if (builtinPackage(packageId) || !ownPackagesOf(state).includes(packageId)) {
      return refused(`The package "${packageId}" is not one of the project's own.`);
    }
  } else {
    packageId = ownPackagesOf(state)[0];
    if (packageId === undefined) {
      const made = createOwnPackage(state, generate);
      if (!made.ok) return made;
      commands.push(made.command);
      current = made.state;
      packageId = made.command.package.id;
    }
  }
  // Run once without an id, to learn the one the core makes, then send it with that id.
  const define: Extract<Command, { type: 'define-explorable' }> = {
    type: 'define-explorable',
    package: packageId,
    explorable: { name },
    text: request.text,
  };
  const defined = executeCommand(current, define, { newId: generate });
  if (!defined.ok) return { ok: false, problems: defined.problems.map((each) => each.message) };
  const explorable = defined.created[0];
  if (explorable === undefined) return refused(`The explorable "${name}" could not be defined.`);
  commands.push({ ...define, explorable: { id: explorable, name } });
  const command: BatchCommand = {
    type: 'batch',
    label: explorableImportLabel(request.name),
    commands,
  };
  // The whole action, checked as it will run.
  const checked = executeCommand(state, command, { newId: generate });
  if (!checked.ok) return { ok: false, problems: checked.problems.map((each) => each.message) };
  return { ok: true, command, explorable, package: packageId, name };
}

function refused(message: string): { ok: false; problems: string[] } {
  return { ok: false, problems: [message] };
}

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** A title's text with its character references read: named ones of the few kinds titles use, and numbers. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}
