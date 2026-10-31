/**
 * Imports outside the app (ADR-0042): what `visual-anything import` and Claude's `import_file` share.
 * A file's content is read by the core's readers, mapped from the built-in suggestions with the kinds
 * the caller maps itself, and prepared as the one batch the app's dialog would send. Nothing here
 * reads anything but the content it is given, and nothing is fetched.
 */
import {
  mappingChoices,
  prepareImport,
  readImport,
  recordOf,
  suggestMapping,
  type ImportMapping,
  type ImportPlan,
  type ImportReader,
  type PreparedImport,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** An import asked for outside the app. */
export interface ImportRequest {
  /** The file's name, or what pasted text is called; the action is named after it. */
  name: string;
  text: string;
  bytes?: Uint8Array;
  /** The reader to use, by its format, such as `mermaid`; by default, the one that fits. */
  format?: string;
  /** For a spreadsheet or JSON: the column or key to match rows to the project's elements by. */
  key?: string;
  /** Components and relation types chosen for kinds, by kind, over the built-in suggestions. */
  map?: Readonly<Record<string, Id>>;
  /** The relation type that nests, over the suggested one. */
  nesting?: Id;
  /** Whether to create the views the file brings; true by default. */
  views?: boolean;
  /** For HTML imported as a drawing (ADR 0068): the width it is laid out at, 800 by default. */
  width?: number;
  /** For a drawing: the component of the new element that shows it, Box by default. */
  component?: Id;
  /** For a drawing: the element that shows it, instead of a new one. */
  element?: Id;
  /** For a drawing: the view a new element is made in. */
  view?: Id;
  /** For a solid (ADR 0075): the hash of the file the program prepared of it. */
  solid?: string;
}

/** What an import would do, or why it cannot be done. */
export type ImportPreview =
  | {
      ok: true;
      reader: ImportReader;
      /** The plan as read, before it was prepared. */
      read: ImportPlan;
      mapping: ImportMapping;
      prepared: PreparedImport;
    }
  | { ok: false; problems: string[]; read?: ImportPlan; mapping?: ImportMapping };

/** Reads a file and prepares its import into a project, with the caller's own mapping over the suggestions. */
export function previewImport(state: ProjectSnapshot, request: ImportRequest): ImportPreview {
  const read = readImport(
    { name: request.name, text: request.text, ...(request.bytes ? { bytes: request.bytes } : {}) },
    {
      project: state,
      ...(request.format === undefined ? {} : { format: request.format }),
      ...(request.key === undefined ? {} : { key: request.key }),
    },
  );
  if (!read.ok || read.reader === undefined) {
    return { ok: false, problems: read.ok ? ['No reader read the file.'] : read.problems };
  }
  const plan = request.views === false ? { ...read.plan, views: [] } : read.plan;
  const suggested = suggestMapping(state, plan);
  const mapped = withChoices(state, plan, suggested, request);
  if (!mapped.ok) return { ok: false, problems: mapped.problems, read: plan, mapping: suggested };
  const prepared = prepareImport(state, plan, mapped.mapping);
  if (!prepared.ok) {
    return { ok: false, problems: prepared.problems, read: plan, mapping: mapped.mapping };
  }
  return { ok: true, reader: read.reader, read: plan, mapping: mapped.mapping, prepared };
}

/** The suggested mapping with the caller's choices over it, each checked against the plan and the project. */
function withChoices(
  state: ProjectSnapshot,
  plan: ImportPlan,
  suggested: ImportMapping,
  request: ImportRequest,
): { ok: true; mapping: ImportMapping } | { ok: false; problems: string[] } {
  const choices = mappingChoices(state);
  const components = new Set(choices.components.map((each) => each.id));
  const relationTypes = new Set(choices.relationTypes.map((each) => each.id));
  const nesting = new Set(
    choices.relationTypes.filter((each) => each.nests).map((each) => each.id),
  );
  const elementKinds = new Set(plan.kinds.elements.map((kind) => kind.kind));
  const relationKinds = new Set(plan.kinds.relations.map((kind) => kind.kind));
  const elements = new Map(Object.entries(suggested.elements));
  const relations = new Map(Object.entries(suggested.relations));
  const problems: string[] = [];
  for (const [kind, id] of Object.entries(request.map ?? {})) {
    const known = elementKinds.has(kind) || relationKinds.has(kind);
    if (!known) {
      const kinds = [...elementKinds, ...relationKinds].map((each) => JSON.stringify(each));
      problems.push(
        `The file has no kind ${JSON.stringify(kind)}; its kinds are ${kinds.length === 0 ? 'none' : kinds.join(', ')}.`,
      );
      continue;
    }
    if (elementKinds.has(kind) && components.has(id)) elements.set(kind, id);
    else if (relationKinds.has(kind) && relationTypes.has(id)) relations.set(kind, id);
    else {
      problems.push(
        `"${id}" is no ${elementKinds.has(kind) ? 'component' : 'relation type'} the project or a built-in package defines, so it cannot be chosen for ${JSON.stringify(kind)}.`,
      );
    }
  }
  if (request.nesting !== undefined && !nesting.has(request.nesting)) {
    problems.push(`"${request.nesting}" is no relation type that nests.`);
  }
  if (problems.length > 0) return { ok: false, problems };
  const chosenNesting = request.nesting ?? suggested.nesting;
  return {
    ok: true,
    mapping: {
      elements: recordOf(elements),
      relations: recordOf(relations),
      ...(chosenNesting === undefined ? {} : { nesting: chosenNesting }),
    },
  };
}

/** What an import updates, in words that follow what it creates; nothing when it updates nothing. */
function updatesOf(updates: { elements: number; relations: number }): string {
  const parts = [
    ...(updates.elements > 0 ? [counted(updates.elements, 'element')] : []),
    ...(updates.relations > 0 ? [counted(updates.relations, 'relation')] : []),
  ];
  return parts.length === 0 ? '' : `, and updates ${parts.join(' and ')}`;
}

/** A preview in words, line by line: what the file holds, how its kinds map, and what matched nothing. */
export function describePreview(preview: Extract<ImportPreview, { ok: true }>): string[] {
  const { read, mapping, prepared, reader } = preview;
  const lines: string[] = [];
  const { creates } = prepared;
  lines.push(
    `Read "${read.source}" as ${read.format} (${reader.name}): it creates ${counted(creates.elements, 'element')}, ${counted(creates.relations, 'relation')} and ${counted(creates.views, 'view')}${updatesOf(prepared.updates)}.`,
  );
  if (read.kinds.elements.length + read.kinds.relations.length > 0) lines.push('Kinds:');
  for (const kind of read.kinds.elements) {
    lines.push(
      `  ${kindText(kind.kind, kind.label)} ×${kind.count} → ${mapping.elements[kind.kind] ?? '?'}`,
    );
  }
  for (const kind of read.kinds.relations) {
    lines.push(
      `  ${kindText(kind.kind, kind.label)} ×${kind.count} → ${mapping.relations[kind.kind] ?? '?'}`,
    );
  }
  if (mapping.nesting !== undefined && read.containment.length > 0) {
    lines.push(`What sits inside what nests through ${mapping.nesting}.`);
  }
  if (prepared.packages.length > 0) {
    lines.push(
      `It starts using the built-in ${prepared.packages.length === 1 ? 'package' : 'packages'} ${prepared.packages.join(', ')}.`,
    );
  }
  if (prepared.notes.length > 0) {
    lines.push('What the import leaves out:');
    for (const note of prepared.notes) lines.push(`  ${note}`);
  }
  if (prepared.plan.unmatched.length > 0) {
    lines.push('What matched nothing:');
    for (const { text, why } of prepared.plan.unmatched)
      lines.push(`  ${JSON.stringify(text)}: ${why}`);
  }
  return lines;
}

function kindText(kind: string, label: string): string {
  return label === kind || label === ''
    ? JSON.stringify(kind)
    : `${JSON.stringify(kind)} (${label})`;
}

function counted(amount: number, one: string): string {
  return `${amount.toLocaleString('en')} ${amount === 1 ? one : `${one}s`}`;
}
