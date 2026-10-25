/**
 * Claude's import tools (ADR-0042): `preview_import` reads a file's content and says what importing it
 * would do, with the kinds it holds and the mapping it would use, changing nothing; `import_file`
 * imports it as one undoable action of Claude's. Claude passes the content itself: the local program
 * reads nothing else and fetches nothing.
 */
import { MAX_IMPORT_TEXT, type ImportMapping } from '@visual-anything/core';
import { z } from 'zod';
import { describePreview, previewImport, type ImportPreview, type ImportRequest } from '../import';
import { CLAUDE_MAX_PAYLOAD, encodeClaudeMessage } from './messages';
import { READ, WRITE, act, fail, id, ok, tool, withoutUndefined } from './kit';
import type { Tool } from './tools';

const input = {
  content: z
    .string()
    .max(MAX_IMPORT_TEXT)
    .describe('The file’s content as text: a Mermaid diagram, a spreadsheet (CSV or TSV) or JSON.'),
  name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'The file’s name, such as "checkout.mmd": its ending picks the reader, and the action is named after it. Left out, "pasted text".',
    ),
  format: z
    .enum(['mermaid', 'table', 'json'])
    .optional()
    .describe('The reader to use, when the name and the content do not say.'),
  map: z
    .record(z.string(), id())
    .optional()
    .describe(
      'Components and relation types for the file’s kinds, by kind as preview_import lists them; other kinds take the suggested ones.',
    ),
  nesting: id().optional().describe('The relation type that nests what sits inside what.'),
  key: z
    .string()
    .min(1)
    .optional()
    .describe(
      'For a spreadsheet or JSON imported again: the column to match rows to elements by, the id by default.',
    ),
  views: z
    .boolean()
    .optional()
    .describe('Whether to create the view a diagram brings; true by default.'),
};

type Args = z.infer<z.ZodObject<typeof input>>;

function requestOf(args: Args): ImportRequest {
  return withoutUndefined({
    name: args.name ?? 'pasted text',
    text: args.content,
    format: args.format,
    map: args.map,
    nesting: args.nesting,
    key: args.key,
    views: args.views,
  });
}

/** What a preview says to Claude: the kinds with what each maps to, and what matched nothing. */
function summaryOf(preview: Extract<ImportPreview, { ok: true }>, mapping: ImportMapping) {
  const { read, prepared } = preview;
  return {
    format: read.format,
    creates: prepared.creates,
    updates: prepared.updates,
    kinds: {
      elements: read.kinds.elements.map((kind) => ({
        ...kind,
        mapsTo: mapping.elements[kind.kind],
      })),
      relations: read.kinds.relations.map((kind) => ({
        ...kind,
        mapsTo: mapping.relations[kind.kind],
      })),
    },
    ...(mapping.nesting === undefined ? {} : { nesting: mapping.nesting }),
    ...(prepared.packages.length > 0 ? { startsUsing: prepared.packages } : {}),
    matchedNothing: prepared.plan.unmatched,
  };
}

const previewImportTool = tool({
  name: 'preview_import',
  title: 'Preview an import',
  description: `Reads a file the person gave you, a Mermaid diagram (flowchart, C4, ER or class), a spreadsheet (CSV or TSV) or JSON (a project's model file, or { "elements": [...], "relations": [...] }), and says what importing it would do: how many elements, relations and views it creates, each kind of thing it holds with the component or relation type it would map to, the built-in packages it would start using, and what matched nothing. It changes nothing.

Show the person the mapping, and change what they want with map and nesting, then call import_file with the same arguments. Nothing in the file runs: links and callbacks are reported, never followed.

Example: { "name": "checkout.mmd", "content": "flowchart LR\\n  shop[Shop] --> db[(Orders)]" }`,
  input,
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const preview = previewImport(state, requestOf(args));
    if (!preview.ok) return fail(`It cannot be imported: ${preview.problems.join(' ')}`);
    return ok({ ...summaryOf(preview, preview.mapping), said: describePreview(preview) });
  },
});

const importFileTool = tool({
  name: 'import_file',
  title: 'Import a file',
  description: `Imports a Mermaid diagram, a spreadsheet (CSV or TSV) or JSON into the project as one undoable action, labelled Import "<name>": its elements, relations, containers and, for a diagram, a view that shows them. It takes the same arguments as preview_import, which you call first to show the person the mapping. A spreadsheet or JSON imported again matches its rows to the elements already there by the key column and updates their values, creating only what is new.

It answers what it created and what matched nothing, which you tell the person.

Example: { "name": "services.csv", "content": "name,component\\nBilling,Service", "map": { "Service": "systems.service" } }`,
  input,
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const preview = previewImport(state, requestOf(args));
    if (!preview.ok) return fail(`Not imported: ${preview.problems.join(' ')}`);
    const { command } = preview.prepared;
    const size = Buffer.byteLength(
      encodeClaudeMessage({ type: 'command', requestId: 'x'.repeat(100), command }),
    );
    if (size > CLAUDE_MAX_PAYLOAD) {
      return fail(
        `Not imported: the import is too large to send (${(size / 1024 / 1024).toFixed(1)} MiB; at most ${CLAUDE_MAX_PAYLOAD / 1024 / 1024} MiB). Ask the person to import it from the app, or with visual-anything import.`,
      );
    }
    return act(program, command, () => {
      const summary = summaryOf(preview, preview.mapping);
      return {
        created: summary.creates,
        updated: summary.updates,
        ...(summary.startsUsing === undefined ? {} : { startsUsing: summary.startsUsing }),
        matchedNothing: summary.matchedNothing,
      };
    });
  },
});

/** The import tools, in the order Claude reads them. */
export const IMPORT_TOOLS: readonly Tool[] = [previewImportTool, importFileTool];
