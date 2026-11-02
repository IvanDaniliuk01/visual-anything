/**
 * What package code adds to the app (ADR 0089): the declarations a package file holds, the inputs its
 * four hooks are called with, and the checks of what they answer. Every answer comes from code nobody
 * trusts: it is plain data within its cap, or it is dropped whole, with the reason, as the other
 * hooks' answers are (`answers.ts`). Commands an action answers are never applied here: they become
 * changes the person reviews, and are checked again as every command is when they apply.
 */
import type { Id, PackageExtensions } from '@visual-anything/schema';
import type { BatchCommand, Command } from '../commands';
import { executeCommand, type CommandContext } from '../commands';
import { isId } from '../ids';
import type { Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { compareProjects, type Comparison } from '../versions/compare';
import { plainSizeOf, type CheckedAnswer } from './answers';
import { CODE_LIMITS } from './limits';

// ——— Declarations ———

const EXTENSION_ID = /^[a-z][a-z0-9-]{0,47}$/;
const FILE_EXTENSION = /^\.[a-z0-9]{1,16}$/;
const PLACES = ['selection', 'packages-menu'] as const;
const KINDS = ['actions', 'importers', 'exporters', 'panels'] as const;
const MOST: Readonly<Record<(typeof KINDS)[number], number>> = {
  actions: 32,
  importers: 8,
  exporters: 8,
  panels: 8,
};

/**
 * A package's declarations, checked, or why they are refused, in words that follow "The package
 * declares ". Only the keys each kind has are kept, so nothing else rides along.
 */
export function checkedExtensions(
  value: unknown,
): { ok: true; extensions: PackageExtensions | undefined } | { ok: false; reason: string } {
  if (!isRecord(value)) return refuse('what its code adds as an object of lists');
  for (const key of Object.keys(value)) {
    if (!(KINDS as readonly string[]).includes(key)) {
      return refuse(`"${key}", which is not actions, importers, exporters or panels`);
    }
  }
  const extensions: PackageExtensions = {};
  for (const kind of KINDS) {
    const list = value[kind];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return refuse('a kind of what its code adds that is not a list');
    if (list.length > MOST[kind]) {
      return refuse(
        'more of one kind than it may: 32 actions, and 8 importers, exporters or panels',
      );
    }
    const ids = new Set<string>();
    const kept: Record<string, unknown>[] = [];
    for (const each of list as unknown[]) {
      if (!isRecord(each)) return refuse('something its code adds that is not an object');
      const { id, label } = each;
      if (typeof id !== 'string' || !EXTENSION_ID.test(id)) {
        return refuse('something its code adds whose id is not lower case letters, digits and -');
      }
      if (ids.has(id)) return refuse(`two of one kind with the id "${id}"`);
      ids.add(id);
      if (typeof label !== 'string' || label.trim() === '' || [...label].length > 60) {
        return refuse(`"${id}" with a label that is not 1 to 60 characters`);
      }
      const checked = checkedDeclaration(kind, id, each);
      if (typeof checked === 'string') return refuse(checked);
      kept.push({ id, label, ...checked });
    }
    if (kept.length > 0) (extensions as Record<string, unknown>)[kind] = kept;
  }
  return { ok: true, extensions: Object.keys(extensions).length === 0 ? undefined : extensions };
}

/** The parts a declaration of a kind has beyond its id and label, or why one is refused. */
function checkedDeclaration(
  kind: (typeof KINDS)[number],
  id: string,
  each: Record<string, unknown>,
): Record<string, unknown> | string {
  const allowed: Record<(typeof KINDS)[number], readonly string[]> = {
    actions: ['id', 'label', 'description', 'where', 'components'],
    importers: ['id', 'label', 'extensions'],
    exporters: ['id', 'label', 'extension'],
    panels: ['id', 'label', 'components'],
  };
  const extra = Object.keys(each).find((key) => !allowed[kind].includes(key));
  if (extra !== undefined) return `"${id}" with "${extra}", which it does not have`;
  const parts: Record<string, unknown> = {};
  if (kind === 'actions') {
    const { description, where } = each;
    if (description !== undefined) {
      if (typeof description !== 'string' || [...description].length > 300) {
        return `"${id}" with a description over 300 characters`;
      }
      parts.description = description;
    }
    if (
      !Array.isArray(where) ||
      where.length === 0 ||
      !where.every((place) => (PLACES as readonly unknown[]).includes(place)) ||
      new Set(where).size !== where.length
    ) {
      return `"${id}" offered somewhere other than "selection" and "packages-menu"`;
    }
    parts.where = [...(where as string[])];
  }
  if (kind === 'actions' || kind === 'panels') {
    const { components } = each;
    if (components !== undefined) {
      if (
        !Array.isArray(components) ||
        components.length === 0 ||
        components.length > 32 ||
        !components.every(isId) ||
        new Set(components).size !== components.length
      ) {
        return `"${id}" for components that are not 1 to 32 different ids`;
      }
      parts.components = [...components];
    }
  }
  if (kind === 'importers') {
    const { extensions } = each;
    if (
      !Array.isArray(extensions) ||
      extensions.length === 0 ||
      extensions.length > 8 ||
      !extensions.every((ext) => typeof ext === 'string' && FILE_EXTENSION.test(ext)) ||
      new Set(extensions).size !== extensions.length
    ) {
      return `"${id}" reading extensions that are not 1 to 8 different ones such as ".sql"`;
    }
    parts.extensions = [...(extensions as string[])];
  }
  if (kind === 'exporters') {
    const { extension } = each;
    if (typeof extension !== 'string' || !FILE_EXTENSION.test(extension)) {
      return `"${id}" writing an extension that is not one such as ".sql"`;
    }
    parts.extension = extension;
  }
  return parts;
}

function refuse(what: string): { ok: false; reason: string } {
  return { ok: false, reason: `The package declares ${what}.` };
}

// ——— Inputs ———

/** What `act` is called with: the action's id, the selection, and the view it was made in. */
export interface ActionInput {
  action: string;
  selection: Id[];
  view?: Id;
}

/** What `importFile` is called with: the importer's id, and the file's name and text. */
export interface ImportFileInput {
  importer: string;
  name: string;
  text: string;
}

/** What `exportFile` is called with: the exporter's id and the view to write, if one. */
export interface ExportFileInput {
  exporter: string;
  view?: Id;
}

/** What `panel` is called with: the panel's id and the selected element. */
export interface PanelInput {
  panel: string;
  element: Id;
}

// ——— Answers ———

/** Changes an action or an importer answers: commands, and how the history would name them. */
export interface PackageCodeChanges {
  label: string;
  commands: Command[];
}

/** Commands that never come from package code: comments are people's and Claude's, and code is approved. */
const NEVER_FROM_CODE: ReadonlySet<string> = new Set([
  'create-thread',
  'add-comment',
  'edit-comment',
  'resolve-thread',
  'delete-thread',
  'resolve-conflicts',
  'set-package-code',
]);

/**
 * What `act` or `importFile` answered, checked: `{ label?, commands }`, at most 500 commands, none of
 * the kinds code never sends, within 1 MiB as JSON. `label` defaults to the action's.
 */
export function checkChangesAnswer(
  answer: unknown,
  fallbackLabel: string,
): CheckedAnswer<PackageCodeChanges> {
  const size = plainSizeOf(answer, CODE_LIMITS.depth + 4, CODE_LIMITS.changesText);
  if (!size.ok) return { ok: false, reason: size.reason };
  if (!isRecord(answer)) return { ok: false, reason: 'it is not an object of commands' };
  const extra = Object.keys(answer).find((key) => key !== 'label' && key !== 'commands');
  if (extra !== undefined) return { ok: false, reason: `it has "${extra}"` };
  const { label, commands } = answer;
  if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
    return { ok: false, reason: 'its label is not a text' };
  }
  if (!Array.isArray(commands)) return { ok: false, reason: 'its commands are not a list' };
  if (commands.length > CODE_LIMITS.changesCommands) {
    return { ok: false, reason: `it holds more than ${CODE_LIMITS.changesCommands} commands` };
  }
  for (const command of commands as unknown[]) {
    const kind = isRecord(command) ? command.type : undefined;
    if (typeof kind !== 'string') return { ok: false, reason: 'a command has no type' };
    const never = neverFromCode(command as Command);
    if (never !== undefined) return { ok: false, reason: `package code never sends "${never}"` };
  }
  const named = typeof label === 'string' ? label : fallbackLabel;
  return {
    ok: true,
    value: {
      label: [...named].length > 100 ? `${[...named].slice(0, 99).join('')}…` : named,
      commands: commands as Command[],
    },
  };
}

/** The kind of the first command code never sends, in batches too; undefined when there is none. */
function neverFromCode(command: Command): string | undefined {
  if (NEVER_FROM_CODE.has(command.type)) return command.type;
  if (command.type === 'batch' && Array.isArray(command.commands)) {
    for (const each of command.commands) {
      const found = isRecord(each) ? neverFromCode(each) : 'a command without a type';
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** What `exportFile` answered, checked: a text of at most 4 MiB characters. */
export function checkExportAnswer(answer: unknown): CheckedAnswer<string> {
  if (typeof answer !== 'string') return { ok: false, reason: 'it is not a text' };
  if (answer.length > CODE_LIMITS.exportText) {
    return { ok: false, reason: `it is over ${CODE_LIMITS.exportText} characters` };
  }
  return { ok: true, value: answer };
}

/** One part of a package's panel, drawn by the app with its own controls (ADR 0089). */
export type PanelBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'value'; label: string; value: string | number | boolean }
  | { kind: 'table'; columns: string[]; rows: (string | number | boolean | null)[][] }
  | { kind: 'chart'; chart: 'bar' | 'line'; labels: string[]; series: PanelSeries[] }
  | { kind: 'button'; label: string; action: string };

/** A chart's series: a name and a number for each label. */
export interface PanelSeries {
  name: string;
  values: number[];
}

/** What `panel` answered, checked: a list of blocks, built afresh from the parts each kind has. */
export function checkPanelAnswer(
  answer: unknown,
  actions: readonly string[],
): CheckedAnswer<PanelBlock[]> {
  const size = plainSizeOf(answer, CODE_LIMITS.depth, CODE_LIMITS.answerText);
  if (!size.ok) return { ok: false, reason: size.reason };
  if (!Array.isArray(answer)) return { ok: false, reason: 'it is not a list of blocks' };
  if (answer.length > CODE_LIMITS.panelBlocks) {
    return { ok: false, reason: `it holds more than ${CODE_LIMITS.panelBlocks} blocks` };
  }
  const blocks: PanelBlock[] = [];
  for (const [at, block] of (answer as unknown[]).entries()) {
    const checked = panelBlock(block, actions);
    if (typeof checked === 'string') return { ok: false, reason: `block ${at + 1} ${checked}` };
    blocks.push(checked);
  }
  return { ok: true, value: blocks };
}

const text = (value: unknown, most: number = CODE_LIMITS.panelText): value is string =>
  typeof value === 'string' && value.length <= most;
const cell = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  text(value, 200);

function panelBlock(block: unknown, actions: readonly string[]): PanelBlock | string {
  if (!isRecord(block)) return 'is not an object';
  switch (block.kind) {
    case 'heading':
    case 'text':
      return text(block.text, block.kind === 'heading' ? 120 : CODE_LIMITS.panelText)
        ? { kind: block.kind, text: block.text }
        : `has a text that is not one of at most ${block.kind === 'heading' ? 120 : CODE_LIMITS.panelText} characters`;
    case 'value':
      return text(block.label, 120) && cell(block.value) && block.value !== null
        ? { kind: 'value', label: block.label, value: block.value }
        : 'is not a label and a text, number or true or false';
    case 'table': {
      const { columns, rows } = block;
      if (
        !Array.isArray(columns) ||
        columns.length === 0 ||
        columns.length > CODE_LIMITS.panelColumns ||
        !columns.every((column) => text(column, 120))
      ) {
        return `has columns that are not 1 to ${CODE_LIMITS.panelColumns} texts`;
      }
      if (
        !Array.isArray(rows) ||
        rows.length > CODE_LIMITS.panelRows ||
        !rows.every((row) => Array.isArray(row) && row.length === columns.length && row.every(cell))
      ) {
        return `has rows that are not at most ${CODE_LIMITS.panelRows}, each a cell for each column`;
      }
      return {
        kind: 'table',
        columns: [...columns],
        rows: (rows as (string | number | boolean | null)[][]).map((row) => [...row]),
      };
    }
    case 'chart': {
      const { chart, labels, series } = block;
      if (chart !== 'bar' && chart !== 'line') return 'is a chart that is not "bar" or "line"';
      if (
        !Array.isArray(labels) ||
        labels.length === 0 ||
        labels.length > CODE_LIMITS.panelRows ||
        !labels.every((label) => text(label, 120))
      ) {
        return `has labels that are not 1 to ${CODE_LIMITS.panelRows} texts`;
      }
      if (
        !Array.isArray(series) ||
        series.length === 0 ||
        series.length > CODE_LIMITS.panelSeries ||
        !series.every(
          (each) =>
            isRecord(each) &&
            text(each.name, 120) &&
            Array.isArray(each.values) &&
            each.values.length === labels.length &&
            each.values.every((value) => typeof value === 'number' && Number.isFinite(value)),
        )
      ) {
        return `has series that are not 1 to ${CODE_LIMITS.panelSeries}, each a number for each label`;
      }
      return {
        kind: 'chart',
        chart,
        labels: [...labels],
        series: (series as PanelSeries[]).map((each) => ({
          name: each.name,
          values: [...each.values],
        })),
      };
    }
    case 'button':
      if (!text(block.label, 60)) return 'is a button whose label is not 1 to 60 characters';
      if (typeof block.action !== 'string' || !actions.includes(block.action)) {
        return 'is a button that runs no action the package declares';
      }
      return { kind: 'button', label: block.label, action: block.action };
    default:
      return 'is not a heading, text, value, table, chart or button';
  }
}

// ——— Reviewing changes ———

/** Changes a package answered, ready for the person's review, or why they cannot apply. */
export type ChangesPreview =
  | {
      ok: true;
      /** The one action accepting them makes, the person's. */
      command: BatchCommand;
      /** What would change, as versions compare two projects (ADR 0070). */
      comparison: Comparison;
      /**
       * The project with the changes, which the comparison is of: what the canvas draws as the newer
       * version while the person reviews them (M14.3).
       */
      project: ProjectSnapshot;
      warnings: Problem[];
    }
  | { ok: false; problems: Problem[] };

/**
 * The project with a package's changes, never applied: the comparison the person reviews, and the
 * one command that applies them all as their action. Commands that break a rule are refused whole,
 * as a batch is.
 */
export function previewPackageChanges(
  project: ProjectSnapshot,
  changes: PackageCodeChanges,
  context: CommandContext = {},
): ChangesPreview {
  const command: BatchCommand = { type: 'batch', label: changes.label, commands: changes.commands };
  const outcome = executeCommand(project, command, { ...context, author: 'user' });
  if (!outcome.ok) return { ok: false, problems: outcome.problems };
  return {
    ok: true,
    command,
    comparison: compareProjects(project, outcome.state),
    project: outcome.state,
    warnings: outcome.warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
